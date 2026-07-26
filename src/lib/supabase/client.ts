import { createClient } from '@supabase/supabase-js'
import { Capacitor, registerPlugin } from '@capacitor/core'
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
 * Native-durable auth storage — a 3-tier store, most-durable first:
 *
 *   1. **Keychain** (`SecureStore` plugin). iOS does NOT clear the Keychain on app
 *      uninstall, so the Supabase session survives a delete + reinstall on the same
 *      device — "sign in once, ever". This is the tier that fixes re-login after an
 *      Xcode rebuild. Only the token JSON Supabase already persists is stored; no
 *      password is ever written. Async native-bridge call.
 *   2. **Preferences** (UserDefaults). Survives WKWebView `localStorage` eviction
 *      (ITP ~7 idle days) but is wiped on uninstall — a fast native mirror.
 *   3. **localStorage**. The synchronous source that lets `AuthGate` paint
 *      optimistically on launch; first to be evicted, so it's the fallback tier.
 *
 * `getItem` reads the most durable tier that has the value and heals the faster
 * mirrors from it; `setItem` writes all three. Every native call is guarded: if a
 * plugin isn't registered yet (e.g. `npx cap sync ios` not run), it degrades to the
 * localStorage the app already used — never worse than before, never a hard failure.
 */
interface SecureStorePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}
const SecureStore = registerPlugin<SecureStorePlugin>('SecureStore')

const keychainAvailable = (): boolean => {
  try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SecureStore') } catch { return false }
}

const lsGet = (key: string): string | null => {
  try { return window.localStorage.getItem(key) } catch { return null }
}
const lsSet = (key: string, value: string): void => {
  try { window.localStorage.setItem(key, value) } catch { /* best-effort mirror */ }
}
const lsRemove = (key: string): void => {
  try { window.localStorage.removeItem(key) } catch { /* ignore */ }
}

// Tier 1 — Keychain (guarded; null/no-op when the plugin isn't registered).
const kcGet = async (key: string): Promise<string | null> => {
  if (!keychainAvailable()) return null
  try { const { value } = await SecureStore.get({ key }); return value ?? null } catch { return null }
}
const kcSet = async (key: string, value: string): Promise<void> => {
  if (!keychainAvailable()) return
  try { await SecureStore.set({ key, value }) } catch { /* keychain unavailable */ }
}
const kcRemove = async (key: string): Promise<void> => {
  if (!keychainAvailable()) return
  try { await SecureStore.remove({ key }) } catch { /* ignore */ }
}

// Tier 2 — Preferences (guarded dynamic import).
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
    // Keychain first — the only tier that survives an uninstall; heal the mirrors.
    const kc = await kcGet(key)
    if (kc != null) { lsSet(key, kc); void prefSet(key, kc); return kc }
    // Preferences next — survives WebView eviction; promote it into the Keychain.
    const pref = await prefGet(key)
    if (pref != null) { lsSet(key, pref); void kcSet(key, pref); return pref }
    // localStorage last — migrate a pre-existing WebView session up into durability.
    const legacy = lsGet(key)
    if (legacy != null) { void prefSet(key, legacy); void kcSet(key, legacy); return legacy }
    return null
  },
  async setItem(key: string, value: string): Promise<void> {
    lsSet(key, value) // sync mirror first so AuthGate can paint before the awaits
    await Promise.allSettled([prefSet(key, value), kcSet(key, value)])
  },
  async removeItem(key: string): Promise<void> {
    lsRemove(key)
    await Promise.allSettled([prefRemove(key), kcRemove(key)])
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
