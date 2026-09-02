'use client'

import { useMemo } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Segmented } from '@/components/ui/Segmented'
import { useRestTargets } from '@/lib/hooks/useRestTargets'
import { tapLight } from '@/lib/native/haptics'
import { STEEL, SAND } from '@/lib/theme/palette'
import {
  restTargetFor, planRestTargetFor, programRestSec, setRestTarget, setSessionRestTarget,
  hasSessionRestOverride, formatRestTarget,
  REST_STEP_SEC, REST_MIN_SEC, REST_MAX_SEC,
} from '@/lib/training/restTargets'

/**
 * The rests worth one tap. Anything off this grid is the dial's job.
 *
 * ── 0:30 AND 2:30 ARE NOT DECORATION ─────────────────────────────────────────
 * The row was 1:00 / 1:30 / 2:00 / 3:00 — four chips with a hole in the middle
 * and nothing at all below a minute. A half-minute is the real rest on a
 * warm-up, a cable finisher or the second half of a drop set, and 2:30 is the
 * gap between 2:00 and 3:00 that a heavy compound actually lands in; both were
 * reachable only by tapping the dial three or five times. Six chips still fit
 * one line at 390px because each is four characters wide.
 */
const PRESETS = [30, 60, 90, 120, 150, 180] as const

/**
 * Adjust the rest target for one movement, for THIS session.
 *
 * ── THERE IS EXACTLY ONE REST NUMBER ON THE CARD ────────────────────────────
 * The card used to show it twice: a chip in the header and a ± dial under the
 * exercise name, both reading `restTargetFor`, neither counting anything. Two
 * controls for one fact, taking two lines of a card whose whole job is set
 * rows. So the chip is the only reading, and editing lives here, one tap
 * behind it, which is where an occasional decision belongs.
 *
 * ── AND THE SHEET STOPPED BEING GRAND ───────────────────────────────────────
 * It was six stacked blocks in ~380px: a centred `text-fluid-3xl` hero number,
 * a sentence under it, a segmented row, a SECOND control (`RestTargetControl`)
 * that re-drew the same value with its own ± and its own reset, a full-width
 * reset button, and a two-line footnote arguing a philosophy to a reader who
 * had already opened the sheet. For a number changed twice a training block.
 *
 * What is left is the control and the value it moves, in one row, with the four
 * common prescriptions under it. The hero and the dial were the same number
 * twice, so they are now one thing — the figure sits BETWEEN its own steppers,
 * which is also what makes it obvious that the steppers move it. Reset became a
 * ghost link on the label row rather than a 44px full-width button for an
 * action taken once in a while. The footnote is gone.
 *
 * ── WHY AN EDIT HERE DOES NOT TOUCH THE PLAN ────────────────────────────────
 * This is the LOGGER. A rest you change with a barbell in front of you is
 * almost never a revision of the block — it is the gym being busy, a knee
 * complaining, twenty minutes left before a meeting. It is a fact about today.
 *
 * And the old behaviour was worse than "permanent": `setRestTarget` writes a
 * store keyed `program|day|exercise` with no date in it, and `useWeeklyLoop`
 * resolves that store at READ TIME — so nudging Calf Press to 1:45 tonight
 * silently rewrote what every past export says you rested for on every Legs A.
 * One edit, retroactive across the block.
 *
 * So the primary control writes `setSessionRestTarget`, which carries the
 * session's date. Promoting a value to the plan is still possible and is now a
 * deliberate, secondary, named act — the row at the bottom — rather than the
 * side effect of a tap.
 */
export function RestTargetSheet({ open, onClose, exerciseName, dayKey, dateISO }: {
  open: boolean
  onClose: () => void
  exerciseName: string
  /** Calf Press rests 1:30 on Legs A and 1:45 on Legs B — the day disambiguates. */
  dayKey?: string | null
  /**
   * The session being logged. `save.ts` allows one session per calendar date,
   * so the date IS the session — and unlike a session id it exists before the
   * commit, which is when this edit gets made.
   *
   * Absent, the sheet falls back to editing the plan, which is the honest
   * behaviour for a caller that is not inside a session.
   */
  dateISO?: string | null
}) {
  const version = useRestTargets()
  const target = useMemo(
    () => { void version; return restTargetFor(exerciseName, dayKey, undefined, dateISO) },
    [version, exerciseName, dayKey, dateISO],
  )
  /** What this movement rests for on every OTHER session — the layer beneath. */
  const plan = useMemo(
    () => { void version; return planRestTargetFor(exerciseName, dayKey) },
    [version, exerciseName, dayKey],
  )
  const programmed = useMemo(
    () => { void version; return programRestSec(exerciseName, dayKey) },
    [version, exerciseName, dayKey],
  )
  const sessionEdited = useMemo(
    () => { void version; return dateISO ? hasSessionRestOverride(dateISO, exerciseName, dayKey) : false },
    [version, exerciseName, dayKey, dateISO],
  )

  /** One writer for every control in here, so the tier cannot vary by button. */
  const commit = (sec: number | null) => {
    void tapLight()
    if (dateISO) setSessionRestTarget(dateISO, exerciseName, sec, dayKey)
    else setRestTarget(exerciseName, sec, dayKey)
  }

  return (
    /* `compact`: this sheet cannot overflow — a label row, a dial, one row of
       chips and a scope line — so the scroller's `pb-5` was stacking on the
       panel's own `safe-pb` and leaving a band of nothing under the last
       control taller than the control itself. */
    <Sheet open={open} onClose={onClose} title="Rest target" accent={STEEL} compact>
      <div className="space-y-2">
        {/* Label row: which movement, and the way back — a ghost link, not a
            button. Resetting is rare and reversible; it does not earn 44px of
            filled surface at the foot of the sheet. */}
        <div className="flex items-baseline gap-2 px-0.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted truncate">
            {exerciseName}
          </span>
          {sessionEdited && plan != null && (
            <button
              type="button"
              onClick={() => commit(null)}
              className="ml-auto shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold
                         text-muted hover:text-text active:opacity-60 transition-colors"
              aria-label={`Back to ${formatRestTarget(plan)}, the usual target for this movement`}
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              {formatRestTarget(plan)}
            </button>
          )}
        </div>

        {/* ── THE VALUE, BETWEEN ITS OWN STEPPERS ──
            One pill, hairline-divided, exactly like the deck's set tuner — so
            the two number controls in the logger are visibly the same kind of
            object. The figure is the widest element because it is the subject. */}
        <div className="flex items-stretch rounded-xl border border-border bg-surface-2 overflow-hidden min-h-[44px]">
          <Step
            dir={-1}
            disabled={target == null || target <= REST_MIN_SEC}
            onClick={() => target != null && commit(target - REST_STEP_SEC)}
            label={`${REST_STEP_SEC} seconds less`}
          />
          <span className="flex-1 grid place-items-center helix-num text-fluid-xl font-bold tabular-nums text-text">
            {target != null ? formatRestTarget(target) : '—'}
          </span>
          <Step
            dir={1}
            disabled={target == null || target >= REST_MAX_SEC}
            onClick={() => commit((target ?? 0) + REST_STEP_SEC)}
            label={`${REST_STEP_SEC} seconds more`}
          />
        </div>

        {/* Four taps cover almost every prescription. `value` simply fails to
            match when the target is off-grid, which is the honest rendering —
            no segment is selected because none of them is it. */}
        {/* Centred, not left-aligned. `Segmented` sizes itself to its content
            (`w-fit`), so a six-chip row hung off the left edge with the leftover
            width pooling on the right — a control that is visibly narrower than
            its container should be centred in it or filled to it, and filling it
            would stretch six four-character chips into six buttons. */}
        <div className="flex justify-center">
          <Segmented
            label="Common rest targets"
            accent={STEEL}
            size="sm"
            value={target != null ? String(target) : ''}
            onChange={(v) => commit(Number(v))}
            options={PRESETS.map((p) => ({ value: String(p), label: formatRestTarget(p) }))}
          />
        </div>

        {/* ── THE SCOPE, STATED, AND THE ONE WAY OUT OF IT ──
            The line is not decoration: an edit that looks permanent and is not
            (or the reverse) is the entire failure this split exists to prevent,
            so the sheet says which it is in the same breath as the number.
            Promoting to the plan is a named act with its own button, never the
            side effect of a tap on the dial above. */}
        {dateISO && (
          <div className="flex items-center gap-2 px-0.5 pt-0.5">
            <span className="text-[11px] text-muted leading-snug min-w-0">
              {sessionEdited
                ? <>This session only{plan != null && <> · usually {formatRestTarget(plan)}</>}</>
                : <>From the plan{plan != null && plan !== programmed ? ' (your value)' : ''}</>}
            </span>
            {sessionEdited && target != null && (
              <button
                type="button"
                onClick={() => { void tapLight(); setRestTarget(exerciseName, target, dayKey) }}
                className="ml-auto shrink-0 min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold
                           active:scale-95 transition-transform"
                style={{ color: SAND, background: `${SAND}1a`, border: `1px solid ${SAND}55` }}
              >
                Keep for every session
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}

/**
 * One ± of the dial.
 *
 * Its own component for the same reason `SetEditorRow` has one: two
 * near-identical buttons written inline is two chances to give them different
 * hit areas, and the haptic belongs on `pointerDown`.
 */
function Step({ dir, disabled, onClick, label }: {
  dir: -1 | 1
  disabled: boolean
  onClick: () => void
  label: string
}) {
  const Icon = dir === 1 ? Plus : Minus
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={() => { void tapLight() }}
      onClick={onClick}
      aria-label={label}
      className={`w-14 grid place-items-center text-text active:bg-white/[0.06] transition-colors
                  disabled:opacity-30 ${dir === 1 ? 'border-l' : 'border-r'} border-border`}
    >
      <Icon className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
    </button>
  )
}
