import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { Zone, ZoneRow, StatStrip } from '@/components/ui/Zone'
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

describe('Zone — the full-bleed band', () => {
  // `bleed` became `variant`, and the DEFAULT inverted: a band is now what you
  // get unless you ask for a box. Every page is edge-to-edge, so the boxed
  // shape is the exception and should be the one that has to be named.
  it('drops the radius and the side borders so bands can butt together', () => {
    const { container } = render(<Zone label="Today" accent="#fff"><ZoneRow divide={false}>a</ZoneRow></Zone>)
    const band = container.firstElementChild as HTMLElement
    expect(band.className).not.toContain('rounded')
    expect(band.className).toContain('border-b')
  })

  it('constrains the CONTENT, not the band — edge-to-edge on a phone', () => {
    // The band must reach both screen edges; only the text inside takes a
    // reading measure, or a desktop gets a 1400px-wide stat strip.
    const { container } = render(<Zone label="Today" accent="#fff"><ZoneRow divide={false}>a</ZoneRow></Zone>)
    const band = container.firstElementChild as HTMLElement
    expect(band.className).not.toContain('max-w')
    expect(container.querySelector('.max-w-\\[68ch\\]')).not.toBeNull()
  })

  it('takes the floating card shape only when asked', () => {
    const { container } = render(<Zone variant="inset" label="Today" accent="#fff"><ZoneRow divide={false}>a</ZoneRow></Zone>)
    const band = container.firstElementChild as HTMLElement
    expect(band.className).toContain('rounded-2xl')
  })

  it('widens the measure for content a reading column would strangle', () => {
    // 68ch is ~512px. A chart at that width on a desktop is a postage stamp,
    // and the dashboard bento collapses to one column.
    const { container } = render(<Zone measure="data" label="Volume" accent="#fff"><ZoneRow divide={false}>a</ZoneRow></Zone>)
    expect(container.querySelector('.max-w-\\[96ch\\]')).not.toBeNull()
    expect(container.querySelector('.max-w-\\[68ch\\]')).toBeNull()
  })

  it('renders an action beside the label without displacing it', () => {
    render(
      <Zone label="Soreness" accent="#fff" action={<button type="button">front</button>}>
        <ZoneRow divide={false}>a</ZoneRow>
      </Zone>,
    )
    expect(screen.getByText('Soreness')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'front' })).toBeInTheDocument()
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

/**
 * The SESSION REPORT was the last of the three long documents still boxed in
 * the app shell's `max-w-7xl` column with a gutter either side, so on a phone
 * every card floated in dead margin. Source-level guards, because jsdom has no
 * layout: the shape is `data-fullbleed` plus ONE reading measure applied once.
 *
 * The pinned command bar itself moved to <AppBar/> — it was the third
 * byte-identical copy of one sticky header — so the assertions follow it there.
 * `data-fullbleed` survives as a semantic marker (it is a no-op width rule now
 * that full bleed is the shell default) because the three document routes
 * should still say what they are.
 */
describe('the Session page is full-bleed', () => {
  const src = readFileSync('src/app/session/[id]/page.tsx', 'utf8')

  it('marks its root so it reads as a document, not a dashboard panel', () => {
    expect(src).toMatch(/<div data-fullbleed/)
  })

  it('pins the way out — a long document you must scroll up to escape is a trap', () => {
    expect(src).toMatch(/<AppBar/)
    // `BackLink` carries the label now (it defaults to "Back"), so the literal
    // aria-label no longer appears here. The assertion is that the control is
    // present and is the SHARED one — a hand-rolled glass box would pass a
    // string match and fail the point.
    expect(src).toMatch(/<BackLink/)
  })

  it('takes its reading measure ONCE, on the content and not on the page', () => {
    // A desktop gets a centred column; a phone gets true edge-to-edge. Two
    // measures would reintroduce the gutter the bleed just removed. The bar's
    // own measure now lives inside AppBar, so exactly one remains here.
    expect(src.match(/max-w-\[68ch\]/g)).toHaveLength(1)
    expect(src).not.toMatch(/max-w-7xl/)
  })
})

/**
 * The shell owns every gutter and every clearance now, so a page cannot quietly
 * reintroduce one. These are the two ways it used to happen.
 */
describe('the app shell keeps its own gutters', () => {
  const layout = readFileSync('src/app/layout.tsx', 'utf8')

  it('puts no padding or measure utilities on <main>', () => {
    const main = layout.match(/<main[^>]*>/)?.[0] ?? ''
    expect(main).toMatch(/min-h-dvh/)
    // pt-4 / pb-28 / safe-px / md:pl-64 all moved into the unlayered
    // main#main-content rule, driven by --chrome-top and --chrome-bottom.
    expect(main).not.toMatch(/p[tbxy]?-\d|safe-p|pl-\d/)
    expect(layout).not.toMatch(/app-shell-container max-w/)
  })

  it('has no card classes left to bring the blur back', () => {
    const css = readFileSync('src/app/globals.css', 'utf8')
    expect(css).not.toMatch(/\.helix-card|\.glass-card/)
    // Translucency is chrome-only. Every rule that blurs must be a .app-chrome
    // rule — a blur on content, over a flat canvas, samples a solid colour at
    // full price.
    const blurring = css
      .split('}')
      .filter((rule) => /backdrop-filter:\s*blur/.test(rule))
    expect(blurring.length).toBeGreaterThan(0)   // the chrome still frosts
    for (const rule of blurring) {
      expect(rule).toMatch(/app-chrome/)
    }
  })

  it('never promotes the element the app bar lives inside', () => {
    // A transformed / filtered ancestor makes a descendant backdrop-filter
    // sample the wrong buffer on iOS and paint solid black. The app bar is
    // inside <main>, so this is load-bearing, not hygiene.
    const main = layout.match(/<main[^>]*>/)?.[0] ?? ''
    expect(main).not.toMatch(/transform|filter|perspective|will-change|contain/)
  })
})

/**
 * The pre-inspect quick-view table clipped its Δ column on a phone: four columns
 * of numbers do not fit 360 px, and the rounded shell's `overflow-hidden` turned
 * that into a silent truncation with no scrollbar and no way to reach the cell.
 */
/**
 * The post-workout summary used to be a four-column table — Exercise / Top set /
 * Prev / Δ — floored at `min-w-[360px]` inside an `overflow-x-auto`. Four columns
 * of numbers do not fit a phone, and the sideways scroll was the SYMPTOM: a
 * table is the wrong shape for data whose only variable-length field is the
 * first column.
 *
 * These now pin the stronger property. Not "the scroll is reachable" — there is
 * nothing to scroll.
 */
describe('the post-workout summary fits a phone without scrolling', () => {
  // Comments are documentation, not markup — the file explains at length what
  // the table USED to do, and naming the old class is not the same as shipping
  // it. Same convention as `palette-discipline`.
  const raw = readFileSync('src/components/reports/SessionIntelCard.tsx', 'utf8')
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('has no horizontal scroller at all', () => {
    expect(src).not.toMatch(/overflow-x-auto/)
    expect(src).not.toMatch(/min-w-\[\d+px\]/)
  })

  it('is not a table — nothing sits beside anything that can overflow', () => {
    expect(src).not.toMatch(/<table/)
    expect(src).not.toMatch(/<t[dhr][\s>]/)
  })

  it('lets only the exercise name ellipsis, and keeps its full text reachable', () => {
    expect(src).toMatch(/truncate text-fluid-xs text-text\/90" title=\{d\.name\}/)
  })

  it('keeps the record treatment readable in monochrome and in print', () => {
    // The tint alone disappears on a printed page; the inset rule does not.
    expect(src).toMatch(/inset 3px 0 0 \$\{GOLD\}/)
  })

  it('puts the good news first rather than in performance order', () => {
    expect(src).toMatch(/const RANK = /)
    expect(src).toMatch(/\.sort\(\(a, b\) => RANK\(a\) - RANK\(b\)\)/)
  })
})
