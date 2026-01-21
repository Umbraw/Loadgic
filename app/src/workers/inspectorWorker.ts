import { analyzeFileContent } from '../analyzers'

type RequestMessage = {
  id: number
  filePath: string
  content: string
}

type ResponseMessage = {
  id: number
  outline: ReturnType<typeof analyzeFileContent>
  hasAnalyzer: boolean
}

const cache = new Map<string, ReturnType<typeof analyzeFileContent>>()
const hashByPath = new Map<string, string>()

function hashText(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function handleMessage(event: MessageEvent<RequestMessage>) {
  const { id, filePath, content } = event.data
  const nextHash = hashText(content)
  const lastHash = hashByPath.get(filePath)
  if (lastHash && lastHash !== nextHash) {
    cache.delete(`${filePath}:${lastHash}`)
  }
  hashByPath.set(filePath, nextHash)

  const cacheKey = `${filePath}:${nextHash}`
  const cached = cache.get(cacheKey)
  if (cached) {
    const hasAnalyzer = cached !== null
    const response: ResponseMessage = { id, outline: cached, hasAnalyzer }
    self.postMessage(response)
    return
  }

  const outline = analyzeFileContent(filePath, content)
  cache.set(cacheKey, outline)
  const response: ResponseMessage = {
    id,
    outline,
    hasAnalyzer: outline !== null,
  }
  self.postMessage(response)
}

self.addEventListener('message', handleMessage)
