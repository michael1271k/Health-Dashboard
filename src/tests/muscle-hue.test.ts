import { describe, it, expect } from 'vitest'
import { GROUP, MUSCLE, GOLD, SAPPHIRE, EMERALD, EMBER, AMETHYST, COPPER, STEEL } from '@/lib/theme/palette'
import { LANDMARK_MUSCLES, type LandmarkMuscle } from '@/lib/training/landmarks'
import { MUSCLE_GROUPS } from '@/lib/charts/muscleAggregate'
import { familyOf, familyRamp, landmarkColor, groupColor, exerciseColor } from '@/lib/theme/muscleHue'

/** Perceived luminance, for asserting a ramp actually ramps. */
const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const channels = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** Which channel dominates — a cheap stand-in for "is this the same family hue". */
const dominant = (hex: string): number => {
  const c = channels(hex)
  return c.indexOf(Math.max(...c))
}

/**
 * THE TWO MAPS USED TO DISAGREE.
 *
 * `GROUP` painted Legs amethyst while `MUSCLE` painted Quads ember-deep,
 * Hamstrings emerald-deep and Glutes sapphire-deep — three unrelated hues inside
 * one violet family. A radar chart and a volume chart of the same workout shared
 * no visual language at all.
 *
 * Separately, `WEEK_STATE.pr` reserves GOLD app-wide ("gold means this and
 * nothing else"), and `GROUP.Shoulders` was GOLD.
 */
describe('muscle families — six hues, none of them gold', () => {
  it('assigns the six display groups', () => {
    expect(GROUP).toEqual({
      Chest: EMBER,
      Back: EMERALD,
      Shoulders: AMETHYST,
      Arms: COPPER,
      Legs: SAPPHIRE,
      Core: STEEL,
    })
  })

  it('never spends GOLD on a muscle — gold is a personal record', () => {
    expect(Object.values(GROUP)).not.toContain(GOLD)
    expect(Object.values(MUSCLE)).not.toContain(GOLD)
  })

  it('keeps all six distinguishable from each other', () => {
    expect(new Set(Object.values(GROUP)).size).toBe(6)
  })

  it('covers every display group the aggregator emits', () => {
    for (const g of MUSCLE_GROUPS) expect(groupColor(g)).toBe(GROUP[g])
  })

  it('falls back rather than throwing on an unknown group', () => {
    expect(groupColor('Gills')).toBe(STEEL)
    expect(groupColor(null)).toBe(STEEL)
  })
})

describe('landmarks are ramp positions inside their family', () => {
  it('places all 13 landmarks in a family', () => {
    for (const m of LANDMARK_MUSCLES) expect(MUSCLE_GROUPS).toContain(familyOf(m))
  })

  it('maps them the way the training taxonomy does', () => {
    const expected: Record<LandmarkMuscle, string> = {
      Chest: 'Chest',
      Lats: 'Back', 'Upper back': 'Back', 'Lower back': 'Back',
      'Side delts': 'Shoulders', 'Rear delts': 'Shoulders',
      Biceps: 'Arms', Triceps: 'Arms', Forearms: 'Arms',
      Quads: 'Legs', Hamstrings: 'Legs', Glutes: 'Legs', Adductors: 'Legs', Calves: 'Legs',
      'Abs/core': 'Core',
    }
    for (const m of LANDMARK_MUSCLES) expect(familyOf(m)).toBe(expected[m])
  })

  it('keeps all 15 distinguishable', () => {
    expect(new Set(LANDMARK_MUSCLES.map(landmarkColor)).size).toBe(15)
  })

  /** A Legs landmark must read as blue, or the family hue is doing no work. */
  it('shares the family hue — every landmark leads on the same channel as its base', () => {
    for (const m of LANDMARK_MUSCLES) {
      expect(dominant(landmarkColor(m))).toBe(dominant(GROUP[familyOf(m)]))
    }
  })

  it('ramps light to dark within a family, so the order carries meaning', () => {
    for (const g of MUSCLE_GROUPS) {
      const ramp = familyRamp(g).map(lum)
      expect([...ramp].sort((a, b) => b - a)).toEqual(ramp)
    }
  })

  it('gives the five leg muscles five steps, not five unrelated colours', () => {
    expect(familyRamp('Legs')).toHaveLength(5)
    expect(familyRamp('Arms')).toHaveLength(3)
    expect(familyRamp('Shoulders')).toHaveLength(2)
    expect(familyRamp('Chest')).toHaveLength(1)
  })

  it('honours the two requested hues', () => {
    expect(landmarkColor('Hamstrings')).toBe(SAPPHIRE)   // Legs = blue
    expect(landmarkColor('Lats')).toBe(EMERALD)          // Back family = green
  })
})

/**
 * Per-exercise variation. Barbell Curl and Hammer Curl are both visibly Biceps,
 * and visibly not each other. Derived from a stable hash of the exercise name,
 * never from render order — the same lift must be the same colour on every
 * screen and every device.
 */
describe('exerciseColor — a nudge within the landmark, never a new hue', () => {
  it('is deterministic across calls', () => {
    expect(exerciseColor('Hammer Curl')).toBe(exerciseColor('Hammer Curl'))
  })

  it('separates two lifts that share a primary mover', () => {
    expect(exerciseColor('Hammer Curl')).not.toBe(exerciseColor('Preacher Curl'))
  })

  /**
   * The nudge is a nudge — one step toward white or black, which preserves the
   * ratio between channels and therefore the hue.
   */
  it('stays within one nudge of its own landmark step', () => {
    const cases: Array<[string, Parameters<typeof landmarkColor>[0]]> = [
      ['Hammer Curl', 'Biceps'],
      ['Preacher Curl', 'Biceps'],
      ['Hack Squat', 'Quads'],
      ['Lat Pulldown', 'Lats'],
      ['Face Pull', 'Rear delts'],
    ]
    for (const [name, landmark] of cases) {
      const c = channels(exerciseColor(name))
      const base = channels(landmarkColor(landmark))
      for (let i = 0; i < 3; i++) expect(Math.abs(c[i] - base[i])).toBeLessThanOrEqual(30)
    }
  })

  it('keeps every leg lift on the sapphire ramp, whichever step it lands on', () => {
    for (const n of ['Hack Squat', 'Seated Leg Curl', 'Leg Press']) {
      expect(dominant(exerciseColor(n))).toBe(dominant(SAPPHIRE))
    }
  })

  it('keeps every arm lift on the copper ramp', () => {
    for (const n of ['Hammer Curl', 'Preacher Curl', 'Triceps Pushdown']) {
      expect(dominant(exerciseColor(n))).toBe(dominant(COPPER))
    }
  })

  /**
   * `muscleMap.DICT` genuinely has no entry for some plain names — "Barbell
   * Curl" and "Bench Press" among them, which is a real gap in the mover
   * dictionary and not something colour should paper over. An unknown movement
   * gets the neutral; inventing a hue would file it under a family it may not
   * belong to, and the same resolution feeds set-credit arithmetic.
   */
  it('falls back to the neutral rather than inventing a hue for an unknown lift', () => {
    expect(exerciseColor('Underwater Basket Weaving')).toBe(STEEL)
    expect(exerciseColor('Barbell Curl')).toBe(STEEL)
  })

  it('reads the stored muscle_groups column when the name is unknown', () => {
    expect(exerciseColor('Underwater Basket Weaving', ['lats'])).not.toBe(STEEL)
    expect(dominant(exerciseColor('Underwater Basket Weaving', ['lats']))).toBe(dominant(EMERALD))
  })

  it('never lands on gold, at any nudge', () => {
    const names = ['Hammer Curl', 'Hack Squat', 'Face Pull', 'Cable Lateral Raise', 'Crunch Machine', 'Lat Pulldown']
    for (const n of names) expect(exerciseColor(n).toUpperCase()).not.toBe(GOLD)
  })

  it('produces a real hex every time', () => {
    for (const n of ['Lat Pulldown', 'Face Pull', 'Zzz Unknown']) {
      expect(exerciseColor(n)).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })
})
