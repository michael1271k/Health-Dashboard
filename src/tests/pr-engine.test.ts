import { describe, it, expect } from 'vitest'
import {
  buildBaselines, baselineIndex, detectSetPrs, detectSessionPrs, isPrIneligible,
  prAxisLabel, recordSets, e1rmEligible, repsAxisEligible,
  EMPTY_BASELINES, type BaselineSetRow, type PrCandidateSet,
} from '@/lib/training/prEngine'

const HIP = 'Hip Thrust (Machine)'
const PLANK = 'Side Plank'
const isTimed = (k: string) => k === PLANK

const set = (key: string, weightKg: number, reps: number, extra: Partial<PrCandidateSet> = {}): PrCandidateSet =>
  ({ key, weightKg, reps, timed: isTimed(key), setType: null, ...extra })

/**
 * REAL DATA. These are the actual logged sets behind the July 31 report that
 * "PRs are missing": every one of them was in workout_sets already, but
 * isReentryWeek() (2026-07-19 → 08-01) suppressed detection entirely, so the
 * session saved with pr_count = 0 and personal_records empty.
 */
const HISTORY: BaselineSetRow[] = [
  // 2026-07-17
  { key: HIP, weightKg: 25, reps: 14 },
  { key: HIP, weightKg: 25, reps: 13 },
  { key: HIP, weightKg: 25, reps: 12 },
  { key: PLANK, weightKg: 0, reps: 55 },
  { key: PLANK, weightKg: 0, reps: 52 },
  // 2026-07-24
  { key: HIP, weightKg: 25, reps: 13 },
  { key: HIP, weightKg: 27.5, reps: 12 },
  { key: HIP, weightKg: 27.5, reps: 12 },
  { key: PLANK, weightKg: 0, reps: 57 },
  { key: PLANK, weightKg: 0, reps: 54 },
]

describe('buildBaselines', () => {
  const b = buildBaselines(HISTORY, isTimed)
  const idx = baselineIndex(b)

  it('takes the max per axis', () => {
    expect(idx.bestWeight.get(HIP)).toBe(27.5)
    expect(idx.bestRepsAtWeight.get(`${HIP}|25`)).toBe(14)
    expect(idx.bestRepsAtWeight.get(`${HIP}|27.5`)).toBe(12)
    expect(idx.bestE1rm.get(HIP)).toBeCloseTo(38.5, 1)   // 27.5 × (1 + 12/30)
  })

  it('scores a timed hold on SECONDS only — no weight/e1RM axes on a plank', () => {
    expect(idx.bestSeconds.get(PLANK)).toBe(57)
    expect(idx.bestWeight.has(PLANK)).toBe(false)
    expect(idx.bestE1rm.has(PLANK)).toBe(false)
  })

  it('keeps the heaviest SINGLE SET as the volume bar', () => {
    // 25×14 = 350 is the biggest one set ever done; 27.5×12 = 330 is not.
    expect(idx.bestSetVolume.get(HIP)).toBe(350)
  })

  /**
   * REGRESSION. The baseline used to sum every row, warm-ups included, while
   * the candidate session summed only eligible ones — so Leg Press's bar stood
   * at a number no working session could reach and its real record vanished
   * silently. A suppressed PR leaves no trace anywhere, which is why this is
   * pinned rather than left to the volume test above.
   */
  it('lets no warm-up or drop set raise ANY bar', () => {
    const i = baselineIndex(buildBaselines([
      { key: HIP, weightKg: 25, reps: 12 },
      { key: HIP, weightKg: 60, reps: 30, setType: 'warmup' },
      { key: HIP, weightKg: 55, reps: 30, setType: 'dropset' },
    ], isTimed))
    expect(i.bestWeight.get(HIP)).toBe(25)
    expect(i.bestSetVolume.get(HIP)).toBe(300)
    expect(i.bestE1rm.get(HIP)).toBeCloseTo(35, 1)
  })

  it('is JSON-safe — tuples survive the persisted-cache round-trip', () => {
    const restored = JSON.parse(JSON.stringify(b))
    expect(baselineIndex(restored).bestWeight.get(HIP)).toBe(27.5)
  })

  it('tolerates a legacy blob where the Maps serialized to {}', () => {
    const legacy = JSON.parse(JSON.stringify({ bestWeight: new Map([[HIP, 27.5]]) }))
    expect(() => baselineIndex(legacy)).not.toThrow()
    expect(baselineIndex(legacy).bestWeight.size).toBe(0)
  })
})

describe('the July 31 session — the records that went missing', () => {
  const baselines = buildBaselines(HISTORY, isTimed)
  // Exactly as logged, in order.
  const july31: PrCandidateSet[] = [
    set(HIP, 25, 14),
    set(HIP, 27.5, 13),
    set(HIP, 27.5, 13),
    set(PLANK, 0, 58),
    set(PLANK, 0, 55),
  ]
  const r = detectSessionPrs(july31, baselines)

  it('flags Hip Thrust set 2 on every axis it beat', () => {
    // 27.5 × 13 = 357.5 kg is the heaviest single set ever done here (350), and
    // Epley then reads 39.4 > 38.5. `reps` is NOT among them: 13 > 12 at 27.5 kg
    // is rep progression on a loaded lift, which stopped being an axis on
    // 2026-08-03. See `repsAxisEligible`.
    expect(r.perSet[1].axes.sort()).toEqual(['e1rm', 'volume'])
  })

  it('gives set 3 nothing — it tied set 2 on every axis', () => {
    // The engine absorbs as it goes, so the second 27.5 × 13 is judged against
    // the first and matches it. A tie is not a record.
    expect(r.perSet[2].axes).toEqual([])
  })

  it('does not flag the 25 kg opener — 14 reps only matched the old best', () => {
    expect(r.perSet[0].axes).toEqual([])
  })

  it('attributes both hip-thrust axes to one exercise', () => {
    expect([...(r.axesByKey.get(HIP) ?? [])].sort()).toEqual(['e1rm', 'volume'])
  })

  it('flags the 58 s Side Plank as a duration record, and not the 55 s set', () => {
    expect(r.perSet[3].axes).toEqual(['reps'])
    expect(r.perSet[4].axes).toEqual([])
    expect(prAxisLabel('reps', true)).toBe('Duration')
  })

  it('reports pr_count = 3 — volume + e1rm on the hip thrust, duration on the plank', () => {
    // This fixture is date-less, so it runs through live detection. The REAL
    // 2026-07-31 session is inside the seeded era and is governed by prSeed.
    expect(r.prCount).toBe(3)
  })

  it('nulls est-1RM for a hold so no report prints "e1RM 0kg" on a plank', () => {
    expect(r.perSet[3].est1rm).toBeNull()
    expect(r.perSet[1].est1rm).toBeCloseTo(39.4, 1)
  })
})

/**
 * The REPS axis is for unweighted work only (2026-08-03).
 *
 * On a loaded lift the load is the achievement and reps are the dial between
 * load jumps; the axis also triple-filed, since one extra rep at the same load
 * drags e1RM and tonnage along with it.
 */
describe('the reps axis applies to bodyweight work only', () => {
  const CRUNCH = 'Reverse Crunch'

  it('is decided purely by the absence of load', () => {
    expect(repsAxisEligible(0)).toBe(true)
    expect(repsAxisEligible(2.5)).toBe(false)
  })

  it('awards reps on a bodyweight set that beats its count', () => {
    const baselines = buildBaselines(
      [{ key: CRUNCH, weightKg: 0, reps: 15 }, { key: CRUNCH, weightKg: 0, reps: 15 }], () => false,
    )
    const res = detectSessionPrs([
      set(CRUNCH, 0, 17), set(CRUNCH, 0, 16), set(CRUNCH, 0, 15),
    ], baselines)
    expect(res.perSet[0].axes).toEqual(['reps'])
    // 16 beats the history but not the 17 logged moments earlier.
    expect(res.perSet[1].axes).toEqual([])
    expect(res.prCount).toBe(1)
  })

  it('withholds it from a loaded lift that added a rep at the same load', () => {
    // Hack Squat 2026-08-03: 55 × 12 after 55 × 11. It still wins the axes that
    // mean something — tonnage and e1RM — but "12 reps at 55 kg" is not a
    // fourth trophy.
    const HACK = 'Hack Squat'
    const win = { repFloor: 10, repCeiling: 12 }
    const baselines = buildBaselines([
      { key: HACK, weightKg: 55, reps: 11, ...win },
      { key: HACK, weightKg: 50, reps: 12, ...win },
    ], () => false)
    const res = detectSessionPrs([
      { key: HACK, weightKg: 55, reps: 12, timed: false, setType: null, ...win },
    ], baselines)
    expect(res.perSet[0].axes.sort()).toEqual(['e1rm', 'volume'])
  })
})

describe('eligibility rules', () => {
  const baselines = buildBaselines(HISTORY, isTimed)

  it('never awards a PR without an existing baseline — a first-ever log is not a record', () => {
    const r = detectSessionPrs([set('Brand New Lift', 100, 20)], EMPTY_BASELINES)
    expect(r.perSet[0].axes).toEqual([])
    expect(r.prCount).toBe(0)
  })

  it('excludes warm-ups and drop sets from records', () => {
    expect(isPrIneligible('warmup')).toBe(true)
    expect(isPrIneligible('dropset')).toBe(true)
    expect(isPrIneligible('failure')).toBe(false)
    expect(isPrIneligible(null)).toBe(false)

    const r = detectSessionPrs([
      set(HIP, 40, 20, { setType: 'warmup' }),
      set(HIP, 40, 20, { setType: 'dropset' }),
    ], baselines)
    expect(r.perSet[0].axes).toEqual([])
    expect(r.perSet[1].axes).toEqual([])
    expect(r.prCount).toBe(0)
  })

  it('cannot manufacture a volume record by padding a session', () => {
    // 30 padding warm-up sets. Under the old session-total axis this was the
    // failure mode worth guarding; under a per-set axis it cannot arise at all,
    // and the guard stays pinned either way.
    const pad = Array.from({ length: 30 }, () => set(HIP, 25, 12, { setType: 'warmup' }))
    const r = detectSessionPrs(pad, baselines)
    expect(r.axesByKey.has(HIP)).toBe(false)
  })

  it('awards the weight axis when the load itself is beaten', () => {
    const r = detectSessionPrs([set(HIP, 30, 8)], baselines)
    expect(r.perSet[0].axes).toContain('weight')
  })

  it('detectSetPrs is stateless — the same set twice against a fixed index agrees', () => {
    const idx = baselineIndex(baselines)
    const s = set(HIP, 27.5, 13)
    expect(detectSetPrs(s, idx)).toEqual(detectSetPrs(s, idx))
  })
})

describe('prAxisLabel', () => {
  // Whole words. The abbreviations saved a few pixels and cost the meaning,
  // and the badge already carries a trophy to say "record".
  it('labels the four axes, with Duration standing in for reps on a timed hold', () => {
    expect(prAxisLabel('weight')).toBe('Weight')
    expect(prAxisLabel('reps')).toBe('Reps')
    expect(prAxisLabel('reps', true)).toBe('Duration')
    expect(prAxisLabel('volume')).toBe('Volume')
    expect(prAxisLabel('e1rm')).toBe('1RM')
  })
})

describe('recordSets — the ledger attributes each axis to the set that won it', () => {
  const baselines = buildBaselines(HISTORY, isTimed)
  const july31: PrCandidateSet[] = [
    set(HIP, 25, 14),
    set(HIP, 27.5, 13),
    set(HIP, 27.5, 13),
    set(PLANK, 0, 58),
  ]
  const r = detectSessionPrs(july31, baselines)
  const rec = recordSets(july31, r)

  // Regression: the ledger used to store the session MAXIMUM per field, so a
  // record could be filed against a set that never earned it.
  it('files both axes against 27.5 kg × 13, the set that won them', () => {
    expect(rec.get(HIP)!.get('e1rm')).toMatchObject({ weightKg: 27.5, reps: 13 })
    expect(rec.get(HIP)!.get('volume')).toEqual({ weightKg: 27.5, reps: 13, value: 357.5 })
  })

  it('records a hold on seconds', () => {
    expect(rec.get(PLANK)!.get('reps')).toEqual({ weightKg: 0, reps: 58, value: 58 })
  })

  it('omits axes that were never won', () => {
    expect(rec.get(HIP)!.has('weight')).toBe(false)
    expect(rec.get(HIP)!.has('reps')).toBe(false)
  })
})

/**
 * The e1RM axis is gated on the FLOOR of the programmed rep window, not the
 * ceiling. Real numbers: Hack Squat is programmed 10–12.
 */
describe('e1rm rep-window gate', () => {
  const HACK = 'Hack Squat'
  const win = { repFloor: 10, repCeiling: 12 }

  // 2026-07-20: 60kg × 8 is BELOW the floor — a strength test, not the
  // programmed stimulus. Epley scores it 76.0.
  // 2026-07-27: 55kg × 11 is IN the window and far harder work, at 75.2.
  const history: BaselineSetRow[] = [
    { key: HACK, weightKg: 60, reps: 8, ...win },
    { key: HACK, weightKg: 40, reps: 14, ...win },
  ]

  it('a sub-floor set does not raise the e1RM bar', () => {
    const idx = baselineIndex(buildBaselines(history, () => false))
    // 40×14 = 58.7 sets the bar; the 76.0 from 60×8 is excluded.
    expect(idx.bestE1rm.get(HACK)).toBeCloseTo(58.7, 1)
    // It still counts for weight and tonnage, where it is not extrapolated.
    expect(idx.bestWeight.get(HACK)).toBe(60)
    expect(idx.bestSetVolume.get(HACK)).toBe(560)
  })

  it('lets the in-window working set win the axis it deserves', () => {
    const baselines = buildBaselines(history, () => false)
    const res = detectSessionPrs([
      { key: HACK, weightKg: 50, reps: 12, timed: false, setType: null, ...win },
      { key: HACK, weightKg: 55, reps: 11, timed: false, setType: null, ...win },
    ], baselines)
    // 55 kg is under the 60 kg top load so `weight` never fires; e1RM does, and
    // each set out-tonnages the one before it (560 → 600 → 605).
    expect(res.perSet[0].axes).toEqual(['volume', 'e1rm'])
    expect(res.perSet[1].axes).toEqual(['volume', 'e1rm'])
    expect([...(res.axesByKey.get(HACK) ?? [])].sort()).toEqual(['e1rm', 'volume'])
    expect(res.prCount).toBe(2)
  })

  it('does NOT gate above the ceiling — beating it is the point', () => {
    // Leg Press Horizontal, window 8–12, logged at 13 reps: a real record.
    const LP = 'Leg Press Horizontal (Machine)'
    const w = { repFloor: 8, repCeiling: 12 }
    const baselines = buildBaselines([{ key: LP, weightKg: 72.5, reps: 12, ...w }], () => false)
    const idx = baselineIndex(baselines)
    expect(detectSetPrs({ key: LP, weightKg: 72.5, reps: 13, timed: false, setType: null, ...w }, idx))
      .toContain('e1rm')
  })

  it('with no programmed window, only very low reps are excluded', () => {
    expect(e1rmEligible(3)).toBe(false)
    expect(e1rmEligible(8)).toBe(true)
    expect(e1rmEligible(20)).toBe(true)
  })
})

/**
 * VOLUME IS PER-SET (2026-08-03). It was the exercise's session total, pinned
 * to whichever set happened to be last — so on 2026-08-03 Hack Squat's badge
 * sat on 55 kg × 11 while 55 kg × 12 stood beside it unmarked, and Leg
 * Extension's sat on the 12-rep set below its own two 13s.
 */
describe('the volume axis lands on the set that lifted it', () => {
  const EX = 'Leg Extension'
  // 60 kg × 5 = 300 kg in one set, with an e1RM (70.0) high enough that nothing
  // below can win that axis — so `volume` is observed in isolation.
  const baselines = buildBaselines([{ key: EX, weightKg: 60, reps: 5 }], () => false)
  const sets: PrCandidateSet[] = [
    { key: EX, weightKg: 30, reps: 12, timed: false, setType: null },   // 360
    { key: EX, weightKg: 30, reps: 11, timed: false, setType: null },   // 330
  ]
  const res = detectSessionPrs(sets, baselines)

  it('flags the HEAVIEST set, not the last one', () => {
    expect(res.perSet[0].axes).toEqual(['volume'])
    expect(res.perSet[1].axes).toEqual([])
  })

  it('files the winning set’s own tonnage as the value', () => {
    expect(recordSets(sets, res).get(EX)?.get('volume')).toEqual({ weightKg: 30, reps: 12, value: 360 })
  })

  it('a third identical set is no longer a record on its own', () => {
    // The old session-total axis turned "same work, one more set" into a PR,
    // which is how a routine session produced five volume trophies.
    const RDL = 'Romanian Deadlift (DB)'
    const prior = buildBaselines([
      { key: RDL, weightKg: 35, reps: 12 },
      { key: RDL, weightKg: 35, reps: 12 },
    ], () => false)
    const three: PrCandidateSet[] = [1, 2, 3].map(() =>
      ({ key: RDL, weightKg: 35, reps: 12, timed: false, setType: null }))
    expect(detectSessionPrs(three, prior).prCount).toBe(0)
  })

  it('nor is one extra rep on one set of three', () => {
    // Leg Extension 2026-08-03: 37.5 × 13, 13, 12 against 37.5 × 13, 12, 12.
    // The session total rose 1387.5 → 1425 and used to award a PR; no single
    // set beat the 525 kg (35 × 15) already on the board.
    const prior = buildBaselines([
      // Jul 20
      { key: EX, weightKg: 37.5, reps: 12 },
      { key: EX, weightKg: 35, reps: 15 },
      { key: EX, weightKg: 37.5, reps: 11, setType: 'failure' },
      // Jul 27
      { key: EX, weightKg: 37.5, reps: 13 },
      { key: EX, weightKg: 37.5, reps: 12, setType: 'failure' },
      { key: EX, weightKg: 37.5, reps: 12 },
    ], () => false)
    const aug3: PrCandidateSet[] = [
      { key: EX, weightKg: 37.5, reps: 13, timed: false, setType: null },
      { key: EX, weightKg: 37.5, reps: 13, timed: false, setType: null },
      { key: EX, weightKg: 37.5, reps: 12, timed: false, setType: 'failure' },
    ]
    expect(detectSessionPrs(aug3, prior).axesByKey.has(EX)).toBe(false)
  })
})

describe('the seeded era is AUTHORITATIVE, not additive', () => {
  const HAMMER = 'DB Hammer Curl'

  it('flags a first-ever set the engine could never derive', () => {
    // 2026-07-21 was the first Helix hammer curl, so there is no baseline and
    // detection alone would award nothing.
    const res = detectSessionPrs([{
      key: HAMMER, weightKg: 20, reps: 12, timed: false, setType: null,
      date: '2026-07-21', exerciseName: HAMMER, setNumber: 1,
    }], EMPTY_BASELINES)
    expect(res.perSet[0].axes.sort()).toEqual(['e1rm', 'volume', 'weight'])
  })

  it('SUPPRESSES a record detection would otherwise have found', () => {
    // The load beats the baseline outright — before the seed this was a weight
    // PR. Inside the seeded era, a set that is not on the list earns nothing:
    // the list is the record book, not a supplement to one.
    const baselines = buildBaselines([{ key: HAMMER, weightKg: 16, reps: 10 }], () => false)
    const res = detectSessionPrs([{
      key: HAMMER, weightKg: 22.5, reps: 12, timed: false, setType: null,
      date: '2026-07-21', exerciseName: HAMMER, setNumber: 3,
    }], baselines)
    expect(res.perSet[0].axes).toEqual([])
    expect(res.prCount).toBe(0)
  })

  it('stops matching when the set is edited — no misattributed record', () => {
    const res = detectSessionPrs([{
      key: HAMMER, weightKg: 20, reps: 11, timed: false, setType: null,
      date: '2026-07-21', exerciseName: HAMMER, setNumber: 1,
    }], EMPTY_BASELINES)
    expect(res.perSet[0].axes).toEqual([])
  })

  it('hands control back to live detection after the cutoff', () => {
    const baselines = buildBaselines([{ key: HAMMER, weightKg: 16, reps: 10 }], () => false)
    const res = detectSessionPrs([{
      key: HAMMER, weightKg: 22.5, reps: 12, timed: false, setType: null,
      date: '2026-08-04', exerciseName: HAMMER, setNumber: 1,
    }], baselines)
    expect(res.perSet[0].axes).toContain('weight')
  })

  it('does not replay a seeded record on a later date', () => {
    const res = detectSessionPrs([{
      key: HAMMER, weightKg: 20, reps: 12, timed: false, setType: null,
      date: '2026-08-04', exerciseName: HAMMER, setNumber: 1,
    }], EMPTY_BASELINES)
    expect(res.perSet[0].axes).toEqual([])
  })
})

describe('recordSets when two sets win the same axis', () => {
  const HACK = 'Hack Squat'
  const win = { repFloor: 10, repCeiling: 12 }
  const sets: PrCandidateSet[] = [
    { key: HACK, weightKg: 50, reps: 12, timed: false, setType: null, ...win },
    { key: HACK, weightKg: 55, reps: 11, timed: false, setType: null, ...win },
  ]

  it('files the BEST e1RM, not the first one claimed', () => {
    // A 70 kg × 4 in the history puts the weight bar out of reach (so neither
    // set can claim `weight`) while being sub-floor, so it never set the e1RM
    // bar. 45×10 = 60.0 does. Then 50×12 = 70.0 is a record, and 55×11 = 75.2
    // beats it inside the same session — the engine absorbs as it goes, so both
    // legitimately win, and keeping the FIRST claimant filed a value that was
    // already beaten.
    const baselines = buildBaselines([
      { key: HACK, weightKg: 70, reps: 4, ...win },
      { key: HACK, weightKg: 45, reps: 10, ...win },
    ], () => false)
    const res = detectSessionPrs(sets, baselines)
    expect(res.perSet[0].axes).toEqual(['volume', 'e1rm'])
    expect(res.perSet[1].axes).toEqual(['volume', 'e1rm'])
    expect(recordSets(sets, res).get(HACK)?.get('e1rm')?.value).toBeCloseTo(75.2, 1)
  })

  it('files the heaviest load for the weight axis, and its tonnage with it', () => {
    const baselines = buildBaselines([{ key: HACK, weightKg: 40, reps: 14, ...win }], () => false)
    const res = detectSessionPrs(sets, baselines)
    const rec = recordSets(sets, res).get(HACK)
    expect(rec?.get('weight')?.value).toBe(55)
    expect(rec?.get('volume')?.value).toBe(605)
  })
})

/**
 * RAW AXES (2026-08-02). Subsumption was removed, so every axis a set beats is
 * counted — including an e1RM that is arithmetically implied by the tonnage
 * record beside it. These pin the behaviour so it cannot drift back silently.
 */
describe('raw axis counting — every axis beaten is counted', () => {
  const EX = 'Chest Press (Machine)'

  it('counts the implied e1rm alongside the tonnage record that produced it', () => {
    // 12 > 10 at 37.5 kg drags both tonnage (450 > 375) and Epley with it.
    // Neither is suppressed; `reps` is absent because the lift is loaded.
    const res = detectSessionPrs(
      [{ key: EX, weightKg: 37.5, reps: 12, timed: false, setType: null }],
      buildBaselines([{ key: EX, weightKg: 37.5, reps: 10 }], () => false),
    )
    expect(res.perSet[0].axes.sort()).toEqual(['e1rm', 'volume'])
  })

  it('counts all three when a heavier load also out-tonnages the old best', () => {
    const res = detectSessionPrs(
      [{ key: EX, weightKg: 37.5, reps: 12, timed: false, setType: null }],
      buildBaselines([{ key: EX, weightKg: 35, reps: 12 }], () => false),
    )
    expect(res.perSet[0].axes.sort()).toEqual(['e1rm', 'volume', 'weight'])
  })

  it('still awards a lone e1rm for a better load/rep trade', () => {
    // 55 × 8 is heavier per rep than 45 × 10 — e1RM 69.7 beats 60.0 — but it is
    // 440 kg against 450, so tonnage does not follow, and the 100 kg triple in
    // the history keeps the weight axis out of reach.
    const baselines = buildBaselines([
      { key: EX, weightKg: 100, reps: 3 },
      { key: EX, weightKg: 45, reps: 10 },
    ], () => false)
    const res = detectSessionPrs(
      [{ key: EX, weightKg: 55, reps: 8, timed: false, setType: null }], baselines,
    )
    expect(res.perSet[0].axes).toEqual(['e1rm'])
  })
})

/**
 * UNILATERAL VOLUME (2026-08-03). `sessionVolumeKg` has scored a two-sided set
 * at the WEAKER side counted twice since the asymmetry rule landed; the volume
 * AXIS still read each side as its own set. Two definitions of volume in one
 * app, and the axis had the wrong one — the strong side alone set the bar, and
 * both rows of one physical set could carry a trophy.
 */
describe('the volume axis obeys the unilateral rule', () => {
  const SA = 'Single Arm Lateral Raise (Cable)'
  const pair = (n: string, side: 'L' | 'R', w: number, reps: number): PrCandidateSet =>
    ({ key: SA, weightKg: w, reps, timed: false, setType: null, side, pairId: n })

  it('scores a pair at the WEAKER side, once — not at the strong one, not doubled', () => {
    // History: a clean 5 × 12 pair. ONE side's tonnage — 60 kg — because the
    // axis measures a working set, and the same set logged as a single unsided
    // row would also read 60.
    const baselines = buildBaselines([
      { key: SA, weightKg: 5, reps: 12, side: 'L', pairId: 'h1' },
      { key: SA, weightKg: 5, reps: 12, side: 'R', pairId: 'h1' },
    ], () => false)
    expect(baselineIndex(baselines).bestSetVolume.get(SA)).toBe(60)

    // Today: L 5 × 10, R 5 × 14. Per side the right arm shows 70 kg and would
    // "beat" 60; as a pair it is the weaker 5 × 10 = 50 — LESS than 60, so an
    // asymmetric session is correctly not a record.
    const res = detectSessionPrs([pair('t1', 'L', 5, 10), pair('t1', 'R', 5, 14)], baselines)
    expect(res.perSet[0].axes).not.toContain('volume')
    expect(res.perSet[1].axes).not.toContain('volume')
  })

  it('files the record ONCE, on the row that completes the pair', () => {
    const baselines = buildBaselines([
      { key: SA, weightKg: 5, reps: 10, side: 'L', pairId: 'h1' },
      { key: SA, weightKg: 5, reps: 10, side: 'R', pairId: 'h1' },
    ], () => false)   // bar = 50 kg
    // 5 × 12 = 60 > 50. One physical set, one trophy.
    const res = detectSessionPrs([pair('t1', 'L', 5, 12), pair('t1', 'R', 5, 12)], baselines)
    expect(res.perSet[0].axes).not.toContain('volume')
    expect(res.perSet[1].axes).toContain('volume')
    expect(res.axesByKey.get(SA)?.has('volume')).toBe(true)

    // …and the ledger stores the pair's collapsed tonnage, one side's worth.
    expect(recordSets([pair('t1', 'L', 5, 12), pair('t1', 'R', 5, 12)], res).get(SA)?.get('volume')?.value).toBe(60)
  })

  /**
   * THE 2026-08-05 BUG, as a test.
   *
   * Single Arm Lateral Raise (Cable) is logged both ways — paired L/R rows on
   * 2026-07-23, bare unsided rows on every other date. While the pair was
   * credited at 2 × the weaker side it set a 130 kg bar that no unsided row
   * could ever clear, so 5 kg × 17 (85 kg, a genuine best against every
   * comparable set) won the 1RM axis and silently lost volume in the same set.
   */
  it('compares paired and unsided logging of the same movement on one scale', () => {
    const baselines = buildBaselines([
      // 2026-07-23, logged as a pair: L 5 × 13, R 5 × 15 → the weaker side, 65.
      { key: SA, weightKg: 5, reps: 13, side: 'L', pairId: 'jul23' },
      { key: SA, weightKg: 5, reps: 15, side: 'R', pairId: 'jul23' },
      // 2026-07-28 / 07-30, logged unsided: 5 × 15 → 75.
      { key: SA, weightKg: 5, reps: 15 },
    ], () => false)
    expect(baselineIndex(baselines).bestSetVolume.get(SA)).toBe(75)

    // 2026-08-05: 5 kg × 17 = 85. Both axes, on one set.
    const res = detectSessionPrs(
      [{ key: SA, weightKg: 5, reps: 17, timed: false, setType: null }],
      baselines,
    )
    expect(res.perSet[0].axes).toContain('volume')
    expect(res.perSet[0].axes).toContain('e1rm')
  })

  it('scores a lone side on its own — real work, just not a pair', () => {
    const baselines = buildBaselines([{ key: SA, weightKg: 5, reps: 10 }], () => false)  // 50
    const res = detectSessionPrs(
      [{ key: SA, weightKg: 5, reps: 12, timed: false, setType: null, side: 'L', pairId: 'solo' }],
      baselines,
    )
    expect(res.perSet[0].axes).toContain('volume')   // 60 > 50
  })

  it('leaves bilateral sets exactly as they were', () => {
    const baselines = buildBaselines([{ key: HIP, weightKg: 25, reps: 12 }], isTimed)
    const res = detectSessionPrs([set(HIP, 25, 14)], baselines)
    expect(res.perSet[0].axes).toContain('volume')   // 350 > 300
  })
})

/**
 * EPLEY ON UNLOADED WORK. `weight × (1 + reps/30)` is 0 at 0 kg, and the app
 * printed that 0: "1RM 0" on a Reverse Crunch row, a flat zero PR-history
 * series, a permanently null trend. There is no one-rep max to estimate.
 */
describe('bodyweight sets carry no estimated 1RM', () => {
  const CRUNCH = 'Reverse Crunch'

  it('returns null rather than 0 for an unloaded set', () => {
    const res = detectSessionPrs(
      [{ key: CRUNCH, weightKg: 0, reps: 17, timed: false, setType: null }],
      buildBaselines([{ key: CRUNCH, weightKg: 0, reps: 15 }], () => false),
    )
    expect(res.perSet[0].est1rm).toBeNull()
    // The reps axis is the one that applies, and it still fires.
    expect(res.perSet[0].axes).toEqual(['reps'])
  })

  it('never lets a 0 kg set set or win the e1RM bar', () => {
    const idx = baselineIndex(buildBaselines([
      { key: CRUNCH, weightKg: 0, reps: 15 },
      // A stored est_1rm_kg of 0 from before the fix must not become a bar either.
      { key: CRUNCH, weightKg: 0, reps: 12, est1rm: 0 },
    ], () => false))
    expect(idx.bestE1rm.has(CRUNCH)).toBe(false)
    expect(detectSetPrs(
      { key: CRUNCH, weightKg: 0, reps: 40, timed: false, setType: null }, idx,
    )).not.toContain('e1rm')
  })
})
