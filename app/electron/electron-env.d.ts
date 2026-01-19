/// <reference types="vite-plugin-electron/electron-env" />

import type { ProjectNode } from '../src/types/project'
import type { FileContent } from '../src/types/file'

export {}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      /**
       * The built directory structure
       *
       * ```tree
       * ├─┬─┬ dist
       * │ │ └── index.html
       * │ │
       * │ ├─┬ dist-electron
       * │ │ ├── main.js
       * │ │ └── preload.mjs
       * │
       * ```
       */
      APP_ROOT: string
      /** /dist/ or /public/ */
      VITE_PUBLIC: string
    }
  }

  // Used in Renderer process, expose in `preload.ts`
  interface Window {
    loadgic: {
      minimize: () => void
      close: () => void
    toggleFullscreen: () => void
    openProject: () => Promise<{ rootPath: string; tree: ProjectNode } | null>
    readProjectTree: () => Promise<ProjectNode | null>
    listDir: (dirPath: string) => Promise<ProjectNode[] | null>
      readFile: (filePath: string) => Promise<FileContent | null>
      openSettingsWindow: () => Promise<void>
      minimizeSettings: () => Promise<void>
      closeSettings: () => Promise<void>
      onMainMessage?: (handler: (message: string) => void) => () => void
    }
  }
}
