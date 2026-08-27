'use client'

import { ArrowUp, Medal } from 'lucide-react'
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

/**
 * An ESTIMATED 1RM is always written to two places.
 *
 * ── WHY THIS ONE AXIS IS DIFFERENT ───────────────────────────────────────────
 * Every other figure here is a thing that was actually done: a load that was on
 * the bar, a rep that was completed, a tonnage that is their product. Those are
 * measurements, and trailing zeros on a measurement are noise — `40 kg` is what
 * was lifted, and `40.00 kg` implies a precision the plates do not have.
 *
 * An estimated 1RM is a COMPUTED value, and it moves in fractions: Epley on
 * 7.5 kg × 14 gives 11.00 and on 7.5 kg × 15 gives 11.25. Under the shared
 * formatter those print as `11` and `11.25`, so the column changes width, the
 * decimal points do not line up, and — the part that actually matters — a
 * record that beat the old one by 0.03 renders as two identical-looking whole
 * numbers with a delta that appears to have come from nowhere.
 *
 * A fixed two places makes the axis read as the calculation it is, and makes
 * the gap legible against the value it was taken from.
 */
function fmtE1rm(value: number): string {
  const shown = displayWeight(value) ?? value
  return `${shown.toFixed(2)} ${weightUnit()}`
}

function fmtAxis(axis: PrAxis, value: number, timed: boolean): string {
  if (axis === 'reps') return timed ? `${Math.round(value)} sec` : `${Math.round(value)} reps`
  if (axis === 'e1rm') return fmtE1rm(value)
  return fmtLoad(value)
}

/** The gap, in the axis's own terms. Always positive — a record beat something. */
function fmtDelta(axis: PrAxis, rec: AxisRecord, timed: boolean): string {
  const gap = rec.value - rec.previous
  if (axis === 'reps') return timed ? `+${Math.round(gap)}` : `+${Math.round(gap)}`
  if (axis === 'e1rm') {
    const shown = (displayWeight(gap) ?? gap).toFixed(2)
    return `+${shown}`
  }
  const shown = displayWeight(gap) ?? gap
  const n = shown % 1 === 0 ? shown.toFixed(0) : (shown * 10) % 1 === 0 ? shown.toFixed(1) : shown.toFixed(2)
  return `+${n}`
}

/**
 * What a set's records actually are — opened by tapping the medal on a set.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The badge said "Weight" and stopped there. Whether that was a 2.5 kg jump or a
 * quarter-kilo nudge, and what it beat, existed nowhere: `detectSetPrs` held the
 * beaten baseline in scope and returned only the axis name, and
 * `personal_records` is upsert-on-conflict, so writing the new record destroys
 * the value it replaced. `prEngine` now captures both before absorbing the set.
 *
 * ── WHY IT IS A SHEET, AND WHY IT IS THIS SMALL ──────────────────────────────
 * It answers one question, so it is sized to one answer: a row per claimed axis,
 * the new figure, and the gap. No history chart, no navigation, nothing to
 * scroll. `Sheet` already carries the platform behaviour — drag-to-dismiss with a
 * projected release, interruptible mid-flight, a centred dialog at ≥sm — so this
 * component contributes content and a colour and nothing else.
 *
 * ── AND WHY IT LEADS WITH THE LIFT'S NAME ────────────────────────────────────
 * It used to lead with a generic sheet title ("Personal record") and put the
 * exercise underneath, in the body, at body weight — so the largest type on a
 * panel about beating your Chest Press said "Personal record", which is the one
 * thing you already knew from the medal you tapped to get here. The name of the
 * lift is the news. It is the title now, and the sheet's own header carries the
 * claim instead.
 *
 * ── THE EXPLANATION IS GONE ──────────────────────────────────────────────────
 * A closing paragraph said the record was measured against every previous set of
 * the exercise and would be written at commit. Both are true and neither is read
 * twice: it is a footnote about methodology on a panel that appears at the exact
 * moment you have just done something and want to see the number. It made the
 * sheet a third taller to restate what the rows already demonstrate — each row
 * literally prints what it beat.
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
    <Sheet open={open} onClose={onClose} title={`New Record: ${exerciseName}`} accent={GOLD} maxHeight="56dvh">
      <div className="space-y-1.5 pb-1">
        {/* Which set earned them. One muted line under a title that is already
            the exercise — the pair reads as "this lift, this set" without a
            second heading between them. */}
        <p className="text-[11px] text-muted px-0.5 -mt-1">{setLabel}</p>

        {rows.map(({ axis, rec }) => (
          /* ── ONE ROW, LEFT TO RIGHT, IN READING ORDER ──
             Medal · what kind of record · the number · how much it beat.
             The old row put the axis label above the value in a stacked
             column with the gap floated right, so a sheet claiming three
             records was three two-line blocks and the eye had to travel down
             and back up for each one. Flat rows scan in one pass. */
          <div
            key={axis}
            className="rounded-xl px-2.5 py-2 flex items-center gap-2.5"
            style={{ background: `${GOLD}0d`, border: `1px solid ${GOLD}2e` }}
          >
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `${GOLD}1f`, color: GOLD }}
            >
              <Medal className="w-3.5 h-3.5" aria-hidden="true" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[9px] font-bold uppercase tracking-[0.14em] truncate" style={{ color: GOLD }}>
                {prAxisLabel(axis, timed)}
              </span>
              <span className="helix-num block text-fluid-lg font-extrabold text-text tabular-nums leading-tight truncate">
                {fmtAxis(axis, rec.value, timed)}
              </span>
            </span>

            {/* The gap, and what it beat. The arrow carries the direction so the
                sign never has to be parsed from a bare number. */}
            <span className="text-right shrink-0">
              <span
                className="helix-num flex items-center justify-end gap-0.5 font-extrabold text-fluid-sm tabular-nums leading-none"
                style={{ color: EMERALD }}
              >
                <ArrowUp className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
                {fmtDelta(axis, rec, timed)}
              </span>
              <span className="block text-[9px] text-muted mt-0.5 whitespace-nowrap">
                was {fmtAxis(axis, rec.previous, timed)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
