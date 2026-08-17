'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { TargetRow, Verdict } from '@/lib/reports/targetVerdict'
import { EMERALD, GOLD, OXIDE, MUTED } from '@/lib/theme/palette'

/**
 * What the last report asked for, against what this week actually shows.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 * A quote block containing the first sentence of the report's directive. It was
 * retrieved, correct, and completely inert: it told you to drink 3.2 L and said
 * nothing about whether you had, so the only way to act on it was to go and work
 * that out somewhere else. The instruction and the evidence now sit on the same
 * line, and the line is a link to the surface that changes it.
 *
 * Still RETRIEVED, never generated — every target here was typed into a report
 * outside the app and pasted back in. When nothing was pasted, this renders
 * nothing at all.
 */

const COLOR: Record<Verdict, string> = {
  hit: EMERALD,
  near: GOLD,
  miss: OXIDE,
  unknown: MUTED,
}

export function TargetsVsActual({ rows, weekStart }: { rows: TargetRow[]; weekStart: string | null }) {
  if (!rows.length) return null

  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted">
        {weekStart ? `Asked for in the ${weekStart} report` : 'Asked for in your last report'}
      </p>
      <ul className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)' }}>
        {rows.map((row, i) => (
          <li key={row.key} style={i ? { borderTop: '1px solid rgba(255,255,255,0.05)' } : undefined}>
            <Link
              href={row.href}
              className="flex items-center gap-2 px-2.5 py-1.5 active:bg-white/[0.04]"
              aria-label={`${row.label}: target ${row.target}, this week ${row.actual ?? 'no data yet'}`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: COLOR[row.verdict] }}
                aria-hidden="true"
              />
              <span className="text-[11px] text-text/90 min-w-0 flex-1 truncate">{row.label}</span>
              {/* Target first, then actual: the instruction is the reference and
                  the reading is the thing being judged against it. */}
              <span className="helix-num text-[11px] text-muted tabular-nums">{row.target}</span>
              <span className="text-[10px] text-muted/60" aria-hidden="true">→</span>
              <span
                className="helix-num text-[11px] font-semibold tabular-nums"
                style={{ color: COLOR[row.verdict] }}
              >
                {row.actual ?? '—'}
              </span>
              <ChevronRight className="w-3 h-3 text-muted/60 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
