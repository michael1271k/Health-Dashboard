import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SleepWidget, StepsWidget, StackWidget, BatteryWidget } from '@/components/dashboard/widgets/DailyWidgets'
import { NextSessionWidget } from '@/components/dashboard/widgets/TrainingWidgets'
import type { Tables } from '@/lib/supabase/types'

vi.mock('@/lib/native/haptics', () => ({ tapLight: () => Promise.resolve(), tapSuccess: () => Promise.resolve() }))

afterEach(cleanup)

/**
 * ── THE CLAIM THE WHOLE REFACTOR MAKES ───────────────────────────────────────
 *
 * The old dashboard put thirteen domains through one shell that took `value /
 * status / series / detail`. A props bag shaped like that can only express ONE
 * number, so Vitals rendered one of its four readings and Fuel one of its five
 * ratios — which is the entirety of "the widgets look superficial and empty".
 * It was a modelling problem wearing a styling problem's clothes.
 *
 * So the thing worth asserting is not that a widget renders. It is that the
 * three sizes are three different ANSWERS: small is one number, medium is the
 * domain's shape, large adds depth. A body where medium says exactly what small
 * says has quietly regressed to the old shell, and nothing else would catch it.
 */

const SLEEP_ROW = {
  duration_min: 456, deep_min: 70, core_min: 250, rem_min: 110, awake_min: 26,
} as unknown as Tables<'sleep_sessions'>

describe('a size is an answer, not an area', () => {
  it('Sleep: small is the total; medium adds the stage breakdown', () => {
    const { unmount } = render(
      <SleepWidget size="s" sleep={SLEEP_ROW} sleepMin={456} goalHours={8} nightly={[]} />,
    )
    expect(screen.queryByText('Deep')).toBeNull()
    expect(screen.queryByText('REM')).toBeNull()
    unmount()

    render(<SleepWidget size="m" sleep={SLEEP_ROW} sleepMin={456} goalHours={8} nightly={[]} />)
    for (const stage of ['Deep', 'Core', 'REM', 'Awake']) {
      expect(screen.getByText(stage), stage).toBeTruthy()
    }
  })

  it('Steps: small is the count; medium adds the four-cell grid', () => {
    const props = { steps: 8200, goal: 10_000, tdee: 2600, activeKcal: 540, series: [7000, 9000, 8200] }
    const { unmount } = render(<StepsWidget size="s" {...props} />)
    expect(screen.queryByText('TDEE')).toBeNull()
    unmount()

    render(<StepsWidget size="m" {...props} />)
    expect(screen.getByText('TDEE')).toBeTruthy()
    expect(screen.getByText('Active')).toBeTruthy()
  })

  it('Energy: medium adds the drivers that decided the charge', () => {
    const drivers = [{ label: 'Sleep', value: '7h 36m', color: '#fff' }]
    const { unmount } = render(<BatteryWidget size="s" batteryPct={62} score={71} drivers={drivers} />)
    expect(screen.queryByText('Sleep')).toBeNull()
    unmount()

    render(<BatteryWidget size="m" batteryPct={62} score={71} drivers={drivers} />)
    expect(screen.getByText('Sleep')).toBeTruthy()
    expect(screen.getByText(/Recovery 71/)).toBeTruthy()
  })
})

/**
 * ── EMPTY KEEPS ITS SHAPE ────────────────────────────────────────────────────
 * Hiding a widget with no data would move every tile beneath it, which costs
 * exactly the muscle memory the fixed grid exists to build. The tile stays, and
 * says what it is waiting for rather than sitting there as a grey rectangle.
 */
describe('a widget with nothing to show still holds its place', () => {
  it('renders the frame, its label, and an encouraging line', () => {
    render(<StepsWidget size="s" steps={null} goal={10_000} tdee={null} activeKcal={null} series={[]} />)
    expect(screen.getByText('Steps')).toBeTruthy()
    expect(screen.getByText(/Awaiting your first step/i)).toBeTruthy()
  })

  it('does not claim a number it does not have', () => {
    render(<SleepWidget size="m" sleep={null} sleepMin={null} goalHours={8} nightly={[]} />)
    expect(screen.getByText(/still syncing/i)).toBeTruthy()
    expect(screen.queryByText('0h')).toBeNull()
    expect(screen.queryByText('0:00')).toBeNull()
  })
})

/**
 * ── NEXT IS AN INSTRUCTION, AND IT CARRIES A REAL LINK ───────────────────────
 * The frame is a `role="button"` div rather than a `<button>` precisely so a
 * body can hold its own control: a button inside a button is invalid HTML that
 * Safari resolves by dropping the inner one, which would silently turn the
 * primary action into a no-op.
 */
describe('NextSessionWidget', () => {
  const DAY = { key: 'legs_a', label: 'Legs & Core A', dayKey: 'legs_a', sub: 'quads + core', color: '#fff' }

  it('offers the log link at medium, pointing at today', () => {
    render(<NextSessionWidget size="m" day={DAY as never} logged={false} />)
    const link = screen.getByRole('link', { name: /Log Legs & Core A/i })
    expect(link.getAttribute('href')).toContain('template=legs_a')
  })

  it('does not offer it once the session exists', () => {
    render(<NextSessionWidget size="m" day={DAY as never} logged />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/logged today/i)).toBeTruthy()
  })

  it('never offers it on a rest day', () => {
    render(<NextSessionWidget size="m" day="rest" logged={false} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/Rest · Zone-2/)).toBeTruthy()
  })

  /** Tapping the link must not ALSO fire the tile's own open handler. */
  it('the link does not bubble into the frame\'s open', async () => {
    const onOpen = vi.fn()
    render(<NextSessionWidget size="m" day={DAY as never} logged={false} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('link'))
    expect(onOpen).not.toHaveBeenCalled()
  })
})

/**
 * ── THE STACK COUNTS ITEMS, NOT SLOTS ────────────────────────────────────────
 * `supplement_log` is keyed by ITEM, so a widget reasoning in slots would report
 * a whole slot outstanding because one of its three tablets was unticked — and
 * would name the wrong thing as next.
 */
describe('StackWidget — the next dose, not a score', () => {
  const SLOTS = [
    { key: 'multivitamin', name: 'Multivitamin', time: '10:30' },
    { key: 'creatine', name: 'Creatine', time: '14:00' },
    { key: 'magnesium', name: 'Magnesium', time: '22:00' },
  ]

  it('names the earliest unticked item as next', () => {
    render(<StackWidget size="s" slots={SLOTS} taken={new Set(['multivitamin'])} nowMinutes={13 * 60} />)
    expect(screen.getByText('Creatine')).toBeTruthy()
    expect(screen.getByText(/in 1h/)).toBeTruthy()
  })

  it('an overdue dose outranks one scheduled for later', () => {
    // 15:00. Creatine was due at 14:00 and is not ticked; magnesium is at 22:00.
    render(<StackWidget size="s" slots={SLOTS} taken={new Set(['multivitamin'])} nowMinutes={15 * 60} />)
    expect(screen.getByText('Creatine')).toBeTruthy()
    expect(screen.getByText(/overdue/)).toBeTruthy()
  })

  it('says the protocol is complete rather than naming a next that does not exist', () => {
    render(<StackWidget size="s" slots={SLOTS} taken={new Set(SLOTS.map((s) => s.key))} nowMinutes={600} />)
    expect(screen.getByText(/protocol complete/i)).toBeTruthy()
    expect(screen.getByText('3/3')).toBeTruthy()
  })

  it('holds its shape on a day with no protocol at all', () => {
    render(<StackWidget size="s" slots={[]} taken={new Set()} nowMinutes={600} />)
    expect(screen.getByText('Stack')).toBeTruthy()
    expect(screen.getByText(/No protocol for today/i)).toBeTruthy()
  })
})
