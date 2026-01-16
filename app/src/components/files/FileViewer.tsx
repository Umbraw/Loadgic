import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { dracula } from '@uiw/codemirror-theme-dracula'
import { githubDark, githubLight } from '@uiw/codemirror-theme-github'
import { solarizedDark, solarizedLight } from '@uiw/codemirror-theme-solarized'
import { nordInit } from '@uiw/codemirror-theme-nord'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { python } from '@codemirror/lang-python'
import { java } from '@codemirror/lang-java'
import { rust } from '@codemirror/lang-rust'
import { php } from '@codemirror/lang-php'
import { sql } from '@codemirror/lang-sql'
import { useMemo } from 'react'
import type { Extension } from '@codemirror/state'
import { useTheme } from '../../theme/ThemeProvider'

type Props = {
  content: string
  filePath: string
}

const nord = nordInit({})

function getEditorTheme(editorTheme: string, isDark: boolean): Extension {
  switch (editorTheme) {
    case 'dracula':
      return dracula
    case 'github':
      return isDark ? githubDark : githubLight
    case 'solarized':
      return isDark ? solarizedDark : solarizedLight
    case 'nord':
      return nord
    case 'oneDark':
    default:
      return oneDark
  }
}

function getExtension(filePath: string) {
  const match = filePath.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

function getLanguageExtension(ext: string) {
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return javascript({ typescript: ext.includes('ts') })
    case 'html':
    case 'htm':
      return html()
    case 'css':
    case 'scss':
    case 'less':
      return css()
    case 'json':
      return json()
    case 'md':
    case 'markdown':
      return markdown()
    case 'xml':
    case 'svg':
      return xml()
    case 'yaml':
    case 'yml':
      return yaml()
    case 'py':
      return python()
    case 'java':
      return java()
    case 'rs':
      return rust()
    case 'php':
      return php()
    case 'sql':
      return sql()
    default:
      return []
  }
}

export default function FileViewer({ content, filePath }: Props) {
  const { theme, editorTheme } = useTheme()
  const extensions = useMemo(() => {
    const ext = getExtension(filePath)
    const lang = getLanguageExtension(ext)
    return Array.isArray(lang) ? [] : [lang]
  }, [filePath])

  return (
    <CodeMirror
      value={content}
      theme={getEditorTheme(editorTheme, theme === 'dark')}
      extensions={extensions}
      readOnly
      editable={false}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
      }}
    />
  )
}
