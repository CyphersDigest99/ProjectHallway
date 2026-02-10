# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run dev          # Start development (Vite + Electron concurrently)
npm run build        # Build for production (TypeScript + Vite)
npm start            # Run built Electron app
npx tsc --noEmit     # Type-check renderer (must pass before committing)
npx tsc --noEmit -p tsconfig.main.json  # Type-check main process
```

Two tsconfig files: `tsconfig.json` (renderer, ESNext, no emit) and `tsconfig.main.json` (main process, CommonJS, emits to `dist/main/`).

## Architecture

Electron + React + Three.js app that renders a navigable 3D tunnel for organizing projects spatially.

### Process Split

- **Main process** (`src/main/`): Electron window, IPC handlers, `electron-store` persistence. Renderer calls main via `window.electronAPI` (defined in `preload.ts`, typed in `src/shared/types.ts` as `IElectronAPI`).
- **Renderer** (`src/renderer/`): React app with Three.js via `@react-three/fiber`.
- **Shared types** (`src/shared/types.ts`): All interfaces/types used across processes.

### Core Files (large, monolithic)

- **`Scene.tsx`** (~3600+ lines): The entire 3D canvas. Contains `CameraController`, `InfiniteTunnel` (segment recycling), `ForkProximityDetector`, `ForkPathIndicators`, `PortalMarker`, `IntersectionChamberMesh`, `DecoratingDrawingSurface`, `WallDrawing`, and the outer `Scene` component (scroll/keyboard/mouse state). `SceneContent` is the inner component that renders all 3D geometry; the outer `Scene` wraps it in a `<Canvas>` and manages navigation state (scrollZ, lookRotation, fov).
- **`App.tsx`** (~1500+ lines): Root UI. Context menus, dialogs, modals, mode-specific overlays (CanvasMode, DecoratingMode3D, ForkChoosingOverlay). Orchestrates all user interactions outside the 3D canvas.
- **`sceneStore.ts`** (~1500+ lines): Single Zustand store. All scene state, navigation mode, tunnel topology, fork choosing, hologram projector. Uses debounced auto-save via `electron-store`.

### Navigation Modes

`NavigationMode = 'normal' | 'canvas' | 'decorating' | 'choosing'`

- **normal**: WASD movement, right-drag mouse look, scroll/Ctrl+scroll for speed/FOV. All standard tunnel navigation.
- **canvas**: 2D flat editing overlay for wall sections (entered via wall click menu).
- **decorating**: 3D wall painting mode (double-click wall). Drawing surface is a raycasted plane in 3D space.
- **choosing**: Bird's-eye Y-fork navigation. Camera rises above intersection, user picks path with arrow keys. Three sub-phases: ascending, overhead, descending.

All keyboard, scroll, and mouse handlers gate on `navigationMode`. Adding a new mode automatically disables WASD/scroll/mouse-look since they check for `'normal'`.

### Tunnel System (`src/renderer/tunnel/`)

The tunnel is a graph of nodes (junctions) and edges (tunnel segments):

- **TunnelTopology**: `{ nodes: TunnelNode[], edges: TunnelEdge[], rootEdgeId }` — persisted in save data.
- **TunnelEdge**: Has `controlPoints: Vector3[]` (2 = straight line, 3+ = CatmullRom curve) and cached `length`.
- **TunnelPath** (`TunnelPath.ts`): Converts edge control points into a spline with Rotation Minimizing Frames (RMF via double-reflection). Provides `getFrame(t)` for camera position/orientation and `tFromDistance(d)` for arc-length parameterization.
- **CurvedSegment** (`CurvedSegment.ts`): Generates rectangular tube geometry along curved splines with `aPathDistance` vertex attribute (used by neural pulse shader).
- **IntersectionChamber** (`IntersectionChamber.ts`): Generates enlarged room geometry at nodes with 3+ edges, with portal openings toward each connected edge.
- **TunnelGraph** (`TunnelGraph.ts`): Graph helpers — `getEdgesAtNode()`, `isIntersection()`, `getNavigationOptions()`, `getPathForEdge()` (cached), `createLegacyTopology()` for backward compatibility.

Navigation between edges: `navigateToEdge(edgeId, fromNodeId)` sets `pendingNavigation` in store; the outer `Scene` component consumes it to teleport `scrollZ`. For straight tunnels, `scrollZ` maps directly to world Z. For curved tunnels, `currentT` (0..1) parameterizes position along the spline.

### Neural Pulse Shader (`src/renderer/shaders/neuralPulse.ts`)

Procedural overlay on tunnel walls — glowing veins with ambient traveling pulses and reactive glow that intensifies with movement. Uses `aPathDistance` for curved paths, falls back to world Z for flat geometry. Configurable via `NeuralPulseSettings` in the store.

### Persistence

`sceneStore.saveState()` serializes the full scene (objects, topology, settings) via IPC to `electron-store`. A single `debouncedSave()` (300ms) replaces per-action save calls. `loadState()` includes migration: saves without `tunnelTopology` get a `createLegacyTopology()` with all objects assigned to the root edge.

### Rendering Pipeline

- 25 segments x 10m = 250m visibility for straight tunnels, recycled at `SEGMENT_DEPTH` boundaries.
- Curved tunnels: segments generated along visible t-range, cached by `edgeId:tStart:tEnd`.
- Procedural textures: `getWallTexture()`/`getFloorTexture()` — 512x512 canvas, grayscale vein patterns, globally cached.
- Intersection chambers hidden/shown via `useFrame` exclusion zones when overlapping with flat segments.

## Known Issues (See todo.md)

### Drawing Mechanism - HIGH PRIORITY
The 3D wall drawing in decorating mode has issues:
1. **Stuttering** - Drawing is choppy, needs smoother updates
2. **Straight lines** - Curves not rendering properly, showing as line segments
3. **~1m offset** - Paint appears offset from cursor position (coordinate transform bug)

Investigation areas: `worldToCanvas()`, `getCanvasPoint()` raycasting, camera position offset in decorating mode, texture update frequency.
