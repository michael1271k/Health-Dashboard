/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for the Supabase client are intentionally loose. */
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * BACKWARD-COMPAT CONTRACT — the Apple iOS Shortcut push.
 *
 * The Shortcut sends a flat JSON body with ONLY the legacy env secret in the
 * X-Webhook-Secret header: no JWT, no per-user ingest_keys row. That path must
 * keep authenticating (resolving to the household admin) until the native
 * Xcode app fully replaces it. If a change breaks any test in this file, the
 * Shortcut is broken in production — do not weaken these assertions.
 */

const SECRET = 'shortcut-legacy-secret'

// No JWT on Shortcut calls; env-secret fallback resolves the household admin.
vi.mock('@/lib/auth/identity', () => ({
  resolveCallerUserId: vi.fn(async () => null),
  defaultUserId: vi.fn(async () => 'household-admin'),
}))

// Chainable stub: every table op succeeds as a no-op; ingest_keys is scripted.
let ingestKeysLookup: () => Promise<{ data: any; error: any }>
function noopChain(): any {
  const chain: any = {
    eq: () => chain, gte: () => chain, lt: () => chain, lte: () => chain,
    order: () => chain, limit: () => Promise.resolve({ data: [] }),
    select: () => chain, delete: () => chain, maybeSingle: () => Promise.resolve({ data: null, error: null }),
    insert: () => Promise.resolve({ error: null }),
    upsert: () => Promise.resolve({ error: null }),
  }
  return chain
}
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabaseClient: () => ({
    from(table: string) {
      if (table === 'ingest_keys') {
        const chain: any = { select: () => chain, eq: () => chain, maybeSingle: () => ingestKeysLookup() }
        return chain
      }
      return noopChain()
    },
  }),
}))

/** Import the route fresh so module-level `WEBHOOK_SECRET` sees the test env. */
async function loadRoute() {
  vi.resetModules()
  process.env.INGEST_WEBHOOK_SECRET = SECRET
  return await import('@/app/api/ingest/route')
}

function shortcutRequest(secret: string | null, body: unknown = { date: '2026-07-16', steps: 8200 }) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret != null) headers['X-Webhook-Secret'] = secret
  return new Request('http://localhost/api/ingest', { method: 'POST', headers, body: JSON.stringify(body) })
}

beforeEach(() => {
  ingestKeysLookup = async () => ({ data: null, error: null })
})

describe('POST /api/ingest — legacy INGEST_WEBHOOK_SECRET push (iOS Shortcut)', () => {
  it('accepts the env secret with no JWT and no ingest_keys row → 200 + ingest report', async () => {
    const { POST } = await loadRoute()
    const res = await POST(shortcutRequest(SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.inserted).toContain('steps')
  })

  it('still authenticates via the env secret when the ingest_keys table is missing (pre-migration throw)', async () => {
    ingestKeysLookup = async () => { throw new Error('relation "ingest_keys" does not exist') }
    const { POST } = await loadRoute()
    const res = await POST(shortcutRequest(SECRET))
    expect(res.status).toBe(200)
  })

  it('rejects a wrong secret → 401', async () => {
    const { POST } = await loadRoute()
    const res = await POST(shortcutRequest('not-the-secret'))
    expect(res.status).toBe(401)
  })

  it('rejects a missing secret (no JWT) → 401', async () => {
    const { POST } = await loadRoute()
    const res = await POST(shortcutRequest(null))
    expect(res.status).toBe(401)
  })

  it('keeps the flat-v2 payload contract: unknown-free minimal body passes schema', async () => {
    const { POST } = await loadRoute()
    const res = await POST(shortcutRequest(SECRET, { steps: 100 }))
    expect(res.status).toBe(200)  // date optional (defaults to today), partial pushes never fail
  })
})
