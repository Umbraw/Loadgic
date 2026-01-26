import { analyzeFileContent, type AnalysisSettings } from '../analyzers'
import { setTreeSitterBaseUrl } from '../analyzers/treeSitterAnalyzer'

type RequestMessage = {
  id: number
  filePath: string
  content: string
  settings?: AnalysisSettings
  baseUrl?: string
}

type ResponseMessage = {
  id: number
  outline: ReturnType<typeof analyzeFileContent>
  hasAnalyzer: boolean
}

const cache = new Map<string, Awaited<ReturnType<typeof analyzeFileContent>>>()
const hashByPath = new Map<string, string>()
const LRU_LIMIT = 50

function touchCache(key: string, value: ReturnType<typeof analyzeFileContent>) {
  if (cache.has(key)) {
    cache.delete(key)
  }
  cache.set(key, value)
  if (cache.size > LRU_LIMIT) {
    const oldestKey = cache.keys().next().value as string | undefined
    if (oldestKey) {
      cache.delete(oldestKey)
    }
  }
}

function hashText(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

async function handleMessage(event: MessageEvent<RequestMessage>) {
  const { id, filePath, content } = event.data
  const settings = event.data.settings
  if (event.data.baseUrl) {
    setTreeSitterBaseUrl(event.data.baseUrl)
  }
  const settingsKey = settings ? JSON.stringify(settings) : 'default'
  const nextHash = hashText(content)
  const lastHash = hashByPath.get(filePath)
  if (lastHash && lastHash !== nextHash) {
    cache.delete(`${filePath}:${lastHash}`)
  }
  hashByPath.set(filePath, nextHash)

  const cacheKey = `${filePath}:${nextHash}:${hashText(settingsKey)}`
  const cached = cache.get(cacheKey)
  if (cached) {
    touchCache(cacheKey, cached)
    const hasAnalyzer = cached !== null
    const response: ResponseMessage = { id, outline: cached, hasAnalyzer }
    self.postMessage(response)
    return
  }

  const outline = await analyzeFileContent(filePath, content, settings)
  touchCache(cacheKey, outline)
  const response: ResponseMessage = {
    id,
    outline,
    hasAnalyzer: outline !== null,
  }
  self.postMessage(response)
}

self.addEventListener('message', handleMessage)
