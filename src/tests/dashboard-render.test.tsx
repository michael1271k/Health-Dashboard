import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SleepWidget, StepsWidget, StackWidget } from '@/components/dashboard/widgets/DailyWidgets'
import { WaterWidget } from '@/components/dashboard/widgets/WaterWidget'
import { RecoveryWidget } from '@/components/dashboard/widgets/RecoveryWidget'
import { BodyWidget } from '@/components/dashboard/widgets/BodyWidget'

/**
 * ── WHAT THIS FILE DEFENDS ───────────────────────────────────────────────────
 *
 * The dashboard's cost is not the first paint, it is the re-renders. Two things
 * were true before the commit that added this file:
 *
 *   · not one of the eighteen widget bodies was wrapped in `React.memo`, while
 *     a comment on `app/page.tsx` asserted they were "memoised where it pays";
 *   · the stack rotator held its face in state AT THE GRID ROOT, so three
 *     phase-offset 9s timers reconciled the entire dashboard about every three
 *     seconds, forever, while it was open.
 *
 * Both are invisible: nothing breaks, the app is simply warm and slow. So they
 * are asserted here rather than trusted to a comment.
 *
 * ── HOW THE COUNT WORKS ──────────────────────────────────────────────────────
 * `WidgetFrame` is rendered exactly once by every widget body, so counting it
 * counts widget renders — exactly, and immune to machine load. Same technique
 * as `deck-render.test.tsx`, which counts `isSetCommitted`.
 */
const frames = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/components/dashboard/WidgetFrame', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/dashboard/WidgetFrame')>()
  return {
    ...real,
    WidgetFrame: (props: Parameters<typeof real.WidgetFrame>[0]) => {
      frames.n += 1
      return <div>{props.children}</div>
    },
  }
})

/**
 * One client per test, built in `beforeEach` rather than per call: a fresh
 * `QueryClient` is a fresh context value, which re-renders everything under it
 * and would make every memo assertion below fail for a reason that has nothing
 * to do with the widgets.
 */
let qc: QueryClient
function withQuery(node: React.ReactNode) {
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>
}

beforeEach(() => {
  frames.n = 0
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
})
afterEach(cleanup)

describe('the widget bodies are memoized', () => {
  /**
   * The props are built ONCE and handed to both renders. That is the whole
   * contract `React.memo` offers — shallow equality — and it is also the
   * contract `app/page.tsx` has to keep, which is why the arrays and objects it
   * passes are `useMemo`d there rather than mapped inline in the switch.
   */
  it('re-rendering with identical props does not re-run the body', () => {
    const nightly = [420, 401, 455, 390, 470, 432, 410]
    const el = (
      <SleepWidget size="m" sleep={null} sleepMin={432} goalHours={7.5} nightly={nightly} />
    )
    const { rerender } = render(el)
    expect(frames.n).toBe(1)
    rerender(el)
    rerender(el)
    expect(frames.n).toBe(1)
  })

  it('a changed prop still re-runs it', () => {
    const nightly = [420, 401, 455]
    const { rerender } = render(
      <SleepWidget size="m" sleep={null} sleepMin={432} goalHours={7.5} nightly={nightly} />,
    )
    expect(frames.n).toBe(1)
    rerender(
      <SleepWidget size="m" sleep={null} sleepMin={455} goalHours={7.5} nightly={nightly} />,
    )
    expect(frames.n).toBe(2)
  })

  /**
   * The failure this catches is the one that actually happened: a widget prop
   * built inline at the call site. A fresh array with identical CONTENTS is a
   * different identity, so memo cannot bail — which is why the dashboard has to
   * derive them once and why this asserts the mechanism rather than the values.
   */
  it('a fresh array with the same contents defeats it — which is the point', () => {
    const { rerender } = render(
      <SleepWidget size="m" sleep={null} sleepMin={432} goalHours={7.5} nightly={[420, 401]} />,
    )
    rerender(
      <SleepWidget size="m" sleep={null} sleepMin={432} goalHours={7.5} nightly={[420, 401]} />,
    )
    expect(frames.n).toBe(2)
  })

  it.each([
    ['Recovery', <RecoveryWidget key="r" size="m" score={null} isLoading={false} sleepMin={430} restingHr={52} hrvMs={64} />],
    ['Water', <WaterWidget key="w" size="s" waterMl={1800} goalMl={3000} />],
    ['Body', <BodyWidget key="b" size="m" weightSeries={[]} />],
    ['Steps', <StepsWidget key="s" size="m" steps={8200} goal={10000} tdee={2600} activeKcal={520} series={[]} />],
  ])('%s holds still on an identical re-render', (_name, el) => {
    // Wrapped: Water and Body reach for their own queries even when every
    // number they display arrives as a prop.
    const { rerender } = render(withQuery(el))
    expect(frames.n).toBe(1)
    rerender(withQuery(el))
    expect(frames.n).toBe(1)
  })
})

describe('the Stack tile owns its own minute', () => {
  const SLOTS = [
    { key: 'creatine', name: 'Creatine', time: '08:00' },
    { key: 'magnesium', name: 'Magnesium', time: '22:00' },
  ]

  /**
   * `nowMinutes` used to be REQUIRED, held in state on `app/page.tsx`, and a
   * dependency of the `renderWidget` render prop the whole grid is keyed on —
   * so the once-a-minute tick reconciled every tile on the dashboard, muscle
   * atlas included, to move one label inside this one. It is optional now and
   * the tile runs its own visibility-gated clock.
   */
  it('renders with no clock passed at all', () => {
    render(withQuery(<StackWidget size="m" slots={SLOTS} skipped={new Set()} />))
    expect(frames.n).toBe(1)
  })

  it('an explicitly passed clock still pins it', () => {
    const skipped: ReadonlySet<string> = new Set()
    const el = withQuery(<StackWidget size="m" slots={SLOTS} skipped={skipped} nowMinutes={11 * 60} />)
    const { rerender } = render(el)
    expect(frames.n).toBe(1)
    rerender(el)
    // Same identities all the way down — nothing re-ran.
    expect(frames.n).toBe(1)
  })

  /**
   * The clock must not tick while the app is backgrounded. `useVisibleInterval`
   * suspends the interval outright rather than firing and discarding, so an
   * hour in a pocket costs no wake-ups at all.
   */
  it('does not tick while the document is hidden', () => {
    vi.useFakeTimers()
    try {
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      render(withQuery(<StackWidget size="m" slots={SLOTS} skipped={new Set()} />))
      const before = frames.n
      act(() => { vi.advanceTimersByTime(10 * 60_000) })
      expect(frames.n).toBe(before)
      visibility.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })
})
