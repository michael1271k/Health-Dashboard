'use client'

import { m } from 'framer-motion'
import { tapLight } from '@/lib/native/haptics'
import { SNAPPY } from '@/lib/motion/springs'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'
import { RPE_LADDER, rpeColor, rpeLabel, rpeStopIndex, nudgeRpe } from '@/lib/training/effort'
import { EMBER } from '@/lib/theme/palette'

/**
 * Per-SET effort — eight stops, one line.
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
 * ── THE EIGHTH PIP ───────────────────────────────────────────────────────────
 * 8.0 "Challenging" was added between Medium and Hard because that was the
 * ladder's widest gap and the band a hypertrophy block spends most of its sets
 * in. Eight 18px targets plus their 4px gaps is 172px — the row still fits
 * beside the readout at 390px, and each target keeps its 34px height, so the
 * extra rung costs no reachability. It carries its own colour (AMBER) for the
 * same reason it carries its own pip: a rung you cannot tell apart from the one
 * above it is not a rung. See `rpeColor`.
 *
 * ── OFF-LADDER VALUES ────────────────────────────────────────────────────────
 * The column is `numeric(3,1)` and rows already exist holding 6 and 7. Those
 * light no pip; they render in the readout and stay reachable through the ±
 * steppers, which is also how you get to a half-step the ladder skips. A hidden
 * long-press would have been tidier and undiscoverable.
 *
 * 8 USED TO BE ON THAT LIST and is not any more: it became an exact stop when
 * "Challenging" was added, so a row holding a bare 8 now lights the fourth pip
 * and reads "Challenging" instead of falling through to CR10's "Very hard".
 * The stored number did not move — see `RPE_LADDER` in `lib/training/effort`
 * for why that relabel is the whole of the change to existing data.
 */
export function RpeLadder({ value, seedValue, stale, seeded, onPick, setLabel }: {
  value: number | null | undefined
  /**
   * The remembered rating, when memory has withdrawn it from `value`.
   *
   * ── A WITHDRAWN RATING IS STILL A NUMBER ON THE SCREEN ─────────────────────
   * `resolveSeededRpe` clears `rpe` the moment the work gets harder, which is
   * correct for what gets SAVED — an inherited rating must never claim a
   * heavier set felt identical. It was catastrophic for what gets DRAWN. The
   * readout fell to "Not rated", the pips went dark, and the ± steppers — gated
   * on a rating existing — unmounted entirely. Adding one rep to a set showing
   * "10 · Failure" made the number, the word and both controls that could put
   * them back disappear in the same frame.
   *
   * So the value stays rendered, as a GHOST: dim, marked `confirm`, one tap or
   * one nudge from being yours. Nothing is saved from it — `value` is still
   * undefined until you answer — but the question is asked with the answer it
   * expects already in the box, which is the difference between prompting
   * someone and deleting their work.
   */
  seedValue?: number | null
  /** Cleared because the load or the reps went up — this set wants a fresh rating. */
  stale?: boolean
  /** The value came from memory and has not been confirmed. Rendered dimmer. */
  seeded?: boolean
  /**
   * `null` clears the rating. The FAILURE TAG IS NOT PASSED: it is derived from
   * the rating in `cascadeSetEdit`, so this control and the ± steppers below —
   * which call the same handler — can never disagree about it.
   */
  onPick: (choice: { rpe: number } | null) => void
  setLabel: string
}) {
  const reduce = useHelixReducedMotion()
  const rated = value != null
  /** The number the control is ABOUT: yours if you gave one, memory's if not. */
  const ghost = !rated && seedValue != null ? seedValue : null
  const shown = rated ? value : ghost
  const lit = rpeStopIndex(shown)
  const color = rpeColor(shown)
  /** Dim whenever the number on screen has not been affirmed by a tap. */
  const dim = seeded || ghost != null

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
        <span className="text-[10px] font-bold uppercase tracking-wide text-right">
          {shown != null ? (
            <>
              <span style={{ color, opacity: dim ? 0.65 : 1 }}>{`${shown} · ${rpeLabel(shown)}`}</span>
              {/* The ghost says what it is. Without this the dim treatment alone
                  reads as "rated, slightly greyed" rather than as a question,
                  and the whole point of keeping the number is that the reader
                  knows it is waiting on them. */}
              {ghost != null && <span style={{ color: EMBER }}>{' · confirm'}</span>}
            </>
          ) : (
            <span style={{ color: 'var(--color-muted)' }}>{stale ? 'Rate this' : 'Not rated'}</span>
          )}
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
              /**
               * Tapping the lit stop clears it, the same way EffortScale does —
               * a rating you cannot withdraw is a rating you stop trusting.
               *
               * EXCEPT WHEN IT IS SEEDED, and that exception is the whole of a
               * bug. A set carried over from a session you took to failure
               * arrives already showing 10, dimmed, with its seed intact.
               * Tapping it read as "rate this Failure" and was treated as
               * "withdraw the rating" — which, because a seed had not been
               * released, `applyRpeMemory` immediately undid. The tap did
               * nothing, memory stayed in charge, and the next rep added made
               * the work harder than the seed was earned against, so the rating
               * cleared itself and took the readout and the steppers with it.
               *
               * A seeded value has never been affirmed. The first tap affirms
               * it; a second one, now that it is genuinely yours, clears it.
               */
              onPointerDown={() => { void tapLight() }}
              onClick={() => onPick(active && !seeded ? null : { rpe: stop.value })}
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
                  opacity: filled && dim && !active ? 0.5 : 1,
                  boxShadow: active ? `0 0 8px ${rpeColor(stop.value)}99` : undefined,
                }}
              />
            </m.button>
          )
        })}
      </div>

      {/* The load went up and the inherited rating went with it. One dot, no
          banner — enough to say this set wants an answer without interrupting. */}
      {stale && shown == null && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: EMBER }}
          aria-hidden="true"
        />
      )}

      {/* ── Half-step steppers ──
          They render whenever there is a NUMBER to adjust, not only when that
          number is a saved rating. Gating them on `rated` is what made them
          vanish at the exact moment they were needed: memory withdrew the
          rating, and the two controls that could restore it went with it.
          Nudging a ghost commits it — `onPick` releases the seed, so the value
          becomes yours the instant you touch it. */}
      {shown != null && (
        <span className="flex items-center gap-0.5 ml-auto shrink-0">
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              onPointerDown={() => { void tapLight() }}
              onClick={() => {
                const next = nudgeRpe(shown, dir)
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
