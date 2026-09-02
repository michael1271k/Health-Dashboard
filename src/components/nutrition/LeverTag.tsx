'use client'

import { Gauge, Leaf } from 'lucide-react'
import { useNutritionGoals } from '@/lib/hooks/useNutritionGoals'
import { LEVERS, scheduledLeverOn } from '@/lib/nutrition/levers'
import { logicalTodayISO } from '@/lib/utils/day'
import { SAND } from '@/lib/theme/palette'

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
 *
 * ── AND IT CAN BE ASKED ABOUT A DAY THAT IS NOT TODAY ────────────────────────
 * `useNutritionGoals()` resolves the rung for the wall clock, which is right on
 * a dashboard and wrong on a finished session's report: opening Sunday's
 * workout on Wednesday would badge it with Wednesday's rung. A completed
 * session is a fact about the day it happened on — and the maintenance week is
 * exactly the rung a report most needs to name, because it is why the volume,
 * the steps and the food all moved that week.
 *
 * `date` switches the resolution to `scheduledLeverOn`, which is the same
 * answer `leverForDate` gives for any past date: the past belongs to the
 * schedule, and nothing selected later may re-mark it. Today and the future
 * still come from the live selection, so passing today's date changes nothing.
 */
export function LeverTag({ compact = false, date }: {
  /** Header variant — name only, for a row that is already carrying numbers. */
  compact?: boolean
  /** Resolve the rung for THIS day rather than for now. */
  date?: string
}) {
  // A PAST day is answered by the schedule alone, so it needs no query at all —
  // and must not open one. `TodayLeverTag` is a separate component rather than
  // a branch inside this body precisely so the hook is not called on a path
  // that has no use for it: a finished session's report renders this chip and
  // would otherwise have to stand inside a QueryClientProvider to name a fact
  // that is a compiled constant.
  if (date !== undefined && date < logicalTodayISO()) {
    return <Rung id={scheduledLeverOn(date)} compact={compact} />
  }
  return <TodayLeverTag compact={compact} />
}

/** Today and later: the live selection, through the goals the app is grading. */
function TodayLeverTag({ compact }: { compact: boolean }) {
  const goals = useNutritionGoals()
  return <Rung id={goals.lever} compact={compact} />
}

/** One rung, drawn. Nothing at all when the id names none. */
function Rung({ id, compact }: { id: string | null; compact: boolean }) {
  const rung = LEVERS.find((l) => l.id === id)
  if (!rung) return null

  // ── A RELEASE IS NOT A NOTCH ON THE LADDER ────────────────────────────────
  // Every deficit rung is "one tighter than the last", and the gauge glyph says
  // so. A maintenance week is the opposite move — planned, bounded, taken on
  // purpose — and it is the one rung a reader most needs to recognise without
  // reading, because it is the week their volume, steps and calories all move
  // at once. Its own glyph, and its short name: "Maintenance Week · 2151 kcal"
  // in a header row is a sentence, not a chip.
  const release = rung.kind === 'release'
  const Icon = release ? Leaf : Gauge
  const label = release ? 'Maintenance' : rung.label

  return (
    <span
      className="shrink-0 inline-flex items-center gap-1 px-1.5 py-px rounded-md text-[10px] font-bold uppercase tracking-wide tabular-nums"
      // SAND, not GOLD. Gold means a personal record app-wide (WEEK_STATE.pr),
      // and the compact variant of this chip renders in the logger header inches
      // from the gold Records tile — two golds, two meanings, one glance. SAND is
      // the palette's dietary-context tone (it already carries the travel/deload
      // rung), which is exactly what a calorie lever is.
      style={{ color: SAND, background: `${SAND}1a`, border: `1px solid ${SAND}55` }}
      title={`${rung.label} — ${rung.summary}`}
    >
      <Icon className="w-2.5 h-2.5" aria-hidden="true" />
      {label}
      {!compact && (
        <span className="helix-num font-normal opacity-80">· {rung.calorieGoal} kcal</span>
      )}
    </span>
  )
}
