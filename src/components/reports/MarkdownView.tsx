'use client'

import { Fragment } from 'react'

/** Inline: **bold** + `code`, otherwise plain. Numbers stay legible via mono spans. */
function inline(text: string, k: number) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return (
    <Fragment key={k}>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="text-text font-semibold">{p.slice(2, -2)}</strong>
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="helix-num text-primary">{p.slice(1, -1)}</code>
        return <Fragment key={i}>{p}</Fragment>
      })}
    </Fragment>
  )
}

const cells = (row: string) => row.replace(/^\||\|$/g, '').split('|').map((s) => s.trim())

/**
 * A premium markdown-lite renderer for AI reports — headings, pipe-tables
 * (→ real styled tables), styled bullets, and quotes. No raw whitespace-pre-wrap.
 */
export function MarkdownView({ md }: { md: string }) {
  const lines = md.split(/\r?\n/)
  const out: React.ReactNode[] = []
  let i = 0, key = 0

  while (i < lines.length) {
    const t = lines[i].trim()
    if (!t) { i++; continue }

    // Pipe table: "| a | b |" followed by a "|---|---|" separator
    if (t.startsWith('|') && i + 1 < lines.length && /^\|?[\s:|-]*-[\s:|-]*\|?$/.test(lines[i + 1].trim())) {
      const header = cells(t)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i].trim())); i++ }
      out.push(
        <div key={key++} className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-fluid-xs">
            <thead><tr className="border-b border-white/[0.08]">{header.map((h, j) => <th key={j} className="px-3 py-2 text-left font-semibold text-muted-vital">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri} className="border-b border-white/[0.04] last:border-0">{r.map((c, cj) => <td key={cj} className="px-3 py-1.5 helix-num text-text/90">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      )
      continue
    }

    // Headings
    const h = t.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const lvl = h[1].length
      const cls = lvl <= 1 ? 'text-fluid-lg font-bold text-text mt-1'
        : lvl === 2 ? 'font-heading text-fluid-base font-semibold text-text mt-1'
        : 'text-fluid-sm font-semibold text-muted-vital uppercase tracking-wide'
      out.push(<p key={key++} className={cls}>{inline(h[2], 0)}</p>)
      i++; continue
    }

    // Quote / callout
    if (t.startsWith('>')) {
      out.push(<blockquote key={key++} className="border-l-2 border-primary/50 pl-3 text-fluid-sm text-muted-vital italic">{inline(t.replace(/^>\s?/, ''), 0)}</blockquote>)
      i++; continue
    }

    // Bullet group
    if (/^[-*]\s+/.test(t) || /^- \[[ x]\]/.test(t)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].trim().replace(/^[-*]\s+/, '')); i++ }
      out.push(
        <ul key={key++} className="space-y-1">
          {items.map((it, ii) => (
            <li key={ii} className="flex gap-2 text-fluid-sm text-text/90">
              <span className="mt-1.5 h-1 w-1 rounded-full bg-primary shrink-0" />
              <span className="min-w-0">{inline(it.replace(/^\[[ x]\]\s*/, ''), 0)}</span>
            </li>
          ))}
        </ul>,
      )
      continue
    }

    // Paragraph (collect consecutive plain lines)
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|[-*]\s|>|\|)/.test(lines[i].trim())) { para.push(lines[i].trim()); i++ }
    out.push(<p key={key++} className="text-fluid-sm text-text/85 leading-relaxed" dir="auto">{inline(para.join(' '), 0)}</p>)
  }

  return <div className="space-y-2.5">{out}</div>
}
