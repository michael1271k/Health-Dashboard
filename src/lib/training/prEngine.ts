/**
 * The 4-axis personal-record engine — PURE. No Supabase, no React, no clock.
 *
 * WHY THIS IS ITS OWN MODULE
 * PR detection used to live inline inside `saveSession`, which meant the live
 * deck could not reuse it. A client-side reimplementation would inevitably drift
 * from the server's, and the failure mode is the worst kind: the app flashes a
 * PR badge when you tick the set, then saves the session without recording one
 * (or the reverse). One implementation, two callers.
 *
 * THE KEY IS GENERIC. Server-side the caller keys on `exercise_id` (UUID);
 * client-side the live deck only has exercise NAMES. Both work — the engine
 * never interprets the key, it only groups by it.
 *
 * RE-ENTRY WEEKS ARE NOT GATED HERE. A deload week used to suppress PR
 * detection outright, which silently ate real records (July 31: Hip Thrust
 * 27.5kg × 13 and a 58s Side Plank, both genuine, both unflagged). Beating a
 * baseline is objectively true whatever the programming intent — re-entry
 * suppression belongs on the *coaching* side (progression/regression alerts),
 * not on the record itself.
 */
import { epley1RM } from '@/lib/utils/epley'
import { historicalAxesFor } from './historicalPrs'

export type PrAxis = 'weight' | 'reps' | 'volume' | 'e1rm'

/** A historical set row, pre-session. `est1rm` may be absent — it's recomputed. */
export interface BaselineSetRow {
  key: string
  weightKg: number | null
  reps: number | null
  est1rm?: number | null
  sessionId?: string | null
  /** Floor of the programmed rep window — gates whether this row sets the e1RM bar. */
  repFloor?: number | null
}

/**
 * Baselines as TUPLES, not Maps.
 *
 * This crosses a React Query boundary on the client, and the query cache
 * persists to localStorage as JSON. A Map dehydrates to `{}` and rehydrates
 * without `.get()` — the crash family QueryProvider guards against. Callers
 * build the lookup index themselves via `baselineIndex()`.
 */
export interface PrBaselines {
  bestWeight: Array<[string, number]>
  /** key `${exKey}|${weightKg}` */
  bestRepsAtWeight: Array<[string, number]>
  bestE1rm: Array<[string, number]>
  /** Timed holds: best SECONDS (carried in `reps`). */
  bestSeconds: Array<[string, number]>
  bestSessionVolume: Array<[string, number]>
}

export interface PrIndex {
  bestWeight: Map<string, number>
  bestRepsAtWeight: Map<string, number>
  bestE1rm: Map<string, number>
  bestSeconds: Map<string, number>
  bestSessionVolume: Map<string, number>
}

export const EMPTY_BASELINES: PrBaselines = {
  bestWeight: [], bestRepsAtWeight: [], bestE1rm: [], bestSeconds: [], bestSessionVolume: [],
}

/** Fold historical rows into per-axis bests. `isTimed` decides which axes apply. */
export function buildBaselines(
  rows: readonly BaselineSetRow[],
  isTimed: (key: string) => boolean,
): PrBaselines {
  const bestWeight = new Map<string, number>()
  const bestRepsAtWeight = new Map<string, number>()
  const bestE1rm = new Map<string, number>()
  const bestSeconds = new Map<string, number>()
  const sessVol = new Map<string, number>()          // `${key}|${sessionId}`

  const bump = (m: Map<string, number>, k: string, v: number) => m.set(k, Math.max(m.get(k) ?? 0, v))

  for (const r of rows) {
    const w = r.weightKg
    const reps = r.reps
    if (isTimed(r.key)) {
      // A hold's only record is duration. Its weight is 0, so every loaded axis
      // would be meaningless (and Epley would report a 0 kg e1RM).
      if (reps != null) bump(bestSeconds, r.key, reps)
      continue
    }
    if (w != null) bump(bestWeight, r.key, w)
    if (w != null && reps != null) {
      bump(bestRepsAtWeight, `${r.key}|${w}`, reps)
      if (e1rmEligible(reps, r.repFloor)) {
        const e = r.est1rm ?? epley1RM(w, reps)
        if (e != null) bump(bestE1rm, r.key, e)
      }
      if (r.sessionId) {
        const vk = `${r.key}|${r.sessionId}`
        sessVol.set(vk, (sessVol.get(vk) ?? 0) + w * reps)
      }
    }
  }

  const bestSessionVolume = new Map<string, number>()
  for (const [vk, vol] of sessVol) {
    bump(bestSessionVolume, vk.slice(0, vk.lastIndexOf('|')), vol)
  }

  return {
    bestWeight: [...bestWeight],
    bestRepsAtWeight: [...bestRepsAtWeight],
    bestE1rm: [...bestE1rm],
    bestSeconds: [...bestSeconds],
    bestSessionVolume: [...bestSessionVolume],
  }
}

/** Tuples → Maps. `Array.isArray` guards a cache blob from an older build. */
export function baselineIndex(b: PrBaselines | undefined): PrIndex {
  const m = (rows: Array<[string, number]> | undefined) => new Map(Array.isArray(rows) ? rows : [])
  return {
    bestWeight: m(b?.bestWeight),
    bestRepsAtWeight: m(b?.bestRepsAtWeight),
    bestE1rm: m(b?.bestE1rm),
    bestSeconds: m(b?.bestSeconds),
    bestSessionVolume: m(b?.bestSessionVolume),
  }
}

export interface PrCandidateSet {
  key: string
  weightKg: number
  reps: number
  setType?: string | null
  timed: boolean
  /** Floor of the programmed rep window, when there is one. Gates the e1RM axis. */
  repFloor?: number | null
  /** Identity for the historical-override lookup — see `historicalPrs.ts`. */
  date?: string | null
  exerciseName?: string | null
  setNumber?: number | null
}

/**
 * Is this set's rep count a fair basis for an estimated 1RM?
 *
 * Epley tracks the NSCA rep table within ~1.5% and is, if anything, slightly
 * CONSERVATIVE above 10 reps. The formula is not the problem. The problem is
 * that the axis compares e1RM across rep ranges, and a one-off heavy low-rep
 * set produces a number no working set can beat: Hack Squat's 60kg × 8 — below
 * its programmed 10–12 window — scores 76.0 and permanently gated the far
 * harder 55kg × 11 at 75.2.
 *
 * The guard is therefore ONE-SIDED, on the floor only. Going BELOW the window
 * means leaving the programmed stimulus for a strength test, and Epley
 * extrapolates hardest exactly there. Going ABOVE the ceiling is the opposite:
 * it is the rep-progression working as designed, Epley under-reports there,
 * and gating it would delete real records (Leg Press Horizontal 72.5kg × 13,
 * one past its ceiling, holds a genuine e1RM best).
 *
 * A sub-floor set still counts for the `weight` axis, where it belongs.
 */
export function e1rmEligible(reps: number, floor?: number | null): boolean {
  if (floor != null) return reps >= floor
  // Unprogrammed: only exclude the very low reps where extrapolation dominates.
  return reps >= 5
}

/** Warm-ups and drop sets count toward volume but are never a top-set record. */
export function isPrIneligible(setType: string | null | undefined): boolean {
  return setType === 'warmup' || setType === 'dropset'
}

/**
 * Which axes this set just set a record on.
 *
 * A record requires beating an EXISTING baseline — `.has()` before `>`. The
 * first time an exercise is ever logged (or the first time at a given load, for
 * reps@weight) is a new data point, not a PR; flagging it would make every
 * novel movement a trophy and make the badge meaningless.
 */
export function detectSetPrs(set: PrCandidateSet, idx: PrIndex): PrAxis[] {
  if (isPrIneligible(set.setType)) return []
  const axes: PrAxis[] = []

  if (set.timed) {
    const best = idx.bestSeconds.get(set.key)
    if (best != null && set.reps > best) axes.push('reps')
    return axes
  }

  const bw = idx.bestWeight.get(set.key)
  if (bw != null && set.weightKg > bw) axes.push('weight')

  const rk = `${set.key}|${set.weightKg}`
  const br = idx.bestRepsAtWeight.get(rk)
  if (br != null && set.reps > br) axes.push('reps')

  if (e1rmEligible(set.reps, set.repFloor)) {
    const e1rm = epley1RM(set.weightKg, set.reps)
    const be = idx.bestE1rm.get(set.key)
    if (e1rm != null && be != null && e1rm > be) axes.push('e1rm')
  }

  return axes
}

/**
 * Fold a set's result back into the index.
 *
 * Without this, three identical top sets each claim the same record: on July 31
 * Hip Thrust ran 27.5kg × 13 twice, and both sets would carry a trophy even
 * though the second only TIED the first. Absorbing after each set means the
 * flag marks the set that actually set the record. Both callers absorb, so live
 * and save-time detection stay identical.
 */
export function absorbSet(set: PrCandidateSet, idx: PrIndex): void {
  if (isPrIneligible(set.setType)) return
  const bump = (m: Map<string, number>, k: string, v: number) => m.set(k, Math.max(m.get(k) ?? 0, v))
  if (set.timed) { bump(idx.bestSeconds, set.key, set.reps); return }
  bump(idx.bestWeight, set.key, set.weightKg)
  bump(idx.bestRepsAtWeight, `${set.key}|${set.weightKg}`, set.reps)
  // Symmetric with detection: a set that cannot WIN the e1RM axis must not be
  // allowed to raise the bar for it either.
  if (e1rmEligible(set.reps, set.repFloor)) {
    const e = epley1RM(set.weightKg, set.reps)
    if (e != null) bump(idx.bestE1rm, set.key, e)
  }
}

export interface DetectedSet { axes: PrAxis[]; est1rm: number | null }

export interface SessionPrResult {
  /** Parallel to the input array — `sets[i]` ↔ `perSet[i]`. */
  perSet: DetectedSet[]
  /** Distinct axes per exercise key, including the session-level volume axis. */
  axesByKey: Map<string, Set<PrAxis>>
  /** Σ weight×reps per key over PR-ELIGIBLE sets — the volume-axis operand. */
  volumeByKey: Map<string, number>
  /** Total distinct axis-PRs across exercises. Matches `workout_sessions.pr_count`. */
  prCount: number
}

/**
 * Run a whole session in order. This is the single entry point both callers use,
 * so there is exactly one place where "what counts as a PR" is decided.
 *
 * `sets` MUST be in the order they were performed — later sets are judged
 * against earlier ones (see `absorbSet`).
 */
export function detectSessionPrs(sets: readonly PrCandidateSet[], baselines: PrBaselines): SessionPrResult {
  const idx = baselineIndex(baselines)
  const axesByKey = new Map<string, Set<PrAxis>>()
  const add = (key: string, axis: PrAxis) => {
    const s = axesByKey.get(key) ?? new Set<PrAxis>()
    s.add(axis); axesByKey.set(key, s)
  }

  const perSet: DetectedSet[] = sets.map((s) => {
    const axes = detectSetPrs(s, idx)
    // Records carried over from Hevy that the engine has no way to derive.
    // Unioned in, never replacing — a set can earn axes both ways.
    for (const a of historicalAxesFor(s.date, s.exerciseName ?? s.key, s.setNumber, s.weightKg, s.reps)) {
      if (!axes.includes(a)) axes.push(a)
    }
    for (const a of axes) add(s.key, a)
    absorbSet(s, idx)
    // A hold has no meaningful est-1RM (weight 0 → Epley 0); null keeps the
    // report from printing "e1RM 0kg" on a plank.
    return { axes, est1rm: s.timed ? null : epley1RM(s.weightKg, s.reps) }
  })

  // Volume is a SESSION-level axis: this session's total for the exercise beats
  // its best prior single-session total. Warm-ups and drop sets are excluded so
  // padding a session with light work can't manufacture a volume record.
  const volumeByKey = new Map<string, number>()
  for (const s of sets) {
    if (isPrIneligible(s.setType) || s.timed) continue
    volumeByKey.set(s.key, (volumeByKey.get(s.key) ?? 0) + s.weightKg * s.reps)
  }
  for (const [key, vol] of volumeByKey) {
    const best = idx.bestSessionVolume.get(key)
    if (best != null && vol > best) {
      add(key, 'volume')
      // Give the axis somewhere to LIVE. `is_pr` is a per-set column, so a
      // volume-only record used to flag no row at all: it existed in
      // `personal_records` and in `pr_count`, and was invisible everywhere a
      // human looks. Attribute it to the exercise's last eligible set — the
      // one that completed the total.
      for (let i = sets.length - 1; i >= 0; i--) {
        const s = sets[i]
        if (s.key !== key || isPrIneligible(s.setType) || s.timed) continue
        if (!perSet[i].axes.includes('volume')) perSet[i].axes.push('volume')
        break
      }
    }
  }

  const prCount = [...axesByKey.values()].reduce((n, s) => n + s.size, 0)
  return { perSet, axesByKey, volumeByKey, prCount }
}

export interface RecordSet { weightKg: number; reps: number; value: number }

/**
 * The set that actually earned each axis, per exercise — the values written to
 * `personal_records`.
 *
 * The old ledger stored the session's *maximum* per field, which quietly lied.
 * On 2026-07-31 Hip Thrust ran 25kg × 14 then 27.5kg × 13; the reps record was
 * earned by the 27.5kg × 13 set (13 beat 12 at that load), but the ledger
 * recorded "reps = 14 @ 25kg" — a number that had already been hit on 07-17 and
 * was no record at all. Attributing the axis to the set that won it keeps the
 * ledger readable as history.
 *
 * The session-level `volume` axis has no single set, so its value is the
 * exercise's session total and its weight/reps are zero.
 */
export function recordSets(
  sets: readonly PrCandidateSet[],
  result: SessionPrResult,
): Map<string, Map<PrAxis, RecordSet>> {
  const out = new Map<string, Map<PrAxis, RecordSet>>()
  const put = (key: string, axis: PrAxis, rec: RecordSet) => {
    const m = out.get(key) ?? new Map<PrAxis, RecordSet>()
    const held = m.get(axis)
    // TWO sets in one session can each legitimately win the same axis, because
    // the engine absorbs as it goes: Hack Squat on 2026-07-27 ran 50×12 (e1RM
    // 70.0, a record) then 55×11 (75.2, also a record). Keeping the first
    // claimant filed 70.0 as the standing e1RM — beaten, in the very session
    // that set it.
    //
    // `reps` keeps the LAST claimant instead of the largest: it is a per-LOAD
    // record, so "most reps" across different loads is meaningless, and taking
    // the max would refile a light-weight rep count as the record (the
    // "14 @ 25kg" mistake). Loads ascend, so the last claimant is the top set.
    const better = held == null
      || (axis === 'reps' ? true : rec.value > held.value)
    if (better) m.set(axis, rec)
    out.set(key, m)
  }

  result.perSet.forEach((d, i) => {
    const s = sets[i]
    for (const axis of d.axes) {
      // `volume` also rides on a set now (so it can show a trophy), but its
      // VALUE is the exercise's session total, filled in by the loop below —
      // taking it from this set would record an e1RM as a volume.
      if (axis === 'volume') continue
      const value = axis === 'weight' ? s.weightKg
        : axis === 'reps' ? s.reps
        : (d.est1rm ?? 0)                       // e1rm
      put(s.key, axis, { weightKg: s.weightKg, reps: s.reps, value })
    }
  })

  for (const [key, axes] of result.axesByKey) {
    if (!axes.has('volume')) continue
    put(key, 'volume', { weightKg: 0, reps: 0, value: result.volumeByKey.get(key) ?? 0 })
  }

  return out
}

/** Display label per axis. Timed holds show DUR — their `reps` are seconds. */
export function prAxisLabel(axis: PrAxis, timed = false): string {
  if (axis === 'reps') return timed ? 'DUR' : 'REPS'
  return axis === 'weight' ? 'WT' : axis === 'volume' ? 'VOL' : '1RM'
}
