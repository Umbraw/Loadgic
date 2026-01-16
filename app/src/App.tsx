import Sidebar from './components/sidebar/ActivityBar'
import SidePanel from './components/sidebar/SidePanel'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ViewMode } from './types/view'
import type { ProjectNode } from './types/project'
import type { FileContent } from './types/file'
import appLogo from './assets/logo/logo_512_512.png'
import FileViewer from './components/files/FileViewer'

const SIDEBAR_WIDTH = 54
const MIN_PANEL_WIDTH = 220
const COLLAPSE_THRESHOLD = 140
const MIN_CONTENT_WIDTH = 200

function App() {
  const [activeView, setActiveView] = useState<ViewMode>('files')
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  const [panelWidth, setPanelWidth] = useState(320)
  const [projectRoot, setProjectRoot] = useState<string | null>(null)
  const [projectTree, setProjectTree] = useState<ProjectNode | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [selectedFileContent, setSelectedFileContent] = useState<FileContent | null>(
    null
  )
  const [settingsMenu, setSettingsMenu] = useState<{ x: number; y: number } | null>(
    null
  )
  const settingsMenuRef = useRef<HTMLDivElement | null>(null)
  const isResizingRef = useRef(false)
  const panelWidthRef = useRef(panelWidth)
  const isPanelOpenRef = useRef(isPanelOpen)
  const lastOpenWidthRef = useRef(panelWidth)

  function selectView(next: ViewMode) {
    setActiveView((prev) => {
      if (prev === next) {
        setIsPanelOpen((o) => !o)
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
    isPanelOpenRef.current = isPanelOpen
  }, [isPanelOpen])

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!isResizingRef.current) return
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
      const clampedWidth = Math.min(Math.max(nextWidth, MIN_PANEL_WIDTH), maxPanelWidth)
      setPanelWidth(clampedWidth)
      lastOpenWidthRef.current = clampedWidth
    }

    function handleMouseUp() {
      if (!isResizingRef.current) return
      isResizingRef.current = false

      if (!isPanelOpenRef.current) {
        setPanelWidth(lastOpenWidthRef.current)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  useEffect(() => {
    function handleResize() {
      const maxPanelWidth = Math.max(
        MIN_PANEL_WIDTH,
        window.innerWidth - SIDEBAR_WIDTH - MIN_CONTENT_WIDTH
      )
      const nextWidth = Math.min(panelWidthRef.current, maxPanelWidth)
      if (nextWidth !== panelWidthRef.current) {
        setPanelWidth(nextWidth)
        lastOpenWidthRef.current = nextWidth
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  function startResize(event: React.MouseEvent) {
    event.preventDefault()
    isResizingRef.current = true
  }

  async function openProject() {
    const result = await window.loadgic?.openProject?.()
    if (!result) return
    setProjectRoot(result.rootPath)
    setProjectTree(result.tree)
    setSelectedFilePath(null)
    setSelectedFileContent(null)
  }

  async function handleSelectFile(filePath: string) {
    setSelectedFilePath(filePath)
    const result = await window.loadgic?.readFile?.(filePath)
    setSelectedFileContent(result ?? null)
  }

  function openSettingsMenu(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    const { clientX, clientY } = event
    setSettingsMenu({ x: clientX + 12, y: clientY })
  }

  async function handleOpenSettings() {
    setSettingsMenu(null)
    await window.loadgic?.openSettingsWindow?.()
  }

  function getBaseName(filePath: string) {
    return filePath.split(/[/\\\\]/).pop() ?? filePath
  }

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
        style={{ ['--panel-width' as any]: isPanelOpen ? `${panelWidth}px` : '0px' }}
      >
        <Sidebar
          activeView={activeView}
          onChangeView={selectView}
          onOpenSettingsMenu={openSettingsMenu}
        />
        <SidePanel
          activeView={activeView}
          isOpen={isPanelOpen}
          onToggle={() => setIsPanelOpen((open) => !open)}
          projectRoot={projectRoot}
          projectTree={projectTree}
          onOpenProject={openProject}
          onSelectFile={handleSelectFile}
          selectedFilePath={selectedFilePath}
        />
        <div
          className="sidepanel-resizer"
          onMouseDown={startResize}
          aria-label="Resize panel"
          role="separator"
        />
        <button
          className={`sidepanel-handle ${isPanelOpen ? 'hidden' : ''}`}
          onClick={() => setIsPanelOpen(true)}
          aria-label="Show panel"
          title="Show panel"
        >
          ▶
        </button>

        <div className="content">
          {activeView === 'files' && selectedFilePath ? (
            <div className="file-viewer">
              <div className="file-viewer-header">
                {getBaseName(selectedFilePath ?? '')}
              </div>
              {selectedFileContent ? (
                selectedFileContent.kind === 'text' ? (
                  <FileViewer
                    content={selectedFileContent.content}
                    filePath={selectedFilePath}
                  />
                ) : selectedFileContent.kind === 'image' ? (
                  <div className="image-viewer">
                    <img
                      src={`data:${selectedFileContent.mime};base64,${selectedFileContent.data}`}
                      alt={getBaseName(selectedFilePath)}
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
      </div>
    </div>
  )
}

export default App
