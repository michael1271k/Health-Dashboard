import { describe, it, expect } from 'vitest'
import { ledgerWindow } from '@/components/dashboard/widgets/PlanWidgets'
import { phaseSpanFor } from '@/lib/phases'

/**
 * The deficit ledger used to sum a flat rolling 30 days regardless of what had
 * happened inside them. On the day a phase turns, that window is 29 days of one
 * calorie target and 1 of another, averaged into a single "kg/wk" and presented
 * as the slope you are on. It is not — it is the slope you WERE on, dragged one
 * day toward the new one, and it stays wrong for a month.
 *
 * The Maintenance Week opening 2026-08-30 is the case this was written for.
 */
describe('phaseSpanFor', () => {
  it('locates a date inside its phase and counts the days in', () => {
    const s = phaseSpanFor('2026-08-30')
    expect(s?.def.name).toBe('Maintenance Week')
    expect(s?.dayIndex).toBe(0)     // day 1 of the phase
  })

  it('counts from the phase start, not from the week start', () => {
    // The distinction the week-granular getWeekPhase cannot make.
    expect(phaseSpanFor('2026-09-01')?.dayIndex).toBe(2)
  })

  it('is null outside the programme rather than inventing a phase', () => {
    // The blocks are contiguous from 2026-03-08 to the end of the Lean Bulk, so
    // the honest "no phase" cases are before the record starts and after it ends.
    expect(phaseSpanFor('2026-01-15')).toBeNull()
    expect(phaseSpanFor('2027-06-01')).toBeNull()
    expect(phaseSpanFor('not-a-date')).toBeNull()
  })
})

describe('ledgerWindow', () => {
  it('reaches back past the boundary when the phase is too young to speak', () => {
    // Day 1 of the maintenance week: one day of data is not a rate.
    const w = ledgerWindow('2026-08-30')
    expect(w.inPhase).toBe(1)
    expect(w.days).toBe(14)          // the floor, borrowed from the cut before it
    expect(w.label).toBe('Maint · day 1')
  })

  it('narrows to the phase itself once the phase is old enough', () => {
    // 20 days into the cut that opened 2026-07-19.
    const w = ledgerWindow('2026-08-07')
    expect(w.inPhase).toBe(20)
    expect(w.days).toBe(20)          // no borrowing: the phase can answer alone
  })

  it('never sums more than a month, however long the phase has run', () => {
    const w = ledgerWindow('2026-08-27')   // day 40 of the cut
    expect(w.inPhase).toBe(30)
    expect(w.days).toBe(30)
  })

  it('falls back to the flat month when there is no phase to scope to', () => {
    const w = ledgerWindow('2026-01-15')
    expect(w.days).toBe(30)
    expect(w.inPhase).toBe(30)       // nothing to dim: no boundary is in view
    expect(w.label).toBeNull()       // no phase name to claim
  })

  it('always has something to dim, or nothing at all — never a negative count', () => {
    for (const d of ['2026-08-30', '2026-08-07', '2026-08-27', '2026-01-15']) {
      const w = ledgerWindow(d)
      expect(w.days - w.inPhase).toBeGreaterThanOrEqual(0)
    }
  })
})
