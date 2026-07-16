'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authedFetch } from '@/lib/utils/authedFetch'
import { DRAFT_STORAGE_KEY, buildCommitPayload, type SessionDraft, type DraftSet } from '@/lib/sessions/draft'

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

  // Hydrate a surviving draft once on mount (SSR-safe).
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (raw) setDraft(JSON.parse(raw) as SessionDraft)
    } catch { /* corrupt draft — start clean */ }
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

  const start = useCallback((d: SessionDraft) => setDraft(d), [])
  const discard = useCallback(() => setDraft(null), [])

  const updateSet = useCallback((localId: string, setIdx: number, patch: Partial<DraftSet>) => {
    setDraft((d) => d && ({
      ...d,
      exercises: d.exercises.map((ex) => ex.localId !== localId ? ex : {
        ...ex,
        sets: ex.sets.map((s, i) => (i === setIdx ? { ...s, ...patch } : s)),
      }),
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

  const commit = useMutation({
    mutationFn: async (): Promise<CommitResult> => {
      if (!draft) throw new Error('No draft to commit')
      const body = buildCommitPayload(draft, new Date().toISOString())
      if (!body.sets.length) throw new Error(draft.mode === 'live' ? 'Check off at least one set first' : 'Nothing to commit')
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
      }
      setDraft(null)
      try { localStorage.removeItem(DRAFT_STORAGE_KEY) } catch { /* ignore */ }
    },
  })

  return { draft, hydrated, start, discard, updateSet, addSet, removeSet, reorder, setNotes, commit }
}
