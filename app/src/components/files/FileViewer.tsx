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
  type Range,
  type Extension,
  type Text,
} from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
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

function positionFromLineColInDoc(doc: Text, line: number, column: number) {
  const safeLine = Math.max(1, Math.min(line, doc.lines))
  const info = doc.line(safeLine)
  const safeCol = Math.max(1, Math.min(column, info.length + 1))
  return info.from + safeCol - 1
}

function getCollapsedPreview(markdown: string) {
  const line = markdown
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length)
  return line ?? 'Loadgic details'
}

function formatOverlayLabel(value: string) {
  const firstLine =
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length) ?? ''
  const cleaned = firstLine.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Selection'

  const patterns: Array<{ re: RegExp; label: (m: RegExpExecArray) => string }> =
    [
      {
        re: /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/i,
        label: (m) => `function ${m[1]}`,
      },
      {
        re: /^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/i,
        label: (m) => `class ${m[1]}`,
      },
      {
        re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/i,
        label: (m) => `function ${m[1]}`,
      },
      {
        re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(/i,
        label: (m) => `function ${m[1]}`,
      },
      {
        re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/i,
        label: (m) => m[1],
      },
    ]

  for (const { re, label } of patterns) {
    const match = re.exec(cleaned)
    if (match) return label(match)
  }

  if (cleaned.length <= 64) return cleaned
  return `${cleaned.slice(0, 61)}…`
}

function getPosFromClientPoint(view: EditorView, x: number, y: number) {
  const rangeFromPoint = document.caretRangeFromPoint?.(x, y)
  if (rangeFromPoint && view.dom.contains(rangeFromPoint.startContainer)) {
    return view.posAtDOM(rangeFromPoint.startContainer, rangeFromPoint.startOffset)
  }
  const caretPosition = (document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => {
      offsetNode: Node
      offset: number
    } | null
  }).caretPositionFromPoint?.(x, y)
  if (caretPosition && view.dom.contains(caretPosition.offsetNode)) {
    return view.posAtDOM(caretPosition.offsetNode, caretPosition.offset)
  }
  return view.posAtCoords({ x, y })
}

function createOverlayId(target: Overlay['target']) {
  if (target.type === 'symbol') {
    return `${target.symbolId}::${Date.now()}`
  }
  const { range } = target
  return `${target.filePath}::range::${range.startLine}:${range.startCol}-${range.endLine}:${range.endCol}`
}

type EditorOverlay = {
  overlay: Overlay
  range: {
    startLine: number
    startCol: number
    endLine: number
    endCol: number
  }
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
      eventHandlers: {
        'overlay-title': (event) => {
          const detail = (event as CustomEvent<string>).detail ?? ''
          setInlineOverlay((prev) =>
            prev
              ? {
                  ...prev,
                  title: detail,
                  raw: setTitleInRaw(prev.raw, detail),
                }
              : prev
          )
        },
        'overlay-raw': (event) => {
          const detail = (event as CustomEvent<string>).detail ?? ''
          const parsed = parseLGDoc(detail)
          setInlineOverlay((prev) =>
            prev
              ? {
                  ...prev,
                  raw: detail,
                  title: parsed.title ?? prev.title,
                }
              : prev
          )
        },
        'overlay-save': () => {
          handleInlineOverlaySave()
        },
        'overlay-cancel': () => {
          overlayDraftRef.current = null
          setInlineOverlay(null)
        },
        'overlay-delete': () => {
          handleInlineOverlayDelete()
        },
      },
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
          marker.style.top = `${Math.round(ratio * trackHeight)}px`
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

class RangeOverlayWidget extends WidgetType {
  constructor(
    private overlay: Overlay,
    private collapsed: boolean,
    private onToggle: (overlayId: string) => void,
    private onEdit: (overlay: Overlay, rect: DOMRect) => void,
    private editingOverlay: {
      overlay: Overlay
      label: string
      kind?: string
      raw: string
      title: string
    } | null,
    private onTitleChange: (next: string) => void,
    private onRawChange: (next: string) => void,
    private onSave: () => void,
    private onCancel: () => void,
    private onDelete: () => void
  ) {
    super()
  }

  toDOM() {
    const wrap = document.createElement('div')
    const isEditing = this.editingOverlay?.overlay.id === this.overlay.id
    wrap.className = `cm-overlay-block${this.collapsed ? ' collapsed' : ''}${
      isEditing ? ' editing' : ''
    }`
    wrap.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
    })
    wrap.addEventListener('mousedown', (event) => {
      event.stopPropagation()
    })
    wrap.addEventListener('click', (event) => {
      event.stopPropagation()
    })

    if (isEditing && this.editingOverlay) {
      const header = document.createElement('div')
      header.className = 'cm-overlay-header'
      const title = document.createElement('div')
      title.className = 'cm-overlay-title'
      title.textContent = 'Loadgic details'
      header.append(title)
      wrap.append(header)

      const input = document.createElement('input')
      input.className = 'cm-overlay-input'
      input.value = this.editingOverlay.title
      input.addEventListener('input', () => {
        this.onTitleChange(input.value)
      })
      input.addEventListener('mousedown', (event) => {
        event.stopPropagation()
      })
      input.addEventListener('click', (event) => {
        event.stopPropagation()
      })
      input.addEventListener('keydown', (event) => {
        event.stopPropagation()
      })
      input.addEventListener('keyup', (event) => {
        event.stopPropagation()
      })

      const textarea = document.createElement('textarea')
      textarea.className = 'cm-overlay-textarea'
      textarea.value = this.editingOverlay.raw
      textarea.addEventListener('input', () => {
        this.onRawChange(textarea.value)
      })
      textarea.addEventListener('mousedown', (event) => {
        event.stopPropagation()
      })
      textarea.addEventListener('click', (event) => {
        event.stopPropagation()
      })
      textarea.addEventListener('keydown', (event) => {
        event.stopPropagation()
      })
      textarea.addEventListener('keyup', (event) => {
        event.stopPropagation()
      })

      const actions = document.createElement('div')
      actions.className = 'cm-overlay-actions'
      const save = document.createElement('button')
      save.type = 'button'
      save.className = 'cm-overlay-edit'
      save.textContent = 'Save'
      save.addEventListener('click', (event) => {
        event.stopPropagation()
        this.onSave()
      })
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = 'cm-overlay-edit'
      cancel.textContent = 'Cancel'
      cancel.addEventListener('click', (event) => {
        event.stopPropagation()
        this.onCancel()
      })
      actions.append(save, cancel)
      if (this.overlay.id) {
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'cm-overlay-edit'
        remove.textContent = 'Delete'
        remove.addEventListener('click', (event) => {
          event.stopPropagation()
          this.onDelete()
        })
        actions.append(remove)
      }

      wrap.append(input, textarea, actions)
      return wrap
    }

    const header = document.createElement('div')
    header.className = 'cm-overlay-header'

    const title = document.createElement('div')
    title.className = 'cm-overlay-title'
    title.textContent = getCollapsedPreview(this.overlay.markdown)

    const actions = document.createElement('div')
    actions.className = 'cm-overlay-actions'

    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'cm-overlay-toggle'
    toggle.textContent = this.collapsed ? '▸' : '▾'
    toggle.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      this.onToggle(this.overlay.id)
    })
    toggle.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    })

    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'cm-overlay-edit'
    edit.textContent = 'Edit'
    const triggerEdit = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      this.onEdit(this.overlay, wrap.getBoundingClientRect())
    }
    edit.addEventListener('pointerdown', triggerEdit)
    edit.addEventListener('click', triggerEdit)

    actions.append(toggle, edit)
    header.append(title, actions)
    wrap.append(header)

    if (!this.collapsed) {
      const body = document.createElement('div')
      body.className = 'cm-overlay-body'
      body.textContent = this.overlay.markdown
      wrap.append(body)
    }

    return wrap
  }

  eq(other: RangeOverlayWidget) {
    const thisEditing = this.editingOverlay?.overlay.id === this.overlay.id
    const otherEditing = other.editingOverlay?.overlay.id === other.overlay.id
    const editingContentMatches =
      !thisEditing ||
      (other.editingOverlay?.raw === this.editingOverlay?.raw &&
        other.editingOverlay?.title === this.editingOverlay?.title)
    return (
      other.overlay.id === this.overlay.id &&
      other.overlay.markdown === this.overlay.markdown &&
      other.collapsed === this.collapsed &&
      thisEditing === otherEditing &&
      editingContentMatches
    )
  }

  ignoreEvent() {
    return true
  }
}

function createRangeOverlayExtension(
  overlays: EditorOverlay[],
  collapsedIds: Set<string>,
  onToggle: (overlayId: string) => void,
  onEdit: (overlay: Overlay, rect: DOMRect) => void,
  editingOverlay: {
    overlay: Overlay
    label: string
    kind?: string
    raw: string
    title: string
  } | null,
  onTitleChange: (next: string) => void,
  onRawChange: (next: string) => void,
  onSave: () => void,
  onCancel: () => void,
  onDelete: () => void
) {
  if (!overlays.length) return []
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view)
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view)
        }
      }
      buildDecorations(view: EditorView) {
        const builder: Range<Decoration>[] = []
        overlays.forEach(({ overlay, range }) => {
          const from = positionFromLineColInDoc(
            view.state.doc,
            range.startLine,
            range.startCol
          )
          const to = positionFromLineColInDoc(
            view.state.doc,
            range.endLine,
            range.endCol
          )
          if (from >= to) return
          const isCollapsed = collapsedIds.has(overlay.id)
          if (!isCollapsed && editingOverlay?.overlay.id !== overlay.id) {
            builder.push(
              Decoration.mark({ class: 'cm-overlay-range' }).range(from, to)
            )
          }
          const widget = new RangeOverlayWidget(
            overlay,
            isCollapsed,
            onToggle,
            onEdit,
            editingOverlay,
            onTitleChange,
            onRawChange,
            onSave,
            onCancel,
            onDelete
          )
          builder.push(
            Decoration.widget({
              widget,
              side: -1,
            }).range(from)
          )
        })
        return Decoration.set(builder, true)
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    }
  )
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
    overlay: Overlay
    label: string
    kind?: string
    raw: string
    title: string
    range: {
      startLine: number
      startCol: number
      endLine: number
      endCol: number
    }
  } | null>(null)
  const overlayDraftRef = useRef<{ title: string; raw: string } | null>(null)
  const [inlineOverlayLoading, setInlineOverlayLoading] = useState(false)
  const editorWrapperRef = useRef<HTMLDivElement | null>(null)
  const [rangeOverlays, setRangeOverlays] = useState<EditorOverlay[]>([])
  const [collapsedOverlays, setCollapsedOverlays] = useState<Set<string>>(
    () => new Set()
  )

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

  const refreshRangeOverlays = useCallback(async () => {
    if (!projectRoot) {
      setRangeOverlays([])
      return
    }
    const overlays = await window.loadgic?.overlaysList?.(projectRoot)
    const next: EditorOverlay[] = []
    overlays?.forEach((overlay) => {
      if (overlay.target.type === 'range') {
        if (overlay.target.filePath !== filePath) return
        next.push({ overlay, range: overlay.target.range })
        return
      }
      if (overlay.target.type === 'symbol') {
        const match = docSymbols.find(
          (symbol) => symbol.id === overlay.target.symbolId
        )
        if (!match || match.filePath !== filePath) return
        next.push({ overlay, range: match.range })
      }
    })
    setRangeOverlays(next)
  }, [projectRoot, filePath, docSymbols])

  useEffect(() => {
    refreshRangeOverlays()
  }, [refreshRangeOverlays])

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
    const draft = overlayDraftRef.current
    const raw = draft?.raw ?? inlineOverlay.raw
    const parsed = parseLGDoc(raw)
    const overlay: Overlay = {
      ...inlineOverlay.overlay,
      raw,
      markdown: parsed.markdown,
      updatedAt: new Date().toISOString(),
    }
    const saved = await window.loadgic?.overlaysUpsert?.(projectRoot, overlay)
    if (saved) {
      setInlineOverlay(null)
      overlayDraftRef.current = null
      refreshRangeOverlays()
      onOverlayUpdated?.()
      showToast('Saved')
    }
  }, [
    inlineOverlay,
    projectRoot,
    refreshRangeOverlays,
    onOverlayUpdated,
    showToast,
  ])

  const handleInlineOverlayDelete = useCallback(async () => {
    if (!inlineOverlay?.overlay.id || !projectRoot) return
    await window.loadgic?.overlaysDelete?.(projectRoot, inlineOverlay.overlay.id)
    setInlineOverlay(null)
    overlayDraftRef.current = null
    refreshRangeOverlays()
    onOverlayUpdated?.()
    showToast('Deleted')
  }, [
    inlineOverlay,
    projectRoot,
    refreshRangeOverlays,
    onOverlayUpdated,
    showToast,
  ])

  const setTitleInRaw = useCallback((rawValue: string, nextTitle: string) => {
    const lines = rawValue.split(/\r?\n/)
    const titleIndex = lines.findIndex((line) => line.trim().startsWith('@title'))
    if (titleIndex >= 0) {
      lines[titleIndex] = `@title ${nextTitle}`.trim()
      return lines.join('\n')
    }
    return [`@title ${nextTitle}`.trim(), ...lines].join('\n')
  }, [])

  const handleOverlayTitleChange = useCallback(
    (nextTitle: string) => {
      const current = overlayDraftRef.current
      if (current) {
        current.title = nextTitle
        current.raw = setTitleInRaw(current.raw, nextTitle)
        return
      }
      overlayDraftRef.current = {
        title: nextTitle,
        raw: setTitleInRaw(inlineOverlay?.raw ?? '', nextTitle),
      }
    },
    [inlineOverlay?.raw, setTitleInRaw]
  )

  const handleOverlayRawChange = useCallback((nextRaw: string) => {
    const parsed = parseLGDoc(nextRaw)
    const current = overlayDraftRef.current
    if (current) {
      current.raw = nextRaw
      current.title = parsed.title ?? current.title
      return
    }
    overlayDraftRef.current = {
      raw: nextRaw,
      title: parsed.title ?? inlineOverlay?.title ?? '',
    }
  }, [])

  const openInlineEditor = useCallback(
    async (
      target: Overlay['target'],
      label: string,
      kind: string | undefined,
      range: {
        startLine: number
        startCol: number
        endLine: number
        endCol: number
      }
    ) => {
      if (!projectRoot) {
        showToast('Open a project first.')
        return
      }
      setInlineOverlayLoading(true)
      try {
        const overlays = await window.loadgic?.overlaysList?.(projectRoot)
        let existing: Overlay | null = null
        if (target.type === 'symbol') {
          existing =
            overlays?.find(
              (overlay) =>
                overlay.target.type === 'symbol' &&
                overlay.target.symbolId === target.symbolId
            ) ?? null
        } else {
          existing =
            overlays?.find((overlay) => {
              if (overlay.target.type !== 'range') return false
              if (overlay.target.filePath !== target.filePath) return false
              const a = overlay.target.range
              const b = target.range
              return (
                a.startLine === b.startLine &&
                a.startCol === b.startCol &&
                a.endLine === b.endLine &&
                a.endCol === b.endCol
              )
            }) ?? null
        }
        const raw = existing?.raw ?? `@title ${label}\n@summary `
        const title = parseLGDoc(raw).title ?? label
        const next = {
          overlay:
            existing ??
            ({
              id: createOverlayId(target),
              target,
              raw,
              markdown: parseLGDoc(raw).markdown,
              updatedAt: new Date().toISOString(),
            } as Overlay),
          label,
          kind,
          raw,
          title,
          range,
        }
        overlayDraftRef.current = { title: next.title, raw: next.raw }
        setInlineOverlay(next)
      } finally {
        setInlineOverlayLoading(false)
      }
    },
    [projectRoot, showToast]
  )

  const openInlineEditorFromOverlay = useCallback(
    (
      overlay: Overlay,
      label: string,
      kind: string | undefined,
      range: {
        startLine: number
        startCol: number
        endLine: number
        endCol: number
      }
    ) => {
      const raw = overlay.raw
      const title = parseLGDoc(raw).title ?? label
      const next = {
        overlay,
        label,
        kind,
        raw,
        title,
        range,
      }
      overlayDraftRef.current = { title: next.title, raw: next.raw }
      setInlineOverlay(next)
    },
    []
  )

  const handleToggleRangeOverlay = useCallback((overlayId: string) => {
    setCollapsedOverlays((prev) => {
      const next = new Set(prev)
      if (next.has(overlayId)) {
        next.delete(overlayId)
      } else {
        next.add(overlayId)
      }
      return next
    })
  }, [])

  const handleEditRangeOverlay = useCallback(
    (overlay: Overlay, rect: DOMRect) => {
      const coords = editorWrapperRef.current?.getBoundingClientRect()
      const parsed = parseLGDoc(overlay.raw)
      const fallbackLabel = parsed.title ?? getCollapsedPreview(overlay.markdown)

      if (overlay.target.type === 'range') {
        openInlineEditorFromOverlay(
          overlay,
          fallbackLabel,
          'selection',
          overlay.target.range
        )
        return
      }

      if (overlay.target.type === 'symbol') {
        const match = docSymbols.find(
          (symbol) => symbol.id === overlay.target.symbolId
        )
        if (!match) {
          showToast('Symbol not found')
          return
        }
        openInlineEditorFromOverlay(
          overlay,
          match.name,
          match.kind,
          match.range
        )
      }
    },
    [openInlineEditorFromOverlay, docSymbols, showToast]
  )

  const rangeOverlayExtension = useMemo(() => {
    const overlays = [...rangeOverlays]
    if (inlineOverlay) {
      const existingIndex = overlays.findIndex(
        (item) => item.overlay.id === inlineOverlay.overlay.id
      )
      const updatedOverlay: EditorOverlay = {
        overlay: {
          ...inlineOverlay.overlay,
          raw: inlineOverlay.raw,
          markdown: parseLGDoc(inlineOverlay.raw).markdown,
        },
        range: inlineOverlay.range,
      }
      if (existingIndex >= 0) {
        overlays[existingIndex] = updatedOverlay
      } else {
        overlays.unshift(updatedOverlay)
      }
    }
    return createRangeOverlayExtension(
      overlays,
      collapsedOverlays,
      handleToggleRangeOverlay,
      handleEditRangeOverlay,
      inlineOverlay,
      handleOverlayTitleChange,
      handleOverlayRawChange,
      handleInlineOverlaySave,
      () => {
        overlayDraftRef.current = null
        setInlineOverlay(null)
      },
      handleInlineOverlayDelete
    )
  }, [
    rangeOverlays,
    inlineOverlay,
    collapsedOverlays,
    handleToggleRangeOverlay,
    handleEditRangeOverlay,
    handleOverlayTitleChange,
    handleOverlayRawChange,
    handleInlineOverlaySave,
    handleInlineOverlayDelete,
  ])

  useEffect(() => {
    if (!overlayRequest || !editorView) return
    const view = editorView
    const pos = getPosFromClientPoint(
      view,
      overlayRequest.x,
      overlayRequest.y
    )
    if (pos == null) {
      showToast('No symbol found')
      return
    }
    const selection = view.state.selection.main
    if (!selection.empty) {
      const selectionText = view.state.doc.sliceString(
        selection.from,
        selection.to
      )
      const label = formatOverlayLabel(selectionText)
      const startLineInfo = view.state.doc.lineAt(selection.from)
      const endLineInfo = view.state.doc.lineAt(selection.to)
      const target: Overlay['target'] = {
        type: 'range',
        filePath,
        range: {
          startLine: startLineInfo.number,
          startCol: selection.from - startLineInfo.from + 1,
          endLine: endLineInfo.number,
          endCol: selection.to - endLineInfo.from + 1,
        },
      }
      setFlashRange({ from: selection.from, to: selection.to })
      openInlineEditor(target, label, 'selection', target.range)
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
    openInlineEditor(
      { type: 'symbol', symbolId: resolvedMatch.id },
      resolvedMatch.name,
      resolvedMatch.kind,
      resolvedMatch.range
    )
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
      const pos = getPosFromClientPoint(
        view,
        event.clientX,
        event.clientY
      )
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
        extensions={[
          ...extensions,
          highlightExtension,
          flashExtension,
          rangeOverlayExtension,
        ]}
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
      {inlineOverlayLoading ? (
        <div className="inline-overlay-toast">Loading…</div>
      ) : null}
    </div>
  )
}
