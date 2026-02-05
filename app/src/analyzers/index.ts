import type { Outline } from './types'
import { analyzeWithTreeSitter } from './treeSitterAnalyzer'
import {
  CORE_LANGUAGE_IDS,
  getLanguageForFileWithContent,
  type LanguageId,
} from './languages'
import { analyzeMarkdownText, analyzeYamlText } from './plainTextAnalyzers'

export type AnalysisSettings = {
  engine: 'tree-sitter'
  enabledLanguages: LanguageId[]
}

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  engine: 'tree-sitter',
  enabledLanguages: CORE_LANGUAGE_IDS,
}

export async function analyzeFileContent(
  filePath: string,
  content: string,
  settings: AnalysisSettings = DEFAULT_ANALYSIS_SETTINGS,
  forcedLanguageId?: LanguageId | null
): Promise<Outline | null> {
  const languageId =
    forcedLanguageId ?? getLanguageForFileWithContent(filePath, content)
  if (!languageId || !settings.enabledLanguages.includes(languageId)) {
    return null
  }

  if (languageId === 'markdown') {
    return analyzeMarkdownText(content)
  }
  if (languageId === 'yaml') {
    return analyzeYamlText(content)
  }

  if (settings.engine !== 'tree-sitter') return null
  return analyzeWithTreeSitter(languageId, content, filePath)
}
