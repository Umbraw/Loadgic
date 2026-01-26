import { useEffect, useRef, useState } from 'react'
import type { FileContent } from '../../types/file'
import type { Outline } from '../../analyzers/types'
import { useTheme } from '../../theme/ThemeProvider'

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
  const { analysisSettings } = useTheme()
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
    worker.postMessage({
      id,
      filePath,
      content: fileContent.content,
      settings: analysisSettings,
      baseUrl: window.location.origin,
    })
  }, [filePath, fileContent, analysisSettings])

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

  if (outline.jsonOverview) {
    const overview = outline.jsonOverview
    return (
      <div className="inspector-body inspector-scroll">
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
        <Section title="Keys" items={overview.keys} onSelectItem={onRevealSymbol} />
        <Section
          title="Objects"
          items={overview.objectPaths}
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Arrays"
          items={overview.arrayPaths}
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="String values"
          items={overview.stringValues}
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Number values"
          items={overview.numberValues}
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Boolean values"
          items={overview.booleanValues}
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Null paths"
          items={overview.nullPaths}
          onSelectItem={onRevealSymbol}
        />
      </div>
    )
  }

  if (outline.cOverview) {
    const overview = outline.cOverview
    return (
      <div className="inspector-body inspector-scroll">
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
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Structs/Classes"
          items={overview.structs}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Enums" items={overview.enums} onSelectItem={onRevealSymbol} />
        <Section
          title="Typedefs"
          items={overview.typedefs}
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Functions"
          items={overview.functions}
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Globals"
          items={overview.globals}
          onSelectItem={onRevealSymbol}
        />
      </div>
    )
  }

  if (outline.cppOverview) {
    const overview = outline.cppOverview
    return (
      <div className="inspector-body inspector-scroll">
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
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Namespaces"
          items={overview.namespaces}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Classes" items={overview.classes} onSelectItem={onRevealSymbol} />
        <Section title="Structs" items={overview.structs} onSelectItem={onRevealSymbol} />
        <Section title="Enums" items={overview.enums} onSelectItem={onRevealSymbol} />
        <Section
          title="Typedefs"
          items={overview.typedefs}
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Functions"
          items={overview.functions}
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Globals"
          items={overview.globals}
          onSelectItem={onRevealSymbol}
        />
      </div>
    )
  }

  if (outline.csOverview) {
    const overview = outline.csOverview
    return (
      <div className="inspector-body inspector-scroll">
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
        <Section title="Usings" items={overview.usings} onSelectItem={onRevealSymbol} />
        <Section
          title="Namespaces"
          items={overview.namespaces}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Classes" items={overview.classes} onSelectItem={onRevealSymbol} />
        <Section title="Structs" items={overview.structs} onSelectItem={onRevealSymbol} />
        <Section
          title="Interfaces"
          items={overview.interfaces}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Enums" items={overview.enums} onSelectItem={onRevealSymbol} />
        <Section title="Methods" items={overview.methods} onSelectItem={onRevealSymbol} />
        <Section title="Members" items={overview.members} onSelectItem={onRevealSymbol} />
      </div>
    )
  }

  if (outline.goOverview) {
    const overview = outline.goOverview
    return (
      <div className="inspector-body inspector-scroll">
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
          onSelectItem={onRevealSymbol}
        />
        <Section title="Imports" items={overview.imports} onSelectItem={onRevealSymbol} />
        <Section title="Structs" items={overview.structs} onSelectItem={onRevealSymbol} />
        <Section
          title="Interfaces"
          items={overview.interfaces}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Types" items={overview.types} onSelectItem={onRevealSymbol} />
        <Section
          title="Functions"
          items={overview.functions}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Methods" items={overview.methods} onSelectItem={onRevealSymbol} />
        <Section
          title="Variables"
          items={overview.variables}
          onSelectItem={onRevealSymbol}
        />
      </div>
    )
  }

  if (outline.javaOverview) {
    const overview = outline.javaOverview
    return (
      <div className="inspector-body inspector-scroll">
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
          onSelectItem={onRevealSymbol}
        />
        <Section title="Imports" items={overview.imports} onSelectItem={onRevealSymbol} />
        <Section title="Classes" items={overview.classes} onSelectItem={onRevealSymbol} />
        <Section
          title="Interfaces"
          items={overview.interfaces}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Enums" items={overview.enums} onSelectItem={onRevealSymbol} />
        <Section title="Methods" items={overview.methods} onSelectItem={onRevealSymbol} />
        <Section title="Fields" items={overview.fields} onSelectItem={onRevealSymbol} />
      </div>
    )
  }

  if (outline.jsOverview) {
    const overview = outline.jsOverview
    return (
      <div className="inspector-body inspector-scroll">
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
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Imported symbols"
          items={overview.importBindings}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Exports" items={overview.exportNames} onSelectItem={onRevealSymbol} />
        <Section title="Classes" items={overview.classes} onSelectItem={onRevealSymbol} />
        <Section title="Functions" items={overview.functions} onSelectItem={onRevealSymbol} />
        <Section title="Hooks" items={overview.hooks} onSelectItem={onRevealSymbol} />
        <Section title="Variables" items={overview.variables} onSelectItem={onRevealSymbol} />
      </div>
    )
  }

  if (outline.jsxOverview) {
    const overview = outline.jsxOverview
    return (
      <div className="inspector-body inspector-scroll">
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
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Imported symbols"
          items={overview.importBindings}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Exports" items={overview.exportNames} onSelectItem={onRevealSymbol} />
        <Section
          title="Components"
          items={overview.components}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Classes" items={overview.classes} onSelectItem={onRevealSymbol} />
        <Section title="Functions" items={overview.functions} onSelectItem={onRevealSymbol} />
        <Section title="Hooks" items={overview.hooks} onSelectItem={onRevealSymbol} />
        <Section title="Variables" items={overview.variables} onSelectItem={onRevealSymbol} />
      </div>
    )
  }

  if (outline.mdOverview) {
    const overview = outline.mdOverview
    return (
      <div className="inspector-body inspector-scroll">
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
        <Section title="Headings" items={overview.headings} onSelectItem={onRevealSymbol} />
        <Section title="Links" items={overview.links} onSelectItem={onRevealSymbol} />
        <Section
          title="Code blocks"
          items={overview.codeBlocks}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Lists" items={overview.lists} onSelectItem={onRevealSymbol} />
      </div>
    )
  }

  if (outline.phpOverview) {
    const overview = outline.phpOverview
    return (
      <div className="inspector-body inspector-scroll">
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
        <Section title="Namespaces" items={overview.namespaces} onSelectItem={onRevealSymbol} />
        <Section title="Uses" items={overview.uses} onSelectItem={onRevealSymbol} />
        <Section title="Classes" items={overview.classes} onSelectItem={onRevealSymbol} />
        <Section title="Traits" items={overview.traits} onSelectItem={onRevealSymbol} />
        <Section
          title="Interfaces"
          items={overview.interfaces}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Functions" items={overview.functions} onSelectItem={onRevealSymbol} />
        <Section title="Methods" items={overview.methods} onSelectItem={onRevealSymbol} />
        <Section
          title="Properties"
          items={overview.properties}
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Constants"
          items={overview.constants}
          onSelectItem={onRevealSymbol}
        />
      </div>
    )
  }

  if (outline.pyOverview) {
    const overview = outline.pyOverview
    return (
      <div className="inspector-body inspector-scroll">
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
        <Section title="Imports" items={overview.imports} onSelectItem={onRevealSymbol} />
        <Section
          title="From imports"
          items={overview.fromImports}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Classes" items={overview.classes} onSelectItem={onRevealSymbol} />
        <Section title="Functions" items={overview.functions} onSelectItem={onRevealSymbol} />
        <Section title="Methods" items={overview.methods} onSelectItem={onRevealSymbol} />
        <Section title="Variables" items={overview.variables} onSelectItem={onRevealSymbol} />
        <Section
          title="Decorators"
          items={overview.decorators}
          onSelectItem={onRevealSymbol}
        />
      </div>
    )
  }

  if (outline.rbOverview) {
    const overview = outline.rbOverview
    return (
      <div className="inspector-body inspector-scroll">
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
          onSelectItem={onRevealSymbol}
        />
        <Section title="Modules" items={overview.modules} onSelectItem={onRevealSymbol} />
        <Section title="Classes" items={overview.classes} onSelectItem={onRevealSymbol} />
        <Section title="Methods" items={overview.methods} onSelectItem={onRevealSymbol} />
        <Section title="Variables" items={overview.variables} onSelectItem={onRevealSymbol} />
        <Section
          title="Constants"
          items={overview.constants}
          onSelectItem={onRevealSymbol}
        />
      </div>
    )
  }

  if (outline.rsOverview) {
    const overview = outline.rsOverview
    return (
      <div className="inspector-body inspector-scroll">
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
        <Section title="Uses" items={overview.uses} onSelectItem={onRevealSymbol} />
        <Section title="Modules" items={overview.modules} onSelectItem={onRevealSymbol} />
        <Section title="Structs" items={overview.structs} onSelectItem={onRevealSymbol} />
        <Section title="Enums" items={overview.enums} onSelectItem={onRevealSymbol} />
        <Section title="Traits" items={overview.traits} onSelectItem={onRevealSymbol} />
        <Section title="Impls" items={overview.impls} onSelectItem={onRevealSymbol} />
        <Section title="Functions" items={overview.functions} onSelectItem={onRevealSymbol} />
        <Section title="Types" items={overview.types} onSelectItem={onRevealSymbol} />
        <Section
          title="Constants"
          items={overview.constants}
          onSelectItem={onRevealSymbol}
        />
      </div>
    )
  }

  if (outline.tsOverview) {
    const overview = outline.tsOverview
    return (
      <div className="inspector-body inspector-scroll">
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
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Imported symbols"
          items={overview.importBindings}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Exports" items={overview.exportNames} onSelectItem={onRevealSymbol} />
        <Section title="Interfaces" items={overview.interfaces} onSelectItem={onRevealSymbol} />
        <Section title="Types" items={overview.types} onSelectItem={onRevealSymbol} />
        <Section title="Enums" items={overview.enums} onSelectItem={onRevealSymbol} />
        <Section title="Classes" items={overview.classes} onSelectItem={onRevealSymbol} />
        <Section title="Functions" items={overview.functions} onSelectItem={onRevealSymbol} />
        <Section title="Variables" items={overview.variables} onSelectItem={onRevealSymbol} />
      </div>
    )
  }

  if (outline.tsxOverview) {
    const overview = outline.tsxOverview
    return (
      <div className="inspector-body inspector-scroll">
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
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Imported symbols"
          items={overview.importBindings}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Exports" items={overview.exportNames} onSelectItem={onRevealSymbol} />
        <Section
          title="Components"
          items={overview.components}
          onSelectItem={onRevealSymbol}
        />
        <Section
          title="Interfaces"
          items={overview.interfaces}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Types" items={overview.types} onSelectItem={onRevealSymbol} />
        <Section title="Enums" items={overview.enums} onSelectItem={onRevealSymbol} />
        <Section title="Classes" items={overview.classes} onSelectItem={onRevealSymbol} />
        <Section title="Functions" items={overview.functions} onSelectItem={onRevealSymbol} />
        <Section title="Hooks" items={overview.hooks} onSelectItem={onRevealSymbol} />
        <Section title="Variables" items={overview.variables} onSelectItem={onRevealSymbol} />
      </div>
    )
  }

  if (outline.ymlOverview) {
    const overview = outline.ymlOverview
    return (
      <div className="inspector-body inspector-scroll">
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
        <Section title="Keys" items={overview.keys} onSelectItem={onRevealSymbol} />
        <Section
          title="Objects"
          items={overview.objectPaths}
          onSelectItem={onRevealSymbol}
        />
        <Section title="Arrays" items={overview.arrayPaths} onSelectItem={onRevealSymbol} />
        <Section
          title="Values"
          items={overview.scalarValues}
          onSelectItem={onRevealSymbol}
        />
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
