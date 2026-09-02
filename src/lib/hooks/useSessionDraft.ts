'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { COMMIT_SESSION_KEY, type CommitResult, type CommitVars } from '@/lib/sessions/commit'
import { DRAFT_STORAGE_KEY, applySetPatch, buildCommitPayload, cascadeSetEdit, isSetCommitted, peekSessionDraft, type SessionDraft, type DraftSet, type DraftExercise } from '@/lib/sessions/draft'
import { notifyDraftChanged } from '@/lib/sessions/draftStore'

/*
 * The commit's write, its stall recovery and its post-success cascade all moved
 * to `lib/sessions/commit.ts`. They had to: a mutation that survives a reload
 * cannot close over `draft`, and its success cascade cannot live in a component
 * that is no longer mounted. See that file's header.
 */
export type { CommitResult } from '@/lib/sessions/commit'

/**
 * A stats block with nothing in it.
 *
 * MODULE scope, not per render. It was a literal inside the hook and only ever
 * spread from, so `setStats` carried an eslint-disable to keep its identity
 * stable — and `finish` then needed the same exemption for the same reason. One
 * frozen constant is cheaper than two suppressions, and it makes both callbacks
 * honest about their dependencies.
 */
const EMPTY_STATS = Object.freeze({
  duration_min: null, volume_kg: null, sets_completed: null, prs: null,
  avg_hr_bpm: null, calories_kcal: null,
}) as NonNullable<SessionDraft['stats']>


/**
 * The Command Center's draft store: one editable SessionDraft with
 * reducer-style updaters, debounced localStorage autosave (a gym session
 * survives a force-quit), and the commit mutation. The draft clears on
 * successful commit or explicit discard.
 */
export function useSessionDraft() {
  const [draft, setDraft] = useState<SessionDraft | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * ── THE LAST CONTENT CHANGE, NOT THE LAST WRITE ─────────────────────────────
   * `SessionDraft.touchedAt` bounds the screen wake lock, so it must move only
   * when the workout actually moves. Two writes must NOT touch it:
   *
   *   · the `pagehide` / visibility flush below — locking the phone between
   *     sets would otherwise refresh the stamp every single time, and the idle
   *     bound could never be reached;
   *   · hydration — opening the app on an abandoned draft must not revive it.
   *
   * A ref rather than part of `draft`, because stamping through `setDraft`
   * would make every save a state change and re-render the deck.
   */
  const touchedAtRef = useRef<string | null>(null)
  const hydrationPassed = useRef(false)

  // Hydrate a surviving draft once on mount (SSR-safe; migrates v1 drafts).
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const stored = peekSessionDraft()
    if (stored) {
      setDraft(stored)
      // Carry the stored stamp forward. Older drafts have none; `startedAt` is
      // never newer, so falling back to it can only shorten the lock.
      touchedAtRef.current = stored.touchedAt ?? stored.startedAt ?? null
    }
    setHydrated(true)
  }, [])

  // Debounced autosave on every draft change.
  const writeDraft = useCallback((d: SessionDraft | null) => {
    try {
      if (d) {
        const stamped = touchedAtRef.current ? { ...d, touchedAt: touchedAtRef.current } : d
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(stamped))
      } else {
        localStorage.removeItem(DRAFT_STORAGE_KEY)
      }
    } catch { /* storage full/unavailable — non-fatal */ }
    // The app shell reads the draft through `draftStore`, not through this
    // hook — a second `useSessionDraft()` would be a second copy of the state,
    // not a view of it. Storage is where the two trees meet, so every write
    // through it has to say so. See `draftStore.ts`.
    notifyDraftChanged()
  }, [])

  useEffect(() => {
    if (!hydrated) return
    // The first run after hydration is the hydration itself — not a touch.
    if (!hydrationPassed.current) hydrationPassed.current = true
    else if (draft) touchedAtRef.current = new Date().toISOString()
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => writeDraft(draft), 500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [draft, hydrated, writeDraft])

  /**
   * ── FLUSH BEFORE THE PROCESS CAN DIE ────────────────────────────────────────
   * The 500 ms debounce is right for typing and wrong for leaving: iOS kills a
   * backgrounded WKWebView's content process without warning, and everything
   * typed in the half-second before the phone was locked lived only in memory.
   * You came back to a set you had already entered, missing.
   *
   * `pagehide` and the hide half of `visibilitychange` are the last synchronous
   * moments the page is guaranteed to get — iOS never fires `beforeunload`
   * reliably, so those two are the whole budget. Write through, cancel the
   * pending timer, and let the debounce own only the keystroke case it was
   * added for.
   */
  useEffect(() => {
    if (!hydrated) return
    const flush = () => {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
      writeDraft(draft)
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [draft, hydrated, writeDraft])

  // start/discard write through SYNCHRONOUSLY: both are typically followed by
  // an immediate navigation, which would cancel the debounced autosave and
  // either lose the new draft or resurrect the discarded one.
  const start = useCallback((d: SessionDraft) => {
    setDraft(d)
    // Starting a deck IS a touch — this is the one synchronous write that has
    // to stamp, because the debounced path it bypasses is where stamping
    // normally happens.
    touchedAtRef.current = new Date().toISOString()
    const stamped = { ...d, touchedAt: touchedAtRef.current }
    try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(stamped)) } catch { /* ignore */ }
    notifyDraftChanged()
  }, [])
  const discard = useCallback(() => {
    setDraft(null)
    touchedAtRef.current = null
    try { localStorage.removeItem(DRAFT_STORAGE_KEY) } catch { /* ignore */ }
    notifyDraftChanged()
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
          //
          // But it is `applySetPatch`, not a bare spread. The per-SET rules —
          // taking ownership of a rating, and deriving the failure tag from it
          // — are not cascade rules and must not be skipped just because the
          // cascade is. `DraftSet` documents failure as tracked PER SIDE; a
          // bare spread here would light the F badge on a bilateral set taken
          // to failure and not on a per-side one, and `save.ts` would persist
          // that side as `set_type: 'normal'`.
          return { ...ex, sets: ex.sets.map((s, i) => (i === setIdx ? applySetPatch(s, patch) : s)) }
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
        // `setType` comes across too. It did not, so splitting a warm-up or a
        // failure set produced two `normal` sides: the W/F badge vanished and
        // `save.ts` stored work that had been tagged as a warm-up as a working
        // set — which is a set the PR engine then judges.
        const mk = (side: 'L' | 'R'): DraftSet => ({
          weightKg: base.weightKg, reps: base.reps, rpe: base.rpe, done: base.done,
          ...(base.setType ? { setType: base.setType } : {}),
          side, pairId,
        })
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
  const updateCardio = useCallback((localId: string, patch: Partial<Pick<DraftExercise, 'distanceKm' | 'durationSec' | 'inclinePct' | 'note' | 'name' | 'done'>>) => {
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
        // The tick used to also stamp `doneAt`, which fed the live rest
        // stopwatch and, on commit, `workout_sets.rest_sec`. Both are gone —
        // rest is a TARGET the plan prescribes now, not a gap this app times.
        // ── THE TICK GOES THROUGH `applySetPatch` LIKE EVERY OTHER EDIT ──
        // It was a bare spread, and `applySetPatch`'s own header says every
        // path that edits a set calls it — this was the path that did not. The
        // rule it was skipping is the one that makes a committed rating yours:
        // without it, a set you had ticked green at "10 · Failure" still held
        // last session's seed, so the next rep added to it withdrew the rating
        // from a set already declared finished.
        const sets = ex.sets.map((s, i) => {
          if (i === setIdx) return applySetPatch(s, { done: next })
          if (target.pairId && s.pairId === target.pairId) return applySetPatch(s, { done: next })
          return s
        })
        return { ...ex, sets }
      }),
    }))
  }, [])

  /*
   * ── THERE IS NO "CHECK ALL" ─────────────────────────────────────────────────
   * There was: one tap turned every set in an exercise green. It was removed
   * deliberately. The tick is the single assertion this app makes about what
   * actually happened on the gym floor — every downstream number, volume, the
   * PR engine, the muscle distribution, reads it as "I performed this" — and a
   * control that asserts four of them at once from a card you have not looked
   * at makes that claim cheap. Sets are ticked one at a time, as they are done.
   */

  /**
   * Drop one set — and the exercise with it, once its last set has gone.
   *
   * ── THE FILTER USED TO EAT THE TREADMILL ───────────────────────────────────
   * It was `.filter((ex) => ex.sets.length > 0)`, unqualified. A cardio block
   * has NO sets by construction (`addCardio` seeds `sets: []`; the distance,
   * duration and incline live on the exercise itself), so every cardio card in
   * the deck matched that predicate — and removing a set from ANY exercise
   * silently deleted EVERY cardio block in the session.
   *
   * It was invisible at the moment it happened, because the card that vanished
   * was usually scrolled off above the one being edited. What you saw was a
   * treadmill that had been there when you started and was gone when you came
   * back to the deck.
   *
   * The empty-exercise sweep is still right for a strength card — an exercise
   * with no rows is nothing at all — so the guard names the one kind that is
   * allowed to be empty rather than removing the sweep.
   */
  const removeSet = useCallback((localId: string, setIdx: number) => {
    setDraft((d) => d && ({
      ...d,
      exercises: d.exercises
        .map((ex) => ex.localId !== localId ? ex : { ...ex, sets: ex.sets.filter((_, i) => i !== setIdx) })
        .filter((ex) => ex.kind === 'cardio' || ex.sets.length > 0),
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

  /**
   * Manually edit session metadata (duration / avg HR / calories) pre-commit.
   *
   * A duration that arrives through HERE is a number a human typed, so it
   * latches `durationEdited` and the session clock stops overwriting it. The
   * clock's own writer is `setClockDuration`, below.
   */
  const setStats = useCallback((patch: Partial<NonNullable<SessionDraft['stats']>>) => {
    setDraft((d) => {
      if (!d) return d
      const base = d.stats ?? EMPTY_STATS
      const next = { ...d, stats: { ...base, ...patch } }
      if ('duration_min' in patch) next.durationEdited = true
      return next
    })
  }, [])

  /**
   * ── THE CLOCK'S WRITE, WHICH IS NOT AN EDIT ────────────────────────────────
   * Same field, different provenance. This one overwrites freely — every time
   * the finish sheet opens, and once more at commit — and it deliberately does
   * NOT set `durationEdited`, so the next reading replaces it too.
   *
   * That is the whole fix for the frozen duration: pressing Finish at 42 minutes
   * to look at the sheet, closing it, and pressing Finish again at 70 used to
   * store 42, because the sheet only ever filled a field that was still empty.
   * A number you typed is still safe — it comes through `setStats`, which
   * latches the flag, and this then refuses.
   */
  const setClockDuration = useCallback((min: number | null) => {
    setDraft((d) => {
      if (!d || d.durationEdited) return d
      const base = d.stats ?? EMPTY_STATS
      if (base.duration_min === min) return d // no-op: never churn the draft
      return { ...d, stats: { ...base, duration_min: min } }
    })
  }, [])

  /**
   * Pause / resume the session clock.
   *
   * Stored as a timestamp plus a bank of already-elapsed pause time (see
   * `SessionPause`), never as a mutated `startedAt`: that field is read by
   * `save.ts`, `eraForDate` and the re-entry PR gate as the moment the workout
   * began, and it is still true while you are standing still.
   *
   * Background tracking is untouched — the Live Activity, the draft autosave and
   * the rest clock all keep running. The only thing a pause changes is which
   * seconds count toward `duration_min`.
   */
  const togglePause = useCallback(() => {
    setDraft((d) => {
      if (!d) return d
      if (d.pausedAt) {
        const since = Date.parse(d.pausedAt)
        const banked = (d.pausedMs ?? 0) + (Number.isFinite(since) ? Math.max(0, Date.now() - since) : 0)
        return { ...d, pausedAt: null, pausedMs: banked }
      }
      return { ...d, pausedAt: new Date().toISOString() }
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

  /**
   * ── FINISH IS AN OUTBOX ENTRY, NOT A FETCH ────────────────────────────────
   *
   * The write, its stall recovery and its whole post-success cascade live in
   * `lib/sessions/commit.ts` and are registered as a MUTATION DEFAULT by
   * `QueryProvider`. That indirection is the entire point: a mutation that can
   * survive a reload cannot close over `draft`, and TanStack can only re-run a
   * rehydrated one if a function is registered under its key.
   *
   * What that buys: tapping Finish with no signal no longer ends in an error
   * string and a stranded draft. The mutation PAUSES (TanStack's default
   * network mode), is persisted alongside the query cache, survives the app
   * being killed, and runs on the next `resumePausedMutations()` — fired on
   * reconnect and on every native foreground. Safe unattended because the write
   * is idempotent by `clientSessionId`: a retry of a session that landed comes
   * back 409/`duplicate`, not as a second workout.
   *
   * `commit.isPaused` is what the deck renders as "queued".
   */
  const commit = useMutation<CommitResult, unknown, CommitVars>({
    mutationKey: COMMIT_SESSION_KEY,
    onSuccess: () => {
      // The cascade, the widget reloads and the localStorage clear all happen in
      // `afterCommit`, which runs for a resumed commit too. This is the part
      // that needs React: the deck's own copy of the draft.
      setDraft(null)
      touchedAtRef.current = null
    },
  })

  /**
   * ── THE DURATION IS RE-READ AT THE MOMENT OF COMMIT ──────────────────────
   * `durationMin` is what the header's stopwatch says as Complete is pressed. It
   * is applied to a COPY of the draft rather than through `setClockDuration`,
   * because a `setDraft` in the same tick as `mutate` is not visible to the
   * mutation — which is precisely how a stale reading got stored in the first
   * place. Undefined (an edited duration, or a back-dated deck with no clock)
   * leaves the draft's own value alone.
   *
   * The payload is built HERE rather than inside the mutation, because the
   * mutation's variables are what get persisted: they have to be a plain,
   * self-contained, JSON-safe description of the write.
   */
  const finish = useCallback((
    durationMin: number | null | undefined,
    opts?: Parameters<typeof commit.mutate>[1],
  ) => {
    if (!draft) return
    const timed = durationMin != null && !draft.durationEdited
      ? { ...draft, stats: { ...(draft.stats ?? EMPTY_STATS), duration_min: durationMin } }
      : draft
    commit.mutate({ body: buildCommitPayload(timed), date: draft.date }, opts)
  }, [draft, commit])

  return { draft, hydrated, start, discard, finish, updateSet, splitSet, mergeSet, addCardio, updateCardio, addSet, removeSet, toggleSetDone, removeExercise, reorder, setExerciseNote, setStats, setClockDuration, togglePause, setSessionRpe, setDate, commit }
}
