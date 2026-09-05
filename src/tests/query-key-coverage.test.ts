import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { WORKOUT_QUERY_KEYS, HEALTH_QUERY_KEYS } from '@/lib/query/workoutKeys'
import { TABLE_KEYS } from '@/lib/query/realtimeKeys'

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
  // Third shape: a file-local root, `const KEY = 'daily_targets'` (or
  // `= ['custom_supplements']`), used as `queryKey: [KEY, date]`. Three hooks
  // are written this way and all three read as orphans to a scanner that only
  // understands literals — which is the failure this guard exists to prevent,
  // pointed at itself.
  for (const m of code.matchAll(/const (\w+)\s*=\s*\[?\s*'([^']+)'\s*\]?\s*(?:as const)?\n/g)) {
    // Used as `queryKey: [KEY, date]` or, when the const is already an
    // array, as `queryKey: KEY`.
    if (new RegExp(`queryKey:\\s*\\[?\\s*(?:\\.\\.\\.)?${m[1]}\\b`).test(code)) REGISTERED.add(m[2])
  }
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
    // The realtime fan-out is the third list of prefixes, and W4 more than
    // doubled it — from 13 tables to 29. It was outside this guard for as long
    // as it was short enough to eyeball.
    ...Object.entries(TABLE_KEYS).map(([table, keys]) => [`TABLE_KEYS.${table}`, keys] as const),
  ])('%s', (_name, keys) => {
    const orphans = keys.map(([root]) => root).filter((root) => !REGISTERED.has(root))
    expect(orphans).toEqual([])
  })

  it('RealtimeProvider fans every table out to keys that exist', () => {
    const code = SOURCES.find((s) => s.path.endsWith('lib/query/realtimeKeys.ts'))!.code
    const map = code.slice(code.indexOf('const TABLE_KEYS'), code.indexOf('const REALTIME_TABLES'))
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

/**
 * ── AND THE SAME QUESTION ASKED BACKWARDS ────────────────────────────────────
 *
 * Everything above asserts LIST → CONSUMER: no invalidation prefix may match
 * nothing. It never asserted CONSUMER → LIST, and that is the direction the
 * expensive bugs come from — a query that reads `workout_sessions` and is in
 * neither invalidation list is not a dead entry anybody trips over, it is a
 * screen that quietly shows yesterday's number.
 *
 * Five were missing when this was added. The visible one: `['week_so_far']`,
 * which backs the dashboard's week card at a 5-minute staleTime and reads
 * `workout_sessions` — so finishing a session left the card showing PRE-COMMIT
 * tonnage for five minutes, on the screen you land on immediately after
 * finishing it.
 *
 * The scan is deliberately blunt: for each `queryKey: ['root'` it takes the text
 * up to the next `queryKey:` OR the next top-level declaration — whichever comes
 * first — and collects the `.from('table')` calls in it. The declaration bound
 * matters: without it, `['session_global_number']` (which reads only
 * `workout_sessions`) absorbed the `daily_logs` writes of the MUTATION declared
 * after it in the same file, and reported a health dependency it does not have.
 *
 * It still under-attributes when a queryFn is defined far from its key, so a
 * MISS here is a real gap. A false positive is fixed by listing the key — which
 * costs one extra invalidation — rather than by loosening the test.
 */
const WORKOUT_TABLES = new Set(['workout_sessions', 'workout_sets', 'personal_records', 'doms_logs'])
const HEALTH_TABLES = new Set([
  'daily_logs', 'daily_metrics', 'nutrition_entries', 'sleep_sessions',
  'body_composition', 'cardio_logs', 'daily_scores',
])

/** Root key → the tables its queryFn reads. */
const TABLES_BY_ROOT = new Map<string, Set<string>>()
for (const { code } of SOURCES) {
  const marks = [...code.matchAll(/queryKey:\s*\[\s*'([^']+)'/g)]
  const decls = [...code.matchAll(/^export (?:async )?(?:function|const) /gm)].map((d) => d.index ?? 0)
  marks.forEach((m, i) => {
    const start = m.index ?? 0
    const nextKey = i + 1 < marks.length ? (marks[i + 1].index ?? code.length) : code.length
    const nextDecl = decls.find((d) => d > start) ?? code.length
    const block = code.slice(start, Math.min(nextKey, nextDecl))
    const tables = TABLES_BY_ROOT.get(m[1]) ?? new Set<string>()
    for (const t of block.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)) tables.add(t[1])
    TABLES_BY_ROOT.set(m[1], tables)
  })
}

/** Every root the realtime socket fans a table change out to. */
function realtimeRoots(): Set<string> {
  const code = SOURCES.find((s) => s.path.endsWith('lib/query/realtimeKeys.ts'))!.code
  const map = code.slice(code.indexOf('const TABLE_KEYS'), code.indexOf('const REALTIME_TABLES'))
  return new Set([...map.matchAll(/\[\s*'([^']+)'\s*\]/g)].map((m) => m[1]))
}

describe('every query that reads a mutable table is invalidated by something', () => {
  /*
   * Three mechanisms fan an invalidation out, and a key reached by ANY of them
   * is invalidated by something: the two canonical prefix lists, and the
   * realtime socket's own per-table map. `['coach']`, `['sleep_debt']` and
   * `['water_intake']` are only in the third, which is correct — nothing writes
   * them locally, they change when another device does.
   */
  const covered = realtimeRoots()
  const workoutRoots = new Set([...WORKOUT_QUERY_KEYS.map(([r]) => r), ...covered])
  const healthRoots = new Set([...HEALTH_QUERY_KEYS.map(([r]) => r), ...covered])

  /**
   * Keys whose staleness is genuinely nobody's problem. Each one needs a reason,
   * not a shrug — an entry added here to make the suite green is the whole
   * failure mode this test exists to prevent.
   */
  const EXEMPT = new Set([
    // Read once at boot to decide whether the historical backfill has run.
    'backfill_state',
  ])

  it('finds tables at all (guards the scanner itself)', () => {
    const withTables = [...TABLES_BY_ROOT.values()].filter((t) => t.size > 0)
    expect(withTables.length).toBeGreaterThan(20)
    expect(TABLES_BY_ROOT.get('week_so_far')?.has('workout_sessions')).toBe(true)
  })

  it('workout-derived queries are in WORKOUT_QUERY_KEYS', () => {
    const missing = [...TABLES_BY_ROOT]
      .filter(([root, tables]) => !EXEMPT.has(root)
        && [...tables].some((t) => WORKOUT_TABLES.has(t))
        && !workoutRoots.has(root))
      .map(([root]) => root)
    expect(missing).toEqual([])
  })

  it('health-derived queries are in HEALTH_QUERY_KEYS', () => {
    const missing = [...TABLES_BY_ROOT]
      .filter(([root, tables]) => !EXEMPT.has(root)
        && [...tables].some((t) => HEALTH_TABLES.has(t))
        && !healthRoots.has(root))
      .map(([root]) => root)
    expect(missing).toEqual([])
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
  const code = SOURCES.find((s) => s.path.endsWith('lib/query/realtimeKeys.ts'))!.code
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
