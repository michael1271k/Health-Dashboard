import { describe, it, expect } from 'vitest'
import {
  buildBaselines, baselineIndex, detectSetPrs, detectSessionPrs, isPrIneligible,
  prAxisLabel, recordSets, e1rmEligible, subsumeSetAxes, volumeIsIndependent,
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

  it('flags Hip Thrust set 2 on reps ONLY — the e1RM is the same fact restated', () => {
    // 13 > 12 at 27.5 kg is the record. Epley then reads 39.4 > 38.5, which it
    // cannot fail to do: e1RM is weight × (1 + reps/30), a pure function of the
    // two numbers `reps` already measured. Counting both put this one set in
    // the headline twice.
    expect(r.perSet[1].axes.sort()).toEqual(['reps'])
  })

  it('does NOT award set 3 anything — it only tied set 2', () => {
    expect(r.perSet[2].axes).toEqual([])
  })

  it('does not flag the 25 kg opener — 14 reps only matched the old best', () => {
    expect(r.perSet[0].axes).toEqual([])
  })

  it('computes the session volume but does not COUNT it — reps already did', () => {
    // 1065 beats the prior best of 985. It beats it *because* set 2 added a rep
    // at 27.5 kg, which `reps` has already recorded. A third badge for the same
    // rep is inflation, not information.
    expect(r.volumeByKey.get(HIP)).toBe(1065)
    expect([...(r.axesByKey.get(HIP) ?? [])].sort()).toEqual(['reps'])
  })

  it('flags the 58 s Side Plank as a duration record, and not the 55 s set', () => {
    expect(r.perSet[3].axes).toEqual(['reps'])
    expect(r.perSet[4].axes).toEqual([])
    expect(prAxisLabel('reps', true)).toBe('Duration')
  })

  it('reports pr_count = 2 — one Hip Thrust record and one plank record', () => {
    // Was 4 (reps + e1rm + volume + duration) for two things that happened.
    // The live 2026-07-31 session read 7 against 3.
    expect(r.prCount).toBe(2)
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

  it('does not file a redundant e1rm or volume row for the same rep', () => {
    expect(rec.get(HIP)!.has('e1rm')).toBe(false)
    expect(rec.get(HIP)!.has('volume')).toBe(false)
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
    // Nothing else on this set changed — 55 kg is under the 60 kg top load and
    // 11 reps at 55 kg is a first — so e1RM is the ONLY claim, and it stands.
    expect(res.perSet[1].axes).toEqual(['e1rm'])
    // Session volume (1205) also beats Jul 20's 1040, but it beats it because
    // of the same two sets, so it is not counted a second time.
    expect(res.volumeByKey.get(HACK)).toBe(1205)
    expect(res.axesByKey.get(HACK)?.has('volume')).toBe(false)
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

describe('historical (pre-Helix) overrides', () => {
  const HAMMER = 'DB Hammer Curl'

  it('flags a first-ever set the engine could never derive', () => {
    // 2026-07-21 was the first Helix hammer curl, so there is no baseline.
    const res = detectSessionPrs([{
      key: HAMMER, weightKg: 20, reps: 12, timed: false, setType: null,
      date: '2026-07-21', exerciseName: HAMMER, setNumber: 1,
    }], EMPTY_BASELINES)
    // The list asserts weight + volume + e1rm; `subsumeSetAxes` then drops the
    // e1rm, which is the same 20 kg × 12 counted a second time. Overrides are
    // asserted data, not an exemption from the counting rules.
    expect(res.perSet[0].axes.sort()).toEqual(['volume', 'weight'])
  })

  it('stops matching when the set is edited — no misattributed record', () => {
    const res = detectSessionPrs([{
      key: HAMMER, weightKg: 20, reps: 11, timed: false, setType: null,
      date: '2026-07-21', exerciseName: HAMMER, setNumber: 1,
    }], EMPTY_BASELINES)
    expect(res.perSet[0].axes).toEqual([])
  })

  it('does not fire on a different date', () => {
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
    expect(res.perSet[1].axes).toEqual(['e1rm'])
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
 * The over-count itself, isolated. `pr_count` reported ~40 a week and 7 for a
 * session with 3 achievements in it.
 */
describe('axis subsumption — one achievement, one record', () => {
  it('drops e1rm when the same set already won reps at its load', () => {
    expect(subsumeSetAxes(['reps', 'e1rm'])).toEqual(['reps'])
  })

  it('drops e1rm when the same set already won the weight axis', () => {
    expect(subsumeSetAxes(['weight', 'e1rm'])).toEqual(['weight'])
  })

  it('KEEPS a lone e1rm — a better load/rep trade is a separate fact', () => {
    // 55 kg × 11 beating 60 kg × 8 is not visible on any other axis.
    expect(subsumeSetAxes(['e1rm'])).toEqual(['e1rm'])
  })

  it('leaves weight + reps alone — a heavier load AND more reps on it is two things', () => {
    expect(subsumeSetAxes(['weight', 'reps'])).toEqual(['weight', 'reps'])
  })

  it('counts session volume only when no set won anything', () => {
    expect(volumeIsIndependent(false)).toBe(true)
    expect(volumeIsIndependent(true)).toBe(false)
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
