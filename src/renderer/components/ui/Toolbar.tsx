import React from 'react';
import { ObjectType } from '../../../shared/types';

interface ToolbarProps {
  onAddObject: (type: ObjectType) => void;
  onImportModel: () => void;
  onImportImage: () => void;
  onToggleEditor: () => void;
  showEditor: boolean;
  currentDepth: number;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onAddObject,
  onImportModel,
  onImportImage,
  onToggleEditor,
  showEditor,
  currentDepth,
}) => {
  const primitives: { type: ObjectType; icon: string; label: string }[] = [
    { type: 'cube', icon: '⬜', label: 'Cube' },
    { type: 'sphere', icon: '⚪', label: 'Sphere' },
    { type: 'cylinder', icon: '🔲', label: 'Cylinder' },
    { type: 'cone', icon: '🔺', label: 'Cone' },
    { type: 'torus', icon: '⭕', label: 'Torus' },
  ];

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <div className="toolbar-title">Add at Depth {Math.round(currentDepth)}m</div>
        <div className="toolbar-buttons">
          {primitives.map(({ type, icon, label }) => (
            <button
              key={type}
              className="toolbar-btn"
              onClick={() => onAddObject(type)}
              title={`Add ${label} at current position`}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-section">
        <div className="toolbar-title">Import</div>
        <div className="toolbar-buttons">
          <button
            className="toolbar-btn import-btn"
            onClick={onImportModel}
            title="Import 3D Model (.glb, .gltf)"
          >
            3D Model
          </button>
          <button
            className="toolbar-btn import-btn"
            onClick={onImportImage}
            title="Import Image (.png, .jpg)"
          >
            Image
          </button>
        </div>
      </div>

      <div className="toolbar-section">
        <div className="toolbar-buttons">
          <button
            className={`toolbar-btn import-btn ${showEditor ? 'active' : ''}`}
            onClick={onToggleEditor}
            title="Toggle Visual Editor"
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  );
};
