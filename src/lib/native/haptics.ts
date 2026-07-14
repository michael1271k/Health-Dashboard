'use client'

import { Capacitor } from '@capacitor/core'

/**
 * Thin haptics wrapper — a light tap on meaningful native actions (log saved,
 * pull-to-refresh fired, PR hit). No-op on the web, never throws.
 */
export async function tapLight(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch { /* haptics unavailable — non-fatal */ }
}

export async function tapSuccess(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics')
    await Haptics.notification({ type: NotificationType.Success })
  } catch { /* non-fatal */ }
}
