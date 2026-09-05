'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { initNativeSync } from '@/lib/native/sync'
import { initDeepLinks } from '@/lib/native/deepLink'
import { invalidateHealthData } from '@/lib/query/workoutKeys'
import { hydratePrefsFromDb } from '@/lib/utils/prefsSync'
import { warmHaptics } from '@/lib/native/haptics'

/**
 * Boots native-only behaviour (HealthKit permission + resume/foreground sync,
 * and widget deep links). A no-op on the web — every initializer guards on the
 * native platform — so it's safe to mount unconditionally in the root layout.
 * Each full sync revalidates the health-derived React Query surfaces so the open
 * UI updates immediately.
 */
export function NativeBoot() {
  const qc = useQueryClient()
  const router = useRouter()

  // Widget taps. Separate from the sync effect on purpose: a deep link must be
  // handled the instant it arrives, and the sync effect deliberately waits out
  // a paint frame and a permission sheet before it does anything.
  useEffect(() => initDeepLinks((path) => router.push(path)), [router])

  // Resolve the haptics plugin before the first tap needs it, so the very first
  // gesture of a launch lands on the same frame as its animation rather than a
  // microtask later. No-op off-native and idempotent — see `haptics.ts`.
  useEffect(() => { warmHaptics() }, [])

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
