import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import {
  defaultLayout, readLayout, writeLayout,
  removeFace, addWidget, resizeSlot, moveSlot, canStack, stackSlots, unstackFace,
  hiddenWidgets, placedWidgets, slotAt,
  WIDGET_IDS, type DashboardLayout,
} from '@/lib/dashboard/layout'
import { HalfArc, MiniBars, Milestones, vsBaseline } from '@/components/dashboard/widgets/parts'
import { StackWidget, stepMarks } from '@/components/dashboard/widgets/DailyWidgets'
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
  const slotOf = (l: DashboardLayout, id: string) =>
    l.slots.find((s) => s.items.includes(id as never))!

  it('taking a face off the grid removes its slot and puts it in the tray', () => {
    const base = L()
    const slot = slotOf(base, 'steps')
    const next = removeFace(base, slot.id, 0)
    expect(placedWidgets(next)).not.toContain('steps')
    expect(hiddenWidgets(next)).toEqual(['steps'])
    expect(slotAt(next, slot.id)).toBeNull()
  })

  it('adding it back puts it on the grid exactly once', () => {
    const base = L()
    const gone = removeFace(base, slotOf(base, 'sleep').id, 0)
    const back = addWidget(gone, 'sleep')
    expect(placedWidgets(back).filter((id) => id === 'sleep')).toHaveLength(1)
    expect(hiddenWidgets(back)).toEqual([])
  })

  it('the tray is derived, so it can never disagree with the grid', () => {
    const base = L()
    expect(hiddenWidgets(base)).toEqual([])
    const gone = removeFace(base, slotOf(base, 'pr').id, 0)
    expect(hiddenWidgets(gone)).toEqual(['pr'])
    // Placed twice is a stack the user built, not a duplicate to clean up.
    const twice = addWidget(gone, 'fuel')
    expect(hiddenWidgets(twice)).toEqual(['pr'])
    expect(placedWidgets(twice).filter((id) => id === 'fuel')).toHaveLength(2)
  })

  it('resize walks the cycle and returns home', () => {
    const base = L()
    const id = slotOf(base, 'steps').id
    const start = slotAt(base, id)!.size
    let l = resizeSlot(base, id)
    expect(slotAt(l, id)!.size).not.toBe(start)
    l = resizeSlot(resizeSlot(l, id), id)
    expect(slotAt(l, id)!.size).toBe(start)
    // And it touched nothing else.
    expect(slotOf(l, 'sleep').size).toBe(slotOf(base, 'sleep').size)
  })

  it('resize skips the size a widget has no body for', () => {
    // Cardio is S/M only — the cycle must never land on `l`.
    const base = L()
    let l = base
    const id = slotOf(base, 'cardio').id
    const seen = new Set<string>()
    for (let i = 0; i < 6; i += 1) {
      seen.add(slotAt(l, id)!.size)
      l = resizeSlot(l, id)
    }
    expect([...seen].sort()).toEqual(['m', 's'])
  })

  it('moving a slot reorders without losing or duplicating anything', () => {
    const base = L()
    const from = base.slots[5].id
    const to = base.slots[1].id
    const moved = moveSlot(base, from, to)
    expect(moved.slots[1].id).toBe(from)
    expect(moved.slots).toHaveLength(base.slots.length)
    expect([...placedWidgets(moved)].sort()).toEqual([...placedWidgets(base)].sort())
  })

  it('taking every widget off the grid is a valid layout, not a crash', () => {
    let l = L()
    while (l.slots.length) l = removeFace(l, l.slots[0].id, 0)
    expect(l.slots).toEqual([])
    expect(hiddenWidgets(l)).toHaveLength(WIDGET_IDS.length)
  })
})

/**
 * ── STACKING IS THE RULE, NOT THE GESTURE ────────────────────────────────────
 *
 * The hover-hold that arms a merge is a dnd-kit drag with a real 600ms clock,
 * and jsdom has neither. What it DOES have is the rule the gesture then calls,
 * and the rule is where the damage would be: a stack is ONE tile, so combining
 * two different sizes would mean a tile that changes height on a timer, moving
 * everything below it without being asked.
 */
describe('smart stacks', () => {
  const L = (): DashboardLayout => defaultLayout()
  const slotOf = (l: DashboardLayout, id: string) =>
    l.slots.find((s) => s.items.includes(id as never))!

  it('refuses two tiles that are not the same size', () => {
    const l = L()
    const small = slotOf(l, 'muscle')      // defaults to `s`
    const medium = slotOf(l, 'fuel')       // defaults to `m`
    expect(small.size).not.toBe(medium.size)
    expect(canStack(small, medium)).toBe(false)
    expect(stackSlots(l, small.id, medium.id)).toBe(l)
  })

  it('refuses to stack a tile onto itself', () => {
    const l = L()
    const one = l.slots[0]
    expect(canStack(one, one)).toBe(false)
  })

  it('combines two same-size tiles into one, target face on top', () => {
    const l = L()
    const from = slotOf(l, 'muscle')
    const onto = slotOf(l, 'steps')
    expect(from.size).toBe(onto.size)
    const next = stackSlots(l, from.id, onto.id)
    expect(next.slots).toHaveLength(l.slots.length - 1)
    expect(slotAt(next, onto.id)!.items).toEqual(['steps', 'muscle'])
    expect(slotAt(next, from.id)).toBeNull()
    // Nothing left the dashboard — a stack is a move, not a delete.
    expect([...placedWidgets(next)].sort()).toEqual([...placedWidgets(l)].sort())
  })

  it('stacks without limit, and a duplicate face is allowed', () => {
    let l = L()
    const onto = slotOf(l, 'steps').id
    for (const id of ['muscle', 'volume', 'pr', 'cardio'] as const) {
      l = stackSlots(l, slotOf(l, id).id, onto)
    }
    l = stackSlots(l, addWidget(l, 'steps').slots.at(-1)!.id, onto)
    expect(slotAt(l, onto)!.items.length).toBeGreaterThanOrEqual(5)
  })

  it('a stack clamps to a size every face can draw', () => {
    const l = L()
    // Cardio is S/M only. Stacked with a small Muscle tile the slot stays small;
    // it can never be grown to a large the cardio face has no body for.
    const next = stackSlots(l, slotOf(l, 'cardio').id, slotOf(l, 'muscle').id)
    const slot = slotAt(next, slotOf(l, 'muscle').id)!
    let grown = next
    for (let i = 0; i < 4; i += 1) grown = resizeSlot(grown, slot.id)
    expect(slotAt(grown, slot.id)!.size).not.toBe('l')
  })

  it('unstacking lifts the named face out, next to the stack it came from', () => {
    const l = L()
    const onto = slotOf(l, 'steps').id
    const stacked = stackSlots(l, slotOf(l, 'muscle').id, onto)
    const at = stacked.slots.findIndex((s) => s.id === onto)
    const split = unstackFace(stacked, onto, 1)
    expect(slotAt(split, onto)!.items).toEqual(['steps'])
    expect(split.slots[at + 1].items).toEqual(['muscle'])
  })

  it('unstacking a tile that is not a stack changes nothing', () => {
    const l = L()
    expect(unstackFace(l, l.slots[0].id, 0)).toBe(l)
  })

  it('removing the last face of a stack leaves the stack, not a hole', () => {
    const l = L()
    const onto = slotOf(l, 'steps').id
    const stacked = stackSlots(l, slotOf(l, 'muscle').id, onto)
    const dropped = removeFace(stacked, onto, 1)
    expect(slotAt(dropped, onto)!.items).toEqual(['steps'])
    expect(hiddenWidgets(dropped)).toEqual(['muscle'])
  })
})

/**
 * A hidden widget survives a reload, or the tray is the only way to find it
 * again and the tray is gone with the session.
 */
describe('persistence', () => {
  beforeEach(() => window.localStorage.clear())

  const slotOf = (l: DashboardLayout, id: string) =>
    l.slots.find((s) => s.items.includes(id as never))!

  it('round-trips a tile taken off the grid and a resize', () => {
    const base = defaultLayout()
    const gone = removeFace(base, slotOf(base, 'cardio').id, 0)
    writeLayout(resizeSlot(gone, slotOf(gone, 'body').id))
    const back = readLayout()
    // `cardio` is off the grid, so the reconcile appends it at the END rather
    // than at its old index — reachable, which is the invariant that matters.
    expect(back.slots.at(-1)!.items).toEqual(['cardio'])
    expect(slotOf(back, 'body').size).toBe('l')
  })

  it('a stack survives a reload', () => {
    const base = defaultLayout()
    const onto = slotOf(base, 'steps').id
    writeLayout(stackSlots(base, slotOf(base, 'muscle').id, onto))
    expect(slotAt(readLayout(), onto)!.items).toEqual(['steps', 'muscle'])
  })

  /** A stored layout naming `next` predates the Train merge. */
  it('drops a widget the catalogue no longer has', () => {
    window.localStorage.setItem('helix_dashboard_layout', JSON.stringify({
      v: 2,
      slots: [
        { id: 'a', size: 'm', items: ['next'] },
        { id: 'b', size: 'm', items: ['sleep', 'fuel'] },
      ],
    }))
    const back = readLayout()
    expect(placedWidgets(back)).not.toContain('next' as never)
    // And everything the catalogue has gained is appended rather than lost.
    expect(new Set(placedWidgets(back))).toEqual(new Set(WIDGET_IDS))
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
  const markAt = (label: string) =>
    (screen.getByText(label).parentElement as HTMLElement).style.left

  it('lights only the marks already passed', () => {
    render(<Milestones value={6200} marks={[2000, 4000, 6000, 8000, 10_000]} color="#00ff00" />)
    for (const label of ['2k', '4k', '6k']) expect(screen.getByText(label)).toBeTruthy()
    expect((screen.getByText('6k') as HTMLElement).style.color).toContain('0, 255, 0')
    expect((screen.getByText('8k') as HTMLElement).style.color).not.toContain('0, 255, 0')
  })

  /**
   * ── A MARK MUST SIT WHERE IT IS, NOT WHERE ITS TURN COMES ──────────────────
   * These were `flex-1` cells, which distributes them EVENLY — right only when
   * the waypoints happen to be evenly spaced. `stepMarks` rounds its interval
   * to 500, so a 7,000-step goal gives 1500/3000/4500/6000/7000 whose last gap
   * is two thirds of the others: drawn as equal cells the 6k tick lands at 80 %
   * of a track where 6k is really 86 %. A mark claiming a position it does not
   * have, on the one control whose whole job is saying where you are.
   */
  it('places each mark at its own fraction of the goal', () => {
    render(<Milestones value={0} marks={stepMarks(7000)} color="#fff" />)
    expect(stepMarks(7000)).toEqual([1500, 3000, 4500, 6000, 7000])
    // 1,500 is "1.5k" and not "2k": `Math.round` used to label a mark with a
    // number it was not.
    expect(markAt('1.5k')).toBe(`${(1500 / 7000) * 100}%`)
    expect(screen.getByText('4.5k')).toBeTruthy()
    expect(markAt('6k')).toBe(`${(6000 / 7000) * 100}%`)
    expect(markAt('7k')).toBe('100%')
    // Even cells would have put 6k at exactly 80%.
    expect(markAt('6k')).not.toBe('80%')
  })

  it('the ladder never overshoots the goal, whatever the goal is', () => {
    for (const goal of [3000, 6000, 7000, 8500, 10_000, 12_000, 20_000]) {
      const marks = stepMarks(goal)
      expect(marks[marks.length - 1], String(goal)).toBe(goal)
      expect(marks.every((m) => m <= goal), String(goal)).toBe(true)
      // Strictly ascending — a repeated mark would stack two ticks in one place.
      expect(marks.every((m, i) => i === 0 || m > marks[i - 1]), String(goal)).toBe(true)
    }
  })
})

/**
 * ── "vs 7-day" HAS TO BE SEVEN DAYS ──────────────────────────────────────────
 * `vsBaseline` is only as honest as the window handed to it. The Steps tile
 * passed the whole series, which was 21 entries and is now 30, under a label
 * saying seven — so a heavy month would flatten today against twenty-nine other
 * days and report "settled" on a day that was genuinely quiet.
 */
describe('the baseline window matches the label', () => {
  it('a seven-day baseline ignores everything before it', () => {
    // Twenty-three quiet days, then a normal week, then today.
    const series = [...Array(22).fill(2000), 8000, 8000, 8000, 8000, 8000, 8000, 8000, 8000]
    expect(vsBaseline(series.slice(-8), 8000)).toBe(0)
    // The whole series would have claimed today was a huge day.
    expect(vsBaseline(series, 8000)).toBeGreaterThan(3000)
  })

  it('is null rather than wrong when the week has no history', () => {
    expect(vsBaseline([5000].slice(-8), 5000)).toBeNull()
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
    // Half the block is ticked, so only the outstanding half is the instruction.
    expect(screen.getByText('Caffeine')).toBeTruthy()
    // The ticked half is still on the tile at medium — struck through, in the
    // "already behind you" list, which is what fills the band that used to be
    // empty by mid-afternoon. It must never be in the NEXT block.
    const taken = screen.getByText('L-Citrulline')
    expect(taken.className).toContain('line-through')
  })

  it('small carries only the instruction, never the ticked items', () => {
    render(<StackWidget size="s" slots={SLOTS} taken={new Set(['citrulline'])} nowMinutes={11 * 60} />)
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
