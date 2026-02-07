import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import { CanvasToolbar, CanvasTool } from './CanvasToolbar';
import { CanvasItem } from './CanvasItem';
import { DrawingCanvas } from './DrawingCanvas';
import { DrawingStyle, DrawingStroke, CanvasDrawingItem, AnyCanvasItem, WallSide, WallSection } from '../../../shared/types';

interface CanvasModeProps {
  onContextMenu: (e: React.MouseEvent, item?: AnyCanvasItem) => void;
}

// Wall dimensions in pixels for canvas mode
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;
const SECTION_LENGTH = 10; // meters per wall section (must match store)
const PIXELS_PER_METER = CANVAS_WIDTH / SECTION_LENGTH;

// Get canvas dimensions based on wall
const getWallDimensions = (wall: WallSide): { width: number; height: number } => {
  switch (wall) {
    case 'left':
    case 'right':
      return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
    case 'floor':
    case 'ceiling':
      return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  }
};

// Mini-map component
const MiniMap: React.FC<{
  currentPosition: number;
  maxExploredDepth: number;
  wallSections: WallSection[];
  wall: WallSide;
  canvasItems: AnyCanvasItem[];
}> = ({ currentPosition, maxExploredDepth, wallSections, wall, canvasItems }) => {
  const mapWidth = 300;
  const mapHeight = 30;
  const visibleRange = SECTION_LENGTH; // 10m visible at a time

  // Calculate scale (how many pixels per meter in the mini-map)
  const totalDepth = Math.max(maxExploredDepth, currentPosition + visibleRange, 100);
  const scale = mapWidth / totalDepth;

  // Get sections with content for this wall
  const sectionsWithContent = useMemo(() => {
    const sectionIds = new Set(
      canvasItems
        .filter(item => item.wall === wall && item.type !== 'drawing')
        .map(item => item.sectionId)
    );
    // Also check for drawings with strokes
    canvasItems
      .filter(item => item.wall === wall && item.type === 'drawing' && (item as CanvasDrawingItem).strokes.length > 0)
      .forEach(item => sectionIds.add(item.sectionId));
    return sectionIds;
  }, [canvasItems, wall]);

  // Get section positions for markers
  const contentMarkers = useMemo(() => {
    return wallSections
      .filter(section => section.wall === wall && sectionsWithContent.has(section.id))
      .map(section => ({
        x: section.zStart * scale,
        width: SECTION_LENGTH * scale,
      }));
  }, [wallSections, wall, sectionsWithContent, scale]);

  const viewportLeft = currentPosition * scale;
  const viewportWidth = visibleRange * scale;

  return (
    <div className="mini-map-container">
      <div className="mini-map-label">
        <span className="mini-map-position">{currentPosition.toFixed(1)}m</span>
        <span className="mini-map-total">/ {totalDepth.toFixed(0)}m</span>
      </div>
      <div className="mini-map" style={{ width: mapWidth, height: mapHeight }}>
        {/* Background track */}
        <div className="mini-map-track" />

        {/* Content markers - sections with decorations */}
        {contentMarkers.map((marker, i) => (
          <div
            key={i}
            className="mini-map-content"
            style={{
              left: marker.x,
              width: marker.width,
            }}
          />
        ))}

        {/* Viewport indicator */}
        <div
          className="mini-map-viewport"
          style={{
            left: viewportLeft,
            width: viewportWidth,
          }}
        />

        {/* Position marker */}
        <div
          className="mini-map-marker"
          style={{
            left: (currentPosition + visibleRange / 2) * scale - 4,
          }}
        />
      </div>
    </div>
  );
};

export const CanvasMode: React.FC<CanvasModeProps> = ({ onContextMenu }) => {
  const {
    canvasModeState,
    canvasItems,
    wallSections,
    selectedCanvasItemId,
    selectCanvasItem,
    addCanvasItem,
    addStrokeToDrawing,
    exitCanvasMode,
    undoStroke,
    redoStroke,
    canUndo,
    canRedo,
    updateCanvasZPosition,
    getWallSectionAt,
    generateSectionsUpToDepth,
    maxGeneratedSectionDepth,
  } = useSceneStore();

  const [currentTool, setCurrentTool] = useState<CanvasTool>('draw');
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [brushSize, setBrushSize] = useState(10);
  const [brushStyle, setBrushStyle] = useState<DrawingStyle>('spray');

  // Navigation hold state
  const [holdDirection, setHoldDirection] = useState<'left' | 'right' | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const holdTimeoutRef = useRef<number | null>(null);

  const wall = canvasModeState?.wall;
  const zPosition = canvasModeState?.zPosition ?? 0;

  // Calculate viewport bounds (what range of z is visible)
  const viewportLeft = zPosition;
  const viewportRight = zPosition + SECTION_LENGTH;

  // Get all wall sections that overlap with the viewport (with some buffer)
  const visibleSections = useMemo(() => {
    if (!wall) return [];
    const buffer = SECTION_LENGTH; // Show one extra section on each side for smooth transitions
    return wallSections.filter(section =>
      section.wall === wall &&
      section.zEnd > viewportLeft - buffer &&
      section.zStart < viewportRight + buffer
    ).sort((a, b) => a.zStart - b.zStart);
  }, [wallSections, wall, viewportLeft, viewportRight]);

  // Get all canvas items for visible sections
  const visibleItems = useMemo(() => {
    if (!wall) return [];
    const sectionIds = new Set(visibleSections.map(s => s.id));
    return canvasItems.filter(
      item => item.wall === wall && sectionIds.has(item.sectionId)
    );
  }, [canvasItems, wall, visibleSections]);

  // Calculate screen position for an item based on its section and scroll position
  const getItemScreenPosition = useCallback((item: AnyCanvasItem, section: WallSection) => {
    // Item's world z position (left edge of item in world coordinates)
    const itemWorldZ = section.zStart + (item.position.x / CANVAS_WIDTH) * SECTION_LENGTH;
    // Convert to screen x position
    const screenX = (itemWorldZ - viewportLeft) * PIXELS_PER_METER;
    return {
      x: screenX,
      y: item.position.y,
    };
  }, [viewportLeft]);

  // Get or create drawing item for the active section (section containing viewport center)
  const activeSection = useMemo(() => {
    const centerZ = zPosition + SECTION_LENGTH / 2;
    return visibleSections.find(s => centerZ >= s.zStart && centerZ < s.zEnd);
  }, [visibleSections, zPosition]);

  const [activeDrawingId, setActiveDrawingId] = useState<string | null>(null);

  // Get drawing items for all visible sections
  const visibleDrawings = useMemo(() => {
    return visibleItems
      .filter(item => item.type === 'drawing')
      .map(item => {
        const section = visibleSections.find(s => s.id === item.sectionId);
        if (!section) return null;
        return {
          drawing: item as CanvasDrawingItem,
          section,
          offsetX: (section.zStart - viewportLeft) * PIXELS_PER_METER,
        };
      })
      .filter(Boolean) as { drawing: CanvasDrawingItem; section: WallSection; offsetX: number }[];
  }, [visibleItems, visibleSections, viewportLeft]);

  // Ensure drawing exists for active section
  useEffect(() => {
    if (currentTool === 'draw' && activeSection && wall) {
      const existingDrawing = canvasItems.find(
        item => item.type === 'drawing' && item.sectionId === activeSection.id && item.wall === wall
      ) as CanvasDrawingItem | undefined;

      if (!existingDrawing) {
        const dimensions = getWallDimensions(wall);
        const newDrawing = addCanvasItem({
          type: 'drawing',
          wall,
          sectionId: activeSection.id,
          position: { x: 0, y: 0 },
          size: { width: dimensions.width, height: dimensions.height },
          strokes: [],
        } as Omit<CanvasDrawingItem, 'id' | 'zIndex'>);
        setActiveDrawingId(newDrawing.id);
      } else {
        setActiveDrawingId(existingDrawing.id);
      }
    }
  }, [currentTool, activeSection, wall, canvasItems, addCanvasItem]);

  const handleStrokeComplete = useCallback((stroke: DrawingStroke) => {
    if (activeDrawingId) {
      addStrokeToDrawing(activeDrawingId, stroke);
    }
  }, [activeDrawingId, addStrokeToDrawing]);

  const handleContainerClick = useCallback(() => {
    selectCanvasItem(null);
  }, [selectCanvasItem]);

  const handleExit = useCallback(() => {
    exitCanvasMode();
  }, [exitCanvasMode]);

  // Navigation handlers
  const handleNavigateLeft = useCallback(() => {
    updateCanvasZPosition(-2); // Move 2m per click
  }, [updateCanvasZPosition]);

  const handleNavigateRight = useCallback(() => {
    updateCanvasZPosition(2); // Move 2m per click
    // Ensure sections are generated ahead
    generateSectionsUpToDepth(zPosition + SECTION_LENGTH * 3);
  }, [updateCanvasZPosition, generateSectionsUpToDepth, zPosition]);

  const handleHoldStart = useCallback((direction: 'left' | 'right') => {
    setHoldDirection(direction);
    holdTimeoutRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => {
        updateCanvasZPosition(direction === 'left' ? -0.1 : 0.1); // 2m/s at 50ms intervals
        if (direction === 'right') {
          generateSectionsUpToDepth(zPosition + SECTION_LENGTH * 3);
        }
      }, 50);
    }, 200);
  }, [updateCanvasZPosition, generateSectionsUpToDepth, zPosition]);

  const handleHoldEnd = useCallback(() => {
    setHoldDirection(null);
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    };
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitCanvasMode();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoStroke();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redoStroke();
      }
      // Arrow key navigation
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateCanvasZPosition(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateCanvasZPosition(1);
        generateSectionsUpToDepth(zPosition + SECTION_LENGTH * 3);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exitCanvasMode, undoStroke, redoStroke, updateCanvasZPosition, generateSectionsUpToDepth, zPosition]);

  if (!canvasModeState || !wall) return null;

  const wallDimensions = getWallDimensions(wall);
  const wallName = wall.charAt(0).toUpperCase() + wall.slice(1);

  // Get non-drawing items with their screen positions
  const itemsToRender = visibleItems
    .filter(item => item.type !== 'drawing')
    .map(item => {
      const section = visibleSections.find(s => s.id === item.sectionId);
      if (!section) return null;
      const screenPos = getItemScreenPosition(item, section);
      // Check if item is at least partially visible
      if (screenPos.x + item.size.width < -50 || screenPos.x > CANVAS_WIDTH + 50) {
        return null;
      }
      return { item, screenPos, section };
    })
    .filter(Boolean) as { item: AnyCanvasItem; screenPos: { x: number; y: number }; section: WallSection }[];

  return (
    <div className="canvas-mode-overlay">
      <div className="canvas-mode-header">
        <span className="canvas-mode-title">
          Decorating: {wallName} Wall
        </span>
        <MiniMap
          currentPosition={zPosition}
          maxExploredDepth={maxGeneratedSectionDepth}
          wallSections={wallSections}
          wall={wall}
          canvasItems={canvasItems}
        />
        <span className="canvas-mode-hint">
          Use arrow buttons or keyboard arrows to scroll along wall
        </span>
      </div>

      <div
        className="canvas-mode-container"
        onClick={handleContainerClick}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e);
        }}
        style={{
          width: wallDimensions.width,
          height: wallDimensions.height,
        }}
      >
        {/* Drawing canvases for visible sections */}
        {visibleDrawings.map(({ drawing, section, offsetX }) => (
          <div
            key={drawing.id}
            className="section-drawing-layer"
            style={{
              position: 'absolute',
              left: offsetX,
              top: 0,
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              pointerEvents: section.id === activeSection?.id ? 'auto' : 'none',
            }}
          >
            <DrawingCanvas
              width={wallDimensions.width}
              height={wallDimensions.height}
              existingStrokes={drawing.strokes}
              isDrawing={currentTool === 'draw' && section.id === activeSection?.id}
              brushColor={brushColor}
              brushSize={brushSize}
              brushStyle={brushStyle}
              onStrokeComplete={section.id === activeSection?.id ? handleStrokeComplete : () => {}}
            />
          </div>
        ))}

        {/* Canvas items layer - positioned based on scroll */}
        {itemsToRender.map(({ item, screenPos }) => (
          <CanvasItem
            key={item.id}
            item={{
              ...item,
              position: screenPos, // Override position with screen position
            }}
            isSelected={selectedCanvasItemId === item.id}
            onSelect={() => selectCanvasItem(item.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              selectCanvasItem(item.id);
              onContextMenu(e, item);
            }}
            wallDimensions={wallDimensions}
          />
        ))}

        {/* Section boundary indicators */}
        {visibleSections.map(section => {
          const leftEdgeX = (section.zStart - viewportLeft) * PIXELS_PER_METER;
          const rightEdgeX = (section.zEnd - viewportLeft) * PIXELS_PER_METER;
          return (
            <React.Fragment key={section.id}>
              {leftEdgeX > 0 && leftEdgeX < CANVAS_WIDTH && (
                <div
                  className="section-boundary"
                  style={{ left: leftEdgeX }}
                >
                  <span className="section-label">{section.zStart}m</span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <CanvasToolbar
        currentTool={currentTool}
        onToolChange={setCurrentTool}
        brushColor={brushColor}
        onColorChange={setBrushColor}
        brushSize={brushSize}
        onSizeChange={setBrushSize}
        brushStyle={brushStyle}
        onStyleChange={setBrushStyle}
        onUndo={undoStroke}
        onRedo={redoStroke}
        canUndo={canUndo()}
        canRedo={canRedo()}
        onExit={handleExit}
        onNavigateLeft={handleNavigateLeft}
        onNavigateRight={handleNavigateRight}
        onHoldStart={handleHoldStart}
        onHoldEnd={handleHoldEnd}
        isHoldingLeft={holdDirection === 'left'}
        isHoldingRight={holdDirection === 'right'}
      />

      <style>{`
        .canvas-mode-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 900;
        }

        .canvas-mode-header {
          position: absolute;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(26, 26, 46, 0.95);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 12px;
          padding: 12px 24px;
          color: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          min-width: 350px;
        }

        .canvas-mode-title {
          font-size: 14px;
          font-weight: 600;
          color: #4ecdc4;
        }

        .canvas-mode-hint {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.6);
        }

        .canvas-mode-container {
          position: relative;
          background: linear-gradient(135deg, #1a1a2e 0%, #0d1117 100%);
          border: 2px solid rgba(78, 205, 196, 0.3);
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 0 40px rgba(78, 205, 196, 0.1);
        }

        .section-drawing-layer {
          overflow: hidden;
        }

        .section-boundary {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: rgba(78, 205, 196, 0.2);
          pointer-events: none;
        }

        .section-boundary::before {
          content: '';
          position: absolute;
          top: 50%;
          left: -4px;
          width: 10px;
          height: 10px;
          background: rgba(78, 205, 196, 0.3);
          border-radius: 50%;
          transform: translateY(-50%);
        }

        .section-label {
          position: absolute;
          top: 10px;
          left: 8px;
          font-size: 10px;
          color: rgba(78, 205, 196, 0.6);
          background: rgba(0, 0, 0, 0.5);
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
        }

        /* Mini-map styles */
        .mini-map-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          width: 100%;
        }

        .mini-map-label {
          display: flex;
          gap: 4px;
          font-size: 12px;
        }

        .mini-map-position {
          color: #4ecdc4;
          font-weight: 600;
          font-family: monospace;
        }

        .mini-map-total {
          color: rgba(255, 255, 255, 0.4);
          font-family: monospace;
        }

        .mini-map {
          position: relative;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 4px;
          overflow: hidden;
        }

        .mini-map-track {
          position: absolute;
          top: 50%;
          left: 4px;
          right: 4px;
          height: 2px;
          background: rgba(255, 255, 255, 0.1);
          transform: translateY(-50%);
          border-radius: 1px;
        }

        .mini-map-content {
          position: absolute;
          top: 8px;
          bottom: 8px;
          background: rgba(78, 205, 196, 0.2);
          border-radius: 2px;
        }

        .mini-map-viewport {
          position: absolute;
          top: 4px;
          bottom: 4px;
          background: rgba(78, 205, 196, 0.15);
          border: 1px solid rgba(78, 205, 196, 0.4);
          border-radius: 3px;
        }

        .mini-map-marker {
          position: absolute;
          top: 50%;
          width: 8px;
          height: 8px;
          background: #4ecdc4;
          border-radius: 50%;
          transform: translateY(-50%);
          box-shadow: 0 0 8px rgba(78, 205, 196, 0.6);
        }
      `}</style>
    </div>
  );
};
