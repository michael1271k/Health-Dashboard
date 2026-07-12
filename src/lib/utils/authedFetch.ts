'use client'

import { supabase } from '@/lib/supabase/client'

/**
 * fetch() that carries the caller's Supabase JWT so API routes resolve THIS
 * user's vault (multi-tenant) instead of the household default.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
  } catch { /* unauthenticated — the route falls back to the household admin */ }
  return fetch(input, { ...init, headers })
}
