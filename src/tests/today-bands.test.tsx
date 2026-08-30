import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SleepBand, BodyBand } from '@/components/day/SummaryBands'

afterEach(cleanup)

/**
 * `BodyBand` reads the lever context to know whether the day it is drawing sits
 * inside a maintenance week — the delta chip judges inside a dead band there.
 * It is a cache read in the app (the dashboard has already fetched the row);
 * here it needs a client to read from.
 */
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const withQuery = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)

const sleep = (over: Record<string, unknown> = {}) => ({
  duration_min: 432, start_time: '2026-08-09T23:40:00Z', end_time: '2026-08-10T06:52:00Z',
  deep_min: 74, rem_min: 96, core_min: 244, awake_min: 18, ...over,
}) as never

/**
 * The Today page put Sleep, Hydration and Body inside a SnapPager whose
 * scroller measured the ACTIVE page and animated its own height to match. The
 * three pages are ~470px, ~200px and ~430px, so every swipe slid Soreness,
 * Cardio and the session debrief up or down by ~270px — and on first paint the
 * row took the tallest child before collapsing to the active one.
 *
 * The fix is structural rather than tuned: a summary band renders the SAME
 * shape whether or not its data exists, so nothing below it can move as data
 * arrives. That is what these pin.
 */
describe('summary bands hold their shape', () => {
  it('renders one row with data and one row without', () => {
    const { container: withData } = render(
      <SleepBand sleep={sleep()} sleepMinutes={null} goalHours={8} onOpen={() => {}} />,
    )
    const rowsWith = withData.querySelectorAll('button').length
    cleanup()

    const { container: without } = render(
      <SleepBand sleep={null} sleepMinutes={null} goalHours={8} onOpen={() => {}} />,
    )
    expect(without.querySelectorAll('button').length).toBe(rowsWith)
  })

  it('shows an em-dash and a prompt rather than collapsing when sleep is missing', () => {
    render(<SleepBand sleep={null} sleepMinutes={null} goalHours={8} onOpen={() => {}} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText(/Sync your Watch/)).toBeInTheDocument()
  })

  it('says how far off goal the night was', () => {
    // 432 min against an 8h goal is 48 minutes short.
    render(<SleepBand sleep={sleep()} sleepMinutes={null} goalHours={8} onOpen={() => {}} />)
    expect(screen.getByText(/48m/)).toBeInTheDocument()
  })

  it('draws no stage ribbon when there are no stages to divide', () => {
    const { container } = render(
      <SleepBand sleep={sleep({ deep_min: 0, rem_min: 0, core_min: 0, awake_min: 0 })}
        sleepMinutes={null} goalHours={8} onOpen={() => {}} />,
    )
    // A ribbon of one 100%-wide segment states a split that does not exist.
    expect(container.querySelectorAll('[aria-hidden="true"] > span').length).toBe(0)
  })

  it('keeps the Body band whole on a day with no weigh-in', () => {
    withQuery(<BodyBand log={null} onOpen={() => {}} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('No weigh-in today')).toBeInTheDocument()
  })

  it('draws the composition bar only when every component is real', () => {
    const { container: partial } = withQuery(
      <BodyBand log={{ weight_kg: 64.2, body_fat_pct: null, muscle_mass_kg: null } as never} onOpen={() => {}} />,
    )
    expect(partial.querySelectorAll('[aria-hidden="true"] > span').length).toBe(0)
    cleanup()

    const { container: full } = withQuery(
      <BodyBand log={{ weight_kg: 64.2, body_fat_pct: 17.3, muscle_mass_kg: 31.1 } as never} onOpen={() => {}} />,
    )
    expect(full.querySelectorAll('[aria-hidden="true"] > span').length).toBe(3)
  })

  it('opens its drawer rather than navigating', async () => {
    const onOpen = vi.fn()
    withQuery(<BodyBand log={null} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})

describe('the Today page owns exactly one drawer at a time', () => {
  const raw = readFileSync('src/app/day/[date]/page.tsx', 'utf8')
  // Comments name what was removed, on purpose. Assert against CODE.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

  it('drives every detail from a single sheet enum', () => {
    expect(src).toMatch(/type DaySheet =/)
    expect(src).toMatch(/const \[sheet, setSheet\] = useState<DaySheet>\(null\)/)
  })

  it('has no pager left to animate its height', () => {
    // SnapPager measured a child and wrote an animated height — that mechanism
    // WAS the gap, so the guarantee is that it is gone, not that it is tuned.
    expect(src).not.toMatch(/SnapPager/)
    expect(src).not.toMatch(/goTo\(/)
  })

  it('resolves the ?section=inbody deep link without a timer', () => {
    // It used to be a 120ms setTimeout racing a query resolution, then a
    // scrollIntoView. Naming a drawer needs neither.
    expect(src).not.toMatch(/setTimeout/)
    expect(src).not.toMatch(/scrollIntoView/)
    expect(src).toMatch(/setSheet\('inbody'\)/)
  })

  it('returns to the Body drawer when the form closes, rather than to the page', () => {
    // A form is a push, not a second drawer stacked on the first.
    expect(src).toMatch(/sheet === 'inbody'[\s\S]{0,200}onClose=\{\(\) => setSheet\('body'\)\}/)
  })
})
