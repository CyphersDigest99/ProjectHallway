import { contextBridge, ipcRenderer } from 'electron';
import { SceneState } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openDirectory: (path: string) => ipcRenderer.invoke('open-directory', path),
  selectModelFile: () => ipcRenderer.invoke('select-model-file'),
  selectImageFile: () => ipcRenderer.invoke('select-image-file'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectApp: () => ipcRenderer.invoke('select-app'),
  saveState: (state: SceneState) => ipcRenderer.invoke('save-state', state),
  loadState: () => ipcRenderer.invoke('load-state'),
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  openPath: (path: string) => ipcRenderer.invoke('open-path', path),
  getFileIcon: (path: string) => ipcRenderer.invoke('get-file-icon', path),
});
