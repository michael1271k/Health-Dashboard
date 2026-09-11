import { describe, it, expect } from 'vitest'
import { DOMS_MUSCLES, domsMuscleOf, type DomsMuscle } from '@/lib/hooks/useRecovery'
import { sorenessSummary, SEVERITY_COLOR, SEVERITY_WORD } from '@/components/day/RecoveryTrackers'
import { GROUP_MUSCLES, groupOf, groupOfLandmark, musclesOnSide, type SorenessGroup } from '@/components/day/SorenessMap'
import { MUSCLE_PATHS, DOMS_TO_LANDMARK, landmarkToDoms, domsToWorked } from '@/lib/body/atlas'
import { foldDomsSeverity } from '@/lib/recovery/soreness'

describe('DOMS_MUSCLES', () => {
  it('tracks Glutes as its own muscle', () => {
    // Hip thrusts and RDLs are the two biggest lifts on Legs B; folding glute
    // soreness into Hamstrings meant one rating had to describe both.
    expect(DOMS_MUSCLES).toContain('Glutes')
    expect(DOMS_MUSCLES).toHaveLength(10)
  })

  it('tracks Abs — every Legs & Core day trains it and it had nowhere to report', () => {
    expect(DOMS_MUSCLES).toContain('Abs')
  })

  it('orders upper, then trunk, then lower', () => {
    expect([...DOMS_MUSCLES]).toEqual([
      'Chest', 'Back', 'Arms', 'Shoulders', 'Abs', 'Glutes', 'Quads', 'Hamstrings', 'Inner thighs', 'Calves',
    ])
  })

  it('tracks Inner thighs — the adductors were drawn but could never be rated', () => {
    // The atlas has drawn an adductor belly since it was written, and no
    // reported soreness could ever light it: the tap fell through a special
    // case to the Legs picker and the muscle itself stayed empty forever.
    expect(DOMS_MUSCLES).toContain('Inner thighs')
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

  it('folds BOTH hip tokens onto Inner thighs — one rating, one region', () => {
    // Adduction and abduction are rated together because the figure draws one
    // inner-thigh region and asks one question about it.
    expect(domsMuscleOf('adductors')).toBe('Inner thighs')
    expect(domsMuscleOf('inner thigh')).toBe('Inner thighs')
    expect(domsMuscleOf('abductors')).toBe('Inner thighs')
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

  it('folds every unrated muscle into `clear` — 10 muscles cost 3 rows, not 10', () => {
    const s = sorenessSummary(doms({ Quads: 3 }))
    expect(s.sore).toHaveLength(1)
    expect(s.clear).toHaveLength(9)
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
    expect(s.clear).toHaveLength(10)
    expect(s.peak).toBe(0)
  })
})

describe('the soreness map', () => {
  it('draws every tracked muscle somewhere — no muscle is unreachable by tap', () => {
    // Via the atlas now: a DOMS muscle is reachable if ANY landmark it folds
    // onto is drawn. "Arms" is three landmarks and needs only one of them.
    const drawn = new Set(MUSCLE_PATHS.map((p) => p.muscle))
    for (const m of DOMS_MUSCLES) {
      expect(DOMS_TO_LANDMARK[m].some((l) => drawn.has(l)), m).toBe(true)
    }
  })

  it('gives every drawn muscle somewhere to go when tapped', () => {
    // The map is tappable, so a belly that highlights and then opens nothing is
    // a dead region. Adductors WAS the interesting case: drawn, with no rating
    // of its own, reached only through a hand-written special case. It has its
    // own rating now, so the fold is total and the special case is gone.
    for (const p of MUSCLE_PATHS) {
      expect(GROUP_MUSCLES[groupOfLandmark(p.muscle)], p.muscle).toBeTruthy()
    }
    expect(landmarkToDoms('Adductors')).toBe('Inner thighs')
    expect(groupOfLandmark('Adductors')).toBe('legs')
  })

  it('spreads one reported soreness across every muscle it covers', () => {
    const worked = domsToWorked({ Arms: 3 })
    expect(worked.Biceps).toBe(1)
    expect(worked.Triceps).toBe(1)
    expect(worked.Forearms).toBe(1)
    expect(worked.Chest).toBeUndefined()
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
    expect(musclesOnSide('front')).toEqual(['Chest', 'Arms', 'Shoulders', 'Abs', 'Quads', 'Inner thighs', 'Calves'])
    expect(musclesOnSide('back')).toEqual(['Back', 'Arms', 'Shoulders', 'Glutes', 'Hamstrings', 'Calves'])
  })

  it('mirrors every paired muscle so one side is never tappable and the other not', () => {
    // A left quad with no right quad is a rendering bug you only notice by eye.
    const PAIRED = ['Side delts', 'Rear delts', 'Biceps', 'Triceps', 'Forearms',
      'Quads', 'Adductors', 'Calves', 'Glutes', 'Hamstrings']
    for (const p of MUSCLE_PATHS) {
      if (!PAIRED.includes(p.muscle)) continue
      const same = MUSCLE_PATHS.filter((x) => x.view === p.view && x.muscle === p.muscle)
      expect(same.length, `${p.muscle} on ${p.view}`).toBe(2)
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

describe('the soreness fold the battery reads', () => {
  /**
   * The whole difference between "mean over rows" and "mean over distinct
   * recognised muscles, max within each". `ScoringHolesTests.domsFold` runs the
   * identical vectors on the native side.
   */
  const row = (muscle_group: string, severity: number) => ({ muscle_group, severity })

  it('takes the worst side, not the average of the two', () => {
    // A severe left quad makes the quad severe. Averaging it to 2 reports a
    // day nobody had.
    expect(foldDomsSeverity([row('Quads', 1), row('Quads', 3)])).toBe(3)
  })

  it('scores the same whether one side or both were rated', () => {
    // The property that keeps every historical battery number invariant when
    // laterality ships: describing a complaint twice is not two complaints.
    const oneSide = foldDomsSeverity([row('Quads', 2), row('Chest', 0)])
    const bothSides = foldDomsSeverity([row('Quads', 2), row('Quads', 2), row('Chest', 0)])
    expect(oneSide).toBe(bothSides)
    expect(oneSide).toBe(1)
  })

  it('is unmoved by sub-regions of a muscle already rated', () => {
    // 'Back' whole at 1 and its erectors at 3 is one sore back, at 3.
    expect(foldDomsSeverity([row('Back', 1), row('Back', 3)])).toBe(3)
  })

  it('stops counting a muscle_group it cannot read', () => {
    // seed-demo-account.mjs writes 'Quadriceps' and 'Lats'. Neither is a DOMS
    // muscle, so neither can ever be read back as a rating — and both were in
    // the denominator, dragging the mean toward zero.
    expect(foldDomsSeverity([row('Quads', 2), row('Quadriceps', 0), row('Lats', 0)])).toBe(2)
  })

  it('keeps a zero, because "not sore" is an answer', () => {
    expect(foldDomsSeverity([row('Quads', 2), row('Hamstrings', 0)])).toBe(1)
  })

  it('answers null when nothing recognised was rated', () => {
    // No answer is not the same as no soreness, and the battery treats them
    // differently.
    expect(foldDomsSeverity([row('Quadriceps', 3)])).toBeNull()
    expect(foldDomsSeverity([])).toBeNull()
  })
})
