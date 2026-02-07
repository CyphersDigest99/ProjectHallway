import { DrawingPoint } from '../../../shared/types';

interface SprayParticle {
  x: number;
  y: number;
  color: string;
  size: number;
}

export interface SprayPaintOptions {
  color: string;
  size: number;
  density?: number;
  colorVariation?: number;
}

// Generates particles for spray paint effect
export const generateSprayParticles = (
  centerX: number,
  centerY: number,
  options: SprayPaintOptions
): SprayParticle[] => {
  const { color, size, density = 0.5, colorVariation = 10 } = options;
  const particles: SprayParticle[] = [];

  // Number of particles based on size and density
  const numParticles = Math.floor(size * density * 3);

  for (let i = 0; i < numParticles; i++) {
    // Random angle and distance from center (gaussian-like distribution)
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * Math.random() * (size / 2);

    const x = centerX + Math.cos(angle) * dist;
    const y = centerY + Math.sin(angle) * dist;

    // Particle size (smaller towards edges)
    const particleSize = Math.max(0.5, (1 - dist / (size / 2)) * 2);

    // Color variation
    const variedColor = varyColor(color, colorVariation);

    particles.push({ x, y, color: variedColor, size: particleSize });
  }

  return particles;
};

// Varies a hex color by a random amount
const varyColor = (hex: string, amount: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const vr = Math.max(0, Math.min(255, r + (Math.random() - 0.5) * amount * 2));
  const vg = Math.max(0, Math.min(255, g + (Math.random() - 0.5) * amount * 2));
  const vb = Math.max(0, Math.min(255, b + (Math.random() - 0.5) * amount * 2));

  return `rgb(${Math.round(vr)}, ${Math.round(vg)}, ${Math.round(vb)})`;
};

// Renders spray paint particles to a canvas context
export const renderSprayParticles = (
  ctx: CanvasRenderingContext2D,
  particles: SprayParticle[]
) => {
  particles.forEach(({ x, y, color, size }) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  });
};

// Interpolates points for smooth spray paint lines
export const interpolateSprayPoints = (
  start: DrawingPoint,
  end: DrawingPoint,
  spacing: number = 3
): DrawingPoint[] => {
  const points: DrawingPoint[] = [];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.floor(distance / spacing));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: start.x + dx * t,
      y: start.y + dy * t,
      pressure: start.pressure ? start.pressure + (((end.pressure || 1) - start.pressure) * t) : undefined,
    });
  }

  return points;
};

// Generates drip effect for held positions
export const generateDrip = (
  x: number,
  y: number,
  color: string,
  length: number
): SprayParticle[] => {
  const particles: SprayParticle[] = [];
  const dripWidth = 3 + Math.random() * 2;

  for (let i = 0; i < length; i++) {
    const wobble = (Math.random() - 0.5) * 2;
    const fade = 1 - (i / length) * 0.5;

    particles.push({
      x: x + wobble,
      y: y + i,
      color: varyColor(color, 5),
      size: dripWidth * fade,
    });
  }

  return particles;
};
