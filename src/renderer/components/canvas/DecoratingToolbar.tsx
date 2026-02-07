import React from 'react';
import { WallSide } from '../../../shared/types';

interface DecoratingInfoProps {
  wall: WallSide;
  zPosition: number;
}

// Simple info display at top of screen - no nav controls (those are in CanvasToolbar)
export const DecoratingInfo: React.FC<DecoratingInfoProps> = ({
  wall,
  zPosition,
}) => {
  const getWallLabel = () => {
    return wall.charAt(0).toUpperCase() + wall.slice(1);
  };

  return (
    <div className="decorating-info">
      <span className="decorating-wall-label">{getWallLabel()} Wall</span>
      <span className="decorating-divider">|</span>
      <span className="decorating-position">{zPosition.toFixed(1)}m</span>

      <style>{`
        .decorating-info {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(26, 26, 46, 0.95);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 8px;
          padding: 10px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 1000;
          backdrop-filter: blur(10px);
        }

        .decorating-wall-label {
          color: #4ecdc4;
          font-weight: 600;
          font-size: 14px;
        }

        .decorating-divider {
          color: rgba(255, 255, 255, 0.3);
        }

        .decorating-position {
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
          font-family: monospace;
        }
      `}</style>
    </div>
  );
};

// Keep old export name for compatibility
export const DecoratingToolbar = DecoratingInfo;
