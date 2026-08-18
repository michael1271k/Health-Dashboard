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
   * Percent change in the comparison basis: estimated 1RM for a loaded lift,
   * reps (or seconds) for unloaded work. Null with no baseline.
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
  exercises: { name: string }
}

/** PostgREST hands `side` back as a bare string; only a real limb collapses. */
const toVolumeSet = (s: Pick<SetRow, 'weight_kg' | 'reps' | 'side' | 'pair_id'>): VolumeSet => ({
  weightKg: s.weight_kg, reps: s.reps,
  side: s.side === 'L' || s.side === 'R' ? s.side : null,
  pairId: s.pair_id ?? null,
})

/**
 * Data behind the Session Intel Card: per-exercise top set vs the PREVIOUS
 * session of the same split (▲/═/▼), PR flags, and the volume trail of the
 * last 3 same-split sessions.
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
      const sameType = (p: { started_at: string; day_key?: string | null }) =>
        session.day_key && p.day_key
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
        .select('session_id, exercise_id, weight_kg, reps, is_pr, side, pair_id, exercises!inner(name)')
        .in('session_id', ids)
      const sets = (setsRaw ?? []) as unknown as Array<SetRow & { session_id: string }>

      type Top = { name: string; kg: number; reps: number; isPr: boolean; volumeKg: number; unloaded: boolean }

      /**
       * The exercise's BEST set of a session, plus its tonnage.
       *
       * "Best" used to mean heaviest, full stop — which picks an arbitrary set on
       * any movement that carries no load: every Reverse Crunch set weighs 0, so
       * the card showed set 1 rather than the best of the day. Ranking on
       * (weight, then reps) is correct for both and identical for loaded work.
       */
      const top = (rows: Array<SetRow & { session_id: string }>, sid: string) => {
        const m = new Map<string, Top>()
        // Tonnage is NOT accumulated here. A unilateral pair is two rows, and
        // adding both credited the strong side's extra reps to the weak one —
        // so this card disagreed with the session total it sits next to. The
        // rows are collected whole and folded once, below, through the one rule.
        const perEx = new Map<string, VolumeSet[]>()
        for (const s of rows.filter((r) => r.session_id === sid)) {
          const bucket = perEx.get(s.exercise_id) ?? []
          bucket.push(toVolumeSet(s))
          perEx.set(s.exercise_id, bucket)

          const cur = m.get(s.exercise_id)
          const better = !cur || s.weight_kg > cur.kg || (s.weight_kg === cur.kg && s.reps > cur.reps)
          if (better) {
            m.set(s.exercise_id, {
              name: s.exercises.name, kg: s.weight_kg, reps: s.reps,
              isPr: cur?.isPr || s.is_pr,
              volumeKg: 0,
              unloaded: (cur?.unloaded ?? true) && !(s.weight_kg > 0),
            })
          } else {
            cur.isPr ||= s.is_pr
            cur.unloaded &&= !(s.weight_kg > 0)
          }
        }
        for (const [exId, t] of m) t.volumeKg = sessionVolumeKg(perEx.get(exId) ?? [])
        return m
      }
      const thisTop = top(sets, session.id)
      const prevTop = prev[0] ? top(sets, prev[0].id) : new Map<string, Top>()

      /**
       * The number the two sessions are compared ON.
       *
       * Top LOAD alone was the old basis, and on a double-progression program it
       * is silent exactly where progress happens: hold the load, add reps until
       * the ceiling, then add load. Every rep-progression week read "matched" —
       * the wall of green checkmarks — and bodyweight work, whose load is 0
       * forever, could never read anything else. Estimated 1RM moves with both
       * weight and reps; unloaded work is compared on reps, the axis it has.
       */
      const basis = (t: Top): number => (t.unloaded ? t.reps : (epley1RM(t.kg, t.reps) ?? t.kg))

      const deltas: ExerciseDelta[] = [...thisTop.entries()].map(([exId, t]) => {
        const p = prevTop.get(exId)
        const a = basis(t)
        const b = p ? basis(p) : null
        return {
          exerciseId: exId,
          name: t.name, topKg: t.kg, topReps: t.reps,
          prevKg: p?.kg ?? null, prevReps: p?.reps ?? null,
          volumeKg: Math.round(t.volumeKg * 10) / 10,
          prevVolumeKg: p ? Math.round(p.volumeKg * 10) / 10 : null,
          // null = first log of this exercise (no baseline). A PR also requires a
          // baseline to beat — never a gold star the first time.
          delta: b == null ? null : a > b ? 1 : a < b ? -1 : 0,
          deltaPct: b == null || b === 0 ? null : Math.round(((a - b) / b) * 1000) / 10,
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
