import React, { useState, useCallback, useRef } from 'react';

interface ResizeHandlesProps {
  bounds: { x: number; y: number; width: number; height: number };
  onResize: (newBounds: { x: number; y: number; width: number; height: number }) => void;
  preserveAspectRatio?: boolean;
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
}

type HandlePosition = 'nw' | 'ne' | 'sw' | 'se';

export const ResizeHandles: React.FC<ResizeHandlesProps> = ({
  bounds,
  onResize,
  preserveAspectRatio = true,
  minSize = { width: 20, height: 20 },
  maxSize,
}) => {
  const [activeHandle, setActiveHandle] = useState<HandlePosition | null>(null);
  // Use ref to capture the initial bounds at mousedown
  const initialBoundsRef = useRef(bounds);

  const handleMouseDown = useCallback((e: React.MouseEvent, handle: HandlePosition) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveHandle(handle);

    // Capture the current bounds at the start of the drag
    const initialBounds = { ...bounds };
    initialBoundsRef.current = initialBounds;
    const startX = e.clientX;
    const startY = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      let newBounds = { ...initialBounds };

      // Calculate aspect ratio from original bounds
      const aspectRatio = initialBounds.width / initialBounds.height;

      switch (handle) {
        case 'nw':
          if (preserveAspectRatio && !moveEvent.shiftKey) {
            const delta = Math.max(Math.abs(dx), Math.abs(dy));
            const signX = dx < 0 ? -1 : 1;
            const signY = dy < 0 ? -1 : 1;
            const avgSign = signX === signY ? -1 : 1;
            newBounds.width = initialBounds.width - avgSign * delta;
            newBounds.height = newBounds.width / aspectRatio;
            newBounds.x = initialBounds.x + (initialBounds.width - newBounds.width);
            newBounds.y = initialBounds.y + (initialBounds.height - newBounds.height);
          } else {
            newBounds.x = initialBounds.x + dx;
            newBounds.y = initialBounds.y + dy;
            newBounds.width = initialBounds.width - dx;
            newBounds.height = initialBounds.height - dy;
          }
          break;
        case 'ne':
          if (preserveAspectRatio && !moveEvent.shiftKey) {
            const delta = Math.max(Math.abs(dx), Math.abs(dy));
            const signX = dx > 0 ? 1 : -1;
            const signY = dy < 0 ? 1 : -1;
            const avgSign = signX === signY ? 1 : -1;
            newBounds.width = initialBounds.width + avgSign * delta;
            newBounds.height = newBounds.width / aspectRatio;
            newBounds.y = initialBounds.y + (initialBounds.height - newBounds.height);
          } else {
            newBounds.y = initialBounds.y + dy;
            newBounds.width = initialBounds.width + dx;
            newBounds.height = initialBounds.height - dy;
          }
          break;
        case 'sw':
          if (preserveAspectRatio && !moveEvent.shiftKey) {
            const delta = Math.max(Math.abs(dx), Math.abs(dy));
            const signX = dx < 0 ? -1 : 1;
            const signY = dy > 0 ? 1 : -1;
            const avgSign = signX === signY ? -1 : 1;
            newBounds.width = initialBounds.width - avgSign * delta;
            newBounds.height = newBounds.width / aspectRatio;
            newBounds.x = initialBounds.x + (initialBounds.width - newBounds.width);
          } else {
            newBounds.x = initialBounds.x + dx;
            newBounds.width = initialBounds.width - dx;
            newBounds.height = initialBounds.height + dy;
          }
          break;
        case 'se':
          if (preserveAspectRatio && !moveEvent.shiftKey) {
            const delta = Math.max(Math.abs(dx), Math.abs(dy));
            const sign = (dx > 0 || dy > 0) ? 1 : -1;
            newBounds.width = initialBounds.width + sign * delta;
            newBounds.height = newBounds.width / aspectRatio;
          } else {
            newBounds.width = initialBounds.width + dx;
            newBounds.height = initialBounds.height + dy;
          }
          break;
      }

      // Apply constraints
      newBounds.width = Math.max(minSize.width, newBounds.width);
      newBounds.height = Math.max(minSize.height, newBounds.height);

      if (maxSize) {
        newBounds.width = Math.min(maxSize.width, newBounds.width);
        newBounds.height = Math.min(maxSize.height, newBounds.height);
      }

      // Ensure bounds don't go negative
      if (newBounds.x < 0) {
        newBounds.width += newBounds.x;
        newBounds.x = 0;
      }
      if (newBounds.y < 0) {
        newBounds.height += newBounds.y;
        newBounds.y = 0;
      }

      onResize(newBounds);
    };

    const handleMouseUp = () => {
      setActiveHandle(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [bounds, onResize, preserveAspectRatio, minSize, maxSize]);

  const handleStyle = (position: HandlePosition): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      width: '12px',
      height: '12px',
      backgroundColor: '#4ecdc4',
      border: '2px solid #fff',
      borderRadius: '2px',
      cursor: position === 'nw' || position === 'se' ? 'nwse-resize' : 'nesw-resize',
      zIndex: 1000,
    };

    switch (position) {
      case 'nw':
        return { ...base, left: '-6px', top: '-6px' };
      case 'ne':
        return { ...base, right: '-6px', top: '-6px' };
      case 'sw':
        return { ...base, left: '-6px', bottom: '-6px' };
      case 'se':
        return { ...base, right: '-6px', bottom: '-6px' };
    }
  };

  return (
    <>
      {(['nw', 'ne', 'sw', 'se'] as HandlePosition[]).map((position) => (
        <div
          key={position}
          style={handleStyle(position)}
          onMouseDown={(e) => handleMouseDown(e, position)}
        />
      ))}
    </>
  );
};
