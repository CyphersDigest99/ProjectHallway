import React from 'react';

interface TextToolbarProps {
  fontSize: number;
  fontColor: string;
  bold: boolean;
  italic: boolean;
  alignment: 'left' | 'center' | 'right';
  backgroundColor?: string;
  onFontSizeChange: (size: number) => void;
  onFontColorChange: (color: string) => void;
  onBoldChange: (bold: boolean) => void;
  onItalicChange: (italic: boolean) => void;
  onAlignmentChange: (alignment: 'left' | 'center' | 'right') => void;
  onBackgroundColorChange: (color: string | undefined) => void;
  onClose: () => void;
  position: { x: number; y: number };
}

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

const COLOR_PRESETS = [
  '#ffffff', '#000000', '#ff6b6b', '#ff9f43', '#feca57',
  '#48dbfb', '#1dd1a1', '#5f27cd', '#ee5a24', '#eb4d4b',
];

export const TextToolbar: React.FC<TextToolbarProps> = ({
  fontSize,
  fontColor,
  bold,
  italic,
  alignment,
  backgroundColor,
  onFontSizeChange,
  onFontColorChange,
  onBoldChange,
  onItalicChange,
  onAlignmentChange,
  onBackgroundColorChange,
  onClose,
  position,
}) => {
  return (
    <div
      className="text-toolbar"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div className="text-toolbar-row">
        <label className="toolbar-label">Size</label>
        <select
          value={fontSize}
          onChange={(e) => onFontSizeChange(parseInt(e.target.value))}
          className="font-size-select"
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
      </div>

      <div className="text-toolbar-row">
        <button
          className={`format-btn ${bold ? 'active' : ''}`}
          onClick={() => onBoldChange(!bold)}
          title="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          className={`format-btn ${italic ? 'active' : ''}`}
          onClick={() => onItalicChange(!italic)}
          title="Italic"
        >
          <em>I</em>
        </button>
        <div className="separator" />
        <button
          className={`format-btn ${alignment === 'left' ? 'active' : ''}`}
          onClick={() => onAlignmentChange('left')}
          title="Align Left"
        >
          {'<-'}
        </button>
        <button
          className={`format-btn ${alignment === 'center' ? 'active' : ''}`}
          onClick={() => onAlignmentChange('center')}
          title="Center"
        >
          |-|
        </button>
        <button
          className={`format-btn ${alignment === 'right' ? 'active' : ''}`}
          onClick={() => onAlignmentChange('right')}
          title="Align Right"
        >
          {'->'}
        </button>
      </div>

      <div className="text-toolbar-row">
        <label className="toolbar-label">Text Color</label>
        <div className="color-row">
          {COLOR_PRESETS.slice(0, 5).map((color) => (
            <button
              key={color}
              className={`color-swatch ${fontColor === color ? 'active' : ''}`}
              style={{ background: color }}
              onClick={() => onFontColorChange(color)}
            />
          ))}
          <input
            type="color"
            value={fontColor}
            onChange={(e) => onFontColorChange(e.target.value)}
            className="color-picker-small"
          />
        </div>
      </div>

      <div className="text-toolbar-row">
        <label className="toolbar-label">Background</label>
        <div className="color-row">
          <button
            className={`color-swatch none ${!backgroundColor ? 'active' : ''}`}
            onClick={() => onBackgroundColorChange(undefined)}
            title="No background"
          >
            <span className="no-bg-icon">X</span>
          </button>
          {COLOR_PRESETS.slice(0, 4).map((color) => (
            <button
              key={color}
              className={`color-swatch ${backgroundColor === color ? 'active' : ''}`}
              style={{ background: color }}
              onClick={() => onBackgroundColorChange(color)}
            />
          ))}
          <input
            type="color"
            value={backgroundColor || '#ffffff'}
            onChange={(e) => onBackgroundColorChange(e.target.value)}
            className="color-picker-small"
          />
        </div>
      </div>

      <button className="close-toolbar-btn" onClick={onClose}>
        Done
      </button>

      <style>{`
        .text-toolbar {
          position: fixed;
          background: rgba(26, 26, 46, 0.98);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          z-index: 1100;
          min-width: 200px;
          backdrop-filter: blur(10px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        }

        .text-toolbar-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .toolbar-label {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.6);
          min-width: 60px;
        }

        .font-size-select {
          flex: 1;
          padding: 4px 8px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 4px;
          color: white;
          font-size: 12px;
        }

        .format-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(78, 205, 196, 0.2);
          border-radius: 4px;
          color: white;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s ease;
        }

        .format-btn:hover {
          background: rgba(78, 205, 196, 0.2);
        }

        .format-btn.active {
          background: rgba(78, 205, 196, 0.3);
          border-color: #4ecdc4;
          color: #4ecdc4;
        }

        .separator {
          width: 1px;
          height: 20px;
          background: rgba(255, 255, 255, 0.2);
          margin: 0 4px;
        }

        .color-row {
          display: flex;
          gap: 4px;
          align-items: center;
        }

        .color-swatch {
          width: 20px;
          height: 20px;
          border-radius: 4px;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .color-swatch:hover {
          transform: scale(1.1);
        }

        .color-swatch.active {
          border-color: #4ecdc4;
        }

        .color-swatch.none {
          background: linear-gradient(135deg, #333 45%, #f00 45%, #f00 55%, #333 55%);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .no-bg-icon {
          font-size: 10px;
          color: white;
          text-shadow: 0 0 2px black;
        }

        .color-picker-small {
          width: 24px;
          height: 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          padding: 0;
        }

        .close-toolbar-btn {
          padding: 6px 12px;
          background: rgba(78, 205, 196, 0.2);
          border: 1px solid rgba(78, 205, 196, 0.4);
          border-radius: 4px;
          color: #4ecdc4;
          cursor: pointer;
          font-size: 12px;
          margin-top: 4px;
          transition: all 0.2s ease;
        }

        .close-toolbar-btn:hover {
          background: rgba(78, 205, 196, 0.3);
        }
      `}</style>
    </div>
  );
};
