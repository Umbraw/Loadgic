type ParsedLGDoc = {
  title?: string
  markdown: string
}

type ParamEntry = { name: string; text: string }

export function parseLGDoc(raw: string): ParsedLGDoc {
  const lines = raw.split(/\r?\n/)
  let title = ''
  const summary: string[] = []
  const notes: string[] = []
  const warnings: string[] = []
  const params: ParamEntry[] = []
  let returns = ''
  const links: string[] = []
  const exampleLines: string[] = []
  let inExample = false

  const flushExample = () => {
    if (!inExample) return
    inExample = false
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const directiveMatch = trimmed.match(/^@(\w+)\s*(.*)$/)
    if (directiveMatch) {
      const [, directive, rest] = directiveMatch
      flushExample()
      switch (directive.toLowerCase()) {
        case 'title':
          title = rest.trim()
          break
        case 'summary':
          if (rest.trim()) summary.push(rest.trim())
          break
        case 'param': {
          const [name, ...desc] = rest.split(' ')
          if (name) {
            params.push({
              name: name.trim(),
              text: desc.join(' ').trim(),
            })
          }
          break
        }
        case 'returns':
          returns = rest.trim()
          break
        case 'note':
          if (rest.trim()) notes.push(rest.trim())
          break
        case 'warning':
          if (rest.trim()) warnings.push(rest.trim())
          break
        case 'example':
          inExample = true
          break
        case 'link':
          if (rest.trim()) links.push(rest.trim())
          break
        default:
          if (!title && (directive || rest)) {
            title = [directive, rest].filter(Boolean).join(' ').trim()
          } else if (directive || rest) {
            notes.push([directive, rest].filter(Boolean).join(' ').trim())
          }
          break
      }
      continue
    }
    if (inExample) {
      exampleLines.push(line)
      continue
    }
    if (trimmed.length === 0) continue
    if (!summary.length) summary.push(trimmed)
    else notes.push(trimmed)
  }

  flushExample()

  const markdown: string[] = []
  if (title) markdown.push(`### ${title}`)
  if (summary.length) markdown.push(summary.join(' '))
  if (params.length) {
    markdown.push('### Parameters')
    markdown.push(
      params
        .map((param) =>
          param.text
            ? `- \`${param.name}\`: ${param.text}`
            : `- \`${param.name}\``
        )
        .join('\n')
    )
  }
  if (returns) {
    markdown.push('### Returns')
    markdown.push(returns)
  }
  if (notes.length) {
    markdown.push('### Notes')
    markdown.push(notes.join('\n'))
  }
  if (warnings.length) {
    markdown.push('### Warnings')
    markdown.push(warnings.join('\n'))
  }
  if (exampleLines.length) {
    markdown.push('### Example')
    markdown.push(['```txt', ...exampleLines, '```'].join('\n'))
  }
  if (links.length) {
    markdown.push('### Links')
    markdown.push(links.map((link) => `- ${link}`).join('\n'))
  }

  return {
    title: title || undefined,
    markdown: markdown.join('\n\n').trim(),
  }
}
