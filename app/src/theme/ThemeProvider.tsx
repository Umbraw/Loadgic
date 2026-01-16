import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type Theme = 'dark' | 'light'
type EditorTheme = 'oneDark' | 'dracula' | 'github' | 'solarized' | 'nord'

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  editorTheme: EditorTheme
  setEditorTheme: (theme: EditorTheme) => void
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [editorTheme, setEditorTheme] = useState<EditorTheme>(getInitialEditorTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('loadgic:theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem('loadgic:editorTheme', editorTheme)
  }, [editorTheme])

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
    }),
    [theme, editorTheme]
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
