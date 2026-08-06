import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { manualHkUuid, isManualHkUuid } from '@/lib/nutrition/manualEntry'
import {
  buildWeeklyExport, type WeeklyExportInput, type ExportDay,
} from '@/lib/reports/weeklyExport'

/**
 * MANUAL INTAKE MUST WIN — end to end.
 *
 * A hand-corrected day has to reach the export unchanged, and the chain that
 * carries it has four links, each of which has its own way of dropping the
 * correction on the floor:
 *
 *   1. The WRITE targets the row the export reads — `nutrition_entries` at
 *      `meal_type = 'daily'` — and upserts on `(user_id, date, meal_type)`, so
 *      it overwrites rather than inserting a second row the reader might not
 *      pick.
 *   2. The row is STAMPED with a per-day manual sentinel, so the next HealthKit
 *      sync skips it instead of overwriting the correction.
 *   3. The export's cache key is INVALIDATED, or the markdown is rebuilt from
 *      the numbers the edit just replaced (60 s staleTime, and the string looks
 *      perfectly well-formed either way — the reason this needed a test).
 *   4. The RENDERER prints the value it was handed, with no fallback to any
 *      other source of calories.
 *
 * Links 1–3 are asserted against the real modules below; link 4 is asserted by
 * rendering.
 */
describe('manual intake override reaches the export', () => {
  const day = (o: Partial<ExportDay>): ExportDay => ({
    date: '2026-08-05', weekdayLabel: 'Wed', isTrainingDay: true, weightKg: null,
    calories: null, proteinG: null, carbsG: null, fatG: null, steps: null, distanceM: null,
    trainingMin: null, sleepMin: null, deepMin: null, remMin: null, restingHr: null,
    hrvMs: null, waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null,
    weighInSkipReason: null, ...o,
  })
  const base = (o: Partial<WeeklyExportInput> = {}): WeeklyExportInput => ({
    weekStart: '2026-08-02', weekEnd: '2026-08-08', weekLabel: 'Week 3',
    programLabel: 'Helix Cut',
    calorieGoal: 1955, proteinGoalG: 170, stepsGoal: 10000, sleepGoalHours: 8,
    days: [], sessions: [], volumeByMuscle: [], doms: [], cardio: [], ...o,
  })

  // ── Link 2 · the sentinel HealthKit checks ──
  it('stamps a per-day sentinel, so two manual days cannot collide', () => {
    // `nutrition_entries.hk_uuid` is UNIQUE, so the old bare 'manual' literal
    // could exist on exactly one row in the whole table.
    expect(manualHkUuid('2026-08-05')).toBe('manual-2026-08-05')
    expect(manualHkUuid('2026-08-05')).not.toBe(manualHkUuid('2026-08-06'))
  })

  it('recognises its own sentinel, and the legacy bare one', () => {
    // The ingest route calls exactly this to decide whether to skip a day.
    expect(isManualHkUuid(manualHkUuid('2026-08-05'))).toBe(true)
    expect(isManualHkUuid('manual')).toBe(true)
    expect(isManualHkUuid(null)).toBe(false)
    expect(isManualHkUuid('B4A1-HEALTHKIT-UUID')).toBe(false)
  })

  // ── Links 1 + 3 · the write path, read from source ──
  // Asserted against the module text because the alternative is mocking
  // Supabase and React Query, which would test the mock. What matters is which
  // ROW is written and which CACHE KEY is dropped, and both are literals.
  describe('useMacroOverride', () => {
    const src = readFileSync('src/lib/hooks/useMacroOverride.ts', 'utf8')

    it('writes the exact row the export reads', () => {
      expect(src).toMatch(/meal_type: 'daily'/)
      expect(src).toMatch(/from\('nutrition_entries'\)/)
    })

    it('UPSERTS on the natural key, so the edit replaces rather than duplicates', () => {
      expect(src).toMatch(/onConflict: 'user_id,date,meal_type'/)
    })

    it('marks the row manual so a later HealthKit sync cannot clobber it', () => {
      expect(src).toMatch(/hk_uuid: manualHkUuid\(date\)/)
    })

    it('invalidates the WEEKLY EXPORT cache, not just the daily surfaces', () => {
      // Without this the export serves markdown built from the pre-edit numbers
      // for up to its 60 s staleTime.
      expect(src).toMatch(/\['weekly_export'\]/)
      expect(src).toMatch(/\['nutrition_entries'\]/)
    })
  })

  // ── Link 4 · the renderer ──
  it('prints the corrected intake and macros verbatim', () => {
    const out = buildWeeklyExport(base({
      days: [day({ calories: 1891, proteinG: 173, carbsG: 188, fatG: 52 })],
    }))
    expect(out).toMatch(/intake 1891 kcal \(173P\/188C\/52F\)/)
  })

  it('carries a corrected value that differs from the synced one', () => {
    // The same day rendered twice: whatever the export is handed is what it
    // prints. There is no second source of calories to fall back to.
    const synced = buildWeeklyExport(base({ days: [day({ calories: 2400 })] }))
    const corrected = buildWeeklyExport(base({ days: [day({ calories: 1891 })] }))
    expect(synced).toMatch(/intake 2400 kcal/)
    expect(corrected).toMatch(/intake 1891 kcal/)
    expect(corrected).not.toMatch(/2400/)
  })

  it('feeds the corrected intake into the energy-balance estimate too', () => {
    // The aggregate must not be computed from a stale copy held elsewhere.
    const out = buildWeeklyExport(base({
      days: [day({ calories: 1891, bmrKcal: 1517, activeKcal: 911 })],
    }))
    // 1517 BMR + 911 active + 198.6 TEF = 2626.6.
    expect(out).toMatch(/Intake 1891 kcal vs expenditure 2627 kcal/)
    expect(out).toMatch(/736 kcal DEFICIT/)
  })

  it('prints a zero-calorie correction as 0, not as "not recorded"', () => {
    // A logged fast is a measurement. Only an ABSENT entry is an em-dash.
    const out = buildWeeklyExport(base({ days: [day({ calories: 0 })] }))
    expect(out).toMatch(/intake 0 kcal/)
  })
})
