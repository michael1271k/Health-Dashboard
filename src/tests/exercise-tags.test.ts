import { describe, it, expect } from 'vitest'
import { exerciseTags, exerciseTagLabels } from '@/lib/exercises/tags'

const keys = (name: string, compound?: boolean | null) =>
  exerciseTags(name, { compound }).map((t) => t.key)

describe('exerciseTags — the order is fixed', () => {
  it('runs load class, equipment, then the three qualifiers', () => {
    expect(keys('Single Arm Lateral Raise (Cable)', false))
      .toEqual(['isolation', 'cable', 'unilateral'])
  })

  it('omits the load class when the caller does not know', () => {
    expect(keys('Lat Pulldown')).toEqual([])
    expect(keys('Lat Pulldown', null)).toEqual([])
  })

  it('says isolation for false, not nothing', () => {
    expect(keys('Lat Pulldown', false)).toEqual(['isolation'])
    expect(keys('Lat Pulldown', true)).toEqual(['compound'])
  })
})

describe('exerciseTags — the two collisions', () => {
  it('does not print Bodyweight twice on a push-up', () => {
    expect(keys('Push-Up')).toEqual(['bodyweight'])
  })

  it('does not print a timed hold twice on a plank', () => {
    expect(keys('Side Plank')).toEqual(['unilateral', 'timed'])
  })

  it('keeps the equipment label when the qualifier does NOT fire', () => {
    // "Reverse Crunch" matches the Bodyweight equipment rule AND is bodyweight.
    expect(keys('Reverse Crunch')).toEqual(['bodyweight'])
    // "Lateral Raise" matches the same equipment rule (`raise`) but is not a
    // bodyweight movement, so the equipment chip stands on its own.
    expect(keys('Lateral Raise')).toEqual(['bodyweight'])
  })

  it('a loaded carry is equipment AND timed', () => {
    expect(keys('Farmer Carry')).toEqual(['carry', 'timed'])
  })
})

describe('exerciseTags — the fallback is not a chip', () => {
  it('says nothing for a movement the rules cannot place', () => {
    expect(exerciseTags('Reverse Hyper')).toEqual([])
  })

  it('answers for a null name', () => {
    expect(exerciseTags(null)).toEqual([])
    expect(exerciseTags(undefined, { compound: true })).toEqual([
      { key: 'compound', label: 'Compound', kind: 'load' },
    ])
  })
})

describe('exerciseTagLabels', () => {
  it('is the labels of the same list', () => {
    expect(exerciseTagLabels('Single Arm Triceps Pushdown (Cable)', { compound: true }))
      .toEqual(['Compound', 'Cable', 'Per side'])
  })
})
