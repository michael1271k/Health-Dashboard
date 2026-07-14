'use client'

import { useEffect } from 'react'
import { initNativeSync } from '@/lib/native/sync'

/**
 * Boots native-only behaviour (HealthKit permission + resume/background sync).
 * A no-op on the web — `initNativeSync` guards on the native platform — so it's
 * safe to mount unconditionally in the root layout.
 */
export function NativeBoot() {
  useEffect(() => initNativeSync(), [])
  return null
}
