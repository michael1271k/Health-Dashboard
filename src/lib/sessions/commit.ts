'use client'

import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { authedFetch } from '@/lib/utils/authedFetch'
import { invalidateWorkoutData } from '@/lib/query/workoutKeys'
import { recomputeAndPaint } from '@/lib/scoring/applyComputedScore'
import { logicalTodayISO, hoursAwakeToday } from '@/lib/utils/day'
import { DRAFT_STORAGE_KEY } from '@/lib/sessions/draft'
import { notifyDraftChanged } from '@/lib/sessions/draftStore'
import type { SaveWorkoutInput } from '@/lib/sessions/schema'
import type { PrAxis } from '@/lib/sessions/save'

/**
 * ── THE ONE WRITE IN THIS APP THAT CAN LOSE WORK ─────────────────────────────
 *
 * Every set logged during a workout is safe without a network: it lives in the
 * draft, which `useSessionDraft` debounce-writes to localStorage and flushes on
 * `pagehide`. Nothing is at risk until Finish.
 *
 * Finish was a bare `POST /api/sessions`, and its stall-recovery
 * (`verifyCommitted`) also needs the network — so with no signal the mutation
 * simply ended in an error string on the deck, holding a draft, with no retry
 * and nothing watching for the connection to come back. In a basement gym that
 * is the normal case, not the edge case.
 *
 * This module makes the commit a RESUMABLE mutation:
 *
 *   · the write is a free function over its own variables, with no React and no
 *     closure over the draft — the only shape a mutation can have if it is to
 *     survive a reload and run again from a rehydrated cache;
 *   · it is registered as a mutation DEFAULT (see `registerCommitMutation`), so
 *     a mutation restored from localStorage has a function to call. A persisted
 *     mutation carries only its key and its variables;
 *   · `networkMode` is left at TanStack's default, which PAUSES rather than
 *     fails while offline. A paused mutation is persisted, survives the reload,
 *     and runs on `resumePausedMutations()`;
 *   · the whole post-commit cascade lives here rather than in the hook, because
 *     a resumed commit has no deck mounted to run it.
 *
 * Unattended retry is only safe because the write is idempotent by
 * `clientSessionId`: a second attempt for a session that landed returns 409 and
 * is reported as `duplicate`, not as a second workout. That property is what
 * makes this an outbox rather than a way to log Tuesday twice.
 */

/** Mutation key for the commit. Shared by the hook and the persisted default. */
export const COMMIT_SESSION_KEY = ['commitSession'] as const

const COMMIT_TIMEOUT_MS = 25_000

/** Attempts before a genuinely failing network write gives up and surfaces. */
const COMMIT_MAX_RETRIES = 5

export interface CommitResult {
  sessionId: string
  totalVolumeKg: number
  setCount: number
  prCount: number
  newPRs: Array<{ exerciseName: string; est1rm: number; axes: PrAxis[] }>
  duplicate?: boolean
}

/**
 * Everything the write needs, and nothing that cannot be JSON.
 *
 * `date` travels alongside the body because stall recovery falls back to it when
 * there is no idempotency id, and because the score recompute is keyed on the
 * day the session was LOGGED TO, which is not necessarily today.
 */
export interface CommitVars {
  body: SaveWorkoutInput
  date: string
}

/** A rejection the server MEANT — never retried, never stall-recovered. */
function isServerRejection(e: unknown): boolean {
  return !!(e as { serverRejected?: boolean } | null)?.serverRejected
}

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
    // duplicate:false so the cascade re-invalidates — a recovered write is
    // uncertain (may carry fresh edited totals); always refresh the UI rather
    // than skip it.
    return { sessionId: row.id, totalVolumeKg: row.total_volume_kg ?? 0, setCount: row.set_count ?? 0, prCount: row.pr_count ?? 0, newPRs: [], duplicate: false }
  } catch {
    return null
  }
}

/** The write itself. No React, no draft — see the module header. */
export async function postSession({ body, date }: CommitVars): Promise<CommitResult> {
  // Only checked (green) sets are recorded — zero checked means nothing happened.
  if (!body.sets.length) {
    const empty = new Error('Check at least one set to finish')
    ;(empty as { serverRejected?: boolean }).serverRejected = true
    throw empty
  }
  // Hard timeout so a stalled serverless response can never hang the deck for
  // minutes; on abort/network failure we verify the write landed.
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
      // Flag definitive server rejections (422 validation, 500, …) so the catch
      // below does NOT run stall-recovery on them, and so the retry policy does
      // not spend five attempts on an answer that will not change. A rejected
      // edit leaves the old session in place; recovering it by the reused
      // client_session_id reported a false "duplicate" and silently dropped the
      // edit — the root of the edit-persist bug.
      ;(rejection as { serverRejected?: boolean }).serverRejected = true
      throw rejection
    }
    return json as CommitResult
  } catch (e) {
    if (isServerRejection(e)) throw e
    // Genuine network stall/abort: the write may have landed. Verify, and if
    // found treat it as a real (non-duplicate) result so the cascade refreshes.
    const recovered = await verifyCommitted(body.clientSessionId, date)
    if (recovered) return recovered
    throw e instanceof Error ? e : new Error('Save failed')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Drop the draft this commit consumed.
 *
 * Guarded by `clientSessionId`: a resumed commit runs long after the deck that
 * created it, and by then the user may have started a DIFFERENT workout. Wiping
 * whatever draft happens to be in storage would then delete live work to tidy up
 * after a write that finished. Only the matching draft is removed.
 */
function clearCommittedDraft(clientSessionId: string | undefined): void {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return
    if (clientSessionId) {
      const held = (JSON.parse(raw) as { clientSessionId?: string }).clientSessionId
      if (held && held !== clientSessionId) return
    }
    localStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch { /* unreadable storage — the hook's own clear still runs */ }
  // The session is committed and the draft is gone — the pill in the app shell
  // has to hear that, or a finished workout keeps floating above the tab bar
  // until the next navigation.
  notifyDraftChanged()
}

/**
 * Everything that must happen after a commit lands, wherever it landed from.
 *
 * This used to live in the deck's `onSuccess`. A resumed commit has no deck, so
 * it lives with the write.
 */
function afterCommit(qc: QueryClient, result: CommitResult, vars: CommitVars): void {
  if (!result.duplicate) {
    // One cascade: refresh EVERY workout-derived surface (charts, muscle map,
    // PRs, projected weights, session #, timeline) — not just the obvious few.
    invalidateWorkoutData(qc)
    // Readiness/Daily-Score reflect the workout — recompute that day now (force
    // bypasses the finalized freeze for a back-dated log/edit).
    //
    // The recompute's own result is painted straight into the cache, so the
    // battery moves the moment the POST returns rather than after a refetch that
    // used to race it and lose. The invalidations below still run, for
    // everything derived from the score — but nothing visible waits on them.
    //
    // EVERY widget kind. A commit is the one write that reaches all of them:
    // today's session, the calendar ring, the streak, the week's tonnage, the
    // score and the battery. This is the moment Training's reload budget is FOR
    // — which is why the day-to-day writes spend DAY_KINDS and leave it alone.
    void recomputeAndPaint(qc, vars.date, {
      force: true, isToday: vars.date === logicalTodayISO(),
      backfillDays: 0, hoursAwake: hoursAwakeToday(),
    }, authedFetch).then(() => {
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['readiness_today'] })
      qc.invalidateQueries({ queryKey: ['day_vault', vars.date] })
    })
  }
  clearCommittedDraft(vars.body.clientSessionId)
}

/**
 * Register the commit as a mutation default.
 *
 * MUST run before the persisted cache is restored, or a rehydrated paused
 * mutation has no `mutationFn` and is dropped on the floor — which is the
 * failure mode this whole module exists to prevent, arriving silently. It is
 * called from `QueryProvider`'s client factory for exactly that reason.
 */
export function registerCommitMutation(qc: QueryClient): void {
  // `setMutationDefaults` is typed against `unknown` variables — a persisted
  // mutation's variables come back off JSON and the cache cannot know their
  // shape. The cast is the one place that knowledge lives; every caller goes
  // through the typed `CommitVars` above.
  qc.setMutationDefaults(COMMIT_SESSION_KEY, {
    mutationFn: ((vars: unknown) => postSession(vars as CommitVars)),
    // A 422/500 will say the same thing five times. Only transport failures are
    // worth another attempt.
    retry: (attempt: number, error: unknown) => !isServerRejection(error) && attempt < COMMIT_MAX_RETRIES,
    retryDelay: (attempt: number) => Math.min(30_000, 1_000 * 2 ** attempt),
    onSuccess: (data: unknown, vars: unknown) => afterCommit(qc, data as CommitResult, vars as CommitVars),
  })
}
