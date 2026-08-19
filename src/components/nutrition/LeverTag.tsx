'use client'

import { Gauge } from 'lucide-react'
import { useNutritionGoals } from '@/lib/hooks/useNutritionGoals'
import { LEVERS } from '@/lib/nutrition/levers'
import { GOLD } from '@/lib/theme/palette'

/**
 * Which rung of the cut is in force, said out loud.
 *
 * ── WHY IT LEAVES THE SETTINGS PAGE ──────────────────────────────────────────
 * The lever changed what every calorie ring in the app grades against and then
 * named itself in exactly one place: a card three taps deep in Settings. So the
 * dashboard's macro ring simply moved by 70 kcal one morning with nothing on
 * screen saying why, and mid-session there was no way to answer "which target
 * am I on today" without leaving the deck.
 *
 * The tag is the answer, in the two places the question gets asked: the
 * dashboard, where the day is read, and the live logger, where it is spent. It
 * carries the calorie figure as well as the name — "Lever 1" is a label, and
 * 1,885 is the fact the label stands for.
 *
 * Renders nothing when no rung is in force (custom numbers, or a date before
 * the cut opened): a chip saying "Custom" would be chrome, not information.
 */
export function LeverTag({ compact = false }: {
  /** Header variant — name only, for a row that is already carrying numbers. */
  compact?: boolean
}) {
  const goals = useNutritionGoals()
  const rung = LEVERS.find((l) => l.id === goals.lever)
  if (!rung) return null

  return (
    <span
      className="shrink-0 inline-flex items-center gap-1 px-1.5 py-px rounded-md text-[10px] font-bold uppercase tracking-wide tabular-nums"
      style={{ color: GOLD, background: `${GOLD}1a`, border: `1px solid ${GOLD}55` }}
      title={`${rung.label} — ${rung.summary}`}
    >
      <Gauge className="w-2.5 h-2.5" aria-hidden="true" />
      {rung.label}
      {!compact && (
        <span className="helix-num font-normal opacity-80">· {rung.calorieGoal} kcal</span>
      )}
    </span>
  )
}
