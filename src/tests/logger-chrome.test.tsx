import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LazyMotion, domMax } from 'framer-motion'
import { SessionClock } from '@/components/command-center/SessionClockSheet'
import { SessionMenu } from '@/components/command-center/SessionMenu'
import {
  DEFAULT_DURATION_SEC, getSessionClock, startClock, setClockMode,
} from '@/lib/sessions/sessionClock'

/**
 * The two controls that replaced the bottom bar and the rest timer.
 *
 * What is asserted here is REACHABILITY, not layout — jsdom computes no widths,
 * so the questions it can answer are "is the control mounted" and "does pressing
 * it do the thing". Both matter more than usual here: `SessionMenu` is now the
 * only route to discarding a draft, and the clock is now the only route to a
 * timer at all.
 */
const wrap = (node: React.ReactElement) => <LazyMotion features={domMax} strict>{node}</LazyMotion>

beforeEach(() => { localStorage.clear() })

describe('the session clock', () => {
  it('is an icon with no digits until something is running', () => {
    render(wrap(<SessionClock />))
    const btn = screen.getByLabelText('Timer and stopwatch')
    // A permanent "1:00" on the header would claim a countdown was in progress.
    expect(btn.textContent).toBe('')
  })

  it('shows the reading once a clock is live', () => {
    startClock('stopwatch')
    render(wrap(<SessionClock />))
    expect(screen.getByLabelText(/^Stopwatch 0:0\d/)).toBeTruthy()
  })

  it('opens on the Timer tab at one minute, with both step buttons', () => {
    render(wrap(<SessionClock />))
    fireEvent.click(screen.getByLabelText('Timer and stopwatch'))
    expect(getSessionClock().durationSec).toBe(DEFAULT_DURATION_SEC)
    expect(screen.getByText('1:00')).toBeTruthy()
    expect(screen.getByLabelText('15 seconds less')).toBeTruthy()
    expect(screen.getByLabelText('15 seconds more')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  })

  it('steps the countdown in fifteens', () => {
    render(wrap(<SessionClock />))
    fireEvent.click(screen.getByLabelText('Timer and stopwatch'))
    fireEvent.click(screen.getByLabelText('15 seconds more'))
    expect(getSessionClock().durationSec).toBe(75)
    fireEvent.click(screen.getByLabelText('15 seconds less'))
    fireEvent.click(screen.getByLabelText('15 seconds less'))
    expect(getSessionClock().durationSec).toBe(45)
  })

  it('hides the steppers once the countdown is running', () => {
    // Changing a timer's length mid-flight can only mean restarting it, and a
    // control that silently does something other than what it says is worse
    // than one that is not there.
    render(wrap(<SessionClock />))
    fireEvent.click(screen.getByLabelText('Timer and stopwatch'))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.queryByLabelText('15 seconds more')).toBeNull()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
  })

  it('offers Reset beside Start on a stopped stopwatch, and neither before', () => {
    setClockMode('stopwatch')
    render(wrap(<SessionClock />))
    fireEvent.click(screen.getByLabelText('Timer and stopwatch'))
    // Nothing has run, so there is nothing to reset.
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    // Apple's arrangement exactly: Reset and Resume, two buttons, not one that
    // changes meaning.
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
  })

  it('switches tabs and stops whatever was running', () => {
    startClock('timer')
    render(wrap(<SessionClock />))
    // Running, so the button reads its digits rather than its idle name.
    fireEvent.click(screen.getByLabelText(/^Timer 1:00/))
    fireEvent.click(screen.getByRole('tab', { name: 'Stopwatch' }))
    expect(getSessionClock().mode).toBe('stopwatch')
    expect(getSessionClock().startedAt).toBeNull()
  })
})

describe('the session overflow', () => {
  it('offers discard, and only discard, on a new draft', () => {
    let discarded = 0
    render(wrap(<SessionMenu isEdit={false} onDiscard={() => { discarded += 1 }} />))
    fireEvent.click(screen.getByLabelText('Session options'))
    expect(screen.getByText('Discard draft')).toBeTruthy()
    expect(screen.queryByText('Delete workout')).toBeNull()
    fireEvent.click(screen.getByText('Discard draft'))
    expect(discarded).toBe(1)
  })

  it('keeps cancel and delete as two separate rows in edit mode', () => {
    // One keeps the committed workout, the other destroys it. They have been
    // two controls since the bar existed and must stay two.
    let cancelled = 0
    let deleted = 0
    render(wrap(
      <SessionMenu
        isEdit
        onDiscard={() => {}}
        onCancelEdit={() => { cancelled += 1 }}
        onDelete={() => { deleted += 1 }}
      />,
    ))
    fireEvent.click(screen.getByLabelText('Session options'))
    fireEvent.click(screen.getByText('Cancel edit'))
    expect(cancelled).toBe(1)
    expect(deleted).toBe(0)
    fireEvent.click(screen.getByLabelText('Session options'))
    fireEvent.click(screen.getByText('Delete workout'))
    expect(deleted).toBe(1)
  })

  it('explains what each one destroys rather than showing a bare glyph', () => {
    render(wrap(<SessionMenu isEdit={false} onDiscard={() => {}} />))
    fireEvent.click(screen.getByLabelText('Session options'))
    expect(screen.getByText(/Throws away everything logged/)).toBeTruthy()
  })
})
