import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { MediaFileInfo } from '../../../shared/types';
import { createHologramScreenMaterial } from '../../shaders/hologramScreen';

interface HologramProjectorProps {
  objectId: string;
  directoryPath: string;
  mediaFiles: MediaFileInfo[];
  currentIndex: number;
  isPlaying: boolean;
  screenPosition: { x: number; y: number; z: number };
  projectorPosition: { x: number; y: number; z: number };
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSetPlaying: (playing: boolean) => void;
  scrollZ: number;
}

const MAX_SCREEN_WIDTH = 5;
const MAX_SCREEN_HEIGHT = 4;
const AUTO_CLOSE_DISTANCE = 50;

export const HologramProjector: React.FC<HologramProjectorProps> = ({
  mediaFiles,
  currentIndex,
  isPlaying,
  screenPosition,
  projectorPosition,
  onClose,
  onNext,
  onPrev,
  onSetPlaying,
  scrollZ,
}) => {
  const screenMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoTextureRef = useRef<THREE.VideoTexture | null>(null);
  const [fadeIn, setFadeIn] = useState(0);
  const [screenSize, setScreenSize] = useState<[number, number]>([MAX_SCREEN_WIDTH, MAX_SCREEN_WIDTH * 9 / 16]);
  const mountTimeRef = useRef(Date.now());

  const currentFile = mediaFiles[currentIndex];

  // Create shader material once
  const screenMaterial = useMemo(() => {
    const mat = createHologramScreenMaterial();
    screenMaterialRef.current = mat;
    return mat;
  }, []);

  // Helper: fit dimensions into max bounds while preserving aspect ratio
  const fitScreen = (w: number, h: number) => {
    const aspect = w / h;
    let sw: number, sh: number;
    if (aspect >= 1) {
      // Landscape or square
      sw = MAX_SCREEN_WIDTH;
      sh = MAX_SCREEN_WIDTH / aspect;
      if (sh > MAX_SCREEN_HEIGHT) { sh = MAX_SCREEN_HEIGHT; sw = MAX_SCREEN_HEIGHT * aspect; }
    } else {
      // Portrait
      sh = MAX_SCREEN_HEIGHT;
      sw = MAX_SCREEN_HEIGHT * aspect;
      if (sw > MAX_SCREEN_WIDTH) { sw = MAX_SCREEN_WIDTH; sh = MAX_SCREEN_WIDTH / aspect; }
    }
    setScreenSize([sw, sh]);
  };

  // Load image texture
  useEffect(() => {
    if (!currentFile || currentFile.type !== 'image') return;

    let cancelled = false;
    const loadImage = async () => {
      try {
        const buffer = await window.electronAPI.readFile(currentFile.path);
        if (cancelled) return;
        const blob = new Blob([buffer]);
        const url = URL.createObjectURL(blob);

        // Use Image to get natural dimensions for aspect ratio
        const img = new Image();
        img.onload = () => {
          if (cancelled) { URL.revokeObjectURL(url); return; }
          fitScreen(img.naturalWidth, img.naturalHeight);

          const loader = new THREE.TextureLoader();
          loader.load(url, (tex) => {
            if (cancelled) { tex.dispose(); URL.revokeObjectURL(url); return; }
            screenMaterial.uniforms.uMediaTexture.value = tex;
            screenMaterial.uniforms.uHasTexture.value = true;
            URL.revokeObjectURL(url);
          });
        };
        img.src = url;
      } catch (error) {
        console.error('Failed to load hologram image:', error);
      }
    };
    loadImage();

    return () => { cancelled = true; };
  }, [currentFile, screenMaterial]);

  // Load video texture
  useEffect(() => {
    if (!currentFile || currentFile.type !== 'video') return;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true; // start muted so autoplay is guaranteed
    video.playsInline = true;
    video.src = 'media-file:///' + currentFile.path.replace(/\\/g, '/');
    videoRef.current = video;

    // Detect video dimensions once metadata loads
    video.addEventListener('loadedmetadata', () => {
      if (video.videoWidth && video.videoHeight) {
        fitScreen(video.videoWidth, video.videoHeight);
      }
    });

    // Start playback once video can play
    video.addEventListener('canplay', () => {
      if (isPlaying) {
        video.play().then(() => {
          video.muted = false; // unmute after autoplay succeeds
        }).catch(() => { /* autoplay blocked */ });
      }
    }, { once: true });

    video.addEventListener('error', () => {
      console.error('Hologram video load error:', video.error?.message, currentFile.path);
    });

    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTextureRef.current = videoTexture;

    screenMaterial.uniforms.uMediaTexture.value = videoTexture;
    screenMaterial.uniforms.uHasTexture.value = true;

    return () => {
      video.pause();
      video.src = '';
      videoTexture.dispose();
      videoRef.current = null;
      videoTextureRef.current = null;
    };
  }, [currentFile, screenMaterial]);

  // Sync play/pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video || currentFile?.type !== 'video') return;

    if (isPlaying) {
      video.play().then(() => {
        video.muted = false;
      }).catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, currentFile]);

  // Clean up old texture when switching media
  useEffect(() => {
    return () => {
      screenMaterial.uniforms.uHasTexture.value = false;
      const oldTex = screenMaterial.uniforms.uMediaTexture.value;
      if (oldTex && !(oldTex instanceof THREE.VideoTexture)) {
        oldTex.dispose();
      }
      screenMaterial.uniforms.uMediaTexture.value = null;
    };
  }, [currentIndex, screenMaterial]);

  // Beam geometry: rectangular pyramid from projector (tip) to screen (rectangle base)
  // Built in world space so no rotation needed — base matches screen dimensions exactly
  const beamGeometry = useMemo(() => {
    const tip = new THREE.Vector3(projectorPosition.x, projectorPosition.y, projectorPosition.z);
    const center = new THREE.Vector3(screenPosition.x, screenPosition.y, screenPosition.z);

    // Screen is a planeGeometry (faces +Z), so width = X, height = Y
    const hw = screenSize[0] * 0.5;
    const hh = screenSize[1] * 0.5;

    const bl = new THREE.Vector3(center.x - hw, center.y - hh, center.z);
    const br = new THREE.Vector3(center.x + hw, center.y - hh, center.z);
    const tr = new THREE.Vector3(center.x + hw, center.y + hh, center.z);
    const tl = new THREE.Vector3(center.x - hw, center.y + hh, center.z);

    // 4 triangular side faces (open base — blends into screen)
    const positions = new Float32Array([
      tip.x, tip.y, tip.z,  bl.x, bl.y, bl.z,  br.x, br.y, br.z,
      tip.x, tip.y, tip.z,  br.x, br.y, br.z,  tr.x, tr.y, tr.z,
      tip.x, tip.y, tip.z,  tr.x, tr.y, tr.z,  tl.x, tl.y, tl.z,
      tip.x, tip.y, tip.z,  tl.x, tl.y, tl.z,  bl.x, bl.y, bl.z,
    ]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }, [screenPosition, projectorPosition, screenSize]);

  // Animation: fade-in, scanlines, auto-close
  useFrame(() => {
    const elapsed = (Date.now() - mountTimeRef.current) / 1000;

    const opacity = Math.min(1, elapsed / 0.5);
    setFadeIn(opacity);
    screenMaterial.uniforms.uOpacity.value = opacity;
    screenMaterial.uniforms.uTime.value = elapsed;

    // Update video texture
    if (videoTextureRef.current && videoRef.current && !videoRef.current.paused) {
      videoTextureRef.current.needsUpdate = true;
    }

    // Pulsing beam opacity
    if (beamRef.current) {
      const pulse = 0.08 + Math.sin(elapsed * 1.5) * 0.035;
      (beamRef.current.material as THREE.MeshBasicMaterial).opacity = pulse * opacity;
    }

    // Auto-close if camera moves too far
    const camZ = -scrollZ;
    const screenZ = screenPosition.z;
    if (Math.abs(camZ - screenZ) > AUTO_CLOSE_DISTANCE) {
      onClose();
    }
  });

  // Dispose on unmount
  useEffect(() => {
    return () => {
      screenMaterial.dispose();
      beamGeometry.dispose();
    };
  }, [screenMaterial, beamGeometry]);

  // Block clicks from passing through to walls behind
  const stopPropagation = (e: any) => { e.stopPropagation(); };

  return (
    <group>
      {/* Beam effect: rectangular pyramid from projector (point) to screen (rectangle) */}
      <mesh
        ref={beamRef}
        geometry={beamGeometry}
      >
        <meshBasicMaterial
          color="#d4a044"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Invisible click blocker behind screen — prevents wall clicks */}
      <mesh
        position={[screenPosition.x, screenPosition.y, screenPosition.z + 0.05]}
        onPointerDown={stopPropagation}
        onPointerUp={stopPropagation}
        onClick={stopPropagation}
      >
        <planeGeometry args={[screenSize[0] + 1, screenSize[1] + 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Screen mesh */}
      <mesh
        position={[screenPosition.x, screenPosition.y, screenPosition.z]}
        material={screenMaterial}
        onPointerDown={stopPropagation}
        onPointerUp={stopPropagation}
        onClick={stopPropagation}
      >
        <planeGeometry args={[screenSize[0], screenSize[1]]} />
      </mesh>

      {/* Gold border frame around screen */}
      <mesh position={[screenPosition.x, screenPosition.y, screenPosition.z - 0.01]}>
        <planeGeometry args={[screenSize[0] + 0.1, screenSize[1] + 0.1]} />
        <meshBasicMaterial
          color="#d4a044"
          transparent
          opacity={fadeIn * 0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* HTML controls overlay */}
      <Html
        position={[screenPosition.x, screenPosition.y - screenSize[1] / 2 - 0.5, screenPosition.z]}
        center
        distanceFactor={8}
        style={{ opacity: fadeIn, pointerEvents: fadeIn > 0.5 ? 'auto' : 'none' }}
      >
        <div className="hologram-controls" onPointerDown={e => e.stopPropagation()}>
          <button className="hologram-btn" onClick={onPrev} title="Previous">
            &#9664;
          </button>

          {currentFile?.type === 'video' && (
            <button
              className="hologram-btn"
              onClick={() => onSetPlaying(!isPlaying)}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '\u23F8' : '\u25B6'}
            </button>
          )}

          <button className="hologram-btn" onClick={onNext} title="Next">
            &#9654;
          </button>

          <span className="hologram-info">
            {currentFile?.name} ({currentIndex + 1}/{mediaFiles.length})
          </span>

          <button className="hologram-btn hologram-close" onClick={onClose} title="Close">
            &#10005;
          </button>
        </div>
      </Html>
    </group>
  );
};
