import type { ProjectNode } from './types/project'

export {}

declare global {
  interface Window {
    loadgic: {
      minimize: () => void
      close: () => void
      toggleFullscreen: () => void
      openProject: () => Promise<{ rootPath: string; tree: ProjectNode } | null>
      readFile: (filePath: string) => Promise<string | null>
      openSettingsWindow: () => Promise<void>
      minimizeSettings: () => Promise<void>
      closeSettings: () => Promise<void>
      onMainMessage?: (handler: (message: string) => void) => () => void
    }
  }
}
