'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { subscribeScheduleOverrides, scheduleOverridesVersion } from '@/lib/schedule/overrides'
import { subscribeProgramLayout, programLayoutVersion } from '@/lib/schedule/layoutStore'
import { subscribePlanPrefs, planPrefsVersion } from '@/lib/programs'

/**
 * Subscribe to everything that decides what today's workout is.
 *
 * ANY component that calls `scheduleDayFor` / `isTrainingDay` / `isRestDayFor` /
 * `activeProgram` / `activePhase` during render MUST call this too. All of them
 * are synchronous reads of module-level caches that React cannot see — without
 * a subscription the component renders once against whatever was cached at
 * mount and never hears about the DB fetch that follows. That is exactly the
 * bug where a swap made on the phone showed the old day on the desktop until
 * something unrelated forced a re-render.
 *
 * It covers THREE stores because they answer one question between them:
 *
 *   · per-date overrides (`schedule_overrides`) — this week's rearrangements
 *   · the permanent weekday layout (`program_day_layout`) — every week's
 *   · plan/phase preferences (`user_goals.active_plan` / `active_phase`) —
 *     which days exist at all, and how many sets each prescribes
 *
 * A component that subscribed to one and not the others would be right some of
 * the time, which is the worst available outcome: it would look correct until
 * the day it silently wasn't.
 *
 * Returns a version number so it can be used as a `useMemo` dependency:
 *
 *   const v = useScheduleVersion()
 *   const day = useMemo(() => { void v; return scheduleDayFor(today) }, [today, v])
 *
 * The server snapshot is a constant, so SSR and hydration agree.
 */
export function useScheduleVersion(): number {
  const subscribe = useCallback((onChange: () => void) => {
    const offSchedule = subscribeScheduleOverrides(onChange)
    const offLayout = subscribeProgramLayout(onChange)
    const offPlan = subscribePlanPrefs(onChange)
    return () => { offSchedule(); offLayout(); offPlan() }
  }, [])
  // Summed, not concatenated: the contract is only "a different number when
  // something changed", and every counter increases monotonically.
  const snapshot = useCallback(
    () => scheduleOverridesVersion() + programLayoutVersion() + planPrefsVersion(),
    [],
  )
  return useSyncExternalStore(subscribe, snapshot, () => 0)
}
