'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { initNativeSync } from '@/lib/native/sync'
import { invalidateHealthData } from '@/lib/query/workoutKeys'

/**
 * Boots native-only behaviour (HealthKit permission + resume/foreground sync).
 * A no-op on the web — every initializer guards on the native platform — so it's
 * safe to mount unconditionally in the root layout. Each full sync revalidates
 * the health-derived React Query surfaces so the open UI updates immediately.
 */
export function NativeBoot() {
  const qc = useQueryClient()
  useEffect(() => {
    const stopSync = initNativeSync(() => invalidateHealthData(qc))
    return () => { stopSync() }
  }, [qc])
  return null
}
