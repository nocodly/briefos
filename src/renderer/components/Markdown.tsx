import { Fragment, type ReactNode } from 'react'

// =============================================================================
// Minimal, safe markdown renderer for AI notes: #/##/### headings, "-"/"*"
// bullets (2-space nesting), numbered lists, **bold**, `code`, paragraphs.
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

export default function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let list: { depth: number; text: string; ordered: boolean }[] = []

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

  return <Fragment>{blocks}</Fragment>
}
