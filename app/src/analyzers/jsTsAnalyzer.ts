import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import type { File } from '@babel/types'
import type { Outline } from './types'

function unique(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

function getPluginsForPath(filePath: string) {
  const lower = filePath.toLowerCase()
  const plugins: Parameters<typeof parse>[1]['plugins'] = [
    'classProperties',
    'classPrivateProperties',
    'classPrivateMethods',
    'decorators-legacy',
    'dynamicImport',
    'importMeta',
  ]
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    plugins.push('typescript')
  }
  if (lower.endsWith('.jsx') || lower.endsWith('.tsx')) {
    plugins.push('jsx')
  }
  return plugins
}

export function analyzeJsTs(content: string, filePath: string): Outline {
  const imports: string[] = []
  const exports: string[] = []
  const functions: string[] = []
  const hooks: string[] = []
  const classes: { name: string; methods: string[] }[] = []
  const interfaces: string[] = []
  const types: string[] = []
  const enums: string[] = []
  const variables: string[] = []

  let ast: File
  try {
    ast = parse(content, {
      sourceType: 'module',
      plugins: getPluginsForPath(filePath),
      errorRecovery: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    })
  } catch {
    return {
      imports,
      exports,
      functions,
      hooks,
      classes,
      interfaces,
      types,
      enums,
      variables,
    }
  }

  traverse(ast, {
    ImportDeclaration(path) {
      imports.push(path.node.source.value)
    },
    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        const decl = path.node.declaration
        if (decl.type === 'FunctionDeclaration' && decl.id) {
          exports.push(decl.id.name)
        }
        if (decl.type === 'ClassDeclaration' && decl.id) {
          exports.push(decl.id.name)
        }
        if (decl.type === 'VariableDeclaration') {
          decl.declarations.forEach((d) => {
            if (d.id.type === 'Identifier') exports.push(d.id.name)
          })
        }
      }
      path.node.specifiers.forEach((spec) => {
        exports.push(spec.exported.name)
      })
    },
    ExportDefaultDeclaration(path) {
      if (path.node.declaration && 'id' in path.node.declaration) {
        const decl = path.node.declaration
        if (decl && typeof decl === 'object' && 'id' in decl && decl.id?.type === 'Identifier') {
          exports.push(`default ${decl.id.name}`)
        } else {
          exports.push('default')
        }
      } else {
        exports.push('default')
      }
    },
    FunctionDeclaration(path) {
      if (!path.node.id) return
      const name = path.node.id.name
      functions.push(name)
      if (name.startsWith('use') && name.length > 3) {
        hooks.push(name)
      }
    },
    VariableDeclarator(path) {
      if (path.node.id.type !== 'Identifier') return
      const name = path.node.id.name
      variables.push(name)
      const init = path.node.init
      if (!init) return
      if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
        functions.push(name)
        if (name.startsWith('use') && name.length > 3) {
          hooks.push(name)
        }
      }
    },
    ClassDeclaration(path) {
      if (!path.node.id) return
      const methods: string[] = []
      path.node.body.body.forEach((member) => {
        if (member.type !== 'ClassMethod' && member.type !== 'ClassPrivateMethod') return
        if (member.key.type === 'Identifier') methods.push(member.key.name)
      })
      classes.push({ name: path.node.id.name, methods })
    },
    TSInterfaceDeclaration(path) {
      interfaces.push(path.node.id.name)
    },
    TSTypeAliasDeclaration(path) {
      types.push(path.node.id.name)
    },
    TSEnumDeclaration(path) {
      enums.push(path.node.id.name)
    },
  })

  return {
    imports: unique(imports),
    exports: unique(exports),
    functions: unique(functions),
    hooks: unique(hooks),
    classes: classes
      .map((entry) => ({
        name: entry.name,
        methods: unique(entry.methods),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    interfaces: unique(interfaces),
    types: unique(types),
    enums: unique(enums),
    variables: unique(variables),
  }
}
