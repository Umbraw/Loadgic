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
import { useEffect, useMemo, useState } from 'react'
import { RangeSetBuilder, type Extension, type Text } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import { useTheme } from '../../theme/ThemeProvider'

// Props for FileViewer component
type Props = {
  content: string
  filePath: string
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

function buildHighlightDecorations(view: EditorView, query: string) {
  const builder = new RangeSetBuilder<Decoration>()
  if (!query) return builder.finish()
  const matches = collectMatches(view.state.doc.toString(), query)
  matches.forEach(({ from, to }) => {
    builder.add(from, to, Decoration.mark({ class: 'cm-inspector-highlight' }))
  })
  return builder.finish()
}

function createHighlightExtension(query: string, activeIndex?: number | null) {
  if (!query.trim()) return []
  return ViewPlugin.fromClass(
    class {
      decorations
      constructor(view: EditorView) {
        this.decorations = buildHighlightDecorations(view, query)
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
      update(update: { view: EditorView; docChanged: boolean }) {
        if (update.docChanged) {
          this.decorations = buildHighlightDecorations(update.view, query)
          if (activeIndex != null) {
            const matches = collectMatches(update.view.state.doc.toString(), query)
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
    createHighlightExtension(query, activeIndex),
    createMarkersExtension(query),
  ]
}

// Main FileViewer component
export default function FileViewer({
  content,
  filePath,
  highlightQuery,
  occurrenceIndex,
  focusRequest,
  onOccurrencesChange,
  onSymbolSelect,
}: Props) {
  const { theme, editorTheme } = useTheme()
  const extensions = useMemo(() => {
    const ext = getExtension(filePath)
    const lang = getLanguageExtension(ext)
    return Array.isArray(lang) ? [] : [lang]
  }, [filePath])

  const [editorView, setEditorView] = useState<EditorView | null>(null)

  const highlightExtension = useMemo(
    () =>
      highlightQuery
        ? createInspectorExtensions(highlightQuery, occurrenceIndex)
        : [],
    [highlightQuery, occurrenceIndex]
  )

  const matches = useMemo(
    () => (highlightQuery ? collectMatches(content, highlightQuery) : []),
    [content, highlightQuery]
  )

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


  useEffect(() => {
    if (!editorView || !onSymbolSelect) return
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
            onSelect({
              symbol: selectedText,
              line: line.number,
              column: range.from - line.from + 1,
              occurrenceIndex: occurrenceIndex >= 0 ? occurrenceIndex : undefined,
            })
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
      onSelect({
        symbol,
        line: line.number,
        column: pos - line.from + 1,
        occurrenceIndex: occurrenceIndex >= 0 ? occurrenceIndex : undefined,
      })
    }

    const dom = view.dom
    dom.addEventListener('mousedown', handleModifierClick)
    return () => {
      dom.removeEventListener('mousedown', handleModifierClick)
    }
  }, [editorView, onSymbolSelect])

  return (
    <CodeMirror
      value={content}
      theme={getEditorTheme(editorTheme, theme === 'dark')}
      extensions={[...extensions, highlightExtension]}
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
  )
}
