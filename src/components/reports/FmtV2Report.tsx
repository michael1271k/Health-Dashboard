'use client'

import { useMemo } from 'react'
import {
  parseFmtV2, bodyCompSeries, parseTdeeAnchors, parseAsymmetry,
  type FmtV2Report as Report, type FmtV2Section, type ParsedTable,
  type TdeeAnchor, type AsymmetryRow,
} from '@/lib/reports/fmtV2'
import { MarkdownView } from './MarkdownView'
import { GOLD, EMERALD, OXIDE, SAPPHIRE, EMBER, PLATINUM, MUTED } from '@/lib/theme/palette'

/**
 * A pasted FMT v2 audit, drawn rather than dumped.
 *
 * Three of its blocks are data that reads badly as monospace text on a phone —
 * five candidate TDEE figures with one adopted, a ten-column body-composition
 * table, and a left/right asymmetry list — so those become charts. EVERYTHING
 * ELSE RENDERS AS WRITTEN. That is not a limitation to fix later: Helix defines
 * no report format, so the renderer must never be the reason a section
 * disappears. A block it does not recognise is a block it prints.
 */
export function FmtV2Report({ md }: { md: string }) {
  const report = useMemo(() => parseFmtV2(md), [md])
  if (!report) return null
  // Nothing structural was found — this is prose that merely mentions "FMT v2".
  if (!report.parts.length) return <MarkdownView md={md} />

  return (
    <div className="space-y-5">
      <Banner report={report} />
      {report.parts.map((part, i) => (
        <section key={`${part.title}-${i}`} className="space-y-3">
          <h2 className="font-heading text-fluid-lg font-bold text-text pb-1 border-b border-white/[0.08]">
            {part.title}
          </h2>
          {part.sections.map((s, j) => <SectionView key={`${s.title}-${j}`} section={s} />)}
        </section>
      ))}
    </div>
  )
}

function Banner({ report }: { report: Report }) {
  const { header } = report
  const chips = [
    header.weekLabel && { label: header.weekLabel, color: SAPPHIRE },
    header.rangeLabel && { label: header.rangeLabel, color: PLATINUM },
    header.phase && { label: header.phase, color: EMBER },
    { label: `FMT ${header.version}`, color: MUTED },
  ].filter(Boolean) as Array<{ label: string; color: string }>

  return (
    <header className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 space-y-2">
      {header.title && (
        <p className="font-heading text-fluid-sm font-bold uppercase tracking-wide text-text/90">
          {header.title.replace(/^[^\p{L}]*/u, '')}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span key={c.label} className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{ color: c.color, background: `${c.color}1f`, border: `1px solid ${c.color}44` }}>
            {c.label}
          </span>
        ))}
      </div>
    </header>
  )
}

function SectionView({ section }: { section: FmtV2Section }) {
  return (
    <div className="space-y-2">
      {section.title && (
        <h3 className="font-heading text-fluid-base font-semibold text-text flex items-center gap-2">
          {section.emoji && <span aria-hidden="true">{section.emoji}</span>}
          {section.title}
        </h3>
      )}

      {section.kind === 'tdee' && <TdeeLadder anchors={anchorsOf(section)} />}
      {section.kind === 'bodyComp' && section.table && <BodyCompTrajectory table={section.table} />}
      {section.kind === 'asymmetry' && <AsymmetryBars rows={asymmetryOf(section)} />}

      {/* The prose that surrounded the data still belongs to the section: an
          adopted-anchor rationale is the half of the block a chart can't carry. */}
      <Prose lines={proseLines(section)} />
    </div>
  )
}

// ── data helpers ─────────────────────────────────────────────────────────────
// Re-derived from the section rather than threaded down, so a section's chart
// and its leftover prose can never describe different rows.

const anchorsOf = (s: FmtV2Section): TdeeAnchor[] => parseTdeeAnchors(s.lines)
const asymmetryOf = (s: FmtV2Section): AsymmetryRow[] => parseAsymmetry(s.lines)

/** Lines the widgets already drew, removed so nothing renders twice. */
function proseLines(s: FmtV2Section): string[] {
  if (s.kind === 'tdee') return s.lines.filter((l) => !/^\s*ANCHOR\s+\S/i.test(l))
  if (s.kind === 'bodyComp' || s.kind === 'asymmetry') {
    return s.lines.filter((l) => (l.match(/\|/g)?.length ?? 0) < 2)
  }
  return s.lines
}

function Prose({ lines }: { lines: string[] }) {
  const text = lines.join('\n').trim()
  if (!text) return null
  // Anything holding box-drawing or column alignment is fixed-width by
  // construction; markdown would collapse the runs of spaces that ARE the chart.
  const preformatted = /[╔╗╚╝║═┌┐└┘│─▓█▒░]/.test(text) || /\S {3,}\S/.test(text)
  if (preformatted) {
    return (
      <pre className="report-pre overflow-x-auto rounded-lg bg-black/25 border border-white/[0.07] p-3 text-[11px] leading-[1.45]">
        {text}
      </pre>
    )
  }
  return <MarkdownView md={text} />
}

// ── widgets ──────────────────────────────────────────────────────────────────

/**
 * The TDEE ladder: every candidate daily-energy figure on one scale, with the
 * adopted one in gold.
 *
 * Bars start at the LOWEST anchor, not at zero. The anchors sit within a few
 * hundred kcal of each other on a ~2,400 base, so a zero-based axis renders five
 * near-identical bars and hides the only thing the block is asking you to judge:
 * how far apart the estimates are.
 */
function TdeeLadder({ anchors }: { anchors: TdeeAnchor[] }) {
  if (!anchors.length) return null
  const values = anchors.map((a) => a.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const adopted = anchors.find((a) => a.adopted) ?? null
  const width = (v: number) => 12 + ((v - lo) / span) * 88

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wide text-muted">
        <span>Energy anchors</span>
        <span className="helix-num">spread {Math.round(span).toLocaleString()} kcal</span>
      </div>
      {anchors.map((a) => (
        <div key={`${a.key}-${a.label}`} className="space-y-1">
          <div className="flex items-baseline gap-2 text-fluid-xs">
            <span className="font-bold shrink-0" style={{ color: a.adopted ? GOLD : MUTED }}>{a.key}</span>
            <span className="text-text/85 truncate min-w-0">{a.label}</span>
            <span className="helix-num ml-auto font-bold tabular-nums shrink-0"
              style={{ color: a.adopted ? GOLD : 'inherit' }}>
              {a.value.toLocaleString()}
            </span>
            {a.adopted && (
              <span className="text-[8px] font-bold uppercase px-1 py-px rounded shrink-0"
                style={{ color: GOLD, background: `${GOLD}1f`, border: `1px solid ${GOLD}4d` }}>adopted</span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full transition-[width]"
              style={{
                width: `${width(a.value)}%`,
                background: a.adopted ? GOLD : 'rgba(255,255,255,0.28)',
                boxShadow: a.adopted ? `0 0 10px ${GOLD}66` : undefined,
              }} />
          </div>
        </div>
      ))}
      {adopted && (
        <p className="text-[10px] text-muted pt-0.5">
          Deficit maths below run on{' '}
          <span className="helix-num font-bold" style={{ color: GOLD }}>{adopted.value.toLocaleString()}</span> kcal
          {anchors.length > 1 && <> · {Math.round(((adopted.value - (lo + hi) / 2) / ((lo + hi) / 2)) * 1000) / 10}% vs the mid-estimate</>}
        </p>
      )}
    </div>
  )
}

/**
 * Body composition as small multiples — one sparkline per measured column, each
 * on its OWN scale.
 *
 * A single axis is useless here: the table mixes kilograms (64.8), percentages
 * (17.9) and a BMR in the 1,500s, so one shared range flattens every series but
 * the largest. Each cell states its own start → end and the delta, which is the
 * question ("did muscle hold while fat came off?") the block exists to answer.
 */
function BodyCompTrajectory({ table }: { table: ParsedTable }) {
  const series = useMemo(() => bodyCompSeries(table), [table])
  if (!series.length) return null

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {series.map((s) => {
          const pts = s.points.filter((p) => p.value != null) as Array<{ date: string; value: number }>
          const first = pts[0]?.value ?? null
          const last = pts[pts.length - 1]?.value ?? null
          const delta = first != null && last != null ? Math.round((last - first) * 100) / 100 : null
          // Down is not automatically bad and up is not automatically good —
          // weight and fat falling is the point of a cut. Colour by direction
          // only, and let the label carry the meaning.
          const color = delta == null || delta === 0 ? MUTED : delta > 0 ? EMERALD : OXIDE
          return (
            <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[9px] uppercase tracking-wide text-muted truncate">{s.label}</span>
                {delta != null && delta !== 0 && (
                  <span className="helix-num text-[9px] font-bold shrink-0" style={{ color }}>
                    {delta > 0 ? '+' : ''}{delta}
                  </span>
                )}
              </div>
              <span className="helix-num block text-fluid-base font-bold text-text leading-none mt-0.5 tabular-nums">
                {last ?? '—'}
              </span>
              <Spark points={pts.map((p) => p.value)} color={color} />
            </div>
          )
        })}
      </div>
      <TableView table={table} />
    </div>
  )
}

function Spark({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return <div className="h-5" aria-hidden="true" />
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const n = points.length - 1
  const d = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / n) * 58 + 1} ${17 - ((v - min) / span) * 13}`)
    .join(' ')
  return (
    <svg viewBox="0 0 60 20" className="w-full h-5 mt-1" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={59} cy={17 - ((points[n] - min) / span) * 13} r="1.7" fill={color} />
    </svg>
  )
}

/**
 * Asymmetry as diverging bars around a shared centre line.
 *
 * Two numbers side by side in a table make you do the subtraction; a mirrored
 * pair makes the imbalance the shape of the row. The gap is signed from the LEFT
 * side, matching how the export writes L before R.
 */
function AsymmetryBars({ rows }: { rows: AsymmetryRow[] }) {
  if (!rows.length) return null
  const max = Math.max(...rows.flatMap((r) => [r.left ?? 0, r.right ?? 0]), 1)
  // A few percent is measurement noise on a cable stack, not an imbalance.
  const flagged = (pct: number | null) => pct != null && Math.abs(pct) >= 10

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 space-y-2.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted">
        <span style={{ color: SAPPHIRE }}>◀ left</span>
        <span>gap</span>
        <span style={{ color: EMBER }}>right ▶</span>
      </div>
      {rows.map((r) => (
        <div key={r.exercise} className="space-y-1">
          <div className="flex items-baseline gap-2 text-fluid-xs">
            <span className="text-text/85 truncate min-w-0">{r.exercise}</span>
            <span className="helix-num ml-auto text-[10px] font-bold shrink-0 tabular-nums"
              style={{ color: flagged(r.gapPct) ? OXIDE : MUTED }}>
              {r.gapPct == null ? '—' : `${r.gapPct > 0 ? '+' : ''}${r.gapPct}%`}
            </span>
          </div>
          <div className="flex items-center gap-1" aria-hidden="true">
            <div className="flex-1 h-2 flex justify-end">
              <div className="h-full rounded-l-full"
                style={{ width: `${((r.left ?? 0) / max) * 100}%`, background: SAPPHIRE }} />
            </div>
            <div className="w-px h-3 bg-white/25 shrink-0" />
            <div className="flex-1 h-2">
              <div className="h-full rounded-r-full"
                style={{ width: `${((r.right ?? 0) / max) * 100}%`, background: EMBER }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** The source table, kept under the chart — the chart is a reading of it, not a
 *  replacement for it. Scrolls in its own box so the page never does. */
function TableView({ table }: { table: ParsedTable }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.07] mt-2.5">
      <table className="w-full text-[11px] border-collapse">
        <thead className="text-muted">
          <tr>
            {table.columns.map((c, i) => (
              <th key={`${c}-${i}`} className="px-2 py-1.5 text-left font-semibold border-b border-white/[0.08] whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1.5 border-b border-white/[0.04] helix-num tabular-nums text-text/90 whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
