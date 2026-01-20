// Define code outline structure
export type Outline = {
  imports: string[]
  exports: string[]
  functions: string[]
  hooks: string[]
  classes: { name: string; methods: string[] }[]
  interfaces: string[]
  types: string[]
  enums: string[]
  variables: string[]
}

// Define analyzer structure
export type Analyzer = {
  id: string
  supportedExtensions: string[]
  analyze: (content: string) => Outline
}
