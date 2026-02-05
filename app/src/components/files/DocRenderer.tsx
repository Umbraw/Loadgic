import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

type Props = {
  markdown: string
  onSelectSymbol?: (symbolId: string) => void
  symbolNames?: Record<string, string>
}

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'loadgic-symbol'],
  },
}

function replaceSymbolLinks(
  markdown: string,
  symbolNames?: Record<string, string>
) {
  return markdown.replace(/\[\[symbol:([^\]]+)\]\]/g, (_match, id: string) => {
    const label = symbolNames?.[id] ?? id
    return `[${label}](loadgic-symbol:${id})`
  })
}

export default function DocRenderer({
  markdown,
  onSelectSymbol,
  symbolNames,
}: Props) {
  const normalized = useMemo(
    () => replaceSymbolLinks(markdown, symbolNames),
    [markdown, symbolNames]
  )

  return (
    <ReactMarkdown
      skipHtml
      rehypePlugins={[rehypeSanitize(sanitizeSchema)]}
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith('loadgic-symbol:')) {
            const symbolId = href.replace('loadgic-symbol:', '')
            return (
              <button
                type="button"
                className="file-viewer-docs-link"
                onClick={() => onSelectSymbol?.(symbolId)}
              >
                {children}
              </button>
            )
          }
          return (
            <a
              href={href}
              className="file-viewer-docs-link external"
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          )
        },
        code: ({ children }) => (
          <code className="file-viewer-docs-code">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="file-viewer-docs-pre">{children}</pre>
        ),
      }}
    >
      {normalized}
    </ReactMarkdown>
  )
}
