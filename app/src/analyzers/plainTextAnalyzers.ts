import type { Outline } from './types'

function emptyOutline(): Outline {
  return {
    imports: [],
    importBindings: [],
    importSources: [],
    exports: [],
    exportSources: [],
    functions: [],
    hooks: [],
    classes: [],
    interfaces: [],
    types: [],
    enums: [],
    variables: [],
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

export function analyzeMarkdownText(content: string): Outline {
  const outline = emptyOutline()
  const headings: string[] = []
  const links: string[] = []
  const codeBlocks: string[] = []
  const lists: string[] = []

  const lines = content.split(/\r?\n/)
  let inCodeBlock = false
  lines.forEach((line) => {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      const info = line.trim().slice(3).trim()
      if (info) codeBlocks.push(info)
      else codeBlocks.push('code')
      return
    }
    if (inCodeBlock) return

    const headingMatch = line.match(/^#{1,6}\s+(.*)$/)
    if (headingMatch) headings.push(headingMatch[1].trim())

    if (/^[-*+]\s+/.test(line.trim())) lists.push('list')

    const linkMatches = Array.from(line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g))
    linkMatches.forEach((match) => {
      if (match[2]) links.push(match[2])
    })
  })

  outline.mdOverview = {
    headings: unique(headings),
    links: unique(links),
    codeBlocks: unique(codeBlocks),
    lists: unique(lists),
  }
  return outline
}

export function analyzeYamlText(content: string): Outline {
  const outline = emptyOutline()
  const keys: string[] = []
  const objectPaths: string[] = []
  const arrayPaths: string[] = []
  const scalarValues: string[] = []
  const maxValues = 20

  const stack: { indent: number; key: string }[] = []

  const lines = content.split(/\r?\n/)
  lines.forEach((rawLine) => {
    const line = rawLine.replace(/\t/g, '  ')
    if (!line.trim() || line.trim().startsWith('#')) return
    const indent = line.match(/^ */)?.[0].length ?? 0

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }

    const keyMatch = line.match(/^\s*([A-Za-z0-9_\-]+):\s*(.*)$/)
    if (keyMatch) {
      const key = keyMatch[1]
      const value = keyMatch[2] ?? ''
      const path = [...stack.map((entry) => entry.key), key]
      keys.push(path.join('.'))
      if (value === '' || value === null) {
        objectPaths.push(path.join('.'))
        stack.push({ indent, key })
      } else if (value.startsWith('[') || value.startsWith('-')) {
        arrayPaths.push(path.join('.'))
      } else if (scalarValues.length < maxValues) {
        scalarValues.push(value.replace(/^\"|\"$/g, ''))
      }
      return
    }

    const arrayMatch = line.match(/^\s*-\s*(.*)$/)
    if (arrayMatch && arrayMatch[1] && scalarValues.length < maxValues) {
      scalarValues.push(arrayMatch[1].trim())
    }
  })

  outline.ymlOverview = {
    keys: unique(keys),
    objectPaths: unique(objectPaths),
    arrayPaths: unique(arrayPaths),
    scalarValues: unique(scalarValues),
  }
  return outline
}
