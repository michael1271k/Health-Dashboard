import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import {
  defaultLayout, readLayout, writeLayout,
  hideWidget, showWidget, resizeWidget, visibleWidgets, hiddenWidgets,
  WIDGET_IDS, type DashboardLayout,
} from '@/lib/dashboard/layout'
import { HalfArc, MiniBars, Milestones } from '@/components/dashboard/widgets/parts'
import { StackWidget } from '@/components/dashboard/widgets/DailyWidgets'
import { LedgerRow } from '@/components/body/CompositionLedger'

afterEach(cleanup)

/**
 * ── ARRANGING IS RULES, NOT GESTURES ─────────────────────────────────────────
 *
 * The long-press that opens edit mode is a dnd-kit sensor firing on a real
 * pointer with a real 450ms clock, and jsdom has neither. What it DOES have is
 * everything the gesture then calls, which is where the rules that can actually
 * be wrong live: the order array is the arrangement and `hidden` is a mask over
 * it, so unhiding must restore a widget to its own place rather than to the end
 * of the grid, and hiding twice must not push a duplicate into the tray.
 */
describe('the arrangement', () => {
  const L = (): DashboardLayout => defaultLayout()

  it('hiding removes it from the grid without losing where it lived', () => {
    const base = L()
    const at = base.order.indexOf('steps')
    const next = hideWidget(base, 'steps')
    expect(visibleWidgets(next)).not.toContain('steps')
    expect(hiddenWidgets(next)).toEqual(['steps'])
    // Still in `order`, at the same index. That IS the restore path.
    expect(next.order.indexOf('steps')).toBe(at)
  })

  it('unhiding puts it back where it was, not at the end', () => {
    const base = L()
    const at = base.order.indexOf('sleep')
    const back = showWidget(hideWidget(base, 'sleep'), 'sleep')
    expect(visibleWidgets(back).indexOf('sleep')).toBe(at)
    expect(visibleWidgets(back)).toEqual(visibleWidgets(base))
  })

  it('hiding twice does not push a duplicate into the tray', () => {
    const twice = hideWidget(hideWidget(L(), 'pr'), 'pr')
    expect(twice.hidden).toEqual(['pr'])
    expect(hiddenWidgets(twice)).toHaveLength(1)
  })

  it('unhiding something that is not hidden changes nothing', () => {
    const base = L()
    expect(showWidget(base, 'fuel')).toBe(base)
  })

  it('resize walks the cycle and returns home', () => {
    let l = L()
    const start = l.size.steps
    l = resizeWidget(l, 'steps')
    expect(l.size.steps).not.toBe(start)
    l = resizeWidget(resizeWidget(l, 'steps'), 'steps')
    expect(l.size.steps).toBe(start)
    // And it touched nothing else.
    expect(l.size.sleep).toBe(L().size.sleep)
  })

  it('hiding every widget is a valid layout, not a crash', () => {
    let l = L()
    for (const id of WIDGET_IDS) l = hideWidget(l, id)
    expect(visibleWidgets(l)).toEqual([])
    expect(hiddenWidgets(l)).toHaveLength(WIDGET_IDS.length)
  })
})

/**
 * A hidden widget survives a reload, or the tray is the only way to find it
 * again and the tray is gone with the session.
 */
describe('persistence', () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips a hidden set and a resize', () => {
    writeLayout(resizeWidget(hideWidget(defaultLayout(), 'cardio'), 'body'))
    const back = readLayout()
    expect(back.hidden).toContain('cardio')
    expect(back.size.body).toBe('l')
  })

  /** A stored layout naming `next` predates the Train merge. */
  it('drops a widget the catalogue no longer has', () => {
    window.localStorage.setItem('helix_dashboard_layout', JSON.stringify({
      v: 1, order: ['next', 'sleep', 'fuel'], size: { next: 'm' }, hidden: ['next'],
    }))
    const back = readLayout()
    expect(back.order).not.toContain('next' as never)
    expect(back.hidden).not.toContain('next' as never)
    // And everything the catalogue has gained is appended rather than lost.
    expect(new Set(back.order)).toEqual(new Set(WIDGET_IDS))
  })
})

/**
 * ── THE SEGMENTS DIVIDE THE FILL, NOT THE SEMICIRCLE ─────────────────────────
 * If the stages divided the whole arc, every night would draw a full semicircle
 * and the only reading the arc exists to give — how you did against the goal —
 * would be gone. A six-hour night against an eight-hour goal must sweep three
 * quarters of the arc, with the stages dividing THAT.
 */
describe('HalfArc', () => {
  const dashLen = (el: Element) => Number((el.getAttribute('stroke-dasharray') ?? '0 0').split(' ')[0])
  const arcs = () => [...document.querySelectorAll('path')].slice(1)   // [0] is the track
  const LEN = Math.PI * 42

  it('sweeps the fraction of the goal, not the whole arc', () => {
    render(<HalfArc pct={75} segments={[{ key: 'a', value: 1, color: '#fff' }]} />)
    expect(dashLen(arcs()[0])).toBeCloseTo(LEN * 0.75, 3)
  })

  it('the segments sum to the sweep, in proportion to the night', () => {
    render(
      <HalfArc
        pct={50}
        segments={[
          { key: 'deep', value: 60, color: '#111' },
          { key: 'core', value: 180, color: '#222' },
        ]}
      />,
    )
    const [deep, core] = arcs()
    expect(dashLen(deep) + dashLen(core)).toBeCloseTo(LEN * 0.5, 3)
    // 60:180 is 1:3, whatever the sweep.
    expect(dashLen(core) / dashLen(deep)).toBeCloseTo(3, 3)
  })

  it('each segment starts where the last one ended', () => {
    render(
      <HalfArc
        pct={100}
        segments={[
          { key: 'a', value: 1, color: '#111' },
          { key: 'b', value: 1, color: '#222' },
        ]}
      />,
    )
    const [a, b] = arcs()
    expect(Number(a.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 6)
    expect(-Number(b.getAttribute('stroke-dashoffset'))).toBeCloseTo(dashLen(a), 3)
  })

  it('clamps past the goal rather than winding round twice', () => {
    render(<HalfArc pct={220} segments={[{ key: 'a', value: 1, color: '#fff' }]} />)
    expect(dashLen(arcs()[0])).toBeCloseTo(LEN, 3)
  })

  it('draws nothing but the track when there is no night', () => {
    render(<HalfArc pct={null} segments={[]} />)
    expect(arcs()).toHaveLength(0)
  })
})

/**
 * A bar chart, not a sparkline: steps are thirty separate daily verdicts, and a
 * line between two of them claims a quantity for four in the morning.
 */
describe('MiniBars', () => {
  const bars = () => [...document.querySelectorAll('span > span')]

  it('a missing day is a stub, never a zero-height gap', () => {
    render(<MiniBars series={[5000, null, 9000]} color="#fff" goal={8000} />)
    const heights = bars().slice(0, 3).map((b) => (b as HTMLElement).style.height)
    expect(heights[1]).toBe('1px')
    expect(heights[0]).not.toBe('1px')
  })

  it('only the days that cleared the goal are lit', () => {
    render(<MiniBars series={[5000, 9000]} color="#00ff00" goal={8000} dim="#333333" />)
    const [under, over] = bars().slice(0, 2).map((b) => (b as HTMLElement).style.background)
    expect(over).toContain('0, 255, 0')
    expect(under).not.toContain('0, 255, 0')
  })

  it('renders nothing at all rather than a flat row on an empty month', () => {
    render(<MiniBars series={[null, null]} color="#fff" />)
    expect(document.querySelectorAll('span > span')).toHaveLength(0)
  })
})

describe('Milestones', () => {
  it('lights only the marks already passed', () => {
    render(<Milestones value={6200} marks={[2000, 4000, 6000, 8000, 10_000]} color="#00ff00" />)
    for (const label of ['2k', '4k', '6k']) expect(screen.getByText(label)).toBeTruthy()
    const passed = screen.getByText('6k') as HTMLElement
    const ahead = screen.getByText('8k') as HTMLElement
    expect(passed.style.color).toContain('0, 255, 0')
    expect(ahead.style.color).not.toContain('0, 255, 0')
  })
})

/**
 * ── A DOSE IS A TIME, NOT AN ITEM ────────────────────────────────────────────
 * The log is keyed by item, correctly — you tick tablets. But you TAKE them by
 * the handful, and naming one of two things due at 11:45 sends you back to the
 * cupboard four minutes later for the other half of the same dose.
 */
describe('StackWidget — one trip to the cupboard', () => {
  const SLOTS = [
    { key: 'citrulline', name: 'L-Citrulline', time: '11:45' },
    { key: 'caffeine', name: 'Caffeine', time: '11:45' },
    { key: 'magnesium', name: 'Magnesium', time: '22:00' },
  ]

  it('names every item in the block due at the same minute', () => {
    render(<StackWidget size="m" slots={SLOTS} taken={new Set()} nowMinutes={11 * 60} />)
    expect(screen.getByText('L-Citrulline')).toBeTruthy()
    expect(screen.getByText('Caffeine')).toBeTruthy()
    expect(screen.getByText(/11:45/)).toBeTruthy()
  })

  it('the count underneath stays per ITEM, because that is what you tick', () => {
    render(<StackWidget size="m" slots={SLOTS} taken={new Set(['citrulline'])} nowMinutes={11 * 60} />)
    expect(screen.getByText('1/3')).toBeTruthy()
    // Half the block is ticked, so only the outstanding half is named.
    expect(screen.getByText('Caffeine')).toBeTruthy()
    expect(screen.queryByText('L-Citrulline')).toBeNull()
  })

  it('an overdue block outranks one scheduled for later', () => {
    render(<StackWidget size="m" slots={SLOTS} taken={new Set()} nowMinutes={15 * 60} />)
    expect(screen.getByText(/overdue/)).toBeTruthy()
    expect(screen.getByText('Caffeine')).toBeTruthy()
  })

  it('says the protocol is complete rather than naming a next that does not exist', () => {
    render(<StackWidget size="s" slots={SLOTS} taken={new Set(SLOTS.map((s) => s.key))} nowMinutes={600} />)
    expect(screen.getByText(/protocol complete/i)).toBeTruthy()
    expect(screen.getByText('3/3')).toBeTruthy()
  })
})

/**
 * "Lean S…" is worse than no label at all: the reader cannot tell which of the
 * two muscle figures they are looking at, and those two are about 23 kg apart.
 */
describe('the compact ledger row', () => {
  it('prints the whole label instead of a 58px column of it', () => {
    render(<LedgerRow compact label="Lean Soft Tissue" color="#fff" pct={64.2} mass={50.3} lo={70} hi={85} unit="kg" />)
    expect(screen.getByText('Lean Soft Tissue')).toBeTruthy()
  })

  it('keeps both band ticks, which are the whole point of the row', () => {
    const { container } = render(
      <LedgerRow compact label="Body Fat" color="#fff" pct={17.2} mass={13.5} lo={10} hi={20} unit="kg" />,
    )
    const ticks = [...container.querySelectorAll('span')].filter((el) => (el as HTMLElement).style.left)
    expect(ticks.map((t) => (t as HTMLElement).style.left)).toEqual(['10%', '20%'])
  })

  it('colours the percentage only while it is inside the band', () => {
    const { unmount } = render(
      <LedgerRow compact label="Body Fat" color="#00ff00" pct={17.2} mass={13.5} lo={10} hi={20} unit="kg" />,
    )
    expect((screen.getByText('17.2%') as HTMLElement).style.color).toContain('0, 255, 0')
    unmount()
    render(<LedgerRow compact label="Body Fat" color="#00ff00" pct={26} mass={20} lo={10} hi={20} unit="kg" />)
    expect((screen.getByText('26%') as HTMLElement).style.color).not.toContain('0, 255, 0')
  })
})
