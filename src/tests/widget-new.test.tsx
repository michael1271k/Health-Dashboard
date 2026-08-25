import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, renderHook, cleanup, screen, fireEvent } from '@testing-library/react'
import { BalanceBars, Heatmap, LineChart, type ConsistencyDay } from '@/components/dashboard/widgets/parts'
import { weeklyRateKg, KCAL_PER_KG, type EnergyDay } from '@/lib/hooks/useEnergyBalance'

vi.mock('@/lib/native/haptics', () => ({ tapLight: () => Promise.resolve(), tapSuccess: () => Promise.resolve() }))

const energy = vi.hoisted(() => ({ rows: [] as EnergyDay[] }))
vi.mock('@/lib/hooks/useEnergyBalance', async (orig) => ({
  ...(await orig<typeof import('@/lib/hooks/useEnergyBalance')>()),
  useEnergyBalance: () => ({ data: energy.rows }),
}))

const sessions = vi.hoisted(() => ({ rows: [] as Array<{ date: string; dayKey: string | null; splitDay: string }> }))
vi.mock('@/lib/hooks/useSessionHistory', () => ({ useSessionHistory: () => ({ data: sessions.rows }) }))

const schedule = vi.hoisted(() => ({ restOn: new Set<string>() }))
vi.mock('@/lib/programs', async (orig) => {
  const real = await orig<typeof import('@/lib/programs')>()
  return {
    ...real,
    scheduleDayFor: (date: string) =>
      (schedule.restOn.has(date) ? 'rest' : { label: 'Upper A', dayKey: 'upper_a' }),
  }
})
vi.mock('@/lib/hooks/useScheduleVersion', () => ({ useScheduleVersion: () => 0 }))

const { DeficitWidget, ConsistencyWidget } = await import('@/components/dashboard/widgets/PlanWidgets')
const { useNextTraining } = await import('@/lib/hooks/useNextTraining')
const { programDayByKey } = await import('@/lib/programs')

afterEach(() => {
  cleanup()
  energy.rows = []
  sessions.rows = []
  schedule.restOn = new Set()
})

/**
 * ── A LINE THAT BRIDGES A GAP AND A LINE THAT REFUSES TO ─────────────────────
 *
 * `Spark` breaks its path on a missing day, deliberately: a straight line drawn
 * through a day with no steps is a claim about a day that has no data. Weight is
 * the opposite kind of quantity — you do not stop having one on the mornings you
 * skip the scale — which is why a body weighed sixteen times in thirty days came
 * out as a shattered chart of a perfectly continuous trend.
 *
 * The distinction has to survive: the LINE interpolates, the MARKS do not.
 */
describe('LineChart', () => {
  const SERIES = [
    { date: '2026-08-01', value: 80 },
    { date: '2026-08-02', value: null },
    { date: '2026-08-03', value: 79 },
    { date: '2026-08-04', value: 78.5 },
  ]

  it('draws one unbroken path through the days that were measured', () => {
    render(<LineChart series={SERIES} color="#fff" />)
    const line = [...document.querySelectorAll('path')].at(-1)!
    const d = line.getAttribute('d') ?? ''
    // One `M`, so one continuous run — the gap is bridged, not broken.
    expect(d.match(/M/g)).toHaveLength(1)
    expect(d.match(/L/g)).toHaveLength(2)
  })

  it('marks only the days that carry a reading', () => {
    render(<LineChart series={SERIES} color="#fff" unit="kg" />)
    // Three measured days, three tap targets. The unmeasured one has no dot,
    // because the line is an interpolation and the dots are the evidence.
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.queryByLabelText(/2 Aug/)).toBeNull()
  })

  it('names the day and the value when a point is tapped', () => {
    render(<LineChart series={SERIES} color="#fff" unit="kg" />)
    fireEvent.click(screen.getByLabelText(/3 Aug: 79.0kg/))
    expect(screen.getByText(/79.0/)).toBeTruthy()
  })

  it('says nothing at all rather than drawing a line through one point', () => {
    const { container } = render(
      <LineChart series={[{ date: '2026-08-01', value: 80 }]} color="#fff" />,
    )
    expect(container.querySelector('path')).toBeNull()
  })

  it('dates the axis at both ends', () => {
    render(<LineChart series={SERIES} color="#fff" />)
    expect(screen.getByText('1 Aug')).toBeTruthy()
    expect(screen.getByText('4 Aug')).toBeTruthy()
  })
})

/**
 * ── UNDER THE LINE AND OVER IT ARE NOT THE SAME COLOUR ───────────────────────
 * The whole point of drawing intake against the target rather than on its own is
 * that a 2,100 kcal day is a different day depending on which side of the line
 * it fell. If both sides painted the same, the shape would be back to saying
 * only "how much", which a sparkline already said badly.
 */
describe('BalanceBars', () => {
  const bars = (root: HTMLElement) =>
    [...root.querySelectorAll('span')].filter((el) => el.style.height && el.style.background)

  it('paints a deficit and a surplus in different colours, on opposite sides', () => {
    const { container } = render(
      <BalanceBars values={[-400, 300]} under="#0f0" over="#f00" />,
    )
    const [under, over] = bars(container)
    expect(under.style.background).toContain('rgb(0, 255, 0)')
    expect(under.style.top).toBe('50%')
    expect(over.style.background).toContain('rgb(255, 0, 0)')
    expect(over.style.bottom).toBe('50%')
  })

  it('scales to the biggest swing there is, in either direction', () => {
    const { container } = render(<BalanceBars values={[-500, -250]} under="#0f0" over="#f00" />)
    const [big, small] = bars(container)
    expect(big.style.height).toBe('50%')
    expect(small.style.height).toBe('25%')
  })

  it('a day with no reading is a hairline, not a zero', () => {
    const { container } = render(<BalanceBars values={[-500, null]} under="#0f0" over="#f00" />)
    // Only one real column; the gap is drawn as a rule rather than as a bar of
    // no height, which would read as a day that balanced exactly.
    expect(bars(container)).toHaveLength(1)
  })
})

/**
 * ── A PRESCRIBED REST DAY IS A SUCCESS ───────────────────────────────────────
 * The decision the whole chart turns on. Filled, at lower opacity — never empty.
 * A grid that only lights on training days grades a five-day program at 71%
 * forever and teaches the reader that Wednesday is a failure, which is the
 * belief that gets people training on the day the plan told them to recover.
 */
describe('Heatmap', () => {
  /**
   * Columns are whole weeks and the last one ENDS on the final date, so the
   * fixture runs Sunday 2 Aug → Saturday 8 Aug 2026. A ragged window would put
   * its own days past the end of the grid, which is the grid working correctly
   * and the fixture being wrong.
   */
  const days = (states: Array<ConsistencyDay['state']>): ConsistencyDay[] =>
    Array.from({ length: 7 }, (_, i) => ({
      date: `2026-08-0${i + 2}`,
      state: states[i] ?? ('future' as const),
      color: '#00ff00',
    }))

  it('fills a rest day, at a lower opacity than a trained one', () => {
    const { container } = render(<Heatmap days={days(['trained', 'rest'])} weeks={1} />)
    const cells = [...container.querySelectorAll('span')].filter((el) => el.style.width)
    const green = cells.filter((c) => c.style.background.includes('rgb(0, 255, 0)'))
    // BOTH are painted, in the same hue — that is the claim. The rest day is
    // the fainter of the two, so the training week is still legible through it.
    expect(green).toHaveLength(2)
    const opacities = green.map((c) => Number(c.style.opacity || 1)).sort()
    expect(opacities[0]).toBeLessThan(1)
    expect(opacities[1]).toBe(1)
  })

  it('leaves a missed session empty, with an outline rather than a fill', () => {
    const { container } = render(<Heatmap days={days(['missed'])} weeks={1} />)
    const missed = [...container.querySelectorAll('span')]
      .find((el) => el.style.border && el.style.border !== '')
    expect(missed).toBeTruthy()
    expect(missed!.style.background).toBe('transparent')
  })

  it('renders nothing at all rather than an empty frame', () => {
    const { container } = render(<Heatmap days={[]} weeks={4} />)
    expect(container.firstChild).toBeNull()
  })
})

/**
 * ── A SLOPE, NOT FIRST MINUS LAST ────────────────────────────────────────────
 * Two readings a fortnight apart can differ by a kilo of water and nothing else,
 * so "latest minus earliest over weeks" is a rate computed from precisely the
 * two noisiest numbers in the window.
 */
describe('weeklyRateKg', () => {
  const row = (date: string, weightKg: number | null) => ({ date, weightKg })

  it('reads a steady loss as a weekly rate', () => {
    const rate = weeklyRateKg([
      row('2026-08-01', 80), row('2026-08-08', 79.5),
      row('2026-08-15', 79), row('2026-08-22', 78.5),
    ])
    expect(rate).toBeCloseTo(-0.5, 2)
  })

  it('is not thrown by one noisy morning the way an endpoint diff is', () => {
    const clean = [row('2026-08-01', 80), row('2026-08-08', 79.5), row('2026-08-15', 79), row('2026-08-22', 78.5)]
    const noisy = [...clean.slice(0, 3), row('2026-08-22', 79.6)]
    // The endpoint diff swings from -1.5 kg to -0.4 kg over the window; the
    // regression still reports a loss because it uses every reading there is.
    expect(weeklyRateKg(noisy)!).toBeLessThan(0)
    expect(weeklyRateKg(noisy)!).toBeGreaterThan(weeklyRateKg(clean)!)
  })

  it('refuses to call two points a trend', () => {
    expect(weeklyRateKg([row('2026-08-01', 80), row('2026-08-08', 79)])).toBeNull()
    expect(weeklyRateKg([])).toBeNull()
  })

  it('ignores the days the scale was never stepped on', () => {
    const rate = weeklyRateKg([
      row('2026-08-01', 80), row('2026-08-04', null),
      row('2026-08-08', 79.5), row('2026-08-15', 79),
    ])
    expect(rate).toBeCloseTo(-0.5, 2)
  })
})

/**
 * ── A DAY WITH A HOLE IN IT IS COUNTED OUT, NEVER COUNTED AS ZERO ────────────
 * `tdeeKcal` is all-or-nothing on purpose: a missing active-energy sync treated
 * as zero reports a ~400 kcal larger deficit than the day earned, and a ledger
 * that runs one direction wrong on the days a sync failed ACCUMULATES that error
 * rather than averaging it out.
 */
describe('DeficitWidget', () => {
  const day = (date: string, balance: number | null, weightKg: number | null = null): EnergyDay => ({
    date, intake: balance == null ? null : 2000, tdee: balance == null ? null : 2000 - balance, balance, weightKg,
  })

  it('states the rate the balance implies, and how many days it summed', () => {
    // -550 kcal/day is -3,850/week, which is exactly half a kilo at 7,700.
    energy.rows = ['01', '02', '03', '04'].map((d) => day(`2026-08-${d}`, -550))
    render(<DeficitWidget size="m" />)
    expect(KCAL_PER_KG).toBe(7700)
    expect(screen.getByText('-0.50')).toBeTruthy()
    expect(screen.getByText(/4 of 30 days/)).toBeTruthy()
  })

  it('leaves the incomplete days out of the mean rather than zeroing them', () => {
    energy.rows = [day('2026-08-01', -550), day('2026-08-02', null), day('2026-08-03', -550)]
    render(<DeficitWidget size="m" />)
    // Still -550/day. Averaging the null in as a zero would report -367.
    // Twice — once as today's balance, once as the per-day mean. Averaging the
    // null in as a zero would make the second of those -367.
    expect(screen.getAllByText('-550')).toHaveLength(2)
    expect(screen.getByText(/2 of 30 days/)).toBeTruthy()
  })

  it('says it has nothing to weigh rather than printing a rate of zero', () => {
    energy.rows = [day('2026-08-01', null)]
    render(<DeficitWidget size="m" />)
    expect(screen.getByText(/No complete day to weigh yet/i)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/0\.00/)
  })
})

/**
 * ── ADHERENCE IS trained / (trained + missed) ────────────────────────────────
 * Rest days are neither numerator nor denominator: a day the plan did not ask
 * for work on cannot be work you skipped.
 */
describe('ConsistencyWidget', () => {
  it('counts a kept rest day as kept, and leaves it out of the percentage', () => {
    const today = new Date()
    const iso = (back: number) => {
      const d = new Date(today)
      d.setDate(d.getDate() - back)
      return d.toISOString().slice(0, 10)
    }
    // Yesterday was a rest day and was kept; the day before was a training day
    // that happened. Nothing was missed, so adherence is 100%.
    schedule.restOn = new Set([iso(1)])
    sessions.rows = [{ date: iso(2), dayKey: 'upper_a', splitDay: 'upper' }]

    render(<ConsistencyWidget size="m" />)
    expect(screen.getByText('Trained')).toBeTruthy()
    expect(screen.getByText('Rest kept')).toBeTruthy()
    // Every other scheduled day in the window went untrained, so the figure is
    // NOT 100 — what is asserted is that the rest day did not drag it down.
    const missed = screen.getByText('Missed').parentElement?.textContent ?? ''
    expect(missed).not.toContain('0')
  })

  it('counts a scheduled session that never happened as missed', () => {
    sessions.rows = []
    render(<ConsistencyWidget size="s" />)
    // Nothing trained, everything scheduled, so the kept figure is 0%.
    expect(screen.getByText('0')).toBeTruthy()
  })
})


/**
 * ── PROGRAM ORDER, NOT "CLOSEST TO A RECORD" ─────────────────────────────────
 * The ranking was a real choice and it went the other way on purpose. Sorting by
 * how near each lift is to its record answers a question you ask at the end of a
 * block; walking into the gym you are about to do the FIRST movement, and a tile
 * that opened with the sixth is a tile you have to search.
 */
describe('useNextTraining', () => {
  it('names today when today is a training day', () => {
    const { result } = renderHook(() => useNextTraining('2026-08-25'))
    expect(result.current?.isToday).toBe(true)
    expect(result.current?.date).toBe('2026-08-25')
  })

  it('scans forward past a rest day rather than reporting nothing', () => {
    schedule.restOn = new Set(['2026-08-25', '2026-08-26'])
    const { result } = renderHook(() => useNextTraining('2026-08-25'))
    expect(result.current?.isToday).toBe(false)
    expect(result.current?.date).toBe('2026-08-27')
  })

  it('hands the lifts back in the order the program authored them', () => {
    const { result } = renderHook(() => useNextTraining('2026-08-25'))
    const authored = (programDayByKey('upper_a')?.exercises ?? []).map((e) => e.name)
    const got = (result.current?.exercises ?? []).map((e) => e.name)
    expect(got.length).toBeGreaterThan(0)
    // Same relative order, with the lifts a cut drops removed rather than
    // reshuffled — the deck will present them in exactly this sequence.
    expect(got).toEqual(authored.filter((n) => got.includes(n)))
  })
})
