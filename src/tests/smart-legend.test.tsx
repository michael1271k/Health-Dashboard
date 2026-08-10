import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { ChartScrubber, SmartLegend, useScrub, lastValues, SCRUB_TOUCH } from '@/components/charts/SmartLegend'

afterEach(cleanup)

const SERIES = [
  { key: 'bench', name: 'Bench', color: '#3E9E7A', unit: 'kg' },
  { key: 'squat', name: 'Squat', color: '#E0703C', unit: 'kg' },
]

/**
 * The legend reads out the value under the finger. Scrubbing fires at pointer
 * rate, so the whole design turns on one thing: it must not re-render React.
 * The value lives in a MotionValue and each legend row writes its own
 * textContent.
 *
 * That is a performance claim, so it is worth asserting rather than believing.
 */
function Harness({ fallback }: { fallback: Record<string, number> }) {
  const scrub = useScrub()
  const renders = useRef(0)
  renders.current += 1
  return (
    <div style={SCRUB_TOUCH}>
      <span data-testid="renders">{renders.current}</span>
      <button data-testid="push" onClick={() => scrub.set({ label: '5 Aug', values: { bench: 92.5, squat: 140 } })}>
        push
      </button>
      <button data-testid="clear" onClick={() => scrub.set(null)}>clear</button>
      <SmartLegend series={SERIES} scrub={scrub} fallback={fallback} />
    </div>
  )
}

describe('SmartLegend', () => {
  it('is a readout at rest, not a list of names', () => {
    render(<Harness fallback={{ bench: 80, squat: 120 }} />)
    expect(screen.getByText('80kg')).toBeInTheDocument()
    expect(screen.getByText('120kg')).toBeInTheDocument()
  })

  it('shows the scrubbed value WITHOUT re-rendering React', async () => {
    render(<Harness fallback={{ bench: 80, squat: 120 }} />)
    const before = screen.getByTestId('renders').textContent

    await userEvent.click(screen.getByTestId('push'))

    // The numbers changed…
    expect(screen.getByText('92.5kg')).toBeInTheDocument()
    expect(screen.getByText('140kg')).toBeInTheDocument()
    // …and the component did not render again to do it. (The click itself is
    // one event; React re-rendering here would show a higher count.)
    expect(screen.getByTestId('renders').textContent).toBe(before)
  })

  it('falls back to the last known value when the finger lifts', async () => {
    render(<Harness fallback={{ bench: 80, squat: 120 }} />)
    await userEvent.click(screen.getByTestId('push'))
    expect(screen.getByText('92.5kg')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('clear'))
    // Never blank — a legend with no numbers is worse than no legend.
    expect(screen.getByText('80kg')).toBeInTheDocument()
  })

  it('shows an em-dash for a series with no value at all', () => {
    render(<Harness fallback={{ bench: 80 }} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('lets vertical scroll through while claiming horizontal', () => {
    // Recharts fires tooltip events from touch but never preventDefaults, so
    // without this the scrub and the page scroll fight each other.
    expect(SCRUB_TOUCH.touchAction).toBe('pan-y')
  })

  it('isolates a series on tap, and dims the others rather than hiding them', async () => {
    const seen: Array<string | null> = []
    const Probe = ({ focus }: { focus: string | null }) => {
      const scrub = useScrub()
      return <SmartLegend series={SERIES} scrub={scrub} fallback={{}} focus={focus} onFocus={(k) => seen.push(k)} />
    }

    const { rerender } = render(<Probe focus={null} />)
    await userEvent.click(screen.getByRole('button', { name: /Bench/ }))
    expect(seen).toEqual(['bench'])

    // Focused: the other row fades back, it does not disappear — the shape of
    // the comparison has to survive isolating one series.
    rerender(<Probe focus="bench" />)
    expect(screen.getByRole('button', { name: /Squat/ }).className).toContain('opacity-40')
    expect(screen.getByRole('button', { name: /Bench/ }).className).not.toContain('opacity-40')

    // Tapping the focused one clears.
    await userEvent.click(screen.getByRole('button', { name: /Bench/ }))
    expect(seen).toEqual(['bench', null])
  })
})

describe('ChartScrubber', () => {
  it('draws nothing — it exists only to forward what recharts already computed', () => {
    const Probe = () => {
      const scrub = useScrub()
      return <ChartScrubber scrub={scrub} active payload={[{ dataKey: 'bench', value: 90 }]} label="5 Aug" />
    }
    const { container } = render(<Probe />)
    expect(container.innerHTML).toBe('')
  })

  it('publishes the payload keyed by dataKey', () => {
    let seen: unknown = 'unset'
    const Probe = () => {
      const scrub = useScrub()
      scrub.on('change', (v) => { seen = v })
      return <ChartScrubber scrub={scrub} active payload={[{ dataKey: 'bench', value: 90 }]} label="5 Aug" />
    }
    act(() => { render(<Probe />) })
    expect(seen).toEqual({ label: '5 Aug', values: { bench: 90 } })
  })
})

describe('lastValues', () => {
  it('takes the last non-null per series, not the last row', () => {
    const data = [
      { a: 1, b: 10 },
      { a: 2, b: null },
      { a: null, b: null },
    ] as unknown as Array<Record<string, unknown>>
    expect(lastValues(data, ['a', 'b'])).toEqual({ a: 2, b: 10 })
  })

  it('omits a series that never had a value', () => {
    expect(lastValues([{ a: null }] as unknown as Array<Record<string, unknown>>, ['a'])).toEqual({})
  })
})
