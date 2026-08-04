'use client'

import { useSyncExternalStore } from 'react'
import { subscribeScheduleOverrides, scheduleOverridesVersion } from '@/lib/schedule/overrides'

/**
 * Subscribe to the schedule-override store.
 *
 * ANY component that calls `scheduleDayFor` / `isTrainingDay` / `isRestDayFor`
 * during render MUST call this too. Those helpers are synchronous reads of a
 * module-level cache, which React cannot see — without a subscription the
 * component renders once against whatever the cache held at mount and never
 * hears about the DB fetch that follows. That is precisely the bug where a swap
 * made on the phone showed the old day on the desktop until something else
 * forced a re-render.
 *
 * Returns the version number so it can be used as a `useMemo` dependency:
 *
 *   const v = useScheduleVersion()
 *   const day = useMemo(() => scheduleDayFor(today), [today, v])
 *
 * The server snapshot is a constant, so SSR and hydration agree.
 */
export function useScheduleVersion(): number {
  return useSyncExternalStore(
    subscribeScheduleOverrides,
    scheduleOverridesVersion,
    () => 0,
  )
}
