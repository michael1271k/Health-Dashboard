'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { DRAFT_STORAGE_KEY, type SessionDraft, type DraftExercise, type DraftSet } from '@/lib/sessions/draft'
import { PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId } from '@/lib/programs'
import type { SplitDay } from '@/lib/types/workout'

interface SessRow {
  id: string; started_at: string; split_day: string; day_key: string | null; notes: string | null
  duration_min: number | null; avg_bpm: number | null; calories_burned: number | null
  total_volume_kg: number | null; client_session_id: string | null
}
interface SetRow {
  exercise_id: string; set_number: number; weight_kg: number; reps: number
  rpe: number | null; set_type: string | null; exercise_order: number | null
  side: string | null; pair_id: string | null
  exercises: { name: string }
}

/**
 * Load a committed session back into the Command Center deck for editing. The
 * rebuilt draft carries `replaceSessionId`, so committing deletes the old
 * session + sets and re-inserts the edits (safe patch — see saveSession).
 */
export function useEditSession() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (sessionId: string) => {
    setLoading(true)
    try {
      const { data: sRaw } = await supabase.from('workout_sessions')
        .select('id, started_at, split_day, day_key, notes, duration_min, avg_bpm, calories_burned, total_volume_kg, client_session_id')
        .eq('id', sessionId).single()
      const s = sRaw as SessRow | null
      if (!s) return
      // side/pair_id may not exist pre-migration — select them defensively and
      // fall back to the base column set if the query errors on unknown columns.
      let setsRaw: unknown[] | null = null
      {
        const withSide = await supabase.from('workout_sets')
          .select('exercise_id, set_number, weight_kg, reps, rpe, set_type, exercise_order, side, pair_id, exercises!inner(name)')
          .eq('session_id', sessionId)
          .order('exercise_order', { ascending: true }).order('set_number', { ascending: true })
        if (withSide.error) {
          const base = await supabase.from('workout_sets')
            .select('exercise_id, set_number, weight_kg, reps, rpe, set_type, exercise_order, exercises!inner(name)')
            .eq('session_id', sessionId)
            .order('exercise_order', { ascending: true }).order('set_number', { ascending: true })
          setsRaw = base.data ?? []
        } else {
          setsRaw = withSide.data ?? []
        }
      }
      const rows = (setsRaw ?? []) as unknown as SetRow[]

      let i = 0
      const byEx = new Map<string, DraftExercise>()
      for (const r of rows) {
        let ex = byEx.get(r.exercise_id)
        if (!ex) {
          ex = { localId: `edit-${i++}-${Math.random().toString(36).slice(2, 7)}`, name: r.exercises.name, sets: [] }
          byEx.set(r.exercise_id, ex)
        }
        const set: DraftSet = { weightKg: r.weight_kg, reps: r.reps }
        if (r.rpe != null) set.rpe = r.rpe
        if (r.set_type === 'warmup' || r.set_type === 'failure') set.setType = r.set_type
        if (r.side === 'L' || r.side === 'R') { set.side = r.side; set.pairId = r.pair_id ?? undefined }
        ex.sets.push(set)
      }

      // Restore each unilateral pair's link state: matching weight+reps on both
      // sides ⇒ still linked; asymmetric ⇒ unlinked (so a later edit won't
      // clobber the logged asymmetry by mirroring).
      for (const ex of byEx.values()) {
        const pairs = new Map<string, DraftSet[]>()
        for (const s of ex.sets) if (s.pairId) { const g = pairs.get(s.pairId) ?? []; g.push(s); pairs.set(s.pairId, g) }
        for (const g of pairs.values()) {
          const linked = g.length === 2 && g[0].weightKg === g[1].weightKg && g[0].reps === g[1].reps
          for (const s of g) s.linked = linked
        }
      }

      const program = PROGRAMS[getActiveProgramId()] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
      const dayLabel = s.day_key ? program.days.find((d) => d.key === s.day_key)?.label : undefined
      const draft: SessionDraft = {
        clientSessionId: s.client_session_id ?? `edit-${sessionId}`,
        replaceSessionId: sessionId,
        dayKey: (s.day_key ?? undefined) as SessionDraft['dayKey'],
        splitDay: s.split_day as SplitDay,
        date: s.started_at.slice(0, 10),
        title: dayLabel ?? (s.split_day[0].toUpperCase() + s.split_day.slice(1)),
        notes: s.notes ?? '',
        // Normalize the DB timestamptz (`…+00:00`) to a `Z` instant so the commit
        // payload validates and setDate's `slice(11)` keeps a clean offsetless time.
        startedAt: new Date(s.started_at).toISOString(),
        stats: {
          duration_min: s.duration_min, volume_kg: s.total_volume_kg, sets_completed: null, prs: null,
          avg_hr_bpm: s.avg_bpm, calories_kcal: s.calories_burned, volume_delta_pct_vs_prior: null,
        },
        exercises: [...byEx.values()],
      }
      try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft)) } catch { /* ignore */ }
      router.push('/session')
    } finally {
      setLoading(false)
    }
  }, [router])

  return { load, loading }
}
