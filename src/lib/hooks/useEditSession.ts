'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { DRAFT_STORAGE_KEY, type SessionDraft, type DraftExercise, type DraftSet } from '@/lib/sessions/draft'
import { activeProgram } from '@/lib/programs'
import { isSetQuality } from '@/lib/training/setTags'
import type { SplitDay } from '@/lib/types/workout'

interface SessRow {
  id: string; started_at: string; split_day: string; day_key: string | null; notes: string | null
  duration_min: number | null; avg_bpm: number | null; calories_burned: number | null
  total_volume_kg: number | null; client_session_id: string | null
  /** Borg CR10 session effort. Newer column — selected defensively below. */
  session_rpe: number | null
}
interface SetRow {
  exercise_id: string; set_number: number; weight_kg: number; reps: number
  rpe: number | null; set_type: string | null; exercise_order: number | null
  /** Optional: the fallback select below omits it, as it does side/pair_id. */
  quality?: string | null
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
      // `session_rpe` was missing from this select, which is how editing a
      // session silently destroyed its effort rating: the deck opened at "Not
      // rated", and re-committing wrote that back over the stored value. Same
      // two-tier shape as the set query below — a pre-migration DB errors on the
      // unknown column, so fall back rather than fail the whole load.
      const SESS_BASE = 'id, started_at, split_day, day_key, notes, duration_min, avg_bpm, calories_burned, total_volume_kg, client_session_id'
      let sRaw: unknown = null
      {
        const withRpe = await supabase.from('workout_sessions')
          .select(`${SESS_BASE}, session_rpe`).eq('id', sessionId).single()
        if (withRpe.error) {
          const base = await supabase.from('workout_sessions').select(SESS_BASE).eq('id', sessionId).single()
          sRaw = base.data ?? null
        } else {
          sRaw = withRpe.data
        }
      }
      const s = sRaw as SessRow | null
      if (!s) return
      // side/pair_id may not exist pre-migration — select them defensively and
      // fall back to the base column set if the query errors on unknown columns.
      let setsRaw: unknown[] | null = null
      {
        const withSide = await supabase.from('workout_sets')
          .select('exercise_id, set_number, weight_kg, reps, rpe, set_type, quality, exercise_order, side, pair_id, exercises!inner(name)')
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
        // All THREE modifiers round-trip. 'dropset' was missing, so editing a
        // session silently promoted every drop set to a normal working set —
        // which then became PR-eligible on the re-commit.
        if (r.set_type === 'warmup' || r.set_type === 'failure' || r.set_type === 'dropset' || r.set_type === 'ghost') set.setType = r.set_type
        // Quality round-trips for the SAME reason 'dropset' had to: an edit
        // re-commits every row, so a field this hook does not read is a field
        // the edit silently erases. `isSetQuality` guards the value on the way
        // back out; guarding it here too means a stale key never enters a draft.
        if (isSetQuality(r.quality)) set.quality = r.quality
        if (r.side === 'L' || r.side === 'R') { set.side = r.side; set.pairId = r.pair_id ?? undefined }
        ex.sets.push(set)
      }

      // No link state to restore: the two sides of a pair are independent now.
      // This block used to re-derive a `linked` flag from the observed symmetry
      // so a later edit would not mirror away the logged asymmetry — the flag
      // itself is gone, and with it the failure mode it was guarding against.

      // Cardio comes back as an interactive CARD, not a line of prose. It used
      // to be flattened into `notes` at commit and there was no way back — this
      // hook reads workout_sets, which never held it — so re-opening a session
      // showed the treadmill block as text in the notes box. Rows written before
      // that changed have no cardio_logs entry and keep their legacy notes line.
      const cardioExercises: DraftExercise[] = []
      try {
        const { data: cardioRaw } = await supabase
          .from('cardio_logs')
          .select('kind, distance_m, duration_min')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true })
        for (const c of (cardioRaw ?? []) as unknown as Array<{
          kind: string | null; distance_m: number | null; duration_min: number | null
        }>) {
          cardioExercises.push({
            localId: `edit-cardio-${i++}-${Math.random().toString(36).slice(2, 7)}`,
            name: c.kind === 'treadmill' || !c.kind ? 'Treadmill' : c.kind,
            kind: 'cardio',
            distanceKm: c.distance_m != null ? c.distance_m / 1000 : undefined,
            durationSec: c.duration_min != null ? Math.round(c.duration_min * 60) : undefined,
            // Ticked, because it is IN `cardio_logs` — `buildCommitPayload` only
            // writes a block that was ticked, so a row that exists is a walk
            // that happened. Rebuilding it unticked would make re-saving an
            // edited session silently drop the treadmill.
            done: true,
            sets: [],
          })
        }
      } catch { /* an un-migrated session_id column just means no cardio card */ }

      const program = activeProgram()
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
        sessionRpe: s.session_rpe ?? undefined,
        stats: {
          duration_min: s.duration_min, volume_kg: s.total_volume_kg, sets_completed: null, prs: null,
          avg_hr_bpm: s.avg_bpm, calories_kcal: s.calories_burned,
        },
        // Cardio first — it is the warm-up, and the deck opens the way the
        // session was performed.
        exercises: [...cardioExercises, ...byEx.values()],
      }
      try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft)) } catch { /* ignore */ }
      router.push('/session')
    } finally {
      setLoading(false)
    }
  }, [router])

  return { load, loading }
}
