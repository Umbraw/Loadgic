import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(__dirname, '..')
const publicDir = path.join(appRoot, 'public', 'treesitter')

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function copyFileIfExists(sourcePath, destPath) {
  if (!fs.existsSync(sourcePath)) {
    return false
  }
  fs.copyFileSync(sourcePath, destPath)
  return true
}

function copyTreeSitterRuntime() {
  const runtimePath = path.join(appRoot, 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm')
  const destPath = path.join(publicDir, 'tree-sitter.wasm')
  const ok = copyFileIfExists(runtimePath, destPath)
  if (!ok) {
    console.warn('[treesitter] Missing runtime wasm:', runtimePath)
  }
  return ok
}

function copyLanguageWasms() {
  const wasmSourceDir = path.join(appRoot, 'node_modules', 'tree-sitter-wasms', 'out')
  if (!fs.existsSync(wasmSourceDir)) {
    console.warn('[treesitter] Missing wasm pack:', wasmSourceDir)
    return 0
  }
  const files = fs.readdirSync(wasmSourceDir)
  let copied = 0
  files.forEach((file) => {
    if (!file.endsWith('.wasm')) return
    const sourcePath = path.join(wasmSourceDir, file)
    const destPath = path.join(publicDir, file)
    fs.copyFileSync(sourcePath, destPath)
    copied += 1
  })
  return copied
}

ensureDir(publicDir)
copyTreeSitterRuntime()
const copiedCount = copyLanguageWasms()
console.log(`[treesitter] wasm ready (${copiedCount} language files).`)
