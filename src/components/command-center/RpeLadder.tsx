'use client'

import { m } from 'framer-motion'
import { tapLight } from '@/lib/native/haptics'
import { SNAPPY } from '@/lib/motion/springs'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'
import { RPE_LADDER, rpeColor, rpeLabel, rpeStopIndex, nudgeRpe } from '@/lib/training/effort'
import { EMBER } from '@/lib/theme/palette'

/**
 * Per-SET effort — seven stops, one line.
 *
 * ── WHY THIS REPLACED THE THREE CHIPS ────────────────────────────────────────
 * The old control was Easy 7 / Hard 9 / Failure 10, one rating per EXERCISE. Its
 * own header argued against going finer, on the grounds that asking twenty-four
 * times a session yields twenty-four guesses rather than twenty-four data points.
 * That objection is real, so this design answers it rather than ignoring it:
 *
 *   · Rating set 1 PROPOSES the same value for the rest of the exercise, and
 *     last session's rating proposes today's. You tap only where it changed —
 *     three to five taps a session, not twenty-four.
 *   · A proposal that came from memory clears itself the moment the work gets
 *     harder (`resolveSeededRpe`), so an inherited number can never quietly
 *     describe a set you never rated.
 *   · Warm-ups are never asked.
 *
 * What the extra stops buy is the distinction the three chips collapsed: a set
 * with zero reps left but clean form is not a set you failed. Below 7 one word
 * is enough, because a set that easy is a fact about the LOAD, not the effort.
 *
 * ── OFF-LADDER VALUES ────────────────────────────────────────────────────────
 * The column is `numeric(3,1)` and rows already exist holding 6, 7 and 8. Those
 * light no pip; they render in the readout and stay reachable through the ±
 * steppers, which is also how you get to a half-step the ladder skips. A hidden
 * long-press would have been tidier and undiscoverable.
 */
export function RpeLadder({ value, stale, seeded, onPick, setLabel }: {
  value: number | null | undefined
  /** Cleared because the load or the reps went up — this set wants a fresh rating. */
  stale?: boolean
  /** The value came from memory and has not been confirmed. Rendered dimmer. */
  seeded?: boolean
  /** `null` clears the rating. `failure` mirrors the old chip's side effect. */
  onPick: (choice: { rpe: number; failure?: boolean } | null) => void
  setLabel: string
}) {
  const reduce = useHelixReducedMotion()
  const lit = rpeStopIndex(value)
  const rated = value != null
  const color = rpeColor(value)

  return (
    /**
     * ── TWO LINES, BECAUSE THE WORD IS THE POINT ──────────────────────────────
     * This was one line: the label, seven 18px pips, the readout, and two
     * steppers. Everything but the readout was `shrink-0`, so the readout — the
     * only element that says what the rating MEANS — absorbed every pixel of
     * overflow and was the first thing to ellipsize. On a 390px phone
     * "9 · VERY HARD" rendered as "9 · VER…", and "MAX EFFORT" never rendered
     * at all. Giving it its own line costs 14px and removes the failure mode
     * entirely, however narrow the screen gets.
     */
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted/60">Effort</span>
        {/* Readout. Carries the word, not just the number — "8.5" means nothing
            to someone who has not memorised the ladder, and the label is the
            whole point of having one. No `truncate`: it is on its own line now
            and there is nothing for it to lose a fight with. */}
        <span
          className="text-[10px] font-bold uppercase tracking-wide text-right"
          style={{ color: rated ? color : 'var(--color-muted)', opacity: seeded ? 0.65 : 1 }}
        >
          {rated ? `${value} · ${rpeLabel(value)}` : stale ? 'Rate this' : 'Not rated'}
        </span>
      </div>

      <div className="flex items-center gap-2 min-w-0">
      <div
        className="flex items-center gap-1 shrink-0"
        role="radiogroup"
        aria-label={`Effort for ${setLabel}`}
      >
        {RPE_LADDER.map((stop, i) => {
          const active = lit === i
          // Every stop at or below the lit one fills, so the ladder reads as a
          // level rather than as one dot floating in a row of empties.
          const filled = lit >= 0 && i <= lit
          return (
            <m.button
              key={stop.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${stop.label} — ${stop.hint}`}
              title={`${stop.label} · ${stop.hint}`}
              // Tapping the lit stop clears it, the same way EffortScale does —
              // a rating you cannot withdraw is a rating you stop trusting.
              onPointerDown={() => { void tapLight() }}
              onClick={() => onPick(active ? null : { rpe: stop.value, failure: stop.value === 10 })}
              whileTap={reduce ? undefined : { scale: 0.88 }}
              transition={SNAPPY}
              // 44pt of hit area around a 5px dot: the target is the padding,
              // not the ink.
              className="relative w-[18px] h-[34px] flex items-center justify-center"
            >
              <span
                className="block rounded-full transition-[background-color,box-shadow,transform] duration-150"
                style={{
                  width: active ? 9 : 5,
                  height: active ? 9 : 5,
                  background: filled ? rpeColor(stop.value) : 'rgba(255,255,255,0.16)',
                  opacity: filled && seeded && !active ? 0.5 : 1,
                  boxShadow: active ? `0 0 8px ${rpeColor(stop.value)}99` : undefined,
                }}
              />
            </m.button>
          )
        })}
      </div>

      {/* The load went up and the inherited rating went with it. One dot, no
          banner — enough to say this set wants an answer without interrupting. */}
      {stale && !rated && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: EMBER }}
          aria-hidden="true"
        />
      )}

      {/* Half-step steppers. Only once a rating exists — they adjust a value,
          they do not invent one. */}
      {rated && (
        <span className="flex items-center gap-0.5 ml-auto shrink-0">
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              onPointerDown={() => { void tapLight() }}
              onClick={() => {
                const next = nudgeRpe(value, dir)
                if (next != null && next !== value) onPick({ rpe: next })
              }}
              aria-label={`${dir > 0 ? 'Increase' : 'Decrease'} effort for ${setLabel} by half a point`}
              className="min-h-[30px] min-w-[26px] rounded-lg border border-white/[0.08] bg-white/[0.04]
                         text-[11px] font-bold text-muted active:scale-95 transition-transform"
            >
              {dir > 0 ? '+' : '−'}
            </button>
          ))}
        </span>
      )}
      </div>
    </div>
  )
}
