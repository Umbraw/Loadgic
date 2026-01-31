import Sidebar from './components/sidebar/ActivityBar'
import SidePanel from './components/sidebar/SidePanel'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ViewMode } from './types/view'
import type { ProjectNode } from './types/project'
import type { FileContent } from './types/file'
import appLogo from './assets/logo/logo_512_512.png'
import FileViewer from './components/files/FileViewer'
import LogicView from './components/logic/LogicView'
import type { LogicViewHandle } from './components/logic/LogicView'
import InspectorPanel from './components/inspector/InspectorPanel'

const SIDEBAR_WIDTH = 54
const MIN_PANEL_WIDTH = 220
const MIN_INSPECTOR_WIDTH = 265
const COLLAPSE_THRESHOLD = 140
const MIN_CONTENT_WIDTH = 200

function App() {
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
  const [inspectorExternalDetail, setInspectorExternalDetail] = useState<{
    value: string
    nonce: number
  } | null>(null)
  const [inspectorSearch, setInspectorSearch] = useState('')
  const settingsMenuRef = useRef<HTMLDivElement | null>(null)
  const suppressContextCloseRef = useRef(false)
  const logicViewRef = useRef<LogicViewHandle | null>(null)
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
    setHighlightQuery(symbol)
    setInspectorSearch(symbol)
    setHighlightIndex(0)
    setHighlightRequest((prev) => prev + 1)
    setActiveView('files')
  }

  function handleCodeSymbolSelect(symbol: string) {
    const trimmed = symbol.trim()
    if (!trimmed) return
    handleRevealSymbol(trimmed)
    setInspectorExternalDetail({
      value: trimmed,
      nonce: Date.now(),
    })
  }

  useEffect(() => {
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
              {selectedFileContent ? (
                selectedFileContent.kind === 'text' ? (
                  <FileViewer
                    content={selectedFileContent.content}
                    filePath={selectedFilePath}
                    highlightQuery={highlightQuery}
                    occurrenceIndex={highlightIndex}
                    focusRequest={highlightRequest}
                    onOccurrencesChange={setHighlightTotal}
                    onSymbolSelect={handleCodeSymbolSelect}
                  />
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
                  setHighlightQuery(value.trim() ? value : null)
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
          </div>
          <InspectorPanel
            filePath={selectedFilePath}
            fileContent={selectedFileContent}
            onRevealSymbol={handleRevealSymbol}
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
