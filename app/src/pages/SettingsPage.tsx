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
      </div>
    </div>
  )
}
