import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { Spark, Bar, Ring, mean, vsBaseline } from '@/components/dashboard/widgets/parts'
import {
  SIZE_SPAN, SIZE_CYCLE, WIDGET_IDS, WIDGET_META,
  tileHeightPx, bodyHeightPx, ROW_UNIT_PX, GRID_GAP_PX,
} from '@/lib/dashboard/layout'

afterEach(cleanup)

/**
 * ── THE CROOKED CHART, PINNED ────────────────────────────────────────────────
 *
 * The old sparkline drew into `viewBox="0 0 80 32"` with
 * `preserveAspectRatio="none"`, which tells the browser to stretch the drawing
 * to whatever box it lands in. A 1×1 tile and a 2×2 tile have different aspect
 * ratios, so the SAME series came out at two different slants — a 4% rise
 * exaggerated in one and flattened in the other. `vectorEffect` kept the STROKE
 * even, which is exactly why it read as "distorted" rather than as broken.
 *
 * jsdom computes no layout, so this cannot measure the rendered angle. What it
 * CAN do is pin the two attributes that decide whether an angle is preserved at
 * all, and the path geometry that follows from them — which is the whole of the
 * bug and is invisible in a screenshot until you compare two sizes side by side.
 */
describe('Spark — a line whose meaning is its angle', () => {
  const svg = () => document.querySelector('svg')!

  it('never stretches: the aspect ratio is preserved, not discarded', () => {
    render(<Spark series={[1, 2, 3, 4]} color="#fff" />)
    expect(svg().getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
    expect(svg().getAttribute('preserveAspectRatio')).not.toBe('none')
  })

  it('draws the same geometry whatever height it is given', () => {
    // Height is a CSS property here, not a viewBox change — so the path is
    // identical and the browser scales it uniformly. Under the old component
    // the box changed shape and the path with it.
    const { unmount } = render(<Spark series={[10, 12, 11, 15]} color="#fff" height={12} />)
    const small = document.querySelector('path')!.getAttribute('d')
    unmount()
    render(<Spark series={[10, 12, 11, 15]} color="#fff" height={34} />)
    expect(document.querySelector('path')!.getAttribute('d')).toBe(small)
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

  it('cycles through every size and returns home', () => {
    expect(SIZE_CYCLE[SIZE_CYCLE[SIZE_CYCLE.s]]).toBe('s')
    expect(new Set(Object.values(SIZE_CYCLE)).size).toBe(3)
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
