import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { WORKOUT_QUERY_KEYS, HEALTH_QUERY_KEYS } from '@/lib/query/workoutKeys'

/**
 * An invalidation that matches nothing is worse than a missing one, because it
 * reads like coverage.
 *
 * `['daily_scores']` sat in both canonical key lists, in seven `RealtimeProvider`
 * table entries, and in four hand-rolled cascades — seventeen sites. The table
 * is real, so the key looked right. But no `useQuery` is ever *keyed* on it:
 * every read of `daily_scores` happens inside `['today']`, `['day_vault']`,
 * `['continuum']`, `['trends']`, `['week_recovery']` or `['readiness_today']`.
 *
 * Four of those were already listed alongside it, which is exactly why the gap
 * stayed invisible for so long — the co-invalidated keys did the work and the
 * dead one took the credit. `['readiness_today']` was in none of them, so the
 * readiness orb kept a stale battery for its full 5-minute staleTime after any
 * score recompute.
 *
 * This test makes that class of mistake fail immediately.
 */

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) { if (entry !== 'tests') sourceFiles(path, out) }
    else if (/\.tsx?$/.test(entry)) out.push(path)
  }
  return out
}

/** Comments name the removed key on purpose. Assert against code. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const SOURCES = sourceFiles('src').map((p) => ({ path: p, code: stripComments(readFileSync(p, 'utf8')) }))

/**
 * Every ROOT key a `useQuery` actually registers. TanStack matches by prefix, so
 * the root segment is the only part an invalidation list can be wrong about.
 *
 * Two declaration shapes exist in this codebase: the literal
 * `queryKey: ['exercises', 'catalog']`, and the extracted-options form
 * `exerciseHistoryQuery(id)` returning `{ queryKey: ['exercise_history', id] }`.
 * Both are plain `queryKey:` properties, so one pattern covers them.
 */
const REGISTERED = new Set<string>()
for (const { code } of SOURCES) {
  for (const m of code.matchAll(/queryKey:\s*\[\s*'([^']+)'/g)) REGISTERED.add(m[1])
  // Keys built by a helper rather than inline. BOTH declaration shapes, because
  // the codebase uses both and the scanner used to know only the first:
  //   export function fooKey(id) { return ['foo', id] }
  //   export const fooKey = (id) => ['foo', id]
  // `todayBundleKey` is the second shape and was passing only because another
  // file happened to spell `queryKey: ['today'` inline — a consumer registered
  // by luck is a consumer this guard cannot actually see.
  for (const m of code.matchAll(/export function \w*Key\w*\([^)]*\)[^{]*\{\s*return \[\s*'([^']+)'/g)) REGISTERED.add(m[1])
  for (const m of code.matchAll(/export const \w*Key\w*\s*=\s*\([^)]*\)[^=]*=>\s*\[\s*'([^']+)'/g)) REGISTERED.add(m[1])
}

/** The prefix lists that fan an invalidation out across the app. */
function declaredList(path: string, name: string): string[] {
  const code = SOURCES.find((s) => s.path === path)!.code
  const body = code.slice(code.indexOf(name))
  return [...body.slice(0, body.indexOf(']\n')).matchAll(/\[\s*'([^']+)'\s*\]/g)].map((m) => m[1])
}

describe('every invalidated key prefix has a consumer', () => {
  it('finds the queries at all (guards the scanner itself)', () => {
    // If the regex ever stops matching, every assertion below passes vacuously.
    expect(REGISTERED.size).toBeGreaterThan(30)
    expect(REGISTERED.has('today')).toBe(true)
    expect(REGISTERED.has('readiness_today')).toBe(true)
    // Registered ONLY via an arrow-const key helper — guards the second pattern.
    expect(REGISTERED.has('routine_template')).toBe(true)
  })

  it.each([
    ['WORKOUT_QUERY_KEYS', WORKOUT_QUERY_KEYS],
    ['HEALTH_QUERY_KEYS', HEALTH_QUERY_KEYS],
  ])('%s', (_name, keys) => {
    const orphans = keys.map(([root]) => root).filter((root) => !REGISTERED.has(root))
    expect(orphans).toEqual([])
  })

  it('RealtimeProvider fans every table out to keys that exist', () => {
    const code = SOURCES.find((s) => s.path.endsWith('RealtimeProvider.tsx'))!.code
    const map = code.slice(code.indexOf('const TABLE_KEYS'), code.indexOf('const TABLES'))
    const roots = [...map.matchAll(/\[\s*'([^']+)'\s*\]/g)].map((m) => m[1])
    expect(roots.length).toBeGreaterThan(20)
    expect(roots.filter((r) => !REGISTERED.has(r))).toEqual([])
  })

  it('the hand-rolled cascades match too', () => {
    for (const [path, name] of [
      ['src/lib/hooks/useMacroOverride.ts', 'const CASCADE_KEYS'],
      ['src/lib/hooks/useWaterOverride.ts', 'const CASCADE_KEYS'],
      // Moved out of the page with the rest of the settings write paths.
      ['src/lib/hooks/useSettingsGoals.ts', 'const PLAN_PHASE_CASCADE_KEYS'],
    ] as const) {
      const roots = declaredList(path, name)
      expect(roots.length).toBeGreaterThan(3)
      expect({ [name]: roots.filter((r) => !REGISTERED.has(r)) }).toEqual({ [name]: [] })
    }
  })
})

describe('the surfaces a score recompute has to reach', () => {
  /**
   * `['today', date]` is a BUNDLE — one request carrying score + daily_log +
   * metrics + nutrition + sleep (useDashboard.ts:52). So all five of the tables
   * feeding it must invalidate it, and until this commit only `user_goals` did.
   * A sleep sync on the desktop left the phone's dashboard on stale numbers for
   * the full 90 s staleTime, and longer from a cold open since the key persists.
   */
  const code = SOURCES.find((s) => s.path.endsWith('RealtimeProvider.tsx'))!.code
  const entry = (table: string) => {
    const at = code.indexOf(`${table}: [`)
    return at < 0 ? '' : code.slice(at, code.indexOf(']]', at))
  }

  it.each(['daily_logs', 'daily_metrics', 'nutrition_entries', 'sleep_sessions', 'daily_scores'])(
    'a %s change refreshes the bundled today query',
    (table) => { expect(entry(table)).toContain("['today']") },
  )

  it.each(['daily_logs', 'sleep_sessions', 'daily_scores'])(
    'a %s change refreshes readiness',
    (table) => { expect(entry(table)).toContain("['readiness_today']") },
  )

  it('intake does NOT touch readiness — battery drains on activity, never calories', () => {
    expect(entry('nutrition_entries')).not.toContain("['readiness_today']")
  })
})
