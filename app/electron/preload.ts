import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('loadgic', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  openProject: () => ipcRenderer.invoke('dialog:open-project'),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  openSettingsWindow: () => ipcRenderer.invoke('window:open-settings'),
  minimizeSettings: () => ipcRenderer.invoke('settings:minimize'),
  closeSettings: () => ipcRenderer.invoke('settings:close'),
  onMainMessage: (handler: (message: string) => void) => {
    const listener = (_event: IpcRendererEvent, message: string) => {
      handler(message)
    }
    ipcRenderer.on('main-process-message', listener)
    return () => ipcRenderer.removeListener('main-process-message', listener)
  },
})
