import { app, ipcMain, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, readdir } from "node:fs/promises";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
if (process.platform === "linux") {
  app.commandLine.appendSwitch("disable-features", "WaylandWpColorManagerV1");
}
let mainWindow = null;
let settingsWindow = null;
const IGNORED_DIRS = /* @__PURE__ */ new Set([".git", "node_modules"]);
let currentProjectRoot = null;
const IMAGE_MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml"
};
const BINARY_EXTENSIONS = /* @__PURE__ */ new Set([
  ".pdf",
  ".zip",
  ".rar",
  ".7z",
  ".mp4",
  ".mov",
  ".mp3",
  ".wav"
]);
const MAX_VIEW_FILE_BYTES = 10 * 1024 * 1024;
ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});
ipcMain.handle("window:close", () => {
  mainWindow?.close();
});
ipcMain.handle("window:toggle-fullscreen", () => {
  if (!mainWindow) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});
ipcMain.handle("window:open-settings", () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.destroy();
    settingsWindow = null;
  }
  const mainBounds = mainWindow?.getBounds();
  const width = Math.min(720, mainBounds ? Math.floor(mainBounds.width * 0.8) : 720);
  const height = Math.min(520, mainBounds ? Math.floor(mainBounds.height * 0.8) : 520);
  const x = mainBounds ? Math.round(mainBounds.x + (mainBounds.width - width) / 2) : void 0;
  const y = mainBounds ? Math.round(mainBounds.y + (mainBounds.height - height) / 2) : void 0;
  settingsWindow = new BrowserWindow({
    title: "Loadgic Settings",
    width,
    height,
    minWidth: 520,
    minHeight: 420,
    resizable: true,
    backgroundColor: "#0f1115",
    show: false,
    frame: false,
    x,
    y,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    settingsWindow.loadURL(`${devServerUrl}#/settings`);
  } else {
    settingsWindow.loadFile(path.join(__dirname$1, "../dist/index.html"), {
      hash: "/settings"
    });
  }
  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
  });
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
});
ipcMain.handle("settings:minimize", () => {
  settingsWindow?.minimize();
});
ipcMain.handle("settings:close", () => {
  settingsWindow?.close();
});
async function readProjectTree(dirPath) {
  async function walk(currentPath) {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return [];
    }
    const sortedEntries = entries.filter((entry) => !IGNORED_DIRS.has(entry.name)).sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }
      return a.name.localeCompare(b.name, void 0, { sensitivity: "base" });
    });
    const children = await Promise.all(
      sortedEntries.map(async (entry) => {
        const entryPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: entryPath,
            type: "dir",
            children: await walk(entryPath)
          };
        }
        return { name: entry.name, path: entryPath, type: "file" };
      })
    );
    return children;
  }
  return {
    name: path.basename(dirPath),
    path: dirPath,
    type: "dir",
    children: await walk(dirPath)
  };
}
ipcMain.handle("dialog:open-project", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const rootPath = result.filePaths[0];
  currentProjectRoot = rootPath;
  const tree = await readProjectTree(rootPath);
  return { rootPath, tree };
});
ipcMain.handle(
  "file:read",
  async (_event, filePath) => {
    if (!currentProjectRoot) return null;
    const resolvedRoot = path.resolve(currentProjectRoot);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
      return null;
    }
    try {
      const ext = path.extname(resolvedFile).toLowerCase();
      const buffer = await readFile(resolvedFile);
      if (buffer.length > MAX_VIEW_FILE_BYTES) {
        return { kind: "unsupported", reason: "File too large to preview." };
      }
      if (IMAGE_MIME_BY_EXT[ext]) {
        return {
          kind: "image",
          mime: IMAGE_MIME_BY_EXT[ext],
          data: buffer.toString("base64")
        };
      }
      if (BINARY_EXTENSIONS.has(ext) || buffer.includes(0)) {
        return { kind: "unsupported", reason: "Binary file format." };
      }
      return { kind: "text", content: buffer.toString("utf-8") };
    } catch {
      return { kind: "unsupported", reason: "Failed to read file." };
    }
  }
);
function createWindow() {
  const iconPath = process.env.VITE_DEV_SERVER_URL ? path.join(__dirname$1, "../public/app-icon.png") : path.join(__dirname$1, "../dist/app-icon.png");
  mainWindow = new BrowserWindow({
    title: "Loadgic",
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    maximizable: false,
    fullscreenable: true,
    backgroundColor: "#0f1115",
    show: false,
    frame: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../dist/index.html"));
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  const fallback = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 1500);
  mainWindow.on("show", () => clearTimeout(fallback));
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    mainWindow = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
