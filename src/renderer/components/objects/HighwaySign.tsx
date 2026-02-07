import React, { useRef, useState, useMemo } from 'react';
import { useThree, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { HighwaySign as HighwaySignType, WallSide } from '../../../shared/types';
import { useSceneStore } from '../../store/sceneStore';

const TUNNEL_WIDTH = 16;
const TUNNEL_HEIGHT = 10;

// Shared geometry cache for all highway signs
let signGeometryCache: {
  signBox: THREE.BoxGeometry;
  signBorder: THREE.PlaneGeometry;
  post: THREE.CylinderGeometry;
  bracket: THREE.BoxGeometry;
} | null = null;

const getSignGeometries = () => {
  if (signGeometryCache) return signGeometryCache;
  signGeometryCache = {
    signBox: new THREE.BoxGeometry(2.5, 1.2, 0.1),
    signBorder: new THREE.PlaneGeometry(2.4, 1.1),
    post: new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8),
    bracket: new THREE.BoxGeometry(0.2, 0.2, 0.15),
  };
  return signGeometryCache;
};

interface HighwaySignProps {
  sign: HighwaySignType;
  onContextMenu: (e: ThreeEvent<MouseEvent>, sign: HighwaySignType) => void;
}

// Determine which wall is closest to a position
const getClosestWall = (x: number, y: number): WallSide => {
  const w = TUNNEL_WIDTH / 2;
  const h = TUNNEL_HEIGHT / 2;

  const distances = {
    left: Math.abs(x - (-w)),
    right: Math.abs(x - w),
    floor: Math.abs(y - (-h)),
    ceiling: Math.abs(y - h),
  };

  let closest: WallSide = 'right';
  let minDist = Infinity;

  for (const [wall, dist] of Object.entries(distances)) {
    if (dist < minDist) {
      minDist = dist;
      closest = wall as WallSide;
    }
  }

  return closest;
};

// Get snapped position and wall for a given drag position
const getSnappedPosition = (
  dragX: number,
  dragY: number,
  depth: number
): { wall: WallSide; position: THREE.Vector3 } => {
  const w = TUNNEL_WIDTH / 2 - 0.3;
  const h = TUNNEL_HEIGHT / 2 - 0.3;
  const closestWall = getClosestWall(dragX, dragY);

  let position: THREE.Vector3;

  switch (closestWall) {
    case 'left':
      position = new THREE.Vector3(-w, Math.max(-h + 1, Math.min(h - 1, dragY)), -depth);
      break;
    case 'right':
      position = new THREE.Vector3(w, Math.max(-h + 1, Math.min(h - 1, dragY)), -depth);
      break;
    case 'floor':
      position = new THREE.Vector3(Math.max(-w + 1, Math.min(w - 1, dragX)), -h + 0.8, -depth);
      break;
    case 'ceiling':
      position = new THREE.Vector3(Math.max(-w + 1, Math.min(w - 1, dragX)), h - 0.3, -depth);
      break;
  }

  return { wall: closestWall, position };
};

export const HighwaySign: React.FC<HighwaySignProps> = ({ sign, onContextMenu }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { updateSign } = useSceneStore();
  const { camera, gl, raycaster } = useThree();

  const [isDragging, setIsDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragPosition, setDragPosition] = useState<THREE.Vector3 | null>(null);
  const [previewWall, setPreviewWall] = useState<WallSide>(sign.wall);

  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), sign.depth));

  // Sign dimensions (must match geometry cache)
  const signWidth = 2.5;
  const signHeight = 1.2;
  const postLength = 1.5;

  // Get cached geometries
  const geometries = useMemo(() => getSignGeometries(), []);

  // Calculate post direction based on wall (memoized)
  const currentWall = isDragging ? previewWall : sign.wall;
  const postConfig = useMemo(() => {
    switch (currentWall) {
      case 'left':
        return { rotation: [0, 0, -Math.PI / 2] as [number, number, number], offset: [-postLength / 2 - signWidth / 2, 0, 0] as [number, number, number] };
      case 'right':
        return { rotation: [0, 0, Math.PI / 2] as [number, number, number], offset: [postLength / 2 + signWidth / 2, 0, 0] as [number, number, number] };
      case 'floor':
        return { rotation: [0, 0, 0] as [number, number, number], offset: [0, -postLength / 2 - signHeight / 2, 0] as [number, number, number] };
      case 'ceiling':
        return { rotation: [Math.PI, 0, 0] as [number, number, number], offset: [0, postLength / 2 + signHeight / 2, 0] as [number, number, number] };
    }
  }, [currentWall, postLength, signWidth, signHeight]);

  // Handle drag start
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 0) {
      e.stopPropagation();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

      // Set up drag plane perpendicular to camera at sign's depth
      dragPlane.current.constant = sign.depth;
    }
  };

  // Handle drag
  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!isDragging) return;

    // Create ray from mouse
    const rect = gl.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    raycaster.setFromCamera(mouse, camera);

    // Intersect with vertical plane at sign's Z position
    const intersection = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), sign.depth);
    raycaster.ray.intersectPlane(plane, intersection);

    if (intersection) {
      const { wall, position } = getSnappedPosition(intersection.x, intersection.y, sign.depth);
      setDragPosition(position);
      setPreviewWall(wall);
    }
  };

  // Handle drag end
  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (isDragging) {
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

      if (dragPosition) {
        updateSign(sign.id, {
          wall: previewWall,
          position: { x: dragPosition.x, y: dragPosition.y, z: dragPosition.z },
        });
      }
      setDragPosition(null);
    }
  };

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onContextMenu(e, sign);
  };

  const handlePointerEnter = () => {
    setHovered(true);
    document.body.style.cursor = 'grab';
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHovered(false);
      document.body.style.cursor = 'auto';
    }
  };

  // Current position (drag position or actual position)
  const currentPosition = isDragging && dragPosition
    ? [dragPosition.x, dragPosition.y, dragPosition.z] as [number, number, number]
    : [sign.position.x, sign.position.y, sign.position.z] as [number, number, number];

  // Sign color based on state
  const signColor = hovered || isDragging ? '#2ecc71' : '#27ae60';
  const textColor = '#ffffff';
  const fontSize = sign.fontSize || 32;

  return (
    <group
      ref={groupRef}
      position={currentPosition}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onContextMenu={handleContextMenu}
    >
      {/* Sign face - using cached geometry */}
      <mesh geometry={geometries.signBox}>
        <meshStandardMaterial color={signColor} metalness={0.2} roughness={0.8} />
      </mesh>

      {/* Sign border - using cached geometry */}
      <mesh position={[0, 0, 0.051]} geometry={geometries.signBorder}>
        <meshBasicMaterial color="#1a472a" />
      </mesh>

      {/* Text via HTML overlay - distanceFactor makes it scale with 3D distance */}
      <Html
        position={[0, 0, 0.1]}
        center
        distanceFactor={10}
        style={{
          color: textColor,
          fontSize: `${fontSize}px`,
          fontWeight: 'bold',
          fontFamily: 'Arial, sans-serif',
          textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {sign.name}
      </Html>

      {/* Post/pole - using cached geometry */}
      <mesh position={postConfig.offset} rotation={postConfig.rotation} geometry={geometries.post}>
        <meshStandardMaterial color="#555555" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Wall mount bracket - using cached geometry */}
      <mesh
        position={[
          postConfig.offset[0] + (currentWall === 'left' ? -postLength / 2 : currentWall === 'right' ? postLength / 2 : 0),
          postConfig.offset[1] + (currentWall === 'floor' ? -postLength / 2 : currentWall === 'ceiling' ? postLength / 2 : 0),
          postConfig.offset[2],
        ]}
        geometry={geometries.bracket}
      >
        <meshStandardMaterial color="#333333" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Drag indicator - show which wall it will snap to */}
      {isDragging && (
        <Html
          position={[0, signHeight / 2 + 0.3, 0]}
          center
          distanceFactor={6}
          style={{
            background: 'rgba(0,0,0,0.8)',
            color: '#2ecc71',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            pointerEvents: 'none',
          }}
        >
          {previewWall.toUpperCase()} wall
        </Html>
      )}
    </group>
  );
};
