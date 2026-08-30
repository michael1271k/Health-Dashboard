import { describe, it, expect } from 'vitest'
import { stackForDate, protocolForDate, supplementCountForDate, SUPPLEMENT_PROTOCOL } from '@/lib/supplements'
import {
  customSlotsForDate, customDoseFor, supplementKeyOf, nutrientPayloads,
  type CustomSupplement,
} from '@/lib/hooks/useCustomSupplements'
import { supplementNutrients } from '@/lib/nutrition/supplementNutrients'

const row = (over: Partial<CustomSupplement> = {}): CustomSupplement => ({
  id: 'row-1', name: 'L-Citrulline', dose: '6 g', color: '#8E9AAC', form: null,
  time: '11:45', schedule: { key: 'citrulline', slot: 'Pre-Workout', trainingOnly: true },
  micros: { citrulline: 6000 },
  ...over,
})

/**
 * The stack moved out of a constant and into `custom_supplements`. What must
 * survive that move is the LOG KEY: `supplement_log.item_key` holds months of
 * ticks against 'creatine', 'citrulline', … and SUPPLEMENT_NUTRIENTS is keyed the
 * same way.
 */
describe('supplement identity', () => {
  it('keeps the seeded key so ticked history still resolves', () => {
    expect(supplementKeyOf(row())).toBe('citrulline')
  })

  it('falls back to custom:<id> for a row the user added', () => {
    expect(supplementKeyOf(row({ schedule: { days: [1, 3] } }))).toBe('custom:row-1')
  })

  it('routes micros through the row’s own payload, not the built-in table', () => {
    // The dose was corrected from 3 g to 6 g in the app. A mass dose is not a
    // unit count, so `doseUnits` leaves it at x1 — the payload itself has to
    // carry the real total, and the built-in table still says 3000.
    const out = supplementNutrients(['citrulline'], new Map([['citrulline', '6 g']]), nutrientPayloads([row()]))
    expect(out.citrulline).toBe(6000)
  })

  it('still credits a supplement whose row carries no payload', () => {
    const out = supplementNutrients(['creatine'], undefined, nutrientPayloads([row()]))
    expect(out.creatine).toBe(5000)
  })
})

describe('the day’s stack', () => {
  it('reads the database when there are rows', () => {
    const slots = customSlotsForDate([row()], 2, true)
    expect(slots).toHaveLength(1)
    expect(slots[0].items[0]).toMatchObject({ key: 'citrulline', dose: '6 g', customId: 'row-1' })
    // The slot takes its name from the row, not the literal 'Custom' the
    // second-class list used to get.
    expect(slots[0].label).toBe('Pre-Workout')
  })

  it('drops a training-only supplement on a rest day', () => {
    expect(customSlotsForDate([row()], 2, false)).toEqual([])
    expect(customSlotsForDate([row()], 2, true)).toHaveLength(1)
  })

  it('honours a weekday schedule', () => {
    const mon = row({ schedule: { days: [1] } })
    expect(customSlotsForDate([mon], 1, true)).toHaveLength(1)
    expect(customSlotsForDate([mon], 2, true)).toEqual([])
  })

  it('falls back to the seed protocol when the table is empty', () => {
    // Not a merge — an unseeded database showing an empty checklist to someone
    // with a real stack would be worse than showing the defaults.
    expect(stackForDate([], true, 2)).toEqual(protocolForDate(true, 2))
    expect(stackForDate([], true, 2).length).toBeGreaterThan(0)
  })

  it('prefers the database over the seed, never both', () => {
    const slots = stackForDate(customSlotsForDate([row()], 2, true), true, 2)
    expect(slots.flatMap((s) => s.items)).toHaveLength(1)
  })

  it('counts the USER’s stack for the Stack tile denominator', () => {
    // The tile read 9/11 forever the moment two supplements were added.
    const two = [row(), row({ id: 'row-2', name: 'Creatine', schedule: { key: 'creatine' }, time: '15:00' })]
    expect(supplementCountForDate(true, customSlotsForDate(two, 2, true))).toBe(2)
    // With no rows it falls back to the seed's own count.
    const seeded = SUPPLEMENT_PROTOCOL.flatMap((s) => s.items).filter((i) => !i.trainingOnly).length
    expect(supplementCountForDate(false)).toBe(seeded)
  })

  it('resolves a per-day dose split', () => {
    const multi = row({ dose: '1 tab', schedule: { key: 'multivitamin', trainingDose: '2 tabs' } })
    expect(customDoseFor(multi, true)).toBe('2 tabs')
    expect(customDoseFor(multi, false)).toBe('1 tab')
  })
})
