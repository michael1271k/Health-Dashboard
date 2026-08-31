import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

/**
 * ── THE OUTBOX ───────────────────────────────────────────────────────────────
 *
 * Finishing a workout is the only write in this app that can lose an hour of
 * work: every set is safe in the localStorage draft until Finish, and Finish
 * used to be a bare POST whose stall recovery ALSO needed the network. Offline,
 * it ended in an error string and a stranded draft with no retry.
 *
 * The commit is now a persisted, resumable mutation. Three properties make that
 * safe rather than reckless, and all three are asserted here:
 *
 *   · a server REJECTION (422/500/empty deck) is never retried and never
 *     stall-recovered — it will say the same thing five times, and recovering a
 *     rejected edit by its reused `client_session_id` is what silently dropped
 *     edits before;
 *   · a transport failure IS retried, because the write is idempotent by
 *     `clientSessionId` — a second attempt at a session that landed comes back
 *     409/`duplicate`, not as a second workout;
 *   · the draft is cleared by `clientSessionId`, not unconditionally. A resumed
 *     commit runs long after the deck that queued it, by which time the user may
 *     have started a DIFFERENT workout, and wiping whatever draft happens to be
 *     in storage would delete live work to tidy up after an old write.
 */

const fetchMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/utils/authedFetch', () => ({ authedFetch: fetchMock }))

const maybeSingle = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/client', () => {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'lt', 'order', 'limit']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.maybeSingle = maybeSingle
  return { supabase: { from: vi.fn(() => chain) } }
})

// The cascade reaches for the score API and the widget bridge; neither is under
// test here and both are no-ops off-native.
vi.mock('@/lib/scoring/applyComputedScore', () => ({ recomputeAndPaint: vi.fn(async () => null) }))

import { postSession, registerCommitMutation, COMMIT_SESSION_KEY, type CommitVars } from '@/lib/sessions/commit'
import { DRAFT_STORAGE_KEY } from '@/lib/sessions/draft'

const json = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const vars = (clientSessionId?: string): CommitVars => ({
  date: '2026-08-31',
  body: {
    date: '2026-08-31',
    clientSessionId,
    sets: [{ exerciseName: 'Barbell Bench Press', weightKg: 80, reps: 5, setNumber: 1, exerciseOrder: 0 }],
  } as unknown as CommitVars['body'],
})

beforeEach(() => {
  fetchMock.mockReset()
  maybeSingle.mockReset()
  maybeSingle.mockResolvedValue({ data: null })
  localStorage.clear()
})
afterEach(() => { vi.useRealTimers() })

describe('postSession', () => {
  it('returns the server result on a clean write', async () => {
    fetchMock.mockResolvedValue(json(200, { sessionId: 's1', totalVolumeKg: 400, setCount: 1, prCount: 0, newPRs: [] }))
    await expect(postSession(vars('abc'))).resolves.toMatchObject({ sessionId: 's1' })
  })

  it('reports a 409 as a duplicate rather than an error — this is what makes retry safe', async () => {
    fetchMock.mockResolvedValue(json(409, { sessionId: 's1', totalVolumeKg: 400, setCount: 1, prCount: 0, newPRs: [] }))
    await expect(postSession(vars('abc'))).resolves.toMatchObject({ sessionId: 's1', duplicate: true })
  })

  it('an empty deck is a rejection, not a network problem', async () => {
    const empty = { date: '2026-08-31', body: { date: '2026-08-31', sets: [] } as unknown as CommitVars['body'] }
    await expect(postSession(empty)).rejects.toThrow(/at least one set/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does NOT stall-recover a definitive server rejection', async () => {
    fetchMock.mockResolvedValue(json(422, { error: 'weight must be positive' }))
    await expect(postSession(vars('abc'))).rejects.toThrow('weight must be positive')
    // The recovery read must not even be attempted — recovering a REJECTED edit
    // by its reused client_session_id is what reported a false duplicate and
    // silently dropped the edit.
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('stall-recovers a transport failure when the write actually landed', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'))
    maybeSingle.mockResolvedValue({ data: { id: 's9', total_volume_kg: 400, set_count: 1, pr_count: 0 } })
    await expect(postSession(vars('abc'))).resolves.toMatchObject({ sessionId: 's9', duplicate: false })
  })

  it('surfaces a transport failure when it did not land', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'))
    maybeSingle.mockResolvedValue({ data: null })
    await expect(postSession(vars('abc'))).rejects.toThrow('Failed to fetch')
  })
})

describe('the registered mutation default', () => {
  const defaultsFor = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    registerCommitMutation(qc)
    return qc.getMutationDefaults(COMMIT_SESSION_KEY as unknown as string[])
  }

  it('registers a mutationFn under the commit key — a persisted mutation has nothing else to call', () => {
    expect(typeof defaultsFor().mutationFn).toBe('function')
  })

  it('retries a transport failure and refuses to retry a server rejection', () => {
    const retry = defaultsFor().retry as (attempt: number, error: unknown) => boolean
    const rejection = Object.assign(new Error('nope'), { serverRejected: true })
    expect(retry(0, new Error('Failed to fetch'))).toBe(true)
    expect(retry(0, rejection)).toBe(false)
    // And it gives up eventually rather than hammering forever.
    expect(retry(99, new Error('Failed to fetch'))).toBe(false)
  })
})

describe('clearing the draft after a commit', () => {
  const runSuccess = async (committedId: string | undefined) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    registerCommitMutation(qc)
    const defaults = qc.getMutationDefaults(COMMIT_SESSION_KEY as unknown as string[])
    const result = { sessionId: 's1', totalVolumeKg: 0, setCount: 1, prCount: 0, newPRs: [], duplicate: true }
    // `duplicate: true` so the score cascade is skipped — this is about the
    // draft, and the cascade is exercised in the app, not in jsdom.
    ;(defaults.onSuccess as (d: unknown, v: unknown) => void)(result, vars(committedId))
  }

  it('removes the draft it committed', async () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ clientSessionId: 'abc', date: '2026-08-31' }))
    await runSuccess('abc')
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('leaves a DIFFERENT workout alone — a resumed commit must not eat live work', async () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ clientSessionId: 'today', date: '2026-09-01' }))
    await runSuccess('yesterday')
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull()
  })
})
