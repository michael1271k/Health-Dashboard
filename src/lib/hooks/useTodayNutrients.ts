'use client'

import { useMemo } from 'react'
import { useTodayNutrition } from '@/lib/hooks/useDashboard'
import { useSupplements } from '@/lib/hooks/useSupplements'
import { stackForDate } from '@/lib/supplements'
import { useCustomSupplements, customSlotsForDate, nutrientPayloads } from '@/lib/hooks/useCustomSupplements'
import { isTrainingDay } from '@/lib/programs'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { logicalTodayISO } from '@/lib/utils/day'
import { supplementNutrients, mergeNutrients } from '@/lib/nutrition/supplementNutrients'

/**
 * Today's micronutrient intake — food plus whatever the stack has delivered.
 *
 * ── WHY THIS IS A HOOK AND NOT A MEMO ON THE PAGE ────────────────────────────
 * It was a memo inside `/nutrition/nutrients`, which was fine while that page was
 * the only reader. The Fuel widget now prints three of these figures on the
 * dashboard, and two independent derivations of "how much sodium today" is
 * exactly how one screen comes to say 1,840 and another 2,310 — the stack's
 * contribution is easy to forget, and a tile that forgot it would be quietly
 * wrong every single day rather than obviously wrong once.
 *
 * Three facts it folds together, and all three are load-bearing:
 *
 *  · `fiber_g` and `protein_g` are real COLUMNS on `nutrition_entries`; every
 *    other dietary micro rides in the `micros` jsonb the HealthKit sync writes.
 *  · A ticked supplement contributes its label dose exactly like a logged food.
 *    470 mg of vitamin C swallowed every morning is 470 mg of vitamin C.
 *  · Which doses are in force depends on whether today is a TRAINING day, so a
 *    Train↔Rest swap changes the totals — hence `useScheduleVersion`, without
 *    which the store read is invisible to React and the number sticks.
 *
 * Every query behind it is one the dashboard already makes, so on that page
 * this hook is a cache read and not a round-trip.
 */
export function useTodayNutrients(): Record<string, number | undefined> {
  const { data: nutrition } = useTodayNutrition()
  const fromStack = useStackNutrients()

  return useMemo(() => {
    const bundle = (nutrition as { micros?: Record<string, number> | null } | null)?.micros ?? {}
    return mergeNutrients({
      fiber: (nutrition as { fiber_g?: number | null } | null)?.fiber_g,
      protein: nutrition?.protein_g,
      ...bundle,
    }, fromStack)
  }, [nutrition, fromStack])
}

/**
 * The supplement stack's contribution alone.
 *
 * Split out because the Nutrients page shows it as its own figure per row: "470 of
 * 90 mg of vitamin C" reads very differently once you know a tablet supplied all
 * of it, and the page has always drawn that distinction. `useTodayNutrients` folds
 * this into food; nothing else should recompute it.
 */
export function useStackNutrients(): Record<string, number> {
  // ── THIS IS THE SKIPPED SET, NOT THE TAKEN ONE ─────────────────────────────
  // `useSupplements()` returns the keys you REFUSED: the protocol is what
  // happens unless you say otherwise, so `supplement_log` only carries rows for
  // days you opted out of an item. This was bound to `taken` and handed
  // straight to `supplementNutrients`, which meant the stack contributed NOTHING
  // on an ordinary day (no refusals ⇒ empty set ⇒ empty totals) and credited
  // an item precisely when it had been skipped.
  //
  // The weekly export has always inverted it correctly (`useWeeklyLoop`), which
  // is why the report and this screen disagreed every single day.
  const { data: skipped } = useSupplements()
  const { data: customs } = useCustomSupplements()
  const scheduleVersion = useScheduleVersion()
  const date = logicalTodayISO()

  return useMemo(() => {
    void scheduleVersion   // isTrainingDay reads the store; this is the read
    const training = isTrainingDay(date)
    const weekday = new Date(`${date}T12:00:00`).getDay()
    // The DOSES and the PAYLOADS both come from the user's own rows, so an edit
    // in the app moves the micro totals with everything else. Falls back to the
    // seed protocol when the table is empty.
    const slots = stackForDate(customSlotsForDate(customs ?? [], weekday, training), training, weekday)
    const scheduled = slots.flatMap((s) => s.items)
    const taken = scheduled.filter((i) => !skipped?.has(i.key)).map((i) => i.key)
    const doses = new Map(scheduled.map((i) => [i.key, i.dose] as const))
    return supplementNutrients(taken, doses, nutrientPayloads(customs ?? []))
  }, [skipped, date, scheduleVersion, customs])
}
