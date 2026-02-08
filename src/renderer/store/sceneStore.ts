import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { SceneObject, ObjectType, Vector3, SceneState, HighwaySign, WallSide, CeilingLight, SceneSettings, WallSettings, WallImage, WallSection, WallTextureType, AnyCanvasItem, NavigationMode, DrawingStroke, DateMarker, LightFixtureStyle, CanvasRichTextItem, MaterialSettings, NeuralPulseSettings, AtmosphereSettings, LightingColors, TunnelTopology, MediaFileInfo } from '../../shared/types';
import { createLegacyTopology, computeMaxDepthFromObjects, getPathForEdge, getEdge as getTopologyEdge, getNode as getTopologyNode, clearPathCache } from '../tunnel/TunnelGraph';

export const DEFAULT_MATERIAL_SETTINGS: MaterialSettings = {
  wallMetalness: 0.15,
  wallRoughness: 0.65,
  floorMetalness: 0.2,
  floorRoughness: 0.55,
  ceilingMetalness: 0.2,
  ceilingRoughness: 0.7,
  wireframeOpacity: 0.04,
  trimOpacity: 0.25,
};

export const DEFAULT_NEURAL_PULSE_SETTINGS: NeuralPulseSettings = {
  pulseColor: '#ffd700',
  baseGlow: 0.15,
  ambientSpeed: 1.2,
  ambientIntensity: 0.35,
  reactiveSpeed: 2.0,
  reactiveIntensity: 1.0,
  reactiveSensitivity: 3.0,
};

export const DEFAULT_ATMOSPHERE_SETTINGS: AtmosphereSettings = {
  backgroundColor: '#0a0604',
  fogColor: '#0a0604',
};

export const DEFAULT_LIGHTING_COLORS: LightingColors = {
  accentColor: '#d4a044',
  secondaryColor: '#c47030',
  ambientLightColor: '#2e1a0a',
};

const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  lightBrightness: 3.0,
  envBrightness: 0.08,
  drawDistance: 120,
  haziness: 0.3,
  navigationSpeed: 0.08,
  walls: {
    left: { color: '#2a1a0a', brightness: 1.0, opacity: 1.0 },
    right: { color: '#2a1a0a', brightness: 1.0, opacity: 1.0 },
    floor: { color: '#1a0f05', brightness: 1.0, opacity: 1.0 },
    ceiling: { color: '#1a0f05', brightness: 1.0, opacity: 1.0 },
  },
  materials: { ...DEFAULT_MATERIAL_SETTINGS },
  neuralPulse: { ...DEFAULT_NEURAL_PULSE_SETTINGS },
  atmosphere: { ...DEFAULT_ATMOSPHERE_SETTINGS },
  lightingColors: { ...DEFAULT_LIGHTING_COLORS },
};

// Tunnel dimensions
const TUNNEL_WIDTH = 16;
const TUNNEL_HEIGHT = 10;
const SIGN_INTERVAL = 100; // meters between auto-generated signs
const LIGHT_INTERVAL = 50; // meters between ceiling lights
const SECTION_LENGTH = 10; // meters per wall section

interface PendingWallpaper {
  wall: WallSide;
  imagePath: string;
}

interface CanvasModeState {
  wall: WallSide;
  sectionId: string;
  zPosition: number;
}

interface DecoratingState {
  wall: WallSide;
  sectionId: string;
  zPosition: number;
  cameraOffset: number; // Sideways position along wall
}

interface PendingDateMarker {
  wall: WallSide;
  position: Vector3;
  depth: number;
}

interface PendingLight {
  wall: WallSide;
  position: Vector3;
  depth: number;
}

interface DecoratingBrushSettings {
  tool: 'select' | 'draw';
  color: string;
  size: number;
  style: 'pen' | 'marker' | 'spray' | 'highlighter' | 'eraser';
}

// Undo/redo history for drawing strokes
interface StrokeHistory {
  drawingId: string;
  stroke: DrawingStroke;
}

interface ActiveHologram {
  objectId: string;
  directoryPath: string;
  mediaFiles: MediaFileInfo[];
  currentIndex: number;
  isPlaying: boolean;
  screenPosition: Vector3;
  projectorPosition: Vector3;
}

interface SceneStore {
  objects: SceneObject[];
  signs: HighwaySign[];
  lights: CeilingLight[];
  wallImages: WallImage[];
  wallSections: WallSection[];
  canvasItems: AnyCanvasItem[];
  dateMarkers: DateMarker[];
  pendingWallpaper: PendingWallpaper | null;
  pendingDateMarker: PendingDateMarker | null;
  pendingLight: PendingLight | null;
  settings: SceneSettings;
  selectedObjectId: string | null;
  hoveredObjectId: string | null;
  selectedCanvasItemId: string | null;
  maxGeneratedDepth: number;
  maxGeneratedLightDepth: number;
  maxGeneratedSectionDepth: number;

  // Navigation mode
  navigationMode: NavigationMode;
  canvasModeState: CanvasModeState | null;
  decoratingState: DecoratingState | null;

  // Multi-select and clipboard for canvas items
  selectedCanvasItemIds: Set<string>;
  canvasClipboard: AnyCanvasItem[] | null;

  // Section loading for memory optimization
  loadedSections: Map<string, { loaded: boolean }>;

  // Undo/redo stacks for drawing
  strokeUndoStack: StrokeHistory[];
  strokeRedoStack: StrokeHistory[];

  // Decorating brush settings (shared between DecoratingMode3D and Scene)
  decoratingBrushSettings: DecoratingBrushSettings | null;

  // Hovered wall section (for hover highlight in normal mode)
  hoveredWallSection: { wall: WallSide; sectionId: string } | null;

  // Tunnel topology
  tunnelTopology: TunnelTopology;
  currentEdgeId: string;
  currentT: number; // 0..1 position along current edge
  pendingNavigation: { edgeId: string; scrollZ: number } | null;

  // Hologram projector (ephemeral, not persisted)
  activeHologram: ActiveHologram | null;

  // Object actions
  addObject: (type: ObjectType, options?: Partial<SceneObject>) => SceneObject;
  removeObject: (id: string) => void;
  updateObject: (id: string, updates: Partial<SceneObject>) => void;
  selectObject: (id: string | null) => void;
  setHoveredObject: (id: string | null) => void;

  // Sign actions
  addSign: (name: string, depth: number, wall: WallSide) => HighwaySign;
  removeSign: (id: string) => void;
  updateSign: (id: string, updates: Partial<HighwaySign>) => void;
  generateSignsUpToDepth: (depth: number) => void;

  // Light actions
  addLight: (depth: number, wall: WallSide, fixtureStyle?: LightFixtureStyle, fixtureLength?: number) => CeilingLight;
  removeLight: (id: string) => void;
  updateLight: (id: string, updates: Partial<CeilingLight>) => void;
  generateLightsUpToDepth: (depth: number) => void;
  startPlacingLight: (wall: WallSide, position: Vector3, depth: number) => void;
  confirmLightPlacement: (fixtureStyle: LightFixtureStyle, fixtureLength: number, brightness?: number, temperature?: number) => void;
  cancelLightPlacement: () => void;

  // Wall image actions
  setPendingWallpaper: (wall: WallSide, imagePath: string) => void;
  clearPendingWallpaper: () => void;
  confirmWallImage: (zPosition: number) => void;
  removeWallImage: (id: string) => void;

  // Wall section actions
  generateSectionsUpToDepth: (depth: number) => void;
  updateWallSection: (id: string, updates: Partial<WallSection>) => void;
  getWallSectionAt: (wall: WallSide, z: number) => WallSection | undefined;

  // Canvas item actions
  addCanvasItem: (item: Omit<AnyCanvasItem, 'id' | 'zIndex'>) => AnyCanvasItem;
  updateCanvasItem: (id: string, updates: Partial<AnyCanvasItem>) => void;
  removeCanvasItem: (id: string) => void;
  selectCanvasItem: (id: string | null) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  addStrokeToDrawing: (itemId: string, stroke: DrawingStroke) => void;
  undoStroke: () => void;
  redoStroke: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Date marker actions
  addDateMarker: (date: string, showTime: boolean, wall: WallSide, depth: number, position: Vector3) => DateMarker;
  updateDateMarker: (id: string, updates: Partial<DateMarker>) => void;
  removeDateMarker: (id: string) => void;
  startPlacingDateMarker: (wall: WallSide, position: Vector3, depth: number) => void;
  confirmDateMarkerPlacement: (date: string, showTime: boolean) => void;
  cancelDateMarkerPlacement: () => void;

  // Navigation mode actions
  enterCanvasMode: (wall: WallSide, zPosition: number) => void;
  exitCanvasMode: () => void;
  updateCanvasZPosition: (delta: number) => void;
  enterDecoratingMode: (wall: WallSide, zPosition: number) => void;
  exitDecoratingMode: () => void;
  moveDecoratingCamera: (delta: number) => void;

  // Multi-select actions
  selectCanvasItems: (ids: string[], additive?: boolean) => void;
  clearCanvasSelection: () => void;
  copySelectedItems: () => void;
  pasteItems: () => void;

  // Section loading actions
  loadSection: (sectionId: string) => void;
  unloadSection: (sectionId: string) => void;

  // Decorating brush settings
  setDecoratingBrushSettings: (settings: DecoratingBrushSettings | null) => void;

  // Wall section interaction
  setHoveredWallSection: (section: { wall: WallSide; sectionId: string } | null) => void;
  clearSectionDrawings: (sectionId: string) => void;
  copySectionDrawings: (sectionId: string) => void;
  pasteSectionDrawings: (targetSectionId: string, targetWall: WallSide) => void;

  // Tunnel topology actions
  setTunnelTopology: (topology: TunnelTopology) => void;
  setCurrentEdge: (edgeId: string, t?: number) => void;
  setCurrentT: (t: number) => void;
  createBranch: (atDepth: number, branchAngle?: number) => string | null; // Returns new edge ID
  navigateToEdge: (edgeId: string, fromNodeId: string) => void;
  clearPendingNavigation: () => void;

  // Hologram actions
  openHologram: (objectId: string) => Promise<void>;
  closeHologram: () => void;
  hologramNext: () => void;
  hologramPrev: () => void;
  hologramSetPlaying: (playing: boolean) => void;

  // Settings actions
  updateSettings: (updates: Partial<SceneSettings>) => void;
  updateWallSettings: (wall: WallSide, updates: Partial<WallSettings>) => void;

  // Persistence
  saveState: () => Promise<void>;
  loadState: () => Promise<void>;
}

const DEFAULT_COLORS: Record<ObjectType, string> = {
  cube: '#4ecdc4',
  sphere: '#ff6b6b',
  cylinder: '#ffe66d',
  cone: '#95e1d3',
  torus: '#dda0dd',
  model: '#87ceeb',
  image: '#ffffff',
};

// Default topology: a straight tunnel used before loadState runs
const DEFAULT_TOPOLOGY = createLegacyTopology();

const getDefaultName = (type: ObjectType): string => {
  const names: Record<ObjectType, string> = {
    cube: 'Cube',
    sphere: 'Sphere',
    cylinder: 'Cylinder',
    cone: 'Cone',
    torus: 'Torus',
    model: '3D Model',
    image: 'Image',
  };
  return names[type];
};

// Get wall position for a sign
const getSignPosition = (depth: number, wall: WallSide): Vector3 => {
  const w = TUNNEL_WIDTH / 2 - 0.5;
  const h = TUNNEL_HEIGHT / 2 - 0.5;

  switch (wall) {
    case 'left':
      return { x: -w, y: 1, z: -depth };
    case 'right':
      return { x: w, y: 1, z: -depth };
    case 'floor':
      return { x: 0, y: -h + 1, z: -depth };
    case 'ceiling':
      return { x: 0, y: h - 0.5, z: -depth };
  }
};

// Single debounced save — replaces the 25+ individual setTimeout calls.
// Each call resets the timer so only one save fires after activity settles.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedSave = (getSaveState: () => { saveState: () => Promise<void> }) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    getSaveState().saveState();
  }, 300);
};

export const useSceneStore = create<SceneStore>((set, get) => ({
  objects: [],
  signs: [],
  lights: [],
  wallImages: [],
  wallSections: [],
  canvasItems: [],
  dateMarkers: [],
  pendingWallpaper: null,
  pendingDateMarker: null,
  pendingLight: null,
  settings: { ...DEFAULT_SCENE_SETTINGS },
  selectedObjectId: null,
  hoveredObjectId: null,
  selectedCanvasItemId: null,
  maxGeneratedDepth: 0,
  maxGeneratedLightDepth: 0,
  maxGeneratedSectionDepth: 0,

  // Navigation mode
  navigationMode: 'normal',
  canvasModeState: null,
  decoratingState: null,

  // Multi-select and clipboard
  selectedCanvasItemIds: new Set<string>(),
  canvasClipboard: null,

  // Section loading
  loadedSections: new Map<string, { loaded: boolean }>(),

  // Undo/redo stacks for drawing
  strokeUndoStack: [],
  strokeRedoStack: [],

  // Decorating brush settings
  decoratingBrushSettings: null,

  // Hovered wall section
  hoveredWallSection: null,

  // Tunnel topology — default straight tunnel (replaced by loadState)
  tunnelTopology: DEFAULT_TOPOLOGY,
  currentEdgeId: DEFAULT_TOPOLOGY.rootEdgeId,
  currentT: 0,
  pendingNavigation: null,

  // Hologram projector
  activeHologram: null,

  addObject: (type, options = {}) => {
    const newObject: SceneObject = {
      id: uuidv4(),
      type,
      name: options.name || getDefaultName(type),
      position: options.position || { x: 0, y: 0.5, z: 0 },
      rotation: options.rotation || { x: 0, y: 0, z: 0 },
      scale: options.scale || { x: 1, y: 1, z: 1 },
      color: options.color || DEFAULT_COLORS[type],
      directoryPath: options.directoryPath || null,
      modelPath: options.modelPath,
      imagePath: options.imagePath,
    };

    set((state) => ({
      objects: [...state.objects, newObject],
    }));

    debouncedSave(get);
    return newObject;
  },

  removeObject: (id) => {
    set((state) => ({
      objects: state.objects.filter((obj) => obj.id !== id),
      selectedObjectId: state.selectedObjectId === id ? null : state.selectedObjectId,
    }));
    debouncedSave(get);
  },

  updateObject: (id, updates) => {
    set((state) => ({
      objects: state.objects.map((obj) =>
        obj.id === id ? { ...obj, ...updates } : obj
      ),
    }));
    debouncedSave(get);
  },

  selectObject: (id) => {
    set({ selectedObjectId: id });
  },

  setHoveredObject: (id) => {
    set({ hoveredObjectId: id });
  },

  // Sign management
  addSign: (name, depth, wall) => {
    const newSign: HighwaySign = {
      id: uuidv4(),
      name,
      position: getSignPosition(depth, wall),
      wall,
      depth,
      isAutoGenerated: false,
    };

    set((state) => ({
      signs: [...state.signs, newSign],
    }));

    debouncedSave(get);
    return newSign;
  },

  removeSign: (id) => {
    set((state) => ({
      signs: state.signs.filter((sign) => sign.id !== id),
    }));
    debouncedSave(get);
  },

  updateSign: (id, updates) => {
    set((state) => ({
      signs: state.signs.map((sign) => {
        if (sign.id !== id) return sign;

        const updated = { ...sign, ...updates };

        // If wall changed, recalculate position
        if (updates.wall && updates.wall !== sign.wall) {
          updated.position = getSignPosition(updated.depth, updates.wall);
        }

        return updated;
      }),
    }));
    debouncedSave(get);
  },

  generateSignsUpToDepth: (depth) => {
    const { maxGeneratedDepth, signs } = get();

    // Only generate new signs beyond what we've already generated
    if (depth <= maxGeneratedDepth) return;

    const newSigns: HighwaySign[] = [];
    const startDepth = Math.ceil(maxGeneratedDepth / SIGN_INTERVAL) * SIGN_INTERVAL;

    for (let d = startDepth || SIGN_INTERVAL; d <= depth + 200; d += SIGN_INTERVAL) {
      // Check if sign already exists at this depth
      const existingSign = signs.find((s) => Math.abs(s.depth - d) < 10);
      if (existingSign) continue;

      // Alternate walls for variety
      const walls: WallSide[] = ['right', 'left', 'right', 'left'];
      const wall = walls[(d / SIGN_INTERVAL) % 4];

      newSigns.push({
        id: uuidv4(),
        name: `${d}m`,
        position: getSignPosition(d, wall),
        wall,
        depth: d,
        isAutoGenerated: true,
      });
    }

    if (newSigns.length > 0) {
      set((state) => ({
        signs: [...state.signs, ...newSigns],
        maxGeneratedDepth: depth + 200,
      }));
    }
  },

  // Light management
  addLight: (depth, wall, fixtureStyle = 'linear', fixtureLength = 3) => {
    const h = TUNNEL_HEIGHT / 2;
    const w = TUNNEL_WIDTH / 2;

    // Position light based on wall
    let position: Vector3;
    if (wall === 'ceiling') {
      position = { x: 0, y: h - 0.2, z: -depth };
    } else if (wall === 'floor') {
      position = { x: 0, y: -h + 0.2, z: -depth };
    } else if (wall === 'left') {
      position = { x: -w + 0.2, y: 0, z: -depth };
    } else {
      position = { x: w - 0.2, y: 0, z: -depth };
    }

    const newLight: CeilingLight = {
      id: uuidv4(),
      position,
      depth,
      brightness: 1.0,
      temperature: 5500,
      isAutoGenerated: false,
      fixtureStyle,
      fixtureLength,
    };

    set((state) => ({
      lights: [...state.lights, newLight],
    }));

    debouncedSave(get);
    return newLight;
  },

  removeLight: (id) => {
    set((state) => ({
      lights: state.lights.filter((light) => light.id !== id),
    }));
    debouncedSave(get);
  },

  updateLight: (id, updates) => {
    set((state) => ({
      lights: state.lights.map((light) =>
        light.id === id ? { ...light, ...updates } : light
      ),
    }));
    debouncedSave(get);
  },

  startPlacingLight: (wall, position, depth) => {
    set({ pendingLight: { wall, position, depth } });
  },

  confirmLightPlacement: (fixtureStyle, fixtureLength, brightness = 1.0, temperature = 5500) => {
    const { pendingLight, addLight, updateLight } = get();
    if (!pendingLight) return;

    const newLight = addLight(pendingLight.depth, pendingLight.wall, fixtureStyle, fixtureLength);
    // Update with custom brightness and temperature if provided
    if (brightness !== 1.0 || temperature !== 5500) {
      updateLight(newLight.id, { brightness, temperature });
    }
    set({ pendingLight: null });
  },

  cancelLightPlacement: () => {
    set({ pendingLight: null });
  },

  generateLightsUpToDepth: (depth) => {
    const { maxGeneratedLightDepth, lights } = get();
    const h = TUNNEL_HEIGHT / 2;

    if (depth <= maxGeneratedLightDepth) return;

    const newLights: CeilingLight[] = [];
    const startDepth = Math.ceil(maxGeneratedLightDepth / LIGHT_INTERVAL) * LIGHT_INTERVAL;

    for (let d = startDepth || LIGHT_INTERVAL; d <= depth + 200; d += LIGHT_INTERVAL) {
      const existingLight = lights.find((l) => Math.abs(l.depth - d) < 10);
      if (existingLight) continue;

      newLights.push({
        id: uuidv4(),
        position: { x: 0, y: h - 0.2, z: -d },
        depth: d,
        brightness: 1.0,
        temperature: 5500, // Neutral daylight
        isAutoGenerated: true,
      });
    }

    if (newLights.length > 0) {
      set((state) => ({
        lights: [...state.lights, ...newLights],
        maxGeneratedLightDepth: depth + 200,
      }));
    }
  },

  // Wall image management
  setPendingWallpaper: (wall, imagePath) => {
    set({ pendingWallpaper: { wall, imagePath } });
  },

  clearPendingWallpaper: () => {
    set({ pendingWallpaper: null });
  },

  confirmWallImage: (zPosition) => {
    const { pendingWallpaper } = get();
    if (!pendingWallpaper) return;

    const newWallImage: WallImage = {
      id: uuidv4(),
      wall: pendingWallpaper.wall,
      imagePath: pendingWallpaper.imagePath,
      zPosition,
    };

    set((state) => ({
      wallImages: [...state.wallImages, newWallImage],
      pendingWallpaper: null,
    }));
    debouncedSave(get);
  },

  removeWallImage: (id) => {
    set((state) => ({
      wallImages: state.wallImages.filter((img) => img.id !== id),
    }));
    debouncedSave(get);
  },

  // Wall section management
  generateSectionsUpToDepth: (depth) => {
    const { maxGeneratedSectionDepth, wallSections } = get();
    const walls: WallSide[] = ['left', 'right', 'floor', 'ceiling'];

    if (depth <= maxGeneratedSectionDepth) return;

    const newSections: WallSection[] = [];
    const startDepth = Math.ceil(maxGeneratedSectionDepth / SECTION_LENGTH) * SECTION_LENGTH;

    for (let d = startDepth; d <= depth + 100; d += SECTION_LENGTH) {
      for (const wall of walls) {
        const existingSection = wallSections.find(
          (s) => s.wall === wall && s.zStart === d
        );
        if (existingSection) continue;

        newSections.push({
          id: uuidv4(),
          wall,
          zStart: d,
          zEnd: d + SECTION_LENGTH,
        });
      }
    }

    if (newSections.length > 0) {
      set((state) => ({
        wallSections: [...state.wallSections, ...newSections],
        maxGeneratedSectionDepth: depth + 100,
      }));
    }
  },

  updateWallSection: (id, updates) => {
    set((state) => ({
      wallSections: state.wallSections.map((section) =>
        section.id === id ? { ...section, ...updates } : section
      ),
    }));
    debouncedSave(get);
  },

  getWallSectionAt: (wall, z) => {
    const { wallSections } = get();
    const depth = Math.abs(z);
    return wallSections.find(
      (s) => s.wall === wall && depth >= s.zStart && depth < s.zEnd
    );
  },

  // Canvas item management
  addCanvasItem: (item) => {
    const { canvasItems } = get();
    const maxZIndex = canvasItems.length > 0
      ? Math.max(...canvasItems.map((i) => i.zIndex))
      : 0;

    const newItem = {
      ...item,
      id: uuidv4(),
      zIndex: maxZIndex + 1,
    } as AnyCanvasItem;

    set((state) => ({
      canvasItems: [...state.canvasItems, newItem],
    }));

    debouncedSave(get);
    return newItem;
  },

  updateCanvasItem: (id, updates) => {
    set((state) => ({
      canvasItems: state.canvasItems.map((item) =>
        item.id === id ? { ...item, ...updates } as AnyCanvasItem : item
      ),
    }));
    debouncedSave(get);
  },

  removeCanvasItem: (id) => {
    set((state) => ({
      canvasItems: state.canvasItems.filter((item) => item.id !== id),
      selectedCanvasItemId: state.selectedCanvasItemId === id ? null : state.selectedCanvasItemId,
    }));
    debouncedSave(get);
  },

  selectCanvasItem: (id) => {
    set({ selectedCanvasItemId: id });
  },

  bringToFront: (id) => {
    const { canvasItems } = get();
    const maxZIndex = Math.max(...canvasItems.map((i) => i.zIndex));
    set((state) => ({
      canvasItems: state.canvasItems.map((item) =>
        item.id === id ? { ...item, zIndex: maxZIndex + 1 } : item
      ),
    }));
    debouncedSave(get);
  },

  sendToBack: (id) => {
    const { canvasItems } = get();
    const minZIndex = Math.min(...canvasItems.map((i) => i.zIndex));
    set((state) => ({
      canvasItems: state.canvasItems.map((item) =>
        item.id === id ? { ...item, zIndex: minZIndex - 1 } : item
      ),
    }));
    debouncedSave(get);
  },

  addStrokeToDrawing: (itemId, stroke) => {
    set((state) => ({
      canvasItems: state.canvasItems.map((item) =>
        item.id === itemId && item.type === 'drawing'
          ? { ...item, strokes: [...item.strokes, stroke] }
          : item
      ),
      // Add to undo stack and clear redo stack
      strokeUndoStack: [...state.strokeUndoStack, { drawingId: itemId, stroke }],
      strokeRedoStack: [],
    }));
    debouncedSave(get);
  },

  undoStroke: () => {
    const { strokeUndoStack, canvasItems } = get();
    if (strokeUndoStack.length === 0) return;

    const lastAction = strokeUndoStack[strokeUndoStack.length - 1];
    const drawing = canvasItems.find((item) => item.id === lastAction.drawingId && item.type === 'drawing');
    if (!drawing || drawing.type !== 'drawing') return;

    set((state) => ({
      canvasItems: state.canvasItems.map((item) =>
        item.id === lastAction.drawingId && item.type === 'drawing'
          ? { ...item, strokes: item.strokes.slice(0, -1) }
          : item
      ),
      strokeUndoStack: state.strokeUndoStack.slice(0, -1),
      strokeRedoStack: [...state.strokeRedoStack, lastAction],
    }));
    debouncedSave(get);
  },

  redoStroke: () => {
    const { strokeRedoStack } = get();
    if (strokeRedoStack.length === 0) return;

    const lastAction = strokeRedoStack[strokeRedoStack.length - 1];

    set((state) => ({
      canvasItems: state.canvasItems.map((item) =>
        item.id === lastAction.drawingId && item.type === 'drawing'
          ? { ...item, strokes: [...item.strokes, lastAction.stroke] }
          : item
      ),
      strokeUndoStack: [...state.strokeUndoStack, lastAction],
      strokeRedoStack: state.strokeRedoStack.slice(0, -1),
    }));
    debouncedSave(get);
  },

  canUndo: () => {
    return get().strokeUndoStack.length > 0;
  },

  canRedo: () => {
    return get().strokeRedoStack.length > 0;
  },

  // Date marker management
  addDateMarker: (date, showTime, wall, depth, position) => {
    const newMarker: DateMarker = {
      id: uuidv4(),
      date,
      showTime,
      position,
      wall,
      depth,
    };

    set((state) => ({
      dateMarkers: [...state.dateMarkers, newMarker],
    }));

    debouncedSave(get);
    return newMarker;
  },

  updateDateMarker: (id, updates) => {
    set((state) => ({
      dateMarkers: state.dateMarkers.map((marker) => {
        if (marker.id !== id) return marker;

        const updated = { ...marker, ...updates };

        // If wall changed, recalculate position
        if (updates.wall && updates.wall !== marker.wall) {
          updated.position = getSignPosition(updated.depth, updates.wall);
        }

        return updated;
      }),
    }));
    debouncedSave(get);
  },

  removeDateMarker: (id) => {
    set((state) => ({
      dateMarkers: state.dateMarkers.filter((marker) => marker.id !== id),
    }));
    debouncedSave(get);
  },

  startPlacingDateMarker: (wall, position, depth) => {
    set({ pendingDateMarker: { wall, position, depth } });
  },

  confirmDateMarkerPlacement: (date, showTime) => {
    const { pendingDateMarker, addDateMarker } = get();
    if (!pendingDateMarker) return;

    addDateMarker(date, showTime, pendingDateMarker.wall, pendingDateMarker.depth, pendingDateMarker.position);
    set({ pendingDateMarker: null });
  },

  cancelDateMarkerPlacement: () => {
    set({ pendingDateMarker: null });
  },

  // Navigation mode management
  enterCanvasMode: (wall, zPosition) => {
    const { getWallSectionAt, generateSectionsUpToDepth } = get();
    generateSectionsUpToDepth(zPosition + 10);
    const section = getWallSectionAt(wall, -zPosition);

    if (!section) return;

    set({
      navigationMode: 'canvas',
      canvasModeState: {
        wall,
        sectionId: section.id,
        zPosition,
      },
    });
  },

  exitCanvasMode: () => {
    set({
      navigationMode: 'normal',
      canvasModeState: null,
      selectedCanvasItemId: null,
    });
  },

  updateCanvasZPosition: (delta) => {
    const { canvasModeState, getWallSectionAt, generateSectionsUpToDepth } = get();
    if (!canvasModeState) return;

    const newZ = Math.max(0, canvasModeState.zPosition + delta);
    generateSectionsUpToDepth(newZ + 20);
    const section = getWallSectionAt(canvasModeState.wall, -newZ);

    if (section) {
      set({
        canvasModeState: { ...canvasModeState, zPosition: newZ, sectionId: section.id },
      });
    }
  },

  enterDecoratingMode: (wall, zPosition) => {
    const { getWallSectionAt, generateSectionsUpToDepth } = get();
    generateSectionsUpToDepth(zPosition + 10);
    const section = getWallSectionAt(wall, -zPosition);

    if (!section) return;

    set({
      navigationMode: 'decorating',
      decoratingState: {
        wall,
        sectionId: section.id,
        zPosition,
        cameraOffset: 0,
      },
      selectedCanvasItemIds: new Set<string>(),
      canvasClipboard: null,
    });
  },

  exitDecoratingMode: () => {
    set({
      navigationMode: 'normal',
      decoratingState: null,
      selectedCanvasItemIds: new Set<string>(),
      canvasClipboard: null,
    });
  },

  moveDecoratingCamera: (delta) => {
    const { decoratingState, getWallSectionAt, generateSectionsUpToDepth } = get();
    if (!decoratingState) return;

    const newZ = Math.max(0, decoratingState.zPosition + delta);
    generateSectionsUpToDepth(newZ + 20);
    const section = getWallSectionAt(decoratingState.wall, -newZ);

    if (section) {
      set({
        decoratingState: { ...decoratingState, zPosition: newZ, sectionId: section.id },
      });
    }
  },

  // Multi-select actions
  selectCanvasItems: (ids, additive = false) => {
    set((state) => {
      if (additive) {
        const newSet = new Set(state.selectedCanvasItemIds);
        ids.forEach((id) => newSet.add(id));
        return { selectedCanvasItemIds: newSet };
      }
      return { selectedCanvasItemIds: new Set(ids) };
    });
  },

  clearCanvasSelection: () => {
    set({ selectedCanvasItemIds: new Set<string>() });
  },

  copySelectedItems: () => {
    const { canvasItems, selectedCanvasItemIds } = get();
    const itemsToCopy = canvasItems.filter((item) => selectedCanvasItemIds.has(item.id));
    if (itemsToCopy.length > 0) {
      set({ canvasClipboard: itemsToCopy });
    }
  },

  pasteItems: () => {
    const { canvasClipboard, decoratingState, addCanvasItem } = get();
    if (!canvasClipboard || canvasClipboard.length === 0 || !decoratingState) return;

    const newIds: string[] = [];
    canvasClipboard.forEach((item) => {
      // Offset position slightly so pasted items don't overlap exactly
      const newItem = addCanvasItem({
        ...item,
        wall: decoratingState.wall,
        sectionId: decoratingState.sectionId,
        position: {
          x: item.position.x + 20,
          y: item.position.y + 20,
        },
      } as Omit<AnyCanvasItem, 'id' | 'zIndex'>);
      newIds.push(newItem.id);
    });

    // Select the newly pasted items
    set({ selectedCanvasItemIds: new Set(newIds) });
  },

  // Section loading actions
  loadSection: (sectionId) => {
    set((state) => {
      const newMap = new Map(state.loadedSections);
      newMap.set(sectionId, { loaded: true });
      return { loadedSections: newMap };
    });
  },

  unloadSection: (sectionId) => {
    set((state) => {
      const newMap = new Map(state.loadedSections);
      newMap.set(sectionId, { loaded: false });
      return { loadedSections: newMap };
    });
  },

  setDecoratingBrushSettings: (settings) => {
    set({ decoratingBrushSettings: settings });
  },

  setHoveredWallSection: (section) => {
    set({ hoveredWallSection: section });
  },

  clearSectionDrawings: (sectionId) => {
    set((state) => ({
      canvasItems: state.canvasItems.filter(
        (item) => !(item.type === 'drawing' && item.sectionId === sectionId)
      ),
    }));
    debouncedSave(get);
  },

  copySectionDrawings: (sectionId) => {
    const { canvasItems } = get();
    const drawings = canvasItems.filter(
      (item) => item.type === 'drawing' && item.sectionId === sectionId
    );
    if (drawings.length > 0) {
      set({ canvasClipboard: drawings });
    }
  },

  pasteSectionDrawings: (targetSectionId, targetWall) => {
    const { canvasClipboard, addCanvasItem } = get();
    if (!canvasClipboard || canvasClipboard.length === 0) return;

    canvasClipboard.forEach((item) => {
      addCanvasItem({
        ...item,
        wall: targetWall,
        sectionId: targetSectionId,
      } as Omit<AnyCanvasItem, 'id' | 'zIndex'>);
    });
  },

  // Tunnel topology management
  setTunnelTopology: (topology) => {
    set({
      tunnelTopology: topology,
      currentEdgeId: topology.rootEdgeId,
      currentT: 0,
    });
    debouncedSave(get);
  },

  setCurrentEdge: (edgeId, t = 0) => {
    set({ currentEdgeId: edgeId, currentT: t });
  },

  setCurrentT: (t) => {
    set({ currentT: Math.max(0, Math.min(1, t)) });
  },

  createBranch: (atDepth, branchAngle = Math.PI / 6) => {
    const { tunnelTopology, currentEdgeId } = get();
    const edge = getTopologyEdge(tunnelTopology, currentEdgeId);
    if (!edge) return null;

    const path = getPathForEdge(edge);
    const t = path.tFromDistance(atDepth);
    const frame = path.getFrame(t);

    // Create intersection node at the split point
    const splitNodeId = uuidv4();
    const splitPos = { x: frame.position.x, y: frame.position.y, z: frame.position.z };

    // The branch direction: rotate tangent by branchAngle around the normal (vertical)
    const tangent = frame.tangent.clone();
    const branchDir = tangent.clone().applyAxisAngle(frame.normal, branchAngle);
    const branchLength = 200; // Default branch length: 200m

    const branchEndPos = {
      x: splitPos.x + branchDir.x * branchLength,
      y: splitPos.y + branchDir.y * branchLength,
      z: splitPos.z + branchDir.z * branchLength,
    };

    const branchEndNodeId = uuidv4();
    const newBranchEdgeId = uuidv4();

    // Split the current edge at t: original edge (start → split), continuation (split → end)
    const continuationEdgeId = uuidv4();

    // Get control points for each half
    const originalCPs = edge.controlPoints;
    const splitPoint = { x: frame.position.x, y: frame.position.y, z: frame.position.z };

    // First half: start → split (simplified as 2-point straight for now)
    const firstHalfCPs = [originalCPs[0], splitPoint];
    const firstHalfLength = atDepth;

    // Second half: split → end
    const secondHalfCPs = [splitPoint, originalCPs[originalCPs.length - 1]];
    const secondHalfLength = Math.max(0, edge.length - atDepth);

    // Branch: split → branch end (curved via intermediate control point)
    const midBranch = {
      x: splitPos.x + branchDir.x * branchLength * 0.5,
      y: splitPos.y + branchDir.y * branchLength * 0.5,
      z: splitPos.z + branchDir.z * branchLength * 0.5,
    };
    const branchCPs = [splitPoint, midBranch, branchEndPos];

    // Build new topology
    const newNodes = [
      ...tunnelTopology.nodes,
      { id: splitNodeId, position: splitPos, label: `Branch ${tunnelTopology.nodes.length}` },
      { id: branchEndNodeId, position: branchEndPos },
    ];

    // Replace original edge with two halves + branch
    const newEdges = tunnelTopology.edges
      .filter(e => e.id !== edge.id)
      .concat([
        {
          id: edge.id, // Keep original ID for the first half (preserves object edgeId refs)
          fromNodeId: edge.fromNodeId,
          toNodeId: splitNodeId,
          controlPoints: firstHalfCPs,
          length: firstHalfLength,
          width: edge.width,
          height: edge.height,
        },
        {
          id: continuationEdgeId,
          fromNodeId: splitNodeId,
          toNodeId: edge.toNodeId,
          controlPoints: secondHalfCPs,
          length: secondHalfLength,
          width: edge.width,
          height: edge.height,
        },
        {
          id: newBranchEdgeId,
          fromNodeId: splitNodeId,
          toNodeId: branchEndNodeId,
          controlPoints: branchCPs,
          length: branchLength,
        },
      ]);

    // Update objects on the second half of the split edge
    // Objects beyond the split point should move to the continuation edge
    const { signs, lights, wallSections, wallImages, canvasItems, dateMarkers } = get();

    // Assign objects beyond the split point to the continuation edge
    // Keep depths world-absolute (no adjustment) for flat rendering compatibility
    const updatedSigns = signs.map(s => {
      if (s.edgeId === edge.id && s.depth > atDepth) {
        return { ...s, edgeId: continuationEdgeId };
      }
      return s;
    });

    const updatedLights = lights.map(l => {
      if (l.edgeId === edge.id && l.depth > atDepth) {
        return { ...l, edgeId: continuationEdgeId };
      }
      return l;
    });

    const updatedWallSections = wallSections.map(ws => {
      if (ws.edgeId === edge.id && ws.zStart >= atDepth) {
        return { ...ws, edgeId: continuationEdgeId };
      }
      return ws;
    });

    // Clear path cache since topology changed
    clearPathCache();

    const newTopology = {
      nodes: newNodes,
      edges: newEdges,
      rootEdgeId: tunnelTopology.rootEdgeId,
    };

    set({
      tunnelTopology: newTopology,
      signs: updatedSigns,
      lights: updatedLights,
      wallSections: updatedWallSections,
    });

    debouncedSave(get);
    return newBranchEdgeId;
  },

  navigateToEdge: (edgeId, fromNodeId) => {
    const { tunnelTopology } = get();
    const edge = getTopologyEdge(tunnelTopology, edgeId);
    if (!edge) return;

    // Use the entry node's world Z to compute scrollZ (world-absolute depth)
    const entryNode = getTopologyNode(tunnelTopology, fromNodeId);
    const scrollZ = entryNode ? Math.abs(entryNode.position.z) : 0;

    const enteringFromStart = edge.fromNodeId === fromNodeId;
    const t = enteringFromStart ? 0 : 1;

    clearPathCache();

    set({
      currentEdgeId: edgeId,
      currentT: t,
      pendingNavigation: { edgeId, scrollZ },
    });
  },

  clearPendingNavigation: () => {
    set({ pendingNavigation: null });
  },

  // Hologram projector actions
  openHologram: async (objectId) => {
    const { objects } = get();
    const object = objects.find(o => o.id === objectId);
    if (!object || !object.directoryPath) return;

    try {
      const mediaFiles = await window.electronAPI.listMediaFiles(object.directoryPath);
      if (mediaFiles.length === 0) return;

      // Screen position: centered in tunnel, 3m in front of the object
      const screenPosition: Vector3 = {
        x: 0,
        y: 1.5,
        z: object.position.z - 3,
      };

      set({
        activeHologram: {
          objectId,
          directoryPath: object.directoryPath,
          mediaFiles,
          currentIndex: 0,
          isPlaying: true,
          screenPosition,
          projectorPosition: { ...object.position },
        },
      });
    } catch (error) {
      console.error('Failed to open hologram:', error);
    }
  },

  closeHologram: () => {
    set({ activeHologram: null });
  },

  hologramNext: () => {
    const { activeHologram } = get();
    if (!activeHologram) return;
    const nextIndex = (activeHologram.currentIndex + 1) % activeHologram.mediaFiles.length;
    set({
      activeHologram: { ...activeHologram, currentIndex: nextIndex, isPlaying: true },
    });
  },

  hologramPrev: () => {
    const { activeHologram } = get();
    if (!activeHologram) return;
    const prevIndex = (activeHologram.currentIndex - 1 + activeHologram.mediaFiles.length) % activeHologram.mediaFiles.length;
    set({
      activeHologram: { ...activeHologram, currentIndex: prevIndex, isPlaying: true },
    });
  },

  hologramSetPlaying: (playing) => {
    const { activeHologram } = get();
    if (!activeHologram) return;
    set({
      activeHologram: { ...activeHologram, isPlaying: playing },
    });
  },

  // Settings management
  updateSettings: (updates) => {
    set((state) => ({
      settings: { ...state.settings, ...updates },
    }));
    debouncedSave(get);
  },

  updateWallSettings: (wall, updates) => {
    set((state) => ({
      settings: {
        ...state.settings,
        walls: {
          ...state.settings.walls,
          [wall]: { ...state.settings.walls[wall], ...updates },
        },
      },
    }));
    debouncedSave(get);
  },

  saveState: async () => {
    const { objects, signs, lights, wallImages, wallSections, canvasItems, dateMarkers, settings, tunnelTopology } = get();
    const state: SceneState = {
      objects,
      signs,
      lights,
      wallImages,
      wallSections,
      canvasItems,
      dateMarkers,
      settings,
      tunnelTopology,
      cameraPosition: { x: 0, y: 0, z: 0 },
      cameraTarget: { x: 0, y: 0, z: -10 },
    };

    try {
      await window.electronAPI.saveState(state);
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  },

  loadState: async () => {
    try {
      const state = await window.electronAPI.loadState();
      if (state) {
        const signs = state.signs || [];
        const lights = state.lights || [];
        const wallSections = state.wallSections || [];

        // Migrate topology: if no saved topology, create a legacy straight tunnel
        let topology: TunnelTopology;
        if (state.tunnelTopology && state.tunnelTopology.edges.length > 0) {
          topology = state.tunnelTopology;
        } else {
          const maxDepth = computeMaxDepthFromObjects(signs, lights, wallSections);
          topology = createLegacyTopology(maxDepth);

          // Assign all existing objects to the root edge
          const rootEdgeId = topology.rootEdgeId;
          signs.forEach(s => { if (!s.edgeId) s.edgeId = rootEdgeId; });
          lights.forEach(l => { if (!l.edgeId) l.edgeId = rootEdgeId; });
          wallSections.forEach(ws => { if (!ws.edgeId) ws.edgeId = rootEdgeId; });
          (state.wallImages || []).forEach(wi => { if (!wi.edgeId) wi.edgeId = rootEdgeId; });
          (state.canvasItems || []).forEach(ci => { if (!ci.edgeId) ci.edgeId = rootEdgeId; });
          (state.dateMarkers || []).forEach(dm => { if (!dm.edgeId) dm.edgeId = rootEdgeId; });
        }

        set({
          objects: state.objects || [],
          signs,
          lights,
          wallImages: state.wallImages || [],
          wallSections,
          canvasItems: state.canvasItems || [],
          dateMarkers: state.dateMarkers || [],
          settings: state.settings ? {
            ...DEFAULT_SCENE_SETTINGS,
            ...state.settings,
            walls: { ...DEFAULT_SCENE_SETTINGS.walls, ...state.settings.walls },
            materials: { ...DEFAULT_MATERIAL_SETTINGS, ...state.settings.materials },
            neuralPulse: { ...DEFAULT_NEURAL_PULSE_SETTINGS, ...state.settings.neuralPulse },
            atmosphere: { ...DEFAULT_ATMOSPHERE_SETTINGS, ...state.settings.atmosphere },
            lightingColors: { ...DEFAULT_LIGHTING_COLORS, ...state.settings.lightingColors },
          } : DEFAULT_SCENE_SETTINGS,
          maxGeneratedDepth: signs.reduce((max, s) => Math.max(max, s.depth), 0) || 0,
          maxGeneratedLightDepth: lights.reduce((max, l) => Math.max(max, l.depth), 0) || 0,
          maxGeneratedSectionDepth: wallSections.reduce((max, s) => Math.max(max, s.zEnd), 0) || 0,
          tunnelTopology: topology,
          currentEdgeId: topology.rootEdgeId,
          currentT: 0,
        });
      }
    } catch (error) {
      console.error('Failed to load state:', error);
    }
  },
}));
