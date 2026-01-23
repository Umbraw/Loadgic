import { useState } from 'react'
import type { ViewMode } from '../../types/view'
import type { ProjectNode } from '../../types/project'

// Props for SidePanel component
type Props = {
  activeView: ViewMode
  isOpen: boolean
  onToggle: () => void
  projectRoot?: string | null
  projectTree?: ProjectNode | null
  onOpenProject?: () => void
  onSelectFile?: (filePath: string) => void
  onLoadDir?: (dirPath: string) => void
  expandedDirs?: Set<string>
  onToggleDir?: (dirPath: string) => void
  selectedFilePath?: string | null
}

// Props for TreeNode component
type TreeProps = {
  node: ProjectNode
  level?: number
  onSelectFile?: (filePath: string) => void
  onLoadDir?: (dirPath: string) => void
  expandedDirs?: Set<string>
  onToggleDir?: (dirPath: string) => void
  selectedFilePath?: string | null
}

// TreeNode component for rendering file tree
function TreeNode({
  node,
  level = 0,
  onSelectFile,
  onLoadDir,
  expandedDirs,
  onToggleDir,
  selectedFilePath,
}: TreeProps) {
  const [isOpen, setIsOpen] = useState(level === 0)
  const isDir = node.type === 'dir'
  const isLoaded = node.children !== undefined
  const hasChildren = !!node.children?.length
  const isControlled = expandedDirs !== undefined
  const isOpenState = isControlled ? expandedDirs.has(node.path) : isOpen

  function toggle() {
    if (!isDir) return
    const nextOpen = !isOpenState
    if (nextOpen && !isLoaded) {
      onLoadDir?.(node.path)
    }
    if (isControlled) {
      onToggleDir?.(node.path)
    } else {
      setIsOpen(nextOpen)
    }
  }

  // Render the tree node
  return (
    <div className="file-tree-node" style={{ paddingLeft: `${level * 8}px` }}>
      <div
        className={`file-tree-label ${node.type} ${
          node.path === selectedFilePath ? 'selected' : ''
        }`}
        data-file-path={node.type === 'file' ? node.path : undefined}
        role={isDir ? 'button' : undefined}
        onClick={() => {
          if (isDir) {
            toggle()
          } else {
            onSelectFile?.(node.path)
          }
        }}
        onKeyDown={(event) => {
          if (!isDir) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggle()
          }
        }}
        tabIndex={isDir ? 0 : -1}
        aria-expanded={isDir ? isOpenState : undefined}
      >
        {isDir ? (isOpenState ? '▾' : '▸') : '•'} {node.name}
      </div>
      {isDir && isOpenState && hasChildren
        ? node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onSelectFile={onSelectFile}
              onLoadDir={onLoadDir}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              selectedFilePath={selectedFilePath}
            />
          ))
        : null}
      {isDir && isOpenState && node.children === undefined ? (
        <div className="file-tree-loading" style={{ paddingLeft: `${(level + 1) * 8}px` }}>
          Loading...
        </div>
      ) : null}
    </div>
  )
}

// SidePanel component
export default function SidePanel({
  activeView,
  isOpen,
  onToggle,
  projectRoot,
  projectTree,
  onOpenProject,
  onSelectFile,
  onLoadDir,
  expandedDirs,
  onToggleDir,
  selectedFilePath,
}: Props) {
  // Render the side panel
  return (
    <aside className={`sidepanel ${isOpen ? 'open' : 'closed'}`}>
      <div className="sidepanel-header">
        <div className="sidepanel-title">{activeView.toUpperCase()}</div>
        <button
          className="sidepanel-toggle"
          onClick={onToggle}
          aria-label={isOpen ? 'Hide panel' : 'Show panel'}
          title={isOpen ? 'Hide panel' : 'Show panel'}
        >
          <span className="sidepanel-toggle-icon">{isOpen ? '<' : '>'}</span>
          <span className="sidepanel-toggle-text">{isOpen ? 'Hide' : 'Show'}</span>
        </button>
      </div>

      <div className="sidepanel-body">
        {(activeView === 'files' || activeView === 'logic' || activeView === 'run') && (
          <div className="files-panel">
            <button className="files-open-btn" onClick={onOpenProject}>
              Open project folder
            </button>
            {projectRoot ? (
              <div className="files-root">Folder: {projectRoot}</div>
            ) : (
              <div className="files-empty">No project loaded yet.</div>
            )}
            {projectTree ? (
              <div className="file-tree">
                <TreeNode
                  node={projectTree}
                  onSelectFile={onSelectFile}
                  onLoadDir={onLoadDir}
                  expandedDirs={expandedDirs}
                  onToggleDir={onToggleDir}
                  selectedFilePath={selectedFilePath}
                />
              </div>
            ) : null}
            <div className="files-footer-space" />
          </div>
        )}
        {activeView === 'settings' && <div>Settings options</div>}
      </div>
    </aside>
  )
}
