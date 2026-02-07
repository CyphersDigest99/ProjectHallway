import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Text } from '@react-three/drei';
import { ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CanvasRichTextItem, WallSide } from '../../../shared/types';
import { useSceneStore } from '../../store/sceneStore';
import { TextToolbar } from './TextToolbar';

const TUNNEL_WIDTH = 16;
const TUNNEL_HEIGHT = 10;

interface WallTextBoxProps {
  item: CanvasRichTextItem;
  sectionZStart: number;
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
}

export const WallTextBox: React.FC<WallTextBoxProps> = ({
  item,
  sectionZStart,
  isSelected,
  onSelect,
  onContextMenu,
}) => {
  const updateCanvasItem = useSceneStore(s => s.updateCanvasItem);
  const { camera, gl } = useThree();

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.content);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  // Calculate 3D position from canvas coordinates
  const { position, rotation } = useMemo(() => {
    const w = TUNNEL_WIDTH / 2;
    const h = TUNNEL_HEIGHT / 2;

    // Convert canvas position to world position
    const canvasX = item.position.x;
    const canvasY = item.position.y;

    // Normalize to section (assuming 1600x1000 canvas)
    const normX = canvasX / 1600;
    const normY = canvasY / 1000;

    const sectionMidZ = -(sectionZStart + 5);
    const zOffset = (normX - 0.5) * 10; // Map to 10m section

    let pos: [number, number, number];
    let rot: [number, number, number];

    switch (item.wall) {
      case 'left':
        pos = [-w + 0.05, h - normY * TUNNEL_HEIGHT, sectionMidZ + zOffset];
        rot = [0, Math.PI / 2, 0];
        break;
      case 'right':
        pos = [w - 0.05, h - normY * TUNNEL_HEIGHT, sectionMidZ - zOffset];
        rot = [0, -Math.PI / 2, 0];
        break;
      case 'floor':
        pos = [w - normY * TUNNEL_WIDTH, -h + 0.05, sectionMidZ + zOffset];
        rot = [-Math.PI / 2, 0, 0];
        break;
      case 'ceiling':
        pos = [w - normY * TUNNEL_WIDTH, h - 0.05, sectionMidZ + zOffset];
        rot = [Math.PI / 2, 0, 0];
        break;
    }

    return { position: pos, rotation: rot };
  }, [item.wall, item.position, sectionZStart]);

  // Handle text editing
  useEffect(() => {
    if (isEditing) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsEditing(false);
          setEditText(item.content);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          setIsEditing(false);
          if (editText !== item.content) {
            updateCanvasItem(item.id, { content: editText });
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isEditing, editText, item.content, item.id, updateCanvasItem]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();

    if (isSelected && !isEditing) {
      setIsEditing(true);
      setShowToolbar(true);
      // Position toolbar near the click
      setToolbarPosition({ x: e.clientX, y: e.clientY - 150 });
    }
  };

  const handleDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setIsEditing(true);
    setShowToolbar(true);
    setToolbarPosition({ x: e.clientX, y: e.clientY - 150 });
  };

  const handleContextMenuEvent = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();
    onContextMenu(e);
  };

  // Text style calculations
  const textStyle = useMemo(() => {
    const fontWeight = item.bold ? 'bold' : 'normal';
    const fontStyle = item.italic ? 'italic' : 'normal';
    return { fontWeight, fontStyle };
  }, [item.bold, item.italic]);

  // Calculate max width based on size
  const maxWidth = item.size.width / 100; // Scale down for 3D

  return (
    <>
      <group ref={groupRef} position={position} rotation={rotation}>
        {/* Background plane if backgroundColor is set */}
        {item.backgroundColor && (
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[maxWidth + 0.2, item.size.height / 100 + 0.1]} />
            <meshBasicMaterial color={item.backgroundColor} transparent opacity={0.8} />
          </mesh>
        )}

        {/* Selection highlight */}
        {isSelected && (
          <mesh position={[0, 0, -0.02]}>
            <planeGeometry args={[maxWidth + 0.3, item.size.height / 100 + 0.2]} />
            <meshBasicMaterial color="#4ecdc4" transparent opacity={0.2} />
          </mesh>
        )}

        {/* Text content */}
        <Text
          fontSize={item.fontSize / 100}
          color={item.fontColor}
          anchorX={item.alignment}
          anchorY="top"
          maxWidth={maxWidth}
          textAlign={item.alignment}
          font={undefined}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenuEvent}
        >
          {isEditing ? editText : item.content}
        </Text>
      </group>

      {/* Toolbar overlay (rendered outside Three.js via portal) */}
      {showToolbar && isSelected && (
        <TextToolbar
          fontSize={item.fontSize}
          fontColor={item.fontColor}
          bold={item.bold}
          italic={item.italic}
          alignment={item.alignment}
          backgroundColor={item.backgroundColor}
          onFontSizeChange={(size) => updateCanvasItem(item.id, { fontSize: size })}
          onFontColorChange={(color) => updateCanvasItem(item.id, { fontColor: color })}
          onBoldChange={(bold) => updateCanvasItem(item.id, { bold })}
          onItalicChange={(italic) => updateCanvasItem(item.id, { italic })}
          onAlignmentChange={(alignment) => updateCanvasItem(item.id, { alignment })}
          onBackgroundColorChange={(color) => updateCanvasItem(item.id, { backgroundColor: color })}
          onClose={() => {
            setShowToolbar(false);
            setIsEditing(false);
          }}
          position={toolbarPosition}
        />
      )}
    </>
  );
};

// Helper component to add new text boxes
export const AddTextBox: React.FC<{
  wall: WallSide;
  sectionId: string;
  onAdd: (item: Omit<CanvasRichTextItem, 'id' | 'zIndex'>) => void;
}> = ({ wall, sectionId, onAdd }) => {
  const handleAdd = () => {
    onAdd({
      type: 'rich-text',
      wall,
      sectionId,
      position: { x: 400, y: 300 },
      size: { width: 300, height: 100 },
      content: 'Double-click to edit',
      fontSize: 24,
      fontColor: '#ffffff',
      bold: false,
      italic: false,
      alignment: 'left',
    });
  };

  return (
    <button onClick={handleAdd} className="add-text-btn">
      Add Text Box
    </button>
  );
};
