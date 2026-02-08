import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSceneStore, DEFAULT_MATERIAL_SETTINGS, DEFAULT_NEURAL_PULSE_SETTINGS, DEFAULT_ATMOSPHERE_SETTINGS, DEFAULT_LIGHTING_COLORS } from '../../store/sceneStore';
import { useShallow } from 'zustand/react/shallow';
import { WallSide, LightFixtureStyle, MaterialSettings, NeuralPulseSettings, AtmosphereSettings, LightingColors } from '../../../shared/types';
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

// --- Reusable sub-components ---

const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, defaultValue, format, onChange }) => (
  <div className="ve-slider-row">
    <span className="ve-label">{label}</span>
    <span className="ve-value">{format ? format(value) : value.toFixed(2)}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
    <button
      className="ve-reset-btn"
      onClick={() => onChange(defaultValue)}
      title="Reset to default"
    >
      R
    </button>
  </div>
);

const ColorRow: React.FC<{
  label: string;
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
}> = ({ label, value, defaultValue, onChange }) => (
  <div className="ve-color-row">
    <span className="ve-label">{label}</span>
    <span className="ve-value">{value}</span>
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="ve-color-input"
    />
    <button
      className="ve-reset-btn"
      onClick={() => onChange(defaultValue)}
      title="Reset to default"
    >
      R
    </button>
  </div>
);

const Section: React.FC<{
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, open, onToggle, children }) => (
  <div className="ve-section">
    <button className="ve-section-header" onClick={onToggle}>
      <span className="ve-section-chevron">{open ? '\u25BC' : '\u25B6'}</span>
      <span className="ve-section-title">{title}</span>
    </button>
    {open && <div className="ve-section-body">{children}</div>}
  </div>
);

// --- Main component ---

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
  const [selectedWall, setSelectedWall] = useState<WallSide>('left');
  const editorRef = useRef<HTMLDivElement>(null);

  // Section open states
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    lighting: true,
    atmosphere: false,
    materials: false,
    neuralPulse: false,
    walls: false,
    navigation: false,
  });

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Resolve settings with defaults
  const mat = settings.materials || DEFAULT_MATERIAL_SETTINGS;
  const pulse = settings.neuralPulse || DEFAULT_NEURAL_PULSE_SETTINGS;
  const atmo = settings.atmosphere || DEFAULT_ATMOSPHERE_SETTINGS;
  const lc = settings.lightingColors || DEFAULT_LIGHTING_COLORS;

  // Update helpers for nested settings
  const updateMaterials = useCallback((field: keyof MaterialSettings, value: number) => {
    updateSettings({ materials: { ...mat, [field]: value } });
  }, [mat, updateSettings]);

  const updatePulse = useCallback((field: keyof NeuralPulseSettings, value: string | number) => {
    updateSettings({ neuralPulse: { ...pulse, [field]: value } });
  }, [pulse, updateSettings]);

  const updateAtmo = useCallback((field: keyof AtmosphereSettings, value: string) => {
    updateSettings({ atmosphere: { ...atmo, [field]: value } });
  }, [atmo, updateSettings]);

  const updateLC = useCallback((field: keyof LightingColors, value: string) => {
    updateSettings({ lightingColors: { ...lc, [field]: value } });
  }, [lc, updateSettings]);

  // Handle window resize
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
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

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
        <div className="ve-scrollable">
          {/* 1. LIGHTING */}
          <Section title="LIGHTING" open={openSections.lighting} onToggle={() => toggleSection('lighting')}>
            <SliderRow
              label="Light Brightness" value={settings.lightBrightness}
              min={1} max={20} step={0.5} defaultValue={3.0}
              format={pct} onChange={(v) => updateSettings({ lightBrightness: v })}
            />
            <SliderRow
              label="Ambient Intensity" value={settings.envBrightness}
              min={0} max={1} step={0.01} defaultValue={0.08}
              format={pct} onChange={(v) => updateSettings({ envBrightness: v })}
            />
            <ColorRow
              label="Accent Color" value={lc.accentColor}
              defaultValue={DEFAULT_LIGHTING_COLORS.accentColor}
              onChange={(v) => updateLC('accentColor', v)}
            />
            <ColorRow
              label="Secondary Color" value={lc.secondaryColor}
              defaultValue={DEFAULT_LIGHTING_COLORS.secondaryColor}
              onChange={(v) => updateLC('secondaryColor', v)}
            />
            <ColorRow
              label="Ambient Tint" value={lc.ambientLightColor}
              defaultValue={DEFAULT_LIGHTING_COLORS.ambientLightColor}
              onChange={(v) => updateLC('ambientLightColor', v)}
            />
          </Section>

          {/* 2. ATMOSPHERE */}
          <Section title="ATMOSPHERE" open={openSections.atmosphere} onToggle={() => toggleSection('atmosphere')}>
            <ColorRow
              label="Background" value={atmo.backgroundColor}
              defaultValue={DEFAULT_ATMOSPHERE_SETTINGS.backgroundColor}
              onChange={(v) => updateAtmo('backgroundColor', v)}
            />
            <ColorRow
              label="Fog Color" value={atmo.fogColor}
              defaultValue={DEFAULT_ATMOSPHERE_SETTINGS.fogColor}
              onChange={(v) => updateAtmo('fogColor', v)}
            />
            <SliderRow
              label="Fog Density" value={settings.haziness}
              min={0} max={1} step={0.05} defaultValue={0.3}
              format={pct} onChange={(v) => updateSettings({ haziness: v })}
            />
            <SliderRow
              label="Draw Distance" value={settings.drawDistance}
              min={10} max={300} step={10} defaultValue={120}
              format={(v) => `${v}m`} onChange={(v) => updateSettings({ drawDistance: v })}
            />
          </Section>

          {/* 3. MATERIALS */}
          <Section title="MATERIALS" open={openSections.materials} onToggle={() => toggleSection('materials')}>
            <SliderRow
              label="Wall Metalness" value={mat.wallMetalness}
              min={0} max={1} step={0.05} defaultValue={DEFAULT_MATERIAL_SETTINGS.wallMetalness}
              onChange={(v) => updateMaterials('wallMetalness', v)}
            />
            <SliderRow
              label="Wall Roughness" value={mat.wallRoughness}
              min={0} max={1} step={0.05} defaultValue={DEFAULT_MATERIAL_SETTINGS.wallRoughness}
              onChange={(v) => updateMaterials('wallRoughness', v)}
            />
            <SliderRow
              label="Floor Metalness" value={mat.floorMetalness}
              min={0} max={1} step={0.05} defaultValue={DEFAULT_MATERIAL_SETTINGS.floorMetalness}
              onChange={(v) => updateMaterials('floorMetalness', v)}
            />
            <SliderRow
              label="Floor Roughness" value={mat.floorRoughness}
              min={0} max={1} step={0.05} defaultValue={DEFAULT_MATERIAL_SETTINGS.floorRoughness}
              onChange={(v) => updateMaterials('floorRoughness', v)}
            />
            <SliderRow
              label="Ceiling Metalness" value={mat.ceilingMetalness}
              min={0} max={1} step={0.05} defaultValue={DEFAULT_MATERIAL_SETTINGS.ceilingMetalness}
              onChange={(v) => updateMaterials('ceilingMetalness', v)}
            />
            <SliderRow
              label="Ceiling Roughness" value={mat.ceilingRoughness}
              min={0} max={1} step={0.05} defaultValue={DEFAULT_MATERIAL_SETTINGS.ceilingRoughness}
              onChange={(v) => updateMaterials('ceilingRoughness', v)}
            />
            <SliderRow
              label="Wireframe Opacity" value={mat.wireframeOpacity}
              min={0} max={0.5} step={0.01} defaultValue={DEFAULT_MATERIAL_SETTINGS.wireframeOpacity}
              onChange={(v) => updateMaterials('wireframeOpacity', v)}
            />
            <SliderRow
              label="Edge Trim Opacity" value={mat.trimOpacity}
              min={0} max={1} step={0.05} defaultValue={DEFAULT_MATERIAL_SETTINGS.trimOpacity}
              onChange={(v) => updateMaterials('trimOpacity', v)}
            />
          </Section>

          {/* 4. NEURAL PULSE */}
          <Section title="NEURAL PULSE" open={openSections.neuralPulse} onToggle={() => toggleSection('neuralPulse')}>
            <ColorRow
              label="Pulse Color" value={pulse.pulseColor}
              defaultValue={DEFAULT_NEURAL_PULSE_SETTINGS.pulseColor}
              onChange={(v) => updatePulse('pulseColor', v)}
            />
            <SliderRow
              label="Base Glow" value={pulse.baseGlow}
              min={0} max={0.5} step={0.01} defaultValue={DEFAULT_NEURAL_PULSE_SETTINGS.baseGlow}
              onChange={(v) => updatePulse('baseGlow', v)}
            />
            <SliderRow
              label="Ambient Speed" value={pulse.ambientSpeed}
              min={0} max={5} step={0.1} defaultValue={DEFAULT_NEURAL_PULSE_SETTINGS.ambientSpeed}
              onChange={(v) => updatePulse('ambientSpeed', v)}
            />
            <SliderRow
              label="Ambient Intensity" value={pulse.ambientIntensity}
              min={0} max={1} step={0.05} defaultValue={DEFAULT_NEURAL_PULSE_SETTINGS.ambientIntensity}
              onChange={(v) => updatePulse('ambientIntensity', v)}
            />
            <SliderRow
              label="Reactive Speed" value={pulse.reactiveSpeed}
              min={0} max={8} step={0.1} defaultValue={DEFAULT_NEURAL_PULSE_SETTINGS.reactiveSpeed}
              onChange={(v) => updatePulse('reactiveSpeed', v)}
            />
            <SliderRow
              label="Reactive Intensity" value={pulse.reactiveIntensity}
              min={0} max={3} step={0.1} defaultValue={DEFAULT_NEURAL_PULSE_SETTINGS.reactiveIntensity}
              onChange={(v) => updatePulse('reactiveIntensity', v)}
            />
            <SliderRow
              label="Sensitivity" value={pulse.reactiveSensitivity}
              min={0} max={10} step={0.5} defaultValue={DEFAULT_NEURAL_PULSE_SETTINGS.reactiveSensitivity}
              onChange={(v) => updatePulse('reactiveSensitivity', v)}
            />
          </Section>

          {/* 5. WALLS */}
          <Section title="WALLS" open={openSections.walls} onToggle={() => toggleSection('walls')}>
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

            <ColorRow
              label="Color" value={currentWall.color}
              defaultValue={selectedWall === 'floor' || selectedWall === 'ceiling' ? '#1a0f05' : '#2a1a0a'}
              onChange={(v) => updateWallSettings(selectedWall, { color: v })}
            />
            <SliderRow
              label="Brightness" value={currentWall.brightness}
              min={0} max={2} step={0.05} defaultValue={1.0}
              format={pct} onChange={(v) => updateWallSettings(selectedWall, { brightness: v })}
            />
            <SliderRow
              label="Opacity" value={currentWall.opacity}
              min={0.1} max={1} step={0.05} defaultValue={1.0}
              format={pct} onChange={(v) => updateWallSettings(selectedWall, { opacity: v })}
            />

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
          </Section>

          {/* 6. NAVIGATION */}
          <Section title="NAVIGATION" open={openSections.navigation} onToggle={() => toggleSection('navigation')}>
            <SliderRow
              label="Move Speed" value={settings.navigationSpeed}
              min={0.005} max={0.15} step={0.005} defaultValue={0.08}
              format={pct} onChange={(v) => updateSettings({ navigationSpeed: v })}
            />
          </Section>
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
