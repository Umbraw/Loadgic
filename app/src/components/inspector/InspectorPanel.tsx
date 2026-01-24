import { useEffect, useRef, useState } from 'react'
import type { FileContent } from '../../types/file'
import type { Outline } from '../../analyzers/types'

// Props for InspectorPanel component
type Props = {
  filePath: string | null
  fileContent: FileContent | null
  onRevealSymbol?: (symbol: string) => void
}

// Section component displaying categorized items
function Section({
  title,
  items,
  onSelectItem,
}: {
  title: string
  items: string[] | { name: string; methods: string[] }[]
  onSelectItem?: (value: string) => void
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
              onSelectItem ? (
                <button
                  key={item}
                  className="inspector-chip"
                  type="button"
                  onClick={() => onSelectItem(item)}
                >
                  {item}
                </button>
              ) : (
                <span key={item} className="inspector-chip">
                  {item}
                </span>
              )
            ) : (
              <div key={item.name} className="inspector-item">
                {onSelectItem ? (
                  <button
                    className="inspector-item-title inspector-link"
                    type="button"
                    onClick={() => onSelectItem(item.name)}
                  >
                    {item.name}
                  </button>
                ) : (
                  <div className="inspector-item-title">{item.name}</div>
                )}
                {item.methods.length > 0 ? (
                  <div className="inspector-item-sub">
                    {item.methods.map((method, index) => (
                      <span key={method}>
                        {onSelectItem ? (
                          <button
                            className="inspector-method inspector-link"
                            type="button"
                            onClick={() => onSelectItem(method)}
                          >
                            {method}
                          </button>
                        ) : (
                          <span className="inspector-method">{method}</span>
                        )}
                        {index < item.methods.length - 1 ? ', ' : ''}
                      </span>
                    ))}
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
export default function InspectorPanel({
  filePath,
  fileContent,
  onRevealSymbol,
}: Props) {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const [outline, setOutline] = useState<Outline | null>(null)
  const [hasAnalyzer, setHasAnalyzer] = useState(true)

  useEffect(() => {
    const worker = new Worker(
      new URL('../../workers/inspectorWorker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent) => {
      const { id, outline: nextOutline, hasAnalyzer: nextHasAnalyzer } = event.data
      if (id !== requestIdRef.current) return
      setOutline(nextOutline)
      setHasAnalyzer(nextHasAnalyzer)
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!filePath || !fileContent || fileContent.kind !== 'text') {
      setOutline(null)
      setHasAnalyzer(true)
      return
    }

    const worker = workerRef.current
    if (!worker) return
    const id = requestIdRef.current + 1
    requestIdRef.current = id
    worker.postMessage({ id, filePath, content: fileContent.content })
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

  if (!hasAnalyzer) {
    return (
      <div className="inspector-body">
        <div className="inspector-muted">No analyzer for this file.</div>
      </div>
    )
  }

  if (!outline) {
    return (
      <div className="inspector-body">
        <div className="inspector-muted">Analyzing...</div>
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
            <div className="inspector-summary-value">{outline.importSources.length}</div>
            <div className="inspector-summary-label">Import sources</div>
          </div>
          <div>
            <div className="inspector-summary-value">{outline.exports.length}</div>
            <div className="inspector-summary-label">Exports</div>
          </div>
          <div>
            <div className="inspector-summary-value">
              {outline.importBindings.length}
            </div>
            <div className="inspector-summary-label">Imported symbols</div>
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
          <div>
            <div className="inspector-summary-value">
              {outline.exportSources.length}
            </div>
            <div className="inspector-summary-label">Export sources</div>
          </div>
        </div>
      </div>
      <Section
        title="Import sources"
        items={outline.importSources}
        onSelectItem={onRevealSymbol}
      />
      <Section
        title="Imported symbols"
        items={outline.importBindings}
        onSelectItem={onRevealSymbol}
      />
      <Section title="Exports" items={outline.exports} onSelectItem={onRevealSymbol} />
      <Section
        title="Export sources"
        items={outline.exportSources}
        onSelectItem={onRevealSymbol}
      />
      <Section title="Classes" items={outline.classes} onSelectItem={onRevealSymbol} />
      <Section title="Functions" items={outline.functions} onSelectItem={onRevealSymbol} />
      <Section title="Hooks" items={outline.hooks} onSelectItem={onRevealSymbol} />
      <Section
        title="Interfaces"
        items={outline.interfaces}
        onSelectItem={onRevealSymbol}
      />
      <Section title="Types" items={outline.types} onSelectItem={onRevealSymbol} />
      <Section title="Enums" items={outline.enums} onSelectItem={onRevealSymbol} />
      <Section title="Variables" items={outline.variables} onSelectItem={onRevealSymbol} />
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
