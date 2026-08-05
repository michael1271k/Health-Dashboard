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
import { seededAxesFor, isAssertedSession } from './prSeed'

export type PrAxis = 'weight' | 'reps' | 'volume' | 'e1rm'

/** A historical set row, pre-session. `est1rm` may be absent — it's recomputed. */
export interface BaselineSetRow {
  key: string
  weightKg: number | null
  reps: number | null
  est1rm?: number | null
  /**
   * Warm-ups and drop sets set no bar, exactly as they win no record.
   *
   * Omitting this used to break the volume axis in the one direction that is
   * invisible: the baseline summed EVERY row while the candidate session summed
   * only eligible ones, so Leg Press's 2026-07-27 bar stood at 3582.5 kg (a
   * 900 kg warm-up included) against a 2755 kg candidate that was in truth the
   * best working volume ever logged. A suppressed record leaves no trace.
   */
  setType?: string | null
  /** Floor of the programmed rep window — gates whether this row sets the e1RM bar. */
  repFloor?: number | null
  /** Unilateral pairing: L and R of ONE physical set share a `pairId`. */
  pairId?: string | null
  side?: string | null
}

/**
 * Per-row tonnage for the VOLUME axis, with unilateral pairs collapsed.
 *
 * The volume axis used to read each row as its own set, so "L 5 kg × 10,
 * R 5 kg × 14" put the bar at the strong side's 70 kg and both rows could carry
 * a volume trophy for one physical set. Collapsing fixes both: the pair scores
 * once, at the WEAKER side (min weight × min reps), on the row that completes
 * it. Returns `null` for the earlier side so the record lands on exactly one
 * row. A lone side (only L logged) is real work with no partner and scores on
 * its own.
 *
 * ONE SIDE, NOT TWO — and this is where it diverged (fixed 2026-08-05).
 *
 * The collapse used to credit `2 × min w × min reps`, mirroring
 * `sessionVolumeKg`, which is correct for a SESSION TOTAL: both arms did the
 * work and the week's tonnage must count both. It is wrong for a per-set
 * RECORD, because the same exercise gets logged both ways. Single Arm Lateral
 * Raise (Cable) carries paired rows on 2026-07-23 (L 5×13 / R 5×15 → a doubled
 * 130 kg) and bare unsided rows before and after it (5 × 15 → 75 kg). Those two
 * conventions describe the same physical set, so a single paired session set a
 * bar no unsided set could ever clear: 2026-08-05's 5 kg × 17 — 85 kg, a real
 * best against every comparable row — was judged against 130 and silently lost
 * the axis while winning 1RM on the same set.
 *
 * Per-set volume is therefore "the tonnage of ONE working set as logged",
 * identical under either convention. The session total keeps its ×2 in
 * `sessionVolumeKg`, where the question really is how much was lifted.
 */
export function volumeCredits(
  rows: ReadonlyArray<{ weightKg: number | null; reps: number | null; pairId?: string | null; side?: string | null }>,
): Array<number | null> {
  const out: Array<number | null> = rows.map((r) => (r.weightKg ?? 0) * (r.reps ?? 0))

  const groups = new Map<string, number[]>()
  rows.forEach((r, i) => {
    if (!r.pairId || (r.side !== 'L' && r.side !== 'R')) return
    const g = groups.get(r.pairId) ?? []
    g.push(i)
    groups.set(r.pairId, g)
  })

  for (const idxs of groups.values()) {
    const l = idxs.find((i) => rows[i].side === 'L')
    const r = idxs.find((i) => rows[i].side === 'R')
    // Anything that isn't exactly one L and one R is malformed; score as logged.
    if (idxs.length !== 2 || l == null || r == null) continue
    const w = Math.min(rows[l].weightKg ?? 0, rows[r].weightKg ?? 0)
    const reps = Math.min(rows[l].reps ?? 0, rows[r].reps ?? 0)
    const last = Math.max(l, r)
    for (const i of idxs) out[i] = null
    out[last] = w * reps
  }

  return out
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
  /** Heaviest SINGLE-SET tonnage (weight × reps) ever logged for the exercise. */
  bestSetVolume: Array<[string, number]>
}

export interface PrIndex {
  bestWeight: Map<string, number>
  bestRepsAtWeight: Map<string, number>
  bestE1rm: Map<string, number>
  bestSeconds: Map<string, number>
  bestSetVolume: Map<string, number>
}

export const EMPTY_BASELINES: PrBaselines = {
  bestWeight: [], bestRepsAtWeight: [], bestE1rm: [], bestSeconds: [], bestSetVolume: [],
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
  const bestSetVolume = new Map<string, number>()

  const bump = (m: Map<string, number>, k: string, v: number) => m.set(k, Math.max(m.get(k) ?? 0, v))

  // The volume bar has to be built under the SAME unilateral rule detection
  // scores candidates by, or a pair is judged against a per-side history.
  const credits = volumeCredits(rows)

  rows.forEach((r, i) => {
    // Symmetric with `absorbSet`: a row that cannot WIN an axis must not raise
    // the bar for it either.
    if (isPrIneligible(r.setType)) return
    const w = r.weightKg
    const reps = r.reps
    if (isTimed(r.key)) {
      // A hold's only record is duration. Its weight is 0, so every loaded axis
      // would be meaningless (and Epley reports no e1RM at all at 0 kg).
      if (reps != null) bump(bestSeconds, r.key, reps)
      return
    }
    if (w != null) bump(bestWeight, r.key, w)
    if (w != null && reps != null) {
      bump(bestRepsAtWeight, `${r.key}|${w}`, reps)
      const vol = credits[i]
      if (vol != null) bump(bestSetVolume, r.key, vol)
      if (e1rmEligible(reps, r.repFloor)) {
        // `||`, not `??`: rows written before Epley returned null for unloaded
        // work hold a stored est_1rm_kg of exactly 0, which is not an estimate.
        const e = r.est1rm || epley1RM(w, reps)
        if (e != null) bump(bestE1rm, r.key, e)
      }
    }
  })

  return {
    bestWeight: [...bestWeight],
    bestRepsAtWeight: [...bestRepsAtWeight],
    bestE1rm: [...bestE1rm],
    bestSeconds: [...bestSeconds],
    bestSetVolume: [...bestSetVolume],
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
    bestSetVolume: m(b?.bestSetVolume),
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
  /** Unilateral pairing: L and R of ONE physical set share a `pairId`. */
  pairId?: string | null
  side?: string | null
  /** Identity for the asserted record-book lookup — see `prSeed.ts`. */
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
 * Does the REPS axis apply to this set? Only when it carries no external load.
 *
 * On a loaded lift "most reps at this load" is not the achievement — the load is
 * the achievement, and the rep count is the dial you turn between load jumps. It
 * also double-files: Hack Squat 55 kg × 12 beat 55 kg × 11 on reps, on e1RM and
 * on tonnage, three trophies for one set, and the reps one was the least
 * informative of the three. Double progression already reports rep progress
 * ("2/3 sets at ceiling"), which is where it belongs.
 *
 * Bodyweight and core work has no load to progress, so reps ARE the record
 * there — Reverse Crunch 17, Hanging Knee Raise, a 58 s Side Plank. Weight 0 is
 * the exact test for that, and it catches timed holds for free (their duration
 * rides in `reps` and their weight is 0).
 */
export function repsAxisEligible(weightKg: number): boolean {
  return weightKg === 0
}

/**
 * Which axes this set just set a record on.
 *
 * A record requires beating an EXISTING baseline — `.has()` before `>`. The
 * first time an exercise is ever logged (or the first time at a given load, for
 * reps@weight) is a new data point, not a PR; flagging it would make every
 * novel movement a trophy and make the badge meaningless.
 *
 * VOLUME IS A PER-SET AXIS (changed 2026-08-03). It used to be a session total
 * for the exercise, which failed twice over. It fired on almost everything —
 * one extra rep anywhere in a 3-set block beats the previous total by ~2 %, so
 * Leg Extension, Seated Leg Curl, Calf Press and Crunch Machine all "set volume
 * records" on 2026-08-03 for +1 rep each — and having no set of its own to live
 * on, it was pinned to the exercise's LAST set, which is usually its weakest:
 * Hack Squat's badge landed on 55 kg × 11 while 55 kg × 12 stood next to it.
 * Tonnage of one set against the heaviest single set ever is a thing that
 * happened, and the badge lands on the set that did it by construction.
 *
 * `volumeKg` overrides that tonnage for unilateral work: pass the pair's own
 * figure on the row that completes it and `null` on the other side, so one
 * physical set cannot carry two volume trophies (see `volumeCredits`). Omit it
 * and the set scores as a plain bilateral `weight × reps`.
 */
export function detectSetPrs(set: PrCandidateSet, idx: PrIndex, volumeKg?: number | null): PrAxis[] {
  if (isPrIneligible(set.setType)) return []
  const axes: PrAxis[] = []

  if (set.timed) {
    const best = idx.bestSeconds.get(set.key)
    if (best != null && set.reps > best) axes.push('reps')
    return axes
  }

  const bw = idx.bestWeight.get(set.key)
  if (bw != null && set.weightKg > bw) axes.push('weight')

  if (repsAxisEligible(set.weightKg)) {
    const br = idx.bestRepsAtWeight.get(`${set.key}|${set.weightKg}`)
    if (br != null && set.reps > br) axes.push('reps')
  }

  const vol = volumeKg === undefined ? set.weightKg * set.reps : volumeKg
  if (vol != null) {
    const bv = idx.bestSetVolume.get(set.key)
    if (bv != null && vol > bv) axes.push('volume')
  }

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
export function absorbSet(set: PrCandidateSet, idx: PrIndex, volumeKg?: number | null): void {
  if (isPrIneligible(set.setType)) return
  const bump = (m: Map<string, number>, k: string, v: number) => m.set(k, Math.max(m.get(k) ?? 0, v))
  if (set.timed) { bump(idx.bestSeconds, set.key, set.reps); return }
  bump(idx.bestWeight, set.key, set.weightKg)
  bump(idx.bestRepsAtWeight, `${set.key}|${set.weightKg}`, set.reps)
  const vol = volumeKg === undefined ? set.weightKg * set.reps : volumeKg
  if (vol != null) bump(idx.bestSetVolume, set.key, vol)
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
  /** Distinct axes per exercise key. */
  axesByKey: Map<string, Set<PrAxis>>
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

  // For an ASSERTED session — the whole seeded era, plus any individually
  // corrected date — the record book is the ONLY source of axes; detection is
  // suppressed rather than unioned with. Which lifts count as records there is
  // a judgement the engine could not make, so it stops guessing. See prSeed.ts.
  const seeded = isAssertedSession(sets.find((s) => s.date)?.date)

  // Unilateral pairs collapse to one tonnage on one row — the same rule
  // `sessionVolumeKg` scores the session by (see `volumeCredits`).
  const credits = volumeCredits(sets)

  const perSet: DetectedSet[] = sets.map((s, i) => {
    const asserted = seededAxesFor(s.date, s.exerciseName ?? s.key, s.setNumber, s.weightKg, s.reps)
    const axes = seeded ? [...asserted] : detectSetPrs(s, idx, credits[i])
    // The index still advances through a seeded session so its baselines stay
    // correct for everything that comes after it.
    absorbSet(s, idx, credits[i])
    // No load, no one-rep max to estimate — `epley1RM` returns null at 0 kg, so
    // neither a hold nor a Reverse Crunch prints "1RM 0".
    return { axes, est1rm: s.timed ? null : epley1RM(s.weightKg, s.reps) }
  })

  // Rebuilt from the per-set axes so `pr_count`, `is_pr` and the ledger can
  // never disagree about what counted. Every axis now lives on a set, so there
  // is no session-level pass to fold in afterwards.
  const axesByKey = new Map<string, Set<PrAxis>>()
  perSet.forEach((d, i) => {
    if (!d.axes.length) return
    const s = axesByKey.get(sets[i].key) ?? new Set<PrAxis>()
    for (const a of d.axes) s.add(a)
    axesByKey.set(sets[i].key, s)
  })

  const prCount = [...axesByKey.values()].reduce((n, s) => n + s.size, 0)
  return { perSet, axesByKey, prCount }
}

/**
 * AXIS SUBSUMPTION WAS REMOVED (2026-08-02, deliberate).
 *
 * A previous pass dropped `e1rm` when the same set also won `weight` or `reps`,
 * and counted session `volume` only when no set had won anything — on the
 * grounds that e1RM is `weight × (1 + reps/30)` and therefore a restatement.
 * That reasoning is sound arithmetically, but the record book it produced did
 * not match the one the user keeps: their July list files Weight + Vol + 1RM
 * against a single set on purpose.
 *
 * So every axis a set wins is now counted, and the July era is governed by an
 * asserted list instead (see prSeed.ts) rather than by tuning these rules until
 * the numbers agree. Weekly counts run higher as a direct result. Do not
 * reintroduce subsumption without re-deriving the seed alongside it.
 */

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
 * `volume` files the winning set's own tonnage (weight × reps), matching the
 * per-set axis it became on 2026-08-03. It used to file the exercise's session
 * total against a set that had not lifted it.
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

  // Same collapse as detection, so the ledger stores the tonnage the axis was
  // actually judged on rather than one side of a unilateral pair.
  const credits = volumeCredits(sets)

  result.perSet.forEach((d, i) => {
    const s = sets[i]
    for (const axis of d.axes) {
      const value = axis === 'weight' ? s.weightKg
        : axis === 'reps' ? s.reps
        : axis === 'volume' ? (credits[i] ?? s.weightKg * s.reps)
        : (d.est1rm ?? 0)                       // e1rm
      put(s.key, axis, { weightKg: s.weightKg, reps: s.reps, value })
    }
  })

  return out
}

/**
 * Display label per axis. Timed holds show Duration — their `reps` are seconds.
 *
 * Whole words, not WT/VOL/REPS: the abbreviations saved a few pixels and cost
 * the meaning, and the badge already carries a trophy to say "record". The
 * label never carries a "PR " prefix either — the report used to add one while
 * the logger did not, so the same record read differently in two places.
 */
export function prAxisLabel(axis: PrAxis, timed = false): string {
  if (axis === 'reps') return timed ? 'Duration' : 'Reps'
  return axis === 'weight' ? 'Weight' : axis === 'volume' ? 'Volume' : '1RM'
}
