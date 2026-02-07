import * as THREE from 'three';
import { WallTextureType } from '../../shared/types';

// Cache for generated textures
const textureCache: Map<WallTextureType, THREE.CanvasTexture> = new Map();

const createCanvas = (width = 512, height = 512): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
};

const addNoise = (ctx: CanvasRenderingContext2D, intensity: number = 8) => {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * intensity;
    imageData.data[i] += noise;
    imageData.data[i + 1] += noise;
    imageData.data[i + 2] += noise;
  }
  ctx.putImageData(imageData, 0, 0);
};

const createDefaultTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = createCanvas();

  // Base dark gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#0d1117');
  gradient.addColorStop(0.5, '#161b22');
  gradient.addColorStop(1, '#0d1117');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  // Panel lines
  ctx.strokeStyle = 'rgba(78, 205, 196, 0.08)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 512; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  for (let x = 0; x < 512; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  addNoise(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 4);
  return texture;
};

const createMetalTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = createCanvas();

  // Brushed steel base
  const gradient = ctx.createLinearGradient(0, 0, 512, 0);
  gradient.addColorStop(0, '#3a3f47');
  gradient.addColorStop(0.3, '#5a5f67');
  gradient.addColorStop(0.5, '#4a4f57');
  gradient.addColorStop(0.7, '#5a5f67');
  gradient.addColorStop(1, '#3a3f47');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  // Brushed metal lines (horizontal)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 512; y += 2) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.random() * 0.5);
    ctx.lineTo(512, y + Math.random() * 0.5);
    ctx.stroke();
  }

  // Panel seams
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 512; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Rivets
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  for (let x = 32; x < 512; x += 128) {
    for (let y = 32; y < 512; y += 128) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  addNoise(ctx, 5);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
};

const createStuccoTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = createCanvas();

  // Base color
  ctx.fillStyle = '#d4c8b8';
  ctx.fillRect(0, 0, 512, 512);

  // Create bumpy stucco texture
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const size = Math.random() * 4 + 1;
    const shade = Math.random() * 30 - 15;
    ctx.fillStyle = `rgb(${212 + shade}, ${200 + shade}, ${184 + shade})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Add shadows for depth
  for (let i = 0; i < 1000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const size = Math.random() * 3 + 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.beginPath();
    ctx.arc(x + 1, y + 1, size, 0, Math.PI * 2);
    ctx.fill();
  }

  addNoise(ctx, 10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
};

const createWoodTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = createCanvas();

  // Wood base color
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(0, 0, 512, 512);

  // Wood grain lines
  for (let y = 0; y < 512; y += 3) {
    const variation = Math.sin(y * 0.02) * 20;
    const shade = Math.floor(variation);
    ctx.strokeStyle = `rgb(${139 + shade}, ${105 + shade}, ${20 + shade})`;
    ctx.lineWidth = 1 + Math.random();
    ctx.beginPath();
    ctx.moveTo(0, y);

    // Wavy grain pattern
    for (let x = 0; x < 512; x += 10) {
      const waveY = y + Math.sin((x + y) * 0.01) * 3;
      ctx.lineTo(x, waveY);
    }
    ctx.stroke();
  }

  // Knots
  for (let i = 0; i < 3; i++) {
    const x = Math.random() * 400 + 56;
    const y = Math.random() * 400 + 56;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, 20);
    gradient.addColorStop(0, '#4a3510');
    gradient.addColorStop(0.5, '#6b4e1a');
    gradient.addColorStop(1, '#8b6914');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(x, y, 20, 15, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  addNoise(ctx, 12);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 4);
  return texture;
};

const createGlassTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = createCanvas();

  // Frosted glass effect
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, 'rgba(200, 220, 240, 0.3)');
  gradient.addColorStop(0.5, 'rgba(220, 235, 250, 0.4)');
  gradient.addColorStop(1, 'rgba(200, 220, 240, 0.3)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  // Reflection streaks
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 50, 512);
    ctx.stroke();
  }

  // Frame lines
  ctx.strokeStyle = 'rgba(100, 130, 160, 0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 512, 512);
  ctx.beginPath();
  ctx.moveTo(256, 0);
  ctx.lineTo(256, 512);
  ctx.moveTo(0, 256);
  ctx.lineTo(512, 256);
  ctx.stroke();

  addNoise(ctx, 3);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
};

const createBrickTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = createCanvas();

  const brickWidth = 64;
  const brickHeight = 32;
  const mortarWidth = 4;

  // Mortar base
  ctx.fillStyle = '#8a8a7a';
  ctx.fillRect(0, 0, 512, 512);

  // Draw bricks
  let row = 0;
  for (let y = 0; y < 512; y += brickHeight + mortarWidth) {
    const offset = (row % 2) * (brickWidth / 2);
    for (let x = -brickWidth; x < 512 + brickWidth; x += brickWidth + mortarWidth) {
      // Brick color variation
      const r = 160 + Math.random() * 40;
      const g = 70 + Math.random() * 30;
      const b = 60 + Math.random() * 20;
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x + offset, y, brickWidth, brickHeight);

      // Brick texture
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.1})`;
      ctx.fillRect(x + offset, y, brickWidth, brickHeight);
    }
    row++;
  }

  addNoise(ctx, 15);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 4);
  return texture;
};

const createConcreteTexture = (): THREE.CanvasTexture => {
  const [canvas, ctx] = createCanvas();

  // Base concrete color
  ctx.fillStyle = '#9a9a90';
  ctx.fillRect(0, 0, 512, 512);

  // Add aggregate texture
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const size = Math.random() * 3 + 0.5;
    const shade = Math.random() * 40 - 20;
    ctx.fillStyle = `rgb(${154 + shade}, ${154 + shade}, ${144 + shade})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cracks
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    let x = Math.random() * 512;
    let y = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 20; j++) {
      x += (Math.random() - 0.5) * 30;
      y += Math.random() * 20;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Panel joints
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 512; y += 256) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  for (let x = 0; x < 512; x += 256) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  addNoise(ctx, 12);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
};

export const getWallTexture = (type: WallTextureType): THREE.CanvasTexture => {
  // Check cache first
  const cached = textureCache.get(type);
  if (cached) return cached;

  // Generate texture based on type
  let texture: THREE.CanvasTexture;
  switch (type) {
    case 'metal':
      texture = createMetalTexture();
      break;
    case 'stucco':
      texture = createStuccoTexture();
      break;
    case 'wood':
      texture = createWoodTexture();
      break;
    case 'glass':
      texture = createGlassTexture();
      break;
    case 'brick':
      texture = createBrickTexture();
      break;
    case 'concrete':
      texture = createConcreteTexture();
      break;
    case 'default':
    default:
      texture = createDefaultTexture();
      break;
  }

  // Cache and return
  textureCache.set(type, texture);
  return texture;
};

export const clearTextureCache = () => {
  textureCache.forEach((texture) => texture.dispose());
  textureCache.clear();
};
