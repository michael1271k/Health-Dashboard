import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

/**
 * Multi-tenant identity resolution for API routes.
 *
 * Every route used to hardcode `listUsers()[0]` — correct for one user, silent
 * data-corruption for a multi-user deployment. The contract now:
 *   1. A caller presenting a Supabase JWT (Authorization: Bearer) IS that user.
 *   2. No JWT → fall back to the household admin (keeps Michael's existing
 *      app + cron calls working unchanged during/after onboarding).
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

/** Household admin (profiles.role = 'admin'), falling back to the first auth user. */
export async function defaultUserId(db: DB): Promise<string | null> {
  try {
    const { data, error } = await db.from('profiles').select('user_id').eq('role', 'admin').limit(1).maybeSingle()
    if (!error && data) return (data as { user_id: string }).user_id
  } catch { /* profiles not migrated yet — fall through */ }
  const { data: { users }, error } = await db.auth.admin.listUsers()
  if (error || !users.length) return null
  return users[0].id
}

/** JWT caller if present, else the household admin. Null = no users at all. */
export async function requireUserId(req: Request, db: DB): Promise<string | null> {
  return (await resolveCallerUserId(req, db)) ?? (await defaultUserId(db))
}
