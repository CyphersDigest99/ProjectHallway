import React, { useState } from 'react';
import { DrawingStyle } from '../../../shared/types';

export type CanvasTool = 'select' | 'draw';

interface CanvasToolbarProps {
  currentTool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  brushColor: string;
  onColorChange: (color: string) => void;
  brushSize: number;
  onSizeChange: (size: number) => void;
  brushStyle: DrawingStyle;
  onStyleChange: (style: DrawingStyle) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExit: () => void;
  // Navigation props
  onNavigateLeft: () => void;
  onNavigateRight: () => void;
  onHoldStart: (direction: 'left' | 'right') => void;
  onHoldEnd: () => void;
  isHoldingLeft: boolean;
  isHoldingRight: boolean;
}

const PRESET_COLORS = [
  '#ff0000', '#ff6b6b', '#ff9500', '#ffcc00',
  '#00ff00', '#4ecdc4', '#00aaff', '#0066ff',
  '#9b59b6', '#ff69b4', '#ffffff', '#000000',
];

const BRUSH_STYLES: { value: DrawingStyle; label: string; icon: string }[] = [
  { value: 'pen', label: 'Pen', icon: '✏️' },
  { value: 'marker', label: 'Marker', icon: '🖊️' },
  { value: 'spray', label: 'Spray Paint', icon: '🎨' },
  { value: 'highlighter', label: 'Highlighter', icon: '🖍️' },
  { value: 'eraser', label: 'Eraser', icon: '🧽' },
];

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  currentTool,
  onToolChange,
  brushColor,
  onColorChange,
  brushSize,
  onSizeChange,
  brushStyle,
  onStyleChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onExit,
  onNavigateLeft,
  onNavigateRight,
  onHoldStart,
  onHoldEnd,
  isHoldingLeft,
  isHoldingRight,
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);

  const currentStyleInfo = BRUSH_STYLES.find((s) => s.value === brushStyle) || BRUSH_STYLES[0];

  return (
    <div className="canvas-toolbar">
      {/* Left navigation arrow */}
      <button
        className={`canvas-toolbar-btn nav-btn ${isHoldingLeft ? 'active' : ''}`}
        onClick={onNavigateLeft}
        onMouseDown={() => onHoldStart('left')}
        onMouseUp={onHoldEnd}
        onMouseLeave={onHoldEnd}
        title="Navigate Left (hold for continuous)"
      >
        <span className="btn-icon nav-icon">◀</span>
      </button>

      <div className="canvas-toolbar-divider" />

      <div className="canvas-toolbar-group">
        <button
          className={`canvas-toolbar-btn ${currentTool === 'select' ? 'active' : ''}`}
          onClick={() => onToolChange('select')}
          title="Select Tool"
        >
          <span className="btn-icon">↖</span>
          <span className="btn-label">Select</span>
        </button>
        <button
          className={`canvas-toolbar-btn ${currentTool === 'draw' ? 'active' : ''}`}
          onClick={() => onToolChange('draw')}
          title="Draw Tool"
        >
          <span className="btn-icon">✎</span>
          <span className="btn-label">Draw</span>
        </button>
      </div>

      <div className="canvas-toolbar-divider" />

      <div className="canvas-toolbar-group">
        <div className="canvas-toolbar-label">Color:</div>
        <div
          className="color-swatch-btn"
          style={{ backgroundColor: brushColor }}
          onClick={() => setShowColorPicker(!showColorPicker)}
          title="Choose Color"
        />
        {showColorPicker && (
          <div className="color-picker-popup">
            <div className="color-presets">
              {PRESET_COLORS.map((color) => (
                <div
                  key={color}
                  className={`color-preset ${color === brushColor ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    onColorChange(color);
                    setShowColorPicker(false);
                  }}
                />
              ))}
            </div>
            <input
              type="color"
              value={brushColor}
              onChange={(e) => onColorChange(e.target.value)}
              className="color-input"
            />
          </div>
        )}
      </div>

      <div className="canvas-toolbar-divider" />

      <div className="canvas-toolbar-group">
        <div className="canvas-toolbar-label">Size:</div>
        <input
          type="range"
          min="1"
          max="50"
          value={brushSize}
          onChange={(e) => onSizeChange(parseInt(e.target.value, 10))}
          className="size-slider"
        />
        <span className="size-value">{brushSize}px</span>
      </div>

      <div className="canvas-toolbar-divider" />

      <div className="canvas-toolbar-group">
        <div className="canvas-toolbar-label">Style:</div>
        <button
          className="style-selector-btn"
          onClick={() => setShowStylePicker(!showStylePicker)}
        >
          <span>{currentStyleInfo.icon}</span>
          <span>{currentStyleInfo.label}</span>
          <span className="dropdown-arrow">▼</span>
        </button>
        {showStylePicker && (
          <div className="style-picker-popup">
            {BRUSH_STYLES.map((style) => (
              <div
                key={style.value}
                className={`style-option ${style.value === brushStyle ? 'selected' : ''}`}
                onClick={() => {
                  onStyleChange(style.value);
                  setShowStylePicker(false);
                }}
              >
                <span>{style.icon}</span>
                <span>{style.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="canvas-toolbar-divider" />

      <div className="canvas-toolbar-group">
        <button
          className={`canvas-toolbar-btn undo-redo-btn ${!canUndo ? 'disabled' : ''}`}
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <span className="btn-icon">↶</span>
          <span className="btn-label">Undo</span>
        </button>
        <button
          className={`canvas-toolbar-btn undo-redo-btn ${!canRedo ? 'disabled' : ''}`}
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          <span className="btn-icon">↷</span>
          <span className="btn-label">Redo</span>
        </button>
      </div>

      <div className="canvas-toolbar-spacer" />

      <button className="canvas-toolbar-btn exit-btn" onClick={onExit}>
        <span className="btn-label">Exit Canvas Mode</span>
      </button>

      <div className="canvas-toolbar-divider" />

      {/* Right navigation arrow */}
      <button
        className={`canvas-toolbar-btn nav-btn ${isHoldingRight ? 'active' : ''}`}
        onClick={onNavigateRight}
        onMouseDown={() => onHoldStart('right')}
        onMouseUp={onHoldEnd}
        onMouseLeave={onHoldEnd}
        title="Navigate Right (hold for continuous)"
      >
        <span className="btn-icon nav-icon">▶</span>
      </button>

      <style>{`
        .canvas-toolbar {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(26, 26, 46, 0.95);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 12px;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 1000;
          backdrop-filter: blur(10px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }

        .canvas-toolbar-group {
          display: flex;
          align-items: center;
          gap: 8px;
          position: relative;
        }

        .canvas-toolbar-label {
          color: rgba(255, 255, 255, 0.7);
          font-size: 12px;
          white-space: nowrap;
        }

        .canvas-toolbar-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 8px 12px;
          background: transparent;
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 8px;
          color: #fff;
          cursor: pointer;
          transition: all 0.2s;
        }

        .canvas-toolbar-btn:hover {
          background: rgba(78, 205, 196, 0.1);
          border-color: rgba(78, 205, 196, 0.5);
        }

        .canvas-toolbar-btn.active {
          background: rgba(78, 205, 196, 0.2);
          border-color: #4ecdc4;
        }

        .canvas-toolbar-btn .btn-icon {
          font-size: 18px;
        }

        .canvas-toolbar-btn .btn-label {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.8);
        }

        .canvas-toolbar-divider {
          width: 1px;
          height: 40px;
          background: rgba(78, 205, 196, 0.3);
        }

        .canvas-toolbar-spacer {
          flex: 1;
        }

        .color-swatch-btn {
          width: 28px;
          height: 28px;
          border-radius: 4px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          cursor: pointer;
          transition: all 0.2s;
        }

        .color-swatch-btn:hover {
          border-color: #4ecdc4;
          transform: scale(1.1);
        }

        .color-picker-popup {
          position: absolute;
          bottom: 50px;
          left: 0;
          background: rgba(26, 26, 46, 0.98);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 8px;
          padding: 12px;
          z-index: 1001;
        }

        .color-presets {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-bottom: 10px;
        }

        .color-preset {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          cursor: pointer;
          border: 2px solid transparent;
          transition: all 0.2s;
        }

        .color-preset:hover {
          transform: scale(1.15);
        }

        .color-preset.selected {
          border-color: #fff;
        }

        .color-input {
          width: 100%;
          height: 30px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .size-slider {
          width: 100px;
          accent-color: #4ecdc4;
        }

        .size-value {
          color: rgba(255, 255, 255, 0.7);
          font-size: 12px;
          min-width: 35px;
        }

        .style-selector-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: rgba(78, 205, 196, 0.1);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 6px;
          color: #fff;
          cursor: pointer;
          font-size: 12px;
        }

        .style-selector-btn:hover {
          background: rgba(78, 205, 196, 0.2);
        }

        .dropdown-arrow {
          font-size: 8px;
          opacity: 0.7;
        }

        .style-picker-popup {
          position: absolute;
          bottom: 50px;
          left: 0;
          background: rgba(26, 26, 46, 0.98);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 8px;
          padding: 6px;
          z-index: 1001;
          min-width: 140px;
        }

        .style-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          color: #fff;
          font-size: 13px;
          transition: all 0.2s;
        }

        .style-option:hover {
          background: rgba(78, 205, 196, 0.2);
        }

        .style-option.selected {
          background: rgba(78, 205, 196, 0.3);
        }

        .exit-btn {
          background: rgba(255, 107, 107, 0.2);
          border-color: rgba(255, 107, 107, 0.5);
        }

        .exit-btn:hover {
          background: rgba(255, 107, 107, 0.3);
        }

        .exit-btn .btn-label {
          font-size: 12px;
        }

        .undo-redo-btn {
          min-width: 50px;
        }

        .undo-redo-btn.disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .undo-redo-btn.disabled:hover {
          background: transparent;
          border-color: rgba(78, 205, 196, 0.3);
        }

        .nav-btn {
          min-width: 40px;
          background: rgba(78, 205, 196, 0.1);
        }

        .nav-btn:hover {
          background: rgba(78, 205, 196, 0.2);
        }

        .nav-btn.active {
          background: rgba(78, 205, 196, 0.3);
          border-color: #4ecdc4;
        }

        .nav-icon {
          font-size: 14px;
        }
      `}</style>
    </div>
  );
};
