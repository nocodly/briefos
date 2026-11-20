import { Fragment, useState, type ReactNode } from 'react'

// =============================================================================
// Minimal, safe markdown renderer for AI notes: #/##/### headings, "-"/"*"
// bullets (2-space nesting), numbered lists, | tables |, > quotes, **bold**,
// `code`, paragraphs.
// Produces React elements only — never dangerouslySetInnerHTML.
// =============================================================================

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={k++} className="font-semibold text-text">{tok.slice(2, -2)}</strong>)
    else out.push(<code key={k++} className="font-mono text-[12px] bg-bg-2 px-1 rounded">{tok.slice(1, -1)}</code>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** A quoted block (the follow-up email) with a one-click Copy. */
function QuoteBlock({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(lines.join('\n').replace(/\*\*/g, '')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="relative mb-4 rounded-card border border-border-soft bg-white/[.03] py-3 pl-4 pr-24">
      <button
        onClick={copy}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-medium text-text-2 hover:border-accent/50 hover:text-text"
      >
        <i className={`ti ti-${copied ? 'check' : 'copy'} text-[13px]`} /> {copied ? 'Copied' : 'Copy'}
      </button>
      {lines.map((l, i) =>
        l.trim() ? (
          <p key={i} className="text-[14px] leading-relaxed text-text-2">
            {inline(l)}
          </p>
        ) : (
          <div key={i} className="h-3" />
        )
      )}
    </div>
  )
}

export default function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let list: { depth: number; text: string; ordered: boolean }[] = []
  let table: string[][] = []
  let quote: string[] = []

  const flushQuote = () => {
    if (!quote.length) return
    const q = quote
    quote = []
    while (q.length && !q[q.length - 1].trim()) q.pop()
    blocks.push(<QuoteBlock key={blocks.length} lines={q} />)
  }

  const cells = (row: string) =>
    row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim())

  const flushTable = () => {
    if (!table.length) return
    const [head, ...body] = table
    table = []
    blocks.push(
      <div key={blocks.length} className="mb-4 overflow-x-auto rounded-card border border-border-soft">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-white/[.04]">
              {head.map((c, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold text-text">
                  {inline(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i} className="border-t border-border-soft">
                {head.map((_, j) => (
                  <td key={j} className="px-3 py-2 align-top text-text-2">
                    {inline(r[j] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const flushList = () => {
    if (!list.length) return
    const items = list
    list = []
    blocks.push(
      <ul key={blocks.length} className="mb-4 space-y-1.5">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex gap-2 text-[14px] text-text-2 leading-relaxed"
            style={{ paddingLeft: it.depth * 18 }}
          >
            <span className="text-text-4 select-none mt-[1px]">{it.ordered ? '›' : '•'}</span>
            <span>{inline(it.text)}</span>
          </li>
        ))}
      </ul>
    )
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    // Table rows: | a | b |  (the |---|---| separator row is skipped).
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushList()
      if (!/^\s*\|[\s:|-]+\|\s*$/.test(line)) table.push(cells(line))
      continue
    }
    flushTable()
    const quoted = /^>\s?(.*)$/.exec(line)
    if (quoted) {
      flushList()
      quote.push(quoted[1])
      continue
    }
    flushQuote()
    const bullet = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line)
    if (bullet) {
      list.push({
        depth: Math.floor(bullet[1].length / 2),
        text: bullet[3],
        ordered: /\d/.test(bullet[2])
      })
      continue
    }
    flushList()
    if (!line.trim()) continue
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      blocks.push(
        <h3
          key={blocks.length}
          className={
            level === 1
              ? 'font-display font-bold text-[20px] text-text mt-2 mb-3'
              : 'font-display font-bold text-[15px] text-text mt-5 mb-2'
          }
        >
          {inline(h[2])}
        </h3>
      )
      continue
    }
    blocks.push(
      <p key={blocks.length} className="text-[14px] text-text-2 leading-relaxed mb-3">
        {inline(line)}
      </p>
    )
  }
  flushList()
  flushTable()
  flushQuote()

  return <Fragment>{blocks}</Fragment>
}
