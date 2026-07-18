'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authedFetch } from '@/lib/utils/authedFetch'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO, hoursAwakeToday } from '@/lib/utils/day'
import { DRAFT_STORAGE_KEY, buildCommitPayload, cascadeSetEdit, peekSessionDraft, type SessionDraft, type DraftSet } from '@/lib/sessions/draft'

const COMMIT_TIMEOUT_MS = 25_000

/**
 * A commit's POST may write the session server-side but stall before its
 * response reaches the client (the "saved but stuck loading" hang). After a
 * timeout/network error we check whether the session actually landed — keyed by
 * the idempotency id, else the logged date — and proceed if it did.
 */
async function verifyCommitted(clientSessionId: string | undefined, dateISO: string): Promise<CommitResult | null> {
  try {
    let q = supabase.from('workout_sessions').select('id, total_volume_kg, set_count, pr_count')
    if (clientSessionId) {
      q = q.eq('client_session_id', clientSessionId)
    } else {
      const end = new Date(`${dateISO}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1)
      q = q.gte('started_at', `${dateISO}T00:00:00Z`).lt('started_at', `${end.toISOString().slice(0, 10)}T00:00:00Z`)
    }
    const { data } = await q.order('started_at', { ascending: false }).limit(1).maybeSingle()
    const row = data as { id: string; total_volume_kg: number | null; set_count: number | null; pr_count: number | null } | null
    if (!row) return null
    return { sessionId: row.id, totalVolumeKg: row.total_volume_kg ?? 0, setCount: row.set_count ?? 0, prCount: row.pr_count ?? 0, newPRs: [], duplicate: true }
  } catch {
    return null
  }
}

export interface CommitResult {
  sessionId: string
  totalVolumeKg: number
  setCount: number
  prCount: number
  newPRs: Array<{ exerciseName: string; est1rm: number }>
  duplicate?: boolean
}

/**
 * The Command Center's draft store: one editable SessionDraft with
 * reducer-style updaters, debounced localStorage autosave (a gym session
 * survives a force-quit), and the commit mutation. The draft clears on
 * successful commit or explicit discard.
 */
export function useSessionDraft() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<SessionDraft | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hydrate a surviving draft once on mount (SSR-safe; migrates v1 drafts).
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const stored = peekSessionDraft()
    if (stored) setDraft(stored)
    setHydrated(true)
  }, [])

  // Debounced autosave on every draft change.
  useEffect(() => {
    if (!hydrated) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        if (draft) localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
        else localStorage.removeItem(DRAFT_STORAGE_KEY)
      } catch { /* storage full/unavailable — non-fatal */ }
    }, 500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [draft, hydrated])

  // start/discard write through SYNCHRONOUSLY: both are typically followed by
  // an immediate navigation, which would cancel the debounced autosave and
  // either lose the new draft or resurrect the discarded one.
  const start = useCallback((d: SessionDraft) => {
    setDraft(d)
    try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(d)) } catch { /* ignore */ }
  }, [])
  const discard = useCallback(() => {
    setDraft(null)
    try { localStorage.removeItem(DRAFT_STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  // Editing Set 1's weight/reps cascades to later matching sets (Hevy-style);
  // see cascadeSetEdit. Other rows and setType (W/F) edits stay local.
  const updateSet = useCallback((localId: string, setIdx: number, patch: Partial<DraftSet>) => {
    setDraft((d) => d && ({
      ...d,
      exercises: d.exercises.map((ex) =>
        ex.localId !== localId ? ex : { ...ex, sets: cascadeSetEdit(ex.sets, setIdx, patch) }),
    }))
  }, [])

  const addSet = useCallback((localId: string) => {
    setDraft((d) => d && ({
      ...d,
      exercises: d.exercises.map((ex) => {
        if (ex.localId !== localId) return ex
        const last = ex.sets[ex.sets.length - 1] ?? { weightKg: 20, reps: 10 }
        return { ...ex, sets: [...ex.sets, { weightKg: last.weightKg, reps: last.reps }] }
      }),
    }))
  }, [])

  const removeSet = useCallback((localId: string, setIdx: number) => {
    setDraft((d) => d && ({
      ...d,
      exercises: d.exercises
        .map((ex) => ex.localId !== localId ? ex : { ...ex, sets: ex.sets.filter((_, i) => i !== setIdx) })
        .filter((ex) => ex.sets.length > 0),
    }))
  }, [])

  /** Remove a whole exercise card (the cardio card's only removal path). */
  const removeExercise = useCallback((localId: string) => {
    setDraft((d) => d && ({ ...d, exercises: d.exercises.filter((ex) => ex.localId !== localId) }))
  }, [])

  /** dnd-kit reorder: the new localId order after a drag. */
  const reorder = useCallback((orderedIds: string[]) => {
    setDraft((d) => {
      if (!d) return d
      const byId = new Map(d.exercises.map((ex) => [ex.localId, ex]))
      const next = orderedIds.map((id) => byId.get(id)).filter((ex): ex is NonNullable<typeof ex> => !!ex)
      return next.length === d.exercises.length ? { ...d, exercises: next } : d
    })
  }, [])

  const setNotes = useCallback((notes: string) => {
    setDraft((d) => d && ({ ...d, notes }))
  }, [])

  /** Manually edit session metadata (duration / avg HR / calories) pre-commit. */
  const setStats = useCallback((patch: Partial<NonNullable<SessionDraft['stats']>>) => {
    setDraft((d) => {
      if (!d) return d
      const base = d.stats ?? {
        duration_min: null, volume_kg: null, sets_completed: null, prs: null,
        avg_hr_bpm: null, calories_kcal: null, volume_delta_pct_vs_prior: null,
      }
      return { ...d, stats: { ...base, ...patch } }
    })
  }, [])

  /** Per-exercise note (coach note stays editable in the deck). */
  const setExerciseNote = useCallback((localId: string, note: string) => {
    setDraft((d) => d && ({
      ...d,
      exercises: d.exercises.map((ex) => (ex.localId === localId ? { ...ex, note: note || undefined } : ex)),
    }))
  }, [])

  /**
   * Change the logged date (late logging). startedAt is recomputed in lockstep
   * — the DB date, eraForDate and re-entry PR gating all key off startedAt.
   */
  const setDate = useCallback((dateISO: string) => {
    setDraft((d) => d && ({ ...d, date: dateISO, startedAt: `${dateISO}T${d.startedAt.slice(11)}` }))
  }, [])

  const commit = useMutation({
    mutationFn: async (): Promise<CommitResult> => {
      if (!draft) throw new Error('No draft to commit')
      const body = buildCommitPayload(draft)
      if (!body.sets.length) throw new Error('Nothing to commit')
      // Hard timeout so a stalled serverless response can never hang the deck
      // for minutes; on abort/network failure we verify the write landed.
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), COMMIT_TIMEOUT_MS)
      try {
        const res = await authedFetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        })
        const json = await res.json().catch(() => ({}))
        if (res.status === 409) return { ...(json as CommitResult), duplicate: true }
        if (!res.ok) {
          const err = (json as { error?: unknown }).error
          throw new Error(typeof err === 'string' ? err : 'Save failed')
        }
        return json as CommitResult
      } catch (e) {
        // The write may have committed even though the response stalled/aborted.
        const recovered = await verifyCommitted(body.clientSessionId, draft.date)
        if (recovered) return recovered
        throw e instanceof Error ? e : new Error('Save failed')
      } finally {
        clearTimeout(timer)
      }
    },
    onSuccess: (result) => {
      const committedDate = draft?.date
      if (!result.duplicate) {
        qc.invalidateQueries({ queryKey: ['workout_sessions'] })
        qc.invalidateQueries({ queryKey: ['workout_sets'] })
        qc.invalidateQueries({ queryKey: ['continuum'] })
        qc.invalidateQueries({ queryKey: ['day_vault'] }) // the Nexus Train block
        // Readiness/Daily-Score reflect the workout — recompute that day now
        // (force bypasses the finalized freeze for a back-dated log/edit).
        if (committedDate) {
          void authedFetch('/api/compute-score', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: committedDate, force: true, isToday: committedDate === logicalTodayISO(), backfillDays: 0, hoursAwake: hoursAwakeToday() }),
          }).then(() => {
            qc.invalidateQueries({ queryKey: ['daily_scores'] })
            qc.invalidateQueries({ queryKey: ['day_vault', committedDate] })
          }).catch(() => {})
        }
      }
      setDraft(null)
      try { localStorage.removeItem(DRAFT_STORAGE_KEY) } catch { /* ignore */ }
    },
  })

  return { draft, hydrated, start, discard, updateSet, addSet, removeSet, removeExercise, reorder, setNotes, setExerciseNote, setStats, setDate, commit }
}
