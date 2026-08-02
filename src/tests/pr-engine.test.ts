import { describe, it, expect } from 'vitest'
import {
  buildBaselines, baselineIndex, detectSetPrs, detectSessionPrs, isPrIneligible,
  prAxisLabel, recordSets, e1rmEligible,
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
  { key: HIP, weightKg: 25, reps: 14, sessionId: 's1' },
  { key: HIP, weightKg: 25, reps: 13, sessionId: 's1' },
  { key: HIP, weightKg: 25, reps: 12, sessionId: 's1' },
  { key: PLANK, weightKg: 0, reps: 55, sessionId: 's1' },
  { key: PLANK, weightKg: 0, reps: 52, sessionId: 's1' },
  // 2026-07-24
  { key: HIP, weightKg: 25, reps: 13, sessionId: 's2' },
  { key: HIP, weightKg: 27.5, reps: 12, sessionId: 's2' },
  { key: HIP, weightKg: 27.5, reps: 12, sessionId: 's2' },
  { key: PLANK, weightKg: 0, reps: 57, sessionId: 's2' },
  { key: PLANK, weightKg: 0, reps: 54, sessionId: 's2' },
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

  it('rolls per-session volume, keeping the best single session', () => {
    // s1 = 25×(14+13+12) = 975 ; s2 = 25×13 + 27.5×12 + 27.5×12 = 985
    expect(idx.bestSessionVolume.get(HIP)).toBe(985)
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
    // 13 > 12 at 27.5 kg, and Epley then reads 39.4 > 38.5 — which it cannot
    // fail to do, since e1RM is weight × (1 + reps/30). Subsumption used to
    // drop the e1RM for exactly that reason; it was removed on 2026-08-02
    // because the user's own record book files both. See prEngine.
    expect(r.perSet[1].axes.sort()).toEqual(['e1rm', 'reps'])
  })

  it('gives set 3 only the session-volume badge — it tied set 2 on every set axis', () => {
    // The volume axis is session-level, so it lands on the exercise's LAST
    // eligible set purely to have somewhere a trophy can render.
    expect(r.perSet[2].axes).toEqual(['volume'])
  })

  it('does not flag the 25 kg opener — 14 reps only matched the old best', () => {
    expect(r.perSet[0].axes).toEqual([])
  })

  it('counts the session volume too — 1065 beats the prior best of 985', () => {
    expect(r.volumeByKey.get(HIP)).toBe(1065)
    expect([...(r.axesByKey.get(HIP) ?? [])].sort()).toEqual(['e1rm', 'reps', 'volume'])
  })

  it('flags the 58 s Side Plank as a duration record, and not the 55 s set', () => {
    expect(r.perSet[3].axes).toEqual(['reps'])
    expect(r.perSet[4].axes).toEqual([])
    expect(prAxisLabel('reps', true)).toBe('Duration')
  })

  it('reports pr_count = 4 — reps + e1rm + volume on the hip thrust, duration on the plank', () => {
    // This fixture is date-less, so it runs through live detection. The REAL
    // 2026-07-31 session is inside the seeded era and is governed by prSeed
    // instead, where it reads 3.
    expect(r.prCount).toBe(4)
  })

  it('nulls est-1RM for a hold so no report prints "e1RM 0kg" on a plank', () => {
    expect(r.perSet[3].est1rm).toBeNull()
    expect(r.perSet[1].est1rm).toBeCloseTo(39.4, 1)
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

  it('keeps ineligible sets out of the volume operand too', () => {
    // 30 padding warm-up sets must not manufacture a volume record.
    const pad = Array.from({ length: 30 }, () => set(HIP, 25, 12, { setType: 'warmup' }))
    const r = detectSessionPrs(pad, baselines)
    expect(r.volumeByKey.get(HIP)).toBeUndefined()
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

  // Regression: the ledger used to store the session MAXIMUM per field, so the
  // reps record read "14 @ 25kg" — a number already hit on 07-17, and not the
  // set that earned the axis (13 @ 27.5kg beat the 12 previously done there).
  it('credits the reps axis to 27.5kg × 13, not the higher-rep 25kg × 14 set', () => {
    expect(rec.get(HIP)!.get('reps')).toEqual({ weightKg: 27.5, reps: 13, value: 13 })
  })

  it('files the e1rm against the set that won it, and volume as a session total', () => {
    // Raw counting keeps both. The e1rm must still be credited to 27.5 x 13
    // rather than to the higher-rep opener, and volume carries no load of its
    // own because no single set earned it.
    expect(rec.get(HIP)!.get('e1rm')).toMatchObject({ weightKg: 27.5, reps: 13 })
    expect(rec.get(HIP)!.get('volume')).toMatchObject({ weightKg: 0, reps: 0 })
  })

  it('records a hold on seconds', () => {
    expect(rec.get(PLANK)!.get('reps')).toEqual({ weightKg: 0, reps: 58, value: 58 })
  })

  it('omits axes that were never won', () => {
    expect(rec.get(HIP)!.has('weight')).toBe(false)
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
    { key: HACK, weightKg: 60, reps: 8, sessionId: 'jul20', ...win },
    { key: HACK, weightKg: 40, reps: 14, sessionId: 'jul20', ...win },
  ]

  it('a sub-floor set does not raise the e1RM bar', () => {
    const idx = baselineIndex(buildBaselines(history, () => false))
    // 40×14 = 58.7 sets the bar; the 76.0 from 60×8 is excluded.
    expect(idx.bestE1rm.get(HACK)).toBeCloseTo(58.7, 1)
  })

  it('lets the in-window working set win the axis it deserves', () => {
    const baselines = buildBaselines(history, () => false)
    const res = detectSessionPrs([
      { key: HACK, weightKg: 50, reps: 12, timed: false, setType: null, ...win },
      { key: HACK, weightKg: 55, reps: 11, timed: false, setType: null, ...win },
    ], baselines)
    // 55 kg is under the 60 kg top load and 11 reps at 55 kg is a first, so
    // neither weight nor reps fires; e1RM does, alongside the session volume.
    expect(res.perSet[1].axes).toEqual(['e1rm', 'volume'])
    // Session volume 1205 also beats Jul 20's 1040 and is counted in its own
    // right under raw-axis counting.
    expect(res.volumeByKey.get(HACK)).toBe(1205)
    expect(res.axesByKey.get(HACK)?.has('volume')).toBe(true)
  })

  it('does NOT gate above the ceiling — beating it is the point', () => {
    // Leg Press Horizontal, window 8–12, logged at 13 reps: a real record.
    const LP = 'Leg Press Horizontal (Machine)'
    const w = { repFloor: 8, repCeiling: 12 }
    const baselines = buildBaselines(
      [{ key: LP, weightKg: 72.5, reps: 12, sessionId: 'prev', ...w }], () => false,
    )
    // Asserted on the raw detector: the axis IS won. Whether it survives into
    // the headline is `subsumeSetAxes`' business, tested separately.
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

describe('volume PRs are visible', () => {
  const EX = 'Leg Extension'
  const baselines = buildBaselines(
    [{ key: EX, weightKg: 30, reps: 10, sessionId: 'prev' }], () => false,
  )

  // 30×12 + 30×12 = 720 beats the 300 baseline, but no individual set beats
  // any per-set axis (same load, and 12 > 10 so reps@30 IS a PR — use a load
  // never seen before at lower reps to isolate volume).
  const res = detectSessionPrs([
    { key: EX, weightKg: 30, reps: 5, timed: false, setType: null },
    { key: EX, weightKg: 30, reps: 5, timed: false, setType: null },
    { key: EX, weightKg: 30, reps: 5, timed: false, setType: null },
  ], baselines)

  it('flags a set so the trophy has somewhere to live', () => {
    expect(res.axesByKey.get(EX)?.has('volume')).toBe(true)
    // The LAST eligible set completed the total, so it carries the axis.
    expect(res.perSet[2].axes).toContain('volume')
    expect(res.perSet[0].axes).not.toContain('volume')
  })

  it('records the SESSION TOTAL as the volume value, not the set e1RM', () => {
    const rec = recordSets([
      { key: EX, weightKg: 30, reps: 5, timed: false, setType: null },
      { key: EX, weightKg: 30, reps: 5, timed: false, setType: null },
      { key: EX, weightKg: 30, reps: 5, timed: false, setType: null },
    ], res).get(EX)?.get('volume')
    expect(rec?.value).toBe(450)
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
    const baselines = buildBaselines(
      [{ key: HAMMER, weightKg: 16, reps: 10, sessionId: 'prev' }], () => false,
    )
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
    const baselines = buildBaselines(
      [{ key: HAMMER, weightKg: 16, reps: 10, sessionId: 'prev' }], () => false,
    )
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
      { key: HACK, weightKg: 70, reps: 4, sessionId: 'prev', ...win },
      { key: HACK, weightKg: 45, reps: 10, sessionId: 'prev', ...win },
    ], () => false)
    const res = detectSessionPrs(sets, baselines)
    expect(res.perSet[0].axes).toEqual(['e1rm'])
    expect(res.perSet[1].axes).toEqual(['e1rm', 'volume'])
    expect(recordSets(sets, res).get(HACK)?.get('e1rm')?.value).toBeCloseTo(75.2, 1)
  })

  it('files the heaviest load for the weight axis', () => {
    const baselines = buildBaselines(
      [{ key: HACK, weightKg: 40, reps: 14, sessionId: 'prev', ...win }], () => false,
    )
    const res = detectSessionPrs(sets, baselines)
    expect(recordSets(sets, res).get(HACK)?.get('weight')?.value).toBe(55)
  })
})

/**
 * RAW AXES (2026-08-02). Subsumption was removed, so every axis a set beats is
 * counted — including an e1RM that is arithmetically implied by the reps record
 * beside it. These pin the behaviour so it cannot drift back silently.
 */
describe('raw axis counting — every axis beaten is counted', () => {
  const EX = 'Chest Press (Machine)'

  /** A 3-set prior session, so its volume total is out of reach of one set. */
  const priorSession = (weightKg: number, reps: number): BaselineSetRow[] =>
    [1, 2, 3].map(() => ({ key: EX, weightKg, reps, sessionId: 'prev' }))

  it('counts the implied e1rm alongside the reps record that produced it', () => {
    // This is the pair subsumption used to collapse: 12 > 10 at 37.5 kg is the
    // event, and Epley cannot fail to follow it. Both are counted now.
    const res = detectSessionPrs(
      [{ key: EX, weightKg: 37.5, reps: 12, timed: false, setType: null }],
      buildBaselines(priorSession(37.5, 10), () => false),
    )
    expect(res.perSet[0].axes.sort()).toEqual(['e1rm', 'reps'])
  })

  it('counts the implied e1rm alongside a heavier load', () => {
    const res = detectSessionPrs(
      [{ key: EX, weightKg: 37.5, reps: 12, timed: false, setType: null }],
      buildBaselines(priorSession(35, 12), () => false),
    )
    expect(res.perSet[0].axes.sort()).toEqual(['e1rm', 'weight'])
  })

  it('still awards a lone e1rm for a better load/rep trade', () => {
    // 55 × 12 = 77.0 beats the 76.0 of 60 × 8 while being lighter, and 55 kg
    // has no rep baseline of its own — so e1RM fires with nothing beside it.
    const baselines = buildBaselines([
      { key: EX, weightKg: 60, reps: 8, sessionId: 'prev' },
      { key: EX, weightKg: 60, reps: 8, sessionId: 'prev' },
      { key: EX, weightKg: 60, reps: 8, sessionId: 'prev' },
    ], () => false)
    const res = detectSessionPrs(
      [{ key: EX, weightKg: 55, reps: 12, timed: false, setType: null }], baselines,
    )
    expect(res.perSet[0].axes).toEqual(['e1rm'])
  })

  it('an added set with no set-level record still earns volume', () => {
    // Romanian Deadlift, 2026-07-31: 35 kg × 12 three times. No set beat
    // anything; the session total did, because there were more sets.
    const RDL = 'Romanian Deadlift (DB)'
    const baselines = buildBaselines([
      { key: RDL, weightKg: 35, reps: 12, sessionId: 'prev' },
      { key: RDL, weightKg: 35, reps: 12, sessionId: 'prev' },
    ], () => false)
    const sets: PrCandidateSet[] = [
      { key: RDL, weightKg: 35, reps: 12, timed: false, setType: null },
      { key: RDL, weightKg: 35, reps: 12, timed: false, setType: null },
      { key: RDL, weightKg: 35, reps: 12, timed: false, setType: null },
    ]
    const res = detectSessionPrs(sets, baselines)
    expect(res.volumeByKey.get(RDL)).toBe(1260)
    expect([...(res.axesByKey.get(RDL) ?? [])]).toEqual(['volume'])
    expect(res.prCount).toBe(1)
  })
})
