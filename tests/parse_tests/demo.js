import fs from 'fs'
import path from 'path'

export class Runner {
  run(name) {
    return `Hello ${name}`
  }
}

export function greet(name) {
  return `Hello ${name}`
}

export const useThing = () => {
  return fs.readFileSync(path.join('.', 'README.md'), 'utf-8')
}

const localValue = 42

export { localValue }
