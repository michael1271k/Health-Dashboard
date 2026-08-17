'use client'

import { useMemo } from 'react'
import { useContinuum } from '@/lib/hooks/useContinuum'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { isTrainingDay } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { isoAddDays } from '@/lib/utils/week'
import { streakFrom, STREAK_WINDOW_DAYS } from '@/lib/training/streak'

/**
 * The app's read of the streak — the same number the widget shows, from the same
 * derivation, over the same window.
 *
 * ── WHY IT REBUILDS THE WINDOW INSTEAD OF WALKING THE CONTINUUM ──────────────
 * `useContinuum` deliberately drops days with no data at all, so a scheduled
 * training day that was simply MISSED does not appear in its list. Walking that
 * list would therefore never see the thing the streak is defined by. The days
 * are enumerated from today instead and each one asked two questions — was it
 * scheduled, was it trained — which is exactly the shape the payload route
 * builds server-side.
 *
 * `useScheduleVersion` is not decoration: `isTrainingDay` reads the schedule
 * override store, which lives outside React and changes when a day is swapped.
 * Without the subscription this memo would keep answering with the pre-swap
 * plan for the rest of the session.
 */
export function useStreak(): { current: number; best: number } {
  const { data } = useContinuum()
  const scheduleVersion = useScheduleVersion()

  return useMemo(() => {
    void scheduleVersion   // isTrainingDay reads the store; this is the read
    const today = logicalTodayISO()
    const logged = new Set((data ?? []).filter((d) => d.session).map((d) => d.date))

    const days = Array.from({ length: STREAK_WINDOW_DAYS }, (_, i) => {
      const d = isoAddDays(today, -(STREAK_WINDOW_DAYS - 1 - i))
      return { d, scheduled: isTrainingDay(d), logged: logged.has(d) }
    })

    return streakFrom(days, today)
  }, [data, scheduleVersion])
}
