import React, { useRef, useState } from 'react';
import { useThree, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { SceneObject } from '../../../shared/types';
import { useSceneStore } from '../../store/sceneStore';
import { PrimitiveObject } from './PrimitiveObject';
import { ImageObject } from './ImageObject';
import { ModelObject } from './ModelObject';

interface DraggableObjectProps {
  object: SceneObject;
  onContextMenu: (e: ThreeEvent<MouseEvent>, object: SceneObject) => void;
  onHover: (object: SceneObject | null, position?: { x: number; y: number }) => void;
}

export const DraggableObject: React.FC<DraggableObjectProps> = ({
  object,
  onContextMenu,
  onHover,
}) => {
  const { updateObject } = useSceneStore();
  const { camera, gl, raycaster } = useThree();
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<THREE.Vector3 | null>(null);
  const objectStartPos = useRef<THREE.Vector3 | null>(null);
  const planeRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 0) { // Left mouse button
      e.stopPropagation();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      // Store start positions
      const intersection = new THREE.Vector3();
      raycaster.ray.intersectPlane(planeRef.current, intersection);
      dragStartPos.current = intersection.clone();
      objectStartPos.current = new THREE.Vector3(
        object.position.x,
        object.position.y,
        object.position.z
      );

      // Update the plane to be at the object's Y position
      planeRef.current.constant = -object.position.y;
    }
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (isDragging && dragStartPos.current && objectStartPos.current) {
      const intersection = new THREE.Vector3();

      // Create a ray from the camera through the mouse position
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);
      raycaster.ray.intersectPlane(planeRef.current, intersection);

      if (intersection) {
        const delta = intersection.clone().sub(dragStartPos.current);
        const newPos = objectStartPos.current.clone().add(delta);

        updateObject(object.id, {
          position: { x: newPos.x, y: object.position.y, z: newPos.z },
        });
      }
    }
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (isDragging) {
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      dragStartPos.current = null;
      objectStartPos.current = null;
    }
  };

  // Wrapper group for drag handling
  return (
    <group
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {object.type === 'image' ? (
        <ImageObject object={object} onContextMenu={onContextMenu} onHover={onHover} />
      ) : object.type === 'model' ? (
        <ModelObject object={object} onContextMenu={onContextMenu} onHover={onHover} />
      ) : (
        <PrimitiveObject object={object} onContextMenu={onContextMenu} onHover={onHover} />
      )}
    </group>
  );
};
