import React, { useRef, useState, useMemo } from 'react';
import { useThree, ThreeEvent } from '@react-three/fiber';
import { Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import { DateMarker as DateMarkerType, WallSide } from '../../../shared/types';
import { useSceneStore } from '../../store/sceneStore';

const TUNNEL_WIDTH = 16;
const TUNNEL_HEIGHT = 10;

// Shared geometry cache for all date markers
let dateMarkerGeometryCache: {
  markerBox: THREE.BoxGeometry;
  markerBorder: THREE.PlaneGeometry;
  post: THREE.CylinderGeometry;
  bracket: THREE.BoxGeometry;
} | null = null;

const getDateMarkerGeometries = () => {
  if (dateMarkerGeometryCache) return dateMarkerGeometryCache;
  dateMarkerGeometryCache = {
    markerBox: new THREE.BoxGeometry(2.2, 1.4, 0.08),
    markerBorder: new THREE.PlaneGeometry(2.1, 1.3),
    post: new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8),
    bracket: new THREE.BoxGeometry(0.15, 0.15, 0.12),
  };
  return dateMarkerGeometryCache;
};

interface DateMarkerProps {
  marker: DateMarkerType;
  onContextMenu: (e: ThreeEvent<MouseEvent>, marker: DateMarkerType) => void;
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

// Format date for display
const formatDate = (isoDate: string, showTime: boolean): string => {
  const date = new Date(isoDate);
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };

  let formatted = date.toLocaleDateString('en-US', options);

  if (showTime) {
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    formatted += '\n' + date.toLocaleTimeString('en-US', timeOptions);
  }

  return formatted;
};

export const DateMarker: React.FC<DateMarkerProps> = ({ marker, onContextMenu }) => {
  const groupRef = useRef<THREE.Group>(null);
  const updateDateMarker = useSceneStore(s => s.updateDateMarker);
  const { camera, gl, raycaster } = useThree();

  const [isDragging, setIsDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragPosition, setDragPosition] = useState<THREE.Vector3 | null>(null);
  const [previewWall, setPreviewWall] = useState<WallSide>(marker.wall);

  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), marker.depth));

  // Marker dimensions (must match geometry cache)
  const markerWidth = 2.2;
  const markerHeight = 1.4;
  const postLength = 1.2;

  // Get cached geometries
  const geometries = useMemo(() => getDateMarkerGeometries(), []);

  // Calculate post direction based on wall (memoized)
  const currentWall = isDragging ? previewWall : marker.wall;
  const postConfig = useMemo(() => {
    switch (currentWall) {
      case 'left':
        return { rotation: [0, 0, -Math.PI / 2] as [number, number, number], offset: [-postLength / 2 - markerWidth / 2, 0, 0] as [number, number, number] };
      case 'right':
        return { rotation: [0, 0, Math.PI / 2] as [number, number, number], offset: [postLength / 2 + markerWidth / 2, 0, 0] as [number, number, number] };
      case 'floor':
        return { rotation: [0, 0, 0] as [number, number, number], offset: [0, -postLength / 2 - markerHeight / 2, 0] as [number, number, number] };
      case 'ceiling':
        return { rotation: [Math.PI, 0, 0] as [number, number, number], offset: [0, postLength / 2 + markerHeight / 2, 0] as [number, number, number] };
    }
  }, [currentWall, postLength, markerWidth, markerHeight]);

  // Handle drag start
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 0) {
      e.stopPropagation();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

      // Set up drag plane perpendicular to camera at marker's depth
      dragPlane.current.constant = marker.depth;
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

    // Intersect with vertical plane at marker's Z position
    const intersection = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), marker.depth);
    raycaster.ray.intersectPlane(plane, intersection);

    if (intersection) {
      const { wall, position } = getSnappedPosition(intersection.x, intersection.y, marker.depth);
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
        updateDateMarker(marker.id, {
          wall: previewWall,
          position: { x: dragPosition.x, y: dragPosition.y, z: dragPosition.z },
        });
      }
      setDragPosition(null);
    }
  };

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onContextMenu(e, marker);
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
    : [marker.position.x, marker.position.y, marker.position.z] as [number, number, number];

  // Marker color based on state - teal/calendar style
  const markerColor = hovered || isDragging ? '#5fd3d3' : '#4ecdc4';
  const borderColor = '#1a3a3a';
  const textColor = '#ffffff';
  const fontSize = marker.fontSize || 24;

  const displayText = formatDate(marker.date, marker.showTime);

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
      {/* Marker face - using cached geometry */}
      <mesh geometry={geometries.markerBox}>
        <meshStandardMaterial color={markerColor} metalness={0.3} roughness={0.6} />
      </mesh>

      {/* Marker border - using cached geometry */}
      <mesh position={[0, 0, 0.041]} geometry={geometries.markerBorder}>
        <meshBasicMaterial color={borderColor} />
      </mesh>

      {/* Calendar icon indicator at top-left */}
      <mesh position={[-0.85, 0.5, 0.05]}>
        <boxGeometry args={[0.25, 0.25, 0.02]} />
        <meshBasicMaterial color="#ff6b6b" />
      </mesh>

      {/* Text anchored to sign face - no billboarding */}
      <Text
        position={[0, 0, 0.08]}
        fontSize={fontSize * 0.015}
        color={textColor}
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
        textAlign="center"
        maxWidth={2}
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {displayText}
      </Text>

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
          position={[0, markerHeight / 2 + 0.3, 0]}
          center
          distanceFactor={6}
          style={{
            background: 'rgba(0,0,0,0.8)',
            color: '#4ecdc4',
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
