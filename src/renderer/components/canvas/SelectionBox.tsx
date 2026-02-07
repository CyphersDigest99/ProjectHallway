import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AnyCanvasItem } from '../../../shared/types';

interface SelectionBoxProps {
  items: AnyCanvasItem[];
  onSelectionChange: (ids: string[], additive: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

interface BoxCoords {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export const SelectionBox: React.FC<SelectionBoxProps> = ({
  items,
  onSelectionChange,
  containerRef,
}) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [box, setBox] = useState<BoxCoords | null>(null);
  const shiftKeyRef = useRef(false);

  // Track shift key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftKeyRef.current = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftKeyRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const getContainerOffset = useCallback(() => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  }, [containerRef]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start selection on left click directly on container (not on items)
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.canvas-item')) return;

    const offset = getContainerOffset();
    const startX = e.clientX - offset.x;
    const startY = e.clientY - offset.y;

    setIsSelecting(true);
    setBox({
      startX,
      startY,
      endX: startX,
      endY: startY,
    });
  }, [getContainerOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !box) return;

    const offset = getContainerOffset();
    const endX = e.clientX - offset.x;
    const endY = e.clientY - offset.y;

    setBox({
      ...box,
      endX,
      endY,
    });
  }, [isSelecting, box, getContainerOffset]);

  const handleMouseUp = useCallback(() => {
    if (!isSelecting || !box) {
      setIsSelecting(false);
      setBox(null);
      return;
    }

    // Calculate normalized box (ensure min < max)
    const left = Math.min(box.startX, box.endX);
    const right = Math.max(box.startX, box.endX);
    const top = Math.min(box.startY, box.endY);
    const bottom = Math.max(box.startY, box.endY);

    // Only select if box is at least 5px in both dimensions
    if (right - left > 5 && bottom - top > 5) {
      // Find items that intersect with the selection box
      const selectedIds = items
        .filter((item) => {
          const itemLeft = item.position.x;
          const itemRight = item.position.x + item.size.width;
          const itemTop = item.position.y;
          const itemBottom = item.position.y + item.size.height;

          // Check for intersection
          return (
            itemLeft < right &&
            itemRight > left &&
            itemTop < bottom &&
            itemBottom > top
          );
        })
        .map((item) => item.id);

      if (selectedIds.length > 0) {
        onSelectionChange(selectedIds, shiftKeyRef.current);
      }
    }

    setIsSelecting(false);
    setBox(null);
  }, [isSelecting, box, items, onSelectionChange]);

  // Calculate display box coordinates
  const displayBox = box
    ? {
        left: Math.min(box.startX, box.endX),
        top: Math.min(box.startY, box.endY),
        width: Math.abs(box.endX - box.startX),
        height: Math.abs(box.endY - box.startY),
      }
    : null;

  return (
    <div
      className="selection-box-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {isSelecting && displayBox && displayBox.width > 5 && displayBox.height > 5 && (
        <div
          className="selection-box"
          style={{
            left: displayBox.left,
            top: displayBox.top,
            width: displayBox.width,
            height: displayBox.height,
          }}
        />
      )}

      <style>{`
        .selection-box-container {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
        }

        .selection-box-container > * {
          pointer-events: auto;
        }

        .selection-box {
          position: absolute;
          border: 2px dashed #4ecdc4;
          background: rgba(78, 205, 196, 0.1);
          pointer-events: none;
          z-index: 100;
        }
      `}</style>
    </div>
  );
};

// Hook for handling Shift+Click additive selection
export const useAdditiveSelection = (
  selectedIds: Set<string>,
  onSelect: (ids: string[], additive: boolean) => void
) => {
  const handleItemClick = useCallback(
    (itemId: string, e: React.MouseEvent | { shiftKey?: boolean }) => {
      const additive = e.shiftKey || false;

      if (additive) {
        // Toggle selection for this item
        if (selectedIds.has(itemId)) {
          const newIds = Array.from(selectedIds).filter((id) => id !== itemId);
          onSelect(newIds, false);
        } else {
          onSelect([...Array.from(selectedIds), itemId], false);
        }
      } else {
        // Replace selection
        onSelect([itemId], false);
      }
    },
    [selectedIds, onSelect]
  );

  return handleItemClick;
};
