import type { ProjectNode } from './types/project'

import type { ProjectNode } from './types/project'
import type { FileContent } from './types/file'

export {}

declare global {
  interface Window {
    loadgic: {
      minimize: () => void
      close: () => void
      toggleFullscreen: () => void
      openProject: () => Promise<{ rootPath: string; tree: ProjectNode } | null>
      readFile: (filePath: string) => Promise<FileContent | null>
      openSettingsWindow: () => Promise<void>
      minimizeSettings: () => Promise<void>
      closeSettings: () => Promise<void>
      onMainMessage?: (handler: (message: string) => void) => () => void
    }
  }
}
