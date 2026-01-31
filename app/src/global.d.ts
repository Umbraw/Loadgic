import type { ProjectNode } from './types/project'
import type { FileContent } from './types/file'

export {}

// Extend the global Window interface
declare global {
  interface Window {
    loadgic: {
      minimize: () => void
      close: () => void
      toggleFullscreen: () => void
      openProject: () => Promise<{ rootPath: string; tree: ProjectNode } | null>
      readProjectTree: () => Promise<ProjectNode | null>
      listDir: (dirPath: string) => Promise<ProjectNode[] | null>
      readFile: (filePath: string) => Promise<FileContent | null>
      getTsSymbolDetail: (
        filePath: string,
        symbol: string,
        line?: number,
        column?: number
      ) => Promise<
        | {
            symbol: string
            kind: string
            context: string
            line: number
            column: number
            occurrences: number
            lineText: string
            container: string | null
            modifiers: string[]
            isExported: boolean
            isDefaultExport: boolean
            isAsync: boolean
            isGenerator: boolean
            snippet: string
            tsDisplay?: string
            tsDocs?: string
            tsTags?: string[]
            tsDefinition?: {
              file: string
              start: { line: number; offset: number }
              end: { line: number; offset: number }
            } | null
            tsTypeDefinition?: {
              file: string
              start: { line: number; offset: number }
              end: { line: number; offset: number }
            } | null
            tsReferences?: number
            tsOccurrences?: number
            tsSignature?: string
            tsSignatureActiveParam?: number | null
            tsDiagnostics?: number
          }
        | null
      >
      openSettingsWindow: () => Promise<void>
      minimizeSettings: () => Promise<void>
      closeSettings: () => Promise<void>
      onMainMessage?: (handler: (message: string) => void) => () => void
    }
  }
}
