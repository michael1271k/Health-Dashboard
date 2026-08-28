import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSessionDraft } from '@/lib/hooks/useSessionDraft'
import type { SessionDraft } from '@/lib/sessions/draft'

/**
 * ── THE FROZEN DURATION, PINNED ──────────────────────────────────────────────
 *
 * 2026-08-28: Finish was pressed at 42 minutes to LOOK at the sheet, closed,
 * and pressed again at 70 when the session actually ended. The stored duration
 * was 42.
 *
 * The sheet only ever filled a duration that was still EMPTY, and its own first
 * reading had filled it — so every reading after the first found the field full
 * and declined. The rule it was reaching for was not "is this empty" but "is
 * this MINE", and those are different questions the moment the clock has
 * written once.
 *
 * So there are two writers now. `setStats` is the human's and latches
 * `durationEdited`; `setClockDuration` is the clock's and overwrites freely
 * until that latch closes. Everything below is that distinction, because
 * nothing about it is visible from the outside until a workout is stored wrong.
 */

const DRAFT = {
  date: '2026-08-28', splitDay: 'legs', dayKey: 'legs_b', notes: '',
  startedAt: '2026-08-28T12:00:00.000Z',
  exercises: [{ localId: 'ex0', name: 'Leg Press', sets: [{ weightKg: 72.5, reps: 14 }] }],
} as unknown as SessionDraft

function mountStore() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderHook(() => useSessionDraft(), {
    wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  })
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('the session clock keeps writing until a human takes the field', () => {
  it('overwrites its own earlier reading — the actual 42-then-70 bug', () => {
    const { result } = mountStore()
    act(() => { result.current.start(DRAFT) })

    act(() => { result.current.setClockDuration(42) })
    expect(result.current.draft?.stats?.duration_min).toBe(42)

    // Sheet closed, workout continued, Finish pressed again half an hour later.
    act(() => { result.current.setClockDuration(70) })
    expect(result.current.draft?.stats?.duration_min,
      'the finish sheet froze the first reading it took').toBe(70)
  })

  it('does not mark the field as edited when it writes', () => {
    const { result } = mountStore()
    act(() => { result.current.start(DRAFT) })
    act(() => { result.current.setClockDuration(42) })
    expect(result.current.draft?.durationEdited).toBeFalsy()
  })

  it('stops the moment a duration is typed, and never takes it back', () => {
    const { result } = mountStore()
    act(() => { result.current.start(DRAFT) })
    act(() => { result.current.setClockDuration(42) })

    // A correction: the athlete knows they were warming up for the first ten.
    act(() => { result.current.setStats({ duration_min: 55 }) })
    expect(result.current.draft?.durationEdited).toBe(true)

    act(() => { result.current.setClockDuration(70) })
    expect(result.current.draft?.stats?.duration_min,
      'a duration the athlete typed was overwritten by the clock').toBe(55)
  })

  it('respects a field deliberately CLEARED, which is not the same as empty', () => {
    const { result } = mountStore()
    act(() => { result.current.start(DRAFT) })
    act(() => { result.current.setStats({ duration_min: null }) })
    act(() => { result.current.setClockDuration(70) })
    expect(result.current.draft?.stats?.duration_min).toBeNull()
  })

  it('leaves the other end-of-session fields alone', () => {
    const { result } = mountStore()
    act(() => { result.current.start(DRAFT) })
    act(() => { result.current.setStats({ avg_hr_bpm: 132, calories_kcal: 610 }) })
    act(() => { result.current.setClockDuration(70) })
    expect(result.current.draft?.stats?.avg_hr_bpm).toBe(132)
    expect(result.current.draft?.stats?.calories_kcal).toBe(610)
    // Avg HR is not a duration — writing one must not latch the other's flag.
    expect(result.current.draft?.durationEdited).toBeFalsy()
  })
})

describe('pausing the session clock', () => {
  it('opens a pause without touching startedAt', () => {
    const { result } = mountStore()
    act(() => { result.current.start(DRAFT) })
    act(() => { result.current.togglePause() })

    expect(result.current.draft?.pausedAt).toBeTruthy()
    expect(result.current.draft?.startedAt,
      'startedAt is read as the moment the workout began by save.ts, eraForDate '
      + 'and the re-entry PR gate — a pause must never rewrite it').toBe(DRAFT.startedAt)
  })

  it('banks the pause on resume and closes it', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-28T12:30:00.000Z'))
      const { result } = mountStore()
      act(() => { result.current.start(DRAFT) })
      act(() => { result.current.togglePause() })

      vi.setSystemTime(new Date('2026-08-28T12:35:00.000Z'))
      act(() => { result.current.togglePause() })

      expect(result.current.draft?.pausedAt).toBeNull()
      expect(result.current.draft?.pausedMs).toBe(5 * 60_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('accumulates across pauses rather than replacing the last one', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-28T12:30:00.000Z'))
      const { result } = mountStore()
      act(() => { result.current.start(DRAFT) })

      act(() => { result.current.togglePause() })
      vi.setSystemTime(new Date('2026-08-28T12:35:00.000Z'))
      act(() => { result.current.togglePause() })

      vi.setSystemTime(new Date('2026-08-28T12:50:00.000Z'))
      act(() => { result.current.togglePause() })
      vi.setSystemTime(new Date('2026-08-28T12:53:00.000Z'))
      act(() => { result.current.togglePause() })

      expect(result.current.draft?.pausedMs).toBe(8 * 60_000)
    } finally {
      vi.useRealTimers()
    }
  })
})
