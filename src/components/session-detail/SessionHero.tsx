'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Loader2 } from 'lucide-react'
import type { SessionDetail } from '@/lib/hooks/useSessionDetail'
import { useEditSession } from '@/lib/hooks/useEditSession'
import { useDeleteSession } from '@/lib/hooks/useDayVault'
import { useSessionIntel, type IntelMetric } from '@/lib/hooks/useSessionIntel'
import { dayColor, STEEL, EMBER, OXIDE, GOLD, EMERALD, MACRO } from '@/lib/theme/palette'
import { displayWeight, weightUnit, fmtVolume } from '@/lib/utils/units'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { Surface } from '@/components/ui/Zone'

/*
 * This file used to open with six local constants, four of which named a colour
 * they did not hold:
 *
 *   CYAN   = '#8E9AAC'  → STEEL      ROSE = '#C4514E'  → OXIDE
 *   VIOLET = '#E0703C'  → EMBER      TEAL = '#3E9E7A'  → EMERALD
 *   EMBER  = '#D4AF37'  → GOLD, i.e. an exact duplicate of the GOLD beside it
 *
 * That last one was not just a bad name. The kcal stat imported `EMBER` and got
 * record-gold, so a session's calorie figure rendered in the one hue V2 reserved
 * for "this is a personal record". Nobody could see it, because the constant
 * said ember. Values are otherwise unchanged — this is a naming fix, and any
 * actual repaint belongs to the palette phase.
 */

/**
 * ── WHY THIS HEADER NO LONGER SCROLLS ────────────────────────────────────────
 *
 * There were THREE independent horizontal scrollers on this page: a `StatStrip`
 * here, a second hand-rolled `overflow-x-auto` row here, and a third in
 * `ProgressionTrail`. Between them they printed volume, sets, duration,
 * calories and average HR TWICE — once as a value, once as a value-with-delta —
 * and none of them could be read without dragging sideways.
 *
 * Scrolling was the wrong answer to "there are nine numbers". The right answer
 * is that there are not nine numbers of equal weight. Three of them say what
 * the session WAS (volume, duration, sets); the rest are context. So the header
 * is two fixed grids — a 3-up at display size and a 4-up at label size — and
 * nothing overflows at 390px.
 *
 * The second half of the fix lives in `ProgressionTrail`: absolutes appear ONLY
 * here, deltas appear ONLY as the ▲/▼ attached to the number they modify. That
 * is what stops the duplication coming back — there is no longer a second place
 * for an absolute to live.
 */

/** Percent change for a metric, in the direction that metric considers good. */
function pctOf(m: IntelMetric | undefined): { pct: number; good: boolean } | null {
  if (!m || m.value == null || m.previous == null || m.previous === 0) return null
  const pct = Math.round(((m.value - m.previous) / m.previous) * 100)
  if (pct === 0) return null
  return { pct, good: pct > 0 === m.higherIsBetter }
}

/**
 * The ▲6% / ▼4% that qualifies a headline number.
 *
 * ── IT USED TO RIDE ON THE VALUE'S OWN LINE, AND IT COLLIDED ─────────────────
 * This was an inline `<span>` sharing a `text-fluid-xl` line box with the value
 * and its unit, inside a `grid-cols-3` that had no `gap` and cells with no
 * `min-w-0`. A grid item's default `min-width: auto` means a cell does not
 * shrink to its track — so "12,480 kg ▲14%" simply grew past its column and
 * landed on top of the duration beside it. With no `whitespace-nowrap` it could
 * also wrap instead, which broke the `leading-none` alignment across all three
 * cells.
 *
 * A delta is a second statement about a number, not part of it. It belongs on
 * the line below, in the slot `Head` already reserves — which costs nothing,
 * because that slot was being rendered empty on two cells out of three anyway.
 */
function Delta({ metric }: { metric: IntelMetric | undefined }) {
  const d = pctOf(metric)
  if (!d) return null
  return (
    <span
      className="helix-num font-bold whitespace-nowrap"
      style={{ color: d.good ? EMERALD : OXIDE }}
    >
      {d.pct > 0 ? '▲' : '▼'}{Math.abs(d.pct)}%
    </span>
  )
}

/**
 * One of the three headline cells. Hairline on the left for every cell but the
 * first — the same recipe as the exercise record strip, so the two pages read
 * as one system.
 */
function Head({ label, value, unit, sub, metric, first }: {
  label: string
  value: string | null
  unit?: string
  sub?: string
  metric?: IntelMetric
  first?: boolean
}) {
  return (
    // `min-w-0` is the load-bearing class here — without it a grid item refuses
    // to shrink below its content and overruns the cell beside it.
    <div className={`min-w-0 ${first ? '' : 'pl-3 border-l border-white/[0.07]'}`}>
      <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted leading-tight truncate">
        {label}
      </span>
      <div className="helix-num font-bold text-fluid-xl leading-none mt-1.5 text-text whitespace-nowrap">
        {value ?? '—'}
        {unit && value != null && <span className="text-[10px] text-muted font-normal ml-1">{unit}</span>}
      </div>
      {/* The qualifier line. Reserved whether or not it is filled: a sub-line
          that appears only on some sessions makes the three cells different
          heights. It now carries the delta FIRST — the delta is the thing this
          line exists for — then whatever else the metric has to add. */}
      <span className="flex items-baseline gap-1.5 text-[9px] text-muted mt-1 leading-tight min-h-[1em] min-w-0">
        {value != null && <Delta metric={metric} />}
        {sub && <span className="truncate">{sub}</span>}
      </span>
    </div>
  )
}

/**
 * One of the four context cells. Same anatomy at label size — deliberately not
 * a different component shape, so the eye reads the second row as a quieter
 * version of the first rather than as a different kind of thing.
 */
function Sub({ label, value, unit, color, estimated }: {
  label: string
  value: string | null
  unit?: string
  color: string
  /** Derived by formula rather than measured — see `sessions/estimates.ts`. */
  estimated?: boolean
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[9px] font-bold uppercase tracking-[0.12em] truncate" style={{ color }}>
        {label}
      </span>
      <div className="helix-num font-bold text-[13px] tabular-nums leading-none mt-1 text-text truncate">
        {value ?? '—'}
        {unit && value != null && <span className="text-[9px] text-muted font-normal ml-0.5">{unit}</span>}
        {/* The value keeps its own colour — an estimate is still your best figure
            and is counted at full weight everywhere. What it must not do is pass
            for a measurement, so the provenance is stated rather than implied. */}
        {estimated && value != null && (
          <span
            className="text-[8px] uppercase tracking-wide text-muted font-normal ml-1"
            title="Calculated by formula — no watch data for this session"
          >
            calc
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Deep-dive header: session identity ("Session #N" · date), every session
 * metric in two non-scrolling grids, and the Edit / Delete actions. Edit routes
 * through the same commit → global-update cascade; Delete removes only this
 * session + its sets, then navigates back.
 */
export function SessionHero({ detail }: { detail: SessionDetail }) {
  const router = useRouter()
  const edit = useEditSession()
  const del = useDeleteSession(detail.date)
  const [confirm, setConfirm] = useState(false)

  // Same query key as ProgressionTrail's — TanStack serves both from one fetch.
  // The deltas belong on the numbers they describe, so they are read here and
  // the progression block no longer repeats the absolutes.
  const { data: intel } = useSessionIntel(detail.id)
  const m = (key: IntelMetric['key']) => intel?.metrics.find((x) => x.key === key)

  // The day label and the phase badge moved to the page's sticky command bar;
  // only the ACCENT is still read here, to tint the band's rule and border.
  const accent = dayColor(detail.dayKey, detail.splitDay)
  const unit = weightUnit()

  // Warm-ups and failure sets were two of the nine scrolling stats. They are
  // not session headlines — they describe the SET COUNT — so they ride under it.
  const composition = [
    detail.warmupSets > 0 ? `${detail.warmupSets} warm-up` : null,
    detail.failureSets > 0 ? `${detail.failureSets} to failure` : null,
  ].filter(Boolean).join(' · ')

  return (
    <Surface variant="band" accent={accent} pad="snug" className="space-y-3">
      {/* ── IDENTITY MOVED UP TO `SessionTitle` ──
          This row carried "Session · #07" on the left and the date on the
          right. The date was the SECOND copy on the page — the first sat under
          the bar's title 60px above, computed from scratch with byte-identical
          options — and the session number had no reason to be separated from
          it. Both now live under the large title, where the question they
          answer ("which session was this, and when") is asked.

          What is left is what this box is for: the numbers. */}
      {intel?.previousDate && (
        <p className="text-[10px] text-muted">
          Compared with <span className="text-text/80 font-medium">{intel.typeLabel}</span>
          {' · '}{new Date(`${intel.previousDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </p>
      )}

      {/* `gap-x-3` rather than per-cell `pr-3`/`pl-3`: the gap is a property of
          the grid, and stating it on the children meant the first cell had a
          different box model from the other two. */}
      <div className="grid grid-cols-3 gap-x-3">
        <Head
          first
          label="Volume"
          value={fmtVolume(displayWeight(detail.volumeKg))}
          unit={unit}
          metric={m('volume')}
        />
        <Head
          label="Duration"
          value={detail.durationMin != null ? `${detail.durationMin}′` : null}
          metric={m('duration')}
        />
        <Head
          label="Sets"
          value={`${detail.setCount}`}
          sub={composition}
          metric={m('sets')}
        />
      </div>

      <div className="grid grid-cols-4 gap-3 pt-2.5 border-t border-white/[0.06]">
        <Sub label="Difficulty" value={detail.sessionRpe != null ? `${detail.sessionRpe}/10` : null} color={EMBER} />
        <Sub label={detail.prCount === 1 ? 'Record' : 'Records'} value={`${detail.prCount}`} color={GOLD} />
        <Sub label="Avg HR" value={detail.avgBpm != null ? `${detail.avgBpm}` : null} unit="bpm" color={OXIDE} estimated={detail.avgBpmEstimated} />
        {/* Calories take the app-wide calorie hue, not the record hue. */}
        <Sub label="Calories" value={detail.calories != null ? `${detail.calories}` : null} unit="kcal" color={MACRO.calories} estimated={detail.caloriesEstimated} />
      </div>

      {confirm ? (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-fluid-xs text-muted flex-1 min-w-[140px]">Delete this workout? Your nutrition, sleep &amp; weight for the day stay.</span>
          <button type="button" onClick={() => setConfirm(false)} onPointerUp={blurOnTap} className="btn-glass min-h-[38px] text-fluid-xs">Cancel</button>
          <button type="button" disabled={del.isPending}
            onClick={() => del.mutate(detail.id, { onSuccess: () => router.back() })}
            className="min-h-[38px] px-3.5 rounded-lg text-fluid-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ color: '#fff', background: OXIDE, boxShadow: `0 0 16px ${OXIDE}55` }}>
            {del.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
            Delete
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-1">
          <button type="button" disabled={edit.loading} onClick={() => edit.load(detail.id)} onPointerUp={blurOnTap}
            className="btn-glass min-h-[40px] text-fluid-xs justify-center flex-1" style={{ color: STEEL }}>
            {edit.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
            Edit Workout
          </button>
          <button type="button" onClick={() => setConfirm(true)} onPointerUp={blurOnTap} aria-label="Delete workout"
            className="min-h-[40px] px-3.5 rounded-lg text-fluid-xs font-bold inline-flex items-center gap-1.5 justify-center"
            style={{ color: OXIDE, background: `${OXIDE}1a`, border: `1px solid ${OXIDE}55` }}>
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </Surface>
  )
}
