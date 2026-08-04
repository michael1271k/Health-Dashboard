'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { subscribeScheduleOverrides, scheduleOverridesVersion } from '@/lib/schedule/overrides'
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
 * It covers TWO stores because they answer one question between them: the
 * per-date overrides (`schedule_overrides`) and the plan/phase preferences
 * (`user_goals.active_plan` / `active_phase`). Switching plan changes which
 * days exist; switching phase changes the prescribed sets within them. A
 * component that cared about one and not the other would be right half the time.
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
    const offPlan = subscribePlanPrefs(onChange)
    return () => { offSchedule(); offPlan() }
  }, [])
  // Summed, not concatenated: the contract is only "a different number when
  // something changed", and both counters increase monotonically.
  const snapshot = useCallback(() => scheduleOverridesVersion() + planPrefsVersion(), [])
  return useSyncExternalStore(subscribe, snapshot, () => 0)
}
