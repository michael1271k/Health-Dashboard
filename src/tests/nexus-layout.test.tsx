import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { createRef } from 'react'
import { Zone, ZoneRow, StatStrip } from '@/components/ui/Zone'
import { SnapPager, type SnapPagerHandle } from '@/components/ui/SnapPager'
import { hasScaleMetrics } from '@/components/day/InBody'

/**
 * The compaction's binding constraint was "DO NOT remove any data". Height is
 * hard to assert in jsdom, but PRESENCE is exactly what these guard: nothing
 * may be dropped, and nothing may be unmounted behind a tab.
 */
describe('Zone — one container, hairline rows', () => {
  it('renders its label and every row', () => {
    render(
      <Zone label="Vitals" accent="#8E9AAC">
        <ZoneRow divide={false}>first</ZoneRow>
        <ZoneRow>second</ZoneRow>
      </Zone>,
    )
    expect(screen.getByLabelText('Vitals')).toBeInTheDocument()
    expect(screen.getByText('first')).toBeInTheDocument()
    expect(screen.getByText('second')).toBeInTheDocument()
  })

  it('omits the divider on the first row so the label does not sit on a line', () => {
    const { container } = render(
      <Zone label="Today" accent="#fff">
        <ZoneRow divide={false}>a</ZoneRow>
        <ZoneRow>b</ZoneRow>
      </Zone>,
    )
    const rows = [...container.querySelectorAll('div.px-3.py-2')]
    expect(rows[0].getAttribute('style') ?? '').not.toContain('border-top')
    expect(rows[1].getAttribute('style') ?? '').toContain('border-top')
  })
})

describe('StatStrip — six vitals on one line', () => {
  const stats = [
    { label: 'Steps', value: '8,412', color: '#8E9AAC' },
    { label: 'Active', value: '512', color: '#C4514E' },
    { label: 'Stand', value: '11', unit: 'h', color: '#3E9E7A' },
    { label: 'Resp', value: '14.2', unit: '/min', color: '#3D7AB8' },
    { label: 'SpO₂', value: '97', unit: '%', color: '#3E9E7A' },
    { label: 'HRV', value: '48', color: '#3D7AB8' },
  ]

  it('renders every stat — the 3×2 grid became a strip, not a shorter list', () => {
    render(<StatStrip stats={stats} />)
    for (const s of stats) expect(screen.getByText(s.label)).toBeInTheDocument()
    expect(screen.getByText('8,412')).toBeInTheDocument()
    expect(screen.getByText('11h')).toBeInTheDocument()
  })

  it('scrolls sideways rather than wrapping to a second row', () => {
    const { container } = render(<StatStrip stats={stats} />)
    const strip = container.firstElementChild as HTMLElement
    expect(strip.className).toContain('overflow-x-auto')
    expect(strip.className).not.toContain('flex-wrap')
  })

  it('shows an em dash for a missing reading, and no stray unit', () => {
    render(<StatStrip stats={[{ label: 'HRV', value: null, unit: 'ms', color: '#fff' }]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('—ms')).toBeNull()
  })
})

describe('SnapPager — paged, never hidden', () => {
  const pages = [
    { key: 'sleep', label: 'Sleep', content: <p>stage ribbon</p> },
    { key: 'water', label: 'Hydration', content: <p>double helix</p> },
    { key: 'body', label: 'Body', content: <p>body figure</p> },
  ]

  it('keeps EVERY page mounted — swiping must not unmount the other two', () => {
    // A tab control that renders only the active panel would quietly drop two
    // of the three widgets the user asked to keep.
    render(<SnapPager pages={pages} />)
    expect(screen.getByText('stage ribbon')).toBeInTheDocument()
    expect(screen.getByText('double helix')).toBeInTheDocument()
    expect(screen.getByText('body figure')).toBeInTheDocument()
  })

  it('exposes a tab per page, with the first selected', () => {
    render(<SnapPager pages={pages} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Sleep', 'Hydration', 'Body'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('gives every tab a panel to control', () => {
    render(<SnapPager pages={pages} />)
    for (const tab of screen.getAllByRole('tab')) {
      const id = tab.getAttribute('aria-controls')!
      expect(document.getElementById(id)).not.toBeNull()
    }
  })

  it('snaps horizontally without letting the page itself scroll sideways', () => {
    const { container } = render(<SnapPager pages={pages} />)
    const scroller = container.querySelector('.snap-x') as HTMLElement
    expect(scroller.className).toContain('overflow-x-auto')
    expect(scroller.className).toContain('snap-mandatory')
    // Pages are exactly one viewport wide, so a swipe lands on a page boundary.
    for (const panel of screen.getAllByRole('tabpanel')) {
      expect(panel.className).toContain('w-full')
      expect(panel.className).toContain('shrink-0')
    }
  })

  it('keeps its tap targets at 34px', () => {
    render(<SnapPager pages={pages} />)
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toContain('min-h-[34px]')
    }
  })
})

describe('SnapPager — external jump', () => {
  const pages = [
    { key: 'sleep', label: 'Sleep', content: <p>stage ribbon</p> },
    { key: 'water', label: 'Hydration', content: <p>double helix</p> },
    { key: 'body', label: 'Body', content: <p>body figure</p> },
  ]

  /** jsdom has no layout and no Element.scrollTo — stand one in and record it. */
  function withScrollSpy() {
    const calls: Array<{ left: number }> = []
    Element.prototype.scrollTo = function (opts?: ScrollToOptions | number) {
      if (typeof opts === 'object' && opts) calls.push({ left: opts.left ?? 0 })
    } as Element['scrollTo']
    return calls
  }

  it('exposes goTo so a summary row elsewhere can drive the pager', () => {
    // The Fuel zone's water bar and the Hydration page print the same number;
    // the bar navigates instead of duplicating, which needs this handle.
    const calls = withScrollSpy()
    const ref = createRef<SnapPagerHandle>()
    render(<SnapPager ref={ref} pages={pages} />)
    expect(ref.current).not.toBeNull()
    act(() => ref.current!.goTo('water'))
    expect(calls).toHaveLength(1)
  })

  it('ignores an unknown key rather than throwing', () => {
    withScrollSpy()
    const ref = createRef<SnapPagerHandle>()
    render(<SnapPager ref={ref} pages={pages} />)
    expect(() => act(() => ref.current!.goTo('nope'))).not.toThrow()
  })
})

describe('ZoneRow — interactive rows', () => {
  it('renders a real button when the row navigates', () => {
    // A div with an onClick is invisible to the keyboard and to a screen reader,
    // and the water row is now a navigation control.
    render(<Zone label="Fuel" accent="#fff"><ZoneRow asButton onClick={() => {}}>water</ZoneRow></Zone>)
    expect(screen.getByRole('button', { name: 'water' })).toBeInTheDocument()
  })

  it('stays a plain row when it is a gesture target, not a button', () => {
    // The Fuel row's handler is a DOUBLE-tap; button semantics would promise a
    // single activation it does not honour.
    render(<Zone label="Fuel" accent="#fff"><ZoneRow onClick={() => {}}>macros</ZoneRow></Zone>)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('macros')).toBeInTheDocument()
  })
})

describe('hasScaleMetrics — which face the Body page wears', () => {
  it('is false for a day with no readings at all', () => {
    expect(hasScaleMetrics(null)).toBe(false)
    expect(hasScaleMetrics({ steps: 8412, water_ml: 2100 } as never)).toBe(false)
  })

  it('is true on ANY single reading, not just weight', () => {
    // A scale that reported only body fat still means the day was weighed.
    expect(hasScaleMetrics({ weight_kg: 64.2 } as never)).toBe(true)
    expect(hasScaleMetrics({ body_fat_pct: 17.3 } as never)).toBe(true)
    expect(hasScaleMetrics({ bmr: 1520 } as never)).toBe(true)
  })
})
