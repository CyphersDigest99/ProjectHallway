import React, { useState, useRef, useEffect } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import { useShallow } from 'zustand/react/shallow';
import { WallSide, LightFixtureStyle } from '../../../shared/types';
import { getFixtureLengthRange } from '../objects/CeilingLight';

interface VisualEditorProps {
  onSelectWallpaper: (wall: WallSide) => void;
}

// Color temperature to RGB conversion (approximate)
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

export const VisualEditor: React.FC<VisualEditorProps> = ({ onSelectWallpaper }) => {
  const { settings, updateSettings, updateWallSettings, pendingWallpaper, clearPendingWallpaper } = useSceneStore(useShallow(s => ({
    settings: s.settings,
    updateSettings: s.updateSettings,
    updateWallSettings: s.updateWallSettings,
    pendingWallpaper: s.pendingWallpaper,
    clearPendingWallpaper: s.clearPendingWallpaper,
  })));
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 340, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState<'general' | 'walls'>('general');
  const [selectedWall, setSelectedWall] = useState<WallSide>('left');
  const editorRef = useRef<HTMLDivElement>(null);

  // Handle window resize to maintain upper-right position
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({ x: window.innerWidth - 340, y: prev.y }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.editor-header')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: Math.max(0, Math.min(window.innerWidth - 320, e.clientX - dragOffset.x)),
          y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y)),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const currentWall = settings.walls[selectedWall];

  return (
    <div
      ref={editorRef}
      className={`visual-editor ${isMinimized ? 'minimized' : ''}`}
      style={{ left: position.x, top: position.y }}
      onMouseDown={handleMouseDown}
    >
      <div className="editor-header">
        <span className="editor-title">Visual Editor</span>
        <div className="editor-controls">
          <button
            className="editor-btn"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? '+' : '-'}
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="editor-content">
          {/* Tabs */}
          <div className="editor-tabs">
            <button
              className={`editor-tab ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              General
            </button>
            <button
              className={`editor-tab ${activeTab === 'walls' ? 'active' : ''}`}
              onClick={() => setActiveTab('walls')}
            >
              Walls
            </button>
          </div>

          {activeTab === 'general' && (
            <div className="editor-section">
              {/* Light Brightness */}
              <div className="editor-control">
                <label>
                  <span>Light Brightness</span>
                  <span className="value">{(settings.lightBrightness * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="0.5"
                  value={settings.lightBrightness}
                  onChange={(e) => updateSettings({ lightBrightness: parseFloat(e.target.value) })}
                />
              </div>

              {/* Environment Brightness */}
              <div className="editor-control">
                <label>
                  <span>Ambient Light</span>
                  <span className="value">{(settings.envBrightness * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={settings.envBrightness}
                  onChange={(e) => updateSettings({ envBrightness: parseFloat(e.target.value) })}
                />
              </div>

              {/* Draw Distance */}
              <div className="editor-control">
                <label>
                  <span>Draw Distance</span>
                  <span className="value">{settings.drawDistance}m</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="300"
                  step="10"
                  value={settings.drawDistance}
                  onChange={(e) => updateSettings({ drawDistance: parseFloat(e.target.value) })}
                />
              </div>

              {/* Haziness */}
              <div className="editor-control">
                <label>
                  <span>Fog Density</span>
                  <span className="value">{(settings.haziness * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.haziness}
                  onChange={(e) => updateSettings({ haziness: parseFloat(e.target.value) })}
                />
              </div>

              {/* Navigation Speed */}
              <div className="editor-control">
                <label>
                  <span>Navigation Speed</span>
                  <span className="value">{(settings.navigationSpeed * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min="0.005"
                  max="0.15"
                  step="0.005"
                  value={settings.navigationSpeed}
                  onChange={(e) => updateSettings({ navigationSpeed: parseFloat(e.target.value) })}
                />
              </div>
            </div>
          )}

          {activeTab === 'walls' && (
            <div className="editor-section">
              {/* Wall Selector */}
              <div className="wall-selector">
                {(['left', 'right', 'floor', 'ceiling'] as WallSide[]).map((wall) => (
                  <button
                    key={wall}
                    className={`wall-btn ${selectedWall === wall ? 'active' : ''}`}
                    onClick={() => setSelectedWall(wall)}
                  >
                    {wall.charAt(0).toUpperCase() + wall.slice(1)}
                  </button>
                ))}
              </div>

              {/* Wall Color */}
              <div className="editor-control">
                <label>
                  <span>Color</span>
                  <input
                    type="color"
                    value={currentWall.color}
                    onChange={(e) => updateWallSettings(selectedWall, { color: e.target.value })}
                    className="color-input"
                  />
                </label>
              </div>

              {/* Wall Brightness */}
              <div className="editor-control">
                <label>
                  <span>Brightness</span>
                  <span className="value">{(currentWall.brightness * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={currentWall.brightness}
                  onChange={(e) => updateWallSettings(selectedWall, { brightness: parseFloat(e.target.value) })}
                />
              </div>

              {/* Wall Opacity */}
              <div className="editor-control">
                <label>
                  <span>Opacity</span>
                  <span className="value">{(currentWall.opacity * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={currentWall.opacity}
                  onChange={(e) => updateWallSettings(selectedWall, { opacity: parseFloat(e.target.value) })}
                />
              </div>

              {/* Wall Image */}
              <div className="editor-control wallpaper-control">
                <label>
                  <span>Wall Image</span>
                </label>
                {pendingWallpaper && pendingWallpaper.wall === selectedWall ? (
                  <div className="wallpaper-preview-active">
                    <div className="preview-status">
                      Preview active - scroll to position and click checkmark to place
                    </div>
                    <div className="wallpaper-preview">
                      {pendingWallpaper.imagePath.split(/[/\\]/).pop()}
                    </div>
                    <button
                      className="wallpaper-btn remove"
                      onClick={() => clearPendingWallpaper()}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="wallpaper-actions">
                    <button
                      className="wallpaper-btn"
                      onClick={() => onSelectWallpaper(selectedWall)}
                      disabled={pendingWallpaper !== null}
                    >
                      Add Image
                    </button>
                  </div>
                )}
                {pendingWallpaper && pendingWallpaper.wall !== selectedWall && (
                  <div className="wallpaper-hint">
                    Image preview active on {pendingWallpaper.wall} wall
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const FIXTURE_STYLES: { value: LightFixtureStyle; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'panel', label: 'Panel' },
  { value: 'pendant', label: 'Pendant' },
  { value: 'spot', label: 'Spot' },
  { value: 'industrial', label: 'Industrial' },
];

// Light color presets (5x2 grid)
const LIGHT_COLOR_PRESETS = [
  '#ff6b6b', '#ff9f43', '#feca57', '#48dbfb', '#1dd1a1',
  '#5f27cd', '#ee5a24', '#eb4d4b', '#6ab04c', '#e056fd',
];

// Light context menu component
export const LightContextMenu: React.FC<{
  x: number;
  y: number;
  lightId: string;
  brightness: number;
  temperature: number;
  fixtureStyle?: LightFixtureStyle;
  fixtureLength?: number;
  isAutoGenerated?: boolean;
  color?: string;
  onClose: () => void;
  onDelete?: () => void;
}> = ({ x, y, lightId, brightness: initialBrightness, temperature: initialTemperature, fixtureStyle: initialFixtureStyle = 'linear', fixtureLength: initialFixtureLength = 3, isAutoGenerated = false, color: initialColor, onClose, onDelete }) => {
  const updateLight = useSceneStore(s => s.updateLight);
  const removeLight = useSceneStore(s => s.removeLight);
  const menuRef = useRef<HTMLDivElement>(null);

  // Local state so sliders track their own values instead of stale props
  const [brightness, setBrightness] = useState(initialBrightness);
  const [temperature, setTemperature] = useState(initialTemperature);
  const [fixtureStyle, setFixtureStyle] = useState(initialFixtureStyle);
  const [fixtureLength, setFixtureLength] = useState(initialFixtureLength);
  const [color, setColor] = useState(initialColor);

  const lengthRange = getFixtureLengthRange(fixtureStyle);

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

  const handleStyleChange = (newStyle: LightFixtureStyle) => {
    const newRange = getFixtureLengthRange(newStyle);
    const newLength = Math.max(newRange.min, Math.min(newRange.max, fixtureLength));
    setFixtureStyle(newStyle);
    setFixtureLength(newLength);
    updateLight(lightId, { fixtureStyle: newStyle, fixtureLength: newLength });
  };

  const handleDelete = () => {
    removeLight(lightId);
    onClose();
  };

  const adjustedX = Math.min(x, window.innerWidth - 280);
  const adjustedY = Math.min(y, window.innerHeight - 380);

  return (
    <div
      ref={menuRef}
      className="light-context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div className="light-menu-header">Light Settings</div>

      {/* Fixture Style */}
      <div className="light-menu-control">
        <label>
          <span>Style</span>
        </label>
        <select
          value={fixtureStyle}
          onChange={(e) => handleStyleChange(e.target.value as LightFixtureStyle)}
          className="light-style-select"
        >
          {FIXTURE_STYLES.map((style) => (
            <option key={style.value} value={style.value}>
              {style.label}
            </option>
          ))}
        </select>
      </div>

      {/* Fixture Length */}
      <div className="light-menu-control">
        <label>
          <span>Length</span>
          <span className="value">{fixtureLength.toFixed(1)}m</span>
        </label>
        <input
          type="range"
          min={lengthRange.min}
          max={lengthRange.max}
          step="0.1"
          value={fixtureLength}
          onChange={(e) => { const v = parseFloat(e.target.value); setFixtureLength(v); updateLight(lightId, { fixtureLength: v }); }}
        />
      </div>

      <div className="light-menu-control">
        <label>
          <span>Brightness</span>
          <span className="value">{(brightness * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0.5"
          max="10"
          step="0.25"
          value={brightness}
          onChange={(e) => { const v = parseFloat(e.target.value); setBrightness(v); updateLight(lightId, { brightness: v }); }}
        />
      </div>

      <div className="light-menu-control">
        <label>
          <span>Temperature</span>
          <span className="value">{temperature}K</span>
        </label>
        <input
          type="range"
          min="2000"
          max="10000"
          step="100"
          value={temperature}
          onChange={(e) => { const v = parseFloat(e.target.value); setTemperature(v); updateLight(lightId, { temperature: v }); }}
          disabled={!!color}
        />
        <div
          className="temperature-preview"
          style={{ background: color || temperatureToColor(temperature) }}
        />
      </div>

      {/* Color override section */}
      <div className="light-menu-control">
        <label>
          <span>Color Override</span>
          {color && <span className="value">{color}</span>}
        </label>
        <div className="color-presets-grid">
          {LIGHT_COLOR_PRESETS.map((preset) => (
            <button
              key={preset}
              className={`color-preset-btn ${color === preset ? 'active' : ''}`}
              style={{ background: preset }}
              onClick={() => { setColor(preset); updateLight(lightId, { color: preset }); }}
              title={preset}
            />
          ))}
        </div>
        <div className="color-custom-row">
          <input
            type="color"
            value={color || '#ffffff'}
            onChange={(e) => { setColor(e.target.value); updateLight(lightId, { color: e.target.value }); }}
            className="color-picker-input"
          />
          {color && (
            <button
              className="reset-color-btn"
              onClick={() => { setColor(undefined); updateLight(lightId, { color: undefined }); }}
            >
              Reset to Temperature
            </button>
          )}
        </div>
      </div>

      {/* Delete button - only for non-auto-generated lights */}
      {!isAutoGenerated && (
        <div className="light-menu-delete">
          <button className="delete-btn" onClick={handleDelete}>
            Delete Light
          </button>
        </div>
      )}
    </div>
  );
};

export { temperatureToColor };
