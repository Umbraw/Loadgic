import type { Analyzer, Outline } from './types'
import { analyzeJsTs } from './jsTsAnalyzer'

const JS_TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

const jsTsAnalyzer: Analyzer = {
  id: 'js-ts',
  supportedExtensions: JS_TS_EXTENSIONS,
  analyze: (content: string) => analyzeJsTs(content, ''),
}

const analyzers: Analyzer[] = [jsTsAnalyzer]

function getExtension(filePath: string) {
  const match = filePath.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? `.${match[1]}` : ''
}

export function getAnalyzerForFile(filePath: string): Analyzer | null {
  const ext = getExtension(filePath)
  return analyzers.find((a) => a.supportedExtensions.includes(ext)) ?? null
}

export function analyzeFileContent(
  filePath: string,
  content: string
): Outline | null {
  const analyzer = getAnalyzerForFile(filePath)
  if (!analyzer) return null
  if (analyzer.id === 'js-ts') {
    return analyzeJsTs(content, filePath)
  }
  return analyzer.analyze(content)
}
