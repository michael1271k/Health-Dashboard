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
const nativeStorage = {
  async getItem(key: string): Promise<string | null> {
    const { Preferences } = await import('@capacitor/preferences')
    const { value } = await Preferences.get({ key })
    if (value != null) {
      try { window.localStorage.setItem(key, value) } catch { /* mirror best-effort */ }
      return value
    }
    // First native launch after this ships: migrate a session that still lives in
    // the WebView's localStorage into durable storage so nobody has to re-login.
    try {
      const legacy = window.localStorage.getItem(key)
      if (legacy != null) { await Preferences.set({ key, value: legacy }); return legacy }
    } catch { /* ignore */ }
    return null
  },
  async setItem(key: string, value: string): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences')
    await Preferences.set({ key, value })
    try { window.localStorage.setItem(key, value) } catch { /* mirror best-effort */ }
  },
  async removeItem(key: string): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences')
    await Preferences.remove({ key })
    try { window.localStorage.removeItem(key) } catch { /* ignore */ }
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
