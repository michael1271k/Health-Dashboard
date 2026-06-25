import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

// Browser-side Supabase client (uses anon key, subject to RLS)
// Safe to use in Client Components
//
// Initialized lazily: the throw is deferred to first use (not module load),
// so `next build` succeeds without a real Supabase connection.

type SupabaseClientType = ReturnType<typeof createClient<Database>>

let _supabase: SupabaseClientType | undefined

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
