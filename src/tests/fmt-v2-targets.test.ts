import { describe, it, expect } from 'vitest'
import { parseFmtV2, parseTargets, hasTargets } from '@/lib/reports/fmtV2'
import { targetForExercise, formatTarget } from '@/lib/reports/targetMatch'

/**
 * The inbound half of the paste loop.
 *
 * Targets are the first thing this reader extracts that the app then ACTS on —
 * a chip on a card, a line on the dashboard — so the properties pinned here are
 * about restraint rather than coverage: a prescription nobody wrote must come
 * back null, and a number that happens to sit near the word "kg" must not
 * become an instruction. A parser that invents a target is worse than one that
 * misses it, because you cannot tell by looking that it was invented.
 */

const REPORT = [
  '⬢ HELIX OS · WEEKLY TELEMETRY & PERFORMANCE AUDIT',
  '║ W03 · 2026-08-09 → 08-15 · CUT · SENTINEL-7 · FMT v2 ║',
  '',
  '▓ PART 4 — NEXT WEEK PROTOCOL',
  '',
  '⚑ DB LADDER',
  'Seated Cable Row (Wide Grip) → 49.5 kg × 8-10',
  'Incline DB Press — 22.5 kg × 6–8',
  'Leg Press: hold 120 kg, chase reps',
  '',
  '🎯 TARGETS',
  'Hydration: 3.2–3.5 L/day, front-loaded before 18:00.',
  'Steps: 12,000/day on rest days.',
  'Intake: 1,885 kcal · 170P / 182C / 53F',
  'Keep the last set of every push movement two reps from failure.',
].join('\n')

describe('parseTargets — the load ladder', () => {
  const t = parseFmtV2(REPORT)!.targets!

  it('reads name, load and rep window off an arrow line', () => {
    expect(t.exercises[0]).toEqual({
      name: 'Seated Cable Row (Wide Grip)', loadKg: 49.5, repsLow: 8, repsHigh: 10,
    })
  })

  it('reads an em-dash line and an en-dash rep range', () => {
    const inc = t.exercises.find((e) => /Incline/.test(e.name))!
    expect(inc.loadKg).toBe(22.5)
    expect([inc.repsLow, inc.repsHigh]).toEqual([6, 8])
  })

  it('keeps a load with no rep window rather than dropping the line', () => {
    const legs = t.exercises.find((e) => /Leg Press/.test(e.name))!
    expect(legs.loadKg).toBe(120)
    expect(legs.repsLow).toBeNull()
  })
})

describe('parseTargets — the non-training instructions', () => {
  const t = parseFmtV2(REPORT)!.targets!

  it('reads a hydration RANGE, not just a number near the word water', () => {
    expect(t.water).toEqual({ minL: 3.2, maxL: 3.5 })
  })

  it('reads a step goal written with a thousands separator', () => {
    expect(t.steps).toBe(12000)
  })

  it('reads the macro line whole', () => {
    expect(t.macros).toEqual({ kcal: 1885, proteinG: 170, carbsG: 182, fatG: 53 })
  })

  it('carries the prose instruction forward as a note', () => {
    expect(t.notes.some((n) => /two reps from failure/.test(n))).toBe(true)
  })
})

describe('parseTargets — what it refuses', () => {
  it('does not read a sentence that merely mentions kilograms', () => {
    const t = parseTargets(['Volume dropped and you still moved 24 kg per set on Tuesday.'])
    expect(t.exercises).toEqual([])
  })

  it('does not invent a hydration target from a year or a rep count', () => {
    expect(parseTargets(['Water intake was fine.']).water).toBeNull()
    expect(parseTargets(['Hydration: 40 L']).water).toBeNull()
  })

  it('reports NOTHING for a report that prescribed nothing', () => {
    const plain = ['▓ PART 1 — REVIEW', '', '🟢 QUICK VERDICT', 'A solid week overall.'].join('\n')
    expect(parseFmtV2(plain)!.targets).toBeNull()
    expect(hasTargets(null)).toBe(false)
  })

  it('leaves a report with no FMT structure alone', () => {
    expect(parseFmtV2('just some notes')!.targets).toBeNull()
  })
})

describe('targetForExercise', () => {
  const t = parseFmtV2(REPORT)!.targets!

  it('matches through the catalog alias table', () => {
    // "Incline Dumbbell Press" is an alias of "Incline DB Press"; the report
    // wrote the short form and the card asks with the long one.
    expect(targetForExercise(t, 'Incline Dumbbell Press')?.loadKg).toBe(22.5)
  })

  it('does not match a DIFFERENT grip of the same machine', () => {
    // Seated Cable Row is deliberately two catalog rows split by grip. A fuzzy
    // matcher here would re-merge them where nobody would ever see it happen.
    expect(targetForExercise(t, 'Seated Cable Row (Neutral Grip)')).toBeNull()
  })

  it('returns null rather than guessing when there are no targets', () => {
    expect(targetForExercise(null, 'Leg Press')).toBeNull()
    expect(targetForExercise(t, '')).toBeNull()
  })

  it('formats whatever half of the instruction exists', () => {
    expect(formatTarget({ name: 'x', loadKg: 49.5, repsLow: 8, repsHigh: 10 })).toBe('49.5 kg × 8–10')
    expect(formatTarget({ name: 'x', loadKg: 120, repsLow: null, repsHigh: null })).toBe('120 kg')
    expect(formatTarget({ name: 'x', loadKg: null, repsLow: 12, repsHigh: 12 })).toBe('× 12')
    expect(formatTarget({ name: 'x', loadKg: null, repsLow: null, repsHigh: null })).toBeNull()
  })
})
