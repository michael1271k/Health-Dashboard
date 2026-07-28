import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import type { Database } from './types'

// Browser-side Supabase client (uses anon key, subject to RLS)
// Safe to use in Client Components
//
// Initialized lazily: the throw is deferred to first use (not module load),
// so `next build` succeeds without a real Supabase connection.

type SupabaseClientType = ReturnType<typeof createClient<Database>>

let _supabase: SupabaseClientType | undefined

const isNative = (): boolean => {
  try { return Capacitor.isNativePlatform() } catch { return false }
}

/**
 * Native auth storage — a 2-tier store, most-durable first:
 *
 *   1. **Preferences** (UserDefaults). Survives WKWebView `localStorage` eviction
 *      (ITP ~7 idle days) but is wiped on uninstall — a durable native mirror.
 *   2. **localStorage**. The synchronous source that lets `AuthGate` paint
 *      optimistically on launch; first to be evicted, so it's the fallback tier.
 *
 * `getItem` reads the more durable tier that has the value and heals the faster
 * mirror from it; `setItem` writes both. Every native call is guarded: if a plugin
 * isn't registered yet (e.g. `npx cap sync ios` not run), it degrades to the
 * localStorage the app already used — never worse, never a hard failure. The
 * Keychain (`SecureStore`) tier was removed: uninstall-survival isn't worth the
 * native-plugin complexity for a single-user app that re-logs in with one tap.
 */
const lsGet = (key: string): string | null => {
  try { return window.localStorage.getItem(key) } catch { return null }
}
const lsSet = (key: string, value: string): void => {
  try { window.localStorage.setItem(key, value) } catch { /* best-effort mirror */ }
}
const lsRemove = (key: string): void => {
  try { window.localStorage.removeItem(key) } catch { /* ignore */ }
}

// Tier 1 — Preferences (guarded dynamic import).
const prefGet = async (key: string): Promise<string | null> => {
  try { const { Preferences } = await import('@capacitor/preferences'); const { value } = await Preferences.get({ key }); return value ?? null } catch { return null }
}
const prefSet = async (key: string, value: string): Promise<void> => {
  try { const { Preferences } = await import('@capacitor/preferences'); await Preferences.set({ key, value }) } catch { /* unavailable */ }
}
const prefRemove = async (key: string): Promise<void> => {
  try { const { Preferences } = await import('@capacitor/preferences'); await Preferences.remove({ key }) } catch { /* unavailable */ }
}

const nativeStorage = {
  async getItem(key: string): Promise<string | null> {
    // Preferences first — survives WebView eviction; heal the localStorage mirror.
    const pref = await prefGet(key)
    if (pref != null) { lsSet(key, pref); return pref }
    // localStorage last — migrate a pre-existing WebView session up into durability.
    const legacy = lsGet(key)
    if (legacy != null) { void prefSet(key, legacy); return legacy }
    return null
  },
  async setItem(key: string, value: string): Promise<void> {
    lsSet(key, value) // sync mirror first so AuthGate can paint before the await
    await prefSet(key, value)
  },
  async removeItem(key: string): Promise<void> {
    lsRemove(key)
    await prefRemove(key)
  },
}

function initSupabase(): SupabaseClientType {
  if (_supabase) return _supabase

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Copy .env.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }

  _supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      // Native → durable Preferences (+ localStorage mirror); web → supabase's
      // default localStorage (undefined leaves the default in place).
      storage: isNative() ? nativeStorage : undefined,
    },
  })

  return _supabase
}

// Proxy defers initialization to first property access (first use).
// Type is fully preserved: `supabase.auth`, `supabase.from(...)` etc. all work.
export const supabase = new Proxy({} as SupabaseClientType, {
  get(_target, prop, receiver) {
    return Reflect.get(initSupabase(), prop, receiver)
  },
})

export type SupabaseClient = SupabaseClientType
