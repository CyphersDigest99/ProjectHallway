import React, { useRef, useState, useEffect } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { useDrag } from '@use-gesture/react';
import * as THREE from 'three';
import { SceneObject } from '../../../shared/types';
import { useSceneStore } from '../../store/sceneStore';

interface PrimitiveObjectProps {
  object: SceneObject;
  onContextMenu: (e: ThreeEvent<MouseEvent>, object: SceneObject) => void;
  onHover: (object: SceneObject | null, position?: { x: number; y: number }) => void;
}

export const PrimitiveObject: React.FC<PrimitiveObjectProps> = ({
  object,
  onContextMenu,
  onHover,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const updateObject = useSceneStore(s => s.updateObject);
  const selectedObjectId = useSceneStore(s => s.selectedObjectId);
  const selectObject = useSceneStore(s => s.selectObject);
  const isSelected = selectedObjectId === object.id;

  // Handle click to open directory
  const handleClick = async (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();

    if (e.button === 0 && !isDragging) { // Left click
      if (object.directoryPath) {
        try {
          await window.electronAPI.openDirectory(object.directoryPath);
        } catch (error) {
          console.error('Failed to open directory:', error);
        }
      }
      selectObject(object.id);
    }
  };

  // Handle right-click context menu
  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onContextMenu(e, object);
  };

  // Handle hover
  const handlePointerEnter = (e: ThreeEvent<PointerEvent>) => {
    setHovered(true);
    document.body.style.cursor = 'pointer';
    onHover(object, { x: e.clientX, y: e.clientY });
  };

  const handlePointerLeave = () => {
    setHovered(false);
    document.body.style.cursor = 'auto';
    onHover(null);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (hovered) {
      onHover(object, { x: e.clientX, y: e.clientY });
    }
  };

  // Render the appropriate geometry based on type
  const renderGeometry = () => {
    switch (object.type) {
      case 'cube':
        return <boxGeometry args={[1, 1, 1]} />;
      case 'sphere':
        return <sphereGeometry args={[0.5, 32, 32]} />;
      case 'cylinder':
        return <cylinderGeometry args={[0.4, 0.4, 1, 32]} />;
      case 'cone':
        return <coneGeometry args={[0.5, 1, 32]} />;
      case 'torus':
        return <torusGeometry args={[0.4, 0.15, 16, 32]} />;
      default:
        return <boxGeometry args={[1, 1, 1]} />;
    }
  };

  // Subtle animation when selected or hovered
  useFrame((state) => {
    if (meshRef.current && (isSelected || hovered)) {
      meshRef.current.rotation.y += 0.005;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[object.position.x, object.position.y, object.position.z]}
      rotation={[object.rotation.x, object.rotation.y, object.rotation.z]}
      scale={[object.scale.x, object.scale.y, object.scale.z]}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
    >
      {renderGeometry()}
      <meshStandardMaterial
        color={object.color}
        emissive={isSelected || hovered ? object.color : '#000000'}
        emissiveIntensity={isSelected ? 0.3 : hovered ? 0.15 : 0}
        metalness={0.3}
        roughness={0.4}
      />
    </mesh>
  );
};
