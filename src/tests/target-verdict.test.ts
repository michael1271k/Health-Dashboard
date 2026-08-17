import { describe, it, expect } from 'vitest'
import { verdictFor, targetRows } from '@/lib/reports/targetVerdict'
import type { ReportTargets } from '@/lib/reports/fmtV2'

const TARGETS: ReportTargets = {
  exercises: [],
  water: { minL: 3.2, maxL: 3.5 },
  steps: 12000,
  macros: { kcal: 1885, proteinG: 170, carbsG: 182, fatG: 53 },
  notes: [],
}

describe('verdictFor', () => {
  it('treats a floor as met once it is reached, and generous just below it', () => {
    expect(verdictFor(12000, 12000, 'floor')).toBe('hit')
    expect(verdictFor(19000, 12000, 'floor')).toBe('hit')
    expect(verdictFor(11000, 12000, 'floor')).toBe('near')
    expect(verdictFor(8000, 12000, 'floor')).toBe('miss')
  })

  it('treats a ceiling as the opposite — over is the failure, not the win', () => {
    // 2,400 kcal against an 1,885 kcal cut target is the thing the target
    // existed to prevent, not a stronger week.
    expect(verdictFor(2400, 1885, 'ceiling')).toBe('miss')
    expect(verdictFor(1700, 1885, 'ceiling')).toBe('hit')
  })

  it('scores a range by being inside it', () => {
    expect(verdictFor(3.3, 3.2, 'range', 3.5)).toBe('hit')
    expect(verdictFor(3.0, 3.2, 'range', 3.5)).toBe('near')
    expect(verdictFor(1.9, 3.2, 'range', 3.5)).toBe('miss')
    // Above the top of a hydration range is still outside the instruction.
    expect(verdictFor(3.6, 3.2, 'range', 3.5)).toBe('near')
  })

  it('says unknown rather than guessing when a side is missing', () => {
    expect(verdictFor(null, 12000, 'floor')).toBe('unknown')
    expect(verdictFor(9000, null, 'floor')).toBe('unknown')
    expect(verdictFor(9000, 0, 'floor')).toBe('unknown')
  })
})

describe('targetRows', () => {
  const actuals = { waterL: 2.1, steps: 12400, kcal: 1840, proteinG: 150 }

  it('builds one row per prescribed metric and nothing for the rest', () => {
    const rows = targetRows(TARGETS, actuals, '2026-08-17')
    expect(rows.map((r) => r.key).sort()).toEqual(['calories', 'protein', 'steps', 'water'])
  })

  it('leads with what the week is furthest from', () => {
    const rows = targetRows(TARGETS, actuals, '2026-08-17')
    expect(rows[0].key).toBe('water')
    expect(rows[0].verdict).toBe('miss')
  })

  it('links each row at the surface that fixes it', () => {
    const rows = targetRows(TARGETS, actuals, '2026-08-17')
    expect(rows.find((r) => r.key === 'water')!.href).toBe('/day/2026-08-17?section=water')
    expect(rows.find((r) => r.key === 'calories')!.href).toBe('/nutrition')
  })

  it('grades nothing the report did not ask for', () => {
    const only = { ...TARGETS, steps: null, macros: null }
    expect(targetRows(only, actuals, '2026-08-17').map((r) => r.key)).toEqual(['water'])
    expect(targetRows(null, actuals, '2026-08-17')).toEqual([])
  })

  it('shows a missing reading as unknown, never as a zero', () => {
    const rows = targetRows(TARGETS, { waterL: null, steps: null, kcal: null, proteinG: null }, '2026-08-17')
    expect(rows.every((r) => r.verdict === 'unknown' && r.actual === null)).toBe(true)
  })
})
