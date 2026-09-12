import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { manualHkUuid, isManualHkUuid } from '@/lib/nutrition/manualEntry'
import {
  buildWeeklyExport, type WeeklyExportInput, type ExportDay,
} from '@/lib/reports/weeklyExport'
import {
  dayField, dayFieldOrNull, notRecorded, sectionLines, weekField, NO_DATA,
} from './exportGrammar'

/** The `TDEE …` line under `## THE WEEK`, which states the estimate's terms. */
const tdeeLine = (out: string): string =>
  sectionLines(out, 'THE WEEK').find((l) => l.startsWith('TDEE '))!

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
    wristTempDeltaC: null, bloodOxygenPct: null,
    hrvMs: null, waterMl: null, supplementsTaken: null, activeKcal: null, bmrKcal: null,
    weighInSkipReason: null, nutritionException: null, nutritionEstimated: false, ...o,
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
  // The corrected day is the `**Intake**` row of its own day block, found by
  // label rather than by substring — 1,891 also appears in the week's averages
  // and in the energy estimate, and a grep would match there.
  it('prints the corrected intake and macros verbatim', () => {
    const out = buildWeeklyExport(base({
      days: [day({ calories: 1891, proteinG: 173, carbsG: 188, fatG: 52 })],
    }))
    const intake = dayField(out, '2026-08-05', 'Intake')
    expect(intake).toContain('1,891 / 1,955 kcal')
    expect(intake).toContain('173 / 170 P')
    expect(intake).toContain('188 C')
    expect(intake).toContain('52 F')
  })

  it('carries a corrected value that differs from the synced one', () => {
    // The same day rendered twice: whatever the export is handed is what it
    // prints. There is no second source of calories to fall back to.
    const synced = buildWeeklyExport(base({ days: [day({ calories: 2400 })] }))
    const corrected = buildWeeklyExport(base({ days: [day({ calories: 1891 })] }))
    expect(dayField(synced, '2026-08-05', 'Intake')).toContain('2,400 / 1,955 kcal')
    expect(dayField(corrected, '2026-08-05', 'Intake')).toContain('1,891 / 1,955 kcal')
    expect(corrected).not.toMatch(/2,400/)
  })

  it('feeds the corrected intake into the energy-balance estimate too', () => {
    // The aggregate must not be computed from a stale copy held elsewhere.
    const out = buildWeeklyExport(base({
      days: [day({ calories: 1891, bmrKcal: 1517, activeKcal: 911 })],
    }))
    // 1517 BMR + 911 active + 198.6 TEF = 2626.6 expenditure, against 1891 in.
    // It is stated under the fence, because three of those four terms are
    // arithmetic rather than measurement.
    expect(weekField(out, 'Energy balance')).toContain('−736 kcal over the week')
    expect(weekField(out, 'Energy balance')).toContain('*computed by Onyx, an estimate*')
    const terms = tdeeLine(out)
    expect(terms).toContain('TDEE 2,627/day')
    expect(terms).toContain('1 day counted')
    // The corrected intake is what the TEF term was taken from, so a stale copy
    // held elsewhere would show up here too: 1891 × 0.105 = 198.6.
    expect(terms).toContain('TEF 199')
    expect(terms).toContain('BMR 1,517')
    expect(terms).toContain('Apple Watch active 911')
  })

  it('prints a zero-calorie correction as 0, not as "not recorded"', () => {
    // A logged fast is a measurement. Only an ABSENT entry is "no data", and
    // that distinction is the whole reason this document never prints a blank.
    const out = buildWeeklyExport(base({ days: [day({ calories: 0 })] }))
    expect(dayField(out, '2026-08-05', 'Intake')).toContain('0 / 1,955 kcal')
    // And an absent one has no intake row at all — a day the app heard nothing
    // about says so once, at the foot, rather than printing a ratio against a
    // target nobody ate toward.
    const absent = buildWeeklyExport(base({ days: [day({ calories: null })] }))
    expect(dayFieldOrNull(absent, '2026-08-05', 'Intake')).toBeNull()
    expect(notRecorded(absent, '2026-08-05')).toContain('intake')
    // A half-logged day still prints, and still names the gap inside the row.
    const partial = buildWeeklyExport(base({ days: [day({ proteinG: 173 })] }))
    expect(dayField(partial, '2026-08-05', 'Intake')).toContain(`${NO_DATA} / 1,955 kcal`)
    expect(dayField(partial, '2026-08-05', 'Intake')).toContain('173 / 170 P')
  })
})
