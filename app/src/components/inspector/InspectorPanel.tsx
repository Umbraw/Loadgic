import { useMemo, useRef, useState } from 'react'
import type { FileContent } from '../../types/file'
import { analyzeFileContent } from '../../analyzers'

// Props for InspectorPanel component
type Props = {
  filePath: string | null
  fileContent: FileContent | null
}

// Section component displaying categorized items
function Section({
  title,
  items,
}: {
  title: string
  items: string[] | { name: string; methods: string[] }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className="inspector-section">
      <button
        className="inspector-section-title"
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="inspector-section-left">
          <span
            className={`inspector-caret ${isOpen ? 'open' : ''}`}
            aria-hidden="true"
          />
          <span>{title}</span>
        </span>
        <span className="inspector-count">{items.length}</span>
      </button>
      {!isOpen ? null : items.length === 0 ? (
        <div className="inspector-empty">None</div>
      ) : (
        <div className="inspector-list">
          {items.map((item) =>
            typeof item === 'string' ? (
              <span key={item} className="inspector-chip">
                {item}
              </span>
            ) : (
              <div key={item.name} className="inspector-item">
                <div className="inspector-item-title">{item.name}</div>
                {item.methods.length > 0 ? (
                  <div className="inspector-item-sub">
                    {item.methods.join(', ')}
                  </div>
                ) : null}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

// InspectorPanel component displaying file analysis
export default function InspectorPanel({ filePath, fileContent }: Props) {
  const cacheRef = useRef(
    new Map<string, ReturnType<typeof analyzeFileContent>>()
  )
  const hashRef = useRef(new Map<string, string>())
  const outline = useMemo(() => {
    if (!filePath || !fileContent || fileContent.kind !== 'text') return null
    const cachedHash = hashRef.current.get(filePath)
    const nextHash = hashText(fileContent.content)
    if (cachedHash && cachedHash !== nextHash) {
      cacheRef.current.delete(`${filePath}:${cachedHash}`)
    }
    hashRef.current.set(filePath, nextHash)
    const cacheKey = `${filePath}:${nextHash}`
    const cached = cacheRef.current.get(cacheKey)
    if (cached) return cached
    const next = analyzeFileContent(filePath, fileContent.content)
    cacheRef.current.set(cacheKey, next)
    return next
  }, [filePath, fileContent])

  if (!filePath) {
    return <div className="inspector-body">No selection</div>
  }

  if (!fileContent || fileContent.kind !== 'text') {
    return (
      <div className="inspector-body">
        <div className="inspector-muted">Unsupported file type.</div>
      </div>
    )
  }

  if (!outline) {
    return (
      <div className="inspector-body">
        <div className="inspector-muted">No analyzer for this file.</div>
      </div>
    )
  }

  // Render inspector panel with file outline
  return (
    <div className="inspector-body inspector-scroll">
      <div className="inspector-summary">
        <div className="inspector-summary-title">Summary</div>
        <div className="inspector-summary-grid">
          <div>
            <div className="inspector-summary-value">{outline.imports.length}</div>
            <div className="inspector-summary-label">Imports</div>
          </div>
          <div>
            <div className="inspector-summary-value">{outline.exports.length}</div>
            <div className="inspector-summary-label">Exports</div>
          </div>
          <div>
            <div className="inspector-summary-value">{outline.classes.length}</div>
            <div className="inspector-summary-label">Classes</div>
          </div>
          <div>
            <div className="inspector-summary-value">{outline.functions.length}</div>
            <div className="inspector-summary-label">Functions</div>
          </div>
          <div>
            <div className="inspector-summary-value">{outline.hooks.length}</div>
            <div className="inspector-summary-label">Hooks</div>
          </div>
          <div>
            <div className="inspector-summary-value">{outline.interfaces.length}</div>
            <div className="inspector-summary-label">Interfaces</div>
          </div>
          <div>
            <div className="inspector-summary-value">{outline.types.length}</div>
            <div className="inspector-summary-label">Types</div>
          </div>
          <div>
            <div className="inspector-summary-value">{outline.enums.length}</div>
            <div className="inspector-summary-label">Enums</div>
          </div>
          <div>
            <div className="inspector-summary-value">{outline.variables.length}</div>
            <div className="inspector-summary-label">Variables</div>
          </div>
        </div>
      </div>
      <Section title="Imports" items={outline.imports} />
      <Section title="Exports" items={outline.exports} />
      <Section title="Classes" items={outline.classes} />
      <Section title="Functions" items={outline.functions} />
      <Section title="Hooks" items={outline.hooks} />
      <Section title="Interfaces" items={outline.interfaces} />
      <Section title="Types" items={outline.types} />
      <Section title="Enums" items={outline.enums} />
      <Section title="Variables" items={outline.variables} />
    </div>
  )
}

function hashText(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
