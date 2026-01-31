import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
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

  async semanticDiagnostics(filePath: string) {
    const res = await this.send('semanticDiagnosticsSync', { file: filePath })
    return (res.body ?? []) as { text: string; code: number; category: string }[]
  }
}

let tsServerClient: TsServerClient | null = null

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

function classifyIdentifier(node: ts.Identifier) {
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

function getModifierNames(node: ts.Node) {
  const modifiers = ts.getModifiers(node)
  if (!modifiers || modifiers.length === 0) return []
  return modifiers.map((modifier) => ts.SyntaxKind[modifier.kind])
}

function isExportedNode(node: ts.Node) {
  const modifiers = ts.getModifiers(node) ?? []
  return modifiers.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
}

function isDefaultExportNode(node: ts.Node) {
  const modifiers = ts.getModifiers(node) ?? []
  return modifiers.some((mod) => mod.kind === ts.SyntaxKind.DefaultKeyword)
}

function isAsyncNode(node: ts.Node) {
  const modifiers = ts.getModifiers(node) ?? []
  return modifiers.some((mod) => mod.kind === ts.SyntaxKind.AsyncKeyword)
}

function isGeneratorNode(node: ts.Node) {
  return (
    (ts.isFunctionLike(node) && !!node.asteriskToken) ||
    (ts.isMethodDeclaration(node) && !!node.asteriskToken)
  )
}

function getContainerName(node: ts.Node) {
  let current: ts.Node | undefined = node.parent
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

function getBestIdentifierMatch(sourceFile: ts.SourceFile, symbol: string) {
  const matches: ts.Identifier[] = []
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === symbol) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (!matches.length) return { matches, best: null as ts.Identifier | null }

  const rank = (node: ts.Identifier) => {
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
    let best: ts.Identifier | null = null
    if (
      typeof line === 'number' &&
      typeof column === 'number' &&
      line > 0 &&
      column > 0
    ) {
      const pos = sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1)
      const token = ts.getTokenAtPosition(sourceFile, pos)
      if (ts.isIdentifier(token)) {
        best = token
      } else if (ts.isPropertyAccessExpression(token)) {
        best = token.name
      } else if (ts.isQualifiedName(token)) {
        best = token.right
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
    const snippet = nodeText.length > 180 ? `${nodeText.slice(0, 180)}…` : nodeText

    const lineNumber = bestLine + 1
    const offset = character + 1

    const tsServer = ensureTsServer()
    if (tsServer) {
      tsServer.openFile(resolvedFile, content)
      let quick: TsQuickInfo | undefined
      let defs: TsLocation[] = []
      let refs: TsLocation[] = []
      let diags: { text: string; code: number; category: string }[] = []
      try {
        ;[quick, defs, refs, diags] = await withTimeout(
          Promise.all([
            tsServer.quickInfo(resolvedFile, lineNumber, offset),
            tsServer.definition(resolvedFile, lineNumber, offset),
            tsServer.references(resolvedFile, lineNumber, offset),
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
        tsDocs: quick?.documentation?.map((doc) => doc.text).join('\n') ?? '',
        tsTags:
          quick?.tags?.map((tag) => `${tag.name}${tag.text ? `: ${tag.text}` : ''}`) ??
          [],
        tsDefinition: defs[0] ?? null,
        tsReferences: refs.length,
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
