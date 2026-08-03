'use client'

import { useState } from 'react'
import { Star, ChevronDown, Sparkles } from 'lucide-react'
import type { GymReportRow } from '@/lib/hooks/useWeekly'
import { useSessionIntel } from '@/lib/hooks/useSessionIntel'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { formatSet } from '@/lib/utils/setFormat'
import { MarkdownView } from './MarkdownView'

function Chip({ label, value, accent = '#E0703C' }: { label: string; value: string; accent?: string }) {
  return (
    <span className="inline-flex flex-col rounded-xl px-3 py-1.5 border" style={{ borderColor: `${accent}40`, background: `${accent}14` }}>
      <span className="text-[9px] uppercase tracking-wide text-muted leading-none">{label}</span>
      <span className="helix-num text-fluid-sm font-bold leading-tight" style={{ color: accent }}>{value}</span>
    </span>
  )
}

const GOLD = '#D4AF37'
const UP = '#3E9E7A'
const DOWN = '#C4514E'

/**
 * Direction of travel for one exercise, this session vs the last of its type.
 *
 * The column used to be ⬆️ / ✅ / ⬇️ off TOP LOAD ALONE, and on a
 * double-progression program that made it a wall of green ticks: you hold the
 * load and add reps for weeks, so the load is unchanged and "matched" was
 * reported for every week where progress was actually happening. Bodyweight work
 * could never read anything else at all. The basis is now estimated 1RM (reps
 * and load both move it) — or reps for unloaded work — and the glyph carries the
 * size of the move, not just its sign.
 *
 * A PR outranks the trend: a record is the fact worth reading in that cell.
 */
function trend(d: { delta: -1 | 0 | 1 | null; deltaPct: number | null; isPr: boolean }):
  { glyph: string; label: string; color: string; pct: string | null } {
  if (d.isPr) return { glyph: '🏆', label: 'personal record', color: GOLD, pct: null }
  if (d.delta == null) return { glyph: '🆕', label: 'first time logged', color: '#8E9AAC', pct: null }
  const pct = d.deltaPct != null && d.deltaPct !== 0
    ? `${d.deltaPct > 0 ? '+' : ''}${d.deltaPct}%` : null
  if (d.delta === 1) return { glyph: '📈', label: 'improved', color: UP, pct }
  if (d.delta === -1) return { glyph: '📉', label: 'regressed', color: DOWN, pct }
  return { glyph: '═', label: 'held', color: '#8E9AAC', pct: null }
}

/**
 * Session Intel Card — the data-first report view: metadata chips, a gold PR
 * spotlight, a per-exercise Δ-vs-last table, a volume trail vs the last same-split
 * sessions, and the markdown prose demoted to a collapsible "Coach Notes".
 */
export function SessionIntelCard({ session }: { session: GymReportRow }) {
  const { data: intel, isLoading } = useSessionIntel(session.id)
  // Session Report starts EXPANDED (Command Center wants the full debrief open,
  // not a tap-to-reveal). The chevron still collapses it if the user wants.
  const [notesOpen, setNotesOpen] = useState(true)
  const unit = useUnitSystem()

  // The coach output is now a brief 2-sentence insight, surfaced up top. Older
  // sessions may still carry a long markdown report — those stay collapsible.
  const md = session.reportMd?.trim() ?? ''
  const insight = md && md.length <= 280 && !md.includes('#') ? md : null
  const longNotes = md && !insight ? md : null

  return (
    <div className="space-y-4">
      {/* Coach insight — 2 sentences, front and centre (numbers are charted below) */}
      {insight && (
        <div className="rounded-2xl border px-3.5 py-3 flex gap-2.5 items-start"
          style={{ borderColor: '#E0703C33', background: '#E0703C0d', boxShadow: '0 0 18px #E0703C14' }}>
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#E0703C', filter: 'drop-shadow(0 0 4px #E0703C)' }} aria-hidden="true" />
          <p className="text-fluid-sm text-text/90 leading-relaxed">{insight}</p>
        </div>
      )}

      {/* Hero chips — volume + sets GUARANTEED (computed from sets when the row lacks them) */}
      <div className="flex flex-wrap gap-2">
        {session.durationMin != null && <Chip label="Duration" value={`${session.durationMin}m`} />}
        {session.avgBpm != null && <Chip label="Avg BPM" value={`${session.avgBpm}`} accent="#E0703C" />}
        <Chip label="Volume" value={`${Math.round(displayWeight(session.volumeKg ?? intel?.computedVolumeKg ?? 0) ?? 0).toLocaleString()} ${unit}`} accent="#8E9AAC" />
        <Chip label="Sets" value={`${session.setCount ?? intel?.computedSets ?? '—'}`} accent="#B4522A" />
      </div>

      {/* Δ vs the previous session of this EXACT type (Upper A vs last Upper A) */}
      {intel?.volumeDeltaPct != null && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 flex items-center gap-2 text-fluid-xs">
          <span className="text-muted">vs last <span className="text-text font-medium">{intel.typeLabel}</span>:</span>
          <span className="helix-num font-bold" style={{ color: intel.volumeDeltaPct >= 0 ? '#3E9E7A' : '#C4514E' }}>
            volume {intel.volumeDeltaPct >= 0 ? '+' : ''}{intel.volumeDeltaPct}%
          </span>
          {intel.setsDelta != null && (
            <span className="helix-num text-muted">· sets {intel.setsDelta > 0 ? `+${intel.setsDelta}` : intel.setsDelta === 0 ? '=' : intel.setsDelta}</span>
          )}
        </div>
      )}

      {/* PR spotlight */}
      {!!intel?.prs.length && (
        <div className="rounded-2xl border px-3 py-2.5 space-y-1" style={{ borderColor: '#D4AF3755', background: '#D4AF3712', boxShadow: '0 0 18px #D4AF3722' }}>
          {intel.prs.map((pr) => (
            <div key={pr.name} className="flex items-center gap-2 text-fluid-sm">
              <Star className="w-3.5 h-3.5 shrink-0" style={{ color: '#D4AF37', filter: 'drop-shadow(0 0 4px #D4AF37)' }} />
              <span className="text-text font-medium truncate">{pr.name}</span>
              <span className="helix-num ml-auto font-bold" style={{ color: GOLD }}>
                {formatSet(pr.kg, pr.reps, { unit, toDisplay: displayWeight })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* First session of this type → nothing to compare against yet. */}
      {!isLoading && intel?.isFirstOfType && !!intel.deltas.length && (
        <p className="text-fluid-xs text-muted flex items-center gap-1.5">
          <span aria-hidden="true">💪</span> First {intel.typeLabel || 'session'} of this era — baseline set. Progression appears next time.
        </p>
      )}

      {/* Exercise Δ table — only once there's a baseline to compare against */}
      {isLoading ? (
        <div className="h-32 rounded-2xl bg-surface-2/60 animate-pulse" />
      ) : (!intel?.isFirstOfType && !!intel?.deltas.length) && (
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
          <table className="w-full text-fluid-xs">
            <thead>
              <tr className="border-b border-white/[0.08] text-muted">
                <th className="px-3 py-2 text-left font-semibold">Exercise</th>
                <th className="px-2 py-2 text-right font-semibold">Top set</th>
                <th className="px-2 py-2 text-right font-semibold">Prev</th>
                <th className="px-3 py-2 text-right font-semibold">Δ</th>
              </tr>
            </thead>
            <tbody>
              {intel.deltas.map((d) => {
                const t = trend(d)
                return (
                  <tr key={d.name}
                    className="border-b border-white/[0.06] last:border-0"
                    // A record is worth seeing from across the row, not just in
                    // the last cell: the whole row lifts into gold, with a left
                    // rule so it still reads on a monochrome / printed page.
                    style={d.isPr
                      ? { background: `${GOLD}14`, boxShadow: `inset 3px 0 0 ${GOLD}` }
                      : undefined}>
                    <td className="px-3 py-2.5 text-text/90 truncate max-w-[130px]">
                      {d.name}
                      {d.isPr && <Star className="inline w-3 h-3 ml-1 -mt-0.5" style={{ color: GOLD }} aria-hidden="true" />}
                    </td>
                    <td className="px-2 py-2.5 text-right helix-num text-text">
                      {formatSet(d.topKg, d.topReps, { unit, toDisplay: displayWeight })}
                    </td>
                    <td className="px-2 py-2.5 text-right helix-num text-muted">
                      {d.prevKg == null ? '—'
                        : d.unloaded ? formatSet(0, d.prevReps, {})
                        : `${displayWeight(d.prevKg)}${unit}`}
                    </td>
                    <td className="px-3 py-2.5 text-right leading-none whitespace-nowrap" aria-label={t.label}>
                      <span className="text-base align-middle" aria-hidden="true">{t.glyph}</span>
                      {t.pct && (
                        <span className="helix-num text-[10px] font-bold align-middle ml-1" style={{ color: t.color }}>{t.pct}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* The orange "Volume vs previous session" bar strip was removed here — it
          duplicated the tappable volume trajectory inside the Inspect deep-dive
          (ProgressionTrail) and cluttered the pre-inspect summary. */}

      {/* Legacy long-form report — demoted + collapsible (new sessions use the insight banner) */}
      {longNotes && (
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
          <button onClick={() => setNotesOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2.5 text-fluid-sm text-muted hover:text-text">
            Coach Notes
            <ChevronDown className={`w-4 h-4 transition-transform ${notesOpen ? 'rotate-180' : ''}`} />
          </button>
          {notesOpen && (
            <div className="px-3 pb-3 max-h-[45vh] overflow-y-auto no-scrollbar">
              <MarkdownView md={longNotes} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
