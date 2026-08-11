import { describe, it, expect } from 'vitest'
import { PR_TRUTH, PR_TRUTH_AS_OF, PR_LOGGED, truthFloor, truthAxisValue, prFloorFor } from '@/lib/training/prTruth'
import { canonicalExerciseName } from '@/lib/exercises/aliases'
import { SEEDED_PRS } from '@/lib/training/prSeed'
import {
  buildBaselines, detectSessionPrs,
  type BaselineSetRow, type PrCandidateSet,
} from '@/lib/training/prEngine'

/**
 * Every exercise in `exercises` that has at least one logged set, introspected
 * from the live database on 2026-08-11. Exactly 30 rows, matching PR_TRUTH 1:1.
 *
 * This list is the point of the file. The table also holds 29 rows with ZERO
 * sets — `Calf Press (Machine)`, `Straight Arm Pulldown (Rope)`, a bare `Seated
 * Cable Row`, `Leg Extension (Machine)` and more — every one of which is a
 * plausible-looking name that would silently swallow a floor. A key that lands
 * on one of those floors nothing, and nothing about the app looks wrong until
 * the next heavy session flags a PR that is not one. That failure is invisible
 * by construction, so it is pinned here instead.
 *
 * To refresh:
 *   select e.name from exercises e
 *   join workout_sets ws on ws.exercise_id = e.id
 *   group by e.name order by e.name;
 */
const LOGGED_EXERCISES = [
  'Cable Overhead Extension',
  'Calf Press',
  'Chest Press (Machine)',
  'Crunch Machine',
  'DB Hammer Curl',
  'DB Shoulder Press',
  'Face Pull',
  'Hack Squat',
  'Hanging Knee Raise',
  'Hip Thrust (Machine)',
  'Incline DB Press',
  'Lat Pulldown',
  'Leg Extension',
  'Leg Press',
  'Neutral-Grip Lat Pulldown',
  'Pec Deck',
  'Preacher Curl (Machine)',
  'Reverse Crunch',
  'Reverse EZ-Bar Curl',
  'Romanian Deadlift (DB)',
  'Rope Triceps Pushdown',
  'Seated Cable Row (V-Grip)',
  'Seated Cable Row (Wide Grip)',
  'Seated Incline DB Curl',
  'Seated Leg Curl',
  'Side Plank',
  'Single Arm Cable Crossover',
  'Single Arm Lateral Raise (Cable)',
  'Single Arm Triceps Pushdown (Cable)',
  'Straight-Arm Pulldown',
] as const

describe('the asserted record book — keys', () => {
  it('covers every exercise that has ever been logged, and nothing else', () => {
    expect(Object.keys(PR_TRUTH).sort()).toEqual([...LOGGED_EXERCISES].sort())
  })

  it('every key is already canonical — no key is an alias of another name', () => {
    for (const key of Object.keys(PR_TRUTH)) {
      expect(canonicalExerciseName(key)).toBe(key)
    }
  })

  it('agrees with the seed on how an exercise is spelled', () => {
    // prSeed's names are known-good — they resolve against real logged sets.
    // Any overlap must spell the exercise identically or the two books floor
    // and assert different things under the same trophy.
    for (const p of SEEDED_PRS) {
      const name = canonicalExerciseName(p.exercise)
      expect(LOGGED_EXERCISES).toContain(name)
    }
  })

  it('is dated, so a stale book is visible rather than assumed current', () => {
    expect(PR_TRUTH_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('the asserted record book — shape', () => {
  it('gives every loaded exercise all four loaded axes', () => {
    const unloaded = new Set(['Reverse Crunch', 'Hanging Knee Raise', 'Side Plank'])
    for (const [name, rec] of Object.entries(PR_TRUTH)) {
      if (unloaded.has(name)) continue
      expect(rec.weight, name).toBeGreaterThan(0)
      expect(rec.e1rm, name).toBeGreaterThan(0)
      expect(rec.setVolume, name).toBeDefined()
      expect(rec.sessionVolume, name).toBeGreaterThan(0)
    }
  })

  it('gives unloaded work reps or seconds, and no loaded axis at all', () => {
    for (const name of ['Reverse Crunch', 'Hanging Knee Raise', 'Side Plank']) {
      const rec = PR_TRUTH[name]
      expect(rec.weight, name).toBeUndefined()
      expect(rec.e1rm, name).toBeUndefined()
      expect(rec.setVolume, name).toBeUndefined()
      // At zero load a session's tonnage is zero, so the axis cannot mean
      // anything there. Session REPS is recorded instead, as reference only.
      expect(rec.sessionVolume, name).toBeUndefined()
      expect(rec.reps ?? rec.seconds, name).toBeGreaterThan(0)
    }
  })

  it('never asserts a set volume above the session that contained it', () => {
    for (const [name, rec] of Object.entries(PR_TRUTH)) {
      if (!rec.setVolume || rec.sessionVolume == null) continue
      const set = rec.setVolume.kg * rec.setVolume.reps
      expect(set, name).toBeLessThanOrEqual(rec.sessionVolume)
    }
  })

  it('never asserts a set heavier than the exercise max', () => {
    for (const [name, rec] of Object.entries(PR_TRUTH)) {
      if (!rec.setVolume || rec.weight == null) continue
      expect(rec.setVolume.kg, name).toBeLessThanOrEqual(rec.weight)
    }
  })

  /**
   * Hevy's 1RM is not Epley — Calf Press asserts 100.75 where epley1RM(67.5, 15)
   * is 101.3. `prFloorFor` handles the divergence; this pins that it stays SMALL.
   * If a future edit lands a 1RM several kilos off Epley on its own stated set,
   * one of the two numbers is wrong and the book should not be trusted until it
   * is worked out which.
   */
  it('keeps the asserted 1RM within a kilo of Epley on the asserted best set', () => {
    for (const [name, rec] of Object.entries(PR_TRUTH)) {
      if (!rec.setVolume || rec.e1rm == null) continue
      const epley = rec.setVolume.kg * (1 + rec.setVolume.reps / 30)
      // Only meaningful when the best set IS the 1RM set; a heavier low-rep set
      // legitimately produces a higher estimate, so this is one-sided.
      if (rec.e1rm > epley) continue
      expect(epley - rec.e1rm, name).toBeLessThan(1)
    }
  })
})

describe('truthAxisValue', () => {
  it('resolves a stored set to its product for the volume axis', () => {
    expect(truthAxisValue(PR_TRUTH['Calf Press'], 'volume')).toBe(1012.5)
  })
  it('reads a timed hold and an unloaded rep count off the same axis', () => {
    expect(truthAxisValue(PR_TRUTH['Side Plank'], 'reps')).toBe(60)
    expect(truthAxisValue(PR_TRUTH['Reverse Crunch'], 'reps')).toBe(18)
  })
  it('says nothing where the book says nothing', () => {
    expect(truthAxisValue(PR_TRUTH['Side Plank'], 'weight')).toBeUndefined()
    expect(truthAxisValue(undefined, 'weight')).toBeUndefined()
  })
  it('truthFloor tolerates a name the book has never heard of', () => {
    expect(truthFloor('Zercher Squat')).toBeUndefined()
    expect(truthFloor(null)).toBeUndefined()
    expect(truthFloor(undefined)).toBeUndefined()
  })
})

/**
 * THE MISTAKE THIS SUITE EXISTS TO PREVENT A SECOND TIME.
 *
 * The book is dated 2026-08-10 and therefore already contains everything set in
 * the four weeks Helix can see. Feeding it straight to `buildBaselines` floors
 * a record at the value that record itself established, so the session that set
 * it stops counting. The first backfill dry run withdrew 13 flags and only ONE
 * was the Calf Press false positive; the other twelve were Side Plank's 60 s,
 * Hip Thrust 27.5 × 14, Reverse Crunch × 18 and nine more like them.
 *
 * `prFloorFor` nets the book against `PR_LOGGED` so only the genuine pre-July
 * excess ever raises a bar.
 */
describe('the floor is the EXCESS over what Helix already logged', () => {
  it('asserts nothing where the book merely equals the logged history', () => {
    for (const [name, logged] of Object.entries(PR_LOGGED)) {
      const f = prFloorFor(name)
      if (!f) continue
      if (f.weight != null) expect(f.weight, `${name} weight`).toBeGreaterThan(logged.weight ?? 0)
      if (f.volume != null) expect(f.volume, `${name} volume`).toBeGreaterThan(logged.volume ?? 0)
      if (f.sessionVolume != null) expect(f.sessionVolume, `${name} sessionVolume`).toBeGreaterThan(logged.sessionVolume ?? 0)
      if (f.e1rm != null) expect(f.e1rm, `${name} e1rm`).toBeGreaterThan(logged.e1rm ?? 0)
      if (f.reps != null) expect(f.reps, `${name} reps`).toBeGreaterThan(logged.reps ?? 0)
      if (f.seconds != null) expect(f.seconds, `${name} seconds`).toBeGreaterThan(logged.seconds ?? 0)
    }
  })

  it.each([
    ['Side Plank', 'seconds'],
    ['Reverse Crunch', 'reps'],
    ['Hanging Knee Raise', 'reps'],
  ] as const)('%s has no %s floor — its record was set inside the window', (name, axis) => {
    expect(prFloorFor(name)?.[axis]).toBeUndefined()
  })

  it.each([
    'Hip Thrust (Machine)', 'Incline DB Press', 'Chest Press (Machine)',
    'Hack Squat', 'Crunch Machine', 'Romanian Deadlift (DB)',
    'Neutral-Grip Lat Pulldown', 'Seated Cable Row (Wide Grip)',
    'Preacher Curl (Machine)', 'DB Hammer Curl', 'Seated Incline DB Curl',
    'Single Arm Cable Crossover', 'Single Arm Lateral Raise (Cable)',
  ])('%s gets no 1RM floor from estimator noise', (name) => {
    // Hevy's estimate runs a few hundred grams above Epley on these, which is
    // the same size as a real e1RM advance. Trusting it suppressed six genuine
    // records. The floor only takes Hevy's figure when the max-weight set is
    // one Helix demonstrably never saw — i.e. when `weight` also floors.
    const f = prFloorFor(name)
    expect(f?.e1rm).toBeUndefined()
  })

  it.each([
    ['Leg Press', 109.59],
    ['Lat Pulldown', 67.81],
    ['Leg Extension', 59.86],
    ['Seated Leg Curl', 73.53],
  ] as const)('%s keeps its real 1RM floor', (name, value) => {
    // These all floor on `weight` too, so the estimate belongs to a set Helix
    // never saw and can be trusted whole.
    expect(prFloorFor(name)?.e1rm).toBe(value)
  })

  it.each([
    ['Rope Triceps Pushdown', 22.5],
    ['Seated Cable Row (V-Grip)', 62.3],
  ] as const)('%s floors its 1RM from Epley on the asserted set', (name, value) => {
    // Max weight is already logged here, so Hevy's number is not trusted — but
    // the asserted best SET is one Helix never saw, and Epley on it is directly
    // comparable to what detection produces.
    expect(prFloorFor(name)?.e1rm).toBeCloseTo(value, 1)
  })
})

// ── The regression this whole file exists for ────────────────────────────────

const CALF = 'Calf Press'
const isTimed = (k: string) => k === 'Side Plank'
const floor = (k: string) => prFloorFor(k)

/** Calf Press as Helix actually holds it: 24 sets, nothing above 67.5 kg. */
const CALF_HISTORY: BaselineSetRow[] = [
  { key: CALF, weightKg: 65, reps: 15 },
  { key: CALF, weightKg: 67.5, reps: 14 },
  { key: CALF, weightKg: 67.5, reps: 13 },
  { key: CALF, weightKg: 67.5, reps: 15 },
  { key: CALF, weightKg: 67.5, reps: 13 },
  { key: CALF, weightKg: 67.5, reps: 12 },
]

const set = (weightKg: number, reps: number, extra: Partial<PrCandidateSet> = {}): PrCandidateSet =>
  ({ key: CALF, weightKg, reps, timed: false, setType: null, date: '2026-08-10', ...extra })

describe('2026-08-10 Calf Press — the false positive', () => {
  it('WITHOUT the floor, 70 kg is flagged a Weight PR', () => {
    // Not a bug in the engine. On the evidence available it is a record: Helix
    // has never seen this athlete above 67.5 kg, because the four months in
    // which they lifted 72.5 are 75 sessions with zero sets.
    const baselines = buildBaselines(CALF_HISTORY, isTimed)
    const r = detectSessionPrs([set(70, 12), set(70, 13), set(70, 13)], baselines)
    expect(r.perSet[0].axes).toContain('weight')
  })

  it('WITH the floor, it is not — 70 < the asserted 72.5', () => {
    const baselines = buildBaselines(CALF_HISTORY, isTimed, floor)
    const r = detectSessionPrs([set(70, 12), set(70, 13), set(70, 13)], baselines)
    for (const d of r.perSet) expect(d.axes).not.toContain('weight')
  })

  it('a genuine record still fires — 75 kg beats the asserted best', () => {
    const baselines = buildBaselines(CALF_HISTORY, isTimed, floor)
    const r = detectSessionPrs([set(75, 12)], baselines)
    expect(r.perSet[0].axes).toContain('weight')
  })

  it('the floor holds every axis independently — one can clear while another does not', () => {
    const baselines = buildBaselines(CALF_HISTORY, isTimed, floor)
    const r = detectSessionPrs([set(70, 14)], baselines)
    const axes = r.perSet[0].axes
    // Weight: 70 < asserted 72.5 — no.
    expect(axes).not.toContain('weight')
    // Volume: 70 × 14 = 980 < asserted 1,012.5 — no.
    expect(axes).not.toContain('volume')
    // 1RM: epley1RM(70, 14) = 102.7 > asserted 100.75 — YES, and correctly so.
    // A set can be a genuine estimated-1RM record without being the heaviest
    // load or the biggest set; that is the whole reason the axes are separate,
    // and flooring must not collapse them into one verdict.
    expect(axes).toContain('e1rm')
  })
})

describe('the floor across the other exercises it was primed to break', () => {
  const cases: Array<{ name: string; logged: number; asserted: number; comeback: number }> = [
    { name: 'Leg Press',                 logged: 72.5,  asserted: 80,    comeback: 75 },
    { name: 'Leg Extension',             logged: 37.5,  asserted: 42.5,  comeback: 40 },
    { name: 'Seated Leg Curl',           logged: 45,    asserted: 50,    comeback: 47.5 },
    { name: 'Pec Deck',                  logged: 52.5,  asserted: 55,    comeback: 55 },
    { name: 'Lat Pulldown',              logged: 47,    asserted: 49.5,  comeback: 49.5 },
    { name: 'Straight-Arm Pulldown',     logged: 16.25, asserted: 17.5,  comeback: 17.5 },
    { name: 'Cable Overhead Extension',  logged: 11.25, asserted: 12.5,  comeback: 12.5 },
    { name: 'DB Shoulder Press',         logged: 30,    asserted: 31,    comeback: 31 },
  ]

  it.each(cases)('$name: returning to $comeback kg is not a record', ({ name, logged, asserted, comeback }) => {
    expect(PR_TRUTH[name].weight).toBe(asserted)
    const history: BaselineSetRow[] = [{ key: name, weightKg: logged, reps: 12 }]
    const baselines = buildBaselines(history, () => false, floor)
    const r = detectSessionPrs(
      [{ key: name, weightKg: comeback, reps: 10, timed: false, setType: null, date: '2026-08-12' }],
      baselines,
    )
    expect(r.perSet[0].axes).not.toContain('weight')
  })

  it.each(cases)('$name: beating $asserted kg still is', ({ name, logged, asserted }) => {
    const history: BaselineSetRow[] = [{ key: name, weightKg: logged, reps: 12 }]
    const baselines = buildBaselines(history, () => false, floor)
    const r = detectSessionPrs(
      [{ key: name, weightKg: asserted + 2.5, reps: 10, timed: false, setType: null, date: '2026-08-12' }],
      baselines,
    )
    expect(r.perSet[0].axes).toContain('weight')
  })
})

