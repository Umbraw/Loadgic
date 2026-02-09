export type Overlay = {
  id: string
  target:
    | { type: 'symbol'; symbolId: string }
    | {
        type: 'range'
        filePath: string
        range: {
          startLine: number
          startCol: number
          endLine: number
          endCol: number
        }
      }
  raw: string
  markdown: string
  updatedAt: string
}
