import React, { useState, useEffect, useCallback } from 'react';
import { AnyCanvasItem, CanvasImageItem, CanvasTextItem, CanvasDirectoryItem, CanvasHyperlinkItem, CanvasAppShortcutItem, CanvasFileShortcutItem, CanvasDrawingItem } from '../../../shared/types';
import { ResizeHandles } from './ResizeHandles';
import { useSceneStore } from '../../store/sceneStore';

interface CanvasItemProps {
  item: AnyCanvasItem;
  isSelected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  wallDimensions: { width: number; height: number };
}

export const CanvasItem: React.FC<CanvasItemProps> = ({
  item,
  isSelected,
  onSelect,
  onContextMenu,
  wallDimensions,
}) => {
  const { updateCanvasItem } = useSceneStore();
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
  }, [onSelect]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const parent = document.querySelector('.canvas-mode-container');
      if (!parent) return;

      const parentRect = parent.getBoundingClientRect();
      const newX = e.clientX - parentRect.left - dragOffset.x;
      const newY = e.clientY - parentRect.top - dragOffset.y;

      // Constrain to wall bounds
      const maxX = wallDimensions.width - item.size.width;
      const maxY = wallDimensions.height - item.size.height;

      updateCanvasItem(item.id, {
        position: {
          x: Math.max(0, Math.min(maxX, newX)),
          y: Math.max(0, Math.min(maxY, newY)),
        },
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, item.id, item.size, wallDimensions, updateCanvasItem]);

  const handleResize = useCallback((newBounds: { x: number; y: number; width: number; height: number }) => {
    updateCanvasItem(item.id, {
      position: { x: newBounds.x, y: newBounds.y },
      size: { width: newBounds.width, height: newBounds.height },
    });
  }, [item.id, updateCanvasItem]);

  const handleDoubleClick = useCallback(async () => {
    if (item.type === 'directory') {
      try {
        await window.electronAPI.openDirectory((item as CanvasDirectoryItem).directoryPath);
      } catch (error) {
        console.error('Failed to open directory:', error);
      }
    } else if (item.type === 'hyperlink') {
      try {
        await window.electronAPI.openUrl((item as CanvasHyperlinkItem).url);
      } catch (error) {
        console.error('Failed to open URL:', error);
      }
    } else if (item.type === 'app-shortcut' || item.type === 'file-shortcut') {
      try {
        const path = item.type === 'app-shortcut'
          ? (item as CanvasAppShortcutItem).appPath
          : (item as CanvasFileShortcutItem).filePath;
        await window.electronAPI.openPath(path);
      } catch (error) {
        console.error('Failed to open path:', error);
      }
    }
  }, [item]);

  const renderContent = () => {
    switch (item.type) {
      case 'image':
        return <ImageContent item={item as CanvasImageItem} />;
      case 'text':
        return <TextContent item={item as CanvasTextItem} isSelected={isSelected} />;
      case 'directory':
        return <DirectoryContent item={item as CanvasDirectoryItem} />;
      case 'hyperlink':
        return <HyperlinkContent item={item as CanvasHyperlinkItem} />;
      case 'app-shortcut':
        return <AppShortcutContent item={item as CanvasAppShortcutItem} />;
      case 'file-shortcut':
        return <FileShortcutContent item={item as CanvasFileShortcutItem} />;
      case 'drawing':
        return null; // Drawings are rendered in DrawingCanvas
      default:
        return null;
    }
  };

  if (item.type === 'drawing') return null;

  return (
    <div
      className={`canvas-item ${isSelected ? 'selected' : ''}`}
      style={{
        position: 'absolute',
        left: item.position.x,
        top: item.position.y,
        width: item.size.width,
        height: item.size.height,
        zIndex: item.zIndex,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={onContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      {renderContent()}
      {isSelected && (
        <ResizeHandles
          bounds={{
            x: item.position.x,
            y: item.position.y,
            width: item.size.width,
            height: item.size.height,
          }}
          onResize={handleResize}
          minSize={{ width: 20, height: 20 }}
          maxSize={wallDimensions}
        />
      )}
      <style>{`
        .canvas-item {
          border: 2px solid transparent;
          border-radius: 4px;
          transition: border-color 0.2s;
          overflow: hidden;
        }

        .canvas-item:hover {
          border-color: rgba(78, 205, 196, 0.5);
        }

        .canvas-item.selected {
          border-color: #4ecdc4;
        }
      `}</style>
    </div>
  );
};

// Image content component
const ImageContent: React.FC<{ item: CanvasImageItem }> = ({ item }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadImage = async () => {
      try {
        const buffer = await window.electronAPI.readFile(item.imagePath);
        const blob = new Blob([buffer]);
        const url = URL.createObjectURL(blob);
        setImageUrl(url);
        return () => URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Failed to load image:', error);
      }
    };
    loadImage();
  }, [item.imagePath]);

  if (!imageUrl) return <div className="loading-placeholder">Loading...</div>;

  return (
    <img
      src={imageUrl}
      alt=""
      style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
    />
  );
};

// Text content component
const TextContent: React.FC<{ item: CanvasTextItem; isSelected: boolean }> = ({ item, isSelected }) => {
  const { updateCanvasItem } = useSceneStore();
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(item.content);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    updateCanvasItem(item.id, { content: text } as Partial<CanvasTextItem>);
  };

  if (isEditing) {
    return (
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        autoFocus
        style={{
          width: '100%',
          height: '100%',
          fontSize: item.fontSize,
          color: item.fontColor,
          background: 'rgba(0, 0, 0, 0.5)',
          border: 'none',
          resize: 'none',
          padding: '8px',
          outline: 'none',
        }}
      />
    );
  }

  return (
    <div
      onDoubleClick={handleDoubleClick}
      style={{
        width: '100%',
        height: '100%',
        fontSize: item.fontSize,
        color: item.fontColor,
        padding: '8px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflow: 'hidden',
      }}
    >
      {item.content || 'Double-click to edit'}
    </div>
  );
};

// Directory shortcut content
const DirectoryContent: React.FC<{ item: CanvasDirectoryItem }> = ({ item }) => {
  return (
    <div className="shortcut-content">
      <div className="shortcut-icon">📁</div>
      <div className="shortcut-label">{item.label}</div>
      <style>{`
        .shortcut-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: rgba(0, 0, 0, 0.3);
          color: white;
          text-align: center;
          padding: 8px;
        }
        .shortcut-icon {
          font-size: 32px;
          margin-bottom: 4px;
        }
        .shortcut-label {
          font-size: 12px;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
};

// Hyperlink content
const HyperlinkContent: React.FC<{ item: CanvasHyperlinkItem }> = ({ item }) => {
  return (
    <div className="shortcut-content">
      <div className="shortcut-icon">🔗</div>
      <div className="shortcut-label">{item.label}</div>
      <style>{`
        .shortcut-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: rgba(0, 0, 0, 0.3);
          color: white;
          text-align: center;
          padding: 8px;
        }
        .shortcut-icon {
          font-size: 32px;
          margin-bottom: 4px;
        }
        .shortcut-label {
          font-size: 12px;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
};

// App shortcut content
const AppShortcutContent: React.FC<{ item: CanvasAppShortcutItem }> = ({ item }) => {
  return (
    <div className="shortcut-content">
      {item.iconDataUrl ? (
        <img src={item.iconDataUrl} alt="" className="app-icon" />
      ) : (
        <div className="shortcut-icon">📱</div>
      )}
      <div className="shortcut-label">{item.label}</div>
      <style>{`
        .shortcut-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: rgba(0, 0, 0, 0.3);
          color: white;
          text-align: center;
          padding: 8px;
        }
        .app-icon {
          width: 32px;
          height: 32px;
          margin-bottom: 4px;
        }
        .shortcut-icon {
          font-size: 32px;
          margin-bottom: 4px;
        }
        .shortcut-label {
          font-size: 12px;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
};

// File shortcut content
const FileShortcutContent: React.FC<{ item: CanvasFileShortcutItem }> = ({ item }) => {
  return (
    <div className="shortcut-content">
      {item.iconDataUrl ? (
        <img src={item.iconDataUrl} alt="" className="file-icon" />
      ) : (
        <div className="shortcut-icon">📄</div>
      )}
      <div className="shortcut-label">{item.label}</div>
      <style>{`
        .shortcut-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: rgba(0, 0, 0, 0.3);
          color: white;
          text-align: center;
          padding: 8px;
        }
        .file-icon {
          width: 32px;
          height: 32px;
          margin-bottom: 4px;
        }
        .shortcut-icon {
          font-size: 32px;
          margin-bottom: 4px;
        }
        .shortcut-label {
          font-size: 12px;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
};
