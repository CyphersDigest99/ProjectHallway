/**
 * Create a simple ICO file for Project Hallway
 * Run with: node scripts/create-ico.js
 */

const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');

console.log('\n=== Project Hallway Icon Generator ===\n');

// Color palette matching the app theme
const COLORS = {
  bg: { r: 13, g: 17, b: 23 },         // #0d1117
  accent: { r: 78, g: 205, b: 196 },   // #4ecdc4
  dark: { r: 10, g: 10, b: 21 },       // #0a0a15
  white: { r: 255, g: 255, b: 255 },
};

/**
 * Draw the tunnel icon to a pixel buffer
 */
function drawTunnelIcon(size) {
  const pixels = new Uint8Array(size * size * 4);

  const setPixel = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  };

  const blend = (x, y, r, g, b, alpha) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    const a = alpha / 255;
    pixels[i] = Math.round(pixels[i] * (1 - a) + r * a);
    pixels[i + 1] = Math.round(pixels[i + 1] * (1 - a) + g * a);
    pixels[i + 2] = Math.round(pixels[i + 2] * (1 - a) + b * a);
    pixels[i + 3] = Math.min(255, pixels[i + 3] + alpha);
  };

  const drawLine = (x0, y0, x1, y1, r, g, b, a = 255) => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      blend(Math.round(x0), Math.round(y0), r, g, b, a);
      if (Math.abs(x0 - x1) < 1 && Math.abs(y0 - y1) < 1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  };

  const drawCircle = (cx, cy, radius, r, g, b, a = 255, fill = false) => {
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        const dist = Math.sqrt(x * x + y * y);
        if (fill ? dist <= radius : Math.abs(dist - radius) < 1.5) {
          const alpha = fill ? a : Math.round(a * (1 - Math.abs(dist - radius)));
          blend(Math.round(cx + x), Math.round(cy + y), r, g, b, alpha);
        }
      }
    }
  };

  const center = size / 2;
  const pad = size * 0.08;

  // Fill background
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      setPixel(x, y, COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
    }
  }

  // Draw rounded rectangle background (simplified)
  for (let y = pad; y < size - pad; y++) {
    for (let x = pad; x < size - pad; x++) {
      setPixel(Math.round(x), Math.round(y), COLORS.bg.r, COLORS.bg.g, COLORS.bg.b);
    }
  }

  // Vanishing point
  const vx = center;
  const vy = center * 0.55;

  // Draw perspective lines (tunnel walls)
  const { accent } = COLORS;

  // Left wall
  drawLine(pad * 2, size - pad * 2, vx - size * 0.03, vy, accent.r, accent.g, accent.b, 180);
  drawLine(pad * 3, size - pad * 2, vx - size * 0.02, vy, accent.r, accent.g, accent.b, 180);

  // Right wall
  drawLine(size - pad * 2, size - pad * 2, vx + size * 0.03, vy, accent.r, accent.g, accent.b, 180);
  drawLine(size - pad * 3, size - pad * 2, vx + size * 0.02, vy, accent.r, accent.g, accent.b, 180);

  // Ceiling
  drawLine(pad * 2, pad * 3, vx, vy, accent.r, accent.g, accent.b, 180);
  drawLine(size - pad * 2, pad * 3, vx, vy, accent.r, accent.g, accent.b, 180);

  // Floor grid
  for (let i = 0; i < 5; i++) {
    const t = i / 5;
    const y = vy + (size - pad * 2 - vy) * (t * t);
    const hw = (size * 0.4) * (1 - t * 0.6);
    drawLine(vx - hw, y, vx + hw, y, accent.r, accent.g, accent.b, 100);
  }

  // Glowing vanishing point
  const glowRadius = size * 0.15;
  for (let r = glowRadius; r > 0; r -= 2) {
    const alpha = Math.round(180 * (1 - r / glowRadius));
    drawCircle(vx, vy, r, accent.r, accent.g, accent.b, alpha, true);
  }

  // Bright center
  drawCircle(vx, vy, size * 0.04, 255, 255, 255, 255, true);
  drawCircle(vx, vy, size * 0.06, accent.r, accent.g, accent.b, 200, true);

  // Border
  for (let i = 0; i < size; i++) {
    blend(Math.round(pad * 0.5), i, accent.r, accent.g, accent.b, 150);
    blend(Math.round(size - pad * 0.5), i, accent.r, accent.g, accent.b, 150);
    blend(i, Math.round(pad * 0.5), accent.r, accent.g, accent.b, 150);
    blend(i, Math.round(size - pad * 0.5), accent.r, accent.g, accent.b, 150);
  }

  return pixels;
}

/**
 * Create a minimal PNG buffer from pixel data
 */
function createPNG(width, height, pixels) {
  const pako = require('pako');

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // Helper to create chunks
  const createChunk = (type, data) => {
    const typeBuffer = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const crcData = Buffer.concat([typeBuffer, data]);
    let crc = 0xffffffff;
    for (let i = 0; i < crcData.length; i++) {
      crc ^= crcData[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    crc ^= 0xffffffff;

    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc >>> 0, 0);

    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
  };

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // Bit depth
  ihdr.writeUInt8(6, 9); // Color type (RGBA)
  ihdr.writeUInt8(0, 10); // Compression
  ihdr.writeUInt8(0, 11); // Filter
  ihdr.writeUInt8(0, 12); // Interlace

  // IDAT chunk - pixel data with filter byte per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];
      rawData[dstIdx + 1] = pixels[srcIdx + 1];
      rawData[dstIdx + 2] = pixels[srcIdx + 2];
      rawData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }
  const compressed = Buffer.from(pako.deflate(rawData));

  // IEND chunk
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', iend),
  ]);
}

/**
 * Create ICO file from PNG buffers
 */
function createICO(pngBuffers, sizes) {
  const numImages = pngBuffers.length;

  // Header
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(numImages, 4);

  let dataOffset = 6 + 16 * numImages;
  const directories = [];

  for (let i = 0; i < numImages; i++) {
    const size = sizes[i];
    const png = pngBuffers[i];

    const dir = Buffer.alloc(16);
    dir.writeUInt8(size === 256 ? 0 : size, 0);
    dir.writeUInt8(size === 256 ? 0 : size, 1);
    dir.writeUInt8(0, 2);
    dir.writeUInt8(0, 3);
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(dataOffset, 12);

    directories.push(dir);
    dataOffset += png.length;
  }

  return Buffer.concat([header, ...directories, ...pngBuffers]);
}

// Check for pako (compression library)
let pako;
try {
  pako = require('pako');
} catch (e) {
  console.log('Installing pako for PNG compression...');
  require('child_process').execSync('npm install pako --no-save', { stdio: 'inherit' });
  pako = require('pako');
}

// Generate icons
const sizes = [256, 128, 64, 48, 32, 16];
const pngBuffers = [];

console.log('Generating icons...');

for (const size of sizes) {
  const pixels = drawTunnelIcon(size);
  const png = createPNG(size, size, pixels);
  pngBuffers.push(png);
  console.log(`  Generated ${size}x${size}`);
}

// Save PNG (largest)
fs.writeFileSync(path.join(buildDir, 'icon.png'), pngBuffers[0]);
console.log('\nCreated: build/icon.png');

// Save ICO
const ico = createICO(pngBuffers, sizes);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
console.log('Created: build/icon.ico');

console.log('\n=== Icon generation complete! ===\n');
console.log('To build the app with desktop shortcut:');
console.log('  npm run dist:win\n');
