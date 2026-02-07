import React, { useState, useEffect, useRef } from 'react';

interface NameDialogProps {
  initialName: string;
  initialFontSize?: number;
  showFontSize?: boolean;
  onConfirm: (name: string, fontSize?: number) => void;
  onCancel: () => void;
  title?: string;
}

export const NameDialog: React.FC<NameDialogProps> = ({
  initialName,
  initialFontSize = 24,
  showFontSize = true,
  onConfirm,
  onCancel,
  title = 'Edit Label',
}) => {
  const [name, setName] = useState(initialName);
  const [fontSize, setFontSize] = useState(initialFontSize);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onConfirm(name.trim(), showFontSize ? fontSize : undefined);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="name-dialog-overlay" onClick={onCancel}>
      <div className="name-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter name..."
          />

          {showFontSize && (
            <div className="font-size-control">
              <label>
                <span>Font Size: {fontSize}px</span>
                <input
                  type="range"
                  min="12"
                  max="72"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="font-size-slider"
                />
              </label>
              <div className="font-size-preview" style={{ fontSize: `${Math.min(fontSize, 36)}px` }}>
                {name || 'Preview'}
              </div>
            </div>
          )}

          <div className="name-dialog-buttons">
            <button
              type="button"
              className="name-dialog-btn secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button type="submit" className="name-dialog-btn primary">
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
