import type { MouseEvent } from 'react'
import type { ViewMode } from '../../types/view'

import {
  LogicIcon,
  FilesIcon,
  RunIcon,
  SettingsIcon
} from '../icons'

interface SidebarProps {
  activeView: ViewMode
  onChangeView: (view: ViewMode) => void
  onOpenSettingsMenu: (event: MouseEvent<HTMLButtonElement>) => void
  isPanelOpen: boolean
  onOpenPanel: () => void
}

function Sidebar({
  activeView,
  onChangeView,
  onOpenSettingsMenu,
  isPanelOpen,
  onOpenPanel,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      {!isPanelOpen && (
        <button
          className="menu-btn panel-open-btn"
          onClick={onOpenPanel}
          aria-label="Show panel"
          title="Show panel"
        >
          <svg
            className="panel-open-icon"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              d="M6 4l6 6-6 6M2 4l6 6-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <div className="sidebar-top">
        <button
          className={`menu-btn ${activeView === 'files' ? 'active' : ''}`}
          onClick={() => onChangeView('files')}
          aria-label="Files"
        >
          <FilesIcon size={20} />
        </button>

        <button
          className={`menu-btn ${activeView === 'logic' ? 'active' : ''}`}
          onClick={() => onChangeView('logic')}
          aria-label="Logic"
        >
          <LogicIcon size={20} />
        </button>

        <button
          className={`menu-btn ${activeView === 'run' ? 'active' : ''}`}
          onClick={() => onChangeView('run')}
          aria-label="Run"
        >
          <RunIcon size={20} />
        </button>
      </div>

      <div className="sidebar-bottom">
        <button
          className={`menu-btn ${activeView === 'settings' ? 'active' : ''}`}
          onClick={onOpenSettingsMenu}
          aria-label="Settings"
        >
          <SettingsIcon size={20} />
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
