import Parser from 'web-tree-sitter'
import type { LanguageId } from './languages'
import { getLanguageDefinition } from './languages'
import type { Outline } from './types'

let parserReady: Promise<void> | null = null
let wasmBaseUrl: string | null = null
const languageCache = new Map<LanguageId, Parser.Language>()

export function setTreeSitterBaseUrl(baseUrl: string | null) {
  if (!baseUrl || wasmBaseUrl === baseUrl) return
  wasmBaseUrl = baseUrl
  parserReady = null
  languageCache.clear()
}

function resolveWasmUrl(pathname: string) {
  if (wasmBaseUrl) {
    return new URL(pathname, wasmBaseUrl).toString()
  }
  return new URL(pathname, import.meta.url).toString()
}

async function ensureParserReady() {
  if (!parserReady) {
    parserReady = Parser.init({
      locateFile: () => resolveWasmUrl('/treesitter/tree-sitter.wasm'),
    })
  }
  try {
    await parserReady
    return true
  } catch {
    return false
  }
}

async function loadLanguage(id: LanguageId): Promise<Parser.Language | null> {
  if (languageCache.has(id)) {
    return languageCache.get(id) ?? null
  }
  const definition = getLanguageDefinition(id)
  if (!definition?.wasmPath) return null
  try {
    const ready = await ensureParserReady()
    if (!ready) return null
    const wasmUrl = resolveWasmUrl(definition.wasmPath)
    const language = await Parser.Language.load(wasmUrl)
    languageCache.set(id, language)
    return language
  } catch {
    return null
  }
}

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

function collectNamedChildText(node: Parser.SyntaxNode, field: string) {
  const child = node.childForFieldName(field)
  if (!child) return null
  return child.text
}

function getIdentifierText(node: Parser.SyntaxNode) {
  const fieldName =
    node.childForFieldName('name') ??
    node.childForFieldName('identifier') ??
    node.childForFieldName('id')
  if (fieldName) return fieldName.text

  const fallbackTypes = new Set([
    'identifier',
    'type_identifier',
    'field_identifier',
    'property_identifier',
    'method_identifier',
    'namespace_identifier',
    'scoped_identifier',
    'class_identifier',
    'module_identifier',
  ])
  const match = node.namedChildren.find((child) => fallbackTypes.has(child.type))
  return match ? match.text : null
}

function recordVariableFromDeclarator(
  node: Parser.SyntaxNode,
  variables: string[]
) {
  const name = node.childForFieldName('name')?.text
  if (name) variables.push(name)
}

function analyzePython(tree: Parser.Tree): Outline {
  const outline = emptyOutline()
  const imports: string[] = []
  const importBindings: string[] = []
  const functions: string[] = []
  const classes: { name: string; methods: string[] }[] = []
  const variables: string[] = []
  const fromImports: string[] = []
  const decorators: string[] = []
  const methods: string[] = []

  function walk(node: Parser.SyntaxNode) {
    switch (node.type) {
      case 'import_statement': {
        const names = node.namedChildren
          .filter((child) => child.type === 'dotted_name')
          .map((child) => child.text)
        imports.push(...names)
        importBindings.push(...names)
        break
      }
      case 'import_from_statement': {
        const sourceNode = node.namedChildren.find((child) => child.type === 'dotted_name')
        if (sourceNode) {
          imports.push(sourceNode.text)
          fromImports.push(sourceNode.text)
        }
        const imported = node.namedChildren.filter((child) => child.type === 'import_list')
        imported.forEach((list) => {
          list.namedChildren.forEach((name) => importBindings.push(name.text))
        })
        break
      }
      case 'function_definition': {
        const name = collectNamedChildText(node, 'name')
        if (name) functions.push(name)
        break
      }
      case 'class_definition': {
        const name = collectNamedChildText(node, 'name')
        if (!name) break
        const classMethods: string[] = []
        node.namedChildren.forEach((child) => {
          if (child.type === 'block') {
            child.namedChildren.forEach((grandChild) => {
              if (grandChild.type === 'function_definition') {
                const methodName = collectNamedChildText(grandChild, 'name')
                if (methodName) {
                  classMethods.push(methodName)
                  methods.push(methodName)
                }
              }
            })
          }
        })
        classes.push({ name, methods: unique(classMethods) })
        break
      }
      case 'assignment': {
        node.namedChildren.forEach((child) => {
          if (child.type === 'identifier') variables.push(child.text)
        })
        break
      }
      case 'decorator': {
        const name = node.namedChildren[0]?.text
        if (name) decorators.push(name)
        break
      }
      default:
        break
    }

    node.namedChildren.forEach(walk)
  }

  walk(tree.rootNode)

  outline.importSources = unique(imports)
  outline.importBindings = unique(importBindings)
  outline.imports = unique(imports)
  outline.functions = unique(functions)
  outline.classes = classes.sort((a, b) => a.name.localeCompare(b.name))
  outline.variables = unique(variables)
  outline.pyOverview = {
    imports: unique(imports),
    fromImports: unique(fromImports),
    classes: outline.classes.map((entry) => entry.name),
    functions: unique(functions),
    methods: unique(methods),
    variables: unique(variables),
    decorators: unique(decorators),
  }
  return outline
}

function analyzeCFamily(tree: Parser.Tree, mode: 'c' | 'cpp' = 'c'): Outline {
  const outline = emptyOutline()
  const imports: string[] = []
  const functions: string[] = []
  const classes: { name: string; methods: string[] }[] = []
  const enums: string[] = []
  const types: string[] = []
  const variables: string[] = []
  const namespaces: string[] = []

  function walk(node: Parser.SyntaxNode) {
    switch (node.type) {
      case 'preproc_include': {
        const pathNode = node.namedChildren.find((child) => child.type === 'string_literal')
        if (pathNode) imports.push(pathNode.text.replace(/["<>]/g, ''))
        break
      }
      case 'function_definition': {
        const name = getIdentifierText(node)
        if (name) functions.push(name)
        break
      }
      case 'function_declarator': {
        const name = getIdentifierText(node)
        if (name) functions.push(name)
        break
      }
      case 'struct_specifier':
      case 'class_specifier': {
        const name = getIdentifierText(node)
        if (name) {
          const methods: string[] = []
          node.namedChildren.forEach((child) => {
            if (child.type === 'field_declaration_list') {
              child.namedChildren.forEach((member) => {
                if (member.type === 'function_definition') {
                  const methodName = getIdentifierText(member)
                  if (methodName) methods.push(methodName)
                }
              })
            }
          })
          classes.push({ name, methods: unique(methods) })
        }
        break
      }
      case 'namespace_definition': {
        const name = getIdentifierText(node)
        if (name) namespaces.push(name)
        break
      }
      case 'enum_specifier': {
        const name = getIdentifierText(node)
        if (name) enums.push(name)
        break
      }
      case 'type_definition': {
        const name = getIdentifierText(node)
        if (name) types.push(name)
        break
      }
      case 'init_declarator':
      case 'declarator':
      case 'pointer_declarator': {
        recordVariableFromDeclarator(node, variables)
        break
      }
      default:
        break
    }
    node.namedChildren.forEach(walk)
  }

  walk(tree.rootNode)

  outline.importSources = unique(imports)
  outline.imports = unique(imports)
  outline.functions = unique(functions)
  outline.classes = classes.sort((a, b) => a.name.localeCompare(b.name))
  outline.enums = unique(enums)
  outline.types = unique(types)
  outline.variables = unique(variables)
  outline.cOverview = {
    includes: unique(imports),
    functions: unique(functions),
    structs: outline.classes.map((entry) => entry.name),
    enums: outline.enums,
    typedefs: outline.types,
    globals: outline.variables,
  }
  if (mode === 'cpp') {
    outline.cppOverview = {
      includes: unique(imports),
      namespaces: unique(namespaces),
      classes: outline.classes.map((entry) => entry.name),
      structs: outline.classes.map((entry) => entry.name),
      enums: outline.enums,
      typedefs: outline.types,
      functions: unique(functions),
      globals: outline.variables,
    }
  }
  return outline
}

function analyzeGo(tree: Parser.Tree): Outline {
  const outline = emptyOutline()
  const imports: string[] = []
  const packages: string[] = []
  const functions: string[] = []
  const methods: string[] = []
  const classes: { name: string; methods: string[] }[] = []
  const interfaces: string[] = []
  const types: string[] = []
  const variables: string[] = []

  function walk(node: Parser.SyntaxNode) {
    switch (node.type) {
      case 'import_declaration': {
        node.namedChildren.forEach((child) => {
          if (child.type === 'import_spec') {
            const pathNode = child.childForFieldName('path')
            if (pathNode) imports.push(pathNode.text.replace(/"/g, ''))
          }
        })
        break
      }
      case 'function_declaration':
      case 'method_declaration': {
        const name = getIdentifierText(node)
        if (name) {
          if (node.type === 'method_declaration') {
            methods.push(name)
          } else {
            functions.push(name)
          }
        }
        break
      }
      case 'package_clause': {
        const name = getIdentifierText(node)
        if (name) packages.push(name)
        break
      }
      case 'type_spec': {
        const name = getIdentifierText(node)
        if (name) types.push(name)
        const value = node.childForFieldName('type')
        if (value?.type === 'struct_type') {
          classes.push({ name: name ?? value.text, methods: [] })
        }
        if (value?.type === 'interface_type') {
          interfaces.push(name ?? value.text)
        }
        break
      }
      case 'var_spec':
      case 'short_var_declaration': {
        node.namedChildren.forEach((child) => {
          if (child.type === 'identifier') variables.push(child.text)
        })
        break
      }
      default:
        break
    }
    node.namedChildren.forEach(walk)
  }

  walk(tree.rootNode)
  outline.importSources = unique(imports)
  outline.imports = unique(imports)
  outline.functions = unique(functions)
  outline.hooks = []
  outline.classes = classes.sort((a, b) => a.name.localeCompare(b.name))
  outline.interfaces = unique(interfaces)
  outline.types = unique(types)
  outline.variables = unique(variables)
  outline.goOverview = {
    imports: unique(imports),
    packages: unique(packages),
    structs: outline.classes.map((entry) => entry.name),
    interfaces: outline.interfaces,
    functions: unique(functions),
    methods: unique(methods),
    variables: unique(variables),
    types: unique(types),
  }
  return outline
}

function analyzeRust(tree: Parser.Tree): Outline {
  const outline = emptyOutline()
  const imports: string[] = []
  const functions: string[] = []
  const classes: { name: string; methods: string[] }[] = []
  const enums: string[] = []
  const interfaces: string[] = []
  const types: string[] = []
  const variables: string[] = []
  const modules: string[] = []
  const impls: string[] = []
  const constants: string[] = []

  function walk(node: Parser.SyntaxNode) {
    switch (node.type) {
      case 'use_declaration': {
        const pathNode = node.childForFieldName('argument')
        if (pathNode) imports.push(pathNode.text)
        break
      }
      case 'function_item': {
        const name = getIdentifierText(node)
        if (name) functions.push(name)
        break
      }
      case 'struct_item': {
        const name = getIdentifierText(node)
        if (name) classes.push({ name, methods: [] })
        break
      }
      case 'enum_item': {
        const name = getIdentifierText(node)
        if (name) enums.push(name)
        break
      }
      case 'trait_item': {
        const name = getIdentifierText(node)
        if (name) interfaces.push(name)
        break
      }
      case 'mod_item': {
        const name = getIdentifierText(node)
        if (name) modules.push(name)
        break
      }
      case 'impl_item': {
        const name = getIdentifierText(node)
        if (name) impls.push(name)
        break
      }
      case 'type_item': {
        const name = getIdentifierText(node)
        if (name) types.push(name)
        break
      }
      case 'const_item': {
        const name = getIdentifierText(node)
        if (name) constants.push(name)
        break
      }
      case 'static_item':
      case 'let_declaration': {
        const name = getIdentifierText(node)
        if (name) variables.push(name)
        break
      }
      default:
        break
    }
    node.namedChildren.forEach(walk)
  }

  walk(tree.rootNode)
  outline.importSources = unique(imports)
  outline.imports = unique(imports)
  outline.functions = unique(functions)
  outline.classes = classes.sort((a, b) => a.name.localeCompare(b.name))
  outline.enums = unique(enums)
  outline.interfaces = unique(interfaces)
  outline.types = unique(types)
  outline.variables = unique(variables)
  outline.rsOverview = {
    uses: unique(imports),
    modules: unique(modules),
    structs: outline.classes.map((entry) => entry.name),
    enums: outline.enums,
    traits: outline.interfaces,
    functions: unique(functions),
    impls: unique(impls),
    types: unique(types),
    constants: unique(constants),
  }
  return outline
}

function analyzeJava(tree: Parser.Tree): Outline {
  const outline = emptyOutline()
  const imports: string[] = []
  const packages: string[] = []
  const classes: { name: string; methods: string[] }[] = []
  const interfaces: string[] = []
  const enums: string[] = []
  const functions: string[] = []
  const variables: string[] = []

  function walk(node: Parser.SyntaxNode) {
    switch (node.type) {
      case 'import_declaration': {
        const name = node.namedChildren.find((child) => child.type === 'scoped_identifier')
        if (name) imports.push(name.text)
        break
      }
      case 'package_declaration': {
        const name = node.namedChildren.find((child) => child.type === 'scoped_identifier')
        if (name) packages.push(name.text)
        break
      }
      case 'class_declaration': {
        const name = getIdentifierText(node)
        if (name) {
          const methods: string[] = []
          node.namedChildren.forEach((child) => {
            if (child.type === 'class_body') {
              child.namedChildren.forEach((member) => {
                if (member.type === 'method_declaration') {
                  const methodName = getIdentifierText(member)
                  if (methodName) methods.push(methodName)
                }
              })
            }
          })
          classes.push({ name, methods: unique(methods) })
        }
        break
      }
      case 'interface_declaration': {
        const name = getIdentifierText(node)
        if (name) interfaces.push(name)
        break
      }
      case 'enum_declaration': {
        const name = getIdentifierText(node)
        if (name) enums.push(name)
        break
      }
      case 'method_declaration': {
        const name = getIdentifierText(node)
        if (name) functions.push(name)
        break
      }
      case 'field_declaration': {
        node.namedChildren.forEach((child) => {
          if (child.type === 'variable_declarator') {
            const name = getIdentifierText(child)
            if (name) variables.push(name)
          }
        })
        break
      }
      default:
        break
    }
    node.namedChildren.forEach(walk)
  }

  walk(tree.rootNode)
  outline.importSources = unique(imports)
  outline.imports = unique(imports)
  outline.functions = unique(functions)
  outline.classes = classes.sort((a, b) => a.name.localeCompare(b.name))
  outline.interfaces = unique(interfaces)
  outline.enums = unique(enums)
  outline.variables = unique(variables)
  outline.javaOverview = {
    packageName: unique(packages),
    imports: unique(imports),
    classes: outline.classes.map((entry) => entry.name),
    interfaces: outline.interfaces,
    enums: outline.enums,
    methods: outline.functions,
    fields: outline.variables,
  }
  return outline
}

function analyzeCSharp(tree: Parser.Tree): Outline {
  const outline = emptyOutline()
  const imports: string[] = []
  const namespaces: string[] = []
  const classes: { name: string; methods: string[] }[] = []
  const interfaces: string[] = []
  const enums: string[] = []
  const functions: string[] = []
  const variables: string[] = []

  function walk(node: Parser.SyntaxNode) {
    switch (node.type) {
      case 'using_directive': {
        const name = node.namedChildren.find((child) => child.type === 'qualified_name')
        if (name) imports.push(name.text)
        break
      }
      case 'class_declaration':
      case 'struct_declaration': {
        const name = getIdentifierText(node)
        if (name) {
          const methods: string[] = []
          node.namedChildren.forEach((child) => {
            if (child.type === 'declaration_list') {
              child.namedChildren.forEach((member) => {
                if (member.type === 'method_declaration') {
                  const methodName = getIdentifierText(member)
                  if (methodName) methods.push(methodName)
                }
              })
            }
          })
          classes.push({ name, methods: unique(methods) })
        }
        break
      }
      case 'namespace_declaration': {
        const name = getIdentifierText(node)
        if (name) namespaces.push(name)
        break
      }
      case 'interface_declaration': {
        const name = getIdentifierText(node)
        if (name) interfaces.push(name)
        break
      }
      case 'enum_declaration': {
        const name = getIdentifierText(node)
        if (name) enums.push(name)
        break
      }
      case 'method_declaration': {
        const name = getIdentifierText(node)
        if (name) functions.push(name)
        break
      }
      case 'field_declaration':
      case 'property_declaration': {
        node.namedChildren.forEach((child) => {
          if (child.type === 'variable_declarator') {
            const name = getIdentifierText(child)
            if (name) variables.push(name)
          }
        })
        break
      }
      default:
        break
    }
    node.namedChildren.forEach(walk)
  }

  walk(tree.rootNode)
  outline.importSources = unique(imports)
  outline.imports = unique(imports)
  outline.functions = unique(functions)
  outline.classes = classes.sort((a, b) => a.name.localeCompare(b.name))
  outline.interfaces = unique(interfaces)
  outline.enums = unique(enums)
  outline.variables = unique(variables)
  outline.csOverview = {
    usings: unique(imports),
    namespaces: unique(namespaces),
    classes: outline.classes.map((entry) => entry.name),
    structs: outline.classes.map((entry) => entry.name),
    interfaces: outline.interfaces,
    enums: outline.enums,
    methods: outline.functions,
    members: outline.variables,
  }
  return outline
}

function analyzePHP(tree: Parser.Tree): Outline {
  const outline = emptyOutline()
  const imports: string[] = []
  const namespaces: string[] = []
  const classes: { name: string; methods: string[] }[] = []
  const interfaces: string[] = []
  const traits: string[] = []
  const functions: string[] = []
  const variables: string[] = []
  const constants: string[] = []
  const methods: string[] = []
  const properties: string[] = []

  function walk(node: Parser.SyntaxNode) {
    switch (node.type) {
      case 'namespace_use_declaration': {
        const name = node.namedChildren.find((child) => child.type === 'namespace_name')
        if (name) imports.push(name.text)
        break
      }
      case 'class_declaration':
      case 'trait_declaration': {
        const name = getIdentifierText(node)
        if (name) {
          const methods: string[] = []
          node.namedChildren.forEach((child) => {
            if (child.type === 'declaration_list') {
              child.namedChildren.forEach((member) => {
                if (member.type === 'method_declaration') {
                  const methodName = getIdentifierText(member)
                  if (methodName) methods.push(methodName)
                }
                if (member.type === 'property_declaration') {
                  const propName = getIdentifierText(member)
                  if (propName) properties.push(propName)
                }
                if (member.type === 'const_declaration') {
                  const constName = getIdentifierText(member)
                  if (constName) constants.push(constName)
                }
              })
            }
          })
          classes.push({ name, methods: unique(methods) })
        }
        if (node.type === 'trait_declaration' && name) {
          traits.push(name)
        }
        break
      }
      case 'interface_declaration': {
        const name = getIdentifierText(node)
        if (name) interfaces.push(name)
        break
      }
      case 'function_definition': {
        const name = getIdentifierText(node)
        if (name) functions.push(name)
        break
      }
      case 'property_declaration':
      case 'assignment_expression': {
        const name = getIdentifierText(node)
        if (name) variables.push(name)
        break
      }
      case 'namespace_definition': {
        const name = getIdentifierText(node)
        if (name) namespaces.push(name)
        break
      }
      case 'method_declaration': {
        const name = getIdentifierText(node)
        if (name) methods.push(name)
        break
      }
      default:
        break
    }
    node.namedChildren.forEach(walk)
  }

  walk(tree.rootNode)
  outline.importSources = unique(imports)
  outline.imports = unique(imports)
  outline.functions = unique(functions)
  outline.classes = classes.sort((a, b) => a.name.localeCompare(b.name))
  outline.interfaces = unique(interfaces)
  outline.variables = unique(variables)
  outline.phpOverview = {
    uses: unique(imports),
    namespaces: unique(namespaces),
    classes: outline.classes.map((entry) => entry.name),
    interfaces: outline.interfaces,
    traits: unique(traits),
    functions: unique(functions),
    methods: unique(methods),
    properties: unique(properties),
    constants: unique(constants),
  }
  return outline
}

function analyzeRuby(tree: Parser.Tree): Outline {
  const outline = emptyOutline()
  const imports: string[] = []
  const classes: { name: string; methods: string[] }[] = []
  const functions: string[] = []
  const variables: string[] = []
  const modules: string[] = []
  const constants: string[] = []

  function walk(node: Parser.SyntaxNode) {
    switch (node.type) {
      case 'call': {
        const method = node.childForFieldName('method')?.text
        if (method === 'require' || method === 'require_relative') {
          const arg = node.childForFieldName('argument')
          if (arg) imports.push(arg.text.replace(/['"]/g, ''))
        }
        break
      }
      case 'module': {
        const name = getIdentifierText(node)
        if (name) modules.push(name)
        break
      }
      case 'class': {
        const name = getIdentifierText(node)
        if (name) classes.push({ name, methods: [] })
        break
      }
      case 'method': {
        const name = getIdentifierText(node)
        if (name) functions.push(name)
        break
      }
      case 'assignment': {
        const name = getIdentifierText(node)
        if (name) variables.push(name)
        break
      }
      case 'constant_assignment': {
        const name = getIdentifierText(node)
        if (name) constants.push(name)
        break
      }
      default:
        break
    }
    node.namedChildren.forEach(walk)
  }

  walk(tree.rootNode)
  outline.importSources = unique(imports)
  outline.imports = unique(imports)
  outline.functions = unique(functions)
  outline.classes = classes.sort((a, b) => a.name.localeCompare(b.name))
  outline.variables = unique(variables)
  outline.rbOverview = {
    requires: unique(imports),
    modules: unique(modules),
    classes: outline.classes.map((entry) => entry.name),
    methods: unique(functions),
    variables: unique(variables),
    constants: unique(constants),
  }
  return outline
}

function analyzeMarkdown(tree: Parser.Tree): Outline {
  const outline = emptyOutline()
  const headings: string[] = []
  const links: string[] = []
  const codeBlocks: string[] = []
  const lists: string[] = []

  function walk(node: Parser.SyntaxNode) {
    switch (node.type) {
      case 'atx_heading':
      case 'setext_heading': {
        const text = node.text.replace(/#+\s*/g, '').trim()
        if (text) headings.push(text)
        break
      }
      case 'link': {
        const destination = node.childForFieldName('destination')?.text
        if (destination) links.push(destination.replace(/[()]/g, ''))
        break
      }
      case 'fenced_code_block': {
        const info = node.childForFieldName('info_string')?.text ?? ''
        codeBlocks.push(info.trim() || 'code')
        break
      }
      case 'list': {
        lists.push('list')
        break
      }
      default:
        break
    }
    node.namedChildren.forEach(walk)
  }

  walk(tree.rootNode)
  outline.mdOverview = {
    headings: unique(headings),
    links: unique(links),
    codeBlocks: unique(codeBlocks),
    lists: unique(lists),
  }
  return outline
}

function analyzeYaml(tree: Parser.Tree): Outline {
  const outline = emptyOutline()
  const keys: string[] = []
  const objectPaths: string[] = []
  const arrayPaths: string[] = []
  const scalarValues: string[] = []
  const maxValues = 20

  function walk(node: Parser.SyntaxNode, path: string[] = []) {
    if (node.type === 'block_mapping_pair' || node.type === 'flow_pair') {
      const keyNode = node.childForFieldName('key')
      const valueNode = node.childForFieldName('value')
      if (keyNode) {
        const rawKey = keyNode.text.replace(/^\"|\"$/g, '')
        const nextPath = [...path, rawKey]
        keys.push(nextPath.join('.'))
        if (valueNode) {
          if (valueNode.type === 'block_mapping' || valueNode.type === 'flow_mapping') {
            objectPaths.push(nextPath.join('.'))
          }
          if (valueNode.type === 'block_sequence' || valueNode.type === 'flow_sequence') {
            arrayPaths.push(nextPath.join('.'))
          }
          if (
            !['block_mapping', 'flow_mapping', 'block_sequence', 'flow_sequence'].includes(
              valueNode.type
            ) &&
            scalarValues.length < maxValues
          ) {
            scalarValues.push(valueNode.text)
          }
          walk(valueNode, nextPath)
        }
        return
      }
    }

    node.namedChildren.forEach((child) => walk(child, path))
  }

  walk(tree.rootNode)
  outline.ymlOverview = {
    keys: unique(keys),
    objectPaths: unique(objectPaths),
    arrayPaths: unique(arrayPaths),
    scalarValues: unique(scalarValues),
  }
  return outline
}

function analyzeJson(tree: Parser.Tree): Outline {
  const outline = emptyOutline()
  const keys: string[] = []
  const objectPaths: string[] = []
  const arrayPaths: string[] = []
  const stringValues: string[] = []
  const numberValues: string[] = []
  const booleanValues: string[] = []
  const nullPaths: string[] = []
  const maxValues = 20

  function walk(node: Parser.SyntaxNode, path: string[] = []) {
    if (node.type === 'pair') {
      const keyNode = node.childForFieldName('key')
      const valueNode = node.childForFieldName('value')
      if (keyNode) {
        const rawKey = keyNode.text.replace(/^\"|\"$/g, '')
        const nextPath = [...path, rawKey]
        keys.push(nextPath.join('.'))
        if (valueNode) {
          if (valueNode.type === 'object') objectPaths.push(nextPath.join('.'))
          if (valueNode.type === 'array') arrayPaths.push(nextPath.join('.'))
          if (valueNode.type === 'string' && stringValues.length < maxValues) {
            stringValues.push(valueNode.text.replace(/^\"|\"$/g, ''))
          }
          if (valueNode.type === 'number' && numberValues.length < maxValues) {
            numberValues.push(valueNode.text)
          }
          if (
            (valueNode.type === 'true' || valueNode.type === 'false') &&
            booleanValues.length < maxValues
          ) {
            booleanValues.push(valueNode.text)
          }
          if (valueNode.type === 'null') {
            nullPaths.push(nextPath.join('.'))
          }
          walk(valueNode, nextPath)
        }
        return
      }
    }

    node.namedChildren.forEach((child) => walk(child, path))
  }

  walk(tree.rootNode)
  outline.jsonOverview = {
    keys: unique(keys),
    objectPaths: unique(objectPaths),
    arrayPaths: unique(arrayPaths),
    stringValues: unique(stringValues),
    numberValues: unique(numberValues),
    booleanValues: unique(booleanValues),
    nullPaths: unique(nullPaths),
  }
  return outline
}

function analyzeJavaScript(
  tree: Parser.Tree,
  mode: 'js' | 'jsx' | 'ts' | 'tsx' = 'js'
): Outline {
  const outline = emptyOutline()
  const imports: string[] = []
  const importBindings: string[] = []
  const exports: string[] = []
  const exportSources: string[] = []
  const functions: string[] = []
  const hooks: string[] = []
  const classes: { name: string; methods: string[] }[] = []
  const variables: string[] = []
  const components: string[] = []
  const interfaces: string[] = []
  const types: string[] = []
  const enums: string[] = []

  function recordFunctionName(name: string | null) {
    if (!name) return
    functions.push(name)
    if (name.startsWith('use') && name.length > 3) {
      hooks.push(name)
    }
    if ((mode === 'jsx' || mode === 'tsx') && name[0] === name[0]?.toUpperCase()) {
      components.push(name)
    }
  }

  function walk(node: Parser.SyntaxNode) {
    switch (node.type) {
      case 'import_statement': {
        const sourceNode = node.namedChildren.find((child) => child.type === 'string')
        if (sourceNode) imports.push(sourceNode.text.replace(/['"]/g, ''))
        node.namedChildren.forEach((child) => {
          if (child.type === 'import_clause' || child.type === 'named_imports') {
            child.namedChildren.forEach((spec) => {
              if (spec.type === 'import_specifier') {
                const name = spec.childForFieldName('name')?.text
                if (name) importBindings.push(name)
              }
              if (spec.type === 'namespace_import') {
                const name = spec.childForFieldName('name')?.text
                if (name) importBindings.push(name)
              }
            })
          }
          if (child.type === 'identifier') {
            importBindings.push(child.text)
          }
        })
        break
      }
      case 'export_statement': {
        const sourceNode = node.namedChildren.find((child) => child.type === 'string')
        if (sourceNode) exportSources.push(sourceNode.text.replace(/['"]/g, ''))
        node.namedChildren.forEach((child) => {
          if (child.type === 'export_clause') {
            child.namedChildren.forEach((spec) => {
              const name = spec.childForFieldName('name')?.text
              if (name) exports.push(name)
            })
          }
          if (child.type === 'function_declaration') {
            const name = collectNamedChildText(child, 'name')
            if (name) exports.push(name)
          }
          if (child.type === 'class_declaration') {
            const name = collectNamedChildText(child, 'name')
            if (name) exports.push(name)
          }
        })
        break
      }
      case 'function_declaration': {
        const name = collectNamedChildText(node, 'name')
        recordFunctionName(name)
        break
      }
      case 'lexical_declaration':
      case 'variable_declaration': {
        node.namedChildren.forEach((child) => {
          if (child.type === 'variable_declarator') {
            const name = child.childForFieldName('name')?.text
            if (name) variables.push(name)
            const init = child.childForFieldName('value')
            if (name && init && (init.type === 'arrow_function' || init.type === 'function')) {
              recordFunctionName(name)
            }
          }
        })
        break
      }
      case 'class_declaration': {
        const name = collectNamedChildText(node, 'name')
        if (!name) break
        const methods: string[] = []
        node.namedChildren.forEach((child) => {
          if (child.type === 'class_body') {
            child.namedChildren.forEach((member) => {
              if (member.type === 'method_definition') {
                const methodName = member.childForFieldName('name')?.text
                if (methodName) methods.push(methodName)
              }
            })
          }
        })
        classes.push({ name, methods: unique(methods) })
        break
      }
      case 'interface_declaration': {
        const name = collectNamedChildText(node, 'name')
        if (name) interfaces.push(name)
        break
      }
      case 'type_alias_declaration': {
        const name = collectNamedChildText(node, 'name')
        if (name) types.push(name)
        break
      }
      case 'enum_declaration': {
        const name = collectNamedChildText(node, 'name')
        if (name) enums.push(name)
        break
      }
      default:
        break
    }

    node.namedChildren.forEach(walk)
  }

  walk(tree.rootNode)

  outline.importSources = unique(imports)
  outline.importBindings = unique(importBindings)
  outline.imports = unique(imports)
  outline.exports = unique(exports)
  outline.exportSources = unique(exportSources)
  outline.functions = unique(functions)
  outline.hooks = unique(hooks)
  outline.classes = classes.sort((a, b) => a.name.localeCompare(b.name))
  outline.variables = unique(variables)
  outline.jsOverview = {
    importSources: unique(imports),
    importBindings: unique(importBindings),
    exportNames: unique(exports),
    functions: unique(functions),
    hooks: unique(hooks),
    classes: outline.classes.map((entry) => entry.name),
    variables: unique(variables),
  }
  if (mode === 'jsx') {
    outline.jsxOverview = {
      importSources: unique(imports),
      importBindings: unique(importBindings),
      exportNames: unique(exports),
      components: unique(components),
      functions: unique(functions),
      hooks: unique(hooks),
      classes: outline.classes.map((entry) => entry.name),
      variables: unique(variables),
    }
  }
  if (mode === 'ts') {
    outline.tsOverview = {
      importSources: unique(imports),
      importBindings: unique(importBindings),
      exportNames: unique(exports),
      functions: unique(functions),
      interfaces: unique(interfaces),
      types: unique(types),
      enums: unique(enums),
      classes: outline.classes.map((entry) => entry.name),
      variables: unique(variables),
    }
  }
  if (mode === 'tsx') {
    outline.tsxOverview = {
      importSources: unique(imports),
      importBindings: unique(importBindings),
      exportNames: unique(exports),
      components: unique(components),
      interfaces: unique(interfaces),
      types: unique(types),
      enums: unique(enums),
      classes: outline.classes.map((entry) => entry.name),
      functions: unique(functions),
      hooks: unique(hooks),
      variables: unique(variables),
    }
  }
  return outline
}

export async function analyzeWithTreeSitter(
  languageId: LanguageId,
  content: string
): Promise<Outline | null> {
  const language = await loadLanguage(languageId)
  if (!language) return null
  const parser = new Parser()
  parser.setLanguage(language)
  const tree = parser.parse(content)

  switch (languageId) {
    case 'python':
      return analyzePython(tree)
    case 'javascript':
      return analyzeJavaScript(tree, 'js')
    case 'jsx':
      return analyzeJavaScript(tree, 'jsx')
    case 'typescript':
      return analyzeJavaScript(tree, 'ts')
    case 'tsx':
      return analyzeJavaScript(tree, 'tsx')
    case 'c':
      return analyzeCFamily(tree, 'c')
    case 'cpp':
      return analyzeCFamily(tree, 'cpp')
    case 'go':
      return analyzeGo(tree)
    case 'rust':
      return analyzeRust(tree)
    case 'java':
      return analyzeJava(tree)
    case 'csharp':
      return analyzeCSharp(tree)
    case 'php':
      return analyzePHP(tree)
    case 'ruby':
      return analyzeRuby(tree)
    case 'markdown':
      return analyzeMarkdown(tree)
    case 'yaml':
      return analyzeYaml(tree)
    case 'json':
      return analyzeJson(tree)
    default:
      return emptyOutline()
  }
}
