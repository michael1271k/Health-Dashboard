import { describe, it, expect } from 'vitest'
import { DOMS_MUSCLES, domsMuscleOf, type DomsMuscle } from '@/lib/hooks/useRecovery'
import { sorenessSummary, SEVERITY_COLOR, SEVERITY_WORD } from '@/components/day/RecoveryTrackers'

describe('DOMS_MUSCLES', () => {
  it('tracks Glutes as its own muscle', () => {
    // Hip thrusts and RDLs are the two biggest lifts on Legs B; folding glute
    // soreness into Hamstrings meant one rating had to describe both.
    expect(DOMS_MUSCLES).toContain('Glutes')
    expect(DOMS_MUSCLES).toHaveLength(8)
  })

  it('orders upper before lower, and Glutes above Quads', () => {
    expect([...DOMS_MUSCLES]).toEqual([
      'Chest', 'Back', 'Arms', 'Shoulders', 'Glutes', 'Quads', 'Hamstrings', 'Calves',
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

  it('returns null for tokens that are not tracked', () => {
    expect(domsMuscleOf('core')).toBeNull()
    expect(domsMuscleOf('abs')).toBeNull()
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

  it('folds every unrated muscle into `clear` — 8 muscles cost 3 rows, not 8', () => {
    const s = sorenessSummary(doms({ Quads: 3 }))
    expect(s.sore).toHaveLength(1)
    expect(s.clear).toHaveLength(7)
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
    expect(s.clear).toHaveLength(8)
    expect(s.peak).toBe(0)
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
