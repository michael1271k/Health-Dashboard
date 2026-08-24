import { describe, it, expect } from 'vitest'
import { cascadeSetEdit, type DraftSet } from '@/lib/sessions/draft'

const seeded = (w: number, r: number, seed: number): DraftSet => ({
  weightKg: w, reps: r, rpe: seed, rpeSeed: seed, rpeSeedWeightKg: w, rpeSeedReps: r,
})

describe('repro', () => {
  it('failure at 10 then reps +1', () => {
    const sets = [seeded(50, 12, 8), seeded(50, 12, 8), seeded(50, 11, 8.5)]
    // user taps the failure stop on set 3
    const a = cascadeSetEdit(sets, 2, { rpe: 10, setType: 'failure' })
    console.log('after pick', JSON.stringify(a[2]))
    // user taps reps +
    const b = cascadeSetEdit(a, 2, { reps: 12 })
    console.log('after reps+', JSON.stringify(b[2]))
    expect(b[2].rpe).toBe(10)
    expect(b[2].setType).toBe('failure')
  })

  it('failure via action sheet then reps +1', () => {
    const sets = [seeded(50, 11, 8.5)]
    const a = cascadeSetEdit(sets, 0, { setType: 'failure', rpe: 10 })
    const b = cascadeSetEdit(a, 0, { reps: 12 })
    console.log('sheet path', JSON.stringify(b[0]))
    expect(b[0].rpe).toBe(10)
  })

  it('UNSEEDED set: pick failure then reps +1', () => {
    const sets: DraftSet[] = [{ weightKg: 50, reps: 11 }]
    const a = cascadeSetEdit(sets, 0, { rpe: 10, setType: 'failure' })
    const b = cascadeSetEdit(a, 0, { reps: 12 })
    console.log('unseeded', JSON.stringify(b[0]))
    expect(b[0].rpe).toBe(10)
  })
})
