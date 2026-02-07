import React, { Suspense, useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { SceneObject, HighwaySign as HighwaySignType, CeilingLight as CeilingLightType, SceneSettings, WallSettings, WallImage, WallSide, NavigationMode, Vector3 as Vec3, CanvasDrawingItem, DrawingStroke, WallSection, DateMarker as DateMarkerType } from '../../shared/types';
import { useSceneStore } from '../store/sceneStore';
import { useShallow } from 'zustand/react/shallow';
import { HighwaySign } from './objects/HighwaySign';
import { CeilingLight } from './objects/CeilingLight';
import { DateMarker } from './objects/DateMarker';
import { generateSprayParticles, renderSprayParticles, interpolateSprayPoints } from './canvas/SprayPaintBrush';

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

// Fork configuration (unused for now)
const FORK_POSITIONS = [50, 120, 200];
const FORK_ANGLE = Math.PI / 6;

// Global texture cache to prevent recreation
let cachedWallTexture: THREE.CanvasTexture | null = null;
let cachedFloorTexture: THREE.CanvasTexture | null = null;

// Create sophisticated wall texture procedurally (cached)
// Uses neutral grayscale so material color can properly tint the walls
const getWallTexture = (): THREE.CanvasTexture => {
  if (cachedWallTexture) return cachedWallTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base neutral gray gradient (allows material color to tint)
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#808080');
  gradient.addColorStop(0.5, '#909090');
  gradient.addColorStop(1, '#808080');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  // Add subtle panel lines (horizontal) - using neutral color
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 512; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Add subtle panel lines (vertical)
  for (let x = 0; x < 512; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  // Add corner accents on panels - neutral
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let x = 0; x < 512; x += 128) {
    for (let y = 0; y < 512; y += 64) {
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + 16, y + 4);
      ctx.lineTo(x + 4, y + 12);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Use deterministic noise pattern (no random)
  const imageData = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = ((i * 7) % 17 - 8); // Deterministic pseudo-random
    imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
    imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
    imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 5);
  cachedWallTexture = texture;
  return texture;
};

// Create floor texture (cached)
// Uses neutral grayscale so material color can properly tint the floor
const getFloorTexture = (): THREE.CanvasTexture => {
  if (cachedFloorTexture) return cachedFloorTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Neutral gray base (allows material color to tint)
  ctx.fillStyle = '#707070';
  ctx.fillRect(0, 0, 512, 512);

  // Road-like lane markings - using neutral white for visibility
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 3;
  ctx.setLineDash([30, 20]);
  ctx.beginPath();
  ctx.moveTo(256, 0);
  ctx.lineTo(256, 512);
  ctx.stroke();

  // Side guide lines - neutral
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(20, 512);
  ctx.moveTo(492, 0);
  ctx.lineTo(492, 512);
  ctx.stroke();

  // Add subtle grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 10);
  cachedFloorTexture = texture;
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

  vertices.push(-w, -h, 0, w, -h, 0);
  vertices.push(-w, h, 0, w, h, 0);
  vertices.push(-w, -h, 0, -w, h, 0);
  vertices.push(w, -h, 0, w, h, 0);

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
    wall: new THREE.PlaneGeometry(SEGMENT_DEPTH, TUNNEL_HEIGHT),
    floor: new THREE.PlaneGeometry(TUNNEL_WIDTH, SEGMENT_DEPTH),
    ceiling: new THREE.PlaneGeometry(TUNNEL_WIDTH, SEGMENT_DEPTH),
    trim: new THREE.PlaneGeometry(0.1, SEGMENT_DEPTH),
    wireframe: wireframeGeom,
  };

  return geometryCache;
};

const getGeometry = (type: 'wall' | 'floor' | 'ceiling' | 'trim' | 'wireframe') => {
  const cache = initGeometryCache();
  return cache[type];
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

// Component to render a drawing on a 3D wall
const WallDrawing: React.FC<{
  drawing: CanvasDrawingItem;
  section: WallSection;
}> = React.memo(({ drawing, section }) => {
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

  if (!textureRef.current) return null;

  return (
    <mesh position={position} rotation={rotation} renderOrder={2}>
      <planeGeometry args={[planeWidth, planeHeight]} />
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

// Drawing surface for decorating mode - handles mouse input and renders strokes to wall
const DecoratingDrawingSurface: React.FC<{
  wall: WallSide;
  zPosition: number;
  brushSettings: { tool: string; color: string; size: number; style: string } | null;
  onStrokeComplete: (drawingId: string, stroke: DrawingStroke) => void;
  canvasItems: CanvasDrawingItem[];
  wallSections: WallSection[];
}> = ({ wall, zPosition, brushSettings, onStrokeComplete, canvasItems, wallSections }) => {
  const { camera, raycaster, gl } = useThree();
  const [isDrawing, setIsDrawing] = useState(false);
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const [textureVersion, setTextureVersion] = useState(0);
  // Reuse raycasting objects to avoid allocations in the hot path
  const mouseVecRef = useRef(new THREE.Vector2());
  const intersectionVecRef = useRef(new THREE.Vector3());

  const CANVAS_W = 1600;
  const CANVAS_H = 1000;

  // Find the active section and drawing
  // Use the camera's zPosition directly — the camera is placed at this depth in decorating mode
  const activeSection = useMemo(() => {
    return wallSections.find(s =>
      s.wall === wall && zPosition >= s.zStart && zPosition < s.zEnd
    );
  }, [wallSections, wall, zPosition]);

  const activeDrawing = useMemo(() => {
    if (!activeSection) return null;
    return canvasItems.find(
      item => item.sectionId === activeSection.id && item.wall === wall
    ) as CanvasDrawingItem | undefined;
  }, [canvasItems, activeSection, wall]);

  // Create wall plane for raycasting
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

  // Convert 3D world point to 2D canvas coordinates.
  // Clamps to canvas bounds instead of rejecting out-of-range points,
  // so drawing works across the full visible area of the wall.
  const worldToCanvas = useCallback((worldPoint: THREE.Vector3): { x: number; y: number } | null => {
    if (!activeSection) return null;
    const h = TUNNEL_HEIGHT / 2;
    const worldZ = -worldPoint.z;
    const sectionLen = activeSection.zEnd - activeSection.zStart;

    const zNorm = (worldZ - activeSection.zStart) / sectionLen;
    const clampedX = Math.max(0, Math.min(CANVAS_W, zNorm * CANVAS_W));

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
  }, [activeSection, wall]);

  // Initialize canvases and render committed strokes to background
  useEffect(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = CANVAS_W;
      canvasRef.current.height = CANVAS_H;
    }
    if (!backgroundCanvasRef.current) {
      backgroundCanvasRef.current = document.createElement('canvas');
      backgroundCanvasRef.current.width = CANVAS_W;
      backgroundCanvasRef.current.height = CANVAS_H;
    }

    // Render all committed strokes onto the background canvas
    const bgCtx = backgroundCanvasRef.current.getContext('2d')!;
    bgCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (activeDrawing?.strokes) {
      activeDrawing.strokes.forEach(stroke => {
        renderStrokeToContext(bgCtx, stroke);
      });
    }

    // Copy background to foreground (visible texture)
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(backgroundCanvasRef.current, 0, 0);

    if (textureRef.current) {
      textureRef.current.needsUpdate = true;
    } else {
      textureRef.current = new THREE.CanvasTexture(canvasRef.current);
      setTextureVersion(v => v + 1);
    }
  }, [activeDrawing?.strokes?.length, activeDrawing?.id]);

  // Calculate mesh position and rotation using actual section bounds
  const { position, rotation, planeWidth, planeHeight } = useMemo(() => {
    if (!activeSection) {
      return { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], planeWidth: 1, planeHeight: 1 };
    }

    const w = TUNNEL_WIDTH / 2;
    const h = TUNNEL_HEIGHT / 2;
    const sectionMidZ = -(activeSection.zStart + activeSection.zEnd) / 2;
    const sectionLen = activeSection.zEnd - activeSection.zStart;

    let pos: [number, number, number];
    let rot: [number, number, number];
    let pWidth: number;
    let pHeight: number;

    switch (wall) {
      case 'left':
        pos = [-w + 0.03, 0, sectionMidZ];
        rot = [0, Math.PI / 2, 0];
        pWidth = sectionLen;
        pHeight = TUNNEL_HEIGHT;
        break;
      case 'right':
        pos = [w - 0.03, 0, sectionMidZ];
        rot = [0, -Math.PI / 2, 0];
        pWidth = sectionLen;
        pHeight = TUNNEL_HEIGHT;
        break;
      case 'floor':
        pos = [0, -h + 0.03, sectionMidZ];
        rot = [-Math.PI / 2, 0, 0];
        pWidth = TUNNEL_WIDTH;
        pHeight = sectionLen;
        break;
      case 'ceiling':
        pos = [0, h - 0.03, sectionMidZ];
        rot = [Math.PI / 2, 0, 0];
        pWidth = TUNNEL_WIDTH;
        pHeight = sectionLen;
        break;
    }

    return { position: pos, rotation: rot, planeWidth: pWidth, planeHeight: pHeight };
  }, [activeSection, wall]);

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

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!brushSettings || brushSettings.tool !== 'draw' || e.button !== 0) return;
    e.stopPropagation();

    const point = getCanvasPoint(e.clientX, e.clientY);
    if (point) {
      setIsDrawing(true);
      currentStrokeRef.current = [point];

      // Capture pointer on the canvas DOM element so move/up events keep
      // firing even if the finger/pen drifts off the mesh (critical for touch).
      const domEl = gl.domElement;
      domEl.setPointerCapture(e.nativeEvent.pointerId);

      // Render point immediately for visual feedback
      if (canvasRef.current && textureRef.current) {
        const ctx = canvasRef.current.getContext('2d')!;
        const tempStroke: DrawingStroke = {
          points: [point],
          color: brushSettings.color,
          size: brushSettings.size,
          style: brushSettings.style as DrawingStroke['style'],
        };
        renderStrokeToContext(ctx, tempStroke);
        textureRef.current.needsUpdate = true;
      }
    }
  }, [brushSettings, getCanvasPoint, gl]);

  // Use raw DOM events for move/up so drawing continues even when the
  // touch/pen drifts off the mesh (R3F's onPointerMove requires raycast hits).
  const handleDOMPointerMove = useCallback((e: PointerEvent) => {
    if (!isDrawing || !brushSettings) return;

    const point = getCanvasPoint(e.clientX, e.clientY);
    if (point) {
      currentStrokeRef.current.push(point);

      // Double-buffered render: composite background + current stroke only
      if (canvasRef.current && backgroundCanvasRef.current && textureRef.current) {
        const ctx = canvasRef.current.getContext('2d')!;
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        // Blit the pre-rendered background (all committed strokes) in one operation
        ctx.drawImage(backgroundCanvasRef.current, 0, 0);

        // Render only the current in-progress stroke
        const tempStroke: DrawingStroke = {
          points: currentStrokeRef.current,
          color: brushSettings.color,
          size: brushSettings.size,
          style: brushSettings.style as DrawingStroke['style'],
        };
        renderStrokeToContext(ctx, tempStroke);
        textureRef.current.needsUpdate = true;
      }
    }
  }, [isDrawing, brushSettings, getCanvasPoint]);

  const handleDOMPointerUp = useCallback(() => {
    if (isDrawing && currentStrokeRef.current.length > 1 && activeDrawing && brushSettings) {
      const stroke: DrawingStroke = {
        points: currentStrokeRef.current,
        color: brushSettings.color,
        size: brushSettings.size,
        style: brushSettings.style as DrawingStroke['style'],
      };
      onStrokeComplete(activeDrawing.id, stroke);
    }
    setIsDrawing(false);
    currentStrokeRef.current = [];
  }, [isDrawing, brushSettings, activeDrawing, onStrokeComplete]);

  // Attach/detach raw DOM listeners when drawing state changes.
  // This ensures touch/pen drawing continues outside the mesh bounds.
  useEffect(() => {
    const domEl = gl.domElement;
    if (isDrawing) {
      domEl.addEventListener('pointermove', handleDOMPointerMove);
      domEl.addEventListener('pointerup', handleDOMPointerUp);
      domEl.addEventListener('pointercancel', handleDOMPointerUp);
    }
    return () => {
      domEl.removeEventListener('pointermove', handleDOMPointerMove);
      domEl.removeEventListener('pointerup', handleDOMPointerUp);
      domEl.removeEventListener('pointercancel', handleDOMPointerUp);
    };
  }, [isDrawing, handleDOMPointerMove, handleDOMPointerUp, gl]);

  if (!activeSection || !textureRef.current) return null;

  return (
    <mesh
      position={position}
      rotation={rotation}
      onPointerDown={handlePointerDown}
      renderOrder={10}
    >
      <planeGeometry args={[planeWidth, planeHeight]} />
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
  segmentZ: number; // The z-position of this segment's front face
}> = React.memo(({ onWallClick, wallSettings, wallSections, segmentZ }) => {
  // Use cached textures
  const wallTexture = useMemo(() => getWallTexture(), []);
  const floorTexture = useMemo(() => getFloorTexture(), []);
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

  // Get adjusted color with brightness
  const getWallColor = useCallback((settings: WallSettings) => {
    return adjustBrightness(settings.color, settings.brightness);
  }, []);

  // Get effective settings for each wall
  const leftSettings = getEffectiveWallSettings('left');
  const rightSettings = getEffectiveWallSettings('right');
  const floorSettings = getEffectiveWallSettings('floor');
  const ceilingSettings = getEffectiveWallSettings('ceiling');

  return (
    <group>
      {/* Wireframe overlay - pushed slightly inward to prevent Z-fighting */}
      <lineSegments renderOrder={1}>
        <primitive object={getGeometry('wireframe')} attach="geometry" />
        <lineBasicMaterial
          color="#4ecdc4"
          transparent
          opacity={0.08}
          depthWrite={false}
        />
      </lineSegments>

      {/* Left wall */}
      <mesh
        position={[-w, 0, -d / 2]}
        rotation={[0, Math.PI / 2, 0]}
        onClick={handleWallClick('left')}
        onContextMenu={handleWallClick('left')}
        renderOrder={0}
      >
        <primitive object={getGeometry('wall')} attach="geometry" />
        <meshStandardMaterial
          color={getWallColor(leftSettings)}
          map={wallTexture}
          side={THREE.FrontSide}
          metalness={0.3}
          roughness={0.8}
          transparent={leftSettings.opacity < 1}
          opacity={leftSettings.opacity}
        />
      </mesh>

      {/* Right wall */}
      <mesh
        position={[w, 0, -d / 2]}
        rotation={[0, -Math.PI / 2, 0]}
        onClick={handleWallClick('right')}
        onContextMenu={handleWallClick('right')}
        renderOrder={0}
      >
        <primitive object={getGeometry('wall')} attach="geometry" />
        <meshStandardMaterial
          color={getWallColor(rightSettings)}
          map={wallTexture}
          side={THREE.FrontSide}
          metalness={0.3}
          roughness={0.8}
          transparent={rightSettings.opacity < 1}
          opacity={rightSettings.opacity}
        />
      </mesh>

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
          metalness={0.4}
          roughness={0.6}
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
          side={THREE.FrontSide}
          metalness={0.5}
          roughness={0.9}
          transparent={ceilingSettings.opacity < 1}
          opacity={ceilingSettings.opacity}
        />
      </mesh>

      {/* Edge trim strips */}
      <mesh position={[-w + 0.05, -h + 0.05, -d / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <primitive object={getGeometry('trim')} attach="geometry" />
        <meshBasicMaterial color="#4ecdc4" transparent opacity={0.5} />
      </mesh>
      <mesh position={[w - 0.05, -h + 0.05, -d / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <primitive object={getGeometry('trim')} attach="geometry" />
        <meshBasicMaterial color="#4ecdc4" transparent opacity={0.5} />
      </mesh>
    </group>
  );
});

// Camera controller with multiple navigation modes
const CameraController: React.FC<{
  scrollZ: number;
  mouseOffset: { x: number; y: number };
  isLooking: boolean;
  lastLookTime: number;
  navigationMode: NavigationMode;
  sightseeingFocusPoint: Vec3 | null;
  sightseeingWall: WallSide | null;
  decoratingState: { wall: WallSide; zPosition: number; cameraOffset: number } | null;
}> = ({ scrollZ, mouseOffset, isLooking, lastLookTime, navigationMode, sightseeingFocusPoint, sightseeingWall, decoratingState }) => {
  const { camera } = useThree();
  const targetRotation = useRef({ x: 0, y: 0 });
  const currentRotation = useRef({ x: 0, y: 0 });
  const currentPosition = useRef({ x: 0, y: 0, z: 0 });
  const currentLookAt = useRef({ x: 0, y: 0, z: -10 });

  useFrame(() => {
    const lerpFactor = 0.08;

    if (navigationMode === 'normal') {
      // Normal mode: Standard tunnel navigation
      const targetZ = -scrollZ;
      currentPosition.current.z += (targetZ - currentPosition.current.z) * lerpFactor;
      currentPosition.current.y += (0 - currentPosition.current.y) * lerpFactor;
      currentPosition.current.x += (0 - currentPosition.current.x) * lerpFactor;

      // FPS look around with right mouse hold
      if (isLooking) {
        targetRotation.current.x = mouseOffset.y * 0.3;
        targetRotation.current.y = mouseOffset.x * 0.5;
      } else {
        // Gradually return to forward after releasing right mouse
        const timeSinceLook = Date.now() - lastLookTime;
        if (timeSinceLook > 1500) {
          targetRotation.current.x = 0;
          targetRotation.current.y = 0;
        }
      }

      currentRotation.current.x += (targetRotation.current.x - currentRotation.current.x) * 0.05;
      currentRotation.current.y += (targetRotation.current.y - currentRotation.current.y) * 0.05;

      // Calculate lookAt based on TARGET position, not current position
      // This prevents the lookAt from lagging behind during fast scrolling
      // which would cause a 180-degree flip when lookAt ends up behind the camera
      const lookAtZ = targetZ - 10;
      const lookAtX = Math.sin(currentRotation.current.y) * 10;
      const lookAtY = Math.sin(currentRotation.current.x) * 5;

      currentLookAt.current.x += (lookAtX - currentLookAt.current.x) * lerpFactor;
      currentLookAt.current.y += (lookAtY - currentLookAt.current.y) * lerpFactor;
      currentLookAt.current.z += (lookAtZ - currentLookAt.current.z) * lerpFactor;

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
          targetX = -w + 4; // 4m from left wall
          lookAtX = -w;
          break;
        case 'right':
          targetX = w - 4; // 4m from right wall
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

    } else if (navigationMode === 'sightseeing' && sightseeingFocusPoint && sightseeingWall) {
      // Sightseeing mode: Camera focuses on click point, POV follows cursor
      const focusZ = sightseeingFocusPoint.z;

      // Position camera based on which wall we're looking at
      let targetX = 0;
      let targetY = 0;
      const targetZ = focusZ + 3; // Slightly behind the focus point

      switch (sightseeingWall) {
        case 'left':
          targetX = 2; // Move right to see left wall
          break;
        case 'right':
          targetX = -2; // Move left to see right wall
          break;
        case 'floor':
          targetY = 2; // Move up to see floor
          break;
        case 'ceiling':
          targetY = -2; // Move down to see ceiling
          break;
      }

      currentPosition.current.x += (targetX - currentPosition.current.x) * lerpFactor;
      currentPosition.current.y += (targetY - currentPosition.current.y) * lerpFactor;
      currentPosition.current.z += (targetZ - currentPosition.current.z) * lerpFactor;

      // In sightseeing mode, mouse position controls look direction (no click required)
      // mouseOffset is normalized to -1 to 1
      // Higher multipliers allow looking behind and at opposing wall
      const lookOffsetX = mouseOffset.x * 10;
      const lookOffsetY = -mouseOffset.y * 8;

      const baseLookAtX = sightseeingFocusPoint.x + lookOffsetX;
      const baseLookAtY = sightseeingFocusPoint.y + lookOffsetY;
      const baseLookAtZ = focusZ;

      currentLookAt.current.x += (baseLookAtX - currentLookAt.current.x) * 0.1;
      currentLookAt.current.y += (baseLookAtY - currentLookAt.current.y) * 0.1;
      currentLookAt.current.z += (baseLookAtZ - currentLookAt.current.z) * 0.1;

    } else if (navigationMode === 'canvas') {
      // Canvas mode: Camera handled separately or frozen
      // The camera should be looking straight at the wall
      // This mode primarily uses the 2D overlay
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

// Infinite tunnel manager with improved recycling
const InfiniteTunnel: React.FC<{
  cameraZ: number;
  onWallClick?: (position: { x: number; y: number; z: number }, event: ThreeEvent<MouseEvent>, wall: WallSide) => void;
  wallSettings: SceneSettings['walls'];
  wallSections: WallSection[];
}> = ({ cameraZ, onWallClick, wallSettings, wallSections }) => {
  const segmentsRef = useRef<THREE.Group>(null);

  // Discrete base position — only changes when crossing a SEGMENT_DEPTH boundary.
  // This keeps segmentPositions stable between boundaries, preventing
  // 25 TunnelSegment re-renders on every scroll frame.
  const baseSegmentZ = Math.floor(-cameraZ / SEGMENT_DEPTH) * SEGMENT_DEPTH;

  const segmentPositions = useMemo(() =>
    Array.from({ length: NUM_SEGMENTS }, (_, i) =>
      baseSegmentZ + (i - SEGMENT_BUFFER) * SEGMENT_DEPTH
    ),
  [baseSegmentZ]);

  // Update Three.js group positions directly each frame for smooth visuals.
  // No React state update here — positions are derived from cameraZ via useMemo above.
  useFrame(() => {
    if (!segmentsRef.current) return;
    const camZ = -cameraZ;
    const baseZ = Math.floor(camZ / SEGMENT_DEPTH) * SEGMENT_DEPTH;

    segmentsRef.current.children.forEach((segment, index) => {
      const targetZ = baseZ + (index - SEGMENT_BUFFER) * SEGMENT_DEPTH;
      segment.position.z = targetZ;
    });
  });

  return (
    <group ref={segmentsRef}>
      {segmentPositions.map((pos, i) => (
        <group key={i} position={[0, 0, pos]}>
          <TunnelSegment
            onWallClick={onWallClick}
            wallSettings={wallSettings}
            wallSections={wallSections}
            segmentZ={pos}
          />
        </group>
      ))}
    </group>
  );
};

// Picture frame for images (poster-style) with drag functionality
const PictureFrame: React.FC<{
  object: SceneObject;
  onContextMenu: (e: ThreeEvent<MouseEvent>, object: SceneObject) => void;
  onHover: (object: SceneObject | null, position?: { x: number; y: number }) => void;
}> = ({ object, onContextMenu, onHover }) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<THREE.Vector3 | null>(null);
  const selectedObjectId = useSceneStore(s => s.selectedObjectId);
  const selectObject = useSceneStore(s => s.selectObject);
  const updateObject = useSceneStore(s => s.updateObject);
  const { camera, gl, raycaster } = useThree();
  const isSelected = selectedObjectId === object.id;

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

  const handlePointerUp = async (e: ThreeEvent<PointerEvent>) => {
    if (isDragging) {
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

      if (dragPosition) {
        updateObject(object.id, {
          position: { x: dragPosition.x, y: dragPosition.y, z: dragPosition.z },
        });
      }
      setDragPosition(null);
    } else if (e.button === 0 && object.directoryPath) {
      try {
        await window.electronAPI.openDirectory(object.directoryPath);
      } catch (error) {
        console.error('Failed to open directory:', error);
      }
    }
    selectObject(object.id);
  };

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onContextMenu(e, object);
  };

  const handlePointerEnter = (e: ThreeEvent<PointerEvent>) => {
    setHovered(true);
    document.body.style.cursor = 'grab';
    onHover(object, { x: e.clientX, y: e.clientY });
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHovered(false);
      document.body.style.cursor = 'auto';
      onHover(null);
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
          color={isSelected || hovered ? '#4ecdc4' : '#1a1a2e'}
          metalness={0.6}
          roughness={0.2}
        />
      </mesh>

      {/* Inner frame accent */}
      <mesh position={[0, 0, frameDepth / 2 - 0.02]}>
        <boxGeometry args={[frameWidth + 0.1, frameHeight + 0.1, 0.02]} />
        <meshStandardMaterial
          color="#4ecdc4"
          emissive="#4ecdc4"
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

      {/* Label - distanceFactor makes it scale with 3D distance */}
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
    </group>
  );
};

// 3D Object (cube, sphere, etc.) with drag functionality
const Object3D: React.FC<{
  object: SceneObject;
  onContextMenu: (e: ThreeEvent<MouseEvent>, object: SceneObject) => void;
  onHover: (object: SceneObject | null, position?: { x: number; y: number }) => void;
}> = ({ object, onContextMenu, onHover }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<THREE.Vector3 | null>(null);
  const selectedObjectId = useSceneStore(s => s.selectedObjectId);
  const selectObject = useSceneStore(s => s.selectObject);
  const updateObject = useSceneStore(s => s.updateObject);
  const { camera, gl, raycaster } = useThree();
  const isSelected = selectedObjectId === object.id;

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

    // Intersect with plane at object's Z position
    const intersection = new THREE.Vector3();
    const depth = Math.abs(object.position.z);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), depth);
    raycaster.ray.intersectPlane(plane, intersection);

    if (intersection) {
      const w = TUNNEL_WIDTH / 2 - 1;
      const h = TUNNEL_HEIGHT / 2 - 1;
      // Snap to nearest wall/floor/ceiling
      const newPos = new THREE.Vector3(
        Math.max(-w, Math.min(w, intersection.x)),
        Math.max(-h, Math.min(h, intersection.y)),
        object.position.z
      );
      setDragPosition(newPos);
    }
  };

  const handlePointerUp = async (e: ThreeEvent<PointerEvent>) => {
    if (isDragging) {
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

      if (dragPosition) {
        updateObject(object.id, {
          position: { x: dragPosition.x, y: dragPosition.y, z: dragPosition.z },
        });
      }
      setDragPosition(null);
    } else if (e.button === 0 && object.directoryPath) {
      // Single click opens directory
      try {
        await window.electronAPI.openDirectory(object.directoryPath);
      } catch (error) {
        console.error('Failed to open directory:', error);
      }
    }
    selectObject(object.id);
  };

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onContextMenu(e, object);
  };

  const handlePointerEnter = (e: ThreeEvent<PointerEvent>) => {
    setHovered(true);
    document.body.style.cursor = 'grab';
    onHover(object, { x: e.clientX, y: e.clientY });
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHovered(false);
      document.body.style.cursor = 'auto';
      onHover(null);
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

  // Current position (drag or stored)
  const currentPos = isDragging && dragPosition
    ? { x: dragPosition.x, y: dragPosition.y, z: dragPosition.z }
    : object.position;

  // Offset from wall/floor for display
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

  return (
    <group position={[offsetPos.x, offsetPos.y, offsetPos.z]}>
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
      {/* Label - distanceFactor makes it scale with 3D distance */}
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
        <meshBasicMaterial color="#4ecdc4" transparent opacity={0.3} side={THREE.DoubleSide} />
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
            backgroundColor: '#4ecdc4',
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
            backgroundColor: '#ff6b6b',
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

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[displayWidth, displayHeight]} />
      <meshStandardMaterial map={texture} side={THREE.DoubleSide} roughness={0.8} metalness={0.1} />
    </mesh>
  );
};

// Scene content
const SceneContent: React.FC<SceneProps & {
  scrollZ: number;
  mouseOffset: { x: number; y: number };
  isLooking: boolean;
  lastLookTime: number;
  navigationMode: NavigationMode;
  sightseeingFocusPoint: Vec3 | null;
  sightseeingWall: WallSide | null;
  decoratingState: { wall: WallSide; zPosition: number; cameraOffset: number } | null;
}> = ({ onContextMenu, onSignContextMenu, onLightContextMenu, onDateMarkerContextMenu, onHover, onWallClick, onConfirmWallpaper, onCancelWallpaper, scrollZ, mouseOffset, isLooking, lastLookTime, navigationMode, sightseeingFocusPoint, sightseeingWall, decoratingState }) => {
  const { objects, signs, lights, wallImages, wallSections, canvasItems, dateMarkers, pendingWallpaper, settings, generateSignsUpToDepth, generateLightsUpToDepth, generateSectionsUpToDepth, decoratingBrushSettings, addStrokeToDrawing } = useSceneStore(useShallow(s => ({
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

  // Generate signs, lights, and sections as we scroll deeper
  useEffect(() => {
    generateSignsUpToDepth(scrollZ);
    generateLightsUpToDepth(scrollZ);
    generateSectionsUpToDepth(scrollZ);
  }, [scrollZ, generateSignsUpToDepth, generateLightsUpToDepth, generateSectionsUpToDepth]);

  // Calculate fog based on settings
  // Fog starts further away and extends further - roughly 2x previous visibility
  const fogNear = 20 * (1 - settings.haziness * 0.3);
  const fogFar = settings.drawDistance * 1.5 * (1 - settings.haziness * 0.2);

  return (
    <>
      <color attach="background" args={['#050508']} />
      <fog attach="fog" args={['#050508', fogNear, fogFar]} />

      {/* Ambient light controlled by settings */}
      <ambientLight intensity={settings.envBrightness} color="#1a1a2e" />

      {/* Subtle colored accent lights for atmosphere */}
      <pointLight position={[0, 0, -scrollZ - 10]} intensity={0.3 * settings.lightBrightness} distance={30} color="#4ecdc4" />
      <pointLight position={[0, 0, -scrollZ - 40]} intensity={0.2 * settings.lightBrightness} distance={30} color="#ff6b6b" />

      <CameraController
        scrollZ={scrollZ}
        mouseOffset={mouseOffset}
        isLooking={isLooking}
        lastLookTime={lastLookTime}
        navigationMode={navigationMode}
        sightseeingFocusPoint={sightseeingFocusPoint}
        sightseeingWall={sightseeingWall}
        decoratingState={decoratingState}
      />

      <InfiniteTunnel cameraZ={scrollZ} onWallClick={onWallClick} wallSettings={settings.walls} wallSections={wallSections} />

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
    </>
  );
};

export const Scene: React.FC<SceneProps> = (props) => {
  const [scrollZ, setScrollZ] = useState(0);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });
  const [isLooking, setIsLooking] = useState(false);
  const [lastLookTime, setLastLookTime] = useState(0);
  const [lastFloorClickTime, setLastFloorClickTime] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { settings, navigationMode, sightseeingState, decoratingState, exitSightseeingMode, exitDecoratingMode } = useSceneStore(useShallow(s => ({
    settings: s.settings,
    navigationMode: s.navigationMode,
    sightseeingState: s.sightseeingState,
    decoratingState: s.decoratingState,
    exitSightseeingMode: s.exitSightseeingMode,
    exitDecoratingMode: s.exitDecoratingMode,
  })));

  // Get sightseeing state
  const sightseeingFocusPoint = sightseeingState?.focusPoint || null;
  const sightseeingWall = sightseeingState?.wall || null;

  // Handle wall clicks with double-click detection for floor in sightseeing mode
  const handleWallClickWithDoubleClick = useCallback((
    position: { x: number; y: number; z: number },
    event: ThreeEvent<MouseEvent>,
    wall: WallSide
  ) => {
    // In sightseeing mode, detect double-click on floor to exit
    if (navigationMode === 'sightseeing' && wall === 'floor') {
      const now = Date.now();
      if (now - lastFloorClickTime < 300) {
        // Double-click detected - exit sightseeing mode
        exitSightseeingMode();
        setLastFloorClickTime(0);
        return;
      }
      setLastFloorClickTime(now);
    }

    // Pass through to original handler
    props.onWallClick?.(position, event, wall);
  }, [navigationMode, lastFloorClickTime, exitSightseeingMode, props.onWallClick]);

  // Scroll navigation with configurable speed - disabled in sightseeing mode
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // In sightseeing mode, detect 2-finger swipe to exit
      if (navigationMode === 'sightseeing') {
        // Two-finger swipe is typically detected by ctrlKey on wheel events (pinch)
        // or large deltaX values (horizontal swipe)
        const isTwoFingerSwipe = e.ctrlKey || Math.abs(e.deltaX) > 30;
        if (isTwoFingerSwipe) {
          exitSightseeingMode();
          return;
        }
        // Also allow ESC-like behavior with aggressive scroll
        if (Math.abs(e.deltaY) > 100) {
          exitSightseeingMode();
          return;
        }
        // Otherwise ignore scroll in sightseeing mode
        return;
      }

      // Normal mode scrolling
      if (navigationMode === 'normal') {
        setScrollZ((prev) => Math.max(0, prev + e.deltaY * settings.navigationSpeed));
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [settings.navigationSpeed, navigationMode, exitSightseeingMode]);

  // Mouse look (hold right mouse button to look around in normal mode)
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (e.button === 2 && !target?.closest?.('.context-menu')) {
        // Only enable look mode in normal mode and if clicking on canvas
        if (target.tagName === 'CANVAS' && navigationMode === 'normal') {
          setIsLooking(true);
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2 && navigationMode === 'normal') {
        setIsLooking(false);
        setLastLookTime(Date.now());
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const offsetX = (e.clientX - rect.left - centerX) / centerX;
        const offsetY = (e.clientY - rect.top - centerY) / centerY;
        setMouseOffset({ x: offsetX, y: offsetY });
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [navigationMode]);

  // ESC key to exit sightseeing or decorating mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (navigationMode === 'sightseeing') {
          exitSightseeingMode();
        } else if (navigationMode === 'decorating') {
          exitDecoratingMode();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigationMode, exitSightseeingMode, exitDecoratingMode]);

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
      case 'sightseeing':
        return 'Move mouse to look around • Double-click floor or ESC to exit';
      case 'canvas':
        return 'Canvas mode active';
      case 'decorating':
        return 'Decorating mode • ESC to exit';
      default:
        return isLooking ? 'Looking around...' : 'Scroll to navigate • Hold right-click to look • Click wall to explore';
    }
  };

  return (
    <div className="canvas-container" ref={containerRef}>
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
          onWallClick={handleWallClickWithDoubleClick}
          scrollZ={scrollZ}
          mouseOffset={mouseOffset}
          isLooking={isLooking}
          lastLookTime={lastLookTime}
          navigationMode={navigationMode}
          sightseeingFocusPoint={sightseeingFocusPoint}
          sightseeingWall={sightseeingWall}
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
