import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

/**
 * Identity resolution for API routes. A caller IS the user in their Supabase
 * JWT, and there is no other way to be anyone.
 *
 * ── WHY THERE IS NO LONGER A FALLBACK ───────────────────────────────────────
 * There used to be one: no JWT meant "the household admin", so that Michael's
 * app and cron calls kept working during onboarding. Combined with
 * `denyIfUnauthorized` — which only ever compared the Origin/Referer HOST to
 * the Host header, both of which any HTTP client sets freely — that made every
 * route using it an unauthenticated read of the admin's health record:
 *
 *     curl -H 'Origin: https://<the site>' https://<the site>/api/today   → 200
 *
 * and the routes query with `getServerSupabaseClient()`, the SERVICE ROLE key,
 * which bypasses RLS. So the fallback was not a convenience with an auth check
 * in front of it; it was the whole authorisation decision, keyed on a header.
 *
 * Nothing legitimate depended on it. Every browser caller goes through
 * `authedFetch`, which attaches the session's access token; the native app
 * carries its own; `netlify/functions/keep-alive.mts` pings PostgREST directly
 * and never touches these routes; and `scripts/recompute-scores.mjs` now mints
 * a real user token instead of spoofing an Origin.
 */

/** The user encoded in the caller's Supabase JWT, or null. */
export async function resolveCallerUserId(req: Request, db: DB): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!jwt) return null
  try {
    const { data, error } = await db.auth.getUser(jwt)
    if (error || !data.user) return null
    return data.user.id
  } catch {
    return null
  }
}

/**
 * The caller's user id, or null when they did not present a valid JWT.
 *
 * `null` means 401 — never "pick a user". Routes must not substitute one.
 */
export async function requireUserId(req: Request, db: DB): Promise<string | null> {
  return resolveCallerUserId(req, db)
}
