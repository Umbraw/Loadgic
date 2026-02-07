import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { dracula } from '@uiw/codemirror-theme-dracula'
import { githubDark, githubLight } from '@uiw/codemirror-theme-github'
import { solarizedDark, solarizedLight } from '@uiw/codemirror-theme-solarized'
import { nordInit } from '@uiw/codemirror-theme-nord'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { python } from '@codemirror/lang-python'
import { java } from '@codemirror/lang-java'
import { rust } from '@codemirror/lang-rust'
import { php } from '@codemirror/lang-php'
import { sql } from '@codemirror/lang-sql'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Facet,
  RangeSetBuilder,
  type Extension,
  type Text,
} from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
} from '@codemirror/view'
import { useTheme } from '../../theme/ThemeProvider'
import {
  detectLanguageFromShebang,
  LANGUAGE_DEFINITIONS,
  type LanguageId,
} from '../../analyzers/languages'
import type { Outline, SymbolInfo } from '../../analyzers/types'
import type { Overlay } from '../../types/overlay'
import DocRenderer from './DocRenderer'
import { parseLGDoc } from '../../utils/lgdoc'

// Props for FileViewer component
type Props = {
  content: string
  filePath: string
  projectRoot?: string | null
  docSymbols?: SymbolInfo[]
  docOutline?: Outline | null
  overlayRequest?: { x: number; y: number; nonce: number } | null
  forcedLanguageId?: LanguageId | null
  onLanguageOverrideChange?: (next: LanguageId | null) => void
  highlightQuery?: string | null
  occurrenceIndex?: number | null
  focusRequest?: number
  onOccurrencesChange?: (count: number) => void
  onSymbolSelect?: (selection: {
    symbol: string
    line: number
    column: number
    occurrenceIndex?: number
  }) => void
  onOverlayUpdated?: () => void
}

const nord = nordInit({})

// Get the appropriate editor theme
function getEditorTheme(editorTheme: string, isDark: boolean): Extension {
  switch (editorTheme) {
    case 'dracula':
      return dracula
    case 'github':
      return isDark ? githubDark : githubLight
    case 'solarized':
      return isDark ? solarizedDark : solarizedLight
    case 'nord':
      return nord
    case 'oneDark':
    default:
      return oneDark
  }
}

// Extract file extension
function getExtension(filePath: string) {
  const match = filePath.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

// Get language extension based on file extension
function getLanguageExtension(ext: string) {
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return javascript({ typescript: ext.includes('ts') })
    case 'html':
    case 'htm':
      return html()
    case 'css':
    case 'scss':
    case 'less':
      return css()
    case 'json':
      return json()
    case 'md':
    case 'markdown':
      return markdown()
    case 'xml':
    case 'svg':
      return xml()
    case 'yaml':
    case 'yml':
      return yaml()
    case 'py':
      return python()
    case 'java':
      return java()
    case 'rs':
      return rust()
    case 'php':
      return php()
    case 'sql':
      return sql()
    default:
      return []
  }
}

function getLanguageExtensionById(languageId: string) {
  switch (languageId) {
    case 'javascript':
    case 'jsx':
    case 'typescript':
    case 'tsx':
      return javascript({ typescript: languageId.includes('ts') })
    case 'python':
      return python()
    case 'json':
      return json()
    case 'yaml':
      return yaml()
    case 'markdown':
      return markdown()
    case 'java':
      return java()
    case 'rust':
      return rust()
    case 'php':
      return php()
    case 'sql':
      return sql()
    case 'xml':
      return xml()
    case 'html':
      return html()
    case 'css':
      return css()
    default:
      return []
  }
}

function isIdentifierChar(value: string) {
  return /[A-Za-z0-9_$]/.test(value)
}

function isSymbolChar(value: string) {
  if (!value) return false
  return value === '-' || isIdentifierChar(value)
}

function collectMatches(text: string, query: string) {
  const matches: { from: number; to: number }[] = []
  if (!query) return matches
  let index = 0
  while (index < text.length) {
    const next = text.indexOf(query, index)
    if (next === -1) break
    const from = next
    const to = next + query.length
    const before = from > 0 ? text[from - 1] : ''
    const after = to < text.length ? text[to] : ''
    if (isIdentifierChar(before) || isIdentifierChar(after)) {
      index = to
      continue
    }
    matches.push({ from, to })
    index = to
  }
  return matches
}

function getSymbolAtPosition(doc: Text, pos: number) {
  let start = pos
  let end = pos
  while (start > 0) {
    const char = doc.sliceString(start - 1, start)
    if (!isSymbolChar(char)) break
    start -= 1
  }
  const length = doc.length
  while (end < length) {
    const char = doc.sliceString(end, end + 1)
    if (!isSymbolChar(char)) break
    end += 1
  }
  if (start === end) return null
  const symbol = doc.sliceString(start, end)
  if (!symbol.replace(/-/g, '').length) {
    return null
  }
  return symbol
}

function getSymbolRangeAtPosition(doc: Text, pos: number) {
  let start = pos
  let end = pos
  while (start > 0) {
    const char = doc.sliceString(start - 1, start)
    if (!isSymbolChar(char)) break
    start -= 1
  }
  const length = doc.length
  while (end < length) {
    const char = doc.sliceString(end, end + 1)
    if (!isSymbolChar(char)) break
    end += 1
  }
  if (start === end) return null
  const symbol = doc.sliceString(start, end)
  if (!symbol.replace(/-/g, '').length) {
    return null
  }
  return { from: start, to: end, text: symbol }
}

function positionFromLineCol(content: string, line: number, column: number) {
  const lines = content.split('\n')
  const clampedLine = Math.max(1, Math.min(line, lines.length))
  let offset = 0
  for (let i = 0; i < clampedLine - 1; i += 1) {
    offset += lines[i].length + 1
  }
  const clampedCol = Math.max(
    1,
    Math.min(column, lines[clampedLine - 1].length + 1)
  )
  return offset + clampedCol - 1
}

function rangeContains(
  range: SymbolInfo['range'],
  line: number,
  column: number
) {
  if (line < range.startLine || line > range.endLine) return false
  if (line === range.startLine && column < range.startCol) return false
  if (line === range.endLine && column > range.endCol) return false
  return true
}

function resolveSymbolMatch(
  symbols: SymbolInfo[],
  name: string,
  line: number,
  column: number
) {
  const matches = symbols.filter((symbol) => symbol.name === name)
  if (!matches.length) return null
  const direct = matches.find((symbol) =>
    rangeContains(symbol.range, line, column)
  )
  if (direct) return direct
  return matches.sort(
    (a, b) =>
      Math.abs(a.range.startLine - line) - Math.abs(b.range.startLine - line)
  )[0]
}

function getEligibleSymbolKind(name: string, outline: Outline | null) {
  if (!outline) return null
  if (outline.functions?.includes(name) || outline.hooks?.includes(name)) {
    return 'function' as const
  }
  if (outline.classes?.some((entry) => entry.name === name)) {
    return 'class' as const
  }
  if (outline.variables?.includes(name)) {
    return 'symbol' as const
  }
  if (
    outline.importSources?.includes(name) ||
    outline.importBindings?.includes(name) ||
    outline.imports?.includes(name)
  ) {
    return 'symbol' as const
  }
  if (outline.exports?.includes(name) || outline.exportSources?.includes(name)) {
    return 'symbol' as const
  }
  return null
}

function buildHighlightDecorations(view: EditorView, query: string) {
  const builder = new RangeSetBuilder<Decoration>()
  if (!query) return builder.finish()
  const matches = collectMatches(view.state.doc.toString(), query)
  matches.forEach(({ from, to }) => {
    builder.add(from, to, Decoration.mark({ class: 'cm-inspector-highlight' }))
  })
  return builder.finish()
}

function buildFlashDecorations(range: { from: number; to: number } | null) {
  const builder = new RangeSetBuilder<Decoration>()
  if (!range) return builder.finish()
  builder.add(
    range.from,
    range.to,
    Decoration.mark({ class: 'cm-inspector-flash' })
  )
  return builder.finish()
}

function createFlashExtension(range: { from: number; to: number } | null) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildFlashDecorations(range)
      }

      update(update: { view: EditorView }) {
        this.decorations = buildFlashDecorations(range)
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    }
  )
}

const activeIndexFacet = Facet.define<number | null, number | null>({
  combine: (values) => (values.length ? values[0] : null),
})

function createHighlightExtension(query: string) {
  if (!query.trim()) return []
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = buildHighlightDecorations(view, query)
        const activeIndex = view.state.facet(activeIndexFacet)
        if (activeIndex != null) {
          const matches = collectMatches(view.state.doc.toString(), query)
          const active = matches[activeIndex]
          if (active) {
            this.decorations = this.decorations.update({
              add: [
                Decoration.mark({ class: 'cm-inspector-highlight-active' }).range(
                  active.from,
                  active.to
                ),
              ],
            })
          }
        }
      }
      update(update: {
        view: EditorView
        docChanged: boolean
        startState: EditorView['state']
        state: EditorView['state']
      }) {
        const prevIndex = update.startState.facet(activeIndexFacet)
        const nextIndex = update.state.facet(activeIndexFacet)
        if (update.docChanged || prevIndex !== nextIndex) {
          this.decorations = buildHighlightDecorations(update.view, query)
          if (nextIndex != null) {
            const matches = collectMatches(update.view.state.doc.toString(), query)
            const active = matches[nextIndex]
            if (active) {
              this.decorations = this.decorations.update({
                add: [
                  Decoration.mark({ class: 'cm-inspector-highlight-active' }).range(
                    active.from,
                    active.to
                  ),
                ],
              })
            }
          }
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    }
  )
}

function createMarkersExtension(query: string) {
  if (!query.trim()) return []
  return ViewPlugin.fromClass(
    class {
      markers: HTMLDivElement
      constructor(view: EditorView) {
        this.markers = document.createElement('div')
        this.markers.className = 'cm-inspector-markers'
        view.dom.parentElement?.appendChild(this.markers)
        this.updateMarkers(view)
      }
      update(update: {
        view: EditorView
        docChanged: boolean
        geometryChanged: boolean
      }) {
        if (update.docChanged) {
          this.updateMarkers(update.view)
        }
      }
      updateMarkers(view: EditorView) {
        const text = view.state.doc.toString()
        const matches = collectMatches(text, query)
        const scrollRect = view.scrollDOM.getBoundingClientRect()
        const parent = this.markers.offsetParent as HTMLElement | null
        const parentRect = parent ? parent.getBoundingClientRect() : scrollRect
        const trackHeight = scrollRect.height
        const topOffset = scrollRect.top - parentRect.top
        const contentHeight = view.contentHeight || 1
        this.markers.style.height = `${trackHeight}px`
        this.markers.style.top = `${topOffset}px`
        this.markers.innerHTML = ''
        matches.forEach(({ from }) => {
          const lineTop = view.lineBlockAt(from).top
          const ratio = contentHeight <= 1 ? 0 : lineTop / contentHeight
          const marker = document.createElement('div')
          marker.className = 'cm-inspector-marker'
          marker.style.top = `${Math.round(ratio * trackHeight) + 16}px`
          this.markers.appendChild(marker)
        })
      }
      destroy() {
        this.markers.remove()
      }
    }
  )
}

function createInspectorExtensions(query: string, activeIndex?: number | null) {
  if (!query.trim()) return []
  return [
    activeIndexFacet.of(activeIndex ?? null),
    createHighlightExtension(query),
    createMarkersExtension(query),
  ]
}

// Main FileViewer component
export default function FileViewer({
  content,
  filePath,
  projectRoot,
  docSymbols = [],
  docOutline = null,
  overlayRequest,
  forcedLanguageId,
  onLanguageOverrideChange,
  highlightQuery,
  occurrenceIndex,
  focusRequest,
  onOccurrencesChange,
  onSymbolSelect,
  onOverlayUpdated,
}: Props) {
  const { theme, editorTheme } = useTheme()
  const extensions = useMemo(() => {
    const ext = getExtension(filePath)
    const resolvedLanguageId =
      forcedLanguageId ??
      (ext.length > 0 ? null : detectLanguageFromShebang(content)) ??
      null
    const lang = resolvedLanguageId
      ? getLanguageExtensionById(resolvedLanguageId)
      : getLanguageExtension(ext)
    return Array.isArray(lang) ? [] : [lang]
  }, [filePath, content, forcedLanguageId])

  const languageOptions = useMemo(
    () => LANGUAGE_DEFINITIONS,
    []
  )

  const [editorView, setEditorView] = useState<EditorView | null>(null)
  const [inlineToast, setInlineToast] = useState<string | null>(null)
  const [flashRange, setFlashRange] = useState<{ from: number; to: number } | null>(
    null
  )
  const [inlineOverlay, setInlineOverlay] = useState<{
    symbol: SymbolInfo
    overlayId: string | null
    raw: string
    title: string
    x: number
    y: number
  } | null>(null)
  const [inlineOverlayLoading, setInlineOverlayLoading] = useState(false)
  const editorWrapperRef = useRef<HTMLDivElement | null>(null)

  const highlightExtension = useMemo(
    () =>
      highlightQuery
        ? createInspectorExtensions(highlightQuery, occurrenceIndex)
        : [],
    [highlightQuery, occurrenceIndex]
  )
  const flashExtension = useMemo(
    () => createFlashExtension(flashRange),
    [flashRange]
  )

  const matches = useMemo(
    () => (highlightQuery ? collectMatches(content, highlightQuery) : []),
    [content, highlightQuery]
  )

  const showToast = useCallback((message: string) => {
    setInlineToast(message)
    window.setTimeout(() => setInlineToast(null), 1500)
  }, [])

  useEffect(() => {
    if (!flashRange) return
    const timer = window.setTimeout(() => setFlashRange(null), 1000)
    return () => window.clearTimeout(timer)
  }, [flashRange])

  useEffect(() => {
    onOccurrencesChange?.(matches.length)
  }, [matches.length, onOccurrencesChange])

  useEffect(() => {
    if (!editorView) return
    if (!matches.length || occurrenceIndex == null) return
    const clampedIndex = Math.min(
      Math.max(occurrenceIndex, 0),
      matches.length - 1
    )
    const match = matches[clampedIndex]
    window.requestAnimationFrame(() => {
      editorView.dispatch({
        selection: { anchor: match.from, head: match.from },
      })
      const domAtPos = editorView.domAtPos(match.from).node
      const node =
        domAtPos instanceof HTMLElement ? domAtPos : domAtPos.parentElement
      const line = node?.closest('.cm-line') as HTMLElement | null
      if (line) {
        line.scrollIntoView({ block: 'center', behavior: 'auto' })
        return
      }
      editorView.dispatch({
        effects: EditorView.scrollIntoView(match.from, { y: 'center' }),
      })
    })
  }, [editorView, matches, occurrenceIndex, focusRequest])


  const handleInlineOverlaySave = useCallback(async () => {
    if (!inlineOverlay || !projectRoot) return
    const parsed = parseLGDoc(inlineOverlay.raw)
    const overlay: Overlay = {
      id: inlineOverlay.overlayId ?? `${inlineOverlay.symbol.id}::${Date.now()}`,
      target: { type: 'symbol', symbolId: inlineOverlay.symbol.id },
      raw: inlineOverlay.raw,
      markdown: parsed.markdown,
      updatedAt: new Date().toISOString(),
    }
    const saved = await window.loadgic?.overlaysUpsert?.(projectRoot, overlay)
    if (saved) {
      setInlineOverlay((prev) =>
        prev ? { ...prev, overlayId: saved.id } : prev
      )
      onOverlayUpdated?.()
      showToast('Saved')
    }
  }, [inlineOverlay, projectRoot, onOverlayUpdated, showToast])

  const handleInlineOverlayDelete = useCallback(async () => {
    if (!inlineOverlay?.overlayId || !projectRoot) return
    await window.loadgic?.overlaysDelete?.(projectRoot, inlineOverlay.overlayId)
    setInlineOverlay(null)
    onOverlayUpdated?.()
    showToast('Deleted')
  }, [inlineOverlay, projectRoot, onOverlayUpdated, showToast])

  const setTitleInRaw = useCallback((rawValue: string, nextTitle: string) => {
    const lines = rawValue.split(/\r?\n/)
    const titleIndex = lines.findIndex((line) => line.trim().startsWith('@title'))
    if (titleIndex >= 0) {
      lines[titleIndex] = `@title ${nextTitle}`.trim()
      return lines.join('\n')
    }
    return [`@title ${nextTitle}`.trim(), ...lines].join('\n')
  }, [])

  const openInlineEditor = useCallback(
    async (symbol: SymbolInfo, coords: { x: number; y: number }) => {
      if (!projectRoot) {
        showToast('Open a project first.')
        return
      }
      const container = editorWrapperRef.current?.getBoundingClientRect()
      const panelWidth = 320
      const panelHeight = 360
      let nextX = coords.x
      let nextY = coords.y
      if (container) {
        const maxX = container.width - panelWidth - 12
        nextX = Math.max(12, Math.min(nextX, maxX))
        nextY = Math.max(12, nextY)
      }
      setInlineOverlayLoading(true)
      try {
        const overlays = await window.loadgic?.overlaysList?.(
          projectRoot,
          symbol.id
        )
        const existing = overlays?.[0] ?? null
        const raw = existing?.raw ?? `@title ${symbol.name}\n@summary `
        const title = parseLGDoc(raw).title ?? symbol.name
        setInlineOverlay({
          symbol,
          overlayId: existing?.id ?? null,
          raw,
          title,
          x: nextX,
          y: nextY,
        })
      } finally {
        setInlineOverlayLoading(false)
      }
    },
    [projectRoot, showToast]
  )

  useEffect(() => {
    if (!overlayRequest || !editorView) return
    const view = editorView
    const pos = view.posAtCoords({ x: overlayRequest.x, y: overlayRequest.y })
    if (pos == null) {
      showToast('No symbol found')
      return
    }
    const symbolRange = getSymbolRangeAtPosition(view.state.doc, pos)
    if (!symbolRange) {
      showToast('No symbol found')
      return
    }
    const line = view.state.doc.lineAt(pos)
    const match = resolveSymbolMatch(
      docSymbols,
      symbolRange.text,
      line.number,
      pos - line.from + 1
    )
    const eligibleKind = getEligibleSymbolKind(symbolRange.text, docOutline)
    if (!match && !eligibleKind) {
      showToast('Only available for imports/exports/classes/functions/hooks/variables')
      return
    }
    const resolvedMatch = match ?? (() => {
      const startLineInfo = view.state.doc.lineAt(symbolRange.from)
      const endLineInfo = view.state.doc.lineAt(symbolRange.to)
      return {
        id: `${filePath}::symbol::${symbolRange.text}::${startLineInfo.number}`,
        kind: eligibleKind ?? 'symbol',
        name: symbolRange.text,
        filePath,
        range: {
          startLine: startLineInfo.number,
          startCol: symbolRange.from - startLineInfo.from + 1,
          endLine: endLineInfo.number,
          endCol: symbolRange.to - endLineInfo.from + 1,
        },
      }
    })()
    const coords = editorWrapperRef.current?.getBoundingClientRect()
    const anchorX = coords ? overlayRequest.x - coords.left : overlayRequest.x
    const anchorY = coords ? overlayRequest.y - coords.top : overlayRequest.y
    const from = match
      ? positionFromLineCol(
          content,
          match.range.startLine,
          match.range.startCol
        )
      : symbolRange.from
    const to = match
      ? positionFromLineCol(
          content,
          match.range.endLine,
          match.range.endCol
        )
      : symbolRange.to
    setFlashRange({ from, to })
    openInlineEditor(resolvedMatch, { x: anchorX, y: anchorY })
  }, [
    overlayRequest?.nonce,
    editorView,
    docSymbols,
    docOutline,
    content,
    filePath,
    openInlineEditor,
    showToast,
  ])

  useEffect(() => {
    if (!editorView) return
    const view = editorView
    const onSelect = onSymbolSelect

    function handleModifierClick(event: MouseEvent) {
      const isModifierPressed = event.ctrlKey || event.metaKey
      if (!isModifierPressed || event.button !== 0) return
      const pos = view.posAtCoords({
        x: event.clientX,
        y: event.clientY,
      })
      if (pos == null) return
      const { state } = view
      const selection = state.selection
      for (const range of selection.ranges) {
        if (
          !range.empty &&
          pos >= range.from &&
          pos <= range.to &&
          range.to <= state.doc.length
        ) {
          const selectedText = state.sliceDoc(range.from, range.to).trim()
          if (selectedText.length) {
            event.preventDefault()
            const line = state.doc.lineAt(range.from)
            const matches = collectMatches(state.doc.toString(), selectedText)
            const occurrenceIndex = matches.findIndex(
              (match) => range.from >= match.from && range.from <= match.to
            )
            onSelect?.({
              symbol: selectedText,
              line: line.number,
              column: range.from - line.from + 1,
              occurrenceIndex: occurrenceIndex >= 0 ? occurrenceIndex : undefined,
            })
            // Keep ctrl/meta click for selection only (no editor popup)
            return
          }
        }
      }
      const symbol = getSymbolAtPosition(view.state.doc, pos)
      if (!symbol) return
      event.preventDefault()
      const line = view.state.doc.lineAt(pos)
      const matches = collectMatches(view.state.doc.toString(), symbol)
      const occurrenceIndex = matches.findIndex(
        (match) => pos >= match.from && pos <= match.to
      )
      onSelect?.({
        symbol,
        line: line.number,
        column: pos - line.from + 1,
        occurrenceIndex: occurrenceIndex >= 0 ? occurrenceIndex : undefined,
      })
      // Keep ctrl/meta click for selection only (no editor popup)
    }

    const dom = view.dom
    dom.addEventListener('mousedown', handleModifierClick)
    return () => {
      dom.removeEventListener('mousedown', handleModifierClick)
    }
  }, [editorView, onSymbolSelect])


  return (
    <div className="file-viewer-shell" ref={editorWrapperRef}>
      <CodeMirror
        value={content}
        theme={getEditorTheme(editorTheme, theme === 'dark')}
        extensions={[...extensions, highlightExtension, flashExtension]}
        readOnly
        editable={false}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
        }}
        onCreateEditor={(view) => {
          setEditorView(view)
        }}
      />
      {inlineToast ? (
        <div className="inline-overlay-toast">{inlineToast}</div>
      ) : null}
      {inlineOverlay ? (
        <div
          className="inline-overlay-editor"
          style={{ left: inlineOverlay.x, top: inlineOverlay.y }}
        >
          <div className="inline-overlay-header">
            <div className="inline-overlay-title">Loadgic details</div>
            <button
              type="button"
              className="inline-overlay-close"
              onClick={() => setInlineOverlay(null)}
            >
              ✕
            </button>
          </div>
          <div className="inline-overlay-meta">
            {inlineOverlay.symbol.name} · {inlineOverlay.symbol.kind}
          </div>
          {inlineOverlayLoading ? (
            <div className="inline-overlay-text">Loading…</div>
          ) : (
            <>
              <input
                className="inline-overlay-input"
                value={inlineOverlay.title}
                onChange={(event) => {
                  const nextTitle = event.target.value
                  setInlineOverlay((prev) =>
                    prev
                      ? {
                          ...prev,
                          title: nextTitle,
                          raw: setTitleInRaw(prev.raw, nextTitle),
                        }
                      : prev
                  )
                }}
                placeholder="Title"
              />
              <textarea
                className="inline-overlay-textarea"
                value={inlineOverlay.raw}
                onChange={(event) => {
                  const nextRaw = event.target.value
                  const parsed = parseLGDoc(nextRaw)
                  setInlineOverlay((prev) =>
                    prev
                      ? {
                          ...prev,
                          raw: nextRaw,
                          title: parsed.title ?? prev.title,
                        }
                      : prev
                  )
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setInlineOverlay(null)
                  }
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault()
                    handleInlineOverlaySave()
                  }
                }}
                placeholder="@title ...\n@summary ...\n@param name ...\n@returns ...\n@example\n..."
              />
              <div className="inline-overlay-preview">
                <div className="inline-overlay-preview-title">Preview</div>
                <DocRenderer markdown={parseLGDoc(inlineOverlay.raw).markdown} />
              </div>
              <div className="inline-overlay-actions">
                <button
                  type="button"
                  className="inline-overlay-action"
                  onClick={handleInlineOverlaySave}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="inline-overlay-action"
                  onClick={() => setInlineOverlay(null)}
                >
                  Cancel
                </button>
                {inlineOverlay.overlayId ? (
                  <button
                    type="button"
                    className="inline-overlay-action danger"
                    onClick={handleInlineOverlayDelete}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
