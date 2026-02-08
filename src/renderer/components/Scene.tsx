import React, { Suspense, useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { SceneObject, HighwaySign as HighwaySignType, CeilingLight as CeilingLightType, SceneSettings, WallSettings, WallImage, WallSide, NavigationMode, CanvasDrawingItem, DrawingStroke, WallSection, DateMarker as DateMarkerType, MaterialSettings, LightingColors, TunnelTopology } from '../../shared/types';
import { useSceneStore, DEFAULT_MATERIAL_SETTINGS, DEFAULT_NEURAL_PULSE_SETTINGS, DEFAULT_ATMOSPHERE_SETTINGS, DEFAULT_LIGHTING_COLORS } from '../store/sceneStore';
import { useShallow } from 'zustand/react/shallow';
import { HighwaySign } from './objects/HighwaySign';
import { CeilingLight } from './objects/CeilingLight';
import { DateMarker } from './objects/DateMarker';
import { generateSprayParticles, renderSprayParticles, interpolateSprayPoints } from './canvas/SprayPaintBrush';
import { PALETTE } from '../constants/colors';
import { generateVeinMapTexture, createNeuralPulseMaterial } from '../shaders/neuralPulse';
import { TunnelPath, getPathForEdge, getEdge, getEdgesAtNode, isIntersection } from '../tunnel';
import { getCurvedSegmentGeometry, CurvedSegmentGeometry } from '../tunnel/CurvedSegment';
import { generateIntersectionChamber, IntersectionGeometry, PortalInfo } from '../tunnel/IntersectionChamber';
import { HologramProjector } from './objects/HologramProjector';

interface SceneProps {
  onContextMenu: (e: ThreeEvent<MouseEvent>, object: SceneObject) => void;
  onSignContextMenu: (e: ThreeEvent<MouseEvent>, sign: HighwaySignType) => void;
  onLightContextMenu: (e: ThreeEvent<MouseEvent>, light: CeilingLightType) => void;
  onDateMarkerContextMenu: (e: ThreeEvent<MouseEvent>, marker: DateMarkerType) => void;
  onHover: (object: SceneObject | null, position?: { x: number; y: number }) => void;
  onScrollChange?: (scrollZ: number) => void;
  onWallClick?: (position: { x: number; y: number; z: number }, event: ThreeEvent<MouseEvent>, wall: WallSide) => void;
  onConfirmWallpaper?: (zPosition: number) => void;
  onCancelWallpaper?: () => void;
}

// Tunnel configuration
const TUNNEL_WIDTH = 16;
const TUNNEL_HEIGHT = 10;
const SEGMENT_DEPTH = 10; // Larger segments = fewer objects
const NUM_SEGMENTS = 25; // 250m of tunnel visibility
const SEGMENT_BUFFER = 3; // Extra buffer before/after camera
const SCROLL_SPEED = 0.08;
const SEAM_OVERLAP = 0.01; // Tiny overlap between segments to prevent visible seams

// Fork configuration (unused for now)
const FORK_POSITIONS = [50, 120, 200];
const FORK_ANGLE = Math.PI / 6;

// Global texture cache to prevent recreation
let cachedWallTexture: THREE.CanvasTexture | null = null;
let cachedFloorTexture: THREE.CanvasTexture | null = null;
let cachedCeilingTexture: THREE.CanvasTexture | null = null;

// Deterministic seeded random for procedural textures
const makeRand = (initialSeed: number) => {
  let s = initialSeed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

// Draw branching organic veins using bezier curves
const drawVeinNetwork = (
  ctx: CanvasRenderingContext2D, size: number,
  veins: { x0: number; y0: number; x1: number; y1: number }[],
  baseWidth: number, baseOpacity: number, maxDepth: number, seed: number
) => {
  const rand = makeRand(seed);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawVein = (
    x0: number, y0: number, x1: number, y1: number,
    width: number, opacity: number, depth: number
  ) => {
    const mx = (x0 + x1) / 2 + (rand() - 0.5) * 80;
    const my = (y0 + y1) / 2 + (rand() - 0.5) * 80;

    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();

    if (depth > 0) {
      const numBranches = 1 + Math.floor(rand() * 2);
      for (let b = 0; b < numBranches; b++) {
        const t = 0.3 + rand() * 0.4;
        const bx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
        const by = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
        const angle = Math.atan2(y1 - y0, x1 - x0) + (rand() - 0.5) * 1.5;
        const len = 30 + rand() * 50;
        drawVein(bx, by, bx + Math.cos(angle) * len, by + Math.sin(angle) * len, width * 0.6, opacity * 0.7, depth - 1);
      }
    }
  };

  for (const v of veins) {
    drawVein(v.x0, v.y0, v.x1, v.y1, baseWidth, baseOpacity, maxDepth);
  }
};

// Draw faint Voronoi-like membrane cell boundaries
const drawMembraneCells = (ctx: CanvasRenderingContext2D, size: number, numPoints: number, seed: number) => {
  const rand = makeRand(seed);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < numPoints; i++) {
    points.push({ x: rand() * size, y: rand() * size });
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 0.5;

  // Approximate Voronoi edges by drawing perpendicular bisectors between nearby points
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < size * 0.25) {
        const mx = (points[i].x + points[j].x) / 2;
        const my = (points[i].y + points[j].y) / 2;
        const nx = -dy / dist * 30;
        const ny = dx / dist * 30;
        ctx.beginPath();
        ctx.moveTo(mx - nx, my - ny);
        ctx.lineTo(mx + nx, my + ny);
        ctx.stroke();
      }
    }
  }
};

// Draw gold circuit traces — thin angular paths
const drawCircuitTraces = (ctx: CanvasRenderingContext2D, size: number, count: number, seed: number) => {
  const rand = makeRand(seed);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    let cx = rand() * size;
    let cy = rand() * size;
    ctx.moveTo(cx, cy);
    const segments = 3 + Math.floor(rand() * 4);
    for (let s = 0; s < segments; s++) {
      const angle = Math.floor(rand() * 8) * (Math.PI / 4);
      const len = 15 + rand() * 40;
      cx += Math.cos(angle) * len;
      cy += Math.sin(angle) * len;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
};

// Apply deterministic noise to imageData
const applyNoise = (ctx: CanvasRenderingContext2D, size: number, intensity: number) => {
  const imageData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = ((i * 7) % 17 - 8) * intensity;
    imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
    imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
    imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);
};

// Organic membrane wall texture (grayscale — material color tints it amber)
const getWallTexture = (): THREE.CanvasTexture => {
  if (cachedWallTexture) return cachedWallTexture;

  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // Subtle organic gradient — lighter center, darker edges
  const gradient = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE * 0.7);
  gradient.addColorStop(0, '#8a8a8a');
  gradient.addColorStop(1, '#707070');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Vein network — branching organic veins with endpoints at tile edges for seamless tiling
  drawVeinNetwork(ctx, SIZE, [
    { x0: 0, y0: SIZE * 0.25, x1: SIZE, y1: SIZE * 0.3 },
    { x0: 0, y0: SIZE * 0.7, x1: SIZE, y1: SIZE * 0.65 },
    { x0: SIZE * 0.2, y0: 0, x1: SIZE * 0.35, y1: SIZE },
    { x0: SIZE * 0.75, y0: 0, x1: SIZE * 0.8, y1: SIZE },
  ], 2.0, 0.12, 2, 42);

  // Gold circuit traces
  drawCircuitTraces(ctx, SIZE, 6, 137);

  // Faint membrane cell boundaries
  drawMembraneCells(ctx, SIZE, 30, 99);

  // Subtle noise
  applyNoise(ctx, SIZE, 0.6);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 5);
  cachedWallTexture = texture;
  return texture;
};

// Organic membrane floor texture (grayscale — material color tints it amber)
const getFloorTexture = (): THREE.CanvasTexture => {
  if (cachedFloorTexture) return cachedFloorTexture;

  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // Slightly darker base
  ctx.fillStyle = '#686868';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Organic flow lines running along z-axis (vertical in texture space)
  const rand = makeRand(200);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const startX = 30 + rand() * (SIZE - 60);
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    let cx = startX;
    for (let y = 0; y <= SIZE; y += 40) {
      cx += (rand() - 0.5) * 20;
      ctx.lineTo(cx, y);
    }
    ctx.stroke();
  }

  // Prominent center circuit trace
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  let cx = SIZE / 2;
  ctx.moveTo(cx, 0);
  const traceRand = makeRand(333);
  for (let y = 0; y <= SIZE; y += 30) {
    const angle = Math.floor(traceRand() * 3) - 1; // -1, 0, or 1
    cx += angle * 8;
    ctx.lineTo(cx, y);
  }
  ctx.stroke();

  // Faint membrane cells
  drawMembraneCells(ctx, SIZE, 20, 77);

  // Subtle noise
  applyNoise(ctx, SIZE, 0.5);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 10);
  cachedFloorTexture = texture;
  return texture;
};

// Organic membrane ceiling texture — subtler than walls, more spread out veins
const getCeilingTexture = (): THREE.CanvasTexture => {
  if (cachedCeilingTexture) return cachedCeilingTexture;

  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // More uniform base
  ctx.fillStyle = '#787878';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Fewer, more spread out veins
  drawVeinNetwork(ctx, SIZE, [
    { x0: 0, y0: SIZE * 0.4, x1: SIZE, y1: SIZE * 0.5 },
    { x0: SIZE * 0.5, y0: 0, x1: SIZE * 0.6, y1: SIZE },
  ], 1.5, 0.08, 1, 555);

  // Slightly more prominent circuit traces
  drawCircuitTraces(ctx, SIZE, 8, 222);

  // Sparse membrane cells
  drawMembraneCells(ctx, SIZE, 15, 444);

  // Subtle noise
  applyNoise(ctx, SIZE, 0.4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 5);
  cachedCeilingTexture = texture;
  return texture;
};

// Create tunnel segment geometry
const createTunnelSegmentVertices = (): Float32Array => {
  const w = TUNNEL_WIDTH / 2;
  const h = TUNNEL_HEIGHT / 2;
  const d = SEGMENT_DEPTH;
  const vertices: number[] = [];

  const colWidth = TUNNEL_WIDTH / 4;
  const rowHeight = TUNNEL_HEIGHT / 3;

  for (let i = 0; i <= 4; i++) {
    const x = -w + i * colWidth;
    vertices.push(x, -h, 0, x, -h, -d);
    vertices.push(x, h, 0, x, h, -d);
  }

  for (let i = 1; i < 3; i++) {
    const y = -h + i * rowHeight;
    vertices.push(-w, y, 0, -w, y, -d);
    vertices.push(w, y, 0, w, y, -d);
  }

  // Front-face cross-lines removed to prevent visible seams at segment boundaries

  return new Float32Array(vertices);
};

// Adjust color brightness
const adjustBrightness = (hex: string, factor: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const newR = Math.min(255, Math.round(r * factor));
  const newG = Math.min(255, Math.round(g * factor));
  const newB = Math.min(255, Math.round(b * factor));
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
};

// Shared geometry cache - lazily initialized
let geometryCache: {
  wall: THREE.PlaneGeometry;
  floor: THREE.PlaneGeometry;
  ceiling: THREE.PlaneGeometry;
  trim: THREE.PlaneGeometry;
  wireframe: THREE.BufferGeometry;
} | null = null;

const initGeometryCache = () => {
  if (geometryCache) return geometryCache;

  const vertices = createTunnelSegmentVertices();
  const wireframeGeom = new THREE.BufferGeometry();
  wireframeGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

  geometryCache = {
    wall: new THREE.PlaneGeometry(SEGMENT_DEPTH + SEAM_OVERLAP * 2, TUNNEL_HEIGHT),
    floor: new THREE.PlaneGeometry(TUNNEL_WIDTH, SEGMENT_DEPTH + SEAM_OVERLAP * 2),
    ceiling: new THREE.PlaneGeometry(TUNNEL_WIDTH, SEGMENT_DEPTH + SEAM_OVERLAP * 2),
    trim: new THREE.PlaneGeometry(0.1, SEGMENT_DEPTH + SEAM_OVERLAP * 2),
    wireframe: wireframeGeom,
  };

  return geometryCache;
};

const getGeometry = (type: 'wall' | 'floor' | 'ceiling' | 'trim' | 'wireframe') => {
  const cache = initGeometryCache();
  return cache[type];
};

// Create a PlaneGeometry with optionally flipped U coordinates.
// Needed for the right wall where the mesh rotation reverses the UV u-direction.
const createFlippedUPlane = (width: number, height: number): THREE.PlaneGeometry => {
  const geom = new THREE.PlaneGeometry(width, height);
  const uvs = geom.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uvs.count; i++) {
    uvs.setX(i, 1 - uvs.getX(i));
  }
  return geom;
};

// Canvas dimensions for rendering (same as CanvasMode.tsx)
const CANVAS_RENDER_WIDTH = 1600;
const CANVAS_RENDER_HEIGHT = 1000;

// Render a drawing stroke to a canvas context
const renderStrokeToContext = (ctx: CanvasRenderingContext2D, stroke: DrawingStroke) => {
  const { points, color, size, style } = stroke;
  if (points.length < 2) return;

  switch (style) {
    case 'pen':
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const midX = (points[i - 1].x + points[i].x) / 2;
        const midY = (points[i - 1].y + points[i].y) / 2;
        ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, midX, midY);
      }
      ctx.stroke();
      break;

    case 'marker':
      ctx.strokeStyle = color;
      ctx.lineWidth = size * 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;

    case 'spray':
      for (let i = 0; i < points.length; i++) {
        const interpolatedPoints = i > 0
          ? interpolateSprayPoints(points[i - 1], points[i], 3)
          : [points[i]];
        interpolatedPoints.forEach((point) => {
          const particles = generateSprayParticles(point.x, point.y, {
            color,
            size,
            density: 0.4,
            colorVariation: 15,
          });
          renderSprayParticles(ctx, particles);
        });
      }
      break;

    case 'highlighter':
      ctx.strokeStyle = color;
      ctx.lineWidth = size * 3;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;

    case 'eraser':
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const pressure = points[i].pressure ?? 1;
        ctx.lineWidth = size * 2 * pressure;
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.restore();
      break;
  }
};

// Global texture cache for wall drawings - keyed by drawing ID + stroke count
const drawingTextureCache = new Map<string, { texture: THREE.CanvasTexture; strokeCount: number; canvas: HTMLCanvasElement }>();

// Create or update a texture from drawing strokes (with caching)
const getOrCreateDrawingTexture = (
  drawingId: string,
  strokes: DrawingStroke[]
): THREE.CanvasTexture | null => {
  if (!strokes || strokes.length === 0) return null;

  const cacheKey = drawingId;
  const cached = drawingTextureCache.get(cacheKey);

  // If we have a cached texture with the same stroke count, reuse it
  if (cached && cached.strokeCount === strokes.length) {
    return cached.texture;
  }

  // Reuse canvas if exists, otherwise create new
  const canvas = cached?.canvas || document.createElement('canvas');
  if (!cached) {
    canvas.width = CANVAS_RENDER_WIDTH;
    canvas.height = CANVAS_RENDER_HEIGHT;
  }

  const ctx = canvas.getContext('2d')!;

  // If we have cached strokes and just adding new ones, only render new strokes
  if (cached && cached.strokeCount < strokes.length) {
    // Incremental update - only render new strokes
    for (let i = cached.strokeCount; i < strokes.length; i++) {
      renderStrokeToContext(ctx, strokes[i]);
    }
  } else {
    // Full re-render needed
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach((stroke) => {
      renderStrokeToContext(ctx, stroke);
    });
  }

  // Update existing texture or create new one
  let texture: THREE.CanvasTexture;
  if (cached?.texture) {
    texture = cached.texture;
    texture.needsUpdate = true;
  } else {
    texture = new THREE.CanvasTexture(canvas);
  }

  // Update cache
  drawingTextureCache.set(cacheKey, { texture, strokeCount: strokes.length, canvas });

  return texture;
};

// Clean up texture cache when drawing is removed
const disposeDrawingTexture = (drawingId: string) => {
  const cached = drawingTextureCache.get(drawingId);
  if (cached) {
    cached.texture.dispose();
    drawingTextureCache.delete(drawingId);
  }
};

// Component to render a drawing on a 3D wall.
// Supports both flat (legacy) and curved tunnel paths.
const WallDrawing: React.FC<{
  drawing: CanvasDrawingItem;
  section: WallSection;
  tunnelPath?: TunnelPath | null;
  currentEdgeId?: string;
}> = React.memo(({ drawing, section, tunnelPath, currentEdgeId }) => {
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const [, forceUpdate] = useState(0);

  // Get or create texture from cache
  useEffect(() => {
    if (drawing.strokes && drawing.strokes.length > 0) {
      const tex = getOrCreateDrawingTexture(drawing.id, drawing.strokes);
      if (tex !== textureRef.current) {
        textureRef.current = tex;
        forceUpdate((n) => n + 1);
      }
    } else {
      textureRef.current = null;
      forceUpdate((n) => n + 1);
    }

    // Cleanup on unmount
    return () => {
      // Don't dispose here - cache handles cleanup
    };
  }, [drawing.id, drawing.strokes]);

  // Memoize position/rotation calculations
  const { position, rotation, planeWidth, planeHeight } = useMemo(() => {
    const w = TUNNEL_WIDTH / 2;
    const h = TUNNEL_HEIGHT / 2;
    const sectionMidZ = -(section.zStart + section.zEnd) / 2;
    const sectionLength = section.zEnd - section.zStart;

    let pos: [number, number, number];
    let rot: [number, number, number];
    let pWidth: number;
    let pHeight: number;

    switch (section.wall) {
      case 'left':
        pos = [-w + 0.02, 0, sectionMidZ];
        rot = [0, Math.PI / 2, 0];
        pWidth = sectionLength;
        pHeight = TUNNEL_HEIGHT;
        break;
      case 'right':
        pos = [w - 0.02, 0, sectionMidZ];
        rot = [0, -Math.PI / 2, 0];
        pWidth = sectionLength;
        pHeight = TUNNEL_HEIGHT;
        break;
      case 'floor':
        pos = [0, -h + 0.02, sectionMidZ];
        rot = [-Math.PI / 2, 0, 0];
        pWidth = TUNNEL_WIDTH;
        pHeight = sectionLength;
        break;
      case 'ceiling':
        pos = [0, h - 0.02, sectionMidZ];
        rot = [Math.PI / 2, 0, 0];
        pWidth = TUNNEL_WIDTH;
        pHeight = sectionLength;
        break;
    }

    return { position: pos, rotation: rot, planeWidth: pWidth, planeHeight: pHeight };
  }, [section.wall, section.zStart, section.zEnd]);

  // Right wall rotation reverses the UV u-direction, so flip U to compensate
  const drawingGeometry = useMemo(() => {
    if (section.wall === 'right') {
      return createFlippedUPlane(planeWidth, planeHeight);
    }
    return new THREE.PlaneGeometry(planeWidth, planeHeight);
  }, [planeWidth, planeHeight, section.wall]);

  if (!textureRef.current) return null;

  return (
    <mesh position={position} rotation={rotation} renderOrder={2}>
      <primitive object={drawingGeometry} attach="geometry" />
      <meshStandardMaterial
        map={textureRef.current}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        roughness={0.9}
        metalness={0}
      />
    </mesh>
  );
});

// Drawing surface for decorating mode - handles mouse input and renders strokes to wall.
// Spans up to 3 wall sections (prev + active + next) so drawing works seamlessly
// across section boundaries. On stroke complete, splits into per-section strokes.
// Supports both flat (legacy) and curved tunnel paths.
const DecoratingDrawingSurface: React.FC<{
  wall: WallSide;
  zPosition: number;
  brushSettings: { tool: string; color: string; size: number; style: string } | null;
  onStrokeComplete: (drawingId: string, stroke: DrawingStroke) => void;
  canvasItems: CanvasDrawingItem[];
  wallSections: WallSection[];
  tunnelPath?: TunnelPath | null;
  currentEdgeId?: string;
}> = ({ wall, zPosition, brushSettings, onStrokeComplete, canvasItems, wallSections, tunnelPath, currentEdgeId }) => {
  const { camera, raycaster, gl } = useThree();
  const addCanvasItem = useSceneStore(s => s.addCanvasItem);
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const [textureVersion, setTextureVersion] = useState(0);
  // Reuse raycasting objects to avoid allocations in the hot path
  const mouseVecRef = useRef(new THREE.Vector2());
  const intersectionVecRef = useRef(new THREE.Vector3());
  // Use refs for drawing state so DOM event handlers always see current values
  // (avoids the React state timing gap that breaks touch/stylus input).
  const isDrawingRef = useRef(false);
  const brushSettingsRef = useRef(brushSettings);
  brushSettingsRef.current = brushSettings;

  const CANVAS_W = 1600;
  const CANVAS_H = 1000;

  // Find active section and its neighbors to span across for seamless drawing
  const { spanSections, combinedZStart, combinedZEnd } = useMemo(() => {
    const active = wallSections.find(s =>
      s.wall === wall && zPosition >= s.zStart && zPosition < s.zEnd
    );
    if (!active) return { spanSections: [] as WallSection[], combinedZStart: 0, combinedZEnd: 0 };

    const prev = wallSections.find(s =>
      s.wall === wall && s.zEnd === active.zStart
    );
    const next = wallSections.find(s =>
      s.wall === wall && s.zStart === active.zEnd
    );

    const sections = [prev, active, next].filter(Boolean) as WallSection[];
    sections.sort((a, b) => a.zStart - b.zStart);

    return {
      spanSections: sections,
      combinedZStart: sections[0].zStart,
      combinedZEnd: sections[sections.length - 1].zEnd,
    };
  }, [wallSections, wall, zPosition]);

  const numSpanSections = spanSections.length;
  const COMBINED_CANVAS_W = CANVAS_W * numSpanSections;
  const combinedLength = combinedZEnd - combinedZStart;

  // Find drawings for each spanned section (for rendering existing strokes)
  const sectionDrawings = useMemo(() => {
    return spanSections.map(section => {
      const drawing = canvasItems.find(
        item => item.sectionId === section.id && item.wall === wall
      ) as CanvasDrawingItem | undefined;
      return { section, drawing: drawing ?? null };
    });
  }, [canvasItems, spanSections, wall]);

  // Dependency key for canvas re-render: tracks total stroke count across all spanned sections
  const totalStrokeKey = sectionDrawings.map(
    sd => `${sd.section.id}:${sd.drawing?.strokes?.length ?? 0}`
  ).join(',');

  // Create wall plane for raycasting (infinite plane, works across all sections)
  const wallPlane = useMemo(() => {
    const w = TUNNEL_WIDTH / 2;
    const h = TUNNEL_HEIGHT / 2;
    switch (wall) {
      case 'left': return new THREE.Plane(new THREE.Vector3(1, 0, 0), w);
      case 'right': return new THREE.Plane(new THREE.Vector3(-1, 0, 0), w);
      case 'floor': return new THREE.Plane(new THREE.Vector3(0, 1, 0), h);
      case 'ceiling': return new THREE.Plane(new THREE.Vector3(0, -1, 0), h);
    }
  }, [wall]);

  // Convert 3D world point to 2D canvas coordinates across the combined section span.
  // Clamps to combined canvas bounds so drawing works across section boundaries.
  const worldToCanvas = useCallback((worldPoint: THREE.Vector3): { x: number; y: number } | null => {
    if (spanSections.length === 0 || combinedLength === 0) return null;
    const h = TUNNEL_HEIGHT / 2;
    const worldZ = -worldPoint.z;

    const zNorm = (worldZ - combinedZStart) / combinedLength;
    const clampedX = Math.max(0, Math.min(COMBINED_CANVAS_W, zNorm * COMBINED_CANVAS_W));

    switch (wall) {
      case 'left':
      case 'right':
        return {
          x: clampedX,
          y: Math.max(0, Math.min(CANVAS_H, ((h - worldPoint.y) / TUNNEL_HEIGHT) * CANVAS_H)),
        };
      case 'floor':
      case 'ceiling':
        return {
          x: clampedX,
          y: Math.max(0, Math.min(CANVAS_H, ((TUNNEL_WIDTH / 2 - worldPoint.x) / TUNNEL_WIDTH) * CANVAS_H)),
        };
    }
  }, [spanSections, combinedZStart, combinedLength, COMBINED_CANVAS_W, wall]);

  // Initialize canvases and render committed strokes from all spanned sections
  useEffect(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    canvasRef.current.width = COMBINED_CANVAS_W;
    canvasRef.current.height = CANVAS_H;

    if (!backgroundCanvasRef.current) {
      backgroundCanvasRef.current = document.createElement('canvas');
    }
    backgroundCanvasRef.current.width = COMBINED_CANVAS_W;
    backgroundCanvasRef.current.height = CANVAS_H;

    // Render committed strokes from all spanned sections onto the background canvas
    const bgCtx = backgroundCanvasRef.current.getContext('2d')!;
    bgCtx.clearRect(0, 0, COMBINED_CANVAS_W, CANVAS_H);

    sectionDrawings.forEach(({ section, drawing }) => {
      if (!drawing?.strokes || drawing.strokes.length === 0) return;
      // Each section's strokes use local coords (0 to CANVAS_W).
      // Offset by the section's position in the combined canvas.
      const sectionIndex = spanSections.indexOf(section);
      const xOffset = sectionIndex * CANVAS_W;
      bgCtx.save();
      bgCtx.translate(xOffset, 0);
      drawing.strokes.forEach(stroke => {
        renderStrokeToContext(bgCtx, stroke);
      });
      bgCtx.restore();
    });

    // Copy background to foreground (visible texture)
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.clearRect(0, 0, COMBINED_CANVAS_W, CANVAS_H);
    ctx.drawImage(backgroundCanvasRef.current, 0, 0);

    if (textureRef.current) {
      textureRef.current.needsUpdate = true;
    } else {
      textureRef.current = new THREE.CanvasTexture(canvasRef.current);
      setTextureVersion(v => v + 1);
    }
  }, [totalStrokeKey, COMBINED_CANVAS_W, spanSections]);

  // Calculate mesh position and rotation covering all spanned sections
  const { position, rotation, planeWidth, planeHeight } = useMemo(() => {
    if (spanSections.length === 0) {
      return { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], planeWidth: 1, planeHeight: 1 };
    }

    const w = TUNNEL_WIDTH / 2;
    const h = TUNNEL_HEIGHT / 2;
    const midZ = -(combinedZStart + combinedZEnd) / 2;

    let pos: [number, number, number];
    let rot: [number, number, number];
    let pWidth: number;
    let pHeight: number;

    switch (wall) {
      case 'left':
        pos = [-w + 0.03, 0, midZ];
        rot = [0, Math.PI / 2, 0];
        pWidth = combinedLength;
        pHeight = TUNNEL_HEIGHT;
        break;
      case 'right':
        pos = [w - 0.03, 0, midZ];
        rot = [0, -Math.PI / 2, 0];
        pWidth = combinedLength;
        pHeight = TUNNEL_HEIGHT;
        break;
      case 'floor':
        pos = [0, -h + 0.03, midZ];
        rot = [-Math.PI / 2, 0, 0];
        pWidth = TUNNEL_WIDTH;
        pHeight = combinedLength;
        break;
      case 'ceiling':
        pos = [0, h - 0.03, midZ];
        rot = [Math.PI / 2, 0, 0];
        pWidth = TUNNEL_WIDTH;
        pHeight = combinedLength;
        break;
    }

    return { position: pos, rotation: rot, planeWidth: pWidth, planeHeight: pHeight };
  }, [spanSections, combinedZStart, combinedZEnd, combinedLength, wall]);

  const getCanvasPoint = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = gl.domElement.getBoundingClientRect();
    // Reuse pre-allocated vectors to avoid GC pressure in the hot path
    mouseVecRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    raycaster.setFromCamera(mouseVecRef.current, camera);
    const hit = raycaster.ray.intersectPlane(wallPlane, intersectionVecRef.current);

    if (hit) {
      return worldToCanvas(intersectionVecRef.current);
    }
    return null;
  }, [camera, raycaster, gl, wallPlane, worldToCanvas]);

  // Keep refs in sync so DOM event handlers always read current values.
  // This avoids stale closures — the handlers are attached once and read refs.
  const onStrokeCompleteRef = useRef(onStrokeComplete);
  onStrokeCompleteRef.current = onStrokeComplete;
  const getCanvasPointRef = useRef(getCanvasPoint);
  getCanvasPointRef.current = getCanvasPoint;
  const spanSectionsRef = useRef(spanSections);
  spanSectionsRef.current = spanSections;
  const canvasItemsRef = useRef(canvasItems);
  canvasItemsRef.current = canvasItems;
  const addCanvasItemRef = useRef(addCanvasItem);
  addCanvasItemRef.current = addCanvasItem;
  const wallRef = useRef(wall);
  wallRef.current = wall;

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    const bs = brushSettingsRef.current;
    if (!bs || bs.tool !== 'draw' || e.button !== 0) return;
    e.stopPropagation();

    const point = getCanvasPointRef.current(e.clientX, e.clientY);
    if (point) {
      // Set ref immediately (synchronous) so DOM handlers work right away
      isDrawingRef.current = true;
      currentStrokeRef.current = [point];

      // Capture pointer so move/up events keep firing on touch/stylus
      gl.domElement.setPointerCapture(e.nativeEvent.pointerId);

      // Render point immediately for visual feedback
      if (canvasRef.current && textureRef.current) {
        const ctx = canvasRef.current.getContext('2d')!;
        const tempStroke: DrawingStroke = {
          points: [point],
          color: bs.color,
          size: bs.size,
          style: bs.style as DrawingStroke['style'],
        };
        renderStrokeToContext(ctx, tempStroke);
        textureRef.current.needsUpdate = true;
      }
    }
  }, [gl]);

  // Attach raw DOM listeners once on mount. They read from refs so they
  // always see current values without needing re-attachment.
  // Also disables browser touch gestures (scroll/pan/zoom) on the canvas
  // while this component is mounted — without this, the browser interprets
  // stylus/touch input as a pan gesture and fires pointercancel after ~3px
  // of movement, killing the stroke.
  useEffect(() => {
    const domEl = gl.domElement;

    // Prevent browser from hijacking touch for scroll/pan/zoom gestures
    const prevTouchAction = domEl.style.touchAction;
    domEl.style.touchAction = 'none';

    const onPointerMove = (e: PointerEvent) => {
      if (!isDrawingRef.current) return;
      const bs = brushSettingsRef.current;
      if (!bs) return;

      const point = getCanvasPointRef.current(e.clientX, e.clientY);
      if (point) {
        currentStrokeRef.current.push(point);

        // Double-buffered render: composite background + current stroke only
        if (canvasRef.current && backgroundCanvasRef.current && textureRef.current) {
          const cw = canvasRef.current.width;
          const ctx = canvasRef.current.getContext('2d')!;
          ctx.clearRect(0, 0, cw, CANVAS_H);
          ctx.drawImage(backgroundCanvasRef.current, 0, 0);

          const tempStroke: DrawingStroke = {
            points: currentStrokeRef.current,
            color: bs.color,
            size: bs.size,
            style: bs.style as DrawingStroke['style'],
          };
          renderStrokeToContext(ctx, tempStroke);
          textureRef.current.needsUpdate = true;
        }
      }
    };

    const onPointerUp = () => {
      if (!isDrawingRef.current) return;
      const bs = brushSettingsRef.current;
      const sections = spanSectionsRef.current;
      const items = canvasItemsRef.current;
      const currentWall = wallRef.current;

      if (currentStrokeRef.current.length > 1 && bs && sections.length > 0) {
        // Split stroke into per-section portions based on canvas x-coordinate.
        // Each section occupies CANVAS_W pixels in the combined canvas.
        const sectionWidth = CANVAS_W;
        const numSections = sections.length;

        // Group consecutive points by which section they fall in.
        // When crossing a boundary, interpolate a point at the exact edge
        // so both sections' sub-strokes connect seamlessly.
        let currentSectionIdx = -1;
        let currentRun: { x: number; y: number }[] = [];
        const runs: { sectionIdx: number; points: { x: number; y: number }[] }[] = [];
        let prevPoint: { x: number; y: number } | null = null;

        for (const point of currentStrokeRef.current) {
          const sectionIdx = Math.min(
            Math.max(0, Math.floor(point.x / sectionWidth)),
            numSections - 1
          );

          if (sectionIdx !== currentSectionIdx) {
            // Interpolate a boundary point when crossing between sections
            if (currentSectionIdx >= 0 && prevPoint) {
              const boundary = sectionIdx > currentSectionIdx
                ? sectionIdx * sectionWidth        // crossing deeper
                : currentSectionIdx * sectionWidth; // crossing shallower
              const dx = point.x - prevPoint.x;
              const t = dx !== 0 ? (boundary - prevPoint.x) / dx : 0;
              const boundaryY = prevPoint.y + t * (point.y - prevPoint.y);

              // Close outgoing run with boundary point (at section edge)
              currentRun.push({
                x: boundary - currentSectionIdx * sectionWidth,
                y: boundaryY,
              });
              runs.push({ sectionIdx: currentSectionIdx, points: currentRun });

              // Start incoming run with boundary point (at section edge)
              currentRun = [{
                x: boundary - sectionIdx * sectionWidth,
                y: boundaryY,
              }];
            } else if (currentRun.length > 0 && currentSectionIdx >= 0) {
              runs.push({ sectionIdx: currentSectionIdx, points: currentRun });
              currentRun = [];
            }
            currentSectionIdx = sectionIdx;
          }

          // Convert to section-local coordinates
          currentRun.push({
            x: point.x - sectionIdx * sectionWidth,
            y: point.y,
          });
          prevPoint = point;
        }
        if (currentRun.length > 0 && currentSectionIdx >= 0) {
          runs.push({ sectionIdx: currentSectionIdx, points: currentRun });
        }

        // Save each run to its section's drawing
        for (const run of runs) {
          if (run.points.length < 2) continue;
          const section = sections[run.sectionIdx];
          if (!section) continue;

          // Find or create drawing for this section
          let drawing = items.find(
            item => item.type === 'drawing' && item.sectionId === section.id && item.wall === currentWall
          ) as CanvasDrawingItem | undefined;

          if (!drawing) {
            const newItem = addCanvasItemRef.current({
              type: 'drawing',
              wall: currentWall,
              sectionId: section.id,
              position: { x: 0, y: 0 },
              size: { width: CANVAS_W, height: CANVAS_H },
              strokes: [],
            } as Omit<CanvasDrawingItem, 'id' | 'zIndex'>);
            drawing = newItem as CanvasDrawingItem;
          }

          const sectionStroke: DrawingStroke = {
            points: run.points,
            color: bs.color,
            size: bs.size,
            style: bs.style as DrawingStroke['style'],
          };
          onStrokeCompleteRef.current(drawing.id, sectionStroke);
        }
      }
      isDrawingRef.current = false;
      currentStrokeRef.current = [];
    };

    domEl.addEventListener('pointermove', onPointerMove);
    domEl.addEventListener('pointerup', onPointerUp);
    domEl.addEventListener('pointercancel', onPointerUp);

    return () => {
      domEl.removeEventListener('pointermove', onPointerMove);
      domEl.removeEventListener('pointerup', onPointerUp);
      domEl.removeEventListener('pointercancel', onPointerUp);
      domEl.style.touchAction = prevTouchAction;
    };
  }, [gl]);

  // Right wall rotation reverses the UV u-direction, so flip U to compensate
  const drawingGeometry = useMemo(() => {
    if (wall === 'right') {
      return createFlippedUPlane(planeWidth, planeHeight);
    }
    return new THREE.PlaneGeometry(planeWidth, planeHeight);
  }, [planeWidth, planeHeight, wall]);

  if (spanSections.length === 0 || !textureRef.current) return null;

  return (
    <mesh
      position={position}
      rotation={rotation}
      onPointerDown={handlePointerDown}
      renderOrder={10}
    >
      <primitive object={drawingGeometry} attach="geometry" />
      <meshStandardMaterial
        map={textureRef.current}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        roughness={0.9}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
};

// Tunnel segment with clickable walls and textured surfaces
const TunnelSegment: React.FC<{
  onWallClick?: (position: { x: number; y: number; z: number }, event: ThreeEvent<MouseEvent>, wall: WallSide) => void;
  wallSettings: SceneSettings['walls'];
  wallSections: WallSection[];
  segmentZ: number; // The z-position of this segment's front face (used for section lookup)
  onWallHover?: (hover: { wall: WallSide; sectionId: string } | null) => void;
  hoveredSectionId?: string | null;
  pulseMaterial?: THREE.ShaderMaterial | null;
  materials?: MaterialSettings;
  lightingColors?: LightingColors;
  curvedGeometry?: CurvedSegmentGeometry | null;
}> = React.memo(({ onWallClick, wallSettings, wallSections, segmentZ, onWallHover, hoveredSectionId, pulseMaterial, materials, lightingColors, curvedGeometry }) => {
  // Resolve material and lighting settings with defaults
  const mat = materials || DEFAULT_MATERIAL_SETTINGS;
  const lc = lightingColors || DEFAULT_LIGHTING_COLORS;

  // Use cached textures
  const wallTexture = useMemo(() => getWallTexture(), []);
  const floorTexture = useMemo(() => getFloorTexture(), []);
  const ceilingTexture = useMemo(() => getCeilingTexture(), []);
  const w = TUNNEL_WIDTH / 2;
  const h = TUNNEL_HEIGHT / 2;
  const d = SEGMENT_DEPTH;

  // Find wall section at this segment's position (convert negative Z to positive depth)
  const segmentDepth = Math.abs(segmentZ);
  const getWallSectionForWall = useCallback((wall: WallSide): WallSection | undefined => {
    return wallSections.find(
      (s) => s.wall === wall && segmentDepth >= s.zStart && segmentDepth < s.zEnd
    );
  }, [wallSections, segmentDepth]);

  // Get effective wall settings (section overrides global)
  const getEffectiveWallSettings = useCallback((wall: WallSide): WallSettings => {
    const baseSettings = wallSettings[wall];
    const section = getWallSectionForWall(wall);

    if (!section) return baseSettings;

    return {
      ...baseSettings,
      color: section.color || baseSettings.color,
      brightness: section.brightness !== undefined ? section.brightness : baseSettings.brightness,
    };
  }, [wallSettings, getWallSectionForWall]);

  const handleWallClick = useCallback((wall: WallSide) => (e: ThreeEvent<MouseEvent>) => {
    if (onWallClick && e.point) {
      e.stopPropagation();
      onWallClick({ x: e.point.x, y: e.point.y, z: e.point.z }, e, wall);
    }
  }, [onWallClick]);

  // Hover handler for left/right walls
  const handleWallPointerMove = useCallback((wall: WallSide) => (e: ThreeEvent<PointerEvent>) => {
    if (!onWallHover) return;
    const section = getWallSectionForWall(wall);
    if (section) {
      e.stopPropagation();
      onWallHover({ wall, sectionId: section.id });
    }
  }, [onWallHover, getWallSectionForWall]);

  const handleWallPointerOut = useCallback(() => {
    onWallHover?.(null);
  }, [onWallHover]);

  // Check if left/right wall sections are hovered
  const leftSection = getWallSectionForWall('left');
  const rightSection = getWallSectionForWall('right');
  const leftHovered = hoveredSectionId != null && leftSection?.id === hoveredSectionId;
  const rightHovered = hoveredSectionId != null && rightSection?.id === hoveredSectionId;

  // Get adjusted color with brightness
  const getWallColor = useCallback((settings: WallSettings) => {
    return adjustBrightness(settings.color, settings.brightness);
  }, []);

  // Get effective settings for each wall
  const leftSettings = getEffectiveWallSettings('left');
  const rightSettings = getEffectiveWallSettings('right');
  const floorSettings = getEffectiveWallSettings('floor');
  const ceilingSettings = getEffectiveWallSettings('ceiling');

  // --- Curved geometry path ---
  if (curvedGeometry) {
    return (
      <group>
        {/* Wireframe overlay */}
        <lineSegments renderOrder={1}>
          <primitive object={curvedGeometry.wireframe} attach="geometry" />
          <lineBasicMaterial
            color={lc.accentColor}
            transparent
            opacity={mat.wireframeOpacity}
            depthWrite={false}
          />
        </lineSegments>

        {/* Left wall */}
        <mesh
          onClick={handleWallClick('left')}
          onContextMenu={handleWallClick('left')}
          onPointerMove={handleWallPointerMove('left')}
          onPointerOut={handleWallPointerOut}
          renderOrder={0}
        >
          <primitive object={curvedGeometry.leftWall} attach="geometry" />
          <meshStandardMaterial
            color={getWallColor(leftSettings)}
            map={wallTexture}
            side={THREE.FrontSide}
            metalness={mat.wallMetalness}
            roughness={mat.wallRoughness}
            transparent={leftSettings.opacity < 1}
            opacity={leftSettings.opacity}
          />
        </mesh>

        {/* Right wall */}
        <mesh
          onClick={handleWallClick('right')}
          onContextMenu={handleWallClick('right')}
          onPointerMove={handleWallPointerMove('right')}
          onPointerOut={handleWallPointerOut}
          renderOrder={0}
        >
          <primitive object={curvedGeometry.rightWall} attach="geometry" />
          <meshStandardMaterial
            color={getWallColor(rightSettings)}
            map={wallTexture}
            side={THREE.FrontSide}
            metalness={mat.wallMetalness}
            roughness={mat.wallRoughness}
            transparent={rightSettings.opacity < 1}
            opacity={rightSettings.opacity}
          />
        </mesh>

        {/* Floor */}
        <mesh
          onClick={handleWallClick('floor')}
          onContextMenu={handleWallClick('floor')}
          renderOrder={0}
        >
          <primitive object={curvedGeometry.floor} attach="geometry" />
          <meshStandardMaterial
            color={getWallColor(floorSettings)}
            map={floorTexture}
            side={THREE.FrontSide}
            metalness={mat.floorMetalness}
            roughness={mat.floorRoughness}
            transparent={floorSettings.opacity < 1}
            opacity={floorSettings.opacity}
          />
        </mesh>

        {/* Ceiling */}
        <mesh
          onClick={handleWallClick('ceiling')}
          onContextMenu={handleWallClick('ceiling')}
          renderOrder={0}
        >
          <primitive object={curvedGeometry.ceiling} attach="geometry" />
          <meshStandardMaterial
            color={getWallColor(ceilingSettings)}
            map={ceilingTexture}
            side={THREE.FrontSide}
            metalness={mat.ceilingMetalness}
            roughness={mat.ceilingRoughness}
            transparent={ceilingSettings.opacity < 1}
            opacity={ceilingSettings.opacity}
          />
        </mesh>

        {/* Edge trim strips */}
        <mesh>
          <primitive object={curvedGeometry.trimLeft} attach="geometry" />
          <meshBasicMaterial color={lc.accentColor} transparent opacity={mat.trimOpacity} />
        </mesh>
        <mesh>
          <primitive object={curvedGeometry.trimRight} attach="geometry" />
          <meshBasicMaterial color={lc.accentColor} transparent opacity={mat.trimOpacity} />
        </mesh>

        {/* Neural pulse overlay — uses curved geometry which has aPathDistance attribute */}
        {pulseMaterial && (
          <>
            <mesh renderOrder={1} material={pulseMaterial}>
              <primitive object={curvedGeometry.leftWall} attach="geometry" />
            </mesh>
            <mesh renderOrder={1} material={pulseMaterial}>
              <primitive object={curvedGeometry.rightWall} attach="geometry" />
            </mesh>
            <mesh renderOrder={1} material={pulseMaterial}>
              <primitive object={curvedGeometry.floor} attach="geometry" />
            </mesh>
            <mesh renderOrder={1} material={pulseMaterial}>
              <primitive object={curvedGeometry.ceiling} attach="geometry" />
            </mesh>
          </>
        )}
      </group>
    );
  }

  // --- Flat geometry path (legacy / straight tunnel) ---
  return (
    <group>
      {/* Wireframe overlay - pushed slightly inward to prevent Z-fighting */}
      <lineSegments renderOrder={1}>
        <primitive object={getGeometry('wireframe')} attach="geometry" />
        <lineBasicMaterial
          color={lc.accentColor}
          transparent
          opacity={mat.wireframeOpacity}
          depthWrite={false}
        />
      </lineSegments>

      {/* Left wall */}
      <mesh
        position={[-w, 0, -d / 2]}
        rotation={[0, Math.PI / 2, 0]}
        onClick={handleWallClick('left')}
        onContextMenu={handleWallClick('left')}
        onPointerMove={handleWallPointerMove('left')}
        onPointerOut={handleWallPointerOut}
        renderOrder={0}
      >
        <primitive object={getGeometry('wall')} attach="geometry" />
        <meshStandardMaterial
          color={getWallColor(leftSettings)}
          map={wallTexture}
          side={THREE.FrontSide}
          metalness={mat.wallMetalness}
          roughness={mat.wallRoughness}
          transparent={leftSettings.opacity < 1}
          opacity={leftSettings.opacity}
        />
      </mesh>
      {/* Left wall hover highlight */}
      {leftHovered && (
        <mesh
          position={[-w + 0.03, 0, -d / 2]}
          rotation={[0, Math.PI / 2, 0]}
          renderOrder={2}
        >
          <primitive object={getGeometry('wall')} attach="geometry" />
          <meshBasicMaterial
            color={lc.accentColor}
            transparent
            opacity={0.07}
            depthWrite={false}
            side={THREE.FrontSide}
          />
        </mesh>
      )}

      {/* Right wall */}
      <mesh
        position={[w, 0, -d / 2]}
        rotation={[0, -Math.PI / 2, 0]}
        onClick={handleWallClick('right')}
        onContextMenu={handleWallClick('right')}
        onPointerMove={handleWallPointerMove('right')}
        onPointerOut={handleWallPointerOut}
        renderOrder={0}
      >
        <primitive object={getGeometry('wall')} attach="geometry" />
        <meshStandardMaterial
          color={getWallColor(rightSettings)}
          map={wallTexture}
          side={THREE.FrontSide}
          metalness={mat.wallMetalness}
          roughness={mat.wallRoughness}
          transparent={rightSettings.opacity < 1}
          opacity={rightSettings.opacity}
        />
      </mesh>
      {/* Right wall hover highlight */}
      {rightHovered && (
        <mesh
          position={[w - 0.03, 0, -d / 2]}
          rotation={[0, -Math.PI / 2, 0]}
          renderOrder={2}
        >
          <primitive object={getGeometry('wall')} attach="geometry" />
          <meshBasicMaterial
            color={lc.accentColor}
            transparent
            opacity={0.07}
            depthWrite={false}
            side={THREE.FrontSide}
          />
        </mesh>
      )}

      {/* Floor */}
      <mesh
        position={[0, -h, -d / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={handleWallClick('floor')}
        onContextMenu={handleWallClick('floor')}
        renderOrder={0}
      >
        <primitive object={getGeometry('floor')} attach="geometry" />
        <meshStandardMaterial
          color={getWallColor(floorSettings)}
          map={floorTexture}
          side={THREE.FrontSide}
          metalness={mat.floorMetalness}
          roughness={mat.floorRoughness}
          transparent={floorSettings.opacity < 1}
          opacity={floorSettings.opacity}
        />
      </mesh>

      {/* Ceiling */}
      <mesh
        position={[0, h, -d / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        onClick={handleWallClick('ceiling')}
        onContextMenu={handleWallClick('ceiling')}
        renderOrder={0}
      >
        <primitive object={getGeometry('ceiling')} attach="geometry" />
        <meshStandardMaterial
          color={getWallColor(ceilingSettings)}
          map={ceilingTexture}
          side={THREE.FrontSide}
          metalness={mat.ceilingMetalness}
          roughness={mat.ceilingRoughness}
          transparent={ceilingSettings.opacity < 1}
          opacity={ceilingSettings.opacity}
        />
      </mesh>

      {/* Edge trim strips */}
      <mesh position={[-w + 0.05, -h + 0.05, -d / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <primitive object={getGeometry('trim')} attach="geometry" />
        <meshBasicMaterial color={lc.accentColor} transparent opacity={mat.trimOpacity} />
      </mesh>
      <mesh position={[w - 0.05, -h + 0.05, -d / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <primitive object={getGeometry('trim')} attach="geometry" />
        <meshBasicMaterial color={lc.accentColor} transparent opacity={mat.trimOpacity} />
      </mesh>

      {/* Neural pulse overlay — shared material, one per surface, 0.01m inward */}
      {pulseMaterial && (
        <>
          <mesh position={[-w + 0.01, 0, -d / 2]} rotation={[0, Math.PI / 2, 0]} renderOrder={1} material={pulseMaterial}>
            <primitive object={getGeometry('wall')} attach="geometry" />
          </mesh>
          <mesh position={[w - 0.01, 0, -d / 2]} rotation={[0, -Math.PI / 2, 0]} renderOrder={1} material={pulseMaterial}>
            <primitive object={getGeometry('wall')} attach="geometry" />
          </mesh>
          <mesh position={[0, -h + 0.01, -d / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} material={pulseMaterial}>
            <primitive object={getGeometry('floor')} attach="geometry" />
          </mesh>
          <mesh position={[0, h - 0.01, -d / 2]} rotation={[Math.PI / 2, 0, 0]} renderOrder={1} material={pulseMaterial}>
            <primitive object={getGeometry('ceiling')} attach="geometry" />
          </mesh>
        </>
      )}
    </group>
  );
});

// Camera controller with multiple navigation modes.
// Supports both flat (legacy) and spline-following modes.
const CameraController: React.FC<{
  scrollZ: number;
  lookRotation: { yaw: number; pitch: number };
  fov: number;
  navigationMode: NavigationMode;
  decoratingState: { wall: WallSide; zPosition: number; cameraOffset: number } | null;
  tunnelPath?: TunnelPath | null;
  currentT?: number;
}> = ({ scrollZ, lookRotation, fov, navigationMode, decoratingState, tunnelPath, currentT }) => {
  const { camera } = useThree();
  const currentRotation = useRef({ yaw: 0, pitch: 0 });
  const currentPosition = useRef({ x: 0, y: 0, z: 0 });
  const currentLookAt = useRef({ x: 0, y: 0, z: -10 });
  const currentFov = useRef(75);

  useFrame(() => {
    const lerpFactor = 0.08;

    if (navigationMode === 'normal') {
      // Lerp FOV
      const fovDelta = fov - currentFov.current;
      if (Math.abs(fovDelta) > 0.01) {
        currentFov.current += fovDelta * 0.1;
        (camera as THREE.PerspectiveCamera).fov = currentFov.current;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      }

      // Lerp rotation toward target
      currentRotation.current.yaw += (lookRotation.yaw - currentRotation.current.yaw) * 0.1;
      currentRotation.current.pitch += (lookRotation.pitch - currentRotation.current.pitch) * 0.1;

      if (tunnelPath && currentT !== undefined && !tunnelPath.isStraight()) {
        // --- Curved path: derive position and orientation from spline ---
        const frame = tunnelPath.getFrame(currentT);
        const targetPos = frame.position;

        currentPosition.current.x += (targetPos.x - currentPosition.current.x) * lerpFactor;
        currentPosition.current.y += (targetPos.y - currentPosition.current.y) * lerpFactor;
        currentPosition.current.z += (targetPos.z - currentPosition.current.z) * lerpFactor;

        // Look direction = tangent + yaw/pitch offset relative to frame
        const yaw = currentRotation.current.yaw;
        const pitch = currentRotation.current.pitch;

        // Base look target is 10m ahead along tangent from the TARGET position
        const lookAhead = new THREE.Vector3()
          .copy(targetPos)
          .addScaledVector(frame.tangent, 10)
          .addScaledVector(frame.binormal, Math.sin(yaw) * 10)
          .addScaledVector(frame.normal, Math.sin(pitch) * 5);

        currentLookAt.current.x += (lookAhead.x - currentLookAt.current.x) * lerpFactor;
        currentLookAt.current.y += (lookAhead.y - currentLookAt.current.y) * lerpFactor;
        currentLookAt.current.z += (lookAhead.z - currentLookAt.current.z) * lerpFactor;
      } else {
        // --- Straight path (legacy): standard tunnel navigation ---
        const targetZ = -scrollZ;
        currentPosition.current.z += (targetZ - currentPosition.current.z) * lerpFactor;
        currentPosition.current.y += (0 - currentPosition.current.y) * lerpFactor;
        currentPosition.current.x += (0 - currentPosition.current.x) * lerpFactor;

        // Calculate lookAt based on TARGET position, not current position
        const lookAtZ = targetZ - 10;
        const lookAtX = Math.sin(currentRotation.current.yaw) * 10;
        const lookAtY = Math.sin(currentRotation.current.pitch) * 5;

        currentLookAt.current.x += (lookAtX - currentLookAt.current.x) * lerpFactor;
        currentLookAt.current.y += (lookAtY - currentLookAt.current.y) * lerpFactor;
        currentLookAt.current.z += (lookAtZ - currentLookAt.current.z) * lerpFactor;
      }

    } else if (navigationMode === 'decorating' && decoratingState) {
      // Decorating mode: Camera faces wall directly at 4m distance
      const w = TUNNEL_WIDTH / 2;
      const h = TUNNEL_HEIGHT / 2;
      const targetZ = -decoratingState.zPosition;

      let targetX = 0;
      let targetY = 0;
      let lookAtX = 0;
      let lookAtY = 0;

      switch (decoratingState.wall) {
        case 'left':
          targetX = -w + 4;
          lookAtX = -w;
          break;
        case 'right':
          targetX = w - 4;
          lookAtX = w;
          break;
        case 'floor':
          targetY = -h + 4;
          lookAtY = -h;
          break;
        case 'ceiling':
          targetY = h - 4;
          lookAtY = h;
          break;
      }

      currentPosition.current.x += (targetX - currentPosition.current.x) * lerpFactor;
      currentPosition.current.y += (targetY - currentPosition.current.y) * lerpFactor;
      currentPosition.current.z += (targetZ - currentPosition.current.z) * lerpFactor;

      currentLookAt.current.x += (lookAtX - currentLookAt.current.x) * lerpFactor;
      currentLookAt.current.y += (lookAtY - currentLookAt.current.y) * lerpFactor;
      currentLookAt.current.z += (targetZ - currentLookAt.current.z) * lerpFactor;

    } else if (navigationMode === 'canvas') {
      // Canvas mode: Camera handled separately or frozen
    }

    // Apply camera position and look-at
    camera.position.set(
      currentPosition.current.x,
      currentPosition.current.y,
      currentPosition.current.z
    );
    camera.lookAt(
      currentLookAt.current.x,
      currentLookAt.current.y,
      currentLookAt.current.z
    );
  });

  return null;
};

// Infinite tunnel manager with improved recycling.
// Supports both flat (legacy straight) and curved path rendering.
const InfiniteTunnel: React.FC<{
  cameraZ: number;
  scrollVelocity: number;
  onWallClick?: (position: { x: number; y: number; z: number }, event: ThreeEvent<MouseEvent>, wall: WallSide) => void;
  wallSettings: SceneSettings['walls'];
  wallSections: WallSection[];
  onWallHover?: (hover: { wall: WallSide; sectionId: string } | null) => void;
  hoveredSectionId?: string | null;
  settings?: SceneSettings;
  tunnelPath?: TunnelPath | null;
  currentEdgeId?: string;
  currentT?: number;
  tunnelTopology?: TunnelTopology;
}> = ({ cameraZ, scrollVelocity, onWallClick, wallSettings, wallSections, onWallHover, hoveredSectionId, settings, tunnelPath, currentEdgeId, currentT, tunnelTopology }) => {
  const segmentsRef = useRef<THREE.Group>(null);
  const isCurved = tunnelPath != null && !tunnelPath.isStraight();

  // Compute Z exclusion zones for intersection chambers (flat path only)
  const chamberExclusions = useMemo(() => {
    if (isCurved || !tunnelTopology) return [];
    const DEFAULT_CHAMBER_RADIUS = 1.5;
    return tunnelTopology.nodes
      .filter(node => isIntersection(tunnelTopology, node.id))
      .map(node => {
        const chamberHalfW = (TUNNEL_WIDTH * (node.style?.chamberRadius || DEFAULT_CHAMBER_RADIUS)) / 2;
        return { zMin: node.position.z - chamberHalfW, zMax: node.position.z + chamberHalfW };
      });
  }, [isCurved, tunnelTopology]);

  // Create shared neural pulse material (ONE instance for all overlay meshes)
  const pulseMaterial = useMemo(() => {
    const veinMap = generateVeinMapTexture();
    return createNeuralPulseMaterial(veinMap);
  }, []);

  // Update pulse shader uniforms every frame (including settings-driven values)
  const pulseSettings = settings?.neuralPulse;
  useFrame(({ clock }) => {
    pulseMaterial.uniforms.uTime.value = clock.getElapsedTime();
    pulseMaterial.uniforms.uPlayerZ.value = cameraZ;
    pulseMaterial.uniforms.uScrollVelocity.value = scrollVelocity;
    // Update settings-driven uniforms
    const ps = pulseSettings || DEFAULT_NEURAL_PULSE_SETTINGS;
    pulseMaterial.uniforms.uPulseColor.value.set(ps.pulseColor);
    pulseMaterial.uniforms.uBaseGlow.value = ps.baseGlow;
    pulseMaterial.uniforms.uAmbientSpeed.value = ps.ambientSpeed;
    pulseMaterial.uniforms.uAmbientIntensity.value = ps.ambientIntensity;
    pulseMaterial.uniforms.uReactiveSpeed.value = ps.reactiveSpeed;
    pulseMaterial.uniforms.uReactiveIntensity.value = ps.reactiveIntensity;
    pulseMaterial.uniforms.uReactiveSensitivity.value = ps.reactiveSensitivity;
  });

  // --- Curved path rendering ---
  const curvedSegments = useMemo(() => {
    if (!isCurved || !tunnelPath || !currentEdgeId) return null;

    // Compute visible t-range: ~120m behind and 120m ahead of camera
    const arcLength = tunnelPath.arcLength;
    const cameraDist = tunnelPath.distanceFromT(currentT || 0);
    const drawDist = settings?.drawDistance || 120;

    const visStart = Math.max(0, cameraDist - 30); // 30m behind
    const visEnd = Math.min(arcLength, cameraDist + drawDist);

    const tStart = tunnelPath.tFromDistance(visStart);
    const tEnd = tunnelPath.tFromDistance(visEnd);

    // Divide visible range into segments
    const numSegs = Math.max(1, Math.ceil((visEnd - visStart) / SEGMENT_DEPTH));
    const segments: { tStart: number; tEnd: number; depth: number }[] = [];

    for (let i = 0; i < numSegs; i++) {
      const segTStart = tStart + (tEnd - tStart) * (i / numSegs);
      const segTEnd = tStart + (tEnd - tStart) * ((i + 1) / numSegs);
      const segDist = tunnelPath.distanceFromT(segTStart);
      segments.push({ tStart: segTStart, tEnd: segTEnd, depth: segDist });
    }

    return segments;
  }, [isCurved, tunnelPath, currentEdgeId, currentT, settings?.drawDistance]);

  // Pre-generate curved geometries
  const curvedGeometries = useMemo(() => {
    if (!curvedSegments || !tunnelPath || !currentEdgeId) return null;

    return curvedSegments.map(seg =>
      getCurvedSegmentGeometry(
        currentEdgeId,
        tunnelPath,
        seg.tStart,
        seg.tEnd,
        TUNNEL_WIDTH,
        TUNNEL_HEIGHT,
      )
    );
  }, [curvedSegments, tunnelPath, currentEdgeId]);

  // --- Flat (legacy) path ---
  // Discrete base position — only changes when crossing a SEGMENT_DEPTH boundary.
  const baseSegmentZ = Math.floor(-cameraZ / SEGMENT_DEPTH) * SEGMENT_DEPTH;

  const flatSegmentPositions = useMemo(() => {
    if (isCurved) return []; // Don't compute if curved
    return Array.from({ length: NUM_SEGMENTS }, (_, i) =>
      baseSegmentZ + (i - SEGMENT_BUFFER) * SEGMENT_DEPTH
    );
  }, [baseSegmentZ, isCurved]);

  // Update Three.js group positions directly each frame for smooth visuals (flat only).
  // Hide segments that overlap with intersection chambers.
  useFrame(() => {
    if (isCurved || !segmentsRef.current) return;
    const camZ = -cameraZ;
    const baseZ = Math.floor(camZ / SEGMENT_DEPTH) * SEGMENT_DEPTH;

    segmentsRef.current.children.forEach((segment, index) => {
      const targetZ = baseZ + (index - SEGMENT_BUFFER) * SEGMENT_DEPTH;
      segment.position.z = targetZ;

      // Hide segment if it overlaps any intersection chamber
      if (chamberExclusions.length > 0) {
        const segZMin = targetZ;
        const segZMax = targetZ + SEGMENT_DEPTH;
        const overlaps = chamberExclusions.some(
          ex => segZMin < ex.zMax && segZMax > ex.zMin
        );
        segment.visible = !overlaps;
      } else {
        segment.visible = true;
      }
    });
  });

  if (isCurved && curvedSegments && curvedGeometries) {
    return (
      <group>
        {curvedSegments.map((seg, i) => (
          <group key={`curved-${i}`}>
            <TunnelSegment
              onWallClick={onWallClick}
              wallSettings={wallSettings}
              wallSections={wallSections}
              segmentZ={-seg.depth}
              onWallHover={onWallHover}
              hoveredSectionId={hoveredSectionId}
              pulseMaterial={pulseMaterial}
              materials={settings?.materials}
              lightingColors={settings?.lightingColors}
              curvedGeometry={curvedGeometries[i]}
            />
          </group>
        ))}
      </group>
    );
  }

  return (
    <group ref={segmentsRef}>
      {flatSegmentPositions.map((pos, i) => (
        <group key={i} position={[0, 0, pos]}>
          <TunnelSegment
            onWallClick={onWallClick}
            wallSettings={wallSettings}
            wallSections={wallSections}
            segmentZ={pos}
            onWallHover={onWallHover}
            hoveredSectionId={hoveredSectionId}
            pulseMaterial={pulseMaterial}
            materials={settings?.materials}
            lightingColors={settings?.lightingColors}
          />
        </group>
      ))}
    </group>
  );
};

// Picture frame for images (poster-style) with drag functionality and radial hover menu
const PictureFrame: React.FC<{
  object: SceneObject;
  onContextMenu: (e: ThreeEvent<MouseEvent>, object: SceneObject) => void;
  onHover: (object: SceneObject | null, position?: { x: number; y: number }) => void;
}> = ({ object, onContextMenu, onHover }) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [hovered, setHovered] = useState(false);
  const [showRadial, setShowRadial] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<THREE.Vector3 | null>(null);
  const selectedObjectId = useSceneStore(s => s.selectedObjectId);
  const selectObject = useSceneStore(s => s.selectObject);
  const updateObject = useSceneStore(s => s.updateObject);
  const openHologram = useSceneStore(s => s.openHologram);
  const { camera, gl, raycaster } = useThree();
  const isSelected = selectedObjectId === object.id;
  const radialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load texture
  useEffect(() => {
    if (object.imagePath) {
      const loadTexture = async () => {
        try {
          const buffer = await window.electronAPI.readFile(object.imagePath!);
          const blob = new Blob([buffer]);
          const url = URL.createObjectURL(blob);
          const loader = new THREE.TextureLoader();
          loader.load(url, (tex) => {
            setTexture(tex);
            URL.revokeObjectURL(url);
          });
        } catch (error) {
          console.error('Failed to load image:', error);
        }
      };
      loadTexture();
    }
  }, [object.imagePath]);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 0) {
      e.stopPropagation();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!isDragging) return;

    const rect = gl.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    raycaster.setFromCamera(mouse, camera);

    const intersection = new THREE.Vector3();
    const depth = Math.abs(object.position.z);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), depth);
    raycaster.ray.intersectPlane(plane, intersection);

    if (intersection) {
      const w = TUNNEL_WIDTH / 2 - 0.5;
      const h = TUNNEL_HEIGHT / 2 - 1;
      const newPos = new THREE.Vector3(
        Math.max(-w, Math.min(w, intersection.x)),
        Math.max(-h, Math.min(h, intersection.y)),
        object.position.z
      );
      setDragPosition(newPos);
    }
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    const didMove = dragPosition !== null;

    if (isDragging) {
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

      if (didMove) {
        updateObject(object.id, {
          position: { x: dragPosition.x, y: dragPosition.y, z: dragPosition.z },
        });
        setDragPosition(null);
      }
    }

    if (e.button === 0 && !didMove) {
      selectObject(object.id);
    }
  };

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onContextMenu(e, object);
  };

  const handlePointerEnter = (e: ThreeEvent<PointerEvent>) => {
    setHovered(true);
    document.body.style.cursor = 'pointer';
    onHover(object, { x: e.clientX, y: e.clientY });
    if (radialTimerRef.current) clearTimeout(radialTimerRef.current);
    radialTimerRef.current = setTimeout(() => setShowRadial(true), 150);
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHovered(false);
      document.body.style.cursor = 'auto';
      onHover(null);
      if (radialTimerRef.current) { clearTimeout(radialTimerRef.current); radialTimerRef.current = null; }
      radialTimerRef.current = setTimeout(() => setShowRadial(false), 300);
    }
  };

  // Current position
  const currentPos = isDragging && dragPosition
    ? { x: dragPosition.x, y: dragPosition.y, z: dragPosition.z }
    : object.position;

  // Determine frame orientation based on position (wall vs floor)
  const isOnWall = Math.abs(currentPos.x) > TUNNEL_WIDTH / 2 - 2;
  const isOnFloor = currentPos.y < -TUNNEL_HEIGHT / 2 + 2;
  const isOnCeiling = currentPos.y > TUNNEL_HEIGHT / 2 - 2;

  let rotation: [number, number, number] = [0, 0, 0];
  if (currentPos.x < 0 && isOnWall) {
    rotation = [0, Math.PI / 2, 0]; // Left wall - face right
  } else if (currentPos.x > 0 && isOnWall) {
    rotation = [0, -Math.PI / 2, 0]; // Right wall - face left
  } else if (isOnFloor) {
    rotation = [-Math.PI / 2, 0, 0]; // Floor - face up
  } else if (isOnCeiling) {
    rotation = [Math.PI / 2, 0, 0]; // Ceiling - face down
  }

  const frameWidth = 2.5;
  const frameHeight = 1.8;
  const frameDepth = 0.12;
  const fontSize = object.fontSize || 18;

  return (
    <group position={[currentPos.x, currentPos.y, currentPos.z]} rotation={rotation}>
      {/* Invisible hit buffer — prevents accidental wall clicks around the frame */}
      <mesh
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <boxGeometry args={[frameWidth + 1.5, frameHeight + 1.5, 0.3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Sophisticated frame with beveled edge look */}
      <mesh
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <boxGeometry args={[frameWidth + 0.25, frameHeight + 0.25, frameDepth]} />
        <meshStandardMaterial
          color={isSelected || hovered ? PALETTE.accent : PALETTE.wallDefault}
          metalness={0.6}
          roughness={0.2}
        />
      </mesh>

      {/* Inner frame accent */}
      <mesh position={[0, 0, frameDepth / 2 - 0.02]}>
        <boxGeometry args={[frameWidth + 0.1, frameHeight + 0.1, 0.02]} />
        <meshStandardMaterial
          color={PALETTE.accent}
          emissive={PALETTE.accent}
          emissiveIntensity={isSelected || hovered ? 0.4 : 0.1}
          metalness={0.8}
          roughness={0.1}
        />
      </mesh>

      {/* Image plane */}
      <mesh position={[0, 0, frameDepth / 2 + 0.01]}>
        <planeGeometry args={[frameWidth, frameHeight]} />
        {texture ? (
          <meshStandardMaterial map={texture} roughness={0.8} metalness={0.1} />
        ) : (
          <meshStandardMaterial color="#0a0d12" roughness={0.9} metalness={0} />
        )}
      </mesh>

      {/* Label */}
      <Html
        position={[0, -frameHeight / 2 - 0.4, 0.1]}
        center
        distanceFactor={8}
        style={{
          color: 'white',
          fontSize: `${fontSize}px`,
          fontWeight: 'bold',
          textShadow: '0 0 6px black, 0 0 12px rgba(78, 205, 196, 0.3)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {object.name}
      </Html>

      {/* Radial pie hover menu */}
      {showRadial && !isDragging && (
        <Html
          position={[0, 0, frameDepth / 2 + 0.5]}
          center
          distanceFactor={15}
          style={{ pointerEvents: 'auto' }}
        >
          <div
            className="radial-menu"
            onMouseEnter={() => {
              if (radialTimerRef.current) { clearTimeout(radialTimerRef.current); radialTimerRef.current = null; }
              setShowRadial(true);
            }}
            onMouseLeave={() => {
              setShowRadial(false);
              setHovered(false);
              document.body.style.cursor = 'auto';
              onHover(null);
            }}
          >
            {/* Top wedge: Play / Project media (green) */}
            <button
              className="radial-wedge radial-wedge-top"
              title="Project Media"
              onClick={(e) => {
                e.stopPropagation();
                if (object.directoryPath) { openHologram(object.id); }
                setShowRadial(false);
              }}
            >
              <span className="radial-wedge-icon radial-icon-top">&#9654;</span>
            </button>

            {/* Bottom-right wedge: Open in Explorer (gold) */}
            <button
              className="radial-wedge radial-wedge-br"
              title="Open in Explorer"
              onClick={(e) => {
                e.stopPropagation();
                if (object.directoryPath) { window.electronAPI.openDirectory(object.directoryPath); }
                setShowRadial(false);
              }}
            >
              <span className="radial-wedge-icon radial-icon-br">&#128193;</span>
            </button>

            {/* Bottom-left wedge: +More (gray) */}
            <button
              className="radial-wedge radial-wedge-bl"
              title="More Options"
              onClick={(e) => {
                e.stopPropagation();
                setShowRadial(false);
                const rect = gl.domElement.getBoundingClientRect();
                const fakeEvent = {
                  stopPropagation: () => {},
                  nativeEvent: { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
                  clientX: rect.left + rect.width / 2,
                  clientY: rect.top + rect.height / 2,
                } as unknown as ThreeEvent<MouseEvent>;
                onContextMenu(fakeEvent, object);
              }}
            >
              <span className="radial-wedge-icon radial-icon-bl">+More</span>
            </button>

            {/* Center hole overlay */}
            <div className="radial-center" />
          </div>
        </Html>
      )}
    </group>
  );
};

// 3D Object (cube, sphere, etc.) with drag functionality and radial hover menu
const Object3D: React.FC<{
  object: SceneObject;
  onContextMenu: (e: ThreeEvent<MouseEvent>, object: SceneObject) => void;
  onHover: (object: SceneObject | null, position?: { x: number; y: number }) => void;
}> = ({ object, onContextMenu, onHover }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [showRadial, setShowRadial] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<THREE.Vector3 | null>(null);
  const selectedObjectId = useSceneStore(s => s.selectedObjectId);
  const selectObject = useSceneStore(s => s.selectObject);
  const updateObject = useSceneStore(s => s.updateObject);
  const openHologram = useSceneStore(s => s.openHologram);
  const { camera, gl, raycaster } = useThree();
  const isSelected = selectedObjectId === object.id;
  const radialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastContextMenuEvent = useRef<ThreeEvent<MouseEvent> | null>(null);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 0) {
      e.stopPropagation();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!isDragging) return;

    const rect = gl.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    raycaster.setFromCamera(mouse, camera);

    const intersection = new THREE.Vector3();
    const depth = Math.abs(object.position.z);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), depth);
    raycaster.ray.intersectPlane(plane, intersection);

    if (intersection) {
      const w = TUNNEL_WIDTH / 2 - 1;
      const h = TUNNEL_HEIGHT / 2 - 1;
      const newPos = new THREE.Vector3(
        Math.max(-w, Math.min(w, intersection.x)),
        Math.max(-h, Math.min(h, intersection.y)),
        object.position.z
      );
      setDragPosition(newPos);
    }
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    const didMove = dragPosition !== null;

    if (isDragging) {
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

      if (didMove) {
        updateObject(object.id, {
          position: { x: dragPosition.x, y: dragPosition.y, z: dragPosition.z },
        });
        setDragPosition(null);
      }
    }

    if (e.button === 0 && !didMove) {
      selectObject(object.id);
    }
  };

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    lastContextMenuEvent.current = e;
    onContextMenu(e, object);
  };

  const handlePointerEnter = (e: ThreeEvent<PointerEvent>) => {
    setHovered(true);
    document.body.style.cursor = 'pointer';
    onHover(object, { x: e.clientX, y: e.clientY });
    // Show radial menu after brief delay to avoid flicker
    if (radialTimerRef.current) clearTimeout(radialTimerRef.current);
    radialTimerRef.current = setTimeout(() => setShowRadial(true), 150);
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHovered(false);
      document.body.style.cursor = 'auto';
      onHover(null);
      if (radialTimerRef.current) { clearTimeout(radialTimerRef.current); radialTimerRef.current = null; }
      // Small delay to let user move mouse to radial menu
      radialTimerRef.current = setTimeout(() => setShowRadial(false), 300);
    }
  };

  useFrame(() => {
    if (meshRef.current && (isSelected || hovered) && !isDragging) {
      meshRef.current.rotation.y += 0.01;
    }
  });

  const renderGeometry = () => {
    switch (object.type) {
      case 'cube': return <boxGeometry args={[1.2, 1.2, 1.2]} />;
      case 'sphere': return <sphereGeometry args={[0.7, 32, 32]} />;
      case 'cylinder': return <cylinderGeometry args={[0.5, 0.5, 1.2, 32]} />;
      case 'cone': return <coneGeometry args={[0.6, 1.2, 32]} />;
      case 'torus': return <torusGeometry args={[0.5, 0.2, 16, 32]} />;
      default: return <boxGeometry args={[1.2, 1.2, 1.2]} />;
    }
  };

  const currentPos = isDragging && dragPosition
    ? { x: dragPosition.x, y: dragPosition.y, z: dragPosition.z }
    : object.position;

  const isOnWall = Math.abs(currentPos.x) > TUNNEL_WIDTH / 2 - 2;
  const isOnFloor = currentPos.y < -TUNNEL_HEIGHT / 2 + 2;

  let offsetPos = { ...currentPos };
  if (isOnWall) {
    offsetPos.x = currentPos.x > 0 ? currentPos.x - 0.8 : currentPos.x + 0.8;
  }
  if (isOnFloor) {
    offsetPos.y = currentPos.y + 0.7;
  }

  const fontSize = object.fontSize || 24;
  const stopProp = (e: any) => { e.stopPropagation(); };

  return (
    <group position={[offsetPos.x, offsetPos.y, offsetPos.z]}>
      {/* Invisible hit buffer — larger than the object to prevent accidental wall clicks */}
      <mesh
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <boxGeometry args={[3, 3, 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <mesh
        ref={meshRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        {renderGeometry()}
        <meshStandardMaterial
          color={object.color}
          emissive={isSelected || hovered ? object.color : '#000000'}
          emissiveIntensity={isSelected ? 0.4 : hovered ? 0.2 : 0}
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>

      {/* Label */}
      <Html
        position={[0, 1.2, 0]}
        center
        distanceFactor={8}
        style={{
          color: 'white',
          fontSize: `${fontSize}px`,
          fontWeight: 'bold',
          textShadow: '0 0 4px black, 0 0 8px black',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {object.name}
      </Html>

      {/* Radial pie hover menu */}
      {showRadial && !isDragging && (
        <Html
          position={[0, 0, 0.8]}
          center
          distanceFactor={15}
          style={{ pointerEvents: 'auto' }}
        >
          <div
            className="radial-menu"
            onMouseEnter={() => {
              if (radialTimerRef.current) { clearTimeout(radialTimerRef.current); radialTimerRef.current = null; }
              setShowRadial(true);
            }}
            onMouseLeave={() => {
              setShowRadial(false);
              setHovered(false);
              document.body.style.cursor = 'auto';
              onHover(null);
            }}
          >
            {/* Top wedge: Play / Project media (green) */}
            <button
              className="radial-wedge radial-wedge-top"
              title="Project Media"
              onClick={(e) => {
                e.stopPropagation();
                if (object.directoryPath) { openHologram(object.id); }
                setShowRadial(false);
              }}
            >
              <span className="radial-wedge-icon radial-icon-top">&#9654;</span>
            </button>

            {/* Bottom-right wedge: Open in Explorer (gold) */}
            <button
              className="radial-wedge radial-wedge-br"
              title="Open in Explorer"
              onClick={(e) => {
                e.stopPropagation();
                if (object.directoryPath) { window.electronAPI.openDirectory(object.directoryPath); }
                setShowRadial(false);
              }}
            >
              <span className="radial-wedge-icon radial-icon-br">&#128193;</span>
            </button>

            {/* Bottom-left wedge: +More (gray) */}
            <button
              className="radial-wedge radial-wedge-bl"
              title="More Options"
              onClick={(e) => {
                e.stopPropagation();
                setShowRadial(false);
                const rect = gl.domElement.getBoundingClientRect();
                const fakeEvent = {
                  stopPropagation: () => {},
                  nativeEvent: { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
                  clientX: rect.left + rect.width / 2,
                  clientY: rect.top + rect.height / 2,
                } as unknown as ThreeEvent<MouseEvent>;
                onContextMenu(fakeEvent, object);
              }}
            >
              <span className="radial-wedge-icon radial-icon-bl">+More</span>
            </button>

            {/* Center hole overlay */}
            <div className="radial-center" />
          </div>
        </Html>
      )}
    </group>
  );
};

// Pending wallpaper preview with confirm/cancel buttons
const PendingWallpaperPreview: React.FC<{
  wallpaperPath: string;
  wall: WallSide;
  scrollZ: number;
  onConfirm: (zPosition: number) => void;
  onCancel: () => void;
}> = ({ wallpaperPath, wall, scrollZ, onConfirm, onCancel }) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  useEffect(() => {
    const loadTexture = async () => {
      try {
        const buffer = await window.electronAPI.readFile(wallpaperPath);
        const blob = new Blob([buffer]);
        const url = URL.createObjectURL(blob);

        const img = new Image();
        img.onload = () => {
          setAspectRatio(img.width / img.height);
          URL.revokeObjectURL(url);
        };
        img.src = url;

        const loader = new THREE.TextureLoader();
        const newUrl = URL.createObjectURL(blob);
        loader.load(newUrl, (tex) => {
          setTexture(tex);
        });
      } catch (error) {
        console.error('Failed to load wallpaper:', error);
      }
    };
    loadTexture();
  }, [wallpaperPath]);

  if (!texture) return null;

  const w = TUNNEL_WIDTH / 2;
  const h = TUNNEL_HEIGHT / 2;

  const maxWidth = wall === 'floor' || wall === 'ceiling' ? TUNNEL_WIDTH - 2 : SEGMENT_DEPTH * 3;
  const maxHeight = wall === 'floor' || wall === 'ceiling' ? SEGMENT_DEPTH * 3 : TUNNEL_HEIGHT - 2;

  let displayWidth = maxWidth;
  let displayHeight = displayWidth / aspectRatio;
  if (displayHeight > maxHeight) {
    displayHeight = maxHeight;
    displayWidth = displayHeight * aspectRatio;
  }

  const baseZ = -scrollZ - 20;
  let position: [number, number, number];
  let rotation: [number, number, number];

  switch (wall) {
    case 'left':
      position = [-w + 0.1, 0, baseZ];
      rotation = [0, Math.PI / 2, 0];
      break;
    case 'right':
      position = [w - 0.1, 0, baseZ];
      rotation = [0, -Math.PI / 2, 0];
      break;
    case 'floor':
      position = [0, -h + 0.1, baseZ];
      rotation = [-Math.PI / 2, 0, 0];
      break;
    case 'ceiling':
      position = [0, h - 0.1, baseZ];
      rotation = [Math.PI / 2, 0, 0];
      break;
  }

  const handleConfirm = () => {
    onConfirm(scrollZ + 20); // Store the actual Z position (positive depth value)
  };

  return (
    <group position={position} rotation={rotation}>
      {/* Image plane */}
      <mesh>
        <planeGeometry args={[displayWidth, displayHeight]} />
        <meshStandardMaterial map={texture} side={THREE.DoubleSide} roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Glowing border to indicate preview mode */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[displayWidth + 0.2, displayHeight + 0.2]} />
        <meshBasicMaterial color={PALETTE.accent} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>

      {/* Confirm button (checkmark) - bottom right */}
      <Html
        position={[displayWidth / 2 - 0.3, -displayHeight / 2 + 0.3, 0.1]}
        center
        distanceFactor={6}
        style={{ pointerEvents: 'auto' }}
      >
        <button
          onClick={handleConfirm}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: PALETTE.accent,
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
          title="Confirm placement"
        >
          ✓
        </button>
      </Html>

      {/* Cancel button (X) - bottom left */}
      <Html
        position={[-displayWidth / 2 + 0.3, -displayHeight / 2 + 0.3, 0.1]}
        center
        distanceFactor={6}
        style={{ pointerEvents: 'auto' }}
      >
        <button
          onClick={onCancel}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: PALETTE.secondary,
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
          title="Cancel"
        >
          ✕
        </button>
      </Html>

      {/* Instructions label */}
      <Html
        position={[0, displayHeight / 2 + 0.5, 0.1]}
        center
        distanceFactor={6}
      >
        <div style={{
          color: 'white',
          fontSize: '14px',
          textShadow: '0 0 4px black, 0 0 8px black',
          whiteSpace: 'nowrap',
          padding: '4px 8px',
          backgroundColor: 'rgba(0,0,0,0.5)',
          borderRadius: '4px',
        }}>
          Scroll to position, then click ✓ to place
        </div>
      </Html>
    </group>
  );
};

// Fixed placed wall image component
const FRAME_BORDER = 0.15; // Frame border width in meters
const FRAME_DEPTH = 0.24; // How far the frame protrudes from the wall
const FRAME_COLOR = '#1a1a1a'; // Dark frame color
const FRAME_INNER_COLOR = '#0d0d0d'; // Inner lip / mat color

const PlacedWallImage: React.FC<{
  wallImage: WallImage;
}> = ({ wallImage }) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  useEffect(() => {
    const loadTexture = async () => {
      try {
        const buffer = await window.electronAPI.readFile(wallImage.imagePath);
        const blob = new Blob([buffer]);
        const url = URL.createObjectURL(blob);

        const img = new Image();
        img.onload = () => {
          setAspectRatio(img.width / img.height);
          URL.revokeObjectURL(url);
        };
        img.src = url;

        const loader = new THREE.TextureLoader();
        const newUrl = URL.createObjectURL(blob);
        loader.load(newUrl, (tex) => {
          setTexture(tex);
        });
      } catch (error) {
        console.error('Failed to load wall image:', error);
      }
    };
    loadTexture();
  }, [wallImage.imagePath]);

  if (!texture) return null;

  const w = TUNNEL_WIDTH / 2;
  const h = TUNNEL_HEIGHT / 2;
  const wall = wallImage.wall;

  const maxWidth = wall === 'floor' || wall === 'ceiling' ? TUNNEL_WIDTH - 2 : SEGMENT_DEPTH * 3;
  const maxHeight = wall === 'floor' || wall === 'ceiling' ? SEGMENT_DEPTH * 3 : TUNNEL_HEIGHT - 2;

  let displayWidth = maxWidth;
  let displayHeight = displayWidth / aspectRatio;
  if (displayHeight > maxHeight) {
    displayHeight = maxHeight;
    displayWidth = displayHeight * aspectRatio;
  }

  const baseZ = -wallImage.zPosition; // Convert stored positive depth to negative Z
  // Protrude from wall: offset is wall-normal direction
  const protrusion = FRAME_DEPTH / 2 + 0.02; // half-depth + small gap from wall
  let position: [number, number, number];
  let rotation: [number, number, number];

  switch (wall) {
    case 'left':
      position = [-w + protrusion, 0, baseZ];
      rotation = [0, Math.PI / 2, 0];
      break;
    case 'right':
      position = [w - protrusion, 0, baseZ];
      rotation = [0, -Math.PI / 2, 0];
      break;
    case 'floor':
      position = [0, -h + protrusion, baseZ];
      rotation = [-Math.PI / 2, 0, 0];
      break;
    case 'ceiling':
      position = [0, h - protrusion, baseZ];
      rotation = [Math.PI / 2, 0, 0];
      break;
  }

  const outerW = displayWidth + FRAME_BORDER * 2;
  const outerH = displayHeight + FRAME_BORDER * 2;

  return (
    <group position={position} rotation={rotation}>
      {/* Frame body — a box behind the image */}
      <mesh position={[0, 0, -FRAME_DEPTH / 2]}>
        <boxGeometry args={[outerW, outerH, FRAME_DEPTH]} />
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.4} metalness={0.3} />
      </mesh>

      {/* Inner mat / recess — slightly recessed dark plane behind the image */}
      <mesh position={[0, 0, -0.005]}>
        <planeGeometry args={[displayWidth + 0.04, displayHeight + 0.04]} />
        <meshStandardMaterial color={FRAME_INNER_COLOR} roughness={0.9} metalness={0.0} />
      </mesh>

      {/* Image surface — sits flush on front of frame */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[displayWidth, displayHeight]} />
        <meshStandardMaterial map={texture} roughness={0.8} metalness={0.1} />
      </mesh>
    </group>
  );
};

// Portal frame marker — clickable glowing arch at a portal exit
const PortalMarker: React.FC<{
  portal: PortalInfo;
  nodeId: string;
  accentColor: string;
}> = ({ portal, nodeId, accentColor }) => {
  const [hovered, setHovered] = useState(false);
  const navigateToEdge = useSceneStore(s => s.navigateToEdge);

  // Compute rotation to face the portal direction
  const rotation = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), portal.direction);
    const euler = new THREE.Euler().setFromQuaternion(q);
    return euler;
  }, [portal.direction]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    navigateToEdge(portal.edgeId, nodeId);
  }, [navigateToEdge, portal.edgeId, nodeId]);

  const frameW = portal.width * 0.8;
  const frameH = portal.height * 0.8;
  const thickness = 0.3;

  return (
    <group
      position={portal.position}
      rotation={rotation}
      onClick={handleClick}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = ''; }}
    >
      {/* Glowing portal frame — 4 edges forming a rectangle */}
      {/* Top bar */}
      <mesh position={[0, frameH / 2, 0]}>
        <boxGeometry args={[frameW + thickness, thickness, thickness]} />
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={hovered ? 3 : 1.2}
          transparent
          opacity={hovered ? 1 : 0.8}
        />
      </mesh>
      {/* Bottom bar */}
      <mesh position={[0, -frameH / 2, 0]}>
        <boxGeometry args={[frameW + thickness, thickness, thickness]} />
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={hovered ? 3 : 1.2}
          transparent
          opacity={hovered ? 1 : 0.8}
        />
      </mesh>
      {/* Left bar */}
      <mesh position={[-frameW / 2, 0, 0]}>
        <boxGeometry args={[thickness, frameH, thickness]} />
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={hovered ? 3 : 1.2}
          transparent
          opacity={hovered ? 1 : 0.8}
        />
      </mesh>
      {/* Right bar */}
      <mesh position={[frameW / 2, 0, 0]}>
        <boxGeometry args={[thickness, frameH, thickness]} />
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={hovered ? 3 : 1.2}
          transparent
          opacity={hovered ? 1 : 0.8}
        />
      </mesh>
      {/* Glow light at portal */}
      <pointLight
        color={accentColor}
        intensity={hovered ? 2 : 0.8}
        distance={15}
      />
    </group>
  );
};

// Renders intersection chamber geometry at nodes with 3+ edges
const IntersectionChamberMesh: React.FC<{
  tunnelTopology: TunnelTopology;
  materials?: MaterialSettings;
  lightingColors?: LightingColors;
}> = React.memo(({ tunnelTopology, materials, lightingColors }) => {
  const mat = materials || DEFAULT_MATERIAL_SETTINGS;
  const lc = lightingColors || DEFAULT_LIGHTING_COLORS;

  const chambers = useMemo(() => {
    const result: { nodeId: string; geometry: IntersectionGeometry; portals: PortalInfo[]; center: THREE.Vector3 }[] = [];

    for (const node of tunnelTopology.nodes) {
      if (!isIntersection(tunnelTopology, node.id)) continue;

      const edges = getEdgesAtNode(tunnelTopology, node.id);
      const { geometry, portals } = generateIntersectionChamber(
        node,
        edges,
        TUNNEL_WIDTH,
        TUNNEL_HEIGHT,
      );
      result.push({
        nodeId: node.id,
        geometry,
        portals,
        center: new THREE.Vector3(node.position.x, node.position.y, node.position.z),
      });
    }

    return result;
  }, [tunnelTopology]);

  if (chambers.length === 0) return null;

  return (
    <group>
      {chambers.map(({ nodeId, geometry, portals, center }) => (
        <group key={nodeId}>
          {/* Chamber ambient light */}
          <pointLight
            position={[center.x, center.y + 3, center.z]}
            color={lc.ambientLightColor}
            intensity={1.5}
            distance={30}
          />
          {/* Chamber floor */}
          <mesh>
            <primitive object={geometry.floor} attach="geometry" />
            <meshStandardMaterial
              color="#1a0f05"
              metalness={mat.floorMetalness}
              roughness={mat.floorRoughness}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Chamber ceiling */}
          <mesh>
            <primitive object={geometry.ceiling} attach="geometry" />
            <meshStandardMaterial
              color="#1a0f05"
              metalness={mat.ceilingMetalness}
              roughness={mat.ceilingRoughness}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Chamber walls */}
          <mesh>
            <primitive object={geometry.walls} attach="geometry" />
            <meshStandardMaterial
              color="#2a1a0a"
              metalness={mat.wallMetalness}
              roughness={mat.wallRoughness}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Chamber wireframe */}
          <lineSegments>
            <primitive object={geometry.wireframe} attach="geometry" />
            <lineBasicMaterial
              color={lc.accentColor}
              transparent
              opacity={mat.wireframeOpacity}
              depthWrite={false}
            />
          </lineSegments>
          {/* Portal markers — clickable glowing frames at each exit */}
          {portals.map(portal => (
            <PortalMarker
              key={portal.edgeId}
              portal={portal}
              nodeId={nodeId}
              accentColor={lc.accentColor}
            />
          ))}
        </group>
      ))}
    </group>
  );
});

// Scene content
const SceneContent: React.FC<SceneProps & {
  scrollZ: number;
  lookRotation: { yaw: number; pitch: number };
  fov: number;
  navigationMode: NavigationMode;
  decoratingState: { wall: WallSide; zPosition: number; cameraOffset: number } | null;
}> = ({ onContextMenu, onSignContextMenu, onLightContextMenu, onDateMarkerContextMenu, onHover, onWallClick, onConfirmWallpaper, onCancelWallpaper, scrollZ, lookRotation, fov, navigationMode, decoratingState }) => {
  const { objects, signs, lights, wallImages, wallSections, canvasItems, dateMarkers, pendingWallpaper, settings, generateSignsUpToDepth, generateLightsUpToDepth, generateSectionsUpToDepth, decoratingBrushSettings, addStrokeToDrawing, hoveredWallSection, setHoveredWallSection, tunnelTopology, currentEdgeId, currentT, activeHologram, closeHologram, hologramNext, hologramPrev, hologramSetPlaying } = useSceneStore(useShallow(s => ({
    objects: s.objects,
    signs: s.signs,
    lights: s.lights,
    wallImages: s.wallImages,
    wallSections: s.wallSections,
    canvasItems: s.canvasItems,
    dateMarkers: s.dateMarkers,
    pendingWallpaper: s.pendingWallpaper,
    settings: s.settings,
    generateSignsUpToDepth: s.generateSignsUpToDepth,
    generateLightsUpToDepth: s.generateLightsUpToDepth,
    generateSectionsUpToDepth: s.generateSectionsUpToDepth,
    decoratingBrushSettings: s.decoratingBrushSettings,
    addStrokeToDrawing: s.addStrokeToDrawing,
    hoveredWallSection: s.hoveredWallSection,
    setHoveredWallSection: s.setHoveredWallSection,
    tunnelTopology: s.tunnelTopology,
    currentEdgeId: s.currentEdgeId,
    currentT: s.currentT,
    activeHologram: s.activeHologram,
    closeHologram: s.closeHologram,
    hologramNext: s.hologramNext,
    hologramPrev: s.hologramPrev,
    hologramSetPlaying: s.hologramSetPlaying,
  })));

  // Get drawings that have strokes
  const drawingsWithStrokes = useMemo(() => {
    return canvasItems.filter(
      (item): item is CanvasDrawingItem =>
        item.type === 'drawing' && item.strokes && item.strokes.length > 0
    );
  }, [canvasItems]);

  // Get section for a drawing
  const getSectionForDrawing = useCallback((drawing: CanvasDrawingItem): WallSection | undefined => {
    return wallSections.find((s) => s.id === drawing.sectionId);
  }, [wallSections]);

  // Track scroll velocity for reactive neural pulse
  const prevScrollZRef = useRef(scrollZ);
  const scrollVelocityRef = useRef(0);
  useFrame((_, dt) => {
    const delta = Math.abs(scrollZ - prevScrollZRef.current);
    prevScrollZRef.current = scrollZ;
    // Smooth velocity: blend new measurement with decay
    scrollVelocityRef.current = scrollVelocityRef.current * 0.95 + (delta / Math.max(dt, 0.001)) * 0.05;
  });

  // Generate signs, lights, and sections as we scroll deeper
  useEffect(() => {
    generateSignsUpToDepth(scrollZ);
    generateLightsUpToDepth(scrollZ);
    generateSectionsUpToDepth(scrollZ);
  }, [scrollZ, generateSignsUpToDepth, generateLightsUpToDepth, generateSectionsUpToDepth]);

  // Resolve current tunnel path from topology
  const tunnelPath = useMemo(() => {
    if (!currentEdgeId || !tunnelTopology) return null;
    const edge = getEdge(tunnelTopology, currentEdgeId);
    if (!edge) return null;
    return getPathForEdge(edge);
  }, [currentEdgeId, tunnelTopology]);

  // Resolve atmosphere and lighting colors with defaults
  const atmo = settings.atmosphere || DEFAULT_ATMOSPHERE_SETTINGS;
  const lColors = settings.lightingColors || DEFAULT_LIGHTING_COLORS;

  // Calculate fog based on settings
  // Fog starts further away and extends further - roughly 2x previous visibility
  const fogNear = 20 * (1 - settings.haziness * 0.3);
  const fogFar = settings.drawDistance * 1.5 * (1 - settings.haziness * 0.2);

  return (
    <>
      <color attach="background" args={[atmo.backgroundColor]} key={atmo.backgroundColor} />
      <fog attach="fog" args={[atmo.fogColor, fogNear, fogFar]} color={atmo.fogColor} near={fogNear} far={fogFar} />

      {/* Ambient light controlled by settings */}
      <ambientLight intensity={settings.envBrightness} color={lColors.ambientLightColor} />

      {/* Warm accent lights for atmosphere */}
      <pointLight position={[0, 0, -scrollZ - 10]} intensity={0.4 * settings.lightBrightness} distance={40} color={lColors.accentColor} />
      <pointLight position={[0, 0, -scrollZ - 40]} intensity={0.2 * settings.lightBrightness} distance={35} color={lColors.secondaryColor} />

      <CameraController
        scrollZ={scrollZ}
        lookRotation={lookRotation}
        fov={fov}
        navigationMode={navigationMode}
        decoratingState={decoratingState}
        tunnelPath={tunnelPath}
        currentT={currentT}
      />

      <InfiniteTunnel
        cameraZ={scrollZ}
        scrollVelocity={scrollVelocityRef.current}
        onWallClick={onWallClick}
        wallSettings={settings.walls}
        wallSections={wallSections}
        onWallHover={navigationMode === 'normal' ? setHoveredWallSection : undefined}
        hoveredSectionId={navigationMode === 'normal' ? hoveredWallSection?.sectionId : null}
        settings={settings}
        tunnelPath={tunnelPath}
        currentEdgeId={currentEdgeId}
        currentT={currentT}
        tunnelTopology={tunnelTopology}
      />

      {/* Intersection chambers at branch points */}
      <IntersectionChamberMesh
        tunnelTopology={tunnelTopology}
        materials={settings.materials}
        lightingColors={settings.lightingColors}
      />

      {/* Pending wallpaper preview */}
      {pendingWallpaper && onConfirmWallpaper && onCancelWallpaper && (
        <PendingWallpaperPreview
          wallpaperPath={pendingWallpaper.imagePath}
          wall={pendingWallpaper.wall}
          scrollZ={scrollZ}
          onConfirm={onConfirmWallpaper}
          onCancel={onCancelWallpaper}
        />
      )}

      {/* Placed wall images */}
      {wallImages.map((wallImage) => (
        <PlacedWallImage key={wallImage.id} wallImage={wallImage} />
      ))}

      {/* Wall drawings from canvas mode */}
      {drawingsWithStrokes.map((drawing) => {
        const section = getSectionForDrawing(drawing);
        if (!section) return null;
        return (
          <WallDrawing
            key={drawing.id}
            drawing={drawing}
            section={section}
            tunnelPath={tunnelPath}
            currentEdgeId={currentEdgeId}
          />
        );
      })}

      {/* Decorating mode drawing surface - handles live drawing input */}
      {navigationMode === 'decorating' && decoratingState && (
        <DecoratingDrawingSurface
          wall={decoratingState.wall}
          zPosition={decoratingState.zPosition}
          brushSettings={decoratingBrushSettings}
          onStrokeComplete={addStrokeToDrawing}
          canvasItems={canvasItems.filter(
            (item): item is CanvasDrawingItem => item.type === 'drawing'
          )}
          wallSections={wallSections}
          tunnelPath={tunnelPath}
          currentEdgeId={currentEdgeId}
        />
      )}

      {/* Ceiling Lights */}
      <Suspense fallback={null}>
        {lights.map((light) => (
          <CeilingLight
            key={light.id}
            light={light}
            globalBrightness={settings.lightBrightness}
            onContextMenu={onLightContextMenu}
          />
        ))}
      </Suspense>

      {/* Highway Signs */}
      <Suspense fallback={null}>
        {signs.map((sign) => (
          <HighwaySign
            key={sign.id}
            sign={sign}
            onContextMenu={onSignContextMenu}
          />
        ))}
      </Suspense>

      {/* Date Markers */}
      <Suspense fallback={null}>
        {dateMarkers.map((marker) => (
          <DateMarker
            key={marker.id}
            marker={marker}
            onContextMenu={onDateMarkerContextMenu}
          />
        ))}
      </Suspense>

      {/* Project Objects */}
      <Suspense fallback={null}>
        {objects.map((object) => (
          object.type === 'image' ? (
            <PictureFrame
              key={object.id}
              object={object}
              onContextMenu={onContextMenu}
              onHover={onHover}
            />
          ) : (
            <Object3D
              key={object.id}
              object={object}
              onContextMenu={onContextMenu}
              onHover={onHover}
            />
          )
        ))}
      </Suspense>

      {/* Hologram Projector */}
      {activeHologram && (
        <Suspense fallback={null}>
          <HologramProjector
            objectId={activeHologram.objectId}
            directoryPath={activeHologram.directoryPath}
            mediaFiles={activeHologram.mediaFiles}
            currentIndex={activeHologram.currentIndex}
            isPlaying={activeHologram.isPlaying}
            screenPosition={activeHologram.screenPosition}
            projectorPosition={activeHologram.projectorPosition}
            onClose={closeHologram}
            onNext={hologramNext}
            onPrev={hologramPrev}
            onSetPlaying={hologramSetPlaying}
            scrollZ={scrollZ}
          />
        </Suspense>
      )}
    </>
  );
};

export const Scene: React.FC<SceneProps> = (props) => {
  const [scrollZ, setScrollZ] = useState(0);
  const [lookRotation, setLookRotation] = useState({ yaw: 0, pitch: 0 });
  const [fov, setFov] = useState(75);
  const isLookingRef = useRef(false);
  const heldKeysRef = useRef<Set<string>>(new Set());
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lookResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { settings, navigationMode, decoratingState, exitDecoratingMode, hoveredWallSection, pendingNavigation, clearPendingNavigation, activeHologram, closeHologram } = useSceneStore(useShallow(s => ({
    settings: s.settings,
    navigationMode: s.navigationMode,
    decoratingState: s.decoratingState,
    exitDecoratingMode: s.exitDecoratingMode,
    hoveredWallSection: s.hoveredWallSection,
    pendingNavigation: s.pendingNavigation,
    clearPendingNavigation: s.clearPendingNavigation,
    activeHologram: s.activeHologram,
    closeHologram: s.closeHologram,
  })));

  // Handle pending edge navigation (teleport to new edge)
  useEffect(() => {
    if (pendingNavigation) {
      setScrollZ(pendingNavigation.scrollZ);
      setLookRotation({ yaw: 0, pitch: 0 });
      clearPendingNavigation();
    }
  }, [pendingNavigation, clearPendingNavigation]);

  // Simple passthrough for wall clicks (no sightseeing logic)
  const handleWallClick = useCallback((
    position: { x: number; y: number; z: number },
    event: ThreeEvent<MouseEvent>,
    wall: WallSide
  ) => {
    props.onWallClick?.(position, event, wall);
  }, [props.onWallClick]);

  // Scroll navigation with Ctrl+scroll for FOV zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (navigationMode === 'normal') {
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+scroll: adjust FOV
          setFov((prev) => Math.max(30, Math.min(110, prev + e.deltaY * 0.05)));
        } else {
          // Normal scroll: move forward/backward
          setScrollZ((prev) => Math.max(0, prev + e.deltaY * settings.navigationSpeed));
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [settings.navigationSpeed, navigationMode]);

  // Delta-based mouse look (right-click drag)
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (e.button === 2 && !target?.closest?.('.context-menu')) {
        if (target.tagName === 'CANVAS' && navigationMode === 'normal') {
          isLookingRef.current = true;
          // Cancel any pending reset
          if (lookResetTimerRef.current) {
            clearTimeout(lookResetTimerRef.current);
            lookResetTimerRef.current = null;
          }
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2 && isLookingRef.current) {
        isLookingRef.current = false;
        // Schedule smooth return to center after 200ms
        lookResetTimerRef.current = setTimeout(() => {
          setLookRotation({ yaw: 0, pitch: 0 });
          lookResetTimerRef.current = null;
        }, 200);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isLookingRef.current) {
        setLookRotation((prev) => ({
          yaw: Math.max(-1.25, Math.min(1.25, prev.yaw + e.movementX * 0.003)),
          pitch: Math.max(-0.4, Math.min(0.4, prev.pitch - e.movementY * 0.002)),
        }));
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      if (lookResetTimerRef.current) {
        clearTimeout(lookResetTimerRef.current);
      }
    };
  }, [navigationMode]);

  // WASD navigation + spacebar exit decorating + ESC exit
  useEffect(() => {
    const isInputElement = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.hasAttribute('contenteditable');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputElement(e.target)) return;

      // ESC to close hologram first, then exit decorating mode
      if (e.key === 'Escape' && activeHologram) {
        closeHologram();
        return;
      }

      // ESC to exit decorating mode
      if (e.key === 'Escape' && navigationMode === 'decorating') {
        exitDecoratingMode();
        return;
      }

      // Spacebar to exit decorating mode
      if (e.key === ' ' && navigationMode === 'decorating') {
        e.preventDefault();
        exitDecoratingMode();
        return;
      }

      // WASD only in normal mode
      if (navigationMode === 'normal') {
        const key = e.key.toLowerCase();
        if (['w', 'a', 's', 'd'].includes(key)) {
          heldKeysRef.current.add(key);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      heldKeysRef.current.delete(key);

      // When A or D released (and not right-click looking), schedule yaw reset
      if ((key === 'a' || key === 'd') && !isLookingRef.current && navigationMode === 'normal') {
        if (lookResetTimerRef.current) {
          clearTimeout(lookResetTimerRef.current);
        }
        lookResetTimerRef.current = setTimeout(() => {
          setLookRotation((prev) => ({ ...prev, yaw: 0 }));
          lookResetTimerRef.current = null;
        }, 200);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [navigationMode, exitDecoratingMode, activeHologram, closeHologram]);

  // WASD animation loop
  useEffect(() => {
    if (navigationMode !== 'normal') {
      // Clear held keys when leaving normal mode
      heldKeysRef.current.clear();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const tick = (timestamp: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp;
      }
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05); // cap at 50ms
      lastTimeRef.current = timestamp;

      const keys = heldKeysRef.current;
      if (keys.size > 0) {
        const speed = settings.navigationSpeed / 0.08; // normalize so default speed ≈ 1x
        if (keys.has('w')) {
          setScrollZ((prev) => prev + 30 * dt * speed);
        }
        if (keys.has('s')) {
          setScrollZ((prev) => Math.max(0, prev - 30 * dt * speed));
        }
        if (keys.has('a')) {
          setLookRotation((prev) => ({
            ...prev,
            yaw: Math.max(-1.25, prev.yaw - 1.2 * dt),
          }));
        }
        if (keys.has('d')) {
          setLookRotation((prev) => ({
            ...prev,
            yaw: Math.min(1.25, prev.yaw + 1.2 * dt),
          }));
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    lastTimeRef.current = 0;
    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [navigationMode, settings.navigationSpeed]);

  // Notify parent of scroll changes
  useEffect(() => {
    props.onScrollChange?.(scrollZ);
  }, [scrollZ, props.onScrollChange]);

  // Prevent context menu on canvas (we handle it ourselves)
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'CANVAS') {
        e.preventDefault();
      }
    };
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  // Get mode hint text
  const getModeHint = () => {
    switch (navigationMode) {
      case 'canvas':
        return 'Canvas mode active';
      case 'decorating':
        return 'Decorating mode \u00b7 Space or ESC to exit';
      default:
        return 'WASD to move \u00b7 Right-drag to look \u00b7 Ctrl+scroll to zoom \u00b7 Click wall to interact';
    }
  };

  return (
    <div className="canvas-container" ref={containerRef} style={hoveredWallSection && navigationMode === 'normal' ? { cursor: 'pointer' } : undefined}>
      <Canvas
        camera={{
          position: [0, 0, 0],
          fov: 75,
          near: 0.5,
          far: 500,
        }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
          stencil: false,
          depth: true,
        }}
        dpr={[1, 2]}
        frameloop="always"
        flat
      >
        <SceneContent
          {...props}
          onWallClick={handleWallClick}
          scrollZ={scrollZ}
          lookRotation={lookRotation}
          fov={fov}
          navigationMode={navigationMode}
          decoratingState={decoratingState}
        />
      </Canvas>

      <div className="scroll-indicator">
        <div className="scroll-label">Depth: {Math.round(scrollZ)}m</div>
        <div className="scroll-hint">{getModeHint()}</div>
        {navigationMode !== 'normal' && (
          <div className="mode-badge">{navigationMode.toUpperCase()}</div>
        )}
      </div>
    </div>
  );
};
