'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { subscribeRestTargets, restTargetsVersion } from '@/lib/training/restTargets'

/**
 * Subscribe to rest-target edits.
 *
 * ANY component that calls `restTargetFor` during render must call this too —
 * the store is a module-level cache and React cannot see it change. Without the
 * subscription the logger would edit a target and the routine layout would keep
 * printing the old one until an unrelated re-render, which is the failure mode
 * `useScheduleVersion` exists to prevent for the schedule caches.
 *
 * Returns a version number, usable directly as a `useMemo` dependency.
 */
export function useRestTargets(): number {
  const subscribe = useCallback((onChange: () => void) => subscribeRestTargets(onChange), [])
  const snapshot = useCallback(() => restTargetsVersion(), [])
  return useSyncExternalStore(subscribe, snapshot, () => 0)
}
