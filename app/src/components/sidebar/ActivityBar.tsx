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
}

function Sidebar({ activeView, onChangeView, onOpenSettingsMenu }: SidebarProps) {
  return (
    <aside className="sidebar">
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
