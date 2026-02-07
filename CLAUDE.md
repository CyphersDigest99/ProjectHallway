# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run dev          # Start development (Vite + Electron concurrently)
npm run build        # Build for production (TypeScript + Vite)
npm start            # Run built Electron app
npm run watch:main   # Watch main process TypeScript only
```

## Architecture

Project Hallway is an Electron + React + Three.js application that visualizes project directories as a 3D infinite tunnel environment.

### Process Architecture

**Main Process** (`src/main/`)
- `index.ts` - Electron main process, window management, IPC handlers
- `preload.ts` - Context bridge exposing `window.electronAPI` to renderer
- Uses `electron-store` for persistent state storage

**Renderer Process** (`src/renderer/`)
- React application with Three.js (via @react-three/fiber and @react-three/drei)
- State management via Zustand (`store/sceneStore.ts`)

**Shared Types** (`src/shared/types.ts`)
- Type definitions used by both processes
- `IElectronAPI` interface defines the preload API contract

### Key Renderer Components

- `Scene.tsx` - Main Three.js canvas, camera controls, infinite tunnel rendering with procedural wall textures
- `App.tsx` - Root component, context menus, dialogs, orchestrates UI
- `store/sceneStore.ts` - Zustand store managing objects, signs, lights, and settings

### 3D Object Types

Objects in the scene (`src/renderer/components/objects/`):
- `HighwaySign.tsx` - Draggable distance markers on tunnel walls
- `CeilingLight.tsx` - Draggable ceiling lights with brightness/temperature
- Scene.tsx contains: `Object3D` (primitives), `PictureFrame` (images), `WallpaperDisplay`

### IPC Communication

Renderer calls main process via `window.electronAPI`:
- `selectDirectory()`, `openDirectory(path)` - File system dialogs
- `selectModelFile()`, `selectImageFile()` - Asset import dialogs
- `saveState(state)`, `loadState()` - Persistence via electron-store
- `readFile(path)` - Read files for textures/models

### TypeScript Configuration

Two separate tsconfig files:
- `tsconfig.json` - Renderer (ESNext modules, JSX, no emit - Vite handles bundling)
- `tsconfig.main.json` - Main process (CommonJS, emits to `dist/main/`)

### Tunnel Constants

Defined in `sceneStore.ts`:
- `TUNNEL_WIDTH = 16`, `TUNNEL_HEIGHT = 10`
- `SIGN_INTERVAL = 100` (meters), `LIGHT_INTERVAL = 50` (meters)
- Signs and lights auto-generate as user scrolls deeper

### Scene Settings

`SceneSettings` controls runtime appearance:
- `lightBrightness`, `envBrightness`, `drawDistance`, `haziness`, `navigationSpeed`
- Per-wall settings: `color`, `brightness`, `opacity`, `wallpaperPath`

### Decorating Mode (3D Wall Drawing)

Double-click a wall to enter decorating mode. The drawing system uses:
- `DecoratingDrawingSurface` in Scene.tsx - Handles raycasting and stroke capture inside the 3D canvas
- `DecoratingMode3D.tsx` - Toolbar overlay (color, size, style, undo/redo)
- `DecoratingToolbar.tsx` - Info display showing wall name and depth
- Brush settings are synced via `decoratingBrushSettings` in the store

## Known Issues (See TODO.md)

### Drawing Mechanism - HIGH PRIORITY
The 3D wall drawing in decorating mode has issues that need fixing:
1. **Stuttering** - Drawing is choppy, needs smoother updates
2. **Straight lines** - Curves not rendering properly, showing as line segments
3. **~1m offset** - Paint appears offset from cursor position (coordinate transform bug)

Investigation areas:
- `worldToCanvas()` coordinate transformation
- `getCanvasPoint()` raycasting logic
- Camera position offset in decorating mode
- Texture update frequency
