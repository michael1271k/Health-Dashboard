'use client'

import { Capacitor } from '@capacitor/core'

/**
 * Thin haptics wrapper — a light tap on meaningful native actions (log saved,
 * pull-to-refresh fired, PR hit). No-op on the web, never throws.
 *
 * ── THE MODULE IS RESOLVED ONCE, NOT ONCE PER TAP ────────────────────────────
 *
 * Both functions used to `await import('@capacitor/haptics')` INSIDE the call.
 * The module cache means that is cheap after the first time, but it is not
 * free: it puts a promise hop between the gesture and the bridge call, on every
 * single tap, in a file whose busiest callers are the widget grid (11 sites)
 * and the set editor (6).
 *
 * That hop is the thing Apple's audio-haptic guidance calls a harmony failure —
 * the visual, the sound and the haptic have to land on the same frame, and a
 * microtask boundary is how they stop doing that. Resolving the module once and
 * reusing the promise keeps the dynamic import (so the plugin never enters the
 * web bundle's critical path) while giving every tap after the first a
 * synchronous handle.
 *
 * `warmHaptics()` is called from `NativeBoot`, so on a native launch even the
 * first tap has the module in hand.
 */
type HapticsModule = typeof import('@capacitor/haptics')

let hapticsPromise: Promise<HapticsModule | null> | null = null

function haptics(): Promise<HapticsModule | null> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(null)
  hapticsPromise ??= import('@capacitor/haptics').catch(() => null)
  return hapticsPromise
}

/** Resolve the plugin ahead of the first gesture. Idempotent. */
export function warmHaptics(): void {
  void haptics()
}

export async function tapLight(): Promise<void> {
  try {
    const mod = await haptics()
    if (!mod) return
    await mod.Haptics.impact({ style: mod.ImpactStyle.Light })
  } catch { /* haptics unavailable — non-fatal */ }
}

export async function tapSuccess(): Promise<void> {
  try {
    const mod = await haptics()
    if (!mod) return
    await mod.Haptics.notification({ type: mod.NotificationType.Success })
  } catch { /* non-fatal */ }
}
