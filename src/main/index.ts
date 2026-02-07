import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Store from 'electron-store';
import { SceneState } from '../shared/types';

const store = new Store<{ sceneState: SceneState }>();

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// --- Input validation helpers ---

/** Validate that a URL uses http or https protocol only */
const isAllowedUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

/** Validate a file path: must be absolute, no null bytes, no relative traversal tricks */
const isValidPath = (filePath: string): boolean => {
  if (!filePath || typeof filePath !== 'string') return false;
  if (filePath.includes('\0')) return false; // null byte injection
  const resolved = path.resolve(filePath);
  // Ensure the resolved path matches what was given (catches /../ traversal)
  // Normalize both to compare fairly across platforms
  return path.normalize(resolved) === path.normalize(filePath);
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Project Hallway',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Directory',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('open-directory', async (_, directoryPath: string) => {
  if (!isValidPath(directoryPath)) {
    throw new Error('Invalid directory path');
  }
  try {
    await shell.openPath(directoryPath);
  } catch (error) {
    console.error('Failed to open directory:', error);
    throw error;
  }
});

ipcMain.handle('select-model-file', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select 3D Model',
    filters: [
      { name: '3D Models', extensions: ['glb', 'gltf'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('select-image-file', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select Image',
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('save-state', async (_, state: SceneState) => {
  store.set('sceneState', state);
});

ipcMain.handle('load-state', async () => {
  return store.get('sceneState') || null;
});

ipcMain.handle('read-file', async (_, filePath: string) => {
  if (!isValidPath(filePath)) {
    throw new Error('Invalid file path');
  }
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch (error) {
    console.error('Failed to read file:', error);
    throw error;
  }
});

ipcMain.handle('select-file', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select File',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('select-app', async () => {
  if (!mainWindow) return null;

  const filters = process.platform === 'win32'
    ? [{ name: 'Executables', extensions: ['exe', 'lnk'] }]
    : process.platform === 'darwin'
    ? [{ name: 'Applications', extensions: ['app'] }]
    : [{ name: 'All Files', extensions: ['*'] }];

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select Application',
    filters,
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('open-url', async (_, url: string) => {
  if (!isAllowedUrl(url)) {
    throw new Error('Only http and https URLs are allowed');
  }
  try {
    await shell.openExternal(url);
  } catch (error) {
    console.error('Failed to open URL:', error);
    throw error;
  }
});

ipcMain.handle('open-path', async (_, filePath: string) => {
  if (!isValidPath(filePath)) {
    throw new Error('Invalid file path');
  }
  try {
    await shell.openPath(filePath);
  } catch (error) {
    console.error('Failed to open path:', error);
    throw error;
  }
});

ipcMain.handle('get-file-icon', async (_, filePath: string) => {
  if (!isValidPath(filePath)) {
    throw new Error('Invalid file path');
  }
  try {
    const icon = await app.getFileIcon(filePath);
    return icon.toDataURL();
  } catch (error) {
    console.error('Failed to get file icon:', error);
    throw error;
  }
});
