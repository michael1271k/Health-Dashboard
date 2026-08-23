'use client'

import { useState } from 'react'
import { Star, ChevronDown, Sparkles } from 'lucide-react'
import type { GymReportRow } from '@/lib/hooks/useWeekly'
import { useSessionIntel, type DeltaAxis, type ExerciseDelta } from '@/lib/hooks/useSessionIntel'
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
 * could never read anything else at all.
 *
 * Then it was the TOP SET's estimated 1RM, which is the same blindness one level
 * up: on double progression the top set is the set the program PINS, so it
 * reaches the ceiling and holds there while the back-off sets climb. The basis
 * is the MEAN across the working sets now — mean est-1RM, or mean reps for
 * unloaded work — so any set moving moves the glyph. See `basisOf` in
 * `useSessionIntel` for the worked example. `deltaPct` is a percentage of THAT
 * mean; nothing here reads it as a top-set figure, but the contract is stated
 * because it has now changed twice.
 *
 * The glyph carries the size of the move, not just its sign.
 *
 * A PR outranks the trend: a record is the fact worth reading in that cell.
 *
 * ── THE VOLUME AXIS READS DIFFERENTLY ────────────────────────────────────────
 * `delta` is decided by intensity first and by tonnage only when the intensity
 * is identical (`compareProgress`). A volume-axis verdict therefore always
 * carries `deltaPct === 0`, and printing "📈" with no percentage beside it
 * invites the reading "improved by nothing".
 *
 * It did not improve by nothing — it is the same work done one more time, or
 * one time fewer, which is a different KIND of change rather than a smaller
 * one. So it gets its own words. The down case matters most: a dropped back-off
 * set on a planned deload or a maintenance week should say what happened, not
 * flash a red arrow that reads as a failure.
 */
function trend(d: {
  delta: -1 | 0 | 1 | null; deltaPct: number | null; isPr: boolean
  deltaAxis?: DeltaAxis | null; volumeKg?: number; prevVolumeKg?: number | null
}): { glyph: string; label: string; color: string; pct: string | null } {
  if (d.isPr) return { glyph: '🏆', label: 'personal record', color: GOLD, pct: null }
  if (d.delta == null) return { glyph: '🆕', label: 'first time logged', color: '#8E9AAC', pct: null }
  if (d.deltaAxis === 'volume' && d.delta !== 0) {
    // The percentage shown here is TONNAGE, because tonnage is what decided it.
    // Not a set count: an identical mean guarantees the intensity matched, not
    // that exactly one set was added, and "+1 set" would be a claim this data
    // cannot support.
    const vp = d.prevVolumeKg && d.volumeKg != null && d.prevVolumeKg > 0
      ? Math.round(((d.volumeKg - d.prevVolumeKg) / d.prevVolumeKg) * 1000) / 10
      : null
    const pct = vp != null && vp !== 0 ? `${vp > 0 ? '+' : ''}${vp}% work` : null
    return d.delta === 1
      ? { glyph: '📈', label: 'same weights, more work', color: UP, pct }
      : { glyph: '📉', label: 'same weights, less work', color: DOWN, pct }
  }
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
  const [heldOpen, setHeldOpen] = useState(false)
  const unit = useUnitSystem()

  /**
   * Records first, then what moved, then what did not.
   *
   * The table was in whatever order the deltas arrived, which is exercise order
   * — the order you performed them, not the order they matter. On a six-exercise
   * day that puts a record fourth and three unchanged lifts above it.
   *
   * "Unchanged" is not nothing, so it is not dropped; it is collapsed to a line
   * you can open, because holding a load is the expected case and does not need
   * a row each.
   */
  const RANK = (d: ExerciseDelta) => (d.isPr ? 0 : d.delta === 1 ? 1 : d.delta === -1 ? 2 : 3)
  const all = intel?.deltas ?? []
  const held = all.filter((d) => !d.isPr && d.delta === 0)
  const ranked = [...all.filter((d) => !(!d.isPr && d.delta === 0))].sort((a, b) => RANK(a) - RANK(b))

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
        /**
         * ── TWO LINES PER EXERCISE, NOT FOUR COLUMNS ──────────────────────────
         *
         * This was a table: Exercise / Top set / Prev / Δ, `min-w-[360px]` inside
         * an `overflow-x-auto`. Four columns of numbers do not fit a phone, and
         * the sideways scroll was the SYMPTOM — a table is the wrong shape for
         * data whose only variable-length field is the first column.
         *
         * Nothing sits beside anything now, so nothing can overflow: the name
         * and the verdict own the first line, and the numbers own the second in
         * the order you read them — what you did, then what you did last time.
         *
         * Sorted records-first, then improvements, then regressions, then holds:
         * the good news is above the fold, and the rows you would scroll past
         * anyway collapse into one line at the end.
         */
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
          {ranked.map((d, i) => {
            const t = trend(d)
            return (
              <div
                key={d.name}
                className={`px-3 py-2.5 ${i > 0 ? 'border-t border-white/[0.06]' : ''}`}
                // A record is worth seeing from across the row. The left rule
                // survives monochrome and print, where the tint does not.
                style={d.isPr ? { background: `${GOLD}14`, boxShadow: `inset 3px 0 0 ${GOLD}` } : undefined}
              >
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-fluid-xs text-text/90" title={d.name}>
                    {d.name}
                    {d.isPr && <Star className="inline w-3 h-3 ml-1 -mt-0.5" style={{ color: GOLD }} aria-hidden="true" />}
                  </span>
                  <span className="shrink-0 flex items-baseline gap-1 leading-none" aria-label={t.label}>
                    <span className="text-sm" aria-hidden="true">{t.glyph}</span>
                    {t.pct && (
                      <span className="helix-num text-[10px] font-bold" style={{ color: t.color }}>{t.pct}</span>
                    )}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2 text-[11px]">
                  <span className="helix-num text-text tabular-nums">
                    {formatSet(d.topKg, d.topReps, { unit, toDisplay: displayWeight })}
                  </span>
                  <span className="helix-num text-muted tabular-nums truncate">
                    was {d.prevKg == null ? '—'
                      : d.unloaded ? formatSet(0, d.prevReps, {})
                      : `${displayWeight(d.prevKg)}${unit}`}
                  </span>
                </div>
              </div>
            )
          })}
          {held.length > 0 && (
            <button
              type="button"
              onClick={() => setHeldOpen((v) => !v)}
              aria-expanded={heldOpen}
              className="w-full px-3 py-2.5 border-t border-white/[0.06] text-left text-[11px] text-muted
                         flex items-center justify-between active:scale-[0.995] transition-transform"
            >
              <span>{held.length} exercise{held.length === 1 ? '' : 's'} unchanged</span>
              <span aria-hidden="true">{heldOpen ? '⌃' : '⌄'}</span>
            </button>
          )}
          {heldOpen && held.map((d) => (
            <div key={d.name} className="px-3 py-2 border-t border-white/[0.06] flex items-baseline gap-2 text-[11px]">
              <span className="min-w-0 flex-1 truncate text-text/70" title={d.name}>{d.name}</span>
              <span className="helix-num text-muted tabular-nums shrink-0">
                {formatSet(d.topKg, d.topReps, { unit, toDisplay: displayWeight })}
              </span>
            </div>
          ))}
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
