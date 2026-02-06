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
      getPySymbolDetail: (
        filePath: string,
        symbol: string,
        line?: number,
        column?: number
      ) => Promise<
        | {
            symbol: string
            line: number
            column: number
            hover: string
            documentation: string
            docParams?: { name: string; description: string }[]
            symbolKind: number | null
            symbolName: string | null
            containerPath: string[]
            signature: string
            signatureActiveParam: number | null
            definitions: {
              uri: string
              range: {
                start: { line: number; character: number }
                end: { line: number; character: number }
              }
            }[]
            typeDefinitions: {
              uri: string
              range: {
                start: { line: number; character: number }
                end: { line: number; character: number }
              }
            }[]
            highlights: number
            symbolCounts: Record<string, number>
            references: number
            diagnostics: number
            error?: string
            errorMessage?: string
          }
        | null
      >
      overlaysList: (
        rootPath: string,
        symbolId?: string
      ) => Promise<
        { id: string; target: { type: 'symbol'; symbolId: string }; raw: string; markdown: string; updatedAt: string }[]
      >
      overlaysUpsert: (
        rootPath: string,
        overlay: {
          id: string
          target: { type: 'symbol'; symbolId: string }
          raw: string
          markdown: string
          updatedAt: string
        }
      ) => Promise<{
        id: string
        target: { type: 'symbol'; symbolId: string }
        raw: string
        markdown: string
        updatedAt: string
      }>
      overlaysDelete: (rootPath: string, overlayId: string) => Promise<void>
      openSettingsWindow: () => Promise<void>
      minimizeSettings: () => Promise<void>
      closeSettings: () => Promise<void>
      onMainMessage?: (handler: (message: string) => void) => () => void
    }
  }
}
