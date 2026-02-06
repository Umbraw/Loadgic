import Sidebar from './components/sidebar/ActivityBar'
import SidePanel from './components/sidebar/SidePanel'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ViewMode } from './types/view'
import type { ProjectNode } from './types/project'
import type { FileContent } from './types/file'
import appLogo from './assets/logo/logo_512_512.png'
import FileViewer from './components/files/FileViewer'
import DocRenderer from './components/files/DocRenderer'
import LogicView from './components/logic/LogicView'
import type { LogicViewHandle } from './components/logic/LogicView'
import InspectorPanel from './components/inspector/InspectorPanel'
import {
  LANGUAGE_DEFINITIONS,
  type LanguageId,
} from './analyzers/languages'
import type { SymbolInfo } from './analyzers/types'
import type { Overlay } from './types/overlay'
import { useTheme } from './theme/ThemeProvider'
import { parseLGDoc } from './utils/lgdoc'

const SIDEBAR_WIDTH = 54
const MIN_PANEL_WIDTH = 220
const MIN_INSPECTOR_WIDTH = 265
const COLLAPSE_THRESHOLD = 140
const MIN_CONTENT_WIDTH = 200

function isIdentifierChar(value: string) {
  return /[A-Za-z0-9_$]/.test(value)
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

function positionFromLineCol(content: string, line: number, column: number) {
  if (!content) return 0
  const lines = content.split('\n')
  const clampedLine = Math.max(1, Math.min(line, lines.length))
  let offset = 0
  for (let i = 0; i < clampedLine - 1; i += 1) {
    offset += lines[i].length + 1
  }
  const clampedCol = Math.max(1, Math.min(column, lines[clampedLine - 1].length + 1))
  return offset + clampedCol - 1
}

function App() {
  const { analysisSettings } = useTheme()
  const [activeView, setActiveView] = useState<ViewMode>('files')
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  const [panelWidth, setPanelWidth] = useState(320)
  const [isInspectorOpen, setIsInspectorOpen] = useState(true)
  const [inspectorWidth, setInspectorWidth] = useState(280)
  const [logicRevealKey, setLogicRevealKey] = useState(0)
  const [projectRoot, setProjectRoot] = useState<string | null>(null)
  const [projectTree, setProjectTree] = useState<ProjectNode | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [selectedFileContent, setSelectedFileContent] = useState<FileContent | null>(
    null
  )
  const [settingsMenu, setSettingsMenu] = useState<{ x: number; y: number } | null>(
    null
  )
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: { label: string; action: () => void }[]
  } | null>(null)
  const [highlightQuery, setHighlightQuery] = useState<string | null>(null)
  const [highlightTotal, setHighlightTotal] = useState(0)
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null)
  const [highlightRequest, setHighlightRequest] = useState(0)
  const [fileViewTab, setFileViewTab] = useState<'code' | 'docs'>('code')
  const [fileDocSymbols, setFileDocSymbols] = useState<SymbolInfo[]>([])
  const [fileDocLoading, setFileDocLoading] = useState(false)
  const fileDocWorkerRef = useRef<Worker | null>(null)
  const fileDocReqRef = useRef(0)
  const [fileDocSelectedId, setFileDocSelectedId] = useState<string | null>(null)
  const fileDocContentRef = useRef<HTMLDivElement | null>(null)
  const [docOverlays, setDocOverlays] = useState<Overlay[]>([])
  const [docOverlayLoading, setDocOverlayLoading] = useState(false)
  const [docOverlayEditingId, setDocOverlayEditingId] = useState<string | null>(
    null
  )
  const [docOverlayRaw, setDocOverlayRaw] = useState('')
  const [docOverlayIsEditing, setDocOverlayIsEditing] = useState(false)
  const [inspectorExternalDetail, setInspectorExternalDetail] = useState<{
    value: string
    line?: number
    column?: number
    occurrenceIndex?: number
    nonce: number
  } | null>(null)
  const [inspectorSearch, setInspectorSearch] = useState('')
  const [languageOverrides, setLanguageOverrides] = useState<
    Record<string, LanguageId>
  >(() => {
    try {
      const stored = window.localStorage.getItem('loadgic:languageOverrides')
      return stored ? (JSON.parse(stored) as Record<string, LanguageId>) : {}
    } catch {
      return {}
    }
  })
  const settingsMenuRef = useRef<HTMLDivElement | null>(null)
  const suppressContextCloseRef = useRef(false)
  const logicViewRef = useRef<LogicViewHandle | null>(null)
  const skipHighlightResetRef = useRef(false)
  const isResizingRef = useRef(false)
  const isInspectorResizingRef = useRef(false)
  const panelWidthRef = useRef(panelWidth)
  const isPanelOpenRef = useRef(isPanelOpen)
  const lastOpenWidthRef = useRef(panelWidth)
  const inspectorWidthRef = useRef(inspectorWidth)
  const isInspectorOpenRef = useRef(isInspectorOpen)
  const lastInspectorWidthRef = useRef(inspectorWidth)
  const loadingDirsRef = useRef<Set<string>>(new Set())
  const [expandedTreeDirs, setExpandedTreeDirs] = useState<Set<string>>(
    () => new Set()
  )
  const fullTreeLoadedRef = useRef<string | null>(null)
  const fullTreeLoadingRef = useRef(false)
  const selectedLanguageOverride = selectedFilePath
    ? languageOverrides[selectedFilePath] ?? null
    : null
  const selectedDocSymbol = fileDocSelectedId
    ? fileDocSymbols.find((symbol) => symbol.id === fileDocSelectedId) ?? null
    : null
  const docSymbolNameMap = useMemo(() => {
    if (!fileDocSymbols.length) return {}
    return fileDocSymbols.reduce<Record<string, string>>((acc, symbol) => {
      acc[symbol.id] = symbol.name
      return acc
    }, {})
  }, [fileDocSymbols])
  const overlayPreview = useMemo(() => {
    if (!docOverlayIsEditing) return null
    return parseLGDoc(docOverlayRaw).markdown
  }, [docOverlayIsEditing, docOverlayRaw])
  const combinedDocMarkdown = useMemo(() => {
    const base = selectedDocSymbol?.doc?.markdown ?? ''
    const overlayMarkdown = docOverlays
      .map((overlay) => overlay.markdown || parseLGDoc(overlay.raw).markdown)
      .filter(Boolean)
      .join('\n\n---\n\n')
    const draft = docOverlayIsEditing && overlayPreview ? overlayPreview : ''
    const mergedOverlay = [overlayMarkdown, draft].filter(Boolean).join('\n\n---\n\n')
    if (!mergedOverlay) return base
    if (!base) return mergedOverlay
    return `${base}\n\n${mergedOverlay}`
  }, [selectedDocSymbol, docOverlays, docOverlayIsEditing, overlayPreview])
  const docHasTitleHeading = useMemo(() => {
    if (!combinedDocMarkdown) return false
    const firstLine = combinedDocMarkdown
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0)
    return !!firstLine && /^#{1,6}\s+/.test(firstLine)
  }, [combinedDocMarkdown])

  // Select active view
  function selectView(next: ViewMode) {
    setActiveView((prev) => {
      if (prev === next) {
        setIsPanelOpen((open) => (open ? open : true))
        return prev
      }
      setIsPanelOpen(true)
      return next
    })
  }

  const handleLanguageOverrideChange = useCallback(
    (next: LanguageId | null) => {
      if (!selectedFilePath) return
      setLanguageOverrides((prev) => {
        const updated = { ...prev }
        if (!next) {
          delete updated[selectedFilePath]
        } else {
          updated[selectedFilePath] = next
        }
        return updated
      })
    },
    [selectedFilePath]
  )

  useEffect(() => {
    panelWidthRef.current = panelWidth
  }, [panelWidth])

  useEffect(() => {
    inspectorWidthRef.current = inspectorWidth
  }, [inspectorWidth])

  useEffect(() => {
    isPanelOpenRef.current = isPanelOpen
  }, [isPanelOpen])

  useEffect(() => {
    isInspectorOpenRef.current = isInspectorOpen
  }, [isInspectorOpen])

  useEffect(() => {
    if (activeView === 'logic') {
      setLogicRevealKey((prev) => prev + 1)
    }
  }, [activeView])

  useEffect(() => {
    const worker = new Worker(
      new URL('./workers/inspectorWorker.ts', import.meta.url),
      { type: 'module' }
    )
    fileDocWorkerRef.current = worker

    worker.onmessage = (event: MessageEvent) => {
      const { id, outline } = event.data
      if (id !== fileDocReqRef.current) return
      setFileDocSymbols(outline?.symbols ?? [])
      setFileDocLoading(false)
    }

    return () => {
      worker.terminate()
      fileDocWorkerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (
      activeView !== 'files' ||
      !selectedFilePath ||
      !selectedFileContent ||
      selectedFileContent.kind !== 'text'
    ) {
      setFileDocSymbols([])
      setFileDocLoading(false)
      return
    }
    const worker = fileDocWorkerRef.current
    if (!worker) return
    const nextId = fileDocReqRef.current + 1
    fileDocReqRef.current = nextId
    setFileDocLoading(true)
    worker.postMessage({
      id: nextId,
      filePath: selectedFilePath,
      content: selectedFileContent.content,
      settings: analysisSettings,
      baseUrl: window.location.origin,
      overrideLanguageId: selectedLanguageOverride ?? null,
    })
  }, [
    activeView,
    selectedFilePath,
    selectedFileContent,
    analysisSettings,
    selectedLanguageOverride,
  ])

  useEffect(() => {
    if (!fileDocSymbols.length) {
      setFileDocSelectedId(null)
      return
    }
    const exists = fileDocSelectedId
      ? fileDocSymbols.some((symbol) => symbol.id === fileDocSelectedId)
      : false
    if (!exists) {
      setFileDocSelectedId(fileDocSymbols[0].id)
    }
  }, [fileDocSymbols, fileDocSelectedId])

  useEffect(() => {
    if (!projectRoot || !selectedDocSymbol) {
      setDocOverlays([])
      setDocOverlayLoading(false)
      setDocOverlayIsEditing(false)
      setDocOverlayEditingId(null)
      setDocOverlayRaw('')
      return
    }
    const fetchOverlays = window.loadgic?.overlaysList
    if (!fetchOverlays) return
    setDocOverlayLoading(true)
    fetchOverlays(projectRoot, selectedDocSymbol.id)
      .then((overlays) => {
        const normalized = overlays.map((overlay) => {
          if (overlay.markdown) return overlay
          const parsed = parseLGDoc(overlay.raw)
          return { ...overlay, markdown: parsed.markdown }
        })
        setDocOverlays(normalized)
      })
      .catch(() => {
        setDocOverlays([])
      })
      .finally(() => {
        setDocOverlayLoading(false)
      })
  }, [projectRoot, selectedDocSymbol])

  useEffect(() => {
    window.localStorage.setItem(
      'loadgic:languageOverrides',
      JSON.stringify(languageOverrides)
    )
  }, [languageOverrides])

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (isResizingRef.current) {
        const nextWidth = Math.max(0, event.clientX - SIDEBAR_WIDTH)

        if (nextWidth < COLLAPSE_THRESHOLD) {
          if (isPanelOpenRef.current) {
            setIsPanelOpen(false)
          }
          return
        }

        if (!isPanelOpenRef.current) {
          setIsPanelOpen(true)
        }

        const maxPanelWidth = Math.max(
          MIN_PANEL_WIDTH,
          window.innerWidth - SIDEBAR_WIDTH - MIN_CONTENT_WIDTH
        )
        const clampedWidth = Math.min(
          Math.max(nextWidth, MIN_PANEL_WIDTH),
          maxPanelWidth
        )
        setPanelWidth(clampedWidth)
        lastOpenWidthRef.current = clampedWidth
      }

      if (isInspectorResizingRef.current) {
        const nextWidth = Math.max(0, window.innerWidth - event.clientX)

        if (nextWidth < COLLAPSE_THRESHOLD) {
          if (isInspectorOpenRef.current) {
            setIsInspectorOpen(false)
          }
          return
        }

        if (!isInspectorOpenRef.current) {
          setIsInspectorOpen(true)
        }

        const maxInspectorWidth = Math.max(
          MIN_INSPECTOR_WIDTH,
          window.innerWidth - SIDEBAR_WIDTH - MIN_CONTENT_WIDTH
        )
        const clampedWidth = Math.min(
          Math.max(nextWidth, MIN_INSPECTOR_WIDTH),
          maxInspectorWidth
        )
        setInspectorWidth(clampedWidth)
        lastInspectorWidthRef.current = clampedWidth
      }
    }

    function handleMouseUp() {
      if (isResizingRef.current) {
        isResizingRef.current = false

        if (!isPanelOpenRef.current) {
          setPanelWidth(lastOpenWidthRef.current)
        }
      }

      if (isInspectorResizingRef.current) {
        isInspectorResizingRef.current = false
        if (!isInspectorOpenRef.current) {
          setInspectorWidth(lastInspectorWidthRef.current)
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Handle window resize to adjust panel and inspector widths
  useEffect(() => {
    let rafId: number | null = null

    function handleResize() {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        const maxPanelWidth = Math.max(
          MIN_PANEL_WIDTH,
          window.innerWidth - SIDEBAR_WIDTH - MIN_CONTENT_WIDTH
        )
        const nextWidth = Math.min(panelWidthRef.current, maxPanelWidth)
        if (nextWidth !== panelWidthRef.current) {
          setPanelWidth(nextWidth)
          lastOpenWidthRef.current = nextWidth
        }
      })
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (rafId !== null) window.cancelAnimationFrame(rafId)
    }
  }, [])

  // Handle settings menu close on outside click or Escape key
  useEffect(() => {
    if (!settingsMenu) return
    function handleClose() {
      setSettingsMenu(null)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSettingsMenu(null)
    }
    window.addEventListener('click', handleClose)
    window.addEventListener('contextmenu', handleClose)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('click', handleClose)
      window.removeEventListener('contextmenu', handleClose)
      window.removeEventListener('keydown', handleKey)
    }
  }, [settingsMenu])

  // Handle context menu close on outside click or Escape key
  useEffect(() => {
    if (!contextMenu) return
    function handleClose() {
      if (suppressContextCloseRef.current) return
      setContextMenu(null)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('click', handleClose)
    window.addEventListener('contextmenu', handleClose)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('click', handleClose)
      window.removeEventListener('contextmenu', handleClose)
      window.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu])

  // Global context menu handler (right-click)
  useEffect(() => {
    function handleGlobalContextMenu(event: MouseEvent) {
      console.log('contextmenu', event.target)
      const target = event.target as HTMLElement | null
      if (!target) return
      setSettingsMenu(null)
      const openContextMenu = (items: { label: string; action: () => void }[]) => {
        suppressContextCloseRef.current = true
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          items,
        })
        window.setTimeout(() => {
          suppressContextCloseRef.current = false
        }, 0)
      }

      // Check if right-clicked on a file in the tree view
      const treeFile = target.closest('[data-file-path]') as HTMLElement | null
      if (treeFile) {
        const filePath = treeFile.dataset.filePath
        if (filePath) {
          event.preventDefault()
          openContextMenu([
            {
              label: 'Reveal in file view',
              action: () => {
                setActiveView('files')
                handleSelectFile(filePath)
              },
            },
            {
              label: 'Reveal in logic view',
              action: () => {
                setActiveView('logic')
                handleSelectFile(filePath)
              },
            },
            {
              label: 'Copy path',
              action: () => copyPathToClipboard(filePath),
            },
          ])
          return
        }
      }

      // Check if right-clicked on a file node in the logic view
      const logicHandle = logicViewRef.current
      if (logicHandle && logicHandle.isCanvasTarget(target)) {
        const filePath = logicHandle.hitTestFile(event.clientX, event.clientY)
        if (filePath) {
          event.preventDefault()
          openContextMenu([
            {
              label: 'Read in file view',
              action: () => {
                setActiveView('files')
                handleSelectFile(filePath)
              },
            },
          ])
          return
        }
      }

      // Check if right-clicked inside code editor
      if (target.closest('.cm-editor') && selectedFilePath) {
        event.preventDefault()
        openContextMenu([
          {
            label: 'Copy path',
            action: () => copyPathToClipboard(selectedFilePath),
          },
          {
            label: 'Reveal in logic view',
            action: () => setActiveView('logic'),
          },
        ])
      }
    }

    window.addEventListener('contextmenu', handleGlobalContextMenu, true)
    return () => {
      window.removeEventListener('contextmenu', handleGlobalContextMenu, true)
    }
  }, [selectedFilePath])

  // Ensure settings menu is within viewport
  useLayoutEffect(() => {
    if (!settingsMenu || !settingsMenuRef.current) return
    const rect = settingsMenuRef.current.getBoundingClientRect()
    const padding = 8
    const maxX = window.innerWidth - rect.width - padding
    const maxY = window.innerHeight - rect.height - padding
    const nextX = Math.max(padding, Math.min(settingsMenu.x, maxX))
    const nextY = Math.max(padding, Math.min(settingsMenu.y, maxY))
    if (nextX !== settingsMenu.x || nextY !== settingsMenu.y) {
      setSettingsMenu({ x: nextX, y: nextY })
    }
  }, [settingsMenu])

  // Start resizing side panel
  function startResize(event: React.MouseEvent) {
    event.preventDefault()
    isResizingRef.current = true
  }

  // Start resizing inspector panel
  function startInspectorResize(event: React.MouseEvent) {
    event.preventDefault()
    isInspectorResizingRef.current = true
  }

  // Open a project
  async function openProject() {
    const result = await window.loadgic?.openProject?.()
    if (!result) return
    setProjectRoot(result.rootPath)
    setProjectTree(result.tree)
    setExpandedTreeDirs(new Set([result.rootPath]))
    setSelectedFilePath(null)
    setSelectedFileContent(null)
    fullTreeLoadedRef.current = null
    fullTreeLoadingRef.current = false
  }

  // Update children of a directory node in the project tree
  function updateTreeChildren(
    node: ProjectNode,
    targetPath: string,
    children: ProjectNode[]
  ): ProjectNode {
    if (node.path === targetPath && node.type === 'dir') {
      return { ...node, children }
    }
    if (!node.children) return node
    let changed = false
    const nextChildren = node.children.map((child) => {
      const nextChild = updateTreeChildren(child, targetPath, children)
      if (nextChild !== child) changed = true
      return nextChild
    })
    return changed ? { ...node, children: nextChildren } : node
  }

  // Load a directory's contents
  async function loadDirectory(dirPath: string) {
    if (!projectRoot) return
    const loading = loadingDirsRef.current
    if (loading.has(dirPath)) return
    loading.add(dirPath)
    try {
      const result = await window.loadgic?.listDir?.(dirPath)
      if (!result) return
      setProjectTree((prev) => (prev ? updateTreeChildren(prev, dirPath, result) : prev))
    } finally {
      loading.delete(dirPath)
    }
  }

  // Load full project tree when logic view is active
  useEffect(() => {
    if (activeView !== 'logic' || !projectRoot) return
    if (fullTreeLoadedRef.current === projectRoot || fullTreeLoadingRef.current) {
      return
    }
    fullTreeLoadingRef.current = true
    window.loadgic
      ?.readProjectTree?.()
      .then((tree) => {
        if (tree) {
          setProjectTree(tree)
          fullTreeLoadedRef.current = projectRoot
        }
      })
      .finally(() => {
        fullTreeLoadingRef.current = false
      })
  }, [activeView, projectRoot])

  // Handle file selection
  async function handleSelectFile(filePath: string) {
    setHighlightQuery(null)
    setHighlightTotal(0)
    setHighlightIndex(null)
    setInspectorSearch('')
    setSelectedFilePath(filePath)
    const result = await window.loadgic?.readFile?.(filePath)
    setSelectedFileContent(result ?? null)
    if (projectTree) {
      const pathStack: string[] = []

      function walk(node: ProjectNode, target: string): boolean {
        if (node.path === target) {
          pathStack.push(node.path)
          return true
        }
        if (node.type !== 'dir' || !node.children) return false
        for (const child of node.children) {
          if (walk(child, target)) {
            pathStack.push(node.path)
            return true
          }
        }
        return false
      }

      if (walk(projectTree, filePath)) {
        setExpandedTreeDirs((prev) => {
          const next = new Set(prev)
          pathStack.forEach((dirPath) => next.add(dirPath))
          return next
        })
      }
    }
  }

  function handleRevealSymbol(symbol: string) {
    if (
      !selectedFilePath ||
      !selectedFileContent ||
      selectedFileContent.kind !== 'text'
    ) {
      return
    }
    skipHighlightResetRef.current = true
    setHighlightQuery(symbol)
    setInspectorSearch(symbol)
    setHighlightIndex(0)
    setHighlightRequest((prev) => prev + 1)
    setActiveView('files')
  }

  const handleDetailFocus = useCallback(
    (symbol: string, occurrenceIndex?: number) => {
      const trimmed = symbol.trim()
      if (!trimmed) return
      const sameQuery = highlightQuery?.trim() === trimmed
      if (sameQuery) {
        if (
          typeof occurrenceIndex === 'number' &&
          occurrenceIndex !== highlightIndex
        ) {
          setHighlightIndex(occurrenceIndex)
          setHighlightRequest((prev) => prev + 1)
        }
        return
      }
      skipHighlightResetRef.current = true
      setHighlightQuery(trimmed)
      setInspectorSearch(trimmed)
      setHighlightIndex(occurrenceIndex ?? 0)
      setHighlightRequest((prev) => prev + 1)
    },
    [highlightQuery, highlightIndex]
  )

  function handleCodeSymbolSelect(selection: {
    symbol: string
    line: number
    column: number
    occurrenceIndex?: number
  }) {
    const trimmed = selection.symbol.trim()
    if (!trimmed) return
    skipHighlightResetRef.current = true
    setHighlightQuery(trimmed)
    setInspectorSearch(trimmed)
    setHighlightIndex(selection.occurrenceIndex ?? 0)
    setHighlightRequest((prev) => prev + 1)
    setActiveView('files')
    setInspectorExternalDetail({
      value: trimmed,
      line: selection.line,
      column: selection.column,
      occurrenceIndex: selection.occurrenceIndex,
      nonce: Date.now(),
    })
  }

  function handleDocSymbolSelect(symbolId: string) {
    const symbol = fileDocSymbols.find((entry) => entry.id === symbolId)
    if (!symbol || !selectedFileContent || selectedFileContent.kind !== 'text') {
      return
    }
    setFileDocSelectedId(symbolId)
    const content = selectedFileContent.content
    const position = positionFromLineCol(
      content,
      symbol.range.startLine,
      symbol.range.startCol
    )
    const matches = collectMatches(content, symbol.name)
    const occurrenceIndex = matches.findIndex(
      (match) => position >= match.from && position <= match.to
    )
    handleCodeSymbolSelect({
      symbol: symbol.name,
      line: symbol.range.startLine,
      column: symbol.range.startCol,
      occurrenceIndex: occurrenceIndex >= 0 ? occurrenceIndex : undefined,
    })
    fileDocContentRef.current?.scrollTo({ top: 0 })
    setFileViewTab('code')
  }

  function handleDocListSelect(symbolId: string) {
    setFileDocSelectedId(symbolId)
    fileDocContentRef.current?.scrollTo({ top: 0 })
  }

  function startAddOverlay() {
    setDocOverlayIsEditing(true)
    setDocOverlayEditingId(null)
    setDocOverlayRaw('')
  }

  function startEditOverlay(overlay: Overlay) {
    setDocOverlayIsEditing(true)
    setDocOverlayEditingId(overlay.id)
    setDocOverlayRaw(overlay.raw)
  }

  function cancelOverlayEdit() {
    setDocOverlayIsEditing(false)
    setDocOverlayEditingId(null)
    setDocOverlayRaw('')
  }

  async function handleSaveOverlay() {
    if (!projectRoot || !selectedDocSymbol) return
    const parsed = parseLGDoc(docOverlayRaw)
    const overlay: Overlay = {
      id: docOverlayEditingId ?? `${selectedDocSymbol.id}::${Date.now()}`,
      target: { type: 'symbol', symbolId: selectedDocSymbol.id },
      raw: docOverlayRaw,
      markdown: parsed.markdown,
      updatedAt: new Date().toISOString(),
    }
    const saved = await window.loadgic?.overlaysUpsert?.(projectRoot, overlay)
    if (!saved) return
    setDocOverlays((prev) => {
      const next = [...prev]
      const index = next.findIndex((item) => item.id === saved.id)
      if (index >= 0) next[index] = saved
      else next.push(saved)
      return next
    })
    cancelOverlayEdit()
  }

  async function handleDeleteOverlay(overlayId: string) {
    if (!projectRoot) return
    await window.loadgic?.overlaysDelete?.(projectRoot, overlayId)
    setDocOverlays((prev) => prev.filter((overlay) => overlay.id !== overlayId))
    if (docOverlayEditingId === overlayId) {
      cancelOverlayEdit()
    }
  }

  async function handleCopyDocMarkdown() {
    if (!selectedDocSymbol?.doc?.markdown) return
    try {
      await navigator.clipboard.writeText(selectedDocSymbol.doc.markdown)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = selectedDocSymbol.doc.markdown
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }

  useEffect(() => {
    if (skipHighlightResetRef.current) {
      skipHighlightResetRef.current = false
      return
    }
    setHighlightIndex(null)
  }, [highlightQuery])

  function handleSearchEnter() {
    if (!highlightQuery || !highlightQuery.trim()) return
    setHighlightIndex((prev) => {
      if (prev == null) return 0
      if (highlightTotal <= 0) return prev
      return (prev + 1) % highlightTotal
    })
    setHighlightRequest((prev) => prev + 1)
    setActiveView('files')
  }

  function handleStepOccurrence(direction: 'next' | 'prev') {
    if (!highlightQuery || !highlightQuery.trim() || highlightTotal <= 0) return
    setHighlightIndex((prev) => {
      if (prev == null) return 0
      if (direction === 'next') {
        return (prev + 1) % highlightTotal
      }
      return (prev - 1 + highlightTotal) % highlightTotal
    })
    setHighlightRequest((prev) => prev + 1)
    setActiveView('files')
  }

  // Copy file path to clipboard
  async function copyPathToClipboard(filePath: string) {
    if (!filePath) return
    try {
      await navigator.clipboard.writeText(filePath)
    } catch {
      // Fallback for restricted clipboard permissions
      const textarea = document.createElement('textarea')
      textarea.value = filePath
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }

  // Open settings menu
  function openSettingsMenu(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    const { clientX, clientY } = event
    setSettingsMenu({ x: clientX + 12, y: clientY })
  }

  // Open settings window
  async function handleOpenSettings() {
    setSettingsMenu(null)
    await window.loadgic?.openSettingsWindow?.()
  }

  // Split a file path into directory and name components
  function splitPath(filePath: string) {
    const parts = filePath.split(/[/\\\\]/)
    const name = parts.pop() ?? filePath
    const dir = parts.join('/')
    return { dir, name }
  }

  // Render the main application layout
  return (
    <div className="app">
      <div className="titlebar">
        <div className="title">
          <img className="title-icon" src={appLogo} alt="" />
          <span className="title-text">Loadgic</span>
        </div>

        <div className="window-controls">
          <button onClick={() => window.loadgic?.minimize()}>—</button>
          <button onClick={() => window.loadgic?.toggleFullscreen()}>▢</button>
          <button className="close" onClick={() => window.loadgic?.close()}>✕</button>
        </div>
      </div>

      <div
        className="main"
        style={{
          ['--panel-width' as any]: isPanelOpen ? `${panelWidth}px` : '0px',
          ['--inspector-width' as any]: isInspectorOpen
            ? `${inspectorWidth}px`
            : '0px',
        }}
      >
        <Sidebar
          activeView={activeView}
          onChangeView={selectView}
          onOpenSettingsMenu={openSettingsMenu}
          isPanelOpen={isPanelOpen}
          onOpenPanel={() => setIsPanelOpen(true)}
        />
        <SidePanel
          activeView={activeView}
          isOpen={isPanelOpen}
          onToggle={() => setIsPanelOpen((open) => !open)}
          projectRoot={projectRoot}
          projectTree={projectTree}
          onOpenProject={openProject}
          onSelectFile={handleSelectFile}
          onLoadDir={loadDirectory}
          expandedDirs={expandedTreeDirs}
          onToggleDir={(dirPath) => {
            setExpandedTreeDirs((prev) => {
              const next = new Set(prev)
              if (next.has(dirPath)) {
                next.delete(dirPath)
              } else {
                next.add(dirPath)
              }
              return next
            })
          }}
          selectedFilePath={selectedFilePath}
        />
        <div
          className="sidepanel-resizer"
          onMouseDown={startResize}
          aria-label="Resize panel"
          role="separator"
        />

        <div className={`content${activeView === 'logic' ? ' logic-view' : ''}`}>
          {activeView === 'logic' ? (
            <LogicView
              projectTree={projectTree}
              selectedFilePath={selectedFilePath}
              onSelectFilePath={handleSelectFile}
              revealKey={logicRevealKey}
              ref={logicViewRef}
            />
          ) : activeView === 'files' && selectedFilePath ? (
            <div className="file-viewer">
              <div className="file-viewer-tabs">
                <button
                  className={`file-viewer-tab${
                    fileViewTab === 'code' ? ' active' : ''
                  }`}
                  type="button"
                  onClick={() => setFileViewTab('code')}
                >
                  Code
                </button>
                <button
                  className={`file-viewer-tab${
                    fileViewTab === 'docs' ? ' active' : ''
                  }`}
                  type="button"
                  onClick={() => setFileViewTab('docs')}
                >
                  Documentation
                </button>
              </div>
              {selectedFileContent ? (
                selectedFileContent.kind === 'text' ? (
                  fileViewTab === 'code' ? (
                    <>
                      <div className="file-viewer-actions">
                        <div className="file-language-select">
                          <span className="file-language-label">Analyzer</span>
                          <select
                            className="file-language-dropdown"
                            value={selectedLanguageOverride ?? ''}
                            onChange={(event) =>
                              handleLanguageOverrideChange(
                                event.target.value
                                  ? (event.target.value as LanguageId)
                                  : null
                              )
                            }
                          >
                            <option value="">Auto</option>
                            {LANGUAGE_DEFINITIONS.map((language) => (
                              <option key={language.id} value={language.id}>
                                {language.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="file-viewer-header">
                        {selectedFilePath ? (
                          <>
                            <button
                              className="file-viewer-copy"
                              onClick={() => copyPathToClipboard(selectedFilePath)}
                              aria-label="Copy full path"
                              title="Copy full path"
                              type="button"
                            >
                              <span className="file-viewer-copy-icon">⧉</span>
                              <span className="file-viewer-copy-label">Copy</span>
                            </button>
                            <span className="file-viewer-path">
                              {splitPath(selectedFilePath).dir}
                              {splitPath(selectedFilePath).dir ? '/' : ''}
                            </span>
                            <span className="file-viewer-name">
                              {splitPath(selectedFilePath).name}
                            </span>
                          </>
                        ) : null}
                      </div>
                      <FileViewer
                        content={selectedFileContent.content}
                        filePath={selectedFilePath}
                        forcedLanguageId={selectedLanguageOverride}
                        onLanguageOverrideChange={handleLanguageOverrideChange}
                        highlightQuery={highlightQuery}
                        occurrenceIndex={highlightIndex}
                        focusRequest={highlightRequest}
                        onOccurrencesChange={setHighlightTotal}
                        onSymbolSelect={handleCodeSymbolSelect}
                      />
                    </>
                  ) : (
                    <div className="file-viewer-docs">
                      <div className="file-viewer-docs-inner">
                        <div className="file-viewer-docs-header">
                          <div className="file-viewer-docs-title">
                            Documentation
                          </div>
                          <div className="file-viewer-docs-meta">
                            {selectedDocSymbol ? (
                              <span className="file-viewer-docs-source">
                                Source: {selectedDocSymbol.doc?.source ?? 'unknown'}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="file-viewer-docs-copy"
                              onClick={handleCopyDocMarkdown}
                              disabled={!selectedDocSymbol?.doc?.markdown}
                            >
                              Copy Markdown
                            </button>
                          </div>
                        </div>
                        {fileDocLoading ? (
                          <div className="file-viewer-docs-text">
                            Analyzing symbols…
                          </div>
                        ) : fileDocSymbols.length ? (
                          <div className="file-viewer-docs-body">
                            <div className="file-viewer-docs-sidebar">
                              <div className="file-viewer-docs-sidebar-header">
                                <span>Symbols</span>
                              </div>
                              <div className="file-viewer-docs-list">
                                {fileDocSymbols.map((symbol) => (
                                  <button
                                    key={symbol.id}
                                    type="button"
                                    className={`file-viewer-docs-item${
                                      symbol.id === fileDocSelectedId
                                        ? ' active'
                                        : ''
                                    }`}
                                    onClick={() =>
                                      handleDocListSelect(symbol.id)
                                    }
                                  >
                                    <span className="file-viewer-docs-kind">
                                      {symbol.kind}
                                    </span>
                                    <span className="file-viewer-docs-name">
                                      {symbol.name}
                                    </span>
                                    <span className="file-viewer-docs-line">
                                      L{symbol.range.startLine}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div
                              className="file-viewer-docs-content"
                              ref={fileDocContentRef}
                            >
                              {selectedDocSymbol && !docHasTitleHeading ? (
                                <div className="file-viewer-docs-symbol">
                                  <div className="file-viewer-docs-symbol-name">
                                    {selectedDocSymbol.name}
                                  </div>
                                  <div className="file-viewer-docs-symbol-meta">
                                    <span>{selectedDocSymbol.kind}</span>
                                    <span>
                                      L{selectedDocSymbol.range.startLine}
                                    </span>
                                  </div>
                                  <div className="file-viewer-docs-symbol-meta">
                                    Source:{' '}
                                    {selectedDocSymbol.doc?.source ?? 'unknown'}
                                  </div>
                                </div>
                              ) : null}
                              {combinedDocMarkdown ? (
                                <DocRenderer
                                  markdown={combinedDocMarkdown}
                                  symbolNames={docSymbolNameMap}
                                  onSelectSymbol={handleDocSymbolSelect}
                                />
                              ) : (
                                <div className="file-viewer-docs-text">
                                  No documentation available for this symbol.
                                </div>
                              )}
                              {selectedDocSymbol ? (
                                <div className="file-viewer-docs-overlays">
                                  <div className="file-viewer-docs-overlays-header">
                                    <span>Details editor</span>
                                    <button
                                      type="button"
                                      className="file-viewer-docs-action"
                                      onClick={startAddOverlay}
                                    >
                                      Add details
                                    </button>
                                  </div>
                                  {docOverlayLoading ? (
                                    <div className="file-viewer-docs-text">
                                      Loading overlays…
                                    </div>
                                  ) : docOverlays.length ? (
                                    <div className="file-viewer-docs-overlays-list">
                                      {docOverlays.map((overlay, index) => (
                                        <div
                                          key={overlay.id}
                                          className="file-viewer-docs-overlay-item"
                                        >
                                          <div className="file-viewer-docs-overlay-title">
                                            {parseLGDoc(overlay.raw).title ||
                                              `Overlay ${index + 1}`}
                                          </div>
                                          <div className="file-viewer-docs-overlay-actions">
                                            <button
                                              type="button"
                                              className="file-viewer-docs-action"
                                              onClick={() =>
                                                startEditOverlay(overlay)
                                              }
                                            >
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              className="file-viewer-docs-action danger"
                                              onClick={() =>
                                                handleDeleteOverlay(overlay.id)
                                              }
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="file-viewer-docs-text">
                                      No details yet.
                                    </div>
                                  )}
                                  {docOverlayIsEditing ? (
                                    <div className="file-viewer-docs-editor">
                                      <textarea
                                        className="file-viewer-docs-textarea"
                                        value={docOverlayRaw}
                                        onChange={(event) =>
                                          setDocOverlayRaw(event.target.value)
                                        }
                                        placeholder="@title ...\n@summary ...\n@param name ...\n@returns ...\n@example\n..."
                                      />
                                      <div className="file-viewer-docs-preview">
                                        <div className="file-viewer-docs-preview-title">
                                          Preview
                                        </div>
                                        {overlayPreview ? (
                                          <DocRenderer
                                            markdown={overlayPreview}
                                            symbolNames={docSymbolNameMap}
                                            onSelectSymbol={handleDocSymbolSelect}
                                          />
                                        ) : (
                                          <div className="file-viewer-docs-text">
                                            Start typing to preview.
                                          </div>
                                        )}
                                      </div>
                                      <div className="file-viewer-docs-editor-actions">
                                        <button
                                          type="button"
                                          className="file-viewer-docs-action"
                                          onClick={handleSaveOverlay}
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          className="file-viewer-docs-action"
                                          onClick={cancelOverlayEdit}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div className="file-viewer-docs-text">
                            No symbols detected in this file.
                          </div>
                        )}
                      </div>
                    </div>
                  )
                ) : selectedFileContent.kind === 'image' ? (
                  <div className="image-viewer">
                    <img
                      src={`data:${selectedFileContent.mime};base64,${selectedFileContent.data}`}
                      alt={splitPath(selectedFilePath).name}
                    />
                  </div>
                ) : (
                  <pre className="file-viewer-body">
                    {selectedFileContent.reason}
                  </pre>
                )
              ) : (
                <pre className="file-viewer-body">Loading...</pre>
              )}
            </div>
          ) : (
            <img
              className="content-watermark"
              src="/logo-mark.svg"
              alt=""
              loading="eager"
              decoding="async"
            />
          )}
        </div>
        {!isInspectorOpen ? (
          <button
            className="inspector-open-btn"
            onClick={() => setIsInspectorOpen(true)}
            aria-label="Show inspector"
            title="Show inspector"
            type="button"
          >
            <svg
              className="inspector-open-icon"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <circle
                cx="9"
                cy="9"
                r="5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M13 13l4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
        <aside className="inspector">
          <div className="inspector-header">
            <div className="inspector-title-row">
              <span className="inspector-title">INSPECTOR</span>
              <button
                className="inspector-toggle"
                onClick={() => setIsInspectorOpen(false)}
                aria-label="Hide inspector"
                title="Hide inspector"
                type="button"
              >
                <span className="inspector-toggle-icon">&gt;</span>
                <span className="inspector-toggle-text">Hide</span>
              </button>
            </div>
            <div className="inspector-search-wrap">
              <input
                className="inspector-search"
                type="search"
                placeholder="Search in file"
                value={inspectorSearch}
                onChange={(event) => {
                  const value = event.target.value
                  setInspectorSearch(value)
                  const next = value.trim()
                  setHighlightQuery(next ? value : null)
                  if (!next) {
                    setHighlightIndex(null)
                    setHighlightTotal(0)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  handleSearchEnter()
                }}
              />
              {highlightQuery && highlightQuery.trim() ? (
                <span className="inspector-search-count">
                  {highlightTotal > 0 && highlightIndex != null
                    ? `${highlightIndex + 1} / ${highlightTotal}`
                    : `0 / ${highlightTotal}`}
                </span>
              ) : null}
            </div>
            <div className="inspector-language-row">
              <span className="inspector-language-label">Analyzer</span>
              <select
                className="inspector-language-select"
                value={selectedLanguageOverride ?? ''}
                disabled={!selectedFilePath}
                onChange={(event) =>
                  handleLanguageOverrideChange(
                    event.target.value
                      ? (event.target.value as LanguageId)
                      : null
                  )
                }
              >
                <option value="">Auto</option>
                {LANGUAGE_DEFINITIONS.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        <InspectorPanel
          projectRoot={projectRoot}
          filePath={selectedFilePath}
          fileContent={selectedFileContent}
          forcedLanguageId={selectedLanguageOverride}
            onRevealSymbol={handleRevealSymbol}
            onDetailFocus={handleDetailFocus}
            occurrenceIndex={highlightIndex}
            occurrenceTotal={highlightTotal}
            onStepOccurrence={handleStepOccurrence}
            externalDetail={inspectorExternalDetail}
          />
        </aside>
        {isInspectorOpen ? (
          <div
            className="inspector-resizer"
            onMouseDown={startInspectorResize}
            aria-label="Resize inspector"
            role="separator"
          />
        ) : null}
        {settingsMenu ? (
          <div
            className="context-menu"
            style={{ top: settingsMenu.y, left: settingsMenu.x }}
            onClick={(event) => event.stopPropagation()}
            role="menu"
            ref={settingsMenuRef}
          >
            <button className="context-menu-item" onClick={handleOpenSettings}>
              Settings
            </button>
          </div>
        ) : null}
        {contextMenu ? (
          <div
            className="context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(event) => event.stopPropagation()}
            role="menu"
          >
            {contextMenu.items.map((item) => (
              <button
                key={item.label}
                className="context-menu-item"
                onClick={() => {
                  item.action()
                  setContextMenu(null)
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default App
