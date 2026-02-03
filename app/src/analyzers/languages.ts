export type LanguageId =
  | 'javascript'
  | 'jsx'
  | 'typescript'
  | 'tsx'
  | 'python'
  | 'json'
  | 'yaml'
  | 'markdown'
  | 'go'
  | 'rust'
  | 'java'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'php'
  | 'ruby'

export type LanguageDefinition = {
  id: LanguageId
  label: string
  group: 'core' | 'optional'
  extensions: string[]
  wasmPath?: string
}

export const LANGUAGE_DEFINITIONS: LanguageDefinition[] = [
  {
    id: 'javascript',
    label: 'JavaScript',
    group: 'core',
    extensions: ['.js', '.mjs', '.cjs'],
    wasmPath: '/treesitter/tree-sitter-javascript.wasm',
  },
  {
    id: 'jsx',
    label: 'JSX',
    group: 'core',
    extensions: ['.jsx'],
    wasmPath: '/treesitter/tree-sitter-javascript.wasm',
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    group: 'core',
    extensions: ['.ts'],
    wasmPath: '/treesitter/tree-sitter-typescript.wasm',
  },
  {
    id: 'tsx',
    label: 'TSX',
    group: 'core',
    extensions: ['.tsx'],
    wasmPath: '/treesitter/tree-sitter-tsx.wasm',
  },
  {
    id: 'python',
    label: 'Python',
    group: 'core',
    extensions: ['.py'],
    wasmPath: '/treesitter/tree-sitter-python.wasm',
  },
  {
    id: 'json',
    label: 'JSON',
    group: 'core',
    extensions: ['.json'],
    wasmPath: '/treesitter/tree-sitter-json.wasm',
  },
  {
    id: 'yaml',
    label: 'YAML',
    group: 'core',
    extensions: ['.yml', '.yaml'],
    wasmPath: '/treesitter/tree-sitter-yaml.wasm',
  },
  {
    id: 'markdown',
    label: 'Markdown',
    group: 'optional',
    extensions: ['.md', '.markdown'],
    wasmPath: '/treesitter/tree-sitter-markdown.wasm',
  },
  {
    id: 'go',
    label: 'Go',
    group: 'optional',
    extensions: ['.go'],
    wasmPath: '/treesitter/tree-sitter-go.wasm',
  },
  {
    id: 'rust',
    label: 'Rust',
    group: 'optional',
    extensions: ['.rs'],
    wasmPath: '/treesitter/tree-sitter-rust.wasm',
  },
  {
    id: 'java',
    label: 'Java',
    group: 'optional',
    extensions: ['.java'],
    wasmPath: '/treesitter/tree-sitter-java.wasm',
  },
  {
    id: 'c',
    label: 'C',
    group: 'optional',
    extensions: ['.c', '.h'],
    wasmPath: '/treesitter/tree-sitter-c.wasm',
  },
  {
    id: 'cpp',
    label: 'C++',
    group: 'optional',
    extensions: ['.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx'],
    wasmPath: '/treesitter/tree-sitter-cpp.wasm',
  },
  {
    id: 'csharp',
    label: 'C#',
    group: 'optional',
    extensions: ['.cs'],
    wasmPath: '/treesitter/tree-sitter-c_sharp.wasm',
  },
  {
    id: 'php',
    label: 'PHP',
    group: 'optional',
    extensions: ['.php'],
    wasmPath: '/treesitter/tree-sitter-php.wasm',
  },
  {
    id: 'ruby',
    label: 'Ruby',
    group: 'optional',
    extensions: ['.rb'],
    wasmPath: '/treesitter/tree-sitter-ruby.wasm',
  },
]

const EXTENSION_TO_LANGUAGE = new Map<string, LanguageId>()
const LANGUAGE_BY_ID = new Map<LanguageId, LanguageDefinition>()

const SHEBANG_LANGUAGE_MAP: Record<string, LanguageId> = {
  python: 'python',
  python3: 'python',
  python2: 'python',
  node: 'javascript',
  nodejs: 'javascript',
  bun: 'javascript',
  deno: 'typescript',
  'ts-node': 'typescript',
  tsx: 'tsx',
  ruby: 'ruby',
  php: 'php',
}

LANGUAGE_DEFINITIONS.forEach((language) => {
  LANGUAGE_BY_ID.set(language.id, language)
  language.extensions.forEach((ext) => {
    EXTENSION_TO_LANGUAGE.set(ext, language.id)
  })
})

export function getLanguageForFile(filePath: string): LanguageId | null {
  const match = filePath.toLowerCase().match(/\.([a-z0-9]+)$/)
  if (!match) return null
  return EXTENSION_TO_LANGUAGE.get(`.${match[1]}`) ?? null
}

export function detectLanguageFromShebang(
  content: string
): LanguageId | null {
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim()
  if (!firstLine || !firstLine.startsWith('#!')) return null

  const shebang = firstLine.slice(2).trim()
  if (!shebang) return null

  const parts = shebang.split(/\s+/)
  let command = parts[0] ?? ''
  const envIndex = parts.findIndex((part) => part.endsWith('env'))
  if (envIndex >= 0 && parts[envIndex + 1]) {
    command = parts[envIndex + 1]
  }
  const normalized = command.split('/').pop()?.toLowerCase() ?? ''
  if (!normalized) return null
  return SHEBANG_LANGUAGE_MAP[normalized] ?? null
}

export function getLanguageForFileWithContent(
  filePath: string,
  content: string
): LanguageId | null {
  const byExtension = getLanguageForFile(filePath)
  if (byExtension) return byExtension
  return detectLanguageFromShebang(content)
}

export function getLanguageDefinition(id: LanguageId): LanguageDefinition | null {
  return LANGUAGE_BY_ID.get(id) ?? null
}

export const CORE_LANGUAGE_IDS = LANGUAGE_DEFINITIONS.filter(
  (language) => language.group === 'core'
).map((language) => language.id)

export const OPTIONAL_LANGUAGE_IDS = LANGUAGE_DEFINITIONS.filter(
  (language) => language.group === 'optional'
).map((language) => language.id)
