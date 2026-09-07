import { describe, it, expect } from 'vitest'
import { exerciseTags, exerciseTagLabels } from '@/lib/exercises/tags'

const keys = (name: string, compound?: boolean | null) =>
  exerciseTags(name, { compound }).map((t) => t.key)

describe('exerciseTags — the order is fixed', () => {
  it('runs load class, equipment, then the three qualifiers', () => {
    expect(keys('Single Arm Lateral Raise', false))
      .toEqual(['isolation', 'cable', 'unilateral'])
  })

  it('omits the load class when the caller does not know', () => {
    // 'machine' is the equipment chip, which this test is not about — the
    // point is that the LOAD class is absent when the caller passes no
    // `isCompound`. Since 2026-09-07 equipment comes from `EQUIPMENT_BY_NAME`
    // rather than from the title, so a pulldown is placed even though its
    // name no longer says where it happens.
    expect(keys('Lat Pulldown')).toEqual(['machine'])
    expect(keys('Lat Pulldown', null)).toEqual(['machine'])
  })

  it('says isolation for false, not nothing', () => {
    expect(keys('Lat Pulldown', false)).toEqual(['isolation', 'machine'])
    expect(keys('Lat Pulldown', true)).toEqual(['compound', 'machine'])
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
    // "Lateral Raise" used to answer `bodyweight` too — it matched the same
    // `raise` rule, and a lateral raise is not a bodyweight movement. That
    // was the heuristic being confidently wrong, and it is what put the
    // machine lateral raise in the same tag as a reverse crunch. It is a
    // `Machine` in `EQUIPMENT_BY_NAME` now, which is what it is.
    expect(keys('Lateral Raise')).toEqual(['machine'])
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
    expect(exerciseTagLabels('Single Arm Triceps Pushdown', { compound: true }))
      .toEqual(['Compound', 'Cable', 'Per side'])
  })
})
