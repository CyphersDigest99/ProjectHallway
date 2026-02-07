import React, { useState, useEffect } from 'react';
import { LightFixtureStyle } from '../../../shared/types';
import { getFixtureLengthRange } from '../objects/CeilingLight';

interface LightFixtureModalProps {
  onConfirm: (style: LightFixtureStyle, length: number, brightness: number, temperature: number) => void;
  onCancel: () => void;
}

const FIXTURE_STYLES: { value: LightFixtureStyle; label: string; description: string }[] = [
  { value: 'linear', label: 'Linear', description: 'Elongated tube light' },
  { value: 'panel', label: 'Panel', description: 'Square recessed panel' },
  { value: 'pendant', label: 'Pendant', description: 'Hanging fixture with shade' },
  { value: 'spot', label: 'Spot', description: 'Circular spotlight' },
  { value: 'industrial', label: 'Industrial', description: 'Track with tube lights' },
];

// Color temperature to RGB conversion for preview
const temperatureToColor = (kelvin: number): string => {
  const temp = kelvin / 100;
  let r, g, b;

  if (temp <= 66) {
    r = 255;
    g = Math.min(255, Math.max(0, 99.4708025861 * Math.log(temp) - 161.1195681661));
  } else {
    r = Math.min(255, Math.max(0, 329.698727446 * Math.pow(temp - 60, -0.1332047592)));
    g = Math.min(255, Math.max(0, 288.1221695283 * Math.pow(temp - 60, -0.0755148492)));
  }

  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = Math.min(255, Math.max(0, 138.5177312231 * Math.log(temp - 10) - 305.0447927307));
  }

  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
};

export const LightFixtureModal: React.FC<LightFixtureModalProps> = ({ onConfirm, onCancel }) => {
  const [selectedStyle, setSelectedStyle] = useState<LightFixtureStyle>('linear');
  const [fixtureLength, setFixtureLength] = useState(3);
  const [brightness, setBrightness] = useState(1);
  const [temperature, setTemperature] = useState(5500);

  // Update length when style changes to stay within valid range
  useEffect(() => {
    const range = getFixtureLengthRange(selectedStyle);
    if (fixtureLength < range.min) {
      setFixtureLength(range.min);
    } else if (fixtureLength > range.max) {
      setFixtureLength(range.max);
    }
  }, [selectedStyle, fixtureLength]);

  const handleConfirm = () => {
    onConfirm(selectedStyle, fixtureLength, brightness, temperature);
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

  const currentRange = getFixtureLengthRange(selectedStyle);

  return (
    <div className="light-fixture-modal-overlay" onClick={onCancel}>
      <div className="light-fixture-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Light Fixture</h3>
        </div>

        <div className="modal-content">
          {/* Fixture Style */}
          <div className="modal-section">
            <label className="section-label">Fixture Style</label>
            <div className="style-grid">
              {FIXTURE_STYLES.map((style) => (
                <button
                  key={style.value}
                  className={`style-option ${selectedStyle === style.value ? 'selected' : ''}`}
                  onClick={() => setSelectedStyle(style.value)}
                >
                  <div className="style-icon">
                    {style.value === 'linear' && <LinearIcon />}
                    {style.value === 'panel' && <PanelIcon />}
                    {style.value === 'pendant' && <PendantIcon />}
                    {style.value === 'spot' && <SpotIcon />}
                    {style.value === 'industrial' && <IndustrialIcon />}
                  </div>
                  <div className="style-name">{style.label}</div>
                  <div className="style-desc">{style.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Fixture Length */}
          <div className="modal-section">
            <label className="section-label">
              <span>Length / Size</span>
              <span className="value">{fixtureLength.toFixed(1)}m</span>
            </label>
            <input
              type="range"
              min={currentRange.min}
              max={currentRange.max}
              step={0.1}
              value={fixtureLength}
              onChange={(e) => setFixtureLength(parseFloat(e.target.value))}
              className="modal-slider"
            />
            <div className="range-labels">
              <span>{currentRange.min}m</span>
              <span>{currentRange.max}m</span>
            </div>
          </div>

          {/* Brightness */}
          <div className="modal-section">
            <label className="section-label">
              <span>Brightness</span>
              <span className="value">{(brightness * 100).toFixed(0)}%</span>
            </label>
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.25}
              value={brightness}
              onChange={(e) => setBrightness(parseFloat(e.target.value))}
              className="modal-slider"
            />
          </div>

          {/* Temperature */}
          <div className="modal-section">
            <label className="section-label">
              <span>Color Temperature</span>
              <span className="value">{temperature}K</span>
            </label>
            <input
              type="range"
              min={2000}
              max={10000}
              step={100}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="modal-slider temperature-slider"
            />
            <div
              className="temperature-preview"
              style={{ background: temperatureToColor(temperature) }}
            />
          </div>
        </div>

        <div className="modal-buttons">
          <button className="modal-btn cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="modal-btn confirm" onClick={handleConfirm}>
            Add Light
          </button>
        </div>

        <style>{`
          .light-fixture-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
          }

          .light-fixture-modal {
            background: rgba(26, 26, 46, 0.98);
            border: 1px solid rgba(78, 205, 196, 0.3);
            border-radius: 12px;
            padding: 24px;
            min-width: 400px;
            max-width: 500px;
          }

          .modal-header h3 {
            margin: 0 0 20px 0;
            font-size: 18px;
            color: white;
          }

          .modal-content {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .modal-section {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .section-label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.8);
          }

          .section-label .value {
            color: #4ecdc4;
            font-weight: 500;
          }

          .style-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
          }

          .style-option {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            padding: 12px 8px;
            background: rgba(0, 0, 0, 0.3);
            border: 2px solid transparent;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .style-option:hover {
            background: rgba(78, 205, 196, 0.1);
            border-color: rgba(78, 205, 196, 0.3);
          }

          .style-option.selected {
            background: rgba(78, 205, 196, 0.15);
            border-color: #4ecdc4;
          }

          .style-icon {
            width: 40px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .style-icon svg {
            width: 100%;
            height: 100%;
          }

          .style-name {
            font-size: 12px;
            font-weight: 600;
            color: white;
          }

          .style-desc {
            font-size: 9px;
            color: rgba(255, 255, 255, 0.5);
            text-align: center;
          }

          .modal-slider {
            width: 100%;
            accent-color: #4ecdc4;
          }

          .range-labels {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: rgba(255, 255, 255, 0.5);
          }

          .temperature-preview {
            height: 8px;
            border-radius: 4px;
            margin-top: 4px;
          }

          .modal-buttons {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 24px;
          }

          .modal-btn {
            padding: 10px 24px;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
          }

          .modal-btn.cancel {
            background: rgba(255, 255, 255, 0.1);
            color: white;
          }

          .modal-btn.cancel:hover {
            background: rgba(255, 255, 255, 0.15);
          }

          .modal-btn.confirm {
            background: #4ecdc4;
            color: #1a1a2e;
            font-weight: 600;
          }

          .modal-btn.confirm:hover {
            background: #5fd3d3;
          }
        `}</style>
      </div>
    </div>
  );
};

// SVG Icons for fixture styles
const LinearIcon = () => (
  <svg viewBox="0 0 40 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="6" width="36" height="8" rx="1" fill="#4ecdc4" opacity="0.3" />
    <rect x="4" y="8" width="32" height="4" rx="1" fill="#4ecdc4" />
  </svg>
);

const PanelIcon = () => (
  <svg viewBox="0 0 40 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="2" width="20" height="16" rx="2" fill="#4ecdc4" opacity="0.3" />
    <rect x="12" y="4" width="16" height="12" rx="1" fill="#4ecdc4" />
  </svg>
);

const PendantIcon = () => (
  <svg viewBox="0 0 40 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="20" y1="0" x2="20" y2="6" stroke="#666" strokeWidth="2" />
    <path d="M12 6L28 6L24 18H16L12 6Z" fill="#4ecdc4" opacity="0.3" />
    <circle cx="20" cy="12" r="4" fill="#4ecdc4" />
  </svg>
);

const SpotIcon = () => (
  <svg viewBox="0 0 40 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="20" cy="10" rx="10" ry="8" fill="#4ecdc4" opacity="0.3" />
    <circle cx="20" cy="10" r="5" fill="#4ecdc4" />
  </svg>
);

const IndustrialIcon = () => (
  <svg viewBox="0 0 40 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="36" height="4" rx="1" fill="#666" />
    <rect x="8" y="10" width="4" height="6" rx="1" fill="#4ecdc4" />
    <rect x="18" y="10" width="4" height="6" rx="1" fill="#4ecdc4" />
    <rect x="28" y="10" width="4" height="6" rx="1" fill="#4ecdc4" />
  </svg>
);
