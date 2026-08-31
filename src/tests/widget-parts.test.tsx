import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { Spark, Bar, Ring, mean, vsBaseline } from '@/components/dashboard/widgets/parts'
import {
  SIZE_SPAN, WIDGET_IDS, WIDGET_META, WIDGET_SIZES, sizesFor, clampSize, canStack,
  ALL_SIZES, WIDE_SIZES, tileHeightPx, bodyHeightPx, ROW_UNIT_PX, GRID_GAP_PX,
} from '@/lib/dashboard/layout'

afterEach(cleanup)

/**
 * ── THE CROOKED CHART, PINNED ────────────────────────────────────────────────
 *
 * The sparkline has been wrong twice, in opposite directions.
 *
 * First it drew into a fixed `viewBox` with `preserveAspectRatio="none"`, which
 * stretches the drawing to whatever box it lands in: a 1×1 tile and a 2×2 tile
 * have different aspect ratios, so the SAME series came out at two different
 * slants. `vectorEffect` kept the stroke even, which is why it read as
 * "distorted" rather than as obviously broken.
 *
 * The fix for that was `xMidYMid meet`, which preserves the angle by
 * LETTERBOXING — and a 100×32 viewBox inside an 80×11 stat tile then drew 34px
 * of line adrift in the middle of an 80px box. That is the second report:
 * "the graphs are crooked and uncentered within their bounding boxes".
 *
 * The answer to both is to stop reconciling two coordinate systems and only
 * have one: the viewBox IS the measured pixel box, so nothing is stretched and
 * nothing is letterboxed. jsdom computes no layout, so the width falls back to
 * the nominal 100 — which is exactly the case these assertions can pin.
 */
describe('Spark — a line whose meaning is its angle', () => {
  const svg = () => document.querySelector('svg')!

  it('draws into the pixel box, so there is no aspect to stretch or letterbox', () => {
    render(<Spark series={[1, 2, 3, 4]} color="#fff" height={20} />)
    // Height is the viewBox height, not just a CSS box: the two agree, so the
    // ratio the browser would have to correct for is 1:1.
    expect(svg().getAttribute('viewBox')).toBe('0 0 100 20')
    expect(svg().getAttribute('preserveAspectRatio')).toBe('none')
  })

  it('fills the width of its box rather than floating in the middle of it', () => {
    render(<Spark series={[10, 12, 11, 15]} color="#fff" height={12} />)
    const d = document.querySelector('path')!.getAttribute('d') ?? ''
    const xs = [...d.matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1]))
    // 3px of inset either side — the head's dot is 2px in radius and would
    // otherwise clip — and nothing beyond that. A letterboxed line would start
    // and end well inside these.
    expect(xs[0]).toBe(3)
    expect(xs[xs.length - 1]).toBe(97)
  })

  it('scales its geometry with the height it is given', () => {
    // The viewBox height IS the pixel height now, so a taller Spark draws a
    // taller path rather than a stretched copy of a short one. Under the
    // letterboxed version the path was identical and the box did the work,
    // which is what left the drawing adrift inside it.
    const { unmount } = render(<Spark series={[10, 12, 11, 15]} color="#fff" height={12} />)
    const small = document.querySelector('path')!.getAttribute('d')
    unmount()
    render(<Spark series={[10, 12, 11, 15]} color="#fff" height={34} />)
    expect(document.querySelector('path')!.getAttribute('d')).not.toBe(small)
    expect(svg().getAttribute('viewBox')).toBe('0 0 100 34')
  })

  /**
   * A missing day is a gap, not a bridge. Interpolating across it draws a
   * straight line through a day that has no reading — a claim the data does not
   * make, and on a weight chart the most misleading possible one.
   */
  it('breaks the path across a missing day instead of bridging it', () => {
    render(<Spark series={[10, null, 14, 15]} color="#fff" />)
    const d = document.querySelector('path')!.getAttribute('d') ?? ''
    // Two runs → two moves.
    expect((d.match(/M/g) ?? []).length).toBe(2)
  })

  it('renders nothing rather than a flat line when there is one point', () => {
    render(<Spark series={[5, null, null]} color="#fff" />)
    expect(document.querySelector('path')).toBeNull()
  })
})

describe('Bar — clamped for drawing, honest in the number', () => {
  const fill = () => (document.querySelectorAll('span')[1] as HTMLElement).style.width

  it('draws the fraction', () => {
    render(<Bar value={50} target={200} color="#fff" />)
    expect(fill()).toBe('25%')
  })

  it('clamps the DRAWING at full, so an overshoot cannot overflow the track', () => {
    render(<Bar value={400} target={200} color="#fff" />)
    expect(fill()).toBe('100%')
  })

  it('repaints past the target when the target is a cap', () => {
    render(<Bar value={400} target={200} color="#aaaaaa" over="#ff0000" />)
    const bg = (document.querySelectorAll('span')[1] as HTMLElement).style.background
    expect(bg).toContain('255, 0, 0')
  })

  it('draws nothing when there is no target to be a fraction of', () => {
    render(<Bar value={50} target={null} color="#fff" />)
    expect(fill()).toBe('0%')
  })
})

describe('Ring', () => {
  const arc = () => document.querySelectorAll('circle')[1] as SVGCircleElement

  it('fills clockwise from twelve o\'clock', () => {
    render(<svg><Ring pct={50} color="#fff" r={40} /></svg>)
    expect(arc().getAttribute('transform')).toBe('rotate(-90 50 50)')
  })

  it('clamps past 100% rather than winding a second time round', () => {
    render(<svg><Ring pct={250} color="#fff" r={40} /></svg>)
    // offset 0 = fully drawn. A second lap would be a negative offset.
    expect(Number(arc().getAttribute('stroke-dashoffset'))).toBe(0)
  })

  it('treats a null percentage as empty, never as NaN', () => {
    render(<svg><Ring pct={null} color="#fff" r={40} /></svg>)
    expect(Number.isFinite(Number(arc().getAttribute('stroke-dashoffset')))).toBe(true)
  })
})

/**
 * A baseline that contains today is a baseline today is compared against itself
 * inside, which damps every real move — a genuinely bad night reads as average
 * because the bad night is a seventh of the number it is being judged by.
 */
describe('vsBaseline — today against the days BEFORE it', () => {
  it('excludes today from its own baseline', () => {
    // Baseline is the mean of [10, 10, 10] = 10, not of all four = 17.5.
    expect(vsBaseline([10, 10, 10, 40], 40)).toBe(30)
  })

  it('skips missing days rather than counting them as zero', () => {
    expect(vsBaseline([10, null, 10, 20], 20)).toBe(10)
  })

  it('is null when there is no history to compare against', () => {
    expect(vsBaseline([40], 40)).toBeNull()
    expect(vsBaseline([10, 10], null)).toBeNull()
  })

  it('mean ignores nulls and returns null over nothing', () => {
    expect(mean([1, null, 3])).toBe(2)
    expect(mean([null, undefined])).toBeNull()
  })
})

/**
 * The spans are LITERAL class strings because Tailwind scans source text — a
 * class assembled at runtime is never generated into the stylesheet, so a
 * widget would silently render at 1×1 whatever size it was set to.
 */
describe('the size contract', () => {
  /**
   * ── THE THREE SIZES ARE DECOUPLED, AND THAT IS THE POINT ───────────────────
   * The spans were 1/2/3 rows of a 104px unit, which chains them together:
   * medium is exactly twice small plus a gap, so shrinking the medium tile —
   * which was 218px, taller than iOS's own medium widget — was impossible
   * without shrinking small by the same proportion. Halving the unit to 52px
   * and spanning 2/3/5 breaks that: medium lost 46px while small GAINED 8.
   */
  it('medium lands on iOS medium\'s proportion, and small got no smaller', () => {
    expect(tileHeightPx('s')).toBe(112)
    expect(tileHeightPx('m')).toBe(172)
    expect(tileHeightPx('l')).toBe(292)
    // The old geometry, for the record: 104 / 218 / 332.
    expect(tileHeightPx('m')).toBeLessThan(218)
    expect(tileHeightPx('s')).toBeGreaterThan(104)
  })

  it('every size is taller-or-equal as it grows, and none is assembled at runtime', () => {
    const rows = (s: string) => Number(s.match(/row-span-(\d)/)![1])
    expect(rows(SIZE_SPAN.s)).toBeLessThanOrEqual(rows(SIZE_SPAN.m))
    expect(rows(SIZE_SPAN.m)).toBeLessThanOrEqual(rows(SIZE_SPAN.l))
    for (const v of Object.values(SIZE_SPAN)) expect(v).not.toContain('${')
  })

  /**
   * `tileHeightPx` exists so a body with a FIXED ASPECT RATIO can be given a
   * definite height. The muscle atlas is why: its viewBox is 120×260, and an
   * `<svg class="w-full h-full">` inside a `min-h-0` flex column has no definite
   * height to resolve against, so it sized itself from its WIDTH — 175px of tile
   * became a 380px figure. If these two ever drift apart the atlas silently
   * overflows again, so the arithmetic is recomputed here from the spans.
   */
  it('the pixel heights agree with the spans they are derived from', () => {
    const rows = (s: string) => Number(s.match(/row-span-(\d)/)![1])
    for (const size of ['s', 'm', 'l'] as const) {
      const n = rows(SIZE_SPAN[size])
      expect(tileHeightPx(size)).toBe(n * ROW_UNIT_PX + (n - 1) * GRID_GAP_PX)
    }
  })

  it('the body height is the tile minus the frame\'s own chrome', () => {
    for (const size of ['s', 'm', 'l'] as const) {
      expect(bodyHeightPx(size)).toBe(tileHeightPx(size) - 42)
      expect(bodyHeightPx(size)).toBeGreaterThan(0)
    }
  })

  /**
   * Every widget declares the sizes it has a BODY for, and several have no
   * large on purpose — a large that is a stretched medium teaches the reader
   * that growing a tile buys nothing, and after that they stop trying.
   *
   * Small used to be required of everything, on the argument that a phone
   * dashboard of fifteen half-width tiles is unusable. That still holds as a
   * default and it is not absolute: `recovery` is `ReadinessOrb`, a breathing
   * pulse with an ECG trace drawn at the tile's own height, and at ~70px it is
   * a smudge with a number in it. A face that cannot draw its reading legibly
   * is not a smaller version of it.
   *
   * So the exception is declared HERE, by name, rather than the rule being
   * dropped: a widget that quietly loses its small is a bug, and a widget that
   * loses it on purpose is a line in this list.
   */
  const NO_SMALL = new Set(['recovery'])

  it('every widget declares a real, ordered set of sizes', () => {
    for (const id of WIDGET_IDS) {
      const sizes = WIDGET_SIZES[id]
      expect(sizes.length, id).toBeGreaterThan(0)
      if (!NO_SMALL.has(id)) expect(sizes, id).toContain('s')
      expect([...sizes], id).toEqual(ALL_SIZES.filter((v) => sizes.includes(v)))
      for (const v of sizes) expect(SIZE_SPAN[v], id).toBeTruthy()
    }
  })

  it('a widget without a small still has somewhere to go', () => {
    for (const id of NO_SMALL) {
      const sizes = WIDGET_SIZES[id as (typeof WIDGET_IDS)[number]]
      expect(sizes.length, id).toBeGreaterThan(1)
    }
  })

  it('a stack offers only the sizes every one of its faces can draw', () => {
    for (const id of WIDGET_IDS) {
      expect(sizesFor([id], 'desktop')).toEqual([...WIDGET_SIZES[id]])
    }
    // The intersection, never the union — a stack is one tile with one height.
    expect(sizesFor(['sleep', 'cardio'], 'desktop')).toEqual(['s', 'm'])
  })

  it('never offers a four-column size to a two-column grid', () => {
    // A phone renders `grid-cols-2`. A `w` tile in a phone layout would ask that
    // grid for four columns, and CSS grid answers by OVERFLOWING rather than by
    // clamping — so the wide sizes have to be unreachable, not merely unusual.
    for (const id of WIDGET_IDS) {
      for (const size of sizesFor([id], 'phone')) {
        expect(WIDE_SIZES, `${id} @ ${size}`).not.toContain(size)
      }
    }
    expect(sizesFor(['sleep'], 'phone')).toEqual(['s', 'm', 'l'])
    expect(sizesFor(['sleep'], 'desktop')).toEqual(['s', 'm', 'l', 'w', 'xl'])
  })

  it('lands a desktop-only size on the nearest one a phone can draw', () => {
    // The two arrangements are separate, but a v3 payload written before the
    // split seeds BOTH — so a phone can be handed an `xl` exactly once, and it
    // must step DOWN to large rather than collapsing to small.
    expect(clampSize(['sleep'], 'xl', 'phone')).toBe('l')
    expect(clampSize(['sleep'], 'w', 'phone')).toBe('l')
    // And a widget with no wide body keeps its ceiling on either screen.
    expect(clampSize(['cardio'], 'xl', 'desktop')).toBe('m')
  })

  it('refuses to stack anything on a desktop', () => {
    // Four columns have room for every widget at once, so a stack there hides a
    // tile behind a timer to save space that was not short.
    const a = { id: 'a', size: 'm' as const, items: ['sleep' as const] }
    const b = { id: 'b', size: 'm' as const, items: ['cardio' as const] }
    expect(canStack(a, b, 'phone')).toBe(true)
    expect(canStack(a, b, 'desktop')).toBe(false)
  })

  it('names every widget exactly once', () => {
    expect(new Set(WIDGET_IDS).size).toBe(WIDGET_IDS.length)
  })

  /**
   * Edit mode's tray prints a label and an icon for a widget that is, by
   * definition, not on screen to read them off. Retyping those strings there is
   * how the tray comes to disagree with the tile for a release, so every id has
   * exactly one row here and each body spreads its own.
   */
  it('every widget has catalogue metadata for the hidden tray', () => {
    for (const id of WIDGET_IDS) {
      expect(WIDGET_META[id], id).toBeTruthy()
      expect(WIDGET_META[id].label.length, id).toBeGreaterThan(0)
      expect(WIDGET_META[id].icon, id).toBeTruthy()
      expect(WIDGET_META[id].accent, id).toMatch(/^#/)
    }
    expect(Object.keys(WIDGET_META)).toHaveLength(WIDGET_IDS.length)
  })

  /** `next` merged into `train`; a stored layout naming it must simply drop it. */
  it('no longer knows a widget called `next`', () => {
    expect((WIDGET_IDS as readonly string[])).not.toContain('next')
  })
})

/**
 * ── THE SUM THAT IS NOT A QUANTITY ───────────────────────────────────────────
 *
 * `weeklyVolumeByMuscle` credits one PHYSICAL set to every distinct landmark a
 * movement names — in full to each primary, at `SECONDARY_SET_CREDIT` to each
 * secondary — because that is the only way a per-muscle figure is comparable
 * between a leg extension and a squat. The direct consequence, which
 * `landmarks.ts` states outright for the identically-attributed tonnage column,
 * is that ADDING THE ROWS UP OVER-COUNTS.
 *
 * The Weekly Volume widget shipped for about an hour with `Σ sets / Σ target`
 * as its headline. This is the arithmetic proof that such a headline is an
 * artifact of the week's exercise mix rather than a measure of the work, kept
 * here so the next person who reaches for that sum sees the number first.
 */
describe('why the weekly headline is landmarks, not a set total', () => {
  const SECONDARY = 0.5

  /** Σ credited sets for one physical set of a movement with these movers. */
  const credited = (primary: number, secondary: number) => primary * 1 + secondary * SECONDARY

  it('over-counts a compound far more than an isolation, per identical physical set', () => {
    // One squat: quads + glutes primary, hamstrings secondary → 2.5 credited.
    // One leg extension: quads primary → 1.0 credited.
    expect(credited(2, 1)).toBe(2.5)
    expect(credited(1, 0)).toBe(1)
    // Same ONE physical set in each case, so the sum is 2.5x apart for work
    // that is identical in the only unit a set total claims to be counting.
    expect(credited(2, 1) / credited(1, 0)).toBe(2.5)
  })

  it('makes two weeks of equal physical work report different totals', () => {
    const squatWeek = 20 * credited(2, 1)      // 20 physical sets, compound
    const machineWeek = 20 * credited(1, 0)    // 20 physical sets, isolation
    expect(squatWeek).not.toBe(machineWeek)
    // The honest total is the same for both, and comes from
    // `workout_sessions.set_count` — one row per session, no attribution.
    expect(20).toBe(20)
  })

  /**
   * The second half of the same bug: the numerator counted sets belonging to
   * muscles the phase does not prescribe (`target: 0`, zone `'na'`) while the
   * denominator, correctly, did not — so the two halves were not even drawn
   * from the same set of muscles.
   */
  it('a landmark with no target is not "unmet", it is not asked for', () => {
    const rows = [
      { muscle: 'Quads', sets: 12, target: 12, zone: 'optimal' },
      { muscle: 'Adductors', sets: 3, target: 0, zone: 'na' },
    ]
    const graded = rows.filter((m) => m.target > 0)
    expect(graded).toHaveLength(1)
    // Met over graded — never 15/12, which is what the old sum produced.
    expect(graded.filter((m) => m.zone !== 'under').length).toBe(1)
  })
})
