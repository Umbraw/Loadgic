import { useTheme, EDITOR_THEMES } from '../theme/ThemeProvider'

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button className="settings-toggle" onClick={toggleTheme} type="button">
      {theme === 'dark' ? 'On' : 'Off'}
    </button>
  )
}

function EditorThemeSelect() {
  const { editorTheme, setEditorTheme } = useTheme()
  return (
    <select
      value={editorTheme}
      onChange={(e) => setEditorTheme(e.target.value as typeof editorTheme)}
    >
      {EDITOR_THEMES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
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
          <label className="settings-row">
            <span>Syntax highlighting</span>
            <EditorThemeSelect />
          </label>
        </div>
      </div>
    </div>
  )
}
