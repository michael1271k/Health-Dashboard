'use client'

import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from '@/lib/supabase/client'

/**
 * Face ID / Touch ID one-tap sign-in, backed by the custom HelixAuth native
 * bridge (ios/App/App/HelixAuth.swift). The Supabase refresh token is stored in
 * the iOS Keychain (device-only) and the restore is gated behind a biometric
 * prompt. Entirely inert on web (registerPlugin proxy + isNativePlatform guards).
 */
interface HelixAuthPlugin {
  isAvailable(): Promise<{ available: boolean; biometryType: string }>
  authenticate(opts: { reason: string }): Promise<{ success: boolean }>
  setSecret(opts: { key: string; value: string }): Promise<void>
  getSecret(opts: { key: string }): Promise<{ value: string | null }>
  removeSecret(opts: { key: string }): Promise<void>
}
const HelixAuth = registerPlugin<HelixAuthPlugin>('HelixAuth')

const SECRET_KEY = 'helix_bio_refresh'
const ENABLED_FLAG = 'helix_bio_enabled'

/** Store the CURRENT Supabase refresh token in the Keychain (rotation-safe). */
async function storeCurrentToken(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.refresh_token) return
  await HelixAuth.setSecret({
    key: SECRET_KEY,
    value: JSON.stringify({ refresh_token: session.refresh_token, email: session.user.email ?? '' }),
  })
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try { return (await HelixAuth.isAvailable()).available } catch (err) {
    console.error('[HELIX] HelixAuth isAvailable failed — is the HelixAuth plugin registered?', err)
    return false
  }
}

/** True when the native HelixAuth plugin is actually attached to the bridge. */
export function isHelixAuthAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('HelixAuth')
}

export function isBiometricEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_FLAG) === '1' } catch { return false }
}

/** Enable Face ID sign-in: confirm the owner, then persist the refresh token. */
export async function enableBiometricLogin(): Promise<boolean> {
  if (!(await isBiometricAvailable())) return false
  try {
    await HelixAuth.authenticate({ reason: 'Enable Face ID sign-in for HELIX' })
    await storeCurrentToken()
    localStorage.setItem(ENABLED_FLAG, '1')
    return true
  } catch { return false }
}

export async function disableBiometricLogin(): Promise<void> {
  try { await HelixAuth.removeSecret({ key: SECRET_KEY }) } catch { /* ignore */ }
  try { localStorage.removeItem(ENABLED_FLAG) } catch { /* ignore */ }
}

/**
 * Attempt a biometric sign-in. Prompts Face ID, restores the session from the
 * stored refresh token, then re-persists the ROTATED token (Supabase rotates on
 * every refresh — a stale one is single-use). Any failure returns false so the
 * caller falls back to the password form; never a dead end.
 */
export async function tryBiometricLogin(): Promise<boolean> {
  if (!isBiometricEnabled() || !Capacitor.isNativePlatform()) return false
  try {
    await HelixAuth.authenticate({ reason: 'Sign in to HELIX' })
    const { value } = await HelixAuth.getSecret({ key: SECRET_KEY })
    if (!value) return false
    const { refresh_token } = JSON.parse(value) as { refresh_token?: string }
    if (!refresh_token) return false
    const { data, error } = await supabase.auth.refreshSession({ refresh_token })
    if (error || !data.session) return false
    await storeCurrentToken() // persist the rotated token immediately
    return true
  } catch { return false }
}

/** Keep the Keychain token current while the app runs (rotation-safe). No-op on web. */
export function initBiometricTokenSync(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'TOKEN_REFRESHED' && isBiometricEnabled()) void storeCurrentToken()
  })
  return () => data.subscription.unsubscribe()
}
