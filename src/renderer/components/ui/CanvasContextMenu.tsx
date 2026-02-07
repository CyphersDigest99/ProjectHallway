import React, { useEffect, useRef } from 'react';
import { AnyCanvasItem, WallTextureType, WallSide } from '../../../shared/types';
import { useSceneStore } from '../../store/sceneStore';
import { useShallow } from 'zustand/react/shallow';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  selectedItem?: AnyCanvasItem | null;
  wall: WallSide;
  sectionId: string;
  onClose: () => void;
  onAddImage: () => void;
  onAddTextBox: () => void;
  onAddDirectoryShortcut: () => void;
  onAddHyperlink: () => void;
  onAddAppShortcut: () => void;
  onAddFileShortcut: () => void;
  onChangeWallColor: () => void;
}

const TEXTURE_OPTIONS: { value: WallTextureType; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'metal', label: 'Metal' },
  { value: 'stucco', label: 'Stucco' },
  { value: 'wood', label: 'Wood' },
  { value: 'glass', label: 'Glass' },
  { value: 'brick', label: 'Brick' },
  { value: 'concrete', label: 'Concrete' },
];

export const CanvasContextMenu: React.FC<CanvasContextMenuProps> = ({
  x,
  y,
  selectedItem,
  wall,
  sectionId,
  onClose,
  onAddImage,
  onAddTextBox,
  onAddDirectoryShortcut,
  onAddHyperlink,
  onAddAppShortcut,
  onAddFileShortcut,
  onChangeWallColor,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { removeCanvasItem, bringToFront, sendToBack, updateWallSection, wallSections, exitCanvasMode } = useSceneStore(useShallow(s => ({
    removeCanvasItem: s.removeCanvasItem,
    bringToFront: s.bringToFront,
    sendToBack: s.sendToBack,
    updateWallSection: s.updateWallSection,
    wallSections: s.wallSections,
    exitCanvasMode: s.exitCanvasMode,
  })));
  const [showTextureSubmenu, setShowTextureSubmenu] = React.useState(false);

  const currentSection = wallSections.find((s) => s.id === sectionId);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 400);

  const handleDelete = () => {
    if (selectedItem) {
      removeCanvasItem(selectedItem.id);
    }
    onClose();
  };

  const handleBringToFront = () => {
    if (selectedItem) {
      bringToFront(selectedItem.id);
    }
    onClose();
  };

  const handleSendToBack = () => {
    if (selectedItem) {
      sendToBack(selectedItem.id);
    }
    onClose();
  };

  const handleTextureChange = (texture: WallTextureType) => {
    updateWallSection(sectionId, { texture });
    setShowTextureSubmenu(false);
    onClose();
  };

  const handleExitCanvas = () => {
    exitCanvasMode();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="context-menu canvas-context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {/* Selected item actions */}
      {selectedItem && selectedItem.type !== 'drawing' && (
        <>
          <div
            className="context-menu-item danger"
            onClick={handleDelete}
          >
            Delete
          </div>
          <div className="context-menu-divider" />
          <div
            className="context-menu-item"
            onClick={handleBringToFront}
          >
            Bring to Front
          </div>
          <div
            className="context-menu-item"
            onClick={handleSendToBack}
          >
            Send to Back
          </div>
          <div className="context-menu-divider" />
        </>
      )}

      {/* Add items */}
      <div
        className="context-menu-item"
        onClick={() => {
          onAddImage();
          onClose();
        }}
      >
        Add Image...
      </div>
      <div
        className="context-menu-item"
        onClick={() => {
          onAddTextBox();
          onClose();
        }}
      >
        Add Text Box
      </div>

      <div className="context-menu-divider" />

      {/* Wall customization */}
      <div
        className="context-menu-item"
        onClick={() => {
          onChangeWallColor();
          onClose();
        }}
      >
        Change Wall Color
      </div>

      <div
        className="context-menu-item has-submenu"
        onMouseEnter={() => setShowTextureSubmenu(true)}
        onMouseLeave={() => setShowTextureSubmenu(false)}
      >
        Change Texture
        <span className="submenu-arrow">▶</span>

        {showTextureSubmenu && (
          <div className="context-submenu">
            {TEXTURE_OPTIONS.map((option) => (
              <div
                key={option.value}
                className={`context-menu-item ${currentSection?.texture === option.value ? 'selected' : ''}`}
                onClick={() => handleTextureChange(option.value)}
              >
                {option.label}
                {currentSection?.texture === option.value && (
                  <span className="check-mark">✓</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="context-menu-divider" />

      {/* Shortcuts */}
      <div
        className="context-menu-item"
        onClick={() => {
          onAddDirectoryShortcut();
          onClose();
        }}
      >
        Add Directory Shortcut...
      </div>
      <div
        className="context-menu-item"
        onClick={() => {
          onAddHyperlink();
          onClose();
        }}
      >
        Add Hyperlink...
      </div>
      <div
        className="context-menu-item"
        onClick={() => {
          onAddAppShortcut();
          onClose();
        }}
      >
        Add App Shortcut...
      </div>
      <div
        className="context-menu-item"
        onClick={() => {
          onAddFileShortcut();
          onClose();
        }}
      >
        Add File Shortcut...
      </div>

      <div className="context-menu-divider" />

      <div
        className="context-menu-item"
        onClick={handleExitCanvas}
      >
        Exit Canvas Mode
      </div>

      <style>{`
        .canvas-context-menu {
          min-width: 180px;
        }

        .context-menu-item.has-submenu {
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: relative;
        }

        .submenu-arrow {
          font-size: 10px;
          opacity: 0.6;
        }

        .context-submenu {
          position: absolute;
          left: 100%;
          top: -4px;
          background: rgba(26, 26, 46, 0.98);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 6px;
          padding: 4px 0;
          min-width: 120px;
          z-index: 1001;
        }

        .context-menu-item.selected {
          color: #4ecdc4;
        }

        .check-mark {
          margin-left: 8px;
          color: #4ecdc4;
        }
      `}</style>
    </div>
  );
};
