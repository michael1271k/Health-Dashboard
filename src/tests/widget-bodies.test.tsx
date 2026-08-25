import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SleepWidget, StepsWidget, StackWidget } from '@/components/dashboard/widgets/DailyWidgets'
import { FuelWidget } from '@/components/dashboard/widgets/FuelWidget'
import { TrainWidget, tonnage } from '@/components/dashboard/widgets/TrainingWidgets'
import type { Tables } from '@/lib/supabase/types'

vi.mock('@/lib/native/haptics', () => ({ tapLight: () => Promise.resolve(), tapSuccess: () => Promise.resolve() }))

/** The Train tile asks for the last run of this `day_key`; the state under test
 *  is which of its three faces renders, not the query. */
const lastOfDay = vi.hoisted(() => ({ data: null as unknown }))
vi.mock('@/lib/hooks/useLastSessionOfDay', () => ({ useLastSessionOfDay: () => lastOfDay }))

/** Large's per-exercise breakdown is a query; the state under test is which
 *  face renders, so the query is stubbed rather than provided. */
vi.mock('@/lib/hooks/useSessionDetail', () => ({ useSessionDetail: () => ({ data: null }) }))

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

  /**
   * Fuel's small used to be a calorie count and one bar, which is the reading a
   * cut does NOT turn on: 1,900 kcal at 90 g of protein and 1,900 at 190 g are
   * opposite days. Small carries the macros as compact bars; medium names them
   * in full words with their targets.
   */
  it('Fuel: small carries the macros too; medium names them in full', () => {
    const props = {
      kcal: 1900, kcalGoal: 2100, protein: 168, carbs: 190, fat: 62,
      goals: { protein: 190, carbs: 200, fat: 70 },
      waterMl: 2400, waterGoalMl: 3000, series: [], phaseLabel: null, phaseColor: null,
    }
    const { unmount } = render(<FuelWidget size="s" {...props} />)
    expect(screen.getByText(/168/)).toBeTruthy()
    expect(screen.queryByText('Protein')).toBeNull()
    unmount()

    render(<FuelWidget size="m" {...props} />)
    for (const macro of ['Calories', 'Protein', 'Carbs', 'Fat', 'Water']) {
      expect(screen.getByText(macro), macro).toBeTruthy()
    }
  })

  /**
   * The micros left this tile deliberately — five budgets you spend down and
   * three thresholds you pass or fail have no business in one column with
   * nothing to tell them apart. They are `MicrosWidget` now.
   */
  it('Fuel no longer carries the micronutrient checks at any size', () => {
    const props = {
      kcal: 1900, kcalGoal: 2100, protein: 168, carbs: 190, fat: 62,
      goals: { protein: 190, carbs: 200, fat: 70 },
      waterMl: 2400, waterGoalMl: 3000, series: [], phaseLabel: null, phaseColor: null,
    }
    render(<FuelWidget size="l" {...props} />)
    expect(screen.queryByText('Fiber')).toBeNull()
    expect(screen.queryByText('Sodium')).toBeNull()
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
/**
 * ── TRAIN IS THREE STATES, AND NEVER `NaN` ───────────────────────────────────
 * `Train` and `Next Session` were two tiles answering one question at two
 * points in the same day. Train printed a volume for a session that had not
 * happened yet, and `Number(fmtVolume(displayWeight(undefined)))` is `NaN` — a
 * number computed from nothing and rendered anyway. The merged tile has no
 * "today" figure to invent before a session exists; it shows the LAST run of the
 * same workout instead, which is both honest and the thing to beat.
 *
 * The frame is a `role="button"` div rather than a `<button>` precisely so the
 * body can hold the Log link: a button inside a button is invalid HTML that
 * Safari resolves by dropping the inner one, silently turning the primary
 * action into a no-op.
 */
describe('TrainWidget — one tile, three states', () => {
  const DAY = { key: 'legs_a', label: 'Legs & Core A', dayKey: 'legs_a', sub: 'quads + core', color: '#fff' }

  afterEach(() => { lastOfDay.data = null })

  it('before the session: names the plan and offers the log link', () => {
    render(<TrainWidget size="m" day={DAY as never} logged={false} today={null} />)
    const link = screen.getByRole('link', { name: /Log Legs & Core A/i })
    expect(link.getAttribute('href')).toContain('template=legs_a')
  })

  it('before the session: quotes the LAST run of this same workout as the bar', () => {
    lastOfDay.data = { id: 'x', date: '2026-08-18', volumeKg: 12_480, setCount: 22, prCount: 1, durationMin: 58 }
    render(<TrainWidget size="m" day={DAY as never} logged={false} today={null} />)
    expect(screen.getByText(/Last time/i)).toBeTruthy()
    expect(screen.getByText('12.5k')).toBeTruthy()
    expect(screen.getByText('22')).toBeTruthy()
  })

  it('never prints NaN for a session that has not happened', () => {
    render(<TrainWidget size="m" day={DAY as never} logged={false} today={null} />)
    expect(document.body.textContent).not.toMatch(/NaN/)
  })

  it('after the session: today\'s own numbers, and no link', () => {
    render(
      <TrainWidget
        size="m" day={DAY as never} logged
        today={{ volumeKg: 9800, setCount: 19, prCount: 2, durationMin: 51 }}
      />,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/logged today/i)).toBeTruthy()
    expect(screen.getByText('9.8k')).toBeTruthy()
    expect(screen.getByText('19')).toBeTruthy()
  })

  it('a rest day is a rest day, not a failed training day', () => {
    render(<TrainWidget size="m" day="rest" logged={false} today={null} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Rest Day')).toBeTruthy()
  })

  /** Tapping the link must not ALSO fire the tile's own open handler. */
  it('the link does not bubble into the frame\'s open', async () => {
    const onOpen = vi.fn()
    render(<TrainWidget size="m" day={DAY as never} logged={false} today={null} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('link'))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('tonnage shortens a week of work to something that fits a tile', () => {
    expect(tonnage(12_480)).toBe('12.5k')
    expect(tonnage(980)).toBe('980')
    expect(tonnage(null)).toBeNull()
    // The old path produced this from `displayWeight(undefined)`.
    expect(tonnage(Number.NaN)).toBeNull()
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
