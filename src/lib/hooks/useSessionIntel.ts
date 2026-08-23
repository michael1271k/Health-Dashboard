'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { eraForDate, programDayFor, programDayByKey, DEFAULT_PROGRAM_ID } from '@/lib/programs'
import { epley1RM } from '@/lib/utils/epley'
import { sessionVolumeKg, type VolumeSet } from '@/lib/sessions/volume'

export interface ExerciseDelta {
  exerciseId: string
  name: string
  topKg: number
  topReps: number
  prevKg: number | null
  prevReps: number | null
  /** This exercise's tonnage in each session — the volume half of the trend. */
  volumeKg: number
  prevVolumeKg: number | null
  /** null = first time this exercise is logged (no baseline to compare). */
  delta: -1 | 0 | 1 | null
  /**
   * WHICH dial decided `delta`. `'intensity'` means the mean est-1RM moved;
   * `'volume'` means it did not and the tonnage broke the tie — the same work
   * done one more time, or one time fewer. See `compareProgress`. Null
   * alongside a null `delta`.
   */
  deltaAxis: DeltaAxis | null
  /**
   * Percent change in the comparison basis — the mean est-1RM across the
   * working sets, or mean reps for unloaded work. See `basisOf`. Null with no
   * baseline.
   *
   * ZERO IS A REAL ANSWER, and it is the reason `deltaAxis` exists: a delta of
   * ±1 alongside `deltaPct === 0` is a volume-axis verdict, not a rounding
   * artefact.
   */
  deltaPct: number | null
  isPr: boolean
  /** True when this movement carries no load, so reps ARE the progression. */
  unloaded: boolean
}
/** One metric compared against the previous same-type session. */
export interface IntelMetric {
  key: 'volume' | 'sets' | 'duration' | 'calories' | 'avgBpm' | 'prs'
  label: string
  value: number | null
  previous: number | null
  /** Absolute change; null when either side is missing. */
  delta: number | null
  /** Whether a RISE in this metric is the good direction. */
  higherIsBetter: boolean
  unit?: string
}

export interface SessionIntel {
  deltas: ExerciseDelta[]
  prs: Array<{ name: string; kg: number; reps: number; unloaded: boolean }>
  volumes: Array<{ date: string; volumeKg: number }>  // this + previous SAME-TYPE sessions (asc)
  typeLabel: string          // era-aware session-type name, e.g. "Upper B"
  /** Date of the session being compared against (null when first of its type). */
  previousDate: string | null
  volumeDeltaPct: number | null   // this vs previous same-type session
  setsDelta: number | null
  /** Every headline metric, this session vs the last one of the same type. */
  metrics: IntelMetric[]
  computedVolumeKg: number   // fallback when the session row lacks totals
  computedSets: number
  isFirstOfType: boolean     // no previous same-type session → hide progression
}

type SetRow = {
  exercise_id: string; weight_kg: number; reps: number; is_pr: boolean
  /** Unilateral tracking — needed so tonnage collapses a pair to its weaker side. */
  side: string | null; pair_id: string | null
  /** Stored est-1RM wins over the Epley fallback — see `basisOf`. */
  est_1rm_kg: number | null
  /** Warm-ups are excluded from the comparison basis; they are not progress. */
  set_type: string | null
  exercises: { name: string }
}

/** PostgREST hands `side` back as a bare string; only a real limb collapses. */
const toVolumeSet = (s: Pick<SetRow, 'weight_kg' | 'reps' | 'side' | 'pair_id'>): VolumeSet => ({
  weightKg: s.weight_kg, reps: s.reps,
  side: s.side === 'L' || s.side === 'R' ? s.side : null,
  pairId: s.pair_id ?? null,
})

/**
 * ── THE NUMBER THE TWO SESSIONS ARE COMPARED ON ─────────────────────────────
 *
 * This has been wrong twice, in opposite directions, and the history is the
 * argument for where it landed.
 *
 * FIRST it was TOP LOAD, which on a double-progression program is silent
 * exactly where progress happens — you hold the load and add reps until the
 * ceiling, so every rep week read "matched", and unloaded work (load 0 forever)
 * could never read anything else.
 *
 * THEN it was the TOP SET's estimated 1RM. Better, and still blind to most of a
 * session. The top set is the one the program pins: it reaches the rep ceiling
 * first and then deliberately stops moving while sets 2 and 3 climb toward it
 * over the following weeks. Upper A on 2026-08-23 is the exact case —
 *
 *   Incline DB Press   16 Aug   40×11  40×9  40×7      23 Aug   40×11  40×9  40×9
 *   Lat Pulldown       16 Aug   49.5×10 49.5×10 47×11   23 Aug   49.5×10 49.5×10 49.5×9
 *   Face Pull          16 Aug   16.25×15 ×14 ×11        23 Aug   16.25×15 ×14 ×12
 *
 * — three lifts that each improved (a rep on the third set, a rep, and a LOAD
 * increase on the third set), and three identical top sets. All three printed
 * `═`. The card sat directly beside a sparkline, fed by `useSessionTrends`,
 * that was drawing those same sessions as +1.7%, +0.1% and +0.8%: two
 * components, two axes, one screen.
 *
 * So the basis is the MEAN HEADLINE ACROSS THE WORKING SETS — the same axis
 * `useSessionTrends.meanOf` has plotted since 2026-08-18. It moves when ANY set
 * moves, which covers the three things the top set misses: a rep added to a
 * back-off set, a set ADDED to the exercise, and a load increase that costs a
 * rep (Lat Pulldown above — tonnage falls, the mean rises, and the mean is
 * right).
 *
 * Warm-ups are excluded by the caller: a warm-up is not progress, and adding
 * one would otherwise register as a regression by dragging the mean down.
 */
export function basisOf(
  rows: Array<{ weight_kg: number; reps: number; est_1rm_kg: number | null; side: string | null; pair_id: string | null }>,
  unloaded: boolean,
): number {
  const one = collapseSides(rows)
  if (!one.length) return 0
  const headline = (r: { weight_kg: number; reps: number; est_1rm_kg: number | null }) =>
    // `||`, never `??`: a stored 0 is an unloaded row, not a real est-1RM. See
    // the note in `lib/training/prEngine`.
    unloaded ? r.reps : (r.est_1rm_kg || epley1RM(r.weight_kg, r.reps) || 0)
  return one.reduce((sum, r) => sum + headline(r), 0) / one.length
}

/**
 * ── WHAT COUNTS AS PROGRESS WHEN THE METRICS DISAGREE ────────────────────────
 *
 * Progressive overload has two dials and they can move in opposite directions
 * in the same week. The case that forces a decision:
 *
 *   Lat Pulldown   16 Aug   49.5×10  49.5×10  47×11     tonnage 1507.0 kg
 *                  23 Aug   49.5×10  49.5×10  49.5×9    tonnage 1435.5 kg
 *
 * The load went UP on the third set and it cost two reps. Tonnage fell by 71 kg.
 * By volume this is a bad week; by every coach's reading it is a good one.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * INTENSITY decides. VOLUME breaks a tie. Nothing else is consulted.
 *
 *   1. `basis` — mean estimated 1RM across the working sets (mean REPS for
 *      unloaded work, where reps are the only dial there is). If it moved at
 *      all, that is the answer, and `axis` reports `'intensity'`.
 *   2. If the basis is identical on both sides, `tonnage` decides, and `axis`
 *      reports `'volume'`.
 *   3. Both identical → held.
 *
 * ── WHY INTENSITY FIRST, AND WITH NO DEAD BAND ───────────────────────────────
 * Ranking volume first fails the case above, and it fails it in the direction
 * that matters: it would tell you a successful load increase was a step
 * backwards, which is advice that makes you stop taking load increases.
 *
 * A noise floor was considered and rejected on the same session. Lat Pulldown's
 * basis moved +0.1% — under any floor worth having — and demoting it to the
 * volume tiebreak would have printed ⬇️ on the exact lift this whole rule was
 * rewritten to stop mis-reporting. A 0.1% rise in mean e1RM is a small piece of
 * progress, and "small" is what `deltaPct` is for; it is not noise, because
 * these numbers are not sampled, they are the sets you performed.
 *
 * ── WHY VOLUME IS STILL HERE ─────────────────────────────────────────────────
 * The mean is deliberately blind to how many sets it averages, which is what
 * makes it immune to a warm-up or a dropped back-off set — and also what makes
 * it silent on the one form of overload that changes nothing else: the SAME
 * work, one more time. Three sets of 40×10 becoming four sets of 40×10 has an
 * identical mean and 25% more work done, and it is unambiguously progress. The
 * tie is exactly where volume is the right answer and nowhere else.
 *
 * The symmetric case is a set REMOVED — a deload, or the maintenance week the
 * lever now describes. That reports ⬇️ on the volume axis, which is honest:
 * less work was done. `axis` is exported so a surface can say "same weights,
 * one set fewer" instead of showing a bare red arrow for a planned week.
 *
 * ── EPSILON ──────────────────────────────────────────────────────────────────
 * "Identical" is a float comparison on a mean, so it is taken to 1e-9 rather
 * than with `===`. Two sessions of the same sets differ by nothing real, but
 * they can differ in the last bit.
 */
export type DeltaAxis = 'intensity' | 'volume'

export function compareProgress(
  now: { basis: number; volumeKg: number },
  before: { basis: number; volumeKg: number },
): { delta: -1 | 0 | 1; axis: DeltaAxis } {
  if (Math.abs(now.basis - before.basis) > 1e-9) {
    return { delta: now.basis > before.basis ? 1 : -1, axis: 'intensity' }
  }
  if (Math.abs(now.volumeKg - before.volumeKg) > 1e-9) {
    return { delta: now.volumeKg > before.volumeKg ? 1 : -1, axis: 'volume' }
  }
  return { delta: 0, axis: 'intensity' }
}

/**
 * A unilateral exercise logs L and R as two rows sharing a `pair_id`, and they
 * are ONE set for every question except tonnage. Collapse to a single
 * representative — the RIGHT side leads (it sets the rep count, the left
 * matches it), falling back to the higher-rep side. The same rule as
 * `useSessionTrends.collapsePairs`, deliberately: two hooks that disagree about
 * what a SET is cannot agree about progress.
 */
function collapseSides<T extends { side: string | null; pair_id: string | null; reps: number }>(rows: T[]): T[] {
  const pairs = new Map<string, T[]>()
  const out: T[] = []
  for (const r of rows) {
    if (!r.pair_id) { out.push(r); continue }
    const g = pairs.get(r.pair_id) ?? []
    g.push(r); pairs.set(r.pair_id, g)
  }
  for (const g of pairs.values()) {
    out.push(g.find((r) => r.side === 'R') ?? g.reduce((m, r) => (r.reps > m.reps ? r : m), g[0]))
  }
  return out
}

/**
 * Data behind the Session Intel Card: every exercise judged against the LAST
 * COMPLETED SESSION OF THIS EXACT PROGRAM DAY (▲/═/▼ — see `basisOf` for the
 * axis), PR flags, and the volume trail of every same-type session in the era.
 */
export function useSessionIntel(sessionId: string | null) {
  return useQuery({
    queryKey: ['session_intel', sessionId],
    enabled: !!sessionId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SessionIntel> => {
      // day_key is the exact program-day identity (null on legacy rows).
      type SessRow = {
        id: string; started_at: string; split_day: string; total_volume_kg: number | null
        day_key?: string | null; duration_min: number | null; calories_burned: number | null
        avg_bpm: number | null; set_count: number | null; pr_count: number | null
      }
      const COLS = 'id, started_at, split_day, total_volume_kg, day_key, duration_min, calories_burned, avg_bpm, set_count, pr_count'
      const { data: sess } = await supabase
        .from('workout_sessions')
        .select(COLS)
        .eq('id', sessionId as string)
        .single()
      const session = sess as SessRow | null
      const empty: SessionIntel = {
        deltas: [], prs: [], volumes: [], typeLabel: '', previousDate: null,
        volumeDeltaPct: null, setsDelta: null, metrics: [],
        computedVolumeKg: 0, computedSets: 0, isFirstOfType: true,
      }
      if (!session) return empty

      // SAME-TYPE matching: split_day alone mixes Upper A and Upper B (both
      // 'upper'). New sessions carry day_key (exact program-day identity —
      // robust even for off-schedule days); legacy rows fall back to the
      // TYPE = split_day + weekday heuristic (Upper A = Sun, Upper B = Thu).
      // STRICT ERA BOUNDARY: a HELIX session NEVER compares against a
      // PPL-legacy one (different program, loads, rep schemes) — the first HELIX
      // session of each type has no baseline, by design.
      const weekday = new Date(session.started_at).getUTCDay()
      const sessionEra = eraForDate(session.started_at.slice(0, 10))
      const typeLabel = sessionTypeLabel(session.started_at.slice(0, 10), session.split_day, weekday, session.day_key ?? null)
      const prevQuery = await supabase
        .from('workout_sessions')
        .select(COLS)
        .eq('split_day', session.split_day)
        .lt('started_at', session.started_at)
        .order('started_at', { ascending: false })
        // 60, not 12: the volume trail draws EVERY same-type session in the era,
        // and 12 raw rows became ~4 after the same-type + era filters below.
        .limit(60)
      /**
       * THE SAME SESSION, not the same weekday.
       *
       * `day_key` is the program day's own identity, and when this session has
       * one it is the WHOLE test: a candidate without a key is excluded rather
       * than falling back to the weekday. The fallback used to apply per
       * candidate, so a swapped day (Upper A logged on a Wednesday) matched a
       * legacy Wednesday row of a different routine entirely and the report
       * compared two unrelated sessions. The weekday heuristic survives only for
       * a session that has no key of its own — pre-`day_key` rows, where it is
       * the only signal there is.
       */
      const sameType = (p: { started_at: string; day_key?: string | null }) =>
        session.day_key
          ? p.day_key === session.day_key
          : new Date(p.started_at).getUTCDay() === weekday
      const prev = ((prevQuery.data ?? []) as unknown as SessRow[])
        .filter(sameType)
        .filter((p) => eraForDate(p.started_at.slice(0, 10)) === sessionEra)

      /**
       * The set fetch is deliberately NOT `prev` — it is this session and the
       * ONE before it.
       *
       * `prev` used to be capped at 2 entries, which is where the volume trail's
       * three-point ceiling came from: the cap existed to keep this `.in()`
       * small, and the chart inherited it. The two consumers want different
       * windows — the per-exercise deltas compare against exactly one session,
       * the trail wants the whole era — so they now take different slices
       * instead of sharing the smaller one.
       */
      const ids = [session.id, ...(prev[0] ? [prev[0].id] : [])]
      const { data: setsRaw } = await supabase
        .from('workout_sets')
        .select('session_id, exercise_id, weight_kg, reps, is_pr, est_1rm_kg, set_type, side, pair_id, exercises!inner(name)')
        .in('session_id', ids)
      const sets = (setsRaw ?? []) as unknown as Array<SetRow & { session_id: string }>

      type Top = {
        name: string; kg: number; reps: number; isPr: boolean; volumeKg: number; unloaded: boolean
        /**
         * The COMPARISON BASIS: the mean headline across this session's working
         * sets — mean est-1RM for loaded work, mean reps for unloaded. See the
         * long note above `basisOf`.
         */
        basis: number
      }


      /**
       * The exercise's BEST set of a session, plus its tonnage.
       *
       * "Best" used to mean heaviest, full stop — which picks an arbitrary set on
       * any movement that carries no load: every Reverse Crunch set weighs 0, so
       * the card showed set 1 rather than the best of the day. Ranking on
       * (weight, then reps) is correct for both and identical for loaded work.
       */
      /**
       * Is this movement scored on REPS rather than on load?
       *
       * Decided across BOTH sessions, not per session: an exercise whose axis
       * flipped between them would be compared in two different units, and the
       * `▲` would mean nothing. Same test the PR engine uses — no set anywhere
       * carries load.
       */
      const unloadedIds = new Set<string>()
      {
        const loaded = new Set(sets.filter((s) => s.weight_kg > 0).map((s) => s.exercise_id))
        for (const s of sets) if (!loaded.has(s.exercise_id)) unloadedIds.add(s.exercise_id)
      }

      const top = (rows: Array<SetRow & { session_id: string }>, sid: string) => {
        const m = new Map<string, Top>()
        // Tonnage is NOT accumulated here. A unilateral pair is two rows, and
        // adding both credited the strong side's extra reps to the weak one —
        // so this card disagreed with the session total it sits next to. The
        // rows are collected whole and folded once, below, through the one rule.
        const perEx = new Map<string, VolumeSet[]>()
        // The working sets, kept whole, for the basis fold below.
        const workEx = new Map<string, Array<SetRow & { session_id: string }>>()
        for (const s of rows.filter((r) => r.session_id === sid)) {
          const bucket = perEx.get(s.exercise_id) ?? []
          bucket.push(toVolumeSet(s))
          perEx.set(s.exercise_id, bucket)
          if (s.set_type !== 'warmup') {
            const w = workEx.get(s.exercise_id) ?? []
            w.push(s)
            workEx.set(s.exercise_id, w)
          }

          const cur = m.get(s.exercise_id)
          const better = !cur || s.weight_kg > cur.kg || (s.weight_kg === cur.kg && s.reps > cur.reps)
          if (better) {
            m.set(s.exercise_id, {
              name: s.exercises.name, kg: s.weight_kg, reps: s.reps,
              isPr: cur?.isPr || s.is_pr,
              volumeKg: 0,
              unloaded: unloadedIds.has(s.exercise_id),
              basis: 0,
            })
          } else {
            cur.isPr ||= s.is_pr
          }
        }
        for (const [exId, t] of m) {
          t.volumeKg = sessionVolumeKg(perEx.get(exId) ?? [])
          t.basis = basisOf(workEx.get(exId) ?? [], t.unloaded)
        }
        return m
      }
      const thisTop = top(sets, session.id)
      const prevTop = prev[0] ? top(sets, prev[0].id) : new Map<string, Top>()

      const deltas: ExerciseDelta[] = [...thisTop.entries()].map(([exId, t]) => {
        const p = prevTop.get(exId)
        /**
         * BOTH sides must carry real work, or there is no comparison.
         *
         * `basisOf` returns 0 for a session in which this exercise has no
         * WORKING set — every row was a warm-up. Guarding only the previous side
         * would let that read as a regression: a lift you warmed up and then
         * abandoned would print ⬇️ against last week's real sets, and the honest
         * answer is that this session has nothing to say about it. `a === 0` is
         * therefore as disqualifying as `b === 0`, and both fall through to the
         * `null` branch — 🆕 / no glyph, which is what "no baseline to compare"
         * has always meant here.
         *
         * `> 0` and not `!= null`: a zero basis is the absence of work, not a
         * measurement of zero. (Unloaded work is scored on REPS, so a real set
         * of a bodyweight movement is never 0.)
         */
        const a = t.basis > 0 ? t.basis : null
        const b = p && p.basis > 0 ? p.basis : null
        const comparable = a != null && b != null && p != null
        // Intensity first, tonnage as the tiebreak — see `compareProgress`.
        const verdict = comparable
          ? compareProgress({ basis: a, volumeKg: t.volumeKg }, { basis: b, volumeKg: p.volumeKg })
          : null
        return {
          exerciseId: exId,
          name: t.name, topKg: t.kg, topReps: t.reps,
          prevKg: p?.kg ?? null, prevReps: p?.reps ?? null,
          volumeKg: Math.round(t.volumeKg * 10) / 10,
          prevVolumeKg: p ? Math.round(p.volumeKg * 10) / 10 : null,
          // null = first log of this exercise (no baseline), or a session with
          // no working set on either side. A PR also requires a baseline to
          // beat — never a gold star the first time.
          delta: verdict ? verdict.delta : null,
          deltaAxis: verdict ? verdict.axis : null,
          deltaPct: comparable ? Math.round(((a - b) / b) * 1000) / 10 : null,
          isPr: t.isPr && p != null,
          unloaded: t.unloaded,
        }
      })

      // Fallback totals computed from the fetched sets (guaranteed chips)
      const thisSets = sets.filter((s) => s.session_id === session.id)
      const computedVolumeKg = Math.round(sessionVolumeKg(thisSets.map(toVolumeSet)))
      const computedSets = thisSets.length
      const thisVolume = session.total_volume_kg ?? computedVolumeKg

      const volumes = [...[...prev].reverse(), { id: session.id, started_at: session.started_at, total_volume_kg: thisVolume }]
        .filter((s) => s.total_volume_kg != null)
        .map((s) => ({ date: s.started_at.slice(0, 10), volumeKg: s.total_volume_kg as number }))

      // Header Δ vs the previous SAME-TYPE session
      const last = prev[0] ?? null
      const prevVol = last?.total_volume_kg ?? null
      const volumeDeltaPct = prevVol && thisVolume ? Math.round(((thisVolume - prevVol) / prevVol) * 100) : null
      const prevSetCount = last ? sets.filter((s) => s.session_id === last.id).length : null
      const setsDelta = prevSetCount != null ? computedSets - prevSetCount : null
      const thisPrs = deltas.filter((d) => d.isPr)

      // Every headline metric side by side, rather than one crammed sentence.
      // `higherIsBetter` is per-metric on purpose: more volume is progress, more
      // MINUTES for the same work is not, and average HR is context, not a score.
      const metric = (
        key: IntelMetric['key'], labelText: string, value: number | null,
        previous: number | null, higherIsBetter: boolean, unit?: string,
      ): IntelMetric => ({
        key, label: labelText, value, previous,
        delta: value != null && previous != null ? Math.round((value - previous) * 10) / 10 : null,
        higherIsBetter, unit,
      })
      const metrics: IntelMetric[] = [
        metric('volume', 'Volume', thisVolume, prevVol, true),
        metric('sets', 'Sets', computedSets, prevSetCount, true),
        metric('duration', 'Time', session.duration_min, last?.duration_min ?? null, false, 'min'),
        metric('calories', 'Calories', session.calories_burned, last?.calories_burned ?? null, true, 'kcal'),
        metric('avgBpm', 'Avg HR', session.avg_bpm, last?.avg_bpm ?? null, true, 'bpm'),
        metric('prs', 'PRs', thisPrs.length, last?.pr_count ?? null, true),
      ].filter((m) => m.value != null || m.previous != null)

      return {
        deltas,
        prs: thisPrs.map((d) => ({ name: d.name, kg: d.topKg, reps: d.topReps, unloaded: d.unloaded })),
        volumes,
        typeLabel,
        previousDate: last?.started_at.slice(0, 10) ?? null,
        volumeDeltaPct,
        setsDelta,
        metrics,
        computedVolumeKg,
        computedSets,
        isFirstOfType: prev.length === 0,
      }
    },
  })
}

/**
 * Era-aware session-type name. HELIX era prefers the exact program-day identity
 * (day_key → "Upper B", correct even on a swapped/off-weekday), falling back to
 * the weekday match, then the raw split. PPL → split.
 */
function sessionTypeLabel(dateISO: string, splitDay: string, weekday: number, dayKey: string | null): string {
  if (eraForDate(dateISO) === 'axis') {
    const byKey = dayKey ? programDayByKey(dayKey) : undefined
    const byWeekday = programDayFor(DEFAULT_PROGRAM_ID, weekday)
    const d = byKey ?? (byWeekday === 'rest' ? undefined : byWeekday)
    if (d) return d.sub ? `${d.label} · ${d.sub}` : d.label
  }
  return splitDay[0].toUpperCase() + splitDay.slice(1)
}
