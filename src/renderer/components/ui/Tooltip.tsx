import React from 'react';
import { SceneObject } from '../../../shared/types';

interface TooltipProps {
  object: SceneObject;
  x: number;
  y: number;
}

export const Tooltip: React.FC<TooltipProps> = ({ object, x, y }) => {
  // Offset tooltip from cursor
  const offsetX = 15;
  const offsetY = 15;

  return (
    <div
      className="tooltip"
      style={{
        left: x + offsetX,
        top: y + offsetY,
      }}
    >
      <div className="tooltip-name">{object.name}</div>
      {object.directoryPath ? (
        <div className="tooltip-path">{object.directoryPath}</div>
      ) : (
        <div className="tooltip-path" style={{ fontStyle: 'italic' }}>
          No directory assigned
        </div>
      )}
    </div>
  );
};
