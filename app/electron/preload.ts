import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('loadgic', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  openProject: () => ipcRenderer.invoke('dialog:open-project'),
  readProjectTree: () => ipcRenderer.invoke('project:read-tree'),
  listDir: (dirPath: string) => ipcRenderer.invoke('project:list-dir', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  openSettingsWindow: () => ipcRenderer.invoke('window:open-settings'),
  minimizeSettings: () => ipcRenderer.invoke('settings:minimize'),
  closeSettings: () => ipcRenderer.invoke('settings:close'),
  getTsSymbolDetail: (
    filePath: string,
    symbol: string,
    line?: number,
    column?: number
  ) => ipcRenderer.invoke('ts:detail', filePath, symbol, line, column),
  onMainMessage: (handler: (message: string) => void) => {
    const listener = (_event: IpcRendererEvent, message: string) => {
      handler(message)
    }
    ipcRenderer.on('main-process-message', listener)
    return () => ipcRenderer.removeListener('main-process-message', listener)
  },
})
