'use client'

import { m } from 'framer-motion'
import { tapLight } from '@/lib/native/haptics'
import { SNAPPY } from '@/lib/motion/springs'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'
import { EMERALD, GOLD, OXIDE } from '@/lib/theme/palette'

/**
 * Per-exercise effort, in three taps — Easy / Hard / Failure.
 *
 * WHY THREE AND WHY PER EXERCISE
 * Hevy's export carries no RPE and Helix is never open at the gym, so every
 * value here is recalled after the fact. A 6–10 half-step scale asks for a
 * precision nobody has hours later, and a per-SET control asks for it twenty-four
 * times a session — which is not twenty-four data points, it is twenty-four
 * guesses. One coarse rating per exercise is roughly six taps and is a thing a
 * person can actually answer.
 *
 * The numeric column is untouched: these write `rpe` 7 / 9 / 10, so a finer
 * scale can arrive later without a migration and every existing consumer
 * (`SetEditorRow`, the session report, `save.ts`) keeps working unchanged.
 *
 * `Failure` also sets `set_type = 'failure'`, because that is what the word
 * means on this row. The two are adjacent but not identical elsewhere —
 * `set_type` says the set was taken to failure, `rpe: 10` says effort was
 * maximal — and both are worth recording when the user says so explicitly.
 */

export interface EffortChoice {
  rpe: number
  /** Also mark the set as taken to failure. */
  failure?: boolean
}

// Emerald / gold / oxide — the app's existing easy-to-severe ramp, the same one
// the readiness bands and the calorie-distance ramp already read left to right.
const CHIPS: Array<{ label: string; rpe: number; color: string; failure?: boolean }> = [
  { label: 'Easy',    rpe: 7,  color: EMERALD },
  { label: 'Hard',    rpe: 9,  color: GOLD },
  { label: 'Failure', rpe: 10, color: OXIDE, failure: true },
]

export function EffortChips({ value, onPick }: {
  /** Current `rpe` on the set this row writes to, if any. */
  value: number | null | undefined
  /** `null` clears the rating. */
  onPick: (choice: EffortChoice | null) => void
}) {
  const reduce = useHelixReducedMotion()

  return (
    <div className="flex items-center gap-2 px-1 pt-1">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted shrink-0">Effort</span>
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Session effort for this exercise">
        {CHIPS.map((c) => {
          const active = value === c.rpe
          return (
            <m.button
              key={c.label}
              type="button"
              role="radio"
              aria-checked={active}
              // Tapping the active chip clears it, the same way EffortScale does —
              // a rating you cannot withdraw is a rating you stop trusting.
              onClick={() => { void tapLight(); onPick(active ? null : { rpe: c.rpe, failure: c.failure }) }}
              whileTap={reduce ? undefined : { scale: 0.94 }}
              transition={SNAPPY}
              className="min-h-[30px] px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors"
              style={active
                ? { color: c.color, background: `${c.color}1f`, border: `1px solid ${c.color}66` }
                : { color: 'var(--color-muted)', background: 'transparent', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              {c.label}
            </m.button>
          )
        })}
      </div>
    </div>
  )
}
