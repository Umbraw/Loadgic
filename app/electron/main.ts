import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import type { ProjectNode } from '@/types/project'
import type { FileContent } from '@/types/file'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
