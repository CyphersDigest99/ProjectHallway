import * as THREE from 'three';

// Generate a 512x512 vein map texture (white veins on black background)
// Used by the neural pulse shader to know where to glow
export const generateVeinMapTexture = (): THREE.CanvasTexture => {
  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Deterministic seeded random
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Draw branching vein network
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawVein = (
    x0: number, y0: number, x1: number, y1: number,
    width: number, opacity: number, depth: number
  ) => {
    // Main vein as bezier curve
    const mx = (x0 + x1) / 2 + (rand() - 0.5) * 80;
    const my = (y0 + y1) / 2 + (rand() - 0.5) * 80;

    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();

    // Branch if not too deep
    if (depth > 0) {
      const numBranches = 1 + Math.floor(rand() * 2);
      for (let b = 0; b < numBranches; b++) {
        const t = 0.3 + rand() * 0.4; // branch point along curve
        const bx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
        const by = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
        const angle = Math.atan2(y1 - y0, x1 - x0) + (rand() - 0.5) * 1.5;
        const len = 40 + rand() * 60;
        const bx1 = bx + Math.cos(angle) * len;
        const by1 = by + Math.sin(angle) * len;
        drawVein(bx, by, bx1, by1, width * 0.6, opacity * 0.7, depth - 1);
      }
    }
  };

  // 4 primary veins crossing the tile, endpoints near edges for seamless tiling
  const primaryVeins = [
    { x0: 0, y0: SIZE * 0.25, x1: SIZE, y1: SIZE * 0.3 },
    { x0: 0, y0: SIZE * 0.7, x1: SIZE, y1: SIZE * 0.65 },
    { x0: SIZE * 0.2, y0: 0, x1: SIZE * 0.35, y1: SIZE },
    { x0: SIZE * 0.75, y0: 0, x1: SIZE * 0.8, y1: SIZE },
  ];

  for (const v of primaryVeins) {
    drawVein(v.x0, v.y0, v.x1, v.y1, 3.0, 0.9, 2);
  }

  // Gold circuit traces — thin angular paths following similar routes
  seed = 137; // reset seed for deterministic traces
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1.0;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    let cx = rand() * SIZE;
    let cy = rand() * SIZE;
    ctx.moveTo(cx, cy);
    const segments = 4 + Math.floor(rand() * 4);
    for (let s = 0; s < segments; s++) {
      // Angular/straight segments (circuit board feel)
      const angle = Math.floor(rand() * 8) * (Math.PI / 4); // snap to 45-degree angles
      const len = 20 + rand() * 50;
      cx += Math.cos(angle) * len;
      cy += Math.sin(angle) * len;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 5); // match wall texture repeat
  return texture;
};

// GLSL vertex shader — passes world position, UV, and path distance to fragment.
// aPathDistance is a per-vertex attribute set by CurvedSegment geometry.
// For flat (legacy) geometry that lacks this attribute, it defaults to 0.0
// and the fragment shader falls back to -worldPosition.z.
const vertexShader = /* glsl */ `
  attribute float aPathDistance;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying float vPathDistance;

  void main() {
    vUv = uv;
    vPathDistance = aPathDistance;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// GLSL fragment shader — samples vein map, applies ambient + reactive pulse.
// Uses vPathDistance (arc-length along curved path) when > 0, otherwise
// falls back to -vWorldPosition.z for flat/legacy geometry.
const fragmentShader = /* glsl */ `
  uniform sampler2D uVeinMap;
  uniform float uTime;
  uniform float uPlayerZ;
  uniform float uScrollVelocity;
  uniform vec3 uPulseColor;
  uniform float uBaseGlow;
  uniform float uAmbientSpeed;
  uniform float uAmbientIntensity;
  uniform float uReactiveSpeed;
  uniform float uReactiveIntensity;
  uniform float uReactiveSensitivity;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying float vPathDistance;

  void main() {
    float veinIntensity = texture2D(uVeinMap, vUv).r;

    // Base glow — traces always faintly visible
    float baseGlow = veinIntensity * uBaseGlow;

    // Use path distance for curved geometry, fallback to worldZ for flat
    float pathDist = vPathDistance > 0.0 ? vPathDistance : -vWorldPosition.z;

    // Ambient pulse — periodic waves traveling along path
    float ambientWave = sin(pathDist * 0.3 + uTime * uAmbientSpeed);
    float ambientPulse = pow(max(ambientWave, 0.0), 3.0) * veinIntensity * uAmbientIntensity;

    // Reactive pulse — radiates from camera position, intensity scales with movement
    float dist = abs(pathDist - uPlayerZ);
    float reactiveWave = sin(dist * 0.5 - uTime * uReactiveSpeed);
    float reactivePulse = pow(max(reactiveWave, 0.0), 4.0) * veinIntensity * uReactiveIntensity * clamp(uScrollVelocity * uReactiveSensitivity, 0.0, 1.0);

    float totalGlow = baseGlow + ambientPulse + reactivePulse;

    gl_FragColor = vec4(uPulseColor * totalGlow, totalGlow);
  }
`;

// Create a shared ShaderMaterial for all pulse overlays
export const createNeuralPulseMaterial = (veinMap: THREE.CanvasTexture): THREE.ShaderMaterial => {
  return new THREE.ShaderMaterial({
    uniforms: {
      uVeinMap: { value: veinMap },
      uTime: { value: 0.0 },
      uPlayerZ: { value: 0.0 },
      uScrollVelocity: { value: 0.0 },
      uPulseColor: { value: new THREE.Color('#ffd700') },
      uBaseGlow: { value: 0.15 },
      uAmbientSpeed: { value: 1.2 },
      uAmbientIntensity: { value: 0.35 },
      uReactiveSpeed: { value: 2.0 },
      uReactiveIntensity: { value: 1.0 },
      uReactiveSensitivity: { value: 3.0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
};
