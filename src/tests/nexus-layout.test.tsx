import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Zone, ZoneRow, StatStrip } from '@/components/ui/Zone'
import { SnapPager } from '@/components/ui/SnapPager'

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
