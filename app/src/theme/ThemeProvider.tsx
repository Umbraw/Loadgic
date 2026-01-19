import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type Theme = 'dark' | 'light'
type EditorTheme = 'oneDark' | 'dracula' | 'github' | 'solarized' | 'nord'

type LogicSettings = {
  maxDepth: number
  maxChildren: number
}

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  editorTheme: EditorTheme
  setEditorTheme: (theme: EditorTheme) => void
  logicSettings: LogicSettings
  setLogicSettings: (settings: LogicSettings) => void
}

export const EDITOR_THEMES: { value: EditorTheme; label: string }[] = [
  { value: 'oneDark', label: 'One Dark' },
  { value: 'dracula', label: 'Dracula' },
  { value: 'github', label: 'GitHub' },
  { value: 'solarized', label: 'Solarized' },
  { value: 'nord', label: 'Nord' },
]

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem('loadgic:theme')
  if (stored === 'dark' || stored === 'light') return stored
  return 'dark'
}

function getInitialEditorTheme(): EditorTheme {
  if (typeof window === 'undefined') return 'oneDark'
  const stored = window.localStorage.getItem('loadgic:editorTheme')
  if (stored && EDITOR_THEMES.some((t) => t.value === stored)) return stored as EditorTheme
  return 'oneDark'
}

function getInitialLogicSettings(): LogicSettings {
  if (typeof window === 'undefined') {
    return { maxDepth: 2, maxChildren: 10 }
  }
  const stored = window.localStorage.getItem('loadgic:logicSettings')
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<LogicSettings>
      const maxDepth = typeof parsed.maxDepth === 'number' ? parsed.maxDepth : 2
      const maxChildren = typeof parsed.maxChildren === 'number' ? parsed.maxChildren : 10
      return { maxDepth, maxChildren }
    } catch {
      return { maxDepth: 2, maxChildren: 10 }
    }
  }
  return { maxDepth: 2, maxChildren: 10 }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [editorTheme, setEditorTheme] = useState<EditorTheme>(getInitialEditorTheme)
  const [logicSettings, setLogicSettings] = useState<LogicSettings>(
    getInitialLogicSettings
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('loadgic:theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem('loadgic:editorTheme', editorTheme)
  }, [editorTheme])

  useEffect(() => {
    window.localStorage.setItem('loadgic:logicSettings', JSON.stringify(logicSettings))
  }, [logicSettings])

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === 'loadgic:theme') {
        if (event.newValue === 'dark' || event.newValue === 'light') {
          setTheme(event.newValue)
        }
      }
      if (event.key === 'loadgic:editorTheme') {
        if (event.newValue && EDITOR_THEMES.some((t) => t.value === event.newValue)) {
          setEditorTheme(event.newValue as EditorTheme)
        }
      }
      if (event.key === 'loadgic:logicSettings' && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as Partial<LogicSettings>
          const maxDepth = typeof parsed.maxDepth === 'number' ? parsed.maxDepth : 2
          const maxChildren = typeof parsed.maxChildren === 'number' ? parsed.maxChildren : 10
          setLogicSettings({ maxDepth, maxChildren })
        } catch {
          // ignore invalid storage value
        }
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      editorTheme,
      setEditorTheme,
      logicSettings,
      setLogicSettings,
    }),
    [theme, editorTheme, logicSettings]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
