import React, { useEffect, useRef } from 'react';
import { SceneObject } from '../../../shared/types';

interface ContextMenuProps {
  x: number;
  y: number;
  object: SceneObject;
  onClose: () => void;
  onAssignDirectory: () => void;
  onChangeColor: (color: string) => void;
  onRename: () => void;
  onDelete: () => void;
}

const COLORS = [
  '#4ecdc4', '#ff6b6b', '#ffe66d', '#95e1d3', '#dda0dd',
  '#87ceeb', '#ffa07a', '#98d8c8', '#f7dc6f', '#bb8fce',
];

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  object,
  onClose,
  onAssignDirectory,
  onChangeColor,
  onRename,
  onDelete,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu on screen
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 300);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div
        className="context-menu-item"
        onClick={() => {
          onAssignDirectory();
          onClose();
        }}
      >
        📁 {object.directoryPath ? 'Change Directory' : 'Assign Directory'}
      </div>

      {object.directoryPath && (
        <div className="context-menu-item" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', pointerEvents: 'none' }}>
          Current: {object.directoryPath.split(/[/\\]/).pop()}
        </div>
      )}

      {object.directoryPath && (
        <div
          className="context-menu-item"
          onClick={() => {
            window.electronAPI.openDirectory(object.directoryPath!);
            onClose();
          }}
        >
          {'📂 Open in Explorer'}
        </div>
      )}

      <div className="context-menu-divider" />

      <div
        className="context-menu-item"
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        ✏️ Rename
      </div>

      {object.type !== 'image' && object.type !== 'model' && (
        <>
          <div className="context-menu-divider" />
          <div className="color-picker-container">
            <div className="color-picker-label">Color</div>
            <div className="color-picker-grid">
              {COLORS.map((color) => (
                <div
                  key={color}
                  className={`color-swatch ${object.color === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    onChangeColor(color);
                    onClose();
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="context-menu-divider" />

      <div
        className="context-menu-item danger"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        🗑️ Delete
      </div>
    </div>
  );
};
