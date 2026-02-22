import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMediaTexture;
  uniform float uTime;
  uniform float uOpacity;
  uniform bool uHasTexture;

  varying vec2 vUv;

  void main() {
    // Base media color (or dark fallback when no texture)
    vec3 mediaColor;
    if (uHasTexture) {
      mediaColor = texture2D(uMediaTexture, vUv).rgb;
    } else {
      mediaColor = vec3(0.04, 0.03, 0.02);
    }

    // Horizontal scanlines — subtle animated scrolling
    float scanline = sin(vUv.y * 400.0 + uTime * 2.0) * 0.5 + 0.5;
    scanline = 1.0 - scanline * 0.08; // very subtle darkening

    // Edge glow — Fresnel-like using UV distance from center
    vec2 centered = vUv - 0.5;
    float edgeDist = max(abs(centered.x), abs(centered.y)) * 2.0; // 0 at center, 1 at edge
    float edgeGlow = smoothstep(0.7, 1.0, edgeDist);

    // Gold tint for the edge glow (#d4a044)
    vec3 goldColor = vec3(0.831, 0.627, 0.267);

    // Combine: media with scanlines + gold edge glow
    vec3 finalColor = mediaColor * scanline + goldColor * edgeGlow * 0.3;

    // Slight overall gold tint to media
    finalColor = mix(finalColor, finalColor * vec3(1.05, 0.95, 0.85), 0.15);

    gl_FragColor = vec4(finalColor, uOpacity * (1.0 - edgeGlow * 0.3));
  }
`;

export const createHologramScreenMaterial = (): THREE.ShaderMaterial => {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMediaTexture: { value: null },
      uTime: { value: 0.0 },
      uOpacity: { value: 0.0 },
      uHasTexture: { value: false },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
};
