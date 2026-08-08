'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { initNativeSync } from '@/lib/native/sync'
import { invalidateHealthData } from '@/lib/query/workoutKeys'
import { hydratePrefsFromDb } from '@/lib/utils/prefsSync'

/**
 * Boots native-only behaviour (HealthKit permission + resume/foreground sync).
 * A no-op on the web — every initializer guards on the native platform — so it's
 * safe to mount unconditionally in the root layout. Each full sync revalidates
 * the health-derived React Query surfaces so the open UI updates immediately.
 */
export function NativeBoot() {
  const qc = useQueryClient()
  useEffect(() => {
    const stopSync = initNativeSync(() => {
      invalidateHealthData(qc)
      // Foregrounding is the ONLY moment a suspended phone learns what changed
      // elsewhere. Health tiles refreshed, but the plan/phase localStorage
      // mirror and the schedule-override cache did not: a phase switch or a day
      // swap made on the desktop stayed invisible until the realtime socket
      // happened to drop, and a socket that stays "joined" through a suspend
      // never triggers that path.
      void hydratePrefsFromDb()
      qc.invalidateQueries({ queryKey: ['schedule_overrides'] })
    })
    return () => { stopSync() }
  }, [qc])
  return null
}
