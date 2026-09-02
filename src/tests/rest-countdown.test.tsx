import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act, screen } from '@testing-library/react'
import { RestCountdown } from '@/components/command-center/RestCountdown'

vi.mock('@/lib/native/haptics', () => ({
  tapLight: () => Promise.resolve(),
  tapSuccess: () => Promise.resolve(),
}))

/**
 * ── THE REST ENDING IS NOT A STATE ───────────────────────────────────────────
 *
 * At zero this chip used to turn green and read GO, and then hold that until it
 * was tapped. So the last thing the control did was replace the one fact its
 * slot is for — the target rest for this movement — with an instruction that had
 * already been obeyed, and it kept it through the next set and the one after.
 *
 * It now fires its haptic on the crossing and hands the slot straight back, so
 * `ExerciseCard` re-renders the target chip and the row reads the assigned rest
 * again. That is one line in the component and exactly the kind of line a later
 * edit re-adds "for feedback", so it is asserted through the real clock.
 */

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('the rest countdown', () => {
  it('counts down against the deadline', () => {
    render(<RestCountdown until={Date.now() + 90_000} onDismiss={() => {}} />)
    expect(screen.getByRole('button').textContent).toBe('1:30')
    act(() => { vi.advanceTimersByTime(31_000) })
    expect(screen.getByRole('button').textContent).toBe('0:59')
  })

  it('ends itself at zero rather than saying GO', () => {
    const onDismiss = vi.fn()
    render(<RestCountdown until={Date.now() + 2_000} onDismiss={onDismiss} />)
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(2_100) })

    expect(onDismiss).toHaveBeenCalled()
    // Nothing on the way out says GO — the slot goes back to the target chip.
    expect(screen.queryByText('GO')).toBeNull()
  })

  it('is already over when it mounts past its deadline', () => {
    const onDismiss = vi.fn()
    // A card that re-renders after the phone spent the whole rest in a pocket.
    render(<RestCountdown until={Date.now() - 5_000} onDismiss={onDismiss} />)
    expect(onDismiss).toHaveBeenCalled()
  })

  it('resyncs on the way back rather than resuming a frozen timer', () => {
    render(<RestCountdown until={Date.now() + 120_000} onDismiss={() => {}} />)
    expect(screen.getByRole('button').textContent).toBe('2:00')

    // iOS throttles or drops timers in a backgrounded web view: the clock moves
    // while nothing ticks. `visibilitychange` has to re-derive from `Date.now()`.
    vi.setSystemTime(Date.now() + 75_000)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    expect(screen.getByRole('button').textContent).toBe('0:45')
  })
})
