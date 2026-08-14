'use client'

import { ArrowUp, Trophy } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { prAxisLabel, type AxisRecord, type PrAxis } from '@/lib/training/prEngine'
import { displayWeight, weightUnit } from '@/lib/utils/units'

const GOLD = '#C9A227'
const EMERALD = '#3E9E7A'

/** Axis order — heaviest claim first, so the headline record leads. */
const AXIS_ORDER: readonly PrAxis[] = ['weight', 'e1rm', 'volume', 'reps']

/**
 * How a value is written for its axis.
 *
 * Weight, volume and e1RM are LOADS and take the user's unit; reps and seconds
 * are counts and take neither. Getting that wrong is how a rep count ends up
 * reading "12 kg", which is the kind of detail that makes a number stop being
 * believed.
 */
/** Quarter-kg plates are real loads: 3.75 must not print as "4". */
function fmtLoad(value: number): string {
  const shown = displayWeight(value) ?? value
  const n = shown % 1 === 0 ? shown.toFixed(0) : (shown * 10) % 1 === 0 ? shown.toFixed(1) : shown.toFixed(2)
  return `${n} ${weightUnit()}`
}

function fmtAxis(axis: PrAxis, value: number, timed: boolean): string {
  if (axis === 'reps') return timed ? `${Math.round(value)} sec` : `${Math.round(value)} reps`
  return fmtLoad(value)
}

/** The gap, in the axis's own terms. Always positive — a record beat something. */
function fmtDelta(axis: PrAxis, rec: AxisRecord, timed: boolean): string {
  const gap = rec.value - rec.previous
  if (axis === 'reps') return timed ? `+${Math.round(gap)} sec` : `+${Math.round(gap)}`
  return `+${fmtLoad(gap)}`
}

/**
 * What a set's trophy actually means — opened by tapping the gold strip on a set.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The badge said "Weight" and stopped there. Whether that was a 2.5 kg jump or a
 * quarter-kilo nudge, and what it beat, existed nowhere: `detectSetPrs` held the
 * beaten baseline in scope and returned only the axis name, and
 * `personal_records` is upsert-on-conflict, so writing the new record destroys
 * the value it replaced. `prEngine` now captures both before absorbing the set.
 *
 * ── WHY A SHEET, AND WHY IT IS THIS SMALL ────────────────────────────────────
 * It answers one question, so it is sized to one answer: a row per claimed axis,
 * the new figure, and the gap. No history chart, no navigation, nothing to
 * scroll. `Sheet` already carries the platform behaviour — drag-to-dismiss with a
 * projected release, interruptible mid-flight, a centred dialog at ≥sm — so this
 * component contributes content and a colour and nothing else.
 *
 * Renders nothing when there is no detail to show, rather than an empty sheet:
 * an asserted (record-book) session can name an axis the arithmetic never
 * computed a baseline for, and "beat nothing by nothing" is not worth a panel.
 */
export function PrRecordSheet({ open, onClose, exerciseName, setLabel, records, timed = false }: {
  open: boolean
  onClose: () => void
  exerciseName: string
  /** "Set 3" / "Set 2 · Left" — which set of the exercise earned these. */
  setLabel: string
  records: Partial<Record<PrAxis, AxisRecord>> | undefined
  timed?: boolean
}) {
  const rows = AXIS_ORDER
    .map((axis) => ({ axis, rec: records?.[axis] }))
    .filter((r): r is { axis: PrAxis; rec: AxisRecord } => !!r.rec)

  if (!rows.length) return null

  return (
    <Sheet open={open} onClose={onClose} title="Personal record" accent={GOLD} maxHeight="60dvh">
      <div className="space-y-3 pb-1">
        {/* Identity first: which lift, which set. Without it the numbers below
            float free of the thing they describe. */}
        <div className="flex items-start gap-2">
          <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: `${GOLD}1a`, color: GOLD }}>
            <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-heading font-bold text-fluid-base text-text leading-tight">
              {exerciseName}
            </span>
            <span className="block text-[11px] text-muted">{setLabel}</span>
          </span>
        </div>

        <div className="space-y-1.5">
          {rows.map(({ axis, rec }) => (
            <div key={axis}
              className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
                  {prAxisLabel(axis, timed)}
                </span>
                <span className="helix-num block text-fluid-lg font-extrabold text-text tabular-nums leading-tight">
                  {fmtAxis(axis, rec.value, timed)}
                </span>
              </span>
              {/* The gap, and what it beat. The arrow carries the direction so
                  the sign never has to be parsed from a bare number. */}
              <span className="text-right shrink-0">
                <span className="flex items-center justify-end gap-0.5 font-bold text-fluid-sm tabular-nums"
                  style={{ color: EMERALD }}>
                  <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                  {fmtDelta(axis, rec, timed)}
                </span>
                <span className="block text-[10px] text-muted">
                  was {fmtAxis(axis, rec.previous, timed)}
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* Said plainly, because a badge that appears mid-session invites the
            question. The same engine writes personal_records at commit. */}
        <p className="text-[11px] text-muted leading-snug">
          Measured against every set of this exercise before it{rows.length > 1 ? ', axis by axis' : ''}.
          Recorded when you finish the session.
        </p>
      </div>
    </Sheet>
  )
}
