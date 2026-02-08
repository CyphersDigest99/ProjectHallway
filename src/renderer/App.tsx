import React, { useState, useEffect, useCallback } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { Scene } from './components/Scene';
import { Toolbar } from './components/ui/Toolbar';
import { ContextMenu } from './components/ui/ContextMenu';
import { Tooltip } from './components/ui/Tooltip';
import { NameDialog } from './components/ui/NameDialog';
import { Instructions } from './components/ui/Instructions';
import { VisualEditor, LightContextMenu } from './components/ui/VisualEditor';
import { CanvasMode } from './components/canvas';
import { DecoratingMode3D } from './components/canvas/DecoratingMode3D';
import { CanvasContextMenu } from './components/ui/CanvasContextMenu';
import { useSceneStore } from './store/sceneStore';
import { useShallow } from 'zustand/react/shallow';
import { SceneObject, ObjectType, HighwaySign, CeilingLight, WallSide, AnyCanvasItem, CanvasTextItem, CanvasImageItem, CanvasDirectoryItem, CanvasHyperlinkItem, CanvasAppShortcutItem, CanvasFileShortcutItem, DateMarker, LightFixtureStyle } from '../shared/types';
import { DateMarkerModal } from './components/ui/DateMarkerModal';
import { LightFixtureModal } from './components/ui/LightFixtureModal';

interface ContextMenuState {
  x: number;
  y: number;
  object: SceneObject;
}

interface WallContextMenuState {
  x: number;
  y: number;
  position: { x: number; y: number; z: number };
  wall: WallSide;
}

interface TooltipState {
  object: SceneObject;
  x: number;
  y: number;
}

interface NameDialogState {
  objectId: string;
  currentName: string;
  currentFontSize: number;
  isSign?: boolean;
}

interface SignContextMenuState {
  x: number;
  y: number;
  sign: HighwaySign;
}

interface LightContextMenuState {
  x: number;
  y: number;
  light: CeilingLight;
}

interface CanvasContextMenuState {
  x: number;
  y: number;
  selectedItem?: AnyCanvasItem | null;
}

interface DateMarkerContextMenuState {
  x: number;
  y: number;
  marker: DateMarker;
}

interface InputDialogState {
  title: string;
  label: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
}

const App: React.FC = () => {
  const {
    objects, signs, lights,
    addObject, updateObject, removeObject,
    updateSign, removeSign,
    updateWallSettings, setPendingWallpaper, clearPendingWallpaper, confirmWallImage,
    loadState,
    // Navigation mode
    navigationMode, canvasModeState, decoratingState, enterCanvasMode, enterDecoratingMode,
    // Canvas items
    addCanvasItem, selectedCanvasItemId,
    // Date markers
    dateMarkers, pendingDateMarker, startPlacingDateMarker, confirmDateMarkerPlacement, cancelDateMarkerPlacement, removeDateMarker, updateDateMarker,
    // Light placement
    pendingLight, startPlacingLight, confirmLightPlacement, cancelLightPlacement, removeLight,
    // Wall sections
    updateWallSection, wallSections,
    // Wall section interaction
    getWallSectionAt, clearSectionDrawings, copySectionDrawings, pasteSectionDrawings,
    // Clipboard
    canvasClipboard,
    // Branching
    createBranch,
  } = useSceneStore(useShallow(s => ({
    objects: s.objects,
    signs: s.signs,
    lights: s.lights,
    addObject: s.addObject,
    updateObject: s.updateObject,
    removeObject: s.removeObject,
    updateSign: s.updateSign,
    removeSign: s.removeSign,
    updateWallSettings: s.updateWallSettings,
    setPendingWallpaper: s.setPendingWallpaper,
    clearPendingWallpaper: s.clearPendingWallpaper,
    confirmWallImage: s.confirmWallImage,
    loadState: s.loadState,
    navigationMode: s.navigationMode,
    canvasModeState: s.canvasModeState,
    decoratingState: s.decoratingState,
    enterCanvasMode: s.enterCanvasMode,
    enterDecoratingMode: s.enterDecoratingMode,
    addCanvasItem: s.addCanvasItem,
    selectedCanvasItemId: s.selectedCanvasItemId,
    dateMarkers: s.dateMarkers,
    pendingDateMarker: s.pendingDateMarker,
    startPlacingDateMarker: s.startPlacingDateMarker,
    confirmDateMarkerPlacement: s.confirmDateMarkerPlacement,
    cancelDateMarkerPlacement: s.cancelDateMarkerPlacement,
    removeDateMarker: s.removeDateMarker,
    updateDateMarker: s.updateDateMarker,
    pendingLight: s.pendingLight,
    startPlacingLight: s.startPlacingLight,
    confirmLightPlacement: s.confirmLightPlacement,
    cancelLightPlacement: s.cancelLightPlacement,
    removeLight: s.removeLight,
    updateWallSection: s.updateWallSection,
    wallSections: s.wallSections,
    getWallSectionAt: s.getWallSectionAt,
    clearSectionDrawings: s.clearSectionDrawings,
    copySectionDrawings: s.copySectionDrawings,
    pasteSectionDrawings: s.pasteSectionDrawings,
    canvasClipboard: s.canvasClipboard,
    createBranch: s.createBranch,
  })));

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [wallContextMenu, setWallContextMenu] = useState<WallContextMenuState | null>(null);
  const [signContextMenu, setSignContextMenu] = useState<SignContextMenuState | null>(null);
  const [lightContextMenu, setLightContextMenu] = useState<LightContextMenuState | null>(null);
  const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuState | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [inputDialog, setInputDialog] = useState<InputDialogState | null>(null);
  const [colorPickerState, setColorPickerState] = useState<{ visible: boolean; currentColor: string; sectionId: string } | null>(null);
  const [showVisualEditor, setShowVisualEditor] = useState(true);
  const [currentDepth, setCurrentDepth] = useState(0);
  const [dateMarkerContextMenu, setDateMarkerContextMenu] = useState<DateMarkerContextMenuState | null>(null);
  const [showDateMarkerModal, setShowDateMarkerModal] = useState(false);
  const [showLightFixtureModal, setShowLightFixtureModal] = useState(false);
  const [lastWallClickTime, setLastWallClickTime] = useState(0);
  const [lastWallClickWall, setLastWallClickWall] = useState<WallSide | null>(null);
  const [wallSectionPopup, setWallSectionPopup] = useState<{
    x: number; y: number; wall: WallSide; sectionId: string;
  } | null>(null);

  // Load saved state on mount
  useEffect(() => {
    loadState();
  }, [loadState]);

  // Handle adding object at specific position
  const addObjectAtPosition = useCallback((type: ObjectType, position: { x: number; y: number; z: number }) => {
    const newObject = addObject(type, { position });
    setNameDialog({
      objectId: newObject.id,
      currentName: newObject.name,
      currentFontSize: newObject.fontSize || 24,
    });
    setWallContextMenu(null);
  }, [addObject]);

  // Handle context menu on existing object
  const handleObjectContextMenu = useCallback((e: ThreeEvent<MouseEvent>, object: SceneObject) => {
    e.nativeEvent.preventDefault();
    setContextMenu({
      x: e.nativeEvent.clientX,
      y: e.nativeEvent.clientY,
      object,
    });
    setWallContextMenu(null);
    setSignContextMenu(null);
    setTooltip(null);
    setWallSectionPopup(null);
  }, []);

  // Handle context menu on highway sign
  const handleSignContextMenu = useCallback((e: ThreeEvent<MouseEvent>, sign: HighwaySign) => {
    e.nativeEvent.preventDefault();
    setSignContextMenu({
      x: e.nativeEvent.clientX,
      y: e.nativeEvent.clientY,
      sign,
    });
    setContextMenu(null);
    setWallContextMenu(null);
    setLightContextMenu(null);
    setTooltip(null);
    setWallSectionPopup(null);
  }, []);

  // Handle context menu on ceiling light
  const handleLightContextMenu = useCallback((e: ThreeEvent<MouseEvent>, light: CeilingLight) => {
    e.nativeEvent.preventDefault();
    setLightContextMenu({
      x: e.nativeEvent.clientX,
      y: e.nativeEvent.clientY,
      light,
    });
    setContextMenu(null);
    setWallContextMenu(null);
    setSignContextMenu(null);
    setTooltip(null);
    setWallSectionPopup(null);
  }, []);

  // Handle click/right-click on tunnel wall
  const handleWallClick = useCallback((position: { x: number; y: number; z: number }, event: ThreeEvent<MouseEvent>, wall: WallSide) => {
    event.nativeEvent.preventDefault();

    // Left-click handling (in normal mode)
    if (event.nativeEvent.button === 0 && navigationMode === 'normal') {
      const now = Date.now();
      const isDoubleClick = now - lastWallClickTime < 400 && lastWallClickWall === wall;
      const isLeftOrRight = wall === 'left' || wall === 'right';

      if (isDoubleClick && isLeftOrRight) {
        // Double-click on left/right wall enters decorating mode
        enterDecoratingMode(wall, Math.abs(position.z));
        setLastWallClickTime(0);
        setLastWallClickWall(null);
        setWallSectionPopup(null);
      } else if (isLeftOrRight) {
        // Single-click on left/right wall shows section popup
        const section = getWallSectionAt(wall, position.z);
        if (section) {
          setWallSectionPopup({
            x: event.nativeEvent.clientX,
            y: event.nativeEvent.clientY,
            wall,
            sectionId: section.id,
          });
          // Close other menus
          setContextMenu(null);
          setWallContextMenu(null);
          setSignContextMenu(null);
          setLightContextMenu(null);
          setCanvasContextMenu(null);
          setDateMarkerContextMenu(null);
        }
        setLastWallClickTime(now);
        setLastWallClickWall(wall);
      }
      return;
    }

    // Right-click shows menu to add object or image
    if (event.nativeEvent.button === 2) {
      setWallContextMenu({
        x: event.nativeEvent.clientX,
        y: event.nativeEvent.clientY,
        position,
        wall,
      });
      setContextMenu(null);
      setWallSectionPopup(null);
    }
  }, [navigationMode, enterDecoratingMode, lastWallClickTime, lastWallClickWall, getWallSectionAt]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const closeWallContextMenu = useCallback(() => {
    setWallContextMenu(null);
  }, []);

  const closeSignContextMenu = useCallback(() => {
    setSignContextMenu(null);
  }, []);

  const closeLightContextMenu = useCallback(() => {
    setLightContextMenu(null);
  }, []);

  const closeCanvasContextMenu = useCallback(() => {
    setCanvasContextMenu(null);
  }, []);

  const closeWallSectionPopup = useCallback(() => {
    setWallSectionPopup(null);
  }, []);

  // Canvas context menu handler
  const handleCanvasContextMenu = useCallback((e: React.MouseEvent, item?: AnyCanvasItem) => {
    e.preventDefault();
    setCanvasContextMenu({
      x: e.clientX,
      y: e.clientY,
      selectedItem: item,
    });
  }, []);

  // Enter decorating mode (decorate wall in 3D)
  const handleEnterDecoratingMode = useCallback((wall: WallSide, zPosition: number) => {
    enterDecoratingMode(wall, zPosition);
    setWallContextMenu(null);
  }, [enterDecoratingMode]);

  // Enter canvas mode (legacy 2D overlay - kept for compatibility)
  const handleEnterCanvasMode = useCallback((wall: WallSide, zPosition: number) => {
    enterCanvasMode(wall, zPosition);
    setWallContextMenu(null);
  }, [enterCanvasMode]);

  // Canvas item add handlers
  const handleAddCanvasImage = useCallback(async () => {
    if (!canvasModeState) return;
    try {
      const imagePath = await window.electronAPI.selectImageFile();
      if (imagePath) {
        addCanvasItem({
          type: 'image',
          wall: canvasModeState.wall,
          sectionId: canvasModeState.sectionId,
          position: { x: 100, y: 100 },
          size: { width: 200, height: 150 },
          imagePath,
        } as Omit<CanvasImageItem, 'id' | 'zIndex'>);
      }
    } catch (error) {
      console.error('Failed to add canvas image:', error);
    }
  }, [canvasModeState, addCanvasItem]);

  const handleAddCanvasTextBox = useCallback(() => {
    if (!canvasModeState) return;
    addCanvasItem({
      type: 'text',
      wall: canvasModeState.wall,
      sectionId: canvasModeState.sectionId,
      position: { x: 100, y: 100 },
      size: { width: 200, height: 100 },
      content: 'New Text',
      fontSize: 16,
      fontColor: '#ffffff',
    } as Omit<CanvasTextItem, 'id' | 'zIndex'>);
  }, [canvasModeState, addCanvasItem]);

  const handleAddDirectoryShortcut = useCallback(async () => {
    if (!canvasModeState) return;
    try {
      const directoryPath = await window.electronAPI.selectDirectory();
      if (directoryPath) {
        const label = directoryPath.split(/[/\\]/).pop() || 'Folder';
        addCanvasItem({
          type: 'directory',
          wall: canvasModeState.wall,
          sectionId: canvasModeState.sectionId,
          position: { x: 100, y: 100 },
          size: { width: 80, height: 100 },
          directoryPath,
          label,
        } as Omit<CanvasDirectoryItem, 'id' | 'zIndex'>);
      }
    } catch (error) {
      console.error('Failed to add directory shortcut:', error);
    }
  }, [canvasModeState, addCanvasItem]);

  const handleAddHyperlink = useCallback(() => {
    if (!canvasModeState) return;
    setInputDialog({
      title: 'Add Hyperlink',
      label: 'Enter URL:',
      defaultValue: 'https://',
      onConfirm: (url) => {
        const label = url.replace(/^https?:\/\//, '').split('/')[0];
        addCanvasItem({
          type: 'hyperlink',
          wall: canvasModeState.wall,
          sectionId: canvasModeState.sectionId,
          position: { x: 100, y: 100 },
          size: { width: 80, height: 100 },
          url,
          label,
        } as Omit<CanvasHyperlinkItem, 'id' | 'zIndex'>);
        setInputDialog(null);
      },
    });
  }, [canvasModeState, addCanvasItem]);

  const handleAddAppShortcut = useCallback(async () => {
    if (!canvasModeState) return;
    try {
      const appPath = await window.electronAPI.selectApp();
      if (appPath) {
        const label = appPath.split(/[/\\]/).pop()?.replace(/\.(exe|app|lnk)$/i, '') || 'App';
        let iconDataUrl: string | undefined;
        try {
          iconDataUrl = await window.electronAPI.getFileIcon(appPath);
        } catch {}
        addCanvasItem({
          type: 'app-shortcut',
          wall: canvasModeState.wall,
          sectionId: canvasModeState.sectionId,
          position: { x: 100, y: 100 },
          size: { width: 80, height: 100 },
          appPath,
          label,
          iconDataUrl,
        } as Omit<CanvasAppShortcutItem, 'id' | 'zIndex'>);
      }
    } catch (error) {
      console.error('Failed to add app shortcut:', error);
    }
  }, [canvasModeState, addCanvasItem]);

  const handleAddFileShortcut = useCallback(async () => {
    if (!canvasModeState) return;
    try {
      const filePath = await window.electronAPI.selectFile();
      if (filePath) {
        const label = filePath.split(/[/\\]/).pop() || 'File';
        let iconDataUrl: string | undefined;
        try {
          iconDataUrl = await window.electronAPI.getFileIcon(filePath);
        } catch {}
        addCanvasItem({
          type: 'file-shortcut',
          wall: canvasModeState.wall,
          sectionId: canvasModeState.sectionId,
          position: { x: 100, y: 100 },
          size: { width: 80, height: 100 },
          filePath,
          label,
          iconDataUrl,
        } as Omit<CanvasFileShortcutItem, 'id' | 'zIndex'>);
      }
    } catch (error) {
      console.error('Failed to add file shortcut:', error);
    }
  }, [canvasModeState, addCanvasItem]);

  const handleChangeWallColor = useCallback(() => {
    // Show color picker for current wall section
    if (!canvasModeState) return;
    const section = wallSections.find((s) => s.id === canvasModeState.sectionId);
    const currentColor = section?.color || '#161b22';
    setColorPickerState({ visible: true, currentColor, sectionId: canvasModeState.sectionId });
  }, [canvasModeState, wallSections]);

  // Handle color picker color change
  const handleColorChange = useCallback((color: string) => {
    if (colorPickerState) {
      updateWallSection(colorPickerState.sectionId, { color });
      setColorPickerState(null);
    }
  }, [colorPickerState, updateWallSection]);

  // Close color picker
  const closeColorPicker = useCallback(() => {
    setColorPickerState(null);
  }, []);

  // Handle adding date marker from wall context menu
  const handleAddDateMarker = useCallback((wall: WallSide, position: { x: number; y: number; z: number }) => {
    const depth = Math.abs(position.z);
    startPlacingDateMarker(wall, position, depth);
    setWallContextMenu(null);
    setShowDateMarkerModal(true);
  }, [startPlacingDateMarker]);

  // Handle date marker modal confirm
  const handleDateMarkerConfirm = useCallback((date: string, showTime: boolean) => {
    confirmDateMarkerPlacement(date, showTime);
    setShowDateMarkerModal(false);
  }, [confirmDateMarkerPlacement]);

  // Handle date marker modal cancel
  const handleDateMarkerCancel = useCallback(() => {
    cancelDateMarkerPlacement();
    setShowDateMarkerModal(false);
  }, [cancelDateMarkerPlacement]);

  // Handle adding light fixture from wall context menu (ceiling only)
  const handleAddLightFixture = useCallback((wall: WallSide, position: { x: number; y: number; z: number }) => {
    const depth = Math.abs(position.z);
    startPlacingLight(wall, position, depth);
    setWallContextMenu(null);
    setShowLightFixtureModal(true);
  }, [startPlacingLight]);

  // Handle light fixture modal confirm
  const handleLightFixtureConfirm = useCallback((style: LightFixtureStyle, length: number, brightness: number, temperature: number) => {
    confirmLightPlacement(style, length, brightness, temperature);
    setShowLightFixtureModal(false);
  }, [confirmLightPlacement]);

  // Handle light fixture modal cancel
  const handleLightFixtureCancel = useCallback(() => {
    cancelLightPlacement();
    setShowLightFixtureModal(false);
  }, [cancelLightPlacement]);

  // Handle date marker context menu
  const handleDateMarkerContextMenu = useCallback((e: any, marker: DateMarker) => {
    e.nativeEvent.preventDefault();
    setDateMarkerContextMenu({
      x: e.nativeEvent.clientX,
      y: e.nativeEvent.clientY,
      marker,
    });
    setContextMenu(null);
    setWallContextMenu(null);
    setSignContextMenu(null);
    setLightContextMenu(null);
  }, []);

  // Close date marker context menu
  const closeDateMarkerContextMenu = useCallback(() => {
    setDateMarkerContextMenu(null);
  }, []);

  // Handle date marker delete
  const handleDateMarkerDelete = useCallback(() => {
    if (dateMarkerContextMenu) {
      removeDateMarker(dateMarkerContextMenu.marker.id);
      setDateMarkerContextMenu(null);
    }
  }, [dateMarkerContextMenu, removeDateMarker]);

  // Handle wallpaper selection for a wall - sets pending wallpaper for preview
  const handleSelectWallpaper = useCallback(async (wall: WallSide) => {
    try {
      const imagePath = await window.electronAPI.selectImageFile();
      if (imagePath) {
        setPendingWallpaper(wall, imagePath);
      }
    } catch (error) {
      console.error('Failed to select wallpaper:', error);
    }
  }, [setPendingWallpaper]);

  // Handle confirming wallpaper placement
  const handleConfirmWallpaper = useCallback((zPosition: number) => {
    confirmWallImage(zPosition);
  }, [confirmWallImage]);

  // Handle canceling wallpaper placement
  const handleCancelWallpaper = useCallback(() => {
    clearPendingWallpaper();
  }, [clearPendingWallpaper]);

  // Handle adding image from wall context menu
  const handleAddWallImage = useCallback(async (wall: WallSide) => {
    try {
      const imagePath = await window.electronAPI.selectImageFile();
      if (imagePath) {
        setPendingWallpaper(wall, imagePath);
      }
    } catch (error) {
      console.error('Failed to select image:', error);
    }
    setWallContextMenu(null);
  }, [setPendingWallpaper]);

  // Handle hover/tooltip
  const handleHover = useCallback((object: SceneObject | null, position?: { x: number; y: number }) => {
    if (object && position) {
      setTooltip({ object, x: position.x, y: position.y });
    } else {
      setTooltip(null);
    }
  }, []);

  // Context menu actions for existing objects
  const handleAssignDirectory = useCallback(async () => {
    if (contextMenu) {
      const directoryPath = await window.electronAPI.selectDirectory();
      if (directoryPath) {
        const folderName = directoryPath.split(/[/\\]/).pop() || 'Project';
        updateObject(contextMenu.object.id, {
          directoryPath,
          name: folderName,
        });
      }
    }
  }, [contextMenu, updateObject]);

  const handleChangeColor = useCallback((color: string) => {
    if (contextMenu) {
      updateObject(contextMenu.object.id, { color });
    }
  }, [contextMenu, updateObject]);

  const handleRename = useCallback(() => {
    if (contextMenu) {
      setNameDialog({
        objectId: contextMenu.object.id,
        currentName: contextMenu.object.name,
        currentFontSize: contextMenu.object.fontSize || 24,
      });
    }
  }, [contextMenu]);

  const handleDelete = useCallback(() => {
    if (contextMenu) {
      removeObject(contextMenu.object.id);
    }
  }, [contextMenu, removeObject]);

  // Sign context menu actions
  const handleSignRename = useCallback(() => {
    if (signContextMenu) {
      setNameDialog({
        objectId: signContextMenu.sign.id,
        currentName: signContextMenu.sign.name,
        currentFontSize: signContextMenu.sign.fontSize || 32,
        isSign: true,
      });
      setSignContextMenu(null);
    }
  }, [signContextMenu]);

  const handleSignDelete = useCallback(() => {
    if (signContextMenu) {
      removeSign(signContextMenu.sign.id);
      setSignContextMenu(null);
    }
  }, [signContextMenu, removeSign]);

  // Name dialog handlers
  const handleNameConfirm = useCallback((name: string, fontSize?: number) => {
    if (nameDialog) {
      if (nameDialog.isSign) {
        updateSign(nameDialog.objectId, { name, fontSize });
      } else {
        updateObject(nameDialog.objectId, { name, fontSize });
      }
      setNameDialog(null);
    }
  }, [nameDialog, updateObject, updateSign]);

  const handleNameCancel = useCallback(() => {
    setNameDialog(null);
  }, []);

  // Handle scroll position changes
  const handleScrollChange = useCallback((scrollZ: number) => {
    setCurrentDepth(scrollZ);
  }, []);

  // Toolbar add - place at current depth, random wall position
  const handleToolbarAddObject = useCallback((type: ObjectType) => {
    const TUNNEL_WIDTH = 16;
    const TUNNEL_HEIGHT = 10;
    const w = TUNNEL_WIDTH / 2 - 1;
    const h = TUNNEL_HEIGHT / 2 - 1;

    // Random wall placement
    const side = Math.floor(Math.random() * 4);
    let position;
    switch (side) {
      case 0: position = { x: -w, y: (Math.random() - 0.5) * TUNNEL_HEIGHT * 0.6, z: -(currentDepth + 5) }; break;
      case 1: position = { x: w, y: (Math.random() - 0.5) * TUNNEL_HEIGHT * 0.6, z: -(currentDepth + 5) }; break;
      case 2: position = { x: (Math.random() - 0.5) * TUNNEL_WIDTH * 0.6, y: -h, z: -(currentDepth + 5) }; break;
      default: position = { x: (Math.random() - 0.5) * TUNNEL_WIDTH * 0.6, y: h, z: -(currentDepth + 5) }; break;
    }

    const newObject = addObject(type, { position });
    setNameDialog({
      objectId: newObject.id,
      currentName: newObject.name,
      currentFontSize: newObject.fontSize || 24,
    });
  }, [addObject, currentDepth]);

  // Import handlers
  const handleImportModel = useCallback(async () => {
    try {
      const modelPath = await window.electronAPI.selectModelFile();
      if (modelPath) {
        const fileName = modelPath.split(/[/\\]/).pop() || '3D Model';
        const name = fileName.replace(/\.(glb|gltf)$/i, '');
        const position = { x: 0, y: 0, z: -(currentDepth + 5) };
        addObject('model', { name, modelPath, position });
      }
    } catch (error) {
      console.error('Failed to import model:', error);
    }
  }, [addObject, currentDepth]);

  const handleImportImage = useCallback(async () => {
    try {
      const imagePath = await window.electronAPI.selectImageFile();
      if (imagePath) {
        const fileName = imagePath.split(/[/\\]/).pop() || 'Image';
        const name = fileName.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
        const position = { x: 0, y: 0, z: -(currentDepth + 5) };
        addObject('image', { name, imagePath, position });
      }
    } catch (error) {
      console.error('Failed to import image:', error);
    }
  }, [addObject, currentDepth]);

  return (
    <div className="app-container">
      <Scene
        onContextMenu={handleObjectContextMenu}
        onSignContextMenu={handleSignContextMenu}
        onLightContextMenu={handleLightContextMenu}
        onDateMarkerContextMenu={handleDateMarkerContextMenu}
        onHover={handleHover}
        onScrollChange={handleScrollChange}
        onWallClick={handleWallClick}
        onConfirmWallpaper={handleConfirmWallpaper}
        onCancelWallpaper={handleCancelWallpaper}
      />

      <Toolbar
        onAddObject={handleToolbarAddObject}
        onImportModel={handleImportModel}
        onImportImage={handleImportImage}
        onToggleEditor={() => setShowVisualEditor(!showVisualEditor)}
        showEditor={showVisualEditor}
        currentDepth={currentDepth}
      />

      <Instructions />

      {tooltip && !contextMenu && !wallContextMenu && (
        <Tooltip
          object={tooltip.object}
          x={tooltip.x}
          y={tooltip.y}
        />
      )}

      {/* Context menu for existing objects */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          object={contextMenu.object}
          onClose={closeContextMenu}
          onAssignDirectory={handleAssignDirectory}
          onChangeColor={handleChangeColor}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      )}

      {/* Context menu for wall clicks - add new object or image */}
      {wallContextMenu && (
        <WallContextMenu
          x={wallContextMenu.x}
          y={wallContextMenu.y}
          wall={wallContextMenu.wall}
          position={wallContextMenu.position}
          onClose={closeWallContextMenu}
          onAddObject={(type) => addObjectAtPosition(type, wallContextMenu.position)}
          onAddImage={() => handleAddWallImage(wallContextMenu.wall)}
          onDecorate={() => handleEnterDecoratingMode(wallContextMenu.wall, Math.abs(wallContextMenu.position.z))}
          onAddDateMarker={() => handleAddDateMarker(wallContextMenu.wall, wallContextMenu.position)}
          onAddLight={() => handleAddLightFixture(wallContextMenu.wall, wallContextMenu.position)}
        />
      )}

      {/* Wall section popup (single-click on left/right wall) */}
      {wallSectionPopup && (
        <WallSectionPopup
          x={wallSectionPopup.x}
          y={wallSectionPopup.y}
          wall={wallSectionPopup.wall}
          sectionId={wallSectionPopup.sectionId}
          onClose={closeWallSectionPopup}
          onClearWall={() => clearSectionDrawings(wallSectionPopup.sectionId)}
          onCopyWall={() => copySectionDrawings(wallSectionPopup.sectionId)}
          onPasteWall={() => pasteSectionDrawings(wallSectionPopup.sectionId, wallSectionPopup.wall)}
          canPaste={canvasClipboard != null && canvasClipboard.length > 0}
          onCreateBranch={() => {
            const section = wallSections.find(s => s.id === wallSectionPopup.sectionId);
            if (section) {
              createBranch((section.zStart + section.zEnd) / 2);
            }
          }}
        />
      )}

      {/* Context menu for highway signs */}
      {signContextMenu && (
        <SignContextMenu
          x={signContextMenu.x}
          y={signContextMenu.y}
          sign={signContextMenu.sign}
          onClose={closeSignContextMenu}
          onRename={handleSignRename}
          onDelete={handleSignDelete}
        />
      )}

      {nameDialog && (
        <NameDialog
          initialName={nameDialog.currentName}
          initialFontSize={nameDialog.currentFontSize}
          showFontSize={true}
          onConfirm={handleNameConfirm}
          onCancel={handleNameCancel}
          title={nameDialog.isSign ? 'Edit Sign' : 'Edit Label'}
        />
      )}

      {/* Light context menu */}
      {lightContextMenu && (
        <LightContextMenu
          x={lightContextMenu.x}
          y={lightContextMenu.y}
          lightId={lightContextMenu.light.id}
          brightness={lightContextMenu.light.brightness}
          temperature={lightContextMenu.light.temperature || 5500}
          fixtureStyle={lightContextMenu.light.fixtureStyle}
          fixtureLength={lightContextMenu.light.fixtureLength}
          isAutoGenerated={lightContextMenu.light.isAutoGenerated}
          color={lightContextMenu.light.color}
          onClose={closeLightContextMenu}
        />
      )}

      {/* Date marker context menu */}
      {dateMarkerContextMenu && (
        <DateMarkerContextMenu
          x={dateMarkerContextMenu.x}
          y={dateMarkerContextMenu.y}
          marker={dateMarkerContextMenu.marker}
          onClose={closeDateMarkerContextMenu}
          onDelete={handleDateMarkerDelete}
        />
      )}

      {/* Date marker modal */}
      {showDateMarkerModal && pendingDateMarker && (
        <DateMarkerModal
          onConfirm={handleDateMarkerConfirm}
          onCancel={handleDateMarkerCancel}
        />
      )}

      {/* Light fixture modal */}
      {showLightFixtureModal && pendingLight && (
        <LightFixtureModal
          onConfirm={handleLightFixtureConfirm}
          onCancel={handleLightFixtureCancel}
        />
      )}

      {/* Color picker dialog */}
      {colorPickerState && colorPickerState.visible && (
        <ColorPickerDialog
          currentColor={colorPickerState.currentColor}
          onColorChange={handleColorChange}
          onClose={closeColorPicker}
        />
      )}

      {/* Visual Editor */}
      {showVisualEditor && navigationMode === 'normal' && (
        <VisualEditor onSelectWallpaper={handleSelectWallpaper} />
      )}

      {/* Canvas Mode Overlay */}
      {navigationMode === 'canvas' && canvasModeState && (
        <CanvasMode onContextMenu={handleCanvasContextMenu} />
      )}

      {/* Decorating Mode UI (3D integrated with drawing tools) */}
      {navigationMode === 'decorating' && decoratingState && (
        <DecoratingMode3D onContextMenu={handleCanvasContextMenu} />
      )}

      {/* Canvas Context Menu */}
      {canvasContextMenu && canvasModeState && (
        <CanvasContextMenu
          x={canvasContextMenu.x}
          y={canvasContextMenu.y}
          selectedItem={canvasContextMenu.selectedItem}
          wall={canvasModeState.wall}
          sectionId={canvasModeState.sectionId}
          onClose={closeCanvasContextMenu}
          onAddImage={handleAddCanvasImage}
          onAddTextBox={handleAddCanvasTextBox}
          onAddDirectoryShortcut={handleAddDirectoryShortcut}
          onAddHyperlink={handleAddHyperlink}
          onAddAppShortcut={handleAddAppShortcut}
          onAddFileShortcut={handleAddFileShortcut}
          onChangeWallColor={handleChangeWallColor}
        />
      )}

      {/* Input Dialog */}
      {inputDialog && (
        <InputDialog
          title={inputDialog.title}
          label={inputDialog.label}
          defaultValue={inputDialog.defaultValue}
          onConfirm={inputDialog.onConfirm}
          onCancel={() => setInputDialog(null)}
        />
      )}
    </div>
  );
};

// Sign context menu for rename/delete
const SignContextMenu: React.FC<{
  x: number;
  y: number;
  sign: HighwaySign;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}> = ({ x, y, sign, onClose, onRename, onDelete }) => {
  const menuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - 150);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div className="context-menu-item" style={{ fontWeight: 'bold', pointerEvents: 'none', opacity: 0.7 }}>
        {sign.name}
      </div>
      <div className="context-menu-divider" />
      <div
        className="context-menu-item"
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        Rename
      </div>
      <div
        className="context-menu-item danger"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        Delete
      </div>
    </div>
  );
};

// Wall context menu for adding new objects or images
const WallSectionPopup: React.FC<{
  x: number;
  y: number;
  wall: WallSide;
  sectionId: string;
  onClose: () => void;
  onClearWall: () => void;
  onCopyWall: () => void;
  onPasteWall: () => void;
  canPaste: boolean;
  onCreateBranch?: () => void;
}> = ({ x, y, onClose, onClearWall, onCopyWall, onPasteWall, canPaste, onCreateBranch }) => {
  const menuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - 100);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div
        className="context-menu-item"
        onClick={() => {
          onCopyWall();
          onClose();
        }}
      >
        Copy Wall
      </div>
      {canPaste && (
        <div
          className="context-menu-item"
          onClick={() => {
            onPasteWall();
            onClose();
          }}
        >
          Paste Wall
        </div>
      )}
      {onCreateBranch && (
        <div
          className="context-menu-item"
          onClick={() => {
            onCreateBranch();
            onClose();
          }}
        >
          Create Branch
        </div>
      )}
      <div
        className="context-menu-item danger"
        onClick={() => {
          onClearWall();
          onClose();
        }}
      >
        Clear Wall
      </div>
    </div>
  );
};

const WallContextMenu: React.FC<{
  x: number;
  y: number;
  wall: WallSide;
  position: { x: number; y: number; z: number };
  onClose: () => void;
  onAddObject: (type: ObjectType) => void;
  onAddImage: () => void;
  onDecorate: () => void;
  onAddDateMarker: () => void;
  onAddLight?: () => void;
}> = ({ x, y, wall, position, onClose, onAddObject, onAddImage, onDecorate, onAddDateMarker, onAddLight }) => {
  const menuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const shapes: { type: ObjectType; icon: string; label: string }[] = [
    { type: 'cube', icon: '⬜', label: 'Cube' },
    { type: 'sphere', icon: '⚪', label: 'Sphere' },
    { type: 'cylinder', icon: '🔲', label: 'Cylinder' },
    { type: 'cone', icon: '🔺', label: 'Cone' },
    { type: 'torus', icon: '⭕', label: 'Torus' },
  ];

  const wallName = wall.charAt(0).toUpperCase() + wall.slice(1);
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 300);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div className="context-menu-item" style={{ fontWeight: 'bold', pointerEvents: 'none', opacity: 0.7 }}>
        {wallName} Wall
      </div>
      <div className="context-menu-divider" />
      <div
        className="context-menu-item"
        onClick={() => {
          onDecorate();
          onClose();
        }}
      >
        Decorate
      </div>
      <div className="context-menu-divider" />
      <div
        className="context-menu-item"
        onClick={() => {
          onAddImage();
        }}
      >
        Add Image
      </div>
      <div
        className="context-menu-item"
        onClick={() => {
          onAddDateMarker();
          onClose();
        }}
      >
        Add Date Marker
      </div>
      {wall === 'ceiling' && onAddLight && (
        <div
          className="context-menu-item"
          onClick={() => {
            onAddLight();
            onClose();
          }}
        >
          Add Light Fixture
        </div>
      )}
      <div className="context-menu-divider" />
      <div className="context-menu-item" style={{ fontWeight: 'bold', pointerEvents: 'none', opacity: 0.7, fontSize: '11px' }}>
        Add Project Shape
      </div>
      {shapes.map(({ type, icon, label }) => (
        <div
          key={type}
          className="context-menu-item"
          onClick={() => {
            onAddObject(type);
            onClose();
          }}
        >
          {icon} {label}
        </div>
      ))}
    </div>
  );
};

// Input dialog for simple text input
const InputDialog: React.FC<{
  title: string;
  label: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}> = ({ title, label, defaultValue = '', onConfirm, onCancel }) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  return (
    <div className="dialog-overlay">
      <form className="dialog-content" onSubmit={handleSubmit}>
        <div className="dialog-title">{title}</div>
        <label className="dialog-label">{label}</label>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="dialog-input"
        />
        <div className="dialog-buttons">
          <button type="button" className="dialog-btn cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="dialog-btn confirm">
            OK
          </button>
        </div>
      </form>
      <style>{`
        .dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
        }
        .dialog-content {
          background: rgba(26, 26, 46, 0.98);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 12px;
          padding: 24px;
          min-width: 320px;
        }
        .dialog-title {
          font-size: 18px;
          font-weight: bold;
          color: white;
          margin-bottom: 16px;
        }
        .dialog-label {
          display: block;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.8);
          margin-bottom: 8px;
        }
        .dialog-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.3);
          color: white;
          font-size: 14px;
          margin-bottom: 16px;
        }
        .dialog-input:focus {
          outline: none;
          border-color: #4ecdc4;
        }
        .dialog-buttons {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }
        .dialog-btn {
          padding: 8px 20px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          border: none;
        }
        .dialog-btn.cancel {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }
        .dialog-btn.confirm {
          background: #4ecdc4;
          color: #1a1a2e;
          font-weight: bold;
        }
        .dialog-btn:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
};

// Date marker context menu for delete
const DateMarkerContextMenu: React.FC<{
  x: number;
  y: number;
  marker: DateMarker;
  onClose: () => void;
  onDelete: () => void;
}> = ({ x, y, marker, onClose, onDelete }) => {
  const menuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - 150);

  // Format the date for display
  const displayDate = new Date(marker.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div className="context-menu-item" style={{ fontWeight: 'bold', pointerEvents: 'none', opacity: 0.7 }}>
        {displayDate}
      </div>
      <div className="context-menu-divider" />
      <div
        className="context-menu-item danger"
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        Delete
      </div>
    </div>
  );
};

// Color picker dialog
const ColorPickerDialog: React.FC<{
  currentColor: string;
  onColorChange: (color: string) => void;
  onClose: () => void;
}> = ({ currentColor, onColorChange, onClose }) => {
  const [color, setColor] = useState(currentColor);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const presetColors = [
    '#161b22', '#1a1a2e', '#0d1117', '#21262d',
    '#4ecdc4', '#ff6b6b', '#ffe66d', '#95e1d3',
    '#dda0dd', '#87ceeb', '#ff9f43', '#a29bfe',
    '#2d3436', '#636e72', '#b2bec3', '#dfe6e9',
  ];

  const handleConfirm = () => {
    onColorChange(color);
  };

  return (
    <div className="color-picker-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="color-picker-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="color-picker-header">
          <h3>Choose Wall Color</h3>
        </div>

        <div className="color-input-group">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="color-input-native"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="color-input-text"
            placeholder="#000000"
          />
        </div>

        <div className="color-presets">
          {presetColors.map((presetColor) => (
            <button
              key={presetColor}
              className={`color-preset ${color === presetColor ? 'selected' : ''}`}
              style={{ backgroundColor: presetColor }}
              onClick={() => setColor(presetColor)}
              title={presetColor}
            />
          ))}
        </div>

        <div className="color-preview">
          <span>Preview:</span>
          <div className="preview-swatch" style={{ backgroundColor: color }} />
        </div>

        <div className="color-picker-buttons">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-confirm" onClick={handleConfirm}>
            Apply
          </button>
        </div>

        <style>{`
          .color-picker-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
          }

          .color-picker-dialog {
            background: rgba(26, 26, 46, 0.98);
            border: 1px solid rgba(78, 205, 196, 0.3);
            border-radius: 12px;
            padding: 24px;
            min-width: 300px;
          }

          .color-picker-header h3 {
            margin: 0 0 20px 0;
            font-size: 18px;
            color: white;
          }

          .color-input-group {
            display: flex;
            gap: 12px;
            margin-bottom: 16px;
          }

          .color-input-native {
            width: 50px;
            height: 40px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            background: transparent;
          }

          .color-input-text {
            flex: 1;
            padding: 10px 12px;
            border: 1px solid rgba(78, 205, 196, 0.3);
            border-radius: 6px;
            background: rgba(0, 0, 0, 0.3);
            color: white;
            font-size: 14px;
            font-family: monospace;
          }

          .color-input-text:focus {
            outline: none;
            border-color: #4ecdc4;
          }

          .color-presets {
            display: grid;
            grid-template-columns: repeat(8, 1fr);
            gap: 8px;
            margin-bottom: 16px;
          }

          .color-preset {
            width: 28px;
            height: 28px;
            border: 2px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .color-preset:hover {
            transform: scale(1.1);
          }

          .color-preset.selected {
            border-color: #4ecdc4;
            box-shadow: 0 0 0 2px rgba(78, 205, 196, 0.3);
          }

          .color-preview {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
            color: rgba(255, 255, 255, 0.8);
            font-size: 14px;
          }

          .preview-swatch {
            width: 60px;
            height: 30px;
            border-radius: 4px;
            border: 1px solid rgba(255, 255, 255, 0.2);
          }

          .color-picker-buttons {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
          }

          .btn-cancel,
          .btn-confirm {
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
            border: none;
            transition: all 0.2s ease;
          }

          .btn-cancel {
            background: rgba(255, 255, 255, 0.1);
            color: white;
          }

          .btn-cancel:hover {
            background: rgba(255, 255, 255, 0.15);
          }

          .btn-confirm {
            background: #4ecdc4;
            color: #1a1a2e;
            font-weight: 600;
          }

          .btn-confirm:hover {
            background: #5fd3d3;
          }
        `}</style>
      </div>
    </div>
  );
};

export default App;
