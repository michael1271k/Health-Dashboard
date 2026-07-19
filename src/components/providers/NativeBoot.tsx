'use client'

import { useEffect } from 'react'
import { initNativeSync } from '@/lib/native/sync'
import { initBiometricTokenSync } from '@/lib/native/biometric'

/**
 * Boots native-only behaviour (HealthKit permission + resume/background sync,
 * and keeping the Keychain refresh token current for Face ID). A no-op on the
 * web — every initializer guards on the native platform — so it's safe to mount
 * unconditionally in the root layout.
 */
export function NativeBoot() {
  useEffect(() => {
    const stopSync = initNativeSync()
    const stopBio = initBiometricTokenSync()
    return () => { stopSync(); stopBio() }
  }, [])
  return null
}
