import { describe, it, expect } from 'vitest'
import {
  buildBaselines, baselineIndex, detectSetPrs, detectSessionPrs, isPrIneligible,
  prAxisLabel, recordSets, EMPTY_BASELINES, type BaselineSetRow, type PrCandidateSet,
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

  it('flags Hip Thrust set 2 on reps AND e1rm', () => {
    expect(r.perSet[1].axes.sort()).toEqual(['e1rm', 'reps'])   // 13 > 12 @27.5 ; 39.4 > 38.5
  })

  it('does NOT flag set 3 — it only tied set 2, it did not beat it', () => {
    expect(r.perSet[2].axes).toEqual([])
  })

  it('does not flag the 25 kg opener — 14 reps only matched the old best', () => {
    expect(r.perSet[0].axes).toEqual([])
  })

  it('awards the session volume axis: 1065 kg beats the prior best of 985', () => {
    expect(r.volumeByKey.get(HIP)).toBe(1065)
    expect([...(r.axesByKey.get(HIP) ?? [])].sort()).toEqual(['e1rm', 'reps', 'volume'])
  })

  it('flags the 58 s Side Plank as a duration record, and not the 55 s set', () => {
    expect(r.perSet[3].axes).toEqual(['reps'])
    expect(r.perSet[4].axes).toEqual([])
    expect(prAxisLabel('reps', true)).toBe('DUR')
  })

  it('reports pr_count = 4 — three Hip Thrust axes plus the plank', () => {
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
  it('labels the four axes, with DUR standing in for reps on a timed hold', () => {
    expect(prAxisLabel('weight')).toBe('WT')
    expect(prAxisLabel('reps')).toBe('REPS')
    expect(prAxisLabel('reps', true)).toBe('DUR')
    expect(prAxisLabel('volume')).toBe('VOL')
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

  it('credits e1rm to the same set and carries its computed value', () => {
    const e = rec.get(HIP)!.get('e1rm')!
    expect(e.weightKg).toBe(27.5)
    expect(e.value).toBeCloseTo(39.4, 1)
  })

  it('gives the session-level volume axis the exercise total and no single set', () => {
    expect(rec.get(HIP)!.get('volume')).toEqual({ weightKg: 0, reps: 0, value: 1065 })
  })

  it('records a hold on seconds', () => {
    expect(rec.get(PLANK)!.get('reps')).toEqual({ weightKg: 0, reps: 58, value: 58 })
  })

  it('omits axes that were never won', () => {
    expect(rec.get(HIP)!.has('weight')).toBe(false)
  })
})
