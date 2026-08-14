'use client'

import { m } from 'framer-motion'
import { Check } from 'lucide-react'
import { NUTRITION_EXCEPTION_REASONS, exceptionReason } from '@/lib/nutrition/exceptionDay'
import { useSetNutritionException } from '@/lib/hooks/useNutritionException'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'
import { SNAPPY, CROSSFADE } from '@/lib/motion/springs'
import { AMETHYST, SAND, MUTED, alpha } from '@/lib/theme/palette'

/**
 * A day's nutrition context: it was allowed to miss its target, and/or its
 * numbers are a guess.
 *
 * ── TWO FLAGS, ONE CONTROL, AND THEY MEAN DIFFERENT THINGS ───────────────────
 * An exception is PERMISSION — the day was declared allowed to miss its calorie
 * target, and it is graded on protein alone. An estimate is CONFIDENCE — you ate
 * out and could not weigh it, and it changes no number and no grade whatsoever.
 * They co-occur constantly (a restaurant birthday is both), which is exactly why
 * they are two fields rather than one enum, and why the estimate has to be
 * settable on an otherwise perfectly ordinary day.
 *
 * ── WHY THIS IS NOW A CHECKBOX ROW ───────────────────────────────────────────
 * It used to be a collapsed prompt ("Off-plan or estimated? Add context") that
 * expanded into a chip row, above one of two prose bands explaining what the
 * flag had done. Three states, an expand animation, a Change button, and two
 * paragraphs — roughly 120px of surface to record two booleans and pick from
 * five words.
 *
 * The pills were also the wrong affordance. A row of rounded pills reads as
 * "pick one", and the estimate is not one of the five and not exclusive with
 * them — the divider was there to fight the shape rather than use it. A checkbox
 * says what these controls actually are: independent, multi-select, on or off.
 * Nothing expands, so the state is always visible and setting both is two taps
 * with no intermediate state to manage.
 *
 * The terms are still stated, but as ONE line and only once something is
 * declared: forgiveness whose terms the user cannot see is indistinguishable
 * from the app quietly not counting things.
 *
 * ── COLOUR ───────────────────────────────────────────────────────────────────
 * AMETHYST for the exception, SAND for the estimate — the same two hues the
 * history rows and the 7-day rail use, so a declared day is one colour wherever
 * it appears. Both are documented "away" tones rather than failure tones, which
 * is the point: the day is not a failure.
 *
 * ── IT IS NOT ABOUT TODAY ────────────────────────────────────────────────────
 * Every string here is date-neutral, because the one thing you reliably know
 * about an exception is that you know it afterwards. The day page passes a past
 * date; the nutrition page passes today. Nothing else differs.
 */
export function ExceptionDayBanner({ date, stored, estimated = false }: {
  date: string
  stored: string | null
  estimated?: boolean
}) {
  const reason = exceptionReason(stored)
  const reduced = useHelixReducedMotion()
  const set = useSetNutritionException(date)
  const transition = reduced ? CROSSFADE : SNAPPY

  return (
    <div className="rounded-xl border px-3 py-2.5 space-y-2"
      style={{
        borderColor: reason || estimated ? alpha(AMETHYST, 0.24) : 'rgba(255,255,255,0.08)',
        background: reason || estimated ? alpha(AMETHYST, 0.05) : 'rgba(255,255,255,0.03)',
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] shrink-0" style={{ color: MUTED }}>
          Context
        </span>
        {NUTRITION_EXCEPTION_REASONS.map((r) => (
          <ContextBox
            key={r}
            label={r}
            color={AMETHYST}
            checked={reason === r}
            reduced={reduced}
            transition={transition}
            // Tapping the checked reason withdraws the exception entirely —
            // the same "tap it again to undo" the weigh-in chips use.
            onToggle={() => set.mutate({ reason: reason === r ? null : r })}
          />
        ))}
        <span className="w-px self-stretch mx-0.5" style={{ background: 'rgba(255,255,255,0.08)' }} aria-hidden="true" />
        {/* After a divider, not as a sixth reason. It is not a reason, and it is
            not exclusive with one. */}
        <ContextBox
          label="Estimated"
          color={SAND}
          checked={estimated}
          reduced={reduced}
          transition={transition}
          onToggle={() => set.mutate({ estimated: !estimated })}
        />
      </div>

      {(reason || estimated) && (
        <p className="text-[10px] text-muted leading-snug">
          {reason
            ? 'Graded on protein only. Intake still counts toward the week and the trend.'
            : 'Counted in full. Nothing is forgiven — this only flags the numbers as a guess.'}
        </p>
      )}
    </div>
  )
}

/**
 * One checkbox. The box carries the state and the label names it — no pill
 * background to read as a segmented control, and a 36px minimum so it stays a
 * real touch target at 11px of text.
 */
function ContextBox({ label, color, checked, onToggle, reduced, transition }: {
  label: string
  color: string
  checked: boolean
  onToggle: () => void
  reduced: boolean
  transition: typeof SNAPPY | typeof CROSSFADE
}) {
  return (
    <m.button
      type="button"
      onClick={onToggle}
      role="checkbox"
      aria-checked={checked}
      whileTap={reduced ? undefined : { scale: 0.94 }}
      transition={transition}
      className="flex items-center gap-1.5 min-h-[36px] px-1 text-[11px] font-semibold transition-colors"
      style={{ color: checked ? color : undefined }}
    >
      <span
        className="w-4 h-4 rounded-[5px] flex items-center justify-center shrink-0 transition-colors"
        style={{
          background: checked ? color : 'transparent',
          border: `1px solid ${checked ? color : 'rgba(255,255,255,0.22)'}`,
        }}
      >
        {checked && <Check className="w-3 h-3" style={{ color: '#0A0B0D' }} aria-hidden="true" />}
      </span>
      {label}
    </m.button>
  )
}
