import { useTheme, EDITOR_THEMES } from '../theme/ThemeProvider'

// Toggle button for dark mode
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button className="settings-toggle" onClick={toggleTheme} type="button">
      {theme === 'dark' ? 'On' : 'Off'}
    </button>
  )
}

// Dropdown for selecting editor theme
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

// Clamp a number between min and max
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

// SettingsPage component
export default function SettingsPage() {
  const { logicSettings, setLogicSettings } = useTheme()
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

        <div className="settings-section">
          <div className="settings-section-title">Logic View</div>
          <label className="settings-row">
            <span>Default depth</span>
            <input
              type="number"
              min={1}
              max={6}
              value={logicSettings.maxDepth}
              onChange={(event) => {
                const next = clamp(Number(event.target.value || 0), 1, 6)
                setLogicSettings({ ...logicSettings, maxDepth: next })
              }}
            />
          </label>
          <label className="settings-row">
            <span>Auto-collapse after N children</span>
            <input
              type="number"
              min={5}
              max={100}
              step={1}
              value={logicSettings.maxChildren}
              onChange={(event) => {
                const next = clamp(Number(event.target.value || 0), 5, 100)
                setLogicSettings({ ...logicSettings, maxChildren: next })
              }}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
