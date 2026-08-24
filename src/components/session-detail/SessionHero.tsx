'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Loader2 } from 'lucide-react'
import type { SessionDetail } from '@/lib/hooks/useSessionDetail'
import { useEditSession } from '@/lib/hooks/useEditSession'
import { useDeleteSession } from '@/lib/hooks/useDayVault'
import { useSessionIntel, type IntelMetric } from '@/lib/hooks/useSessionIntel'
import { dayColor, STEEL, EMBER, OXIDE, GOLD, MACRO } from '@/lib/theme/palette'
import { displayWeight, weightUnit, fmtVolume } from '@/lib/utils/units'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { Surface } from '@/components/ui/Zone'
import { Head, Sub } from '@/components/session-detail/MetricGrid'
import { setComposition } from '@/lib/training/setTags'

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
 *
 * The cells themselves (`Head`, `Sub`, `Delta`) now live in `MetricGrid.tsx`,
 * because this shape stopped being one page's answer: the Workout tab and the
 * Daily View render the same two grids at snippet size, and the point of that
 * is that they are literally the same components, not a copy that drifts.
 */

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

  /**
   * ── THE SET COMPOSITION, AS CHIPS ────────────────────────────────────────
   * This was `"1 warm-up · 1 to failure"` — up to 26 characters joined into a
   * `truncate`d slot roughly a third of the header wide, so on a phone it read
   * "1 warm-up · 1 to fail…". Longer sessions were worse: add a drop set and
   * the first tag is all that survives.
   *
   * The words are the wrong unit for the space. The ledger below already writes
   * W, F and D on every set that has one, and so does the live logger while you
   * are typing it — so the header spelling them out in full was the odd one
   * out, at the one size where it did not fit.
   *
   * `setComposition` is that shared table (`lib/training/setTags.ts`). The full
   * word survives in each chip's tooltip, and in the weekly export, which is
   * what a coach actually reads.
   */
  const composition = setComposition({
    warmup: detail.warmupSets,
    failure: detail.failureSets,
    dropset: detail.dropsetSets,
  })

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
      {/* ── "Compared with Upper A · 16 Aug" USED TO SIT HERE ──
          It was the third statement of the same fact. `ProgressionTrail`, one
          band below, already prints "vs Upper A · 16 Aug" as the heading of the
          block that IS the comparison; the ▲/▼ on each number here is the
          comparison; and the page title names the session. What this line added
          was a caption above a metric grid, pushing the numbers down a line on
          the one screen that opens to them.

          It is not replaced. A delta that has to explain what it is measured
          against, directly above the deltas, is a sign the deltas are in the
          wrong place — and they are not. */}
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
          sub={composition.length > 0 && (
            <span className="flex items-baseline gap-1 min-w-0">
              {composition.map((c, i) => (
                <span key={c.label} className="flex items-baseline gap-1 shrink-0">
                  {i > 0 && <span className="opacity-30" aria-hidden="true">·</span>}
                  <span className="helix-num font-bold tabular-nums" style={{ color: c.color }}
                    title={`${c.count} × ${c.full}`}>
                    {c.count}{c.label}
                  </span>
                </span>
              ))}
            </span>
          )}
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
