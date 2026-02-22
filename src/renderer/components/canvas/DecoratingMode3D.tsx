import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import { useShallow } from 'zustand/react/shallow';
import { DecoratingInfo } from './DecoratingToolbar';
import { CanvasToolbar, CanvasTool } from './CanvasToolbar';
import { DrawingStyle, CanvasDrawingItem, AnyCanvasItem } from '../../../shared/types';

// Wall dimensions for canvas coordinate system
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;
const SECTION_LENGTH = 10;

interface DecoratingMode3DProps {
  onContextMenu: (e: React.MouseEvent, item?: AnyCanvasItem) => void;
}

// Main decorating mode overlay component (toolbar only - drawing happens in Scene.tsx)
export const DecoratingMode3D: React.FC<DecoratingMode3DProps> = ({ onContextMenu }) => {
  const {
    decoratingState,
    canvasItems,
    wallSections,
    addCanvasItem,
    exitDecoratingMode,
    moveDecoratingCamera,
    undoStroke,
    redoStroke,
    canUndo,
    canRedo,
    generateSectionsUpToDepth,
    maxGeneratedSectionDepth,
    copySelectedItems,
    pasteItems,
    setDecoratingBrushSettings,
  } = useSceneStore(useShallow(s => ({
    decoratingState: s.decoratingState,
    canvasItems: s.canvasItems,
    wallSections: s.wallSections,
    addCanvasItem: s.addCanvasItem,
    exitDecoratingMode: s.exitDecoratingMode,
    moveDecoratingCamera: s.moveDecoratingCamera,
    undoStroke: s.undoStroke,
    redoStroke: s.redoStroke,
    canUndo: s.canUndo,
    canRedo: s.canRedo,
    generateSectionsUpToDepth: s.generateSectionsUpToDepth,
    maxGeneratedSectionDepth: s.maxGeneratedSectionDepth,
    copySelectedItems: s.copySelectedItems,
    pasteItems: s.pasteItems,
    setDecoratingBrushSettings: s.setDecoratingBrushSettings,
  })));

  const [currentTool, setCurrentTool] = useState<CanvasTool>('draw');
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [brushSize, setBrushSize] = useState(10);
  const [brushStyle, setBrushStyle] = useState<DrawingStyle>('spray');

  const wall = decoratingState?.wall;
  const zPosition = decoratingState?.zPosition ?? 0;

  // Sync brush settings to store so Scene can access them
  useEffect(() => {
    if (setDecoratingBrushSettings) {
      setDecoratingBrushSettings({
        tool: currentTool,
        color: brushColor,
        size: brushSize,
        style: brushStyle,
      });
    }
  }, [currentTool, brushColor, brushSize, brushStyle, setDecoratingBrushSettings]);

  // Get visible sections for current wall
  const visibleSections = useMemo(() => {
    if (!wall) return [];
    const buffer = SECTION_LENGTH;
    return wallSections.filter(section =>
      section.wall === wall &&
      section.zEnd > zPosition - buffer &&
      section.zStart < zPosition + SECTION_LENGTH + buffer
    ).sort((a, b) => a.zStart - b.zStart);
  }, [wallSections, wall, zPosition]);

  // Get active section (centered on camera)
  const activeSection = useMemo(() => {
    const centerZ = zPosition + SECTION_LENGTH / 2;
    return visibleSections.find(s => centerZ >= s.zStart && centerZ < s.zEnd);
  }, [visibleSections, zPosition]);

  // Ensure a drawing exists for the active section and its neighbors
  // (needed so strokes that cross section boundaries can be saved)
  useEffect(() => {
    if (currentTool === 'draw' && activeSection && wall) {
      // Find active + adjacent sections
      const sectionsToCheck = [activeSection];
      const prev = wallSections.find(s => s.wall === wall && s.zEnd === activeSection.zStart);
      const next = wallSections.find(s => s.wall === wall && s.zStart === activeSection.zEnd);
      if (prev) sectionsToCheck.push(prev);
      if (next) sectionsToCheck.push(next);

      for (const section of sectionsToCheck) {
        const existingDrawing = canvasItems.find(
          item => item.type === 'drawing' && item.sectionId === section.id && item.wall === wall
        ) as CanvasDrawingItem | undefined;

        if (!existingDrawing) {
          addCanvasItem({
            type: 'drawing',
            wall,
            sectionId: section.id,
            position: { x: 0, y: 0 },
            size: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
            strokes: [],
          } as Omit<CanvasDrawingItem, 'id' | 'zIndex'>);
        }
      }
    }
  }, [currentTool, activeSection, wall, canvasItems, addCanvasItem, wallSections]);

  const handleNavigate = useCallback((delta: number) => {
    moveDecoratingCamera(delta);
    generateSectionsUpToDepth(zPosition + SECTION_LENGTH * 3);
  }, [moveDecoratingCamera, generateSectionsUpToDepth, zPosition]);

  const handleExit = useCallback(() => {
    exitDecoratingMode();
  }, [exitDecoratingMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoStroke();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redoStroke();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        copySelectedItems();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        pasteItems();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStroke, redoStroke, copySelectedItems, pasteItems]);

  if (!decoratingState || !wall) return null;

  return (
    <>
      {/* Info display at top of screen */}
      <DecoratingInfo
        wall={wall}
        zPosition={zPosition}
      />

      {/* Drawing tools toolbar at bottom */}
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
        onNavigateLeft={() => handleNavigate(wall === 'right' ? 2 : -2)}
        onNavigateRight={() => handleNavigate(wall === 'right' ? -2 : 2)}
        onHoldStart={() => {}}
        onHoldEnd={() => {}}
        isHoldingLeft={false}
        isHoldingRight={false}
      />
    </>
  );
};
