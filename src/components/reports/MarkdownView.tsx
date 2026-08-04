'use client'

import { Children, useMemo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  splitSmartBlocks, parseStatusLead,
  type SmartBlock, type HeroBlock, type TextBar, type StatusLead, type StatusTone,
} from '@/lib/reports/smartBlocks'
import { GOLD, EMERALD, OXIDE, SAPPHIRE, MUTED } from '@/lib/theme/palette'

/**
 * Markdown renderer for reports — a smart one.
 *
 * It began as a plain react-markdown wrapper whose whole job was to make a code
 * block scroll rather than wrap, because a Sentinel-7 report's banner, bars and
 * ledgers are fixed-width ASCII and a phone is not. That works, and it looks
 * like a terminal.
 *
 * So the text is now READ before it is rendered (`src/lib/reports/smartBlocks.ts`):
 * a `╔══╗` banner becomes a hero card, a run of `████░░░░` becomes real bars, a
 * bare pipe table gets the alignment row GFM wanted, and a `🟢 QUICK VERDICT`
 * lead becomes a badge. Everything the splitter does not recognise renders
 * exactly as it did before — as markdown, or preformatted and scrolling. The
 * report format still lives outside this app; this only changes how it is drawn.
 */
export function MarkdownView({ md }: { md: string }) {
  const blocks = useMemo(() => splitSmartBlocks(md), [md])
  return (
    <div className="space-y-3 text-fluid-sm leading-relaxed text-text/90">
      {blocks.map((b, i) => <Block key={i} block={b} />)}
    </div>
  )
}

function Block({ block }: { block: SmartBlock }) {
  switch (block.kind) {
    case 'hero': return <HeroCard hero={block} />
    case 'bars': return <BarSet bars={block.bars} />
    case 'code':
      return (
        // A code block SCROLLS, never wraps — ASCII charts are fixed-width by
        // construction and every one of them is wider than a phone.
        <pre className="report-pre overflow-x-auto rounded-lg bg-black/25 border border-white/[0.07] p-3 text-[11px] leading-[1.45]">
          {block.text}
        </pre>
      )
    default: return <Markdown md={block.text} />
  }
}

// ── native widgets ───────────────────────────────────────────────────────────

/**
 * The banner box, as a card.
 *
 * The first ` · `-separated segment is the headline and the rest become chips,
 * because that is how the banner is already written — "W01 · 2026-07-19 → 07-25
 * · CUT / RE-ENTRY · FMT v2" is a title followed by four facts, and a row of
 * chips is what four facts look like when they aren't fighting a monospace grid.
 */
function HeroCard({ hero }: { hero: HeroBlock }) {
  return (
    <header className="relative overflow-hidden rounded-2xl border px-4 py-3.5 space-y-2"
      style={{
        borderColor: `${GOLD}3d`,
        background: `linear-gradient(160deg, ${GOLD}14, rgba(255,255,255,0.02) 55%)`,
        boxShadow: `0 0 24px ${GOLD}1f, inset 0 1px 0 ${GOLD}2e`,
      }}>
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      <p className="font-heading text-fluid-base font-bold uppercase tracking-wide text-text">
        {hero.headline}
      </p>
      {hero.chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hero.chips.map((c, i) => (
            <span key={`${c}-${i}`} className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ color: GOLD, background: `${GOLD}1a`, border: `1px solid ${GOLD}44` }}>{c}</span>
          ))}
        </div>
      )}
      {hero.lines.map((l, i) => {
        // A banner's last line is usually a verdict ("🟢 STATUS: ON-BLUEPRINT
        // — …"), which is the one thing on the card worth badging.
        const lead = parseStatusLead(l)
        return (
          <p key={i} className="text-fluid-xs text-muted leading-snug">
            {lead ? <><StatusBadge lead={lead} />{lead.rest && <span className="ml-2 text-text/85">{lead.rest}</span>}</> : l}
          </p>
        )
      })}
    </header>
  )
}

/**
 * Text bars, drawn.
 *
 * The fill comes from the glyphs, but the NUMBER is whatever the author wrote —
 * a bar drawn at 16 characters can only express 6.25% steps, so re-deriving a
 * percentage from it would print 75% under a line that says 78%.
 */
function BarSet({ bars }: { bars: TextBar[] }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 space-y-2">
      {bars.map((b, i) => {
        const pct = b.pct ?? Math.round(b.ratio * 100)
        const over = pct > 100
        const color = over ? GOLD : pct >= 66 ? EMERALD : pct >= 33 ? SAPPHIRE : OXIDE
        return (
          <div key={`${b.label}-${i}`} className="space-y-1">
            <div className="flex items-baseline gap-2 text-fluid-xs">
              {b.label && <span className="text-text/85 truncate min-w-0">{b.label}</span>}
              <span className="helix-num ml-auto font-bold tabular-nums shrink-0" style={{ color }}>
                {b.trailing || `${pct}%`}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden" aria-hidden="true">
              <div className="h-full rounded-full transition-[width]"
                style={{
                  width: `${Math.min(100, Math.max(0, b.ratio * 100))}%`,
                  background: color,
                  boxShadow: `0 0 8px ${color}66`,
                }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

const TONE_COLOR: Record<StatusTone, string> = {
  good: EMERALD, warn: GOLD, bad: OXIDE, info: SAPPHIRE,
}

function StatusBadge({ lead }: { lead: StatusLead }) {
  const color = TONE_COLOR[lead.tone]
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full align-middle"
      style={{ color, background: `${color}1a`, border: `1px solid ${color}4d` }}>
      <span aria-hidden="true">{lead.emoji}</span>{lead.label}
    </span>
  )
}

/**
 * Pull a status lead off the front of a rendered node list, if there is one.
 * Only the FIRST child is inspected — a badge has to open the line to be a
 * badge, and anything else is an emoji in the middle of a sentence.
 */
function leadOf(children: ReactNode): { lead: StatusLead; tail: ReactNode[] } | null {
  const arr = Children.toArray(children)
  if (typeof arr[0] !== 'string') return null
  const lead = parseStatusLead(arr[0])
  return lead ? { lead, tail: arr.slice(1) } : null
}

// ── markdown ─────────────────────────────────────────────────────────────────

function Markdown({ md }: { md: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="font-heading font-bold text-fluid-xl text-text mt-5 first:mt-0">{children}</h1>,
        // Accented, and spaced enough to actually separate sections — a heading
        // that only differs in weight reads as bold text, not as a division.
        h2: ({ children }) => (
          <h2 className="font-heading font-bold text-fluid-lg text-text mt-6 first:mt-0 pb-1.5 flex items-center gap-2">
            <span aria-hidden="true" className="h-4 w-1 rounded-full shrink-0" style={{ background: GOLD, boxShadow: `0 0 8px ${GOLD}88` }} />
            <span className="min-w-0">{children}</span>
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="font-heading font-semibold text-fluid-base mt-4 first:mt-0" style={{ color: SAPPHIRE }}>{children}</h3>
        ),
        h4: ({ children }) => <h4 className="font-heading font-semibold text-fluid-sm text-text/90 mt-3 uppercase tracking-wide">{children}</h4>,
        p: ({ children }) => {
          const hit = leadOf(children)
          if (!hit) return <p className="leading-relaxed" dir="auto">{children}</p>
          return (
            <p className="leading-relaxed" dir="auto">
              <StatusBadge lead={hit.lead} />
              {hit.lead.rest && <span className="ml-2">{hit.lead.rest}</span>}
              {hit.tail}
            </p>
          )
        },
        ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 marker:text-primary">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 marker:text-muted">{children}</ol>,
        li: ({ children }) => {
          const hit = leadOf(children)
          if (!hit) return <li className="leading-relaxed" dir="auto">{children}</li>
          return (
            <li className="leading-relaxed list-none -ml-5" dir="auto">
              <StatusBadge lead={hit.lead} />
              {hit.lead.rest && <span className="ml-2">{hit.lead.rest}</span>}
              {hit.tail}
            </li>
          )
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 pl-3 py-1 text-muted italic rounded-r-lg"
            style={{ borderColor: `${SAPPHIRE}80`, background: `${SAPPHIRE}0d` }}>{children}</blockquote>
        ),
        // `---` is a division, so it gets drawn like one: a rule that fades at
        // both ends with a lit node in the middle.
        hr: () => (
          <div className="relative my-6 h-px" aria-hidden="true">
            <span className="absolute inset-0"
              style={{ background: `linear-gradient(90deg, transparent, ${MUTED}59 20%, ${MUTED}59 80%, transparent)` }} />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rotate-45 rounded-[1px]"
              style={{ background: GOLD, boxShadow: `0 0 8px ${GOLD}` }} />
          </div>
        ),
        a: ({ href, children }) => (
          // Links only ever arrive inside pasted report text — never hand the
          // opener window to something we didn't author.
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
            {children}
          </a>
        ),
        strong: ({ children }) => <strong className="text-text font-semibold">{children}</strong>,
        em: ({ children }) => <em className="text-muted">{children}</em>,
        // A table scrolls inside its own container, so the page body never
        // scrolls sideways; the header stays put while it does.
        table: ({ children }) => (
          <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.015]">
            <table className="w-full text-fluid-xs border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="text-muted sticky top-0 backdrop-blur-sm" style={{ background: 'rgba(12,14,18,0.86)' }}>{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-[10px] border-b border-white/[0.10] whitespace-nowrap">{children}</th>
        ),
        tr: ({ children }) => <tr className="even:bg-white/[0.02]">{children}</tr>,
        td: ({ children }) => (
          <td className="px-3 py-1.5 border-b border-white/[0.04] align-top helix-num tabular-nums text-text/90">{children}</td>
        ),
        code: ({ className, children, ...props }) => {
          // react-markdown tags a fenced block with `language-*`; inline code
          // has no class. Only the inline case gets a pill.
          const fenced = /language-/.test(className ?? '')
          if (fenced) return <code className={className} {...props}>{children}</code>
          return <code className="rounded px-1 py-px bg-white/[0.06] text-[0.92em] font-mono text-primary">{children}</code>
        },
        pre: ({ children }) => (
          <pre className="report-pre overflow-x-auto rounded-lg bg-black/25 border border-white/[0.07] p-3 text-[11px] leading-[1.45]">
            {children}
          </pre>
        ),
      }}
    >
      {md}
    </ReactMarkdown>
  )
}
