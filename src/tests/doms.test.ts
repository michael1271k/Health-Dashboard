import { describe, it, expect } from 'vitest'
import { DOMS_MUSCLES, domsMuscleOf, type DomsMuscle } from '@/lib/hooks/useRecovery'
import { sorenessSummary, SEVERITY_COLOR, SEVERITY_WORD } from '@/components/day/RecoveryTrackers'
import { REGIONS, GROUP_MUSCLES, groupOf, musclesOnSide, type SorenessGroup } from '@/components/day/SorenessMap'

describe('DOMS_MUSCLES', () => {
  it('tracks Glutes as its own muscle', () => {
    // Hip thrusts and RDLs are the two biggest lifts on Legs B; folding glute
    // soreness into Hamstrings meant one rating had to describe both.
    expect(DOMS_MUSCLES).toContain('Glutes')
    expect(DOMS_MUSCLES).toHaveLength(9)
  })

  it('tracks Abs — every Legs & Core day trains it and it had nowhere to report', () => {
    expect(DOMS_MUSCLES).toContain('Abs')
  })

  it('orders upper, then trunk, then lower', () => {
    expect([...DOMS_MUSCLES]).toEqual([
      'Chest', 'Back', 'Arms', 'Shoulders', 'Abs', 'Glutes', 'Quads', 'Hamstrings', 'Calves',
    ])
  })
})

describe('domsMuscleOf — program token → tracked muscle', () => {
  it('routes glute tokens to Glutes, NOT to Hamstrings', () => {
    expect(domsMuscleOf('glutes')).toBe('Glutes')
    expect(domsMuscleOf('glute')).toBe('Glutes')
  })

  it('leaves hamstrings on Hamstrings', () => {
    expect(domsMuscleOf('hamstrings')).toBe('Hamstrings')
  })

  it('still folds the arm and shoulder heads', () => {
    expect(domsMuscleOf('biceps')).toBe('Arms')
    expect(domsMuscleOf('triceps')).toBe('Arms')
    expect(domsMuscleOf('rear delts')).toBe('Shoulders')
  })

  it('routes every trunk token to Abs', () => {
    expect(domsMuscleOf('core')).toBe('Abs')
    expect(domsMuscleOf('abs')).toBe('Abs')
    expect(domsMuscleOf('obliques')).toBe('Abs')
    expect(domsMuscleOf('abdominals')).toBe('Abs')
  })

  it('returns null for tokens that are not tracked', () => {
    expect(domsMuscleOf('cardio')).toBeNull()
    expect(domsMuscleOf('grip')).toBeNull()
  })
})

describe('sorenessSummary — what the panel renders', () => {
  const doms = (o: Partial<Record<DomsMuscle, number>>) => o

  it('puts the worst muscle first', () => {
    const s = sorenessSummary(doms({ Chest: 1, Quads: 3, Glutes: 2 }))
    expect(s.sore.map((x) => x.muscle)).toEqual(['Quads', 'Glutes', 'Chest'])
    expect(s.peak).toBe(3)
  })

  it('breaks ties by display order so the list does not reshuffle', () => {
    const s = sorenessSummary(doms({ Calves: 2, Chest: 2, Glutes: 2 }))
    expect(s.sore.map((x) => x.muscle)).toEqual(['Chest', 'Glutes', 'Calves'])
  })

  it('folds every unrated muscle into `clear` — 9 muscles cost 3 rows, not 9', () => {
    const s = sorenessSummary(doms({ Quads: 3 }))
    expect(s.sore).toHaveLength(1)
    expect(s.clear).toHaveLength(8)
    expect(s.clear).not.toContain('Quads')
  })

  it('treats an explicit zero as clear, not as sore', () => {
    // Rating a muscle "None" is a real answer and writes severity 0.
    const s = sorenessSummary(doms({ Quads: 0, Chest: 1 }))
    expect(s.sore.map((x) => x.muscle)).toEqual(['Chest'])
    expect(s.clear).toContain('Quads')
  })

  it('handles no data at all — the pre-migration / untouched case', () => {
    const s = sorenessSummary(undefined)
    expect(s.sore).toEqual([])
    expect(s.clear).toHaveLength(9)
    expect(s.peak).toBe(0)
  })
})

describe('the soreness map', () => {
  it('draws every tracked muscle somewhere — no muscle is unreachable by tap', () => {
    const drawn = new Set(REGIONS.map((r) => r.muscle))
    for (const m of DOMS_MUSCLES) expect(drawn).toContain(m)
  })

  it('assigns every muscle to exactly one group', () => {
    const groups = Object.keys(GROUP_MUSCLES) as SorenessGroup[]
    for (const m of DOMS_MUSCLES) {
      const hits = groups.filter((g) => GROUP_MUSCLES[g].includes(m))
      expect(hits).toHaveLength(1)
      expect(groupOf(m)).toBe(hits[0])
    }
  })

  it('has no group muscle that is not a tracked muscle', () => {
    for (const g of Object.keys(GROUP_MUSCLES) as SorenessGroup[]) {
      for (const m of GROUP_MUSCLES[g]) expect(DOMS_MUSCLES).toContain(m)
    }
  })

  it('shows the anterior chain on the front and the posterior chain on the back', () => {
    expect(musclesOnSide('front')).toEqual(['Chest', 'Arms', 'Shoulders', 'Abs', 'Quads', 'Calves'])
    expect(musclesOnSide('back')).toEqual(['Back', 'Arms', 'Shoulders', 'Glutes', 'Hamstrings', 'Calves'])
  })

  it('mirrors every paired muscle so one side is never tappable and the other not', () => {
    // A left quad with no right quad is a rendering bug you only notice by eye.
    const paired = ['Shoulders', 'Arms', 'Quads', 'Calves', 'Glutes', 'Hamstrings']
    for (const r of REGIONS) {
      if (!paired.includes(r.muscle)) continue
      const same = REGIONS.filter((x) => x.side === r.side && x.muscle === r.muscle)
      expect(same.length).toBe(2)
    }
  })
})

describe('the severity ramp', () => {
  it('has a distinct colour and word per level, including "none"', () => {
    // The collapsed summary rendered every severity in the same grey while this
    // ramp sat unused three lines above it.
    expect(SEVERITY_COLOR).toHaveLength(4)
    expect(new Set(SEVERITY_COLOR).size).toBe(4)
    expect(SEVERITY_WORD).toEqual(['none', 'mild', 'moderate', 'severe'])
  })
})
