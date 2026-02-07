import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TunnelEffectProps {
  enabled: boolean;
  speed?: number;
}

// Configuration for the tunnel
const TUNNEL_WIDTH = 24;
const TUNNEL_HEIGHT = 16;
const SEGMENT_DEPTH = 6;
const NUM_SEGMENTS = 14;
const FLOOR_COLS = 6;
const WALL_ROWS = 4;

const COL_WIDTH = TUNNEL_WIDTH / FLOOR_COLS;
const ROW_HEIGHT = TUNNEL_HEIGHT / WALL_ROWS;

// Create grid line vertices for a segment
const createGridVertices = () => {
  const w = TUNNEL_WIDTH / 2;
  const h = TUNNEL_HEIGHT / 2;
  const d = SEGMENT_DEPTH;
  const vertices: number[] = [];

  // Longitudinal Lines (Z-axis)
  // Floor & Ceiling (varying X)
  for (let i = 0; i <= FLOOR_COLS; i++) {
    const x = -w + i * COL_WIDTH;
    // Floor line
    vertices.push(x, -h, 0, x, -h, -d);
    // Ceiling line
    vertices.push(x, h, 0, x, h, -d);
  }

  // Walls (varying Y)
  for (let i = 1; i < WALL_ROWS; i++) {
    const y = -h + i * ROW_HEIGHT;
    // Left Wall line
    vertices.push(-w, y, 0, -w, y, -d);
    // Right Wall line
    vertices.push(w, y, 0, w, y, -d);
  }

  // Latitudinal Lines (Ring at z=0)
  vertices.push(-w, -h, 0, w, -h, 0); // Floor
  vertices.push(-w, h, 0, w, h, 0); // Ceiling
  vertices.push(-w, -h, 0, -w, h, 0); // Left Wall
  vertices.push(w, -h, 0, w, h, 0); // Right Wall

  return new Float32Array(vertices);
};

// Individual tunnel segment component
const TunnelSegment: React.FC<{ initialZ: number; lineColor: string; opacity: number }> = ({
  initialZ,
  lineColor,
  opacity,
}) => {
  const vertices = useMemo(() => createGridVertices(), []);

  return (
    <group position={[0, 0, initialZ]}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={vertices}
            count={vertices.length / 3}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={lineColor} transparent opacity={opacity} />
      </lineSegments>
    </group>
  );
};

export const TunnelEffect: React.FC<TunnelEffectProps> = ({ enabled, speed = 0.02 }) => {
  const groupRef = useRef<THREE.Group>(null);
  const positionRef = useRef(0);

  // Animation loop for continuous forward motion
  useFrame(() => {
    if (!enabled || !groupRef.current) return;

    positionRef.current += speed;

    // Move each segment forward and wrap around
    groupRef.current.children.forEach((segment, index) => {
      const baseZ = -index * SEGMENT_DEPTH;
      segment.position.z = baseZ + positionRef.current * SEGMENT_DEPTH;

      // Wrap around when segment goes past camera
      const tunnelLength = NUM_SEGMENTS * SEGMENT_DEPTH;
      if (segment.position.z > SEGMENT_DEPTH) {
        segment.position.z -= tunnelLength;
      }
    });
  });

  if (!enabled) return null;

  return (
    <group ref={groupRef}>
      {Array.from({ length: NUM_SEGMENTS }).map((_, i) => (
        <TunnelSegment
          key={i}
          initialZ={-i * SEGMENT_DEPTH}
          lineColor="#3d5c7a"
          opacity={0.3}
        />
      ))}
    </group>
  );
};
