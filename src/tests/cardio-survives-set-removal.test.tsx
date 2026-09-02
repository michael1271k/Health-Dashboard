import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSessionDraft } from '@/lib/hooks/useSessionDraft'
import { DRAFT_STORAGE_KEY, type SessionDraft } from '@/lib/sessions/draft'

/**
 * ── THE TREADMILL USED TO VANISH, AND NOTHING SAID SO ────────────────────────
 *
 * `removeSet` swept empty exercises out of the deck with an unqualified
 * `.filter((ex) => ex.sets.length > 0)`. A cardio block has NO sets by
 * construction — `addCardio` seeds `sets: []` and the distance, duration and
 * incline live on the exercise itself — so every cardio card in the session
 * matched that predicate, and deleting ONE set from ANY exercise silently
 * deleted EVERY treadmill block in the draft.
 *
 * It is the worst shape a bug can have: no error, no visible moment, and the
 * card that disappeared was usually scrolled off above the row being edited. It
 * surfaced as "I started the treadmill, minimised the session, came back, and
 * the treadmill was gone" — which sounds like a persistence bug and is not one.
 * The draft was written to localStorage perfectly; it simply no longer had the
 * treadmill in it.
 *
 * The sweep itself is right — a strength exercise with no rows is nothing at all
 * — so the guard names the one kind that is ALLOWED to be empty rather than
 * removing it. These tests hold both halves of that, because deleting the sweep
 * would pass a test that only checked the treadmill.
 */

const DRAFT = {
  clientSessionId: 'test-session',
  splitDay: 'Delts & Arms',
  dayKey: 'arms',
  date: '2026-09-01',
  startedAt: '2026-09-01T09:00:00.000Z',
  notes: '',
  exercises: [
    {
      localId: 'cardio-1',
      name: 'Treadmill',
      kind: 'cardio',
      distanceKm: 0.37,
      durationSec: 300,
      done: true,
      sets: [],
    },
    {
      localId: 'lat-raise',
      name: 'Lateral Raise Cable',
      kind: 'strength',
      sets: [
        { weightKg: 5, reps: 15, done: true },
        { weightKg: 5, reps: 14, done: false },
      ],
    },
  ],
} as unknown as SessionDraft

function names(d: SessionDraft | null): string[] {
  return (d?.exercises ?? []).map((e) => e.name)
}

/** The store holds the commit mutation, so it needs a client even though no
 *  test here commits anything. */
function mountStore() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderHook(() => useSessionDraft(), {
    wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  })
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(DRAFT))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear() })

describe('removing a set', () => {
  it('leaves the cardio block alone', () => {
    const { result } = mountStore()
    expect(names(result.current.draft)).toEqual(['Treadmill', 'Lateral Raise Cable'])

    // One set off a DIFFERENT exercise. Under the old filter this deleted the
    // treadmill as a side effect and reported nothing.
    act(() => { result.current.removeSet('lat-raise', 1) })

    expect(names(result.current.draft)).toEqual(['Treadmill', 'Lateral Raise Cable'])
    expect(result.current.draft?.exercises[1].sets).toHaveLength(1)
  })

  it('survives the block being emptied to its last set', () => {
    const { result } = mountStore()
    act(() => { result.current.removeSet('lat-raise', 1) })
    act(() => { result.current.removeSet('lat-raise', 0) })

    // The strength card goes — an exercise with no rows is nothing at all — and
    // the treadmill, which never had rows, stays.
    expect(names(result.current.draft)).toEqual(['Treadmill'])
  })

  it('still keeps the treadmill’s own figures', () => {
    const { result } = mountStore()
    act(() => { result.current.removeSet('lat-raise', 0) })
    const treadmill = result.current.draft?.exercises.find((e) => e.kind === 'cardio')
    expect(treadmill?.distanceKm).toBe(0.37)
    expect(treadmill?.durationSec).toBe(300)
    expect(treadmill?.done).toBe(true)
  })
})
