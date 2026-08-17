'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authedFetch } from '@/lib/utils/authedFetch'
import { supabase } from '@/lib/supabase/client'
import { invalidateWorkoutData } from '@/lib/query/workoutKeys'
import { recomputeAndPaint } from '@/lib/scoring/applyComputedScore'
import { logicalTodayISO, hoursAwakeToday } from '@/lib/utils/day'
import { DRAFT_STORAGE_KEY, buildCommitPayload, cascadeSetEdit, isSetCommitted, peekSessionDraft, type SessionDraft, type DraftSet, type DraftExercise } from '@/lib/sessions/draft'
import type { PrAxis } from '@/lib/sessions/save'

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
    // duplicate:false so onSuccess re-invalidates — a recovered write is uncertain
    // (may carry fresh edited totals); always refresh the UI rather than skip it.
    return { sessionId: row.id, totalVolumeKg: row.total_volume_kg ?? 0, setCount: row.set_count ?? 0, prCount: row.pr_count ?? 0, newPRs: [], duplicate: false }
  } catch {
    return null
  }
}

export interface CommitResult {
  sessionId: string
  totalVolumeKg: number
  setCount: number
  prCount: number
  newPRs: Array<{ exerciseName: string; est1rm: number; axes: PrAxis[] }>
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
  // see cascadeSetEdit. Other rows and setType (W/F) edits stay local. A
  // unilateral pair bypasses BOTH: each side is edited alone, so a genuinely
  // weaker arm can be recorded. setType (F) is per side too.
  const updateSet = useCallback((localId: string, setIdx: number, patch: Partial<DraftSet>) => {
    setDraft((d) => d && ({
      ...d,
      exercises: d.exercises.map((ex) => {
        if (ex.localId !== localId) return ex
        const target = ex.sets[setIdx]
        if (target?.pairId) {
          // A SIDE IS EDITED ALONE. This used to mirror weight and reps to the
          // other side whenever the pair was "linked" (the default), which
          // defeats the only reason to split a set: an arm that is genuinely
          // weaker cannot be recorded if typing its number silently rewrites
          // the other one. The Linked toggle is gone and so is the mirror.
          //
          // No cascade either. `cascadeSetEdit` fires from set 1 to later sets
          // that shared its value — and the other side of a first-set pair
          // always shares it, so cascading here would be mirroring under a
          // different name.
          return { ...ex, sets: ex.sets.map((s, i) => (i === setIdx ? { ...s, ...patch } : s)) }
        }
        return { ...ex, sets: cascadeSetEdit(ex.sets, setIdx, patch) }
      }),
    }))
  }, [])

  /** Unilateral: split a normal set into independent Left + Right sub-rows. */
  const splitSet = useCallback((localId: string, setIdx: number) => {
    setDraft((d) => d && ({
      ...d,
      exercises: d.exercises.map((ex) => {
        if (ex.localId !== localId) return ex
        const base = ex.sets[setIdx]
        if (!base || base.pairId) return ex // absent or already split
        const pairId = `pair_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
        const mk = (side: 'L' | 'R'): DraftSet => ({ weightKg: base.weightKg, reps: base.reps, rpe: base.rpe, done: base.done, side, pairId })
        return { ...ex, sets: [...ex.sets.slice(0, setIdx), mk('L'), mk('R'), ...ex.sets.slice(setIdx + 1)] }
      }),
    }))
  }, [])

  /** Unilateral: collapse a L/R pair back into one bilateral set (keeps Left's numbers). */
  const mergeSet = useCallback((localId: string, pairId: string) => {
    setDraft((d) => d && ({
      ...d,
      exercises: d.exercises.map((ex) => {
        if (ex.localId !== localId) return ex
        let placed = false
        const sets: DraftSet[] = []
        for (const s of ex.sets) {
          if (s.pairId === pairId) {
            if (!placed) { sets.push({ weightKg: s.weightKg, reps: s.reps, rpe: s.rpe, done: s.done }); placed = true }
          } else sets.push(s)
        }
        return { ...ex, sets }
      }),
    }))
  }, [])

  /**
   * Add a cardio block to the deck.
   *
   * A FIRST-CLASS DECK ENTRY, not a fixed warm-up slot. Cardio used to exist
   * only as the Treadmill card `buildTemplateDraft` prepends, with no way to add
   * a second one — so a finisher had nowhere to go and got typed into the notes
   * box. It sorts with everything else (dnd-kit already handles it), and commits
   * to `cardio_logs` rather than `workout_sets`.
   *
   * Appended at the END: a block added mid-session is almost always a finisher,
   * and dragging it up is one gesture if it is not.
   */
  const addCardio = useCallback((name = 'Treadmill') => {
    setDraft((d) => d && ({
      ...d,
      exercises: [...d.exercises, {
        localId: `cardio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name, kind: 'cardio' as const, sets: [],
      }],
    }))
  }, [])

  /** Edit a cardio block's distance / duration / note. */
  const updateCardio = useCallback((localId: string, patch: Partial<Pick<DraftExercise, 'distanceKm' | 'durationSec' | 'note' | 'name'>>) => {
    setDraft((d) => d && ({
      ...d,
      exercises: d.exercises.map((ex) => (ex.localId === localId ? { ...ex, ...patch } : ex)),
    }))
  }, [])

  const addSet = useCallback((localId: string) => {
    setDraft((d) => d && ({
      ...d,
      exercises: d.exercises.map((ex) => {
        if (ex.localId !== localId) return ex
        const last = ex.sets[ex.sets.length - 1] ?? { weightKg: 20, reps: 10 }
        // A freshly added set is not yet performed → opens unchecked.
        return { ...ex, sets: [...ex.sets, { weightKg: last.weightKg, reps: last.reps, done: false }] }
      }),
    }))
  }, [])

  /** Tick a set complete (green) / uncomplete. Pair-aware: toggling one side of
   *  a unilateral pair toggles both, so a pair is never half-committed. */
  const toggleSetDone = useCallback((localId: string, setIdx: number) => {
    setDraft((d) => d && ({
      ...d,
      exercises: d.exercises.map((ex) => {
        if (ex.localId !== localId) return ex
        const target = ex.sets[setIdx]
        if (!target) return ex
        const next = !isSetCommitted(target) // currently unchecked → check it
        // The tick is also the only honest timestamp in a logging session: it
        // is the moment you stopped. Both halves of a pair carry it, because a
        // pair is one set and its rest starts when the second arm finishes.
        const stamp = next ? { doneAt: Date.now() } : { doneAt: undefined }
        const sets = ex.sets.map((s, i) => {
          if (i === setIdx) return { ...s, done: next, ...stamp }
          if (target.pairId && s.pairId === target.pairId) return { ...s, done: next, ...stamp }
          return s
        })
        return { ...ex, sets }
      }),
    }))
  }, [])

  /** "Check all" — mark every set in the exercise complete (green). */
  const checkAllSets = useCallback((localId: string) => {
    setDraft((d) => d && ({
      ...d,
      exercises: d.exercises.map((ex) =>
        ex.localId === localId
          // "Check all" stamps nothing: these sets did not finish now, and a
          // rest timer counting from a bulk action would be a fiction.
          ? { ...ex, sets: ex.sets.map((s) => ({ ...s, done: true })) }
          : ex),
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
        avg_hr_bpm: null, calories_kcal: null,
      }
      return { ...d, stats: { ...base, ...patch } }
    })
  }, [])

  /** Borg CR10 session effort, set on the commit bar. Null clears the rating. */
  const setSessionRpe = useCallback((v: number | null) => {
    setDraft((d) => (d ? { ...d, sessionRpe: v ?? undefined } : d))
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
      // Only checked (green) sets are recorded — zero checked means nothing happened.
      if (!body.sets.length) throw new Error('Check at least one set to finish')
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
          const rejection = new Error(typeof err === 'string' ? err : 'Save failed')
          // Flag definitive server rejections (422 validation, 500, …) so the
          // catch below does NOT run stall-recovery on them. A rejected edit
          // leaves the old session in place; recovering it by the reused
          // client_session_id reported a false "duplicate" and silently dropped
          // the edit — the root of the edit-persist bug.
          ;(rejection as { serverRejected?: boolean }).serverRejected = true
          throw rejection
        }
        return json as CommitResult
      } catch (e) {
        // A definitive server rejection must surface — never mask it as recovered.
        if ((e as { serverRejected?: boolean } | null)?.serverRejected) throw e
        // Genuine network stall/abort: the write may have landed. Verify, and if
        // found treat it as a real (non-duplicate) result so onSuccess refreshes.
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
        // One cascade: refresh EVERY workout-derived surface (charts, muscle map,
        // PRs, projected weights, session #, timeline) — not just these four.
        invalidateWorkoutData(qc)
        // Readiness/Daily-Score reflect the workout — recompute that day now
        // (force bypasses the finalized freeze for a back-dated log/edit).
        //
        // The recompute's own result is painted straight into the cache, so the
        // battery moves the moment the POST returns rather than after a refetch
        // that used to race it and lose. The invalidations below still run, for
        // everything derived from the score — but nothing visible waits on them.
        if (committedDate) {
          // EVERY kind. A commit is the one write that reaches all of them:
          // today's session, the calendar ring, the streak, the week's tonnage,
          // the score and the battery. This is the moment Training's reload
          // budget is FOR — which is why the day-to-day writes above spend
          // DAY_KINDS and leave it alone.
          void recomputeAndPaint(qc, committedDate, {
            force: true, isToday: committedDate === logicalTodayISO(),
            backfillDays: 0, hoursAwake: hoursAwakeToday(),
          }, authedFetch).then(() => {
            qc.invalidateQueries({ queryKey: ['today'] })
            qc.invalidateQueries({ queryKey: ['readiness_today'] })
            qc.invalidateQueries({ queryKey: ['day_vault', committedDate] })
          })
        }
      }
      setDraft(null)
      try { localStorage.removeItem(DRAFT_STORAGE_KEY) } catch { /* ignore */ }
    },
  })

  return { draft, hydrated, start, discard, updateSet, splitSet, mergeSet, addCardio, updateCardio, addSet, removeSet, toggleSetDone, checkAllSets, removeExercise, reorder, setNotes, setExerciseNote, setStats, setSessionRpe, setDate, commit }
}
