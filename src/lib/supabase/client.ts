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
 * Native-durable auth storage. iOS WKWebView evicts `localStorage` under storage
 * pressure / ITP (~7 idle days) — that eviction is why the standalone app used to
 * silently sign the user out. Capacitor Preferences persists to the native store
 * (NSUserDefaults / Keychain-adjacent) which the WebView cannot evict, so a signed-
 * in session survives indefinitely and `autoRefreshToken` keeps the JWT alive off
 * the (non-expiring) refresh token.
 *
 * We also mirror into `localStorage`: it's the fast, synchronous source that lets
 * `AuthGate` paint optimistically on launch. If the mirror is ever evicted, the
 * next `getItem` transparently restores it from Preferences (and re-mirrors), so
 * the worst case after an eviction is a single brief splash — never a logout.
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

const nativeStorage = {
  async getItem(key: string): Promise<string | null> {
    // Every Preferences call is guarded: if the plugin isn't registered yet
    // (e.g. `npx cap sync ios` not run), we degrade to the localStorage the app
    // already used — never worse than before, never a hard failure on load.
    try {
      const { Preferences } = await import('@capacitor/preferences')
      const { value } = await Preferences.get({ key })
      if (value != null) { lsSet(key, value); return value }
      // First native launch after this ships: migrate an existing WebView session.
      const legacy = lsGet(key)
      if (legacy != null) { await Preferences.set({ key, value: legacy }) ; return legacy }
      return null
    } catch {
      return lsGet(key)
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    lsSet(key, value) // mirror first so it survives a Preferences failure
    try {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.set({ key, value })
    } catch { /* Preferences unavailable — localStorage mirror stands */ }
  },
  async removeItem(key: string): Promise<void> {
    lsRemove(key)
    try {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.remove({ key })
    } catch { /* Preferences unavailable — nothing more to do */ }
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
