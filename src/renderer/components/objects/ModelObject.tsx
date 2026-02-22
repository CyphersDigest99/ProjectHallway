import React, { useRef, useState, useEffect, Suspense } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SceneObject } from '../../../shared/types';
import { useSceneStore } from '../../store/sceneStore';

interface ModelObjectProps {
  object: SceneObject;
  onContextMenu: (e: ThreeEvent<MouseEvent>, object: SceneObject) => void;
  onHover: (object: SceneObject | null, position?: { x: number; y: number }) => void;
}

const LoadedModel: React.FC<ModelObjectProps & { modelUrl: string }> = ({
  object,
  onContextMenu,
  onHover,
  modelUrl,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const selectedObjectId = useSceneStore(s => s.selectedObjectId);
  const selectObject = useSceneStore(s => s.selectObject);
  const isSelected = selectedObjectId === object.id;

  const { scene } = useGLTF(modelUrl);

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
    if (groupRef.current && (isSelected || hovered)) {
      groupRef.current.rotation.y += 0.005;
    }
  });

  // Clone the scene for each instance
  const clonedScene = scene.clone();

  return (
    <group
      ref={groupRef}
      position={[object.position.x, object.position.y, object.position.z]}
      rotation={[object.rotation.x, object.rotation.y, object.rotation.z]}
      scale={[object.scale.x, object.scale.y, object.scale.z]}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
    >
      <primitive object={clonedScene} />
    </group>
  );
};

export const ModelObject: React.FC<ModelObjectProps> = (props) => {
  const [modelUrl, setModelUrl] = useState<string | null>(null);

  useEffect(() => {
    if (props.object.modelPath) {
      const loadModel = async () => {
        try {
          const buffer = await window.electronAPI.readFile(props.object.modelPath!);
          const blob = new Blob([buffer], { type: 'model/gltf-binary' });
          const url = URL.createObjectURL(blob);
          setModelUrl(url);
        } catch (error) {
          console.error('Failed to load model:', error);
        }
      };
      loadModel();

      return () => {
        if (modelUrl) {
          URL.revokeObjectURL(modelUrl);
        }
      };
    }
  }, [props.object.modelPath]);

  if (!modelUrl) {
    // Show placeholder while loading
    return (
      <mesh position={[props.object.position.x, props.object.position.y, props.object.position.z]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#888888" wireframe />
      </mesh>
    );
  }

  return (
    <Suspense fallback={null}>
      <LoadedModel {...props} modelUrl={modelUrl} />
    </Suspense>
  );
};
