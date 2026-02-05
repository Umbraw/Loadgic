// Define code outline structure
export type SymbolInfo = {
  id: string
  kind: 'function' | 'class'
  name: string
  filePath: string
  range: {
    startLine: number
    startCol: number
    endLine: number
    endCol: number
  }
  doc?: {
    source: 'jsdoc' | 'docblock' | 'docstring' | 'generated'
    markdown: string
  }
}

export type Outline = {
  imports: string[]
  importBindings: string[]
  importSources: string[]
  exports: string[]
  exportSources: string[]
  functions: string[]
  hooks: string[]
  classes: { name: string; methods: string[] }[]
  interfaces: string[]
  types: string[]
  enums: string[]
  variables: string[]
  symbols?: SymbolInfo[]
  jsonOverview?: {
    keys: string[]
    objectPaths: string[]
    arrayPaths: string[]
    stringValues: string[]
    numberValues: string[]
    booleanValues: string[]
    nullPaths: string[]
  }
  cOverview?: {
    includes: string[]
    functions: string[]
    structs: string[]
    enums: string[]
    typedefs: string[]
    globals: string[]
  }
  cppOverview?: {
    includes: string[]
    namespaces: string[]
    classes: string[]
    structs: string[]
    enums: string[]
    typedefs: string[]
    functions: string[]
    globals: string[]
  }
  csOverview?: {
    usings: string[]
    namespaces: string[]
    classes: string[]
    structs: string[]
    interfaces: string[]
    enums: string[]
    methods: string[]
    members: string[]
  }
  goOverview?: {
    imports: string[]
    packages: string[]
    structs: string[]
    interfaces: string[]
    functions: string[]
    methods: string[]
    variables: string[]
    types: string[]
  }
  javaOverview?: {
    packageName: string[]
    imports: string[]
    classes: string[]
    interfaces: string[]
    enums: string[]
    methods: string[]
    fields: string[]
  }
  jsOverview?: {
    importSources: string[]
    importBindings: string[]
    exportNames: string[]
    functions: string[]
    hooks: string[]
    classes: string[]
    variables: string[]
  }
  jsxOverview?: {
    importSources: string[]
    importBindings: string[]
    exportNames: string[]
    components: string[]
    functions: string[]
    hooks: string[]
    classes: string[]
    variables: string[]
  }
  mdOverview?: {
    headings: string[]
    links: string[]
    codeBlocks: string[]
    lists: string[]
  }
  phpOverview?: {
    uses: string[]
    namespaces: string[]
    classes: string[]
    interfaces: string[]
    traits: string[]
    functions: string[]
    methods: string[]
    properties: string[]
    constants: string[]
  }
  pyOverview?: {
    imports: string[]
    fromImports: string[]
    classes: string[]
    functions: string[]
    methods: string[]
    variables: string[]
    decorators: string[]
  }
  rbOverview?: {
    requires: string[]
    modules: string[]
    classes: string[]
    methods: string[]
    variables: string[]
    constants: string[]
  }
  rsOverview?: {
    uses: string[]
    modules: string[]
    structs: string[]
    enums: string[]
    traits: string[]
    functions: string[]
    impls: string[]
    types: string[]
    constants: string[]
  }
  tsOverview?: {
    importSources: string[]
    importBindings: string[]
    exportNames: string[]
    functions: string[]
    interfaces: string[]
    types: string[]
    enums: string[]
    classes: string[]
    variables: string[]
  }
  tsxOverview?: {
    importSources: string[]
    importBindings: string[]
    exportNames: string[]
    components: string[]
    interfaces: string[]
    types: string[]
    enums: string[]
    classes: string[]
    functions: string[]
    hooks: string[]
    variables: string[]
  }
  ymlOverview?: {
    keys: string[]
    objectPaths: string[]
    arrayPaths: string[]
    scalarValues: string[]
  }
}

// Define analyzer structure
export type Analyzer = {
  id: string
  supportedExtensions: string[]
  analyze: (content: string) => Outline
}
