import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { requireUserId, resolveCallerUserId } from '@/lib/auth/identity'

/**
 * The API routes are JWT-only, and this is the test that keeps them that way.
 *
 * ── WHY IT IS WRITTEN AGAINST THE SOURCE TEXT ───────────────────────────────
 * The bug was never in a function's return value — `defaultUserId` did exactly
 * what it said. It was in the SHAPE of the call: `resolveCallerUserId(...) ??
 * defaultUserId(...)`, guarded by an Origin/Referer comparison that any HTTP
 * client can satisfy. The routes then query with the service-role key, which
 * bypasses RLS, so the whole authorisation decision rested on a request header:
 *
 *     curl -H 'Origin: https://<the site>' https://<the site>/api/today   → 200
 *
 * A unit test that calls the helper cannot see that; the mistake only exists in
 * how a route composes them. So this reads the routes and fails on the pattern.
 */

const ROUTES = [
  'src/app/api/today/route.ts',
  'src/app/api/sessions/route.ts',
  'src/app/api/compute-score/route.ts',
  'src/app/api/ingest/route.ts',
]

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

/**
 * Source with comments removed. The routes explain the hole they used to have,
 * naming `listUsers` and `defaultUserId` to say what must never come back — so
 * matching raw text would fail on the very comments that document the fix.
 */
function code(path: string): string {
  return source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('API auth — every route resolves the caller from their JWT and nothing else', () => {
  it.each(ROUTES)('%s asks for the caller and 401s without one', (path) => {
    const text = source(path)
    expect(text).toMatch(/requireUserId|resolveCallerUserId/)
    expect(text).toMatch(/401/)
  })

  it.each(ROUTES)('%s never substitutes a user the caller did not prove', (path) => {
    const text = code(path)
    // The three shapes that served someone else's data.
    expect(text).not.toMatch(/defaultUserId/)
    expect(text).not.toMatch(/listUsers/)
    expect(text).not.toMatch(/\?\?\s*\(?await\s+default/)
  })

  it('the Origin-header "guard" is gone, not merely unused', () => {
    expect(existsSync(resolve(process.cwd(), 'src/lib/auth/guard.ts'))).toBe(false)
    for (const path of ROUTES) {
      expect(code(path)).not.toMatch(/denyIfUnauthorized|auth\/guard/)
    }
  })

  it('the headless recompute script carries a bearer token, not a forged Origin', () => {
    const text = source('scripts/recompute-scores.mjs')
    expect(text).toMatch(/Authorization: `Bearer \$\{accessToken\}`/)
    expect(text).not.toMatch(/Origin: appUrl/)
  })
})

describe('identity helpers', () => {
  const db = {
    auth: {
      getUser: async (jwt: string) =>
        jwt === 'good'
          ? { data: { user: { id: 'user-1' } }, error: null }
          : { data: { user: null }, error: new Error('bad jwt') },
    },
  } as never

  const req = (auth?: string) =>
    new Request('https://example.test/api/today', auth ? { headers: { authorization: auth } } : undefined)

  it('reads the user out of a valid bearer token', async () => {
    expect(await resolveCallerUserId(req('Bearer good'), db)).toBe('user-1')
  })

  it.each([
    ['no header at all', undefined],
    ['an invalid token', 'Bearer nonsense'],
    ['a token without the scheme', 'good'],
  ])('returns null for %s — the caller is nobody, not the admin', async (_label, header) => {
    expect(await requireUserId(req(header), db)).toBeNull()
  })
})
