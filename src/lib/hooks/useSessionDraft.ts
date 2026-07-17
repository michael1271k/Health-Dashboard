'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authedFetch } from '@/lib/utils/authedFetch'
import { DRAFT_STORAGE_KEY, buildCommitPayload, cascadeSetEdit, peekSessionDraft, type SessionDraft, type DraftSet } from '@/lib/sessions/draft'

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
      const res = await authedFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 409) return { ...(json as CommitResult), duplicate: true }
      if (!res.ok) {
        const err = (json as { error?: unknown }).error
        throw new Error(typeof err === 'string' ? err : 'Save failed')
      }
      return json as CommitResult
    },
    onSuccess: (result) => {
      if (!result.duplicate) {
        qc.invalidateQueries({ queryKey: ['workout_sessions'] })
        qc.invalidateQueries({ queryKey: ['workout_sets'] })
        qc.invalidateQueries({ queryKey: ['continuum'] })
        qc.invalidateQueries({ queryKey: ['day_vault'] }) // the Nexus Train block
      }
      setDraft(null)
      try { localStorage.removeItem(DRAFT_STORAGE_KEY) } catch { /* ignore */ }
    },
  })

  return { draft, hydrated, start, discard, updateSet, addSet, removeSet, removeExercise, reorder, setNotes, setExerciseNote, setDate, commit }
}
