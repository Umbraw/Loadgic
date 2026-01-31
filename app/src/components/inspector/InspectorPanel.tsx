import { useEffect, useRef, useState } from 'react'
import type { FileContent } from '../../types/file'
import type { Outline } from '../../analyzers/types'
import { useTheme } from '../../theme/ThemeProvider'

// Props for InspectorPanel component
type Props = {
  filePath: string | null
  fileContent: FileContent | null
  onRevealSymbol?: (symbol: string) => void
  externalDetail?: { value: string; line?: number; column?: number; nonce: number } | null
}

type TsDetail = {
  symbol: string
  kind: string
  context: string
  line: number
  column: number
  occurrences: number
  lineText: string
  container: string | null
  modifiers: string[]
  isExported: boolean
  isDefaultExport: boolean
  isAsync: boolean
  isGenerator: boolean
  snippet: string
  tsDisplay?: string
  tsDocs?: string
  tsTags?: string[]
  tsDefinition?: {
    file: string
    start: { line: number; offset: number }
    end: { line: number; offset: number }
  } | null
  tsReferences?: number
  tsDiagnostics?: number
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
  externalDetail,
}: Props) {
  const { analysisSettings } = useTheme()
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const [outline, setOutline] = useState<Outline | null>(null)
  const [hasAnalyzer, setHasAnalyzer] = useState(true)
  const [tsDetail, setTsDetail] = useState<TsDetail | null>(null)
  const [tsDetailLoading, setTsDetailLoading] = useState(false)
  const tsDetailReqRef = useRef(0)
  const [tabs, setTabs] = useState<
    { id: string; label: string; value?: string; line?: number; column?: number }[]
  >(() => [{ id: 'overview', label: 'Overview' }])
  const [activeTab, setActiveTab] = useState('overview')

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
      setTsDetail(null)
      return
    }

    const worker = workerRef.current
    if (!worker) return
    const id = requestIdRef.current + 1
    requestIdRef.current = id
    worker.postMessage({
      id,
      filePath,
      content: fileContent.content,
      settings: analysisSettings,
      baseUrl: window.location.origin,
    })
  }, [filePath, fileContent, analysisSettings])

  useEffect(() => {
    const activeDetail = tabs.find((tab) => tab.id === activeTab)
    const detailItem = activeDetail?.value
    if (!filePath || !detailItem || activeTab === 'overview') {
      setTsDetail(null)
      setTsDetailLoading(false)
      return
    }
    const lower = filePath.toLowerCase()
    if (!/\.(ts|tsx|js|jsx)$/.test(lower)) {
      setTsDetail(null)
      setTsDetailLoading(false)
      return
    }
    const reqId = tsDetailReqRef.current + 1
    tsDetailReqRef.current = reqId
    setTsDetailLoading(true)
    const fetchDetail = window.loadgic?.getTsSymbolDetail?.(
      filePath,
      detailItem,
      activeDetail?.line,
      activeDetail?.column
    )
    if (!fetchDetail) {
      setTsDetail(null)
      setTsDetailLoading(false)
      return
    }
    let timedOut = false
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      if (tsDetailReqRef.current === reqId) {
        setTsDetail(null)
        setTsDetailLoading(false)
      }
    }, 1500)
    fetchDetail
      .then((detail) => {
        if (timedOut || tsDetailReqRef.current !== reqId) return
        setTsDetail(detail)
      })
      .catch(() => {
        if (timedOut || tsDetailReqRef.current !== reqId) return
        setTsDetail(null)
      })
      .finally(() => {
        window.clearTimeout(timeoutId)
        if (timedOut || tsDetailReqRef.current !== reqId) return
        setTsDetailLoading(false)
      })
  }, [filePath, activeTab, tabs])

  useEffect(() => {
    if (!filePath) return
    setActiveTab((prev) => (tabs.some((tab) => tab.id === prev) ? prev : 'overview'))
  }, [filePath, tabs])

  function handleSelectItem(value: string, line?: number, column?: number) {
    const id = `detail:${value}`
    setTabs((prev) => {
      if (prev.some((tab) => tab.id === id)) return prev
      return [...prev, { id, label: value, value, line, column }]
    })
    setActiveTab(id)
  }

  function closeTab(tabId: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId)
      setActiveTab(next.find((t) => t.id === activeTab) ? activeTab : 'overview')
      return next
    })
  }

  function handleTabsWheel(event: React.WheelEvent<HTMLDivElement>) {
    const container = event.currentTarget
    if (container.scrollWidth <= container.clientWidth) return
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (delta === 0) return
    event.preventDefault()
    container.scrollLeft += delta
  }

  useEffect(() => {
    if (!externalDetail) return
    const value = externalDetail.value
    if (!value) return
    setTabs((prev) => {
      const selectorId = 'selector'
      const existing = prev.find((tab) => tab.id === selectorId)
      if (existing) {
        return prev.map((tab) =>
          tab.id === selectorId
            ? { ...tab, value, line: externalDetail.line, column: externalDetail.column }
            : tab
        )
      }
      return [
        ...prev,
        {
          id: selectorId,
          label: 'Selector',
          value,
          line: externalDetail.line,
          column: externalDetail.column,
        },
      ]
    })
    setActiveTab('selector')
  }, [externalDetail?.nonce])

  const orderedTabs = [
    ...tabs.filter((tab) => tab.id === 'overview'),
    ...tabs.filter((tab) => tab.id === 'selector'),
    ...tabs.filter((tab) => tab.id !== 'overview' && tab.id !== 'selector'),
  ]

  const tabsBar = (
    <div className="inspector-tabs" onWheel={handleTabsWheel}>
      {orderedTabs.map((tab) => (
        <button
          key={tab.id}
          className={`inspector-tab${tab.id === activeTab ? ' active' : ''}`}
          data-tab={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          title={tab.label}
        >
          <span className="inspector-tab-label">{tab.label}</span>
          {tab.id !== 'overview' ? (
            <span
              className="inspector-tab-close"
              role="button"
              aria-label="Close tab"
              onClick={(event) => {
                event.stopPropagation()
                closeTab(tab.id)
              }}
            >
              ✕
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )

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

  if (activeTab !== 'overview') {
    const detailItem = tabs.find((tab) => tab.id === activeTab)?.value
    if (!detailItem) {
      return (
        <div className="inspector-body">
          <div className="inspector-muted">No detail available.</div>
        </div>
      )
    }
    const extension =
      filePath?.split('.').pop()?.toUpperCase() ?? 'Unknown'
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-detail-header">
          <span className="inspector-detail-title">Detail</span>
          <span className="inspector-detail-chip">{detailItem}</span>
        </div>
        <div className="inspector-detail-card">
          <div className="inspector-detail-label">Overview</div>
          <div className="inspector-detail-grid">
            <div>
              <div className="inspector-detail-key">Symbol</div>
              <div className="inspector-detail-value">{detailItem}</div>
            </div>
            <div>
              <div className="inspector-detail-key">File type</div>
              <div className="inspector-detail-value">{extension}</div>
            </div>
          </div>
        </div>
        {tsDetailLoading ? (
          <div className="inspector-detail-hint">Loading TypeScript details…</div>
        ) : tsDetail ? (
          <div className="inspector-detail-card">
            <div className="inspector-detail-label">TypeScript detail</div>
            <div className="inspector-detail-grid">
              <div>
                <div className="inspector-detail-key">Context</div>
                <div className="inspector-detail-value">{tsDetail.context}</div>
              </div>
              <div>
                <div className="inspector-detail-key">Kind</div>
                <div className="inspector-detail-value">{tsDetail.kind}</div>
              </div>
              <div>
                <div className="inspector-detail-key">Location</div>
                <div className="inspector-detail-value">
                  Line {tsDetail.line}, Col {tsDetail.column}
                </div>
              </div>
              <div>
                <div className="inspector-detail-key">Occurrences</div>
                <div className="inspector-detail-value">
                  {tsDetail.tsOccurrences ??
                    tsDetail.tsReferences ??
                    tsDetail.occurrences}
                </div>
              </div>
              <div>
                <div className="inspector-detail-key">Container</div>
                <div className="inspector-detail-value">
                  {tsDetail.container ?? '—'}
                </div>
              </div>
              <div>
                <div className="inspector-detail-key">Modifiers</div>
                <div className="inspector-detail-value">
                  {tsDetail.modifiers.length
                    ? tsDetail.modifiers.join(', ')
                    : '—'}
                </div>
              </div>
              <div>
                <div className="inspector-detail-key">Exported</div>
                <div className="inspector-detail-value">
                  {tsDetail.isExported ? 'Yes' : 'No'}
                </div>
              </div>
              <div>
                <div className="inspector-detail-key">Default export</div>
                <div className="inspector-detail-value">
                  {tsDetail.isDefaultExport ? 'Yes' : 'No'}
                </div>
              </div>
              <div>
                <div className="inspector-detail-key">Async</div>
                <div className="inspector-detail-value">
                  {tsDetail.isAsync ? 'Yes' : 'No'}
                </div>
              </div>
              <div>
                <div className="inspector-detail-key">Generator</div>
                <div className="inspector-detail-value">
                  {tsDetail.isGenerator ? 'Yes' : 'No'}
                </div>
              </div>
            </div>
            <div className="inspector-detail-code">
              <div className="inspector-detail-key">Declaration snippet</div>
              <div className="inspector-detail-snippet">
                {tsDetail.tsDisplay || tsDetail.snippet || 'No preview available.'}
              </div>
            </div>
            {tsDetail.tsDocs ? (
              <div className="inspector-detail-code">
                <div className="inspector-detail-key">Documentation</div>
                <div className="inspector-detail-snippet">{tsDetail.tsDocs}</div>
              </div>
            ) : null}
            {tsDetail.tsDefinition ? (
              <div className="inspector-detail-code">
                <div className="inspector-detail-key">Definition</div>
                <div className="inspector-detail-snippet">
                  {tsDetail.tsDefinition.file}:{tsDetail.tsDefinition.start.line}:
                  {tsDetail.tsDefinition.start.offset}
                </div>
              </div>
            ) : null}
            {tsDetail.tsTypeDefinition ? (
              <div className="inspector-detail-code">
                <div className="inspector-detail-key">Type definition</div>
                <div className="inspector-detail-snippet">
                  {tsDetail.tsTypeDefinition.file}:
                  {tsDetail.tsTypeDefinition.start.line}:
                  {tsDetail.tsTypeDefinition.start.offset}
                </div>
              </div>
            ) : null}
            {tsDetail.tsSignature ? (
              <div className="inspector-detail-code">
                <div className="inspector-detail-key">Signature</div>
                <div className="inspector-detail-snippet">
                  {tsDetail.tsSignature}
                </div>
                {typeof tsDetail.tsSignatureActiveParam === 'number' ? (
                  <div className="inspector-detail-hint">
                    Active parameter: {tsDetail.tsSignatureActiveParam + 1}
                  </div>
                ) : null}
              </div>
            ) : null}
            {typeof tsDetail.tsDiagnostics === 'number' ? (
              <div className="inspector-detail-code">
                <div className="inspector-detail-key">Diagnostics</div>
                <div className="inspector-detail-snippet">
                  {tsDetail.tsDiagnostics} issue
                  {tsDetail.tsDiagnostics === 1 ? '' : 's'}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="inspector-detail-hint">
            TypeScript details unavailable for this symbol.
          </div>
        )}
        {onRevealSymbol ? (
          <div className="inspector-detail-actions">
            <button
              className="inspector-detail-action"
              type="button"
              onClick={() => onRevealSymbol(detailItem)}
            >
              Reveal in code
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  if (outline.jsonOverview) {
    const overview = outline.jsonOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">JSON Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">{overview.keys.length}</div>
              <div className="inspector-summary-label">Keys</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.objectPaths.length}
              </div>
              <div className="inspector-summary-label">Objects</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.arrayPaths.length}
              </div>
              <div className="inspector-summary-label">Arrays</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.stringValues.length}
              </div>
              <div className="inspector-summary-label">String values</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.numberValues.length}
              </div>
              <div className="inspector-summary-label">Number values</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.booleanValues.length}
              </div>
              <div className="inspector-summary-label">Boolean values</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.nullPaths.length}
              </div>
              <div className="inspector-summary-label">Nulls</div>
            </div>
          </div>
        </div>
        <Section title="Keys" items={overview.keys} onSelectItem={handleSelectItem} />
        <Section
          title="Objects"
          items={overview.objectPaths}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Arrays"
          items={overview.arrayPaths}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="String values"
          items={overview.stringValues}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Number values"
          items={overview.numberValues}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Boolean values"
          items={overview.booleanValues}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Null paths"
          items={overview.nullPaths}
          onSelectItem={handleSelectItem}
        />
      </div>
    )
  }

  if (outline.cOverview) {
    const overview = outline.cOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">C Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">{overview.includes.length}</div>
              <div className="inspector-summary-label">Includes</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.structs.length}</div>
              <div className="inspector-summary-label">Structs/Classes</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.enums.length}</div>
              <div className="inspector-summary-label">Enums</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.typedefs.length}</div>
              <div className="inspector-summary-label">Typedefs</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.functions.length}</div>
              <div className="inspector-summary-label">Functions</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.globals.length}</div>
              <div className="inspector-summary-label">Globals</div>
            </div>
          </div>
        </div>
        <Section
          title="Includes"
          items={overview.includes}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Structs/Classes"
          items={overview.structs}
          onSelectItem={handleSelectItem}
        />
        <Section title="Enums" items={overview.enums} onSelectItem={handleSelectItem} />
        <Section
          title="Typedefs"
          items={overview.typedefs}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Functions"
          items={overview.functions}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Globals"
          items={overview.globals}
          onSelectItem={handleSelectItem}
        />
      </div>
    )
  }

  if (outline.cppOverview) {
    const overview = outline.cppOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">C++ Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">{overview.includes.length}</div>
              <div className="inspector-summary-label">Includes</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.namespaces.length}
              </div>
              <div className="inspector-summary-label">Namespaces</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.classes.length}</div>
              <div className="inspector-summary-label">Classes</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.structs.length}</div>
              <div className="inspector-summary-label">Structs</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.enums.length}</div>
              <div className="inspector-summary-label">Enums</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.typedefs.length}</div>
              <div className="inspector-summary-label">Typedefs</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.functions.length}</div>
              <div className="inspector-summary-label">Functions</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.globals.length}</div>
              <div className="inspector-summary-label">Globals</div>
            </div>
          </div>
        </div>
        <Section
          title="Includes"
          items={overview.includes}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Namespaces"
          items={overview.namespaces}
          onSelectItem={handleSelectItem}
        />
        <Section title="Classes" items={overview.classes} onSelectItem={handleSelectItem} />
        <Section title="Structs" items={overview.structs} onSelectItem={handleSelectItem} />
        <Section title="Enums" items={overview.enums} onSelectItem={handleSelectItem} />
        <Section
          title="Typedefs"
          items={overview.typedefs}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Functions"
          items={overview.functions}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Globals"
          items={overview.globals}
          onSelectItem={handleSelectItem}
        />
      </div>
    )
  }

  if (outline.csOverview) {
    const overview = outline.csOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">C# Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">{overview.usings.length}</div>
              <div className="inspector-summary-label">Usings</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.namespaces.length}
              </div>
              <div className="inspector-summary-label">Namespaces</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.classes.length}</div>
              <div className="inspector-summary-label">Classes</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.structs.length}</div>
              <div className="inspector-summary-label">Structs</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.interfaces.length}
              </div>
              <div className="inspector-summary-label">Interfaces</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.enums.length}</div>
              <div className="inspector-summary-label">Enums</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.methods.length}</div>
              <div className="inspector-summary-label">Methods</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.members.length}</div>
              <div className="inspector-summary-label">Members</div>
            </div>
          </div>
        </div>
        <Section title="Usings" items={overview.usings} onSelectItem={handleSelectItem} />
        <Section
          title="Namespaces"
          items={overview.namespaces}
          onSelectItem={handleSelectItem}
        />
        <Section title="Classes" items={overview.classes} onSelectItem={handleSelectItem} />
        <Section title="Structs" items={overview.structs} onSelectItem={handleSelectItem} />
        <Section
          title="Interfaces"
          items={overview.interfaces}
          onSelectItem={handleSelectItem}
        />
        <Section title="Enums" items={overview.enums} onSelectItem={handleSelectItem} />
        <Section title="Methods" items={overview.methods} onSelectItem={handleSelectItem} />
        <Section title="Members" items={overview.members} onSelectItem={handleSelectItem} />
      </div>
    )
  }

  if (outline.goOverview) {
    const overview = outline.goOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">Go Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">{overview.packages.length}</div>
              <div className="inspector-summary-label">Packages</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.imports.length}</div>
              <div className="inspector-summary-label">Imports</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.structs.length}</div>
              <div className="inspector-summary-label">Structs</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.interfaces.length}
              </div>
              <div className="inspector-summary-label">Interfaces</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.types.length}</div>
              <div className="inspector-summary-label">Types</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.functions.length}</div>
              <div className="inspector-summary-label">Functions</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.methods.length}</div>
              <div className="inspector-summary-label">Methods</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.variables.length}
              </div>
              <div className="inspector-summary-label">Variables</div>
            </div>
          </div>
        </div>
        <Section
          title="Packages"
          items={overview.packages}
          onSelectItem={handleSelectItem}
        />
        <Section title="Imports" items={overview.imports} onSelectItem={handleSelectItem} />
        <Section title="Structs" items={overview.structs} onSelectItem={handleSelectItem} />
        <Section
          title="Interfaces"
          items={overview.interfaces}
          onSelectItem={handleSelectItem}
        />
        <Section title="Types" items={overview.types} onSelectItem={handleSelectItem} />
        <Section
          title="Functions"
          items={overview.functions}
          onSelectItem={handleSelectItem}
        />
        <Section title="Methods" items={overview.methods} onSelectItem={handleSelectItem} />
        <Section
          title="Variables"
          items={overview.variables}
          onSelectItem={handleSelectItem}
        />
      </div>
    )
  }

  if (outline.javaOverview) {
    const overview = outline.javaOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">Java Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">
                {overview.packageName.length}
              </div>
              <div className="inspector-summary-label">Packages</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.imports.length}</div>
              <div className="inspector-summary-label">Imports</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.classes.length}</div>
              <div className="inspector-summary-label">Classes</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.interfaces.length}
              </div>
              <div className="inspector-summary-label">Interfaces</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.enums.length}</div>
              <div className="inspector-summary-label">Enums</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.methods.length}</div>
              <div className="inspector-summary-label">Methods</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.fields.length}</div>
              <div className="inspector-summary-label">Fields</div>
            </div>
          </div>
        </div>
        <Section
          title="Packages"
          items={overview.packageName}
          onSelectItem={handleSelectItem}
        />
        <Section title="Imports" items={overview.imports} onSelectItem={handleSelectItem} />
        <Section title="Classes" items={overview.classes} onSelectItem={handleSelectItem} />
        <Section
          title="Interfaces"
          items={overview.interfaces}
          onSelectItem={handleSelectItem}
        />
        <Section title="Enums" items={overview.enums} onSelectItem={handleSelectItem} />
        <Section title="Methods" items={overview.methods} onSelectItem={handleSelectItem} />
        <Section title="Fields" items={overview.fields} onSelectItem={handleSelectItem} />
      </div>
    )
  }

  if (outline.jsOverview) {
    const overview = outline.jsOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">JavaScript Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">
                {overview.importSources.length}
              </div>
              <div className="inspector-summary-label">Imports</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.importBindings.length}
              </div>
              <div className="inspector-summary-label">Imported symbols</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.exportNames.length}</div>
              <div className="inspector-summary-label">Exports</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.classes.length}</div>
              <div className="inspector-summary-label">Classes</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.functions.length}</div>
              <div className="inspector-summary-label">Functions</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.hooks.length}</div>
              <div className="inspector-summary-label">Hooks</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.variables.length}</div>
              <div className="inspector-summary-label">Variables</div>
            </div>
          </div>
        </div>
        <Section
          title="Import sources"
          items={overview.importSources}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Imported symbols"
          items={overview.importBindings}
          onSelectItem={handleSelectItem}
        />
        <Section title="Exports" items={overview.exportNames} onSelectItem={handleSelectItem} />
        <Section title="Classes" items={overview.classes} onSelectItem={handleSelectItem} />
        <Section title="Functions" items={overview.functions} onSelectItem={handleSelectItem} />
        <Section title="Hooks" items={overview.hooks} onSelectItem={handleSelectItem} />
        <Section title="Variables" items={overview.variables} onSelectItem={handleSelectItem} />
      </div>
    )
  }

  if (outline.jsxOverview) {
    const overview = outline.jsxOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">JSX Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">
                {overview.importSources.length}
              </div>
              <div className="inspector-summary-label">Imports</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.importBindings.length}
              </div>
              <div className="inspector-summary-label">Imported symbols</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.exportNames.length}</div>
              <div className="inspector-summary-label">Exports</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.components.length}
              </div>
              <div className="inspector-summary-label">Components</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.classes.length}</div>
              <div className="inspector-summary-label">Classes</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.functions.length}</div>
              <div className="inspector-summary-label">Functions</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.hooks.length}</div>
              <div className="inspector-summary-label">Hooks</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.variables.length}</div>
              <div className="inspector-summary-label">Variables</div>
            </div>
          </div>
        </div>
        <Section
          title="Import sources"
          items={overview.importSources}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Imported symbols"
          items={overview.importBindings}
          onSelectItem={handleSelectItem}
        />
        <Section title="Exports" items={overview.exportNames} onSelectItem={handleSelectItem} />
        <Section
          title="Components"
          items={overview.components}
          onSelectItem={handleSelectItem}
        />
        <Section title="Classes" items={overview.classes} onSelectItem={handleSelectItem} />
        <Section title="Functions" items={overview.functions} onSelectItem={handleSelectItem} />
        <Section title="Hooks" items={overview.hooks} onSelectItem={handleSelectItem} />
        <Section title="Variables" items={overview.variables} onSelectItem={handleSelectItem} />
      </div>
    )
  }

  if (outline.mdOverview) {
    const overview = outline.mdOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">Markdown Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">{overview.headings.length}</div>
              <div className="inspector-summary-label">Headings</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.links.length}</div>
              <div className="inspector-summary-label">Links</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.codeBlocks.length}
              </div>
              <div className="inspector-summary-label">Code blocks</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.lists.length}</div>
              <div className="inspector-summary-label">Lists</div>
            </div>
          </div>
        </div>
        <Section title="Headings" items={overview.headings} onSelectItem={handleSelectItem} />
        <Section title="Links" items={overview.links} onSelectItem={handleSelectItem} />
        <Section
          title="Code blocks"
          items={overview.codeBlocks}
          onSelectItem={handleSelectItem}
        />
        <Section title="Lists" items={overview.lists} onSelectItem={handleSelectItem} />
      </div>
    )
  }

  if (outline.phpOverview) {
    const overview = outline.phpOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">PHP Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">{overview.namespaces.length}</div>
              <div className="inspector-summary-label">Namespaces</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.uses.length}</div>
              <div className="inspector-summary-label">Uses</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.classes.length}</div>
              <div className="inspector-summary-label">Classes</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.traits.length}</div>
              <div className="inspector-summary-label">Traits</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.interfaces.length}
              </div>
              <div className="inspector-summary-label">Interfaces</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.functions.length}</div>
              <div className="inspector-summary-label">Functions</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.methods.length}</div>
              <div className="inspector-summary-label">Methods</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.properties.length}
              </div>
              <div className="inspector-summary-label">Properties</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.constants.length}
              </div>
              <div className="inspector-summary-label">Constants</div>
            </div>
          </div>
        </div>
        <Section title="Namespaces" items={overview.namespaces} onSelectItem={handleSelectItem} />
        <Section title="Uses" items={overview.uses} onSelectItem={handleSelectItem} />
        <Section title="Classes" items={overview.classes} onSelectItem={handleSelectItem} />
        <Section title="Traits" items={overview.traits} onSelectItem={handleSelectItem} />
        <Section
          title="Interfaces"
          items={overview.interfaces}
          onSelectItem={handleSelectItem}
        />
        <Section title="Functions" items={overview.functions} onSelectItem={handleSelectItem} />
        <Section title="Methods" items={overview.methods} onSelectItem={handleSelectItem} />
        <Section
          title="Properties"
          items={overview.properties}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Constants"
          items={overview.constants}
          onSelectItem={handleSelectItem}
        />
      </div>
    )
  }

  if (outline.pyOverview) {
    const overview = outline.pyOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">Python Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">{overview.imports.length}</div>
              <div className="inspector-summary-label">Imports</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.fromImports.length}
              </div>
              <div className="inspector-summary-label">From imports</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.classes.length}</div>
              <div className="inspector-summary-label">Classes</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.functions.length}</div>
              <div className="inspector-summary-label">Functions</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.methods.length}</div>
              <div className="inspector-summary-label">Methods</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.variables.length}</div>
              <div className="inspector-summary-label">Variables</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.decorators.length}</div>
              <div className="inspector-summary-label">Decorators</div>
            </div>
          </div>
        </div>
        <Section title="Imports" items={overview.imports} onSelectItem={handleSelectItem} />
        <Section
          title="From imports"
          items={overview.fromImports}
          onSelectItem={handleSelectItem}
        />
        <Section title="Classes" items={overview.classes} onSelectItem={handleSelectItem} />
        <Section title="Functions" items={overview.functions} onSelectItem={handleSelectItem} />
        <Section title="Methods" items={overview.methods} onSelectItem={handleSelectItem} />
        <Section title="Variables" items={overview.variables} onSelectItem={handleSelectItem} />
        <Section
          title="Decorators"
          items={overview.decorators}
          onSelectItem={handleSelectItem}
        />
      </div>
    )
  }

  if (outline.rbOverview) {
    const overview = outline.rbOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">Ruby Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">{overview.requires.length}</div>
              <div className="inspector-summary-label">Requires</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.modules.length}</div>
              <div className="inspector-summary-label">Modules</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.classes.length}</div>
              <div className="inspector-summary-label">Classes</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.methods.length}</div>
              <div className="inspector-summary-label">Methods</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.variables.length}</div>
              <div className="inspector-summary-label">Variables</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.constants.length}</div>
              <div className="inspector-summary-label">Constants</div>
            </div>
          </div>
        </div>
        <Section
          title="Requires"
          items={overview.requires}
          onSelectItem={handleSelectItem}
        />
        <Section title="Modules" items={overview.modules} onSelectItem={handleSelectItem} />
        <Section title="Classes" items={overview.classes} onSelectItem={handleSelectItem} />
        <Section title="Methods" items={overview.methods} onSelectItem={handleSelectItem} />
        <Section title="Variables" items={overview.variables} onSelectItem={handleSelectItem} />
        <Section
          title="Constants"
          items={overview.constants}
          onSelectItem={handleSelectItem}
        />
      </div>
    )
  }

  if (outline.rsOverview) {
    const overview = outline.rsOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">Rust Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">{overview.uses.length}</div>
              <div className="inspector-summary-label">Uses</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.modules.length}</div>
              <div className="inspector-summary-label">Modules</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.structs.length}</div>
              <div className="inspector-summary-label">Structs</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.enums.length}</div>
              <div className="inspector-summary-label">Enums</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.traits.length}</div>
              <div className="inspector-summary-label">Traits</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.impls.length}</div>
              <div className="inspector-summary-label">Impls</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.functions.length}</div>
              <div className="inspector-summary-label">Functions</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.types.length}</div>
              <div className="inspector-summary-label">Types</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.constants.length}</div>
              <div className="inspector-summary-label">Constants</div>
            </div>
          </div>
        </div>
        <Section title="Uses" items={overview.uses} onSelectItem={handleSelectItem} />
        <Section title="Modules" items={overview.modules} onSelectItem={handleSelectItem} />
        <Section title="Structs" items={overview.structs} onSelectItem={handleSelectItem} />
        <Section title="Enums" items={overview.enums} onSelectItem={handleSelectItem} />
        <Section title="Traits" items={overview.traits} onSelectItem={handleSelectItem} />
        <Section title="Impls" items={overview.impls} onSelectItem={handleSelectItem} />
        <Section title="Functions" items={overview.functions} onSelectItem={handleSelectItem} />
        <Section title="Types" items={overview.types} onSelectItem={handleSelectItem} />
        <Section
          title="Constants"
          items={overview.constants}
          onSelectItem={handleSelectItem}
        />
      </div>
    )
  }

  if (outline.tsOverview) {
    const overview = outline.tsOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">TypeScript Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">
                {overview.importSources.length}
              </div>
              <div className="inspector-summary-label">Imports</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.importBindings.length}
              </div>
              <div className="inspector-summary-label">Imported symbols</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.exportNames.length}</div>
              <div className="inspector-summary-label">Exports</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.interfaces.length}</div>
              <div className="inspector-summary-label">Interfaces</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.types.length}</div>
              <div className="inspector-summary-label">Types</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.enums.length}</div>
              <div className="inspector-summary-label">Enums</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.classes.length}</div>
              <div className="inspector-summary-label">Classes</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.functions.length}</div>
              <div className="inspector-summary-label">Functions</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.variables.length}</div>
              <div className="inspector-summary-label">Variables</div>
            </div>
          </div>
        </div>
        <Section
          title="Import sources"
          items={overview.importSources}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Imported symbols"
          items={overview.importBindings}
          onSelectItem={handleSelectItem}
        />
        <Section title="Exports" items={overview.exportNames} onSelectItem={handleSelectItem} />
        <Section title="Interfaces" items={overview.interfaces} onSelectItem={handleSelectItem} />
        <Section title="Types" items={overview.types} onSelectItem={handleSelectItem} />
        <Section title="Enums" items={overview.enums} onSelectItem={handleSelectItem} />
        <Section title="Classes" items={overview.classes} onSelectItem={handleSelectItem} />
        <Section title="Functions" items={overview.functions} onSelectItem={handleSelectItem} />
        <Section title="Variables" items={overview.variables} onSelectItem={handleSelectItem} />
      </div>
    )
  }

  if (outline.tsxOverview) {
    const overview = outline.tsxOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">TSX Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">
                {overview.importSources.length}
              </div>
              <div className="inspector-summary-label">Imports</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.importBindings.length}
              </div>
              <div className="inspector-summary-label">Imported symbols</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.exportNames.length}</div>
              <div className="inspector-summary-label">Exports</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.components.length}
              </div>
              <div className="inspector-summary-label">Components</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.interfaces.length}</div>
              <div className="inspector-summary-label">Interfaces</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.types.length}</div>
              <div className="inspector-summary-label">Types</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.enums.length}</div>
              <div className="inspector-summary-label">Enums</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.classes.length}</div>
              <div className="inspector-summary-label">Classes</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.functions.length}</div>
              <div className="inspector-summary-label">Functions</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.hooks.length}</div>
              <div className="inspector-summary-label">Hooks</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.variables.length}</div>
              <div className="inspector-summary-label">Variables</div>
            </div>
          </div>
        </div>
        <Section
          title="Import sources"
          items={overview.importSources}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Imported symbols"
          items={overview.importBindings}
          onSelectItem={handleSelectItem}
        />
        <Section title="Exports" items={overview.exportNames} onSelectItem={handleSelectItem} />
        <Section
          title="Components"
          items={overview.components}
          onSelectItem={handleSelectItem}
        />
        <Section
          title="Interfaces"
          items={overview.interfaces}
          onSelectItem={handleSelectItem}
        />
        <Section title="Types" items={overview.types} onSelectItem={handleSelectItem} />
        <Section title="Enums" items={overview.enums} onSelectItem={handleSelectItem} />
        <Section title="Classes" items={overview.classes} onSelectItem={handleSelectItem} />
        <Section title="Functions" items={overview.functions} onSelectItem={handleSelectItem} />
        <Section title="Hooks" items={overview.hooks} onSelectItem={handleSelectItem} />
        <Section title="Variables" items={overview.variables} onSelectItem={handleSelectItem} />
      </div>
    )
  }

  if (outline.ymlOverview) {
    const overview = outline.ymlOverview
    return (
      <div className="inspector-body inspector-scroll">
        {tabsBar}
        <div className="inspector-summary">
          <div className="inspector-summary-title">YAML Overview</div>
          <div className="inspector-summary-grid">
            <div>
              <div className="inspector-summary-value">{overview.keys.length}</div>
              <div className="inspector-summary-label">Keys</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.objectPaths.length}
              </div>
              <div className="inspector-summary-label">Objects</div>
            </div>
            <div>
              <div className="inspector-summary-value">{overview.arrayPaths.length}</div>
              <div className="inspector-summary-label">Arrays</div>
            </div>
            <div>
              <div className="inspector-summary-value">
                {overview.scalarValues.length}
              </div>
              <div className="inspector-summary-label">Values</div>
            </div>
          </div>
        </div>
        <Section title="Keys" items={overview.keys} onSelectItem={handleSelectItem} />
        <Section
          title="Objects"
          items={overview.objectPaths}
          onSelectItem={handleSelectItem}
        />
        <Section title="Arrays" items={overview.arrayPaths} onSelectItem={handleSelectItem} />
        <Section
          title="Values"
          items={overview.scalarValues}
          onSelectItem={handleSelectItem}
        />
      </div>
    )
  }

  // Render inspector panel with file outline
  return (
    <div className="inspector-body inspector-scroll">
        {tabsBar}
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
        onSelectItem={handleSelectItem}
      />
      <Section
        title="Imported symbols"
        items={outline.importBindings}
        onSelectItem={handleSelectItem}
      />
      <Section title="Exports" items={outline.exports} onSelectItem={handleSelectItem} />
      <Section
        title="Export sources"
        items={outline.exportSources}
        onSelectItem={handleSelectItem}
      />
      <Section title="Classes" items={outline.classes} onSelectItem={handleSelectItem} />
      <Section title="Functions" items={outline.functions} onSelectItem={handleSelectItem} />
      <Section title="Hooks" items={outline.hooks} onSelectItem={handleSelectItem} />
      <Section
        title="Interfaces"
        items={outline.interfaces}
        onSelectItem={handleSelectItem}
      />
      <Section title="Types" items={outline.types} onSelectItem={handleSelectItem} />
      <Section title="Enums" items={outline.enums} onSelectItem={handleSelectItem} />
      <Section title="Variables" items={outline.variables} onSelectItem={handleSelectItem} />
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
