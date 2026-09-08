'use client'

import { ToggleRow } from '@/components/settings/SettingsRows'
import { tapLight } from '@/lib/native/haptics'
import { useSleepInaccurate, useSetSleepInaccurate } from '@/lib/hooks/useSleepOnset'

/**
 * "The watch got this night wrong", inside the Sleep drawer.
 *
 * ── WHY THE READING NEEDS A WAY TO BE DISPUTED ───────────────────────────────
 * Every other number on this drawer has a second source: weight has the scale,
 * intake has the log, steps have your own legs. HealthKit's sleep has nothing —
 * a phone left on the bed reads as a night, a nap folds into one, an hour lying
 * awake with the watch on reads as core sleep — and the figure lands with the
 * same authority as a measured one, feeds the sleep score, and cannot be
 * argued with by any control in the app.
 *
 * ── AND WHY IT DOES NOT CORRECT ANYTHING ─────────────────────────────────────
 * The obvious version of this feature lets you type the real number, or drops
 * the night from the averages. Both are worse: the first replaces a measurement
 * with a memory of one, and the second silently changes a week's average
 * depending on how you felt about it. This only MARKS the reading — the figure
 * stands everywhere it stood, and the weekly export carries `sleep:inaccurate`
 * on that day's line so the reader discounts it themselves.
 *
 * It sits beside `SleepOnsetToggle` for the reason that one gives at length:
 * the drawer is the one surface that says everything about one night, and it is
 * reached identically from the dashboard tile and from any past day's Nexus, so
 * "retroactive" costs no second control.
 *
 * `date` is required, never defaulted — same reason: a component that silently
 * falls back to today is how a retroactive surface writes to the wrong day.
 */
export function SleepInaccurateToggle({ date }: { date: string }) {
  const { data: on } = useSleepInaccurate(date)
  const set = useSetSleepInaccurate(date)

  return (
    <ToggleRow
      label="Watch data inaccurate"
      hint="Marks the night in the weekly export. Nothing is recalculated — the reading stands."
      on={on === true}
      onToggle={() => { void tapLight(); set.mutate(!(on === true)) }}
    />
  )
}
