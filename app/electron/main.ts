import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type * as tsType from 'typescript'
import type { ProjectNode } from '@/types/project'
import type { FileContent } from '@/types/file'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const ts = require('typescript') as typeof import('typescript')

// Disable Wayland color management protocol (wp_color_manager_v1) to prevent
// errors on compositors that don't fully implement it yet
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-features', 'WaylandWpColorManagerV1')
}
let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null

const IGNORED_DIRS = new Set(['.git', 'node_modules'])
let currentProjectRoot: string | null = null

type Overlay = {
  id: string
  target: { type: 'symbol'; symbolId: string }
  raw: string
  markdown: string
  updatedAt: string
}

type OverlayFile = {
  version: 1
  overlays: Overlay[]
}

function resolveOverlayFile(rootPath: string) {
  const resolvedRoot = path.resolve(rootPath)
  if (currentProjectRoot) {
    const projectRoot = path.resolve(currentProjectRoot)
    if (resolvedRoot !== projectRoot) {
      throw new Error('Overlay root path does not match current project.')
    }
  }
  const dirPath = path.join(resolvedRoot, '.loadgic')
  const filePath = path.join(dirPath, 'annotations.json')
  if (!filePath.startsWith(resolvedRoot + path.sep)) {
    throw new Error('Invalid overlay path.')
  }
  return { resolvedRoot, dirPath, filePath }
}

async function readOverlayFile(rootPath: string): Promise<OverlayFile> {
  const { filePath } = resolveOverlayFile(rootPath)
  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as OverlayFile
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.overlays)) {
      return { version: 1, overlays: [] }
    }
    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, overlays: [] }
    }
    throw error
  }
}

async function writeOverlayFile(rootPath: string, data: OverlayFile) {
  const { dirPath, filePath } = resolveOverlayFile(rootPath)
  await mkdir(dirPath, { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
}
const BINARY_EXTENSIONS = new Set([
  '.pdf',
  '.zip',
  '.rar',
  '.7z',
  '.mp4',
  '.mov',
  '.mp3',
  '.wav',
])
const MAX_VIEW_FILE_BYTES = 10 * 1024 * 1024

type TsQuickInfo = {
  displayString?: string
  documentation?: { text: string }[]
  tags?: { name: string; text?: string }[]
  kind?: string
  kindModifiers?: string
}

type TsLocation = {
  file: string
  start: { line: number; offset: number }
  end: { line: number; offset: number }
}

type TsSignatureHelp = {
  items?: { prefixDisplayParts?: { text: string }[]; parameters?: { displayParts?: { text: string }[] }[]; suffixDisplayParts?: { text: string }[] }[]
  selectedItemIndex?: number
  argumentIndex?: number
}

class TsServerClient {
  private proc: ChildProcessWithoutNullStreams
  private seq = 0
  private pending = new Map<number, (data: any) => void>()
  private buffer = Buffer.alloc(0)

  constructor(tsserverPath: string) {
    this.proc = spawn(process.execPath, [tsserverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.proc.stdout.on('data', (chunk) => this.handleData(chunk))
    this.proc.stderr.on('data', () => {
      // ignore noisy tsserver stderr
    })
  }

  private handleData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const header = this.buffer.slice(0, headerEnd).toString('utf-8')
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }
      const length = Number(match[1])
      const messageStart = headerEnd + 4
      const messageEnd = messageStart + length
      if (this.buffer.length < messageEnd) return
      const message = this.buffer.slice(messageStart, messageEnd).toString('utf-8')
      this.buffer = this.buffer.slice(messageEnd)
      const payload = JSON.parse(message)
      if (payload.type === 'response' && typeof payload.request_seq === 'number') {
        const resolver = this.pending.get(payload.request_seq)
        if (resolver) {
          this.pending.delete(payload.request_seq)
          resolver(payload)
        }
      }
    }
  }

  private send(command: string, args: Record<string, any>) {
    const seq = ++this.seq
    const request = JSON.stringify({
      seq,
      type: 'request',
      command,
      arguments: args,
    })
    const payload = `Content-Length: ${Buffer.byteLength(request, 'utf-8')}\r\n\r\n${request}`
    this.proc.stdin.write(payload)
    return new Promise<any>((resolve) => {
      this.pending.set(seq, resolve)
    })
  }

  private sendNotification(command: string, args: Record<string, any>) {
    const seq = ++this.seq
    const request = JSON.stringify({
      seq,
      type: 'request',
      command,
      arguments: args,
    })
    const payload = `Content-Length: ${Buffer.byteLength(request, 'utf-8')}\r\n\r\n${request}`
    this.proc.stdin.write(payload)
  }

  openFile(filePath: string, content: string) {
    this.sendNotification('open', {
      file: filePath,
      fileContent: content,
      scriptKindName: path.extname(filePath).slice(1),
    })
  }

  async quickInfo(filePath: string, line: number, offset: number) {
    const res = await this.send('quickinfo', { file: filePath, line, offset })
    return res.body as TsQuickInfo | undefined
  }

  async definition(filePath: string, line: number, offset: number) {
    const res = await this.send('definition', { file: filePath, line, offset })
    return (res.body ?? []) as TsLocation[]
  }

  async references(filePath: string, line: number, offset: number) {
    const res = await this.send('references', { file: filePath, line, offset })
    return (res.body?.refs ?? []) as TsLocation[]
  }

  async occurrences(filePath: string, line: number, offset: number) {
    const res = await this.send('occurrences', { file: filePath, line, offset })
    return (res.body ?? []) as TsLocation[]
  }

  async typeDefinition(filePath: string, line: number, offset: number) {
    const res = await this.send('typeDefinition', { file: filePath, line, offset })
    return (res.body ?? []) as TsLocation[]
  }

  async signatureHelp(filePath: string, line: number, offset: number) {
    const res = await this.send('signatureHelp', { file: filePath, line, offset })
    return (res.body ?? {}) as TsSignatureHelp
  }

  async semanticDiagnostics(filePath: string) {
    const res = await this.send('semanticDiagnosticsSync', { file: filePath })
    return (res.body ?? []) as { text: string; code: number; category: string }[]
  }
}

let tsServerClient: TsServerClient | null = null

type LspLocation = {
  uri: string
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
}

type LspHover = {
  contents?: { kind?: string; value?: string } | { value?: string } | string
}

type LspSignatureHelp = {
  signatures?: { label?: string; documentation?: { value?: string } | string }[]
  activeSignature?: number
  activeParameter?: number
}

type LspDocumentHighlight = {
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
}

type LspDocumentSymbol = {
  name: string
  kind: number
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  children?: LspDocumentSymbol[]
}

type LspSymbolInformation = {
  name: string
  kind: number
  location?: { range?: LspDocumentSymbol['range'] }
}

type PyHoverInfo = {
  signature: string
  documentation: string
}

function parsePyHover(text: string): PyHoverInfo {
  if (!text) return { signature: '', documentation: '' }
  const cleaned = text.replace(/^---\s*\n?/m, '').trim()
  if (!cleaned) return { signature: '', documentation: '' }
  const codeBlockMatch = cleaned.match(/```python\s*([\s\S]*?)```/i)
  if (codeBlockMatch) {
    const signature = codeBlockMatch[1].trim()
    const documentation = cleaned
      .replace(codeBlockMatch[0], '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return { signature, documentation }
  }
  const lines = cleaned
    .split('\n')
    .map((line) => line.replace(/&nbsp;/g, ' ').trim())
    .filter(Boolean)
  if (!lines.length) return { signature: '', documentation: '' }
  if (lines.length === 1) return { signature: lines[0], documentation: '' }
  return { signature: lines[0], documentation: lines.slice(1).join(' ') }
}

function parsePyDocParams(doc: string) {
  if (!doc) return { doc: '', params: [] as { name: string; description: string }[] }
  const match = doc.match(/Args:\s*([\s\S]*)/i)
  if (!match) return { doc, params: [] as { name: string; description: string }[] }
  const lines = match[1]
    .split('\n')
    .map((line) => line.replace(/&nbsp;/g, ' ').trim())
    .filter(Boolean)
  const params: { name: string; description: string }[] = []
  for (const line of lines) {
    const parts = line.split(':')
    if (parts.length >= 2) {
      const name = parts.shift()?.trim() ?? ''
      const description = parts.join(':').trim()
      if (name) params.push({ name, description })
    }
  }
  const cleaned = doc.split(/Args:\s*/i)[0]?.trim() ?? ''
  return { doc: cleaned, params }
}

function rangeContains(
  range: LspDocumentSymbol['range'],
  line: number,
  column: number
) {
  if (line < range.start.line) return false
  if (line > range.end.line) return false
  if (line === range.start.line && column < range.start.character) return false
  if (line === range.end.line && column > range.end.character) return false
  return true
}

function collectSymbolCandidates(
  symbols: LspDocumentSymbol[],
  path: string[] = []
): { symbol: LspDocumentSymbol; container: string[]; span: number }[] {
  const entries: { symbol: LspDocumentSymbol; container: string[]; span: number }[] =
    []
  for (const symbol of symbols) {
    const span =
      (symbol.range.end.line - symbol.range.start.line) * 10000 +
      (symbol.range.end.character - symbol.range.start.character)
    entries.push({ symbol, container: path, span })
    if (symbol.children?.length) {
      entries.push(...collectSymbolCandidates(symbol.children, [...path, symbol.name]))
    }
  }
  return entries
}

function findSymbolAtPosition(
  symbols: LspDocumentSymbol[],
  line: number,
  column: number
): { symbol: LspDocumentSymbol; container: string[] } | null {
  const candidates = collectSymbolCandidates(symbols).filter((entry) =>
    rangeContains(entry.symbol.range, line, column)
  )
  if (!candidates.length) return null
  candidates.sort((a, b) => a.span - b.span)
  return { symbol: candidates[0].symbol, container: candidates[0].container }
}

function normalizeDocumentSymbols(
  items: (LspDocumentSymbol | LspSymbolInformation)[] | null | undefined
): LspDocumentSymbol[] {
  if (!items) return []
  return items
    .map((item) => {
      const range =
        'range' in item && item.range
          ? item.range
          : item.location?.range
      if (!range) return null
      const children =
        'children' in item && Array.isArray(item.children)
          ? normalizeDocumentSymbols(item.children)
          : undefined
      return {
        name: item.name,
        kind: item.kind,
        range,
        children,
      }
    })
    .filter((item): item is LspDocumentSymbol => !!item)
}

class LspClient {
  private proc: ChildProcessWithoutNullStreams
  private seq = 0
  private pending = new Map<number, (data: any) => void>()
  private buffer = Buffer.alloc(0)
  private ready = false

  constructor(command: string, args: string[]) {
    this.proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc.stdout.on('data', (chunk) => this.handleData(chunk))
    this.proc.stderr.on('data', () => {
      // ignore noisy stderr
    })
  }

  private handleData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const header = this.buffer.slice(0, headerEnd).toString('utf-8')
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }
      const length = Number(match[1])
      const messageStart = headerEnd + 4
      const messageEnd = messageStart + length
      if (this.buffer.length < messageEnd) return
      const message = this.buffer.slice(messageStart, messageEnd).toString('utf-8')
      this.buffer = this.buffer.slice(messageEnd)
      const payload = JSON.parse(message)
      if (payload.id && this.pending.has(payload.id)) {
        const resolver = this.pending.get(payload.id)
        if (resolver) {
          this.pending.delete(payload.id)
          resolver(payload)
        }
      }
    }
  }

  private send(method: string, params: Record<string, any>) {
    const id = ++this.seq
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    })
    const payload = `Content-Length: ${Buffer.byteLength(request, 'utf-8')}\r\n\r\n${request}`
    this.proc.stdin.write(payload)
    return new Promise<any>((resolve) => {
      this.pending.set(id, resolve)
    })
  }

  private notify(method: string, params: Record<string, any>) {
    const request = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    })
    const payload = `Content-Length: ${Buffer.byteLength(request, 'utf-8')}\r\n\r\n${request}`
    this.proc.stdin.write(payload)
  }

  async initialize(rootPath: string) {
    if (this.ready) return
    const rootUri = pathToFileURL(rootPath).toString()
    await this.send('initialize', {
      processId: process.pid,
      clientInfo: { name: 'Loadgic', version: app.getVersion() },
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: path.basename(rootPath) }],
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: {},
          references: {},
          typeDefinition: {},
          signatureHelp: {},
          documentSymbol: {},
          documentHighlight: {},
        },
      },
      initializationOptions: {},
    })
    this.notify('initialized', {})
    this.ready = true
  }

  openFile(filePath: string, content: string, languageId: string) {
    const uri = pathToFileURL(filePath).toString()
    this.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    })
  }

  async hover(filePath: string, line: number, character: number) {
    const uri = pathToFileURL(filePath).toString()
    const res = await this.send('textDocument/hover', {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 },
    })
    return (res.result ?? null) as LspHover | null
  }

  async definition(filePath: string, line: number, character: number) {
    const uri = pathToFileURL(filePath).toString()
    const res = await this.send('textDocument/definition', {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 },
    })
    return (res.result ?? []) as LspLocation[]
  }

  async references(filePath: string, line: number, character: number) {
    const uri = pathToFileURL(filePath).toString()
    const res = await this.send('textDocument/references', {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 },
      context: { includeDeclaration: true },
    })
    return (res.result ?? []) as LspLocation[]
  }

  async signatureHelp(filePath: string, line: number, character: number) {
    const uri = pathToFileURL(filePath).toString()
    const res = await this.send('textDocument/signatureHelp', {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 },
    })
    return (res.result ?? null) as LspSignatureHelp | null
  }

  async typeDefinition(filePath: string, line: number, character: number) {
    const uri = pathToFileURL(filePath).toString()
    const res = await this.send('textDocument/typeDefinition', {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 },
    })
    return (res.result ?? []) as LspLocation[]
  }

  async documentHighlight(filePath: string, line: number, character: number) {
    const uri = pathToFileURL(filePath).toString()
    const res = await this.send('textDocument/documentHighlight', {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 },
    })
    return (res.result ?? []) as LspDocumentHighlight[]
  }

  async documentSymbol(filePath: string) {
    const uri = pathToFileURL(filePath).toString()
    const res = await this.send('textDocument/documentSymbol', {
      textDocument: { uri },
    })
    return (res.result ?? []) as LspDocumentSymbol[]
  }

  async diagnostics(filePath: string) {
    const uri = pathToFileURL(filePath).toString()
    const res = await this.send('textDocument/diagnostic', {
      textDocument: { uri },
    })
    return (res.result?.items ?? []) as { message: string }[]
  }
}

let pyLspClient: LspClient | null = null

function ensurePyLsp() {
  if (pyLspClient) return pyLspClient
  try {
    const pyrightPath = require.resolve('pyright/langserver.index.js')
    pyLspClient = new LspClient(process.execPath, [pyrightPath, '--stdio'])
    return pyLspClient
  } catch {
    return null
  }
}

function findFirstOccurrencePosition(content: string, symbol: string) {
  if (!symbol) return null
  const index = content.indexOf(symbol)
  if (index === -1) return null
  const before = content.slice(0, index)
  const lines = before.split(/\r\n|\r|\n/)
  const line = lines.length
  const column = lines[lines.length - 1].length + 1
  return { line, column }
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('tsserver-timeout'))
    }, ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

function ensureTsServer() {
  if (tsServerClient) return tsServerClient
  try {
    const tsserverPath = require.resolve('typescript/lib/tsserver.js')
    tsServerClient = new TsServerClient(tsserverPath)
    return tsServerClient
  } catch {
    return null
  }
}

function getScriptKind(ext: string) {
  switch (ext) {
    case '.ts':
      return ts.ScriptKind.TS
    case '.tsx':
      return ts.ScriptKind.TSX
    case '.jsx':
      return ts.ScriptKind.JSX
    case '.js':
      return ts.ScriptKind.JS
    default:
      return ts.ScriptKind.TS
  }
}

function classifyIdentifier(node: tsType.Identifier) {
  const parent = node.parent
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent)) return 'import'
  if (ts.isExportSpecifier(parent)) return 'export'
  if (ts.isFunctionDeclaration(parent)) return 'function'
  if (ts.isMethodDeclaration(parent)) return 'method'
  if (ts.isClassDeclaration(parent)) return 'class'
  if (ts.isInterfaceDeclaration(parent)) return 'interface'
  if (ts.isTypeAliasDeclaration(parent)) return 'type'
  if (ts.isEnumDeclaration(parent)) return 'enum'
  if (ts.isVariableDeclaration(parent)) return 'variable'
  if (ts.isParameter(parent)) return 'parameter'
  if (ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent)) {
    return 'property'
  }
  if (ts.isCallExpression(parent)) return 'call'
  return 'identifier'
}

function getModifierNames(node: tsType.Node) {
  if (!ts.canHaveModifiers(node)) return []
  const modifiers = ts.getModifiers(node)
  if (!modifiers || modifiers.length === 0) return []
  return modifiers.map((modifier) => ts.SyntaxKind[modifier.kind])
}

function getJsDoc(node: tsType.Node) {
  const text = ts
    .getJSDocCommentsAndTags(node)
    .flatMap((doc) => (ts.isJSDoc(doc) && doc.comment ? [String(doc.comment)] : []))
    .filter(Boolean)
    .join('\n')
  const tags = ts.getJSDocTags(node).map((doc) => {
    if (ts.isJSDocParameterTag(doc)) {
      const name = doc.name?.getText() ?? ''
      const comment = doc.comment ? String(doc.comment) : ''
      return `param${name ? ` ${name}` : ''}${comment ? `: ${comment}` : ''}`
    }
    if (ts.isJSDocReturnTag(doc)) {
      const comment = doc.comment ? String(doc.comment) : ''
      return `returns${comment ? `: ${comment}` : ''}`
    }
    const comment = doc.comment ? String(doc.comment) : ''
    return `${doc.tagName.text}${comment ? `: ${comment}` : ''}`
  })
  return { text, tags }
}

function isExportedNode(node: tsType.Node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : []
  return modifiers.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
}

function isDefaultExportNode(node: tsType.Node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : []
  return modifiers.some((mod) => mod.kind === ts.SyntaxKind.DefaultKeyword)
}

function isAsyncNode(node: tsType.Node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : []
  return modifiers.some((mod) => mod.kind === ts.SyntaxKind.AsyncKeyword)
}

function isGeneratorNode(node: tsType.Node) {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
    return !!node.asteriskToken
  }
  if (ts.isMethodDeclaration(node)) {
    return !!node.asteriskToken
  }
  return false
}

function getContainerName(node: tsType.Node) {
  let current: tsType.Node | undefined = node.parent
  while (current) {
    if (
      (ts.isClassDeclaration(current) ||
        ts.isFunctionDeclaration(current) ||
        ts.isInterfaceDeclaration(current) ||
        ts.isTypeAliasDeclaration(current) ||
        ts.isEnumDeclaration(current) ||
        ts.isModuleDeclaration(current)) &&
      current.name
    ) {
      return current.name.getText()
    }
    current = current.parent
  }
  return null
}

function getBestIdentifierMatch(sourceFile: tsType.SourceFile, symbol: string) {
  const matches: tsType.Identifier[] = []
  const visit = (node: tsType.Node) => {
    if (ts.isIdentifier(node) && node.text === symbol) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (!matches.length) return { matches, best: null as tsType.Identifier | null }

  const rank = (node: tsType.Identifier) => {
    const kind = classifyIdentifier(node)
    switch (kind) {
      case 'import':
        return 9
      case 'export':
        return 8
      case 'class':
      case 'interface':
      case 'type':
      case 'enum':
        return 7
      case 'function':
      case 'method':
        return 6
      case 'variable':
      case 'property':
        return 5
      default:
        return 1
    }
  }

  let best = matches[0]
  let bestRank = rank(best)
  for (const node of matches) {
    const nextRank = rank(node)
    if (nextRank > bestRank) {
      best = node
      bestRank = nextRank
    }
  }
  return { matches, best }
}

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

ipcMain.handle('window:toggle-fullscreen', () => {
  if (!mainWindow) return
  mainWindow.setFullScreen(!mainWindow.isFullScreen())
})

ipcMain.handle('window:open-settings', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.destroy()
    settingsWindow = null
  }
  const mainBounds = mainWindow?.getBounds()
  const defaultWidth = 720
  const defaultHeight = 520
  const width = Math.min(720, mainBounds ? Math.floor(mainBounds.width * 0.8) : 720)
  const height = Math.min(520, mainBounds ? Math.floor(mainBounds.height * 0.8) : 520)
  const x = mainBounds ? Math.round(mainBounds.x + (mainBounds.width - width) / 2) : undefined
  const y = mainBounds
    ? Math.round(mainBounds.y + (mainBounds.height - height) / 2)
    : undefined
  settingsWindow = new BrowserWindow({
    title: 'Loadgic Settings',
    width,
    height,
    minWidth: 520,
    minHeight: 420,
    resizable: true,
    backgroundColor: '#0f1115',
    show: false,
    frame: false,
    x,
    y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    settingsWindow.loadURL(`${devServerUrl}#/settings`)
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: '/settings',
    })
  }

  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
})

ipcMain.handle('settings:minimize', () => {
  settingsWindow?.minimize()
})

ipcMain.handle('settings:close', () => {
  settingsWindow?.close()
})

async function listProjectDir(dirPath: string): Promise<ProjectNode[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  const sortedEntries = entries
    .filter((entry) => !IGNORED_DIRS.has(entry.name))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })

  return sortedEntries.map((entry) => {
    const entryPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      return { name: entry.name, path: entryPath, type: 'dir' }
    }
    return { name: entry.name, path: entryPath, type: 'file' }
  })
}

// Recursively read a directory and build a project tree
async function readProjectTree(dirPath: string): Promise<ProjectNode> {
  async function walk(currentPath: string): Promise<ProjectNode[]> {
    let entries: Dirent[]
    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch {
      return []
    }

    const sortedEntries = entries
      .filter((entry) => !IGNORED_DIRS.has(entry.name))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      })

    const children: ProjectNode[] = await Promise.all(
      sortedEntries.map(async (entry) => {
        const entryPath = path.join(currentPath, entry.name)
        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: entryPath,
            type: 'dir',
            children: await walk(entryPath),
          }
        }
        return { name: entry.name, path: entryPath, type: 'file' }
      })
    )

    return children
  }

  return {
    name: path.basename(dirPath),
    path: dirPath,
    type: 'dir',
    children: await walk(dirPath),
  }
}

// Handle open directory selector
ipcMain.handle('dialog:open-project', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  const rootPath = result.filePaths[0]
  currentProjectRoot = rootPath
  const children = await listProjectDir(rootPath)
  return {
    rootPath,
    tree: {
      name: path.basename(rootPath),
      path: rootPath,
      type: 'dir',
      children,
    } as ProjectNode,
  }
})

ipcMain.handle('project:read-tree', async () => {
  if (!currentProjectRoot) return null
  return readProjectTree(currentProjectRoot)
})

ipcMain.handle('project:list-dir', async (_event, dirPath: string) => {
  if (!currentProjectRoot) return null
  const resolvedRoot = path.resolve(currentProjectRoot)
  const resolvedDir = path.resolve(dirPath)
  if (!resolvedDir.startsWith(resolvedRoot + path.sep)) {
    return null
  }
  return listProjectDir(resolvedDir)
})

ipcMain.handle(
  'file:read',
  async (_event, filePath: string): Promise<FileContent | null> => {
  if (!currentProjectRoot) return null
  const resolvedRoot = path.resolve(currentProjectRoot)
  const resolvedFile = path.resolve(filePath)
  if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
    return null
  }
  try {
    const ext = path.extname(resolvedFile).toLowerCase()
    const buffer = await readFile(resolvedFile)
    if (buffer.length > MAX_VIEW_FILE_BYTES) {
      return { kind: 'unsupported', reason: 'File too large to preview.' }
    }

    if (IMAGE_MIME_BY_EXT[ext]) {
      return {
        kind: 'image',
        mime: IMAGE_MIME_BY_EXT[ext],
        data: buffer.toString('base64'),
      }
    }

    if (BINARY_EXTENSIONS.has(ext) || buffer.includes(0)) {
      return { kind: 'unsupported', reason: 'Binary file format.' }
    }

    return { kind: 'text', content: buffer.toString('utf-8') }
  } catch {
    return { kind: 'unsupported', reason: 'Failed to read file.' }
  }
})

ipcMain.handle(
  'ts:detail',
  async (
    _event,
    filePath: string,
    symbol: string,
    line?: number,
    column?: number
  ) => {
  if (!currentProjectRoot) return null
  const resolvedRoot = path.resolve(currentProjectRoot)
  const resolvedFile = path.resolve(filePath)
  if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
    return null
  }
  if (!symbol || typeof symbol !== 'string') return null

  try {
    const ext = path.extname(resolvedFile).toLowerCase()
    const content = await readFile(resolvedFile, 'utf-8')
    const sourceFile = ts.createSourceFile(
      resolvedFile,
      content,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(ext)
    )
    const { matches, best: fallbackBest } = getBestIdentifierMatch(sourceFile, symbol)
    let best: tsType.Identifier | null = null
    if (
      typeof line === 'number' &&
      typeof column === 'number' &&
      line > 0 &&
      column > 0
    ) {
      const pos = sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1)
      const tokenAt = (
        ts as unknown as {
          getTokenAtPosition?: (sf: tsType.SourceFile, p: number) => tsType.Node
        }
      ).getTokenAtPosition
      const token = tokenAt ? tokenAt(sourceFile, pos) : null
      if (token) {
        if (ts.isIdentifier(token)) {
          best = token
        } else if (ts.isPropertyAccessExpression(token)) {
          if (ts.isIdentifier(token.name)) {
            best = token.name
          }
        } else if (ts.isQualifiedName(token)) {
          best = token.right
        }
      }
    }
    if (!best) {
      best = fallbackBest
    }
    if (!best) return null

    const start = best.getStart(sourceFile)
    const { line: bestLine, character } =
      sourceFile.getLineAndCharacterOfPosition(start)
    const lineStarts = sourceFile.getLineStarts()
    const lineStart = lineStarts[bestLine] ?? 0
    const lineEnd =
      bestLine + 1 < lineStarts.length
        ? lineStarts[bestLine + 1]
        : content.length
    const lineText = content.slice(lineStart, lineEnd).trim()
    const resolvedSymbol = best.text
    const context = classifyIdentifier(best)
    const container = getContainerName(best)
    const modifiers = getModifierNames(best.parent)
    const isExported = isExportedNode(best.parent)
    const isDefaultExport = isDefaultExportNode(best.parent)
    const isAsync = isAsyncNode(best.parent)
    const isGenerator = isGeneratorNode(best.parent)
    const nodeText = best.parent.getText(sourceFile)
    const snippet = nodeText
    const jsdoc = getJsDoc(best.parent)

    const lineNumber = bestLine + 1
    const offset = character + 1

    const tsServer = ensureTsServer()
    if (tsServer) {
      tsServer.openFile(resolvedFile, content)
      let quick: TsQuickInfo | undefined
      let defs: TsLocation[] = []
      let refs: TsLocation[] = []
      let occs: TsLocation[] = []
      let typeDefs: TsLocation[] = []
      let sig: TsSignatureHelp | undefined
      let diags: { text: string; code: number; category: string }[] = []
      try {
        ;[quick, defs, refs, occs, typeDefs, sig, diags] = await withTimeout(
          Promise.all([
            tsServer.quickInfo(resolvedFile, lineNumber, offset),
            tsServer.definition(resolvedFile, lineNumber, offset),
            tsServer.references(resolvedFile, lineNumber, offset),
            tsServer.occurrences(resolvedFile, lineNumber, offset),
            tsServer.typeDefinition(resolvedFile, lineNumber, offset),
            tsServer.signatureHelp(resolvedFile, lineNumber, offset),
            tsServer.semanticDiagnostics(resolvedFile),
          ]),
          1200
        )
      } catch {
        // fall back to AST-only details
      }
      return {
        symbol: resolvedSymbol,
        kind: quick?.kind ?? ts.SyntaxKind[best.kind],
        context: quick?.kind ?? context,
        line: lineNumber,
        column: offset,
        occurrences: refs.length || matches.length,
        lineText,
        container,
        modifiers:
          quick?.kindModifiers?.split(',').filter(Boolean) ?? modifiers,
        isExported:
          quick?.kindModifiers?.includes('export') ?? isExported,
        isDefaultExport:
          quick?.kindModifiers?.includes('default') ?? isDefaultExport,
        isAsync: quick?.kindModifiers?.includes('async') ?? isAsync,
        isGenerator,
        snippet,
        tsDisplay: quick?.displayString ?? '',
        tsDocs:
          quick?.documentation?.map((doc) => doc.text).join('\n') ??
          jsdoc.text ??
          '',
        tsTags:
          quick?.tags?.length
            ? quick.tags.map((tag) => `${tag.name}${tag.text ? `: ${tag.text}` : ''}`)
            : jsdoc.tags ?? [],
        tsDefinition: defs[0] ?? null,
        tsTypeDefinition: typeDefs[0] ?? null,
        tsReferences: refs.length,
        tsOccurrences: occs.length,
        tsSignature: sig?.items?.length
          ? `${sig.items[0]?.prefixDisplayParts?.map((part) => part.text).join('') ?? ''}${
              sig.items[0]?.parameters
                ?.map((param) =>
                  param.displayParts?.map((part) => part.text).join('')
                )
                .join(', ') ?? ''
            }${sig.items[0]?.suffixDisplayParts?.map((part) => part.text).join('') ?? ''}`
          : '',
        tsSignatureActiveParam: sig?.argumentIndex ?? null,
        tsDiagnostics: diags.length,
      }
    }

    return {
      symbol: resolvedSymbol,
      kind: ts.SyntaxKind[best.kind],
      context,
      line: lineNumber,
      column: offset,
      occurrences: matches.length,
      lineText,
      container,
      modifiers,
      isExported,
      isDefaultExport,
      isAsync,
      isGenerator,
      snippet,
    }
  } catch {
    return null
  }
})

ipcMain.handle(
  'py:detail',
  async (
    _event,
    filePath: string,
    symbol: string,
    line?: number,
    column?: number
  ) => {
    const resolvedFile = path.resolve(filePath)
    const resolvedRoot = currentProjectRoot
      ? path.resolve(currentProjectRoot)
      : path.dirname(resolvedFile)
    if (
      currentProjectRoot &&
      !resolvedFile.startsWith(resolvedRoot + path.sep)
    ) {
      return null
    }
    if (!symbol || typeof symbol !== 'string') return null

    try {
      const content = await readFile(resolvedFile, 'utf-8')
      let position: { line: number; column: number } | null = null
      if (typeof line === 'number' && typeof column === 'number') {
        position = { line, column }
      }
      if (!position) {
        const fallback = findFirstOccurrencePosition(content, symbol)
        if (!fallback) return null
        position = fallback
      }

      const lsp = ensurePyLsp()
      if (!lsp) {
        return {
          symbol,
          line: position.line,
          column: position.column,
          hover: '',
          documentation: '',
          symbolKind: null,
          symbolName: null,
          containerPath: [],
          signature: '',
          signatureActiveParam: null,
          definitions: [],
          typeDefinitions: [],
          highlights: 0,
          symbolCounts: {},
          references: 0,
          diagnostics: 0,
          error: 'pyright-unavailable',
          errorMessage: 'Pyright LSP not available.',
        }
      }
      await lsp.initialize(resolvedRoot)
      lsp.openFile(resolvedFile, content, 'python')

      let hover: LspHover | null = null
      let defs: LspLocation[] = []
      let refs: LspLocation[] = []
      let typeDefs: LspLocation[] = []
      let highlights: LspDocumentHighlight[] = []
      let symbols: LspDocumentSymbol[] = []
      let sig: LspSignatureHelp | null = null
      let diags: { message: string }[] = []
      try {
        ;[hover, defs, refs, typeDefs, highlights, symbols, sig, diags] =
          await withTimeout(
            Promise.all([
              lsp.hover(resolvedFile, position.line, position.column),
              lsp.definition(resolvedFile, position.line, position.column),
              lsp.references(resolvedFile, position.line, position.column),
              lsp.typeDefinition(resolvedFile, position.line, position.column),
              lsp.documentHighlight(resolvedFile, position.line, position.column),
              lsp.documentSymbol(resolvedFile),
              lsp.signatureHelp(resolvedFile, position.line, position.column),
              lsp.diagnostics(resolvedFile),
            ]),
            4000
          )
      } catch (error) {
        return {
          symbol,
          line: position.line,
          column: position.column,
          hover: '',
          documentation: '',
          symbolKind: null,
          symbolName: null,
          containerPath: [],
          signature: '',
          signatureActiveParam: null,
          definitions: [],
          typeDefinitions: [],
          highlights: 0,
          symbolCounts: {},
          references: 0,
          diagnostics: 0,
          error: 'pyright-timeout',
          errorMessage:
            error instanceof Error ? error.message : 'Pyright request failed.',
        }
      }

      const hoverText =
        typeof hover?.contents === 'string'
          ? hover?.contents
          : 'value' in (hover?.contents ?? {})
          ? (hover?.contents as { value?: string }).value ?? ''
          : (hover?.contents as { kind?: string; value?: string } | undefined)
              ?.value ?? ''

      const hoverParsed = parsePyHover(hoverText)
      const signature =
        sig?.signatures?.[sig.activeSignature ?? 0]?.label ??
        hoverParsed.signature

      const normalizedSymbols = normalizeDocumentSymbols(symbols as any)

      const symbolCounts: Record<string, number> = {}
      const flattenSymbols = (items: LspDocumentSymbol[]) => {
        for (const item of items) {
          const key = String(item.kind)
          symbolCounts[key] = (symbolCounts[key] ?? 0) + 1
          if (item.children?.length) flattenSymbols(item.children)
        }
      }
      flattenSymbols(normalizedSymbols)
      const symbolAtPosition = findSymbolAtPosition(
        normalizedSymbols,
        position.line,
        position.column
      )

      const parsedDoc = parsePyDocParams(hoverParsed.documentation)

      return {
        symbol,
        line: position.line,
        column: position.column,
        hover: hoverText,
        documentation: parsedDoc.doc,
        docParams: parsedDoc.params,
        symbolKind: symbolAtPosition?.symbol.kind ?? null,
        symbolName: symbolAtPosition?.symbol.name ?? null,
        containerPath: symbolAtPosition?.container ?? [],
        signature,
        signatureActiveParam: sig?.activeParameter ?? null,
        definitions: defs,
        typeDefinitions: typeDefs,
        highlights: highlights.length,
        symbolCounts,
        references: refs.length,
        diagnostics: diags.length,
      }
    } catch (error) {
      return {
        symbol,
        line: line ?? 1,
        column: column ?? 1,
        hover: '',
        documentation: '',
        symbolKind: null,
        symbolName: null,
        containerPath: [],
        signature: '',
        signatureActiveParam: null,
        definitions: [],
        typeDefinitions: [],
        highlights: 0,
        symbolCounts: {},
        references: 0,
        diagnostics: 0,
        error: 'pyright-error',
        errorMessage:
          error instanceof Error ? error.message : 'Pyright detail failed.',
      }
    }
  }
)

ipcMain.handle('overlays:list', async (_event, rootPath: string, symbolId?: string) => {
  if (!rootPath || typeof rootPath !== 'string') return []
  const data = await readOverlayFile(rootPath)
  if (symbolId) {
    return data.overlays.filter(
      (overlay) =>
        overlay.target.type === 'symbol' &&
        overlay.target.symbolId === symbolId
    )
  }
  return data.overlays
})

ipcMain.handle(
  'overlays:upsert',
  async (_event, rootPath: string, overlay: Overlay) => {
    if (!rootPath || typeof rootPath !== 'string') {
      throw new Error('Invalid root path.')
    }
    if (!overlay || overlay.target?.type !== 'symbol') {
      throw new Error('Invalid overlay payload.')
    }
    const data = await readOverlayFile(rootPath)
    const updated: Overlay = {
      ...overlay,
      updatedAt: new Date().toISOString(),
    }
    const index = data.overlays.findIndex((item) => item.id === overlay.id)
    if (index >= 0) {
      data.overlays[index] = updated
    } else {
      data.overlays.push(updated)
    }
    await writeOverlayFile(rootPath, data)
    return updated
  }
)

ipcMain.handle(
  'overlays:delete',
  async (_event, rootPath: string, overlayId: string) => {
    if (!rootPath || typeof rootPath !== 'string') return
    if (!overlayId) return
    const data = await readOverlayFile(rootPath)
    data.overlays = data.overlays.filter((overlay) => overlay.id !== overlayId)
    await writeOverlayFile(rootPath, data)
  }
)

function createWindow() {
  const iconPath = process.env.VITE_DEV_SERVER_URL
    ? path.join(__dirname, '../public/app-icon.png')
    : path.join(__dirname, '../dist/app-icon.png')
  mainWindow = new BrowserWindow({
    title: 'Loadgic',
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    maximizable: false,
    fullscreenable: true,
    backgroundColor: '#0f1115',
    show: false,
    frame: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (devServerUrl) {
    // DEVELOPPEMENT MODE
    mainWindow.loadURL(devServerUrl)
  } else {
    // PRODUCTION MODE
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Fallback (usefull for wayland)
  const fallback = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  }, 1500)
  mainWindow.on('show', () => clearTimeout(fallback))
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    mainWindow = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
