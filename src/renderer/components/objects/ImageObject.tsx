import React, { useRef, useState, useEffect } from 'react';
import { useFrame, ThreeEvent, useLoader } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { SceneObject } from '../../../shared/types';
import { useSceneStore } from '../../store/sceneStore';

interface ImageObjectProps {
  object: SceneObject;
  onContextMenu: (e: ThreeEvent<MouseEvent>, object: SceneObject) => void;
  onHover: (object: SceneObject | null, position?: { x: number; y: number }) => void;
}

export const ImageObject: React.FC<ImageObjectProps> = ({
  object,
  onContextMenu,
  onHover,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  const selectedObjectId = useSceneStore(s => s.selectedObjectId);
  const selectObject = useSceneStore(s => s.selectObject);
  const isSelected = selectedObjectId === object.id;

  // Load texture from file path
  useEffect(() => {
    if (object.imagePath) {
      const loadTexture = async () => {
        try {
          const buffer = await window.electronAPI.readFile(object.imagePath!);
          const blob = new Blob([buffer]);
          const url = URL.createObjectURL(blob);
          const loader = new THREE.TextureLoader();
          loader.load(url, (tex) => {
            setTexture(tex);
            URL.revokeObjectURL(url);
          });
        } catch (error) {
          console.error('Failed to load image:', error);
        }
      };
      loadTexture();
    }
  }, [object.imagePath]);

  const handleClick = async (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.button === 0) {
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

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onContextMenu(e, object);
  };

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

  useFrame(() => {
    if (meshRef.current && (isSelected || hovered)) {
      meshRef.current.rotation.y += 0.005;
    }
  });

  return (
    <Billboard
      position={[object.position.x, object.position.y, object.position.z]}
      follow={true}
    >
      <mesh
        ref={meshRef}
        scale={[object.scale.x, object.scale.y, 1]}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
      >
        <planeGeometry args={[1, 1]} />
        {texture ? (
          <meshBasicMaterial
            map={texture}
            transparent
            side={THREE.DoubleSide}
            opacity={isSelected || hovered ? 1 : 0.9}
          />
        ) : (
          <meshBasicMaterial color={object.color} side={THREE.DoubleSide} />
        )}
      </mesh>
    </Billboard>
  );
};
