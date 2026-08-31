'use client'

import { ToggleRow } from '@/components/settings/SettingsRows'
import { tapLight } from '@/lib/native/haptics'
import { useSleepOnset, useSetSleepOnset } from '@/lib/hooks/useSleepOnset'

/**
 * "Trouble falling asleep", inside the Sleep drawer.
 *
 * ── WHY IT SITS HERE AND NOWHERE ELSE ────────────────────────────────────────
 * The drawer is already the one surface that says everything about one night —
 * stages, bed and wake times, the week's debt — and it is reached identically
 * from the dashboard tile and from any past day's Nexus. Putting the switch in
 * it means "retroactive" costs no second control: `/day/2026-08-12` opens the
 * same component bound to that date, and the widget's `?section=sleep` deep
 * link lands on it too.
 *
 * ── AND WHY A SWITCH, NOT A SEVERITY ─────────────────────────────────────────
 * Sleep latency is the one thing here the watch cannot see: HealthKit reports
 * when you were asleep, never how long you lay there trying. A five-step scale
 * would ask you to grade a thing you were, by definition, not conscious for the
 * end of. It happened or it did not, and one tap is the price a nightly question
 * has to meet to still be answered in March.
 *
 * `date` is required rather than defaulted: every caller knows which night it is
 * showing, and a component that silently falls back to today is exactly how a
 * retroactive surface writes to the wrong day.
 */
export function SleepOnsetToggle({ date }: { date: string }) {
  const { data: on } = useSleepOnset(date)
  const set = useSetSleepOnset(date)

  return (
    <ToggleRow
      label="Trouble falling asleep"
      hint="Reported, never scored — it rides with the night in the weekly export."
      on={on === true}
      onToggle={() => { void tapLight(); set.mutate(!(on === true)) }}
    />
  )
}
