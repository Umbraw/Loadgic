import { useTheme } from '../theme/ThemeProvider'

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button className="settings-toggle" onClick={toggleTheme} type="button">
      {theme === 'dark' ? 'On' : 'Off'}
    </button>
  )
}

export default function SettingsPage() {
  return (
    <div className="settings-shell">
      <div className="settings-titlebar">
        <div className="settings-title">Settings</div>
        <div className="settings-window-controls">
          <button onClick={() => window.loadgic?.minimizeSettings?.()}>—</button>
          <button className="close" onClick={() => window.loadgic?.closeSettings?.()}>
            ✕
          </button>
        </div>
      </div>

      <div className="settings-page">
        <div className="settings-section">
          <div className="settings-section-title">Appearance</div>
          <label className="settings-row">
            <span>Dark mode</span>
            <ThemeToggle />
          </label>
        </div>
      </div>
    </div>
  )
}
