import React, { useRef, useState, useEffect, useCallback } from 'react';
import { DrawingStroke, DrawingStyle, DrawingPoint } from '../../../shared/types';
import { generateSprayParticles, renderSprayParticles, interpolateSprayPoints } from './SprayPaintBrush';

interface DrawingCanvasProps {
  width: number;
  height: number;
  existingStrokes: DrawingStroke[];
  isDrawing: boolean;
  brushColor: string;
  brushSize: number;
  brushStyle: DrawingStyle;
  onStrokeComplete: (stroke: DrawingStroke) => void;
}

// Stylus button constants
// Lenovo stylus barrel button typically reports as button 2 (right-click) or button 5 (eraser/barrel)
const STYLUS_BARREL_BUTTON = 2; // 0x02 - right-click equivalent
const STYLUS_ERASER_BUTTON = 32; // 0x20 - eraser button

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  width,
  height,
  existingStrokes,
  brushColor,
  brushSize,
  brushStyle,
  isDrawing,
  onStrokeComplete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [currentStroke, setCurrentStroke] = useState<DrawingPoint[]>([]);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [isStylusButtonHeld, setIsStylusButtonHeld] = useState(false);
  const lastPointRef = useRef<DrawingPoint | null>(null);
  const activeStyleRef = useRef<DrawingStyle>(brushStyle);

  // Track the effective style (eraser when stylus button is held)
  const getEffectiveStyle = useCallback((): DrawingStyle => {
    if (isStylusButtonHeld) {
      return 'eraser';
    }
    return brushStyle;
  }, [isStylusButtonHeld, brushStyle]);

  // Render existing strokes to main canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);

    existingStrokes.forEach((stroke) => {
      renderStroke(ctx, stroke);
    });
  }, [existingStrokes, width, height]);

  const renderStroke = (ctx: CanvasRenderingContext2D, stroke: DrawingStroke) => {
    const { points, color, size, style } = stroke;

    if (points.length < 2) return;

    switch (style) {
      case 'pen':
        renderPenStroke(ctx, points, color, size);
        break;
      case 'marker':
        renderMarkerStroke(ctx, points, color, size);
        break;
      case 'spray':
        renderSprayStroke(ctx, points, color, size);
        break;
      case 'highlighter':
        renderHighlighterStroke(ctx, points, color, size);
        break;
      case 'eraser':
        renderEraserStroke(ctx, points, size);
        break;
    }
  };

  const renderPenStroke = (
    ctx: CanvasRenderingContext2D,
    points: DrawingPoint[],
    color: string,
    size: number
  ) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      // Apply pressure sensitivity if available
      const pressure = points[i].pressure ?? 1;
      ctx.lineWidth = size * pressure;

      const midX = (points[i - 1].x + points[i].x) / 2;
      const midY = (points[i - 1].y + points[i].y) / 2;
      ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, midX, midY);
    }

    ctx.stroke();
    ctx.restore();
  };

  const renderMarkerStroke = (
    ctx: CanvasRenderingContext2D,
    points: DrawingPoint[],
    color: string,
    size: number
  ) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.6;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.stroke();
    ctx.restore();
  };

  const renderSprayStroke = (
    ctx: CanvasRenderingContext2D,
    points: DrawingPoint[],
    color: string,
    size: number
  ) => {
    for (let i = 0; i < points.length; i++) {
      const pressure = points[i].pressure ?? 1;
      const adjustedSize = size * pressure;

      const interpolatedPoints = i > 0
        ? interpolateSprayPoints(points[i - 1], points[i], 3)
        : [points[i]];

      interpolatedPoints.forEach((point) => {
        const particles = generateSprayParticles(point.x, point.y, {
          color,
          size: adjustedSize,
          density: 0.4 * pressure,
          colorVariation: 15,
        });
        renderSprayParticles(ctx, particles);
      });
    }
  };

  const renderHighlighterStroke = (
    ctx: CanvasRenderingContext2D,
    points: DrawingPoint[],
    color: string,
    size: number
  ) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 3;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.globalAlpha = 0.3;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.stroke();
    ctx.restore();
  };

  const renderEraserStroke = (
    ctx: CanvasRenderingContext2D,
    points: DrawingPoint[],
    size: number
  ) => {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      const pressure = points[i].pressure ?? 1;
      ctx.lineWidth = size * 2 * pressure; // Eraser is a bit larger
      ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.stroke();
    ctx.restore();
  };

  const getCanvasCoords = useCallback((e: React.PointerEvent): DrawingPoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      pressure: e.pointerType === 'pen' ? e.pressure : 1,
    };
  }, []);

  // Check if stylus barrel button is pressed
  const checkStylusButton = useCallback((e: React.PointerEvent): boolean => {
    if (e.pointerType !== 'pen') return false;

    // Check for barrel button (right-click equivalent) or eraser button
    // buttons is a bitmask: 1=primary, 2=secondary(right), 4=aux, 32=eraser
    const hasBarrelButton = (e.buttons & STYLUS_BARREL_BUTTON) !== 0;
    const hasEraserButton = (e.buttons & STYLUS_ERASER_BUTTON) !== 0;

    return hasBarrelButton || hasEraserButton;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isDrawing) return;

    // Only handle pen, touch, and left mouse button
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // Capture pointer for smooth tracking
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const stylusButtonHeld = checkStylusButton(e);
    setIsStylusButtonHeld(stylusButtonHeld);

    // Determine the active style for this stroke
    const effectiveStyle = stylusButtonHeld ? 'eraser' : brushStyle;
    activeStyleRef.current = effectiveStyle;

    const point = getCanvasCoords(e);
    setIsPointerDown(true);
    setCurrentStroke([point]);
    lastPointRef.current = point;

    // Draw initial point on overlay
    const overlayCanvas = overlayCanvasRef.current;
    if (overlayCanvas) {
      const ctx = overlayCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, width, height);

      if (effectiveStyle === 'spray') {
        const particles = generateSprayParticles(point.x, point.y, {
          color: brushColor,
          size: brushSize * (point.pressure ?? 1),
        });
        renderSprayParticles(ctx, particles);
      } else if (effectiveStyle === 'eraser') {
        // Show eraser cursor indicator
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, brushSize, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [isDrawing, getCanvasCoords, checkStylusButton, width, height, brushStyle, brushColor, brushSize]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPointerDown || !isDrawing) return;

    // Update stylus button state during stroke
    const stylusButtonHeld = checkStylusButton(e);
    setIsStylusButtonHeld(stylusButtonHeld);

    const point = getCanvasCoords(e);
    setCurrentStroke((prev) => [...prev, point]);

    // Draw current stroke on overlay canvas
    const overlayCanvas = overlayCanvasRef.current;
    if (overlayCanvas && lastPointRef.current) {
      const ctx = overlayCanvas.getContext('2d')!;
      const effectiveStyle = activeStyleRef.current;

      if (effectiveStyle === 'eraser') {
        // For eraser, show the cursor outline and preview on main canvas
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, brushSize, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Apply eraser effect to main canvas in real-time
        const mainCanvas = canvasRef.current;
        if (mainCanvas) {
          const mainCtx = mainCanvas.getContext('2d')!;
          const tempStroke: DrawingStroke = {
            points: [lastPointRef.current, point],
            color: '',
            size: brushSize,
            style: 'eraser',
          };
          renderStroke(mainCtx, tempStroke);
        }
      } else if (effectiveStyle === 'spray') {
        const interpolated = interpolateSprayPoints(lastPointRef.current, point, 3);
        interpolated.forEach((p) => {
          const particles = generateSprayParticles(p.x, p.y, {
            color: brushColor,
            size: brushSize * (point.pressure ?? 1),
            density: 0.4 * (point.pressure ?? 1),
          });
          renderSprayParticles(ctx, particles);
        });
      } else {
        const tempStroke: DrawingStroke = {
          points: [lastPointRef.current, point],
          color: brushColor,
          size: brushSize,
          style: effectiveStyle,
        };
        renderStroke(ctx, tempStroke);
      }
    }

    lastPointRef.current = point;
  }, [isPointerDown, isDrawing, getCanvasCoords, checkStylusButton, brushColor, brushSize, width, height]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isPointerDown) return;

    // Release pointer capture
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    setIsPointerDown(false);
    setIsStylusButtonHeld(false);

    if (currentStroke.length > 0) {
      const effectiveStyle = activeStyleRef.current;
      const stroke: DrawingStroke = {
        points: currentStroke,
        color: effectiveStyle === 'eraser' ? '' : brushColor,
        size: brushSize,
        style: effectiveStyle,
      };
      onStrokeComplete(stroke);
    }

    // Clear overlay canvas
    const overlayCanvas = overlayCanvasRef.current;
    if (overlayCanvas) {
      const ctx = overlayCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, width, height);
    }

    setCurrentStroke([]);
    lastPointRef.current = null;
  }, [isPointerDown, currentStroke, brushColor, brushSize, onStrokeComplete, width, height]);

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (isPointerDown) {
      handlePointerUp(e);
    }
  }, [isPointerDown, handlePointerUp]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    // Handle cases where the pointer is cancelled (e.g., palm rejection)
    setIsPointerDown(false);
    setIsStylusButtonHeld(false);
    setCurrentStroke([]);
    lastPointRef.current = null;

    const overlayCanvas = overlayCanvasRef.current;
    if (overlayCanvas) {
      const ctx = overlayCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, width, height);
    }
  }, [width, height]);

  // Get cursor style based on current mode
  const getCursorStyle = () => {
    if (!isDrawing) return 'default';
    if (isStylusButtonHeld) return 'cell'; // Eraser cursor
    return 'crosshair';
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        cursor: getCursorStyle(),
        touchAction: 'none', // Prevent browser touch gestures
      }}
    >
      {/* Main canvas with existing strokes */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      />
      {/* Overlay canvas for current stroke */}
      <canvas
        ref={overlayCanvasRef}
        width={width}
        height={height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: isDrawing ? 'auto' : 'none',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerCancel}
      />

      {/* Stylus eraser indicator */}
      {isStylusButtonHeld && isDrawing && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 107, 107, 0.9)',
            color: 'white',
            padding: '4px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          ERASER MODE
        </div>
      )}
    </div>
  );
};
