'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { eraForDate, programDayFor, DEFAULT_PROGRAM_ID } from '@/lib/programs'

export interface ExerciseDelta {
  name: string
  topKg: number
  topReps: number
  prevKg: number | null
  delta: -1 | 0 | 1
  isPr: boolean
}
export interface SessionIntel {
  deltas: ExerciseDelta[]
  prs: Array<{ name: string; kg: number; reps: number }>
  volumes: Array<{ date: string; volumeKg: number }>  // this + previous SAME-TYPE sessions (asc)
  typeLabel: string          // era-aware session-type name, e.g. "Upper A"
  volumeDeltaPct: number | null   // this vs previous same-type session
  setsDelta: number | null
  computedVolumeKg: number   // fallback when the session row lacks totals
  computedSets: number
}

type SetRow = { exercise_id: string; weight_kg: number; reps: number; is_pr: boolean; exercises: { name: string } }

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
      const { data: sess } = await supabase
        .from('workout_sessions')
        .select('id, started_at, split_day, total_volume_kg')
        .eq('id', sessionId as string)
        .single()
      const session = sess as { id: string; started_at: string; split_day: string; total_volume_kg: number | null } | null
      const empty: SessionIntel = { deltas: [], prs: [], volumes: [], typeLabel: '', volumeDeltaPct: null, setsDelta: null, computedVolumeKg: 0, computedSets: 0 }
      if (!session) return empty

      // SAME-TYPE matching: split_day alone mixes Upper A and Upper B (both
      // 'upper'). The session TYPE = split_day + weekday (Upper A = Sun,
      // Upper B = Thu), so fetch recent same-split sessions and filter by weekday.
      // STRICT ERA BOUNDARY: a HELIX session NEVER compares against a
      // PPL-legacy one (different program, loads, rep schemes) — the first HELIX
      // session of each type has no baseline, by design.
      const weekday = new Date(session.started_at).getUTCDay()
      const sessionEra = eraForDate(session.started_at.slice(0, 10))
      const typeLabel = sessionTypeLabel(session.started_at.slice(0, 10), session.split_day, weekday)
      const { data: prevRaw } = await supabase
        .from('workout_sessions')
        .select('id, started_at, total_volume_kg')
        .eq('split_day', session.split_day)
        .lt('started_at', session.started_at)
        .order('started_at', { ascending: false })
        .limit(12)
      const prev = ((prevRaw ?? []) as Array<{ id: string; started_at: string; total_volume_kg: number | null }>)
        .filter((p) => new Date(p.started_at).getUTCDay() === weekday)
        .filter((p) => eraForDate(p.started_at.slice(0, 10)) === sessionEra)
        .slice(0, 2)

      const ids = [session.id, ...prev.map((p) => p.id)]
      const { data: setsRaw } = await supabase
        .from('workout_sets')
        .select('session_id, exercise_id, weight_kg, reps, is_pr, exercises!inner(name)')
        .in('session_id', ids)
      const sets = (setsRaw ?? []) as unknown as Array<SetRow & { session_id: string }>

      const top = (rows: Array<SetRow & { session_id: string }>, sid: string) => {
        const m = new Map<string, { name: string; kg: number; reps: number; isPr: boolean }>()
        for (const s of rows.filter((r) => r.session_id === sid)) {
          const cur = m.get(s.exercise_id)
          if (!cur || s.weight_kg > cur.kg) m.set(s.exercise_id, { name: s.exercises.name, kg: s.weight_kg, reps: s.reps, isPr: cur?.isPr || s.is_pr })
          else if (s.is_pr) cur.isPr = true
        }
        return m
      }
      const thisTop = top(sets, session.id)
      const prevTop = prev[0] ? top(sets, prev[0].id) : new Map<string, { name: string; kg: number; reps: number; isPr: boolean }>()

      const deltas: ExerciseDelta[] = [...thisTop.entries()].map(([exId, t]) => {
        const p = prevTop.get(exId)
        return {
          name: t.name, topKg: t.kg, topReps: t.reps, prevKg: p?.kg ?? null,
          delta: p == null ? 0 : t.kg > p.kg ? 1 : t.kg < p.kg ? -1 : 0,
          isPr: t.isPr,
        }
      })

      // Fallback totals computed from the fetched sets (guaranteed chips)
      const thisSets = sets.filter((s) => s.session_id === session.id)
      const computedVolumeKg = Math.round(thisSets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0))
      const computedSets = thisSets.length
      const thisVolume = session.total_volume_kg ?? computedVolumeKg

      const volumes = [...[...prev].reverse(), { id: session.id, started_at: session.started_at, total_volume_kg: thisVolume }]
        .filter((s) => s.total_volume_kg != null)
        .map((s) => ({ date: s.started_at.slice(0, 10), volumeKg: s.total_volume_kg as number }))

      // Header Δ vs the previous SAME-TYPE session
      const prevVol = prev[0]?.total_volume_kg ?? null
      const volumeDeltaPct = prevVol && thisVolume ? Math.round(((thisVolume - prevVol) / prevVol) * 100) : null
      const setsDelta = prev[0] ? computedSets - sets.filter((s) => s.session_id === prev[0].id).length : null

      return {
        deltas,
        prs: deltas.filter((d) => d.isPr).map((d) => ({ name: d.name, kg: d.topKg, reps: d.topReps })),
        volumes,
        typeLabel,
        volumeDeltaPct,
        setsDelta,
        computedVolumeKg,
        computedSets,
      }
    },
  })
}

/** Era-aware session-type name: HELIX era → program-day label (weekday-matched); PPL → split. */
function sessionTypeLabel(dateISO: string, splitDay: string, weekday: number): string {
  if (eraForDate(dateISO) === 'axis') {
    const d = programDayFor(DEFAULT_PROGRAM_ID, weekday)
    if (d !== 'rest') return d.sub ? `${d.label} · ${d.sub}` : d.label
  }
  return splitDay[0].toUpperCase() + splitDay.slice(1)
}
