import { describe, it, expect, afterEach, vi } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { render, cleanup } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SessionTitle } from '@/components/session-detail/SessionTitle'
import { SessionHero } from '@/components/session-detail/SessionHero'
import { GOLD } from '@/lib/theme/palette'
import type { SessionDetail } from '@/lib/hooks/useSessionDetail'

/**
 * ── THE SET-COUNT STRING HAD NOWHERE TO GO ───────────────────────────────────
 *
 * Under the "Sets" figure the header printed `"1 warm-up · 1 to failure"` — up
 * to 26 characters into a `truncate`d slot about a third of the header wide.
 * At 360px it read `"1 warm-up · 1 to fail…"`, and adding a drop set made the
 * first tag the only survivor.
 *
 * The words are the wrong unit for the space, and the app already had the right
 * one: the set ledger below and the live logger both write W, F and D. So the
 * header uses the same table.
 *
 * jsdom cannot tell you whether text is clipped — it has no layout engine — so
 * this file asserts the MARKUP claims and emits a fixture that
 * `e2e/session-summary-header.spec.ts` measures in a real browser.
 */

const FIXTURE = resolve(__dirname, '../../e2e/__fixtures__/session-summary-header.html')

vi.mock('@/lib/hooks/useDayVault', () => ({
  useGlobalSessionNumber: () => ({ data: 7 }),
  useDeleteSession: () => ({ mutate: () => {}, isPending: false }),
}))
vi.mock('@/lib/hooks/useEditSession', () => ({ useEditSession: () => ({ load: () => {}, loading: false }) }))
vi.mock('@/lib/hooks/useSessionIntel', () => ({ useSessionIntel: () => ({ data: undefined }) }))
// The hero's Delete action navigates on success; nothing here clicks it.
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: () => {}, push: () => {} }) }))

afterEach(cleanup)

/** The widest realistic header: five-digit volume, and all three set tags. */
const DETAIL = {
  id: 's1', date: '2026-08-14', splitDay: 'legs_b', dayKey: 'legs_b',
  volumeKg: 12480, durationMin: 63, setCount: 18, prCount: 2,
  sessionRpe: 8.5, avgBpm: 142, calories: 604,
  avgBpmEstimated: false, caloriesEstimated: false,
  warmupSets: 2, failureSets: 1, dropsetSets: 1,
  workingSets: 16, exercises: [], muscleSets: [],
} as unknown as SessionDetail

describe('the set composition', () => {
  it('reads as counted letter chips, not a truncated sentence', () => {
    const { container } = render(<SessionHero detail={DETAIL} />)
    const text = container.textContent ?? ''
    expect(text).toContain('2W')
    expect(text).toContain('1F')
    expect(text).toContain('1D')
    // The prose form is what would not fit.
    expect(text).not.toContain('warm-up ·')
    expect(text).not.toContain('to failure')
  })

  it('keeps the whole word reachable, in the title', () => {
    // A letter nobody can expand is a letter nobody understands. The tooltip is
    // the only place the vocabulary is explained on this surface.
    const { container } = render(<SessionHero detail={DETAIL} />)
    const titles = [...container.querySelectorAll('[title]')].map((e) => e.getAttribute('title'))
    expect(titles).toContain('2 × Warm-up')
    expect(titles).toContain('1 × Taken to failure')
    expect(titles).toContain('1 × Drop set')
  })

  it('renders nothing at all when every set was an ordinary working set', () => {
    // A row of chips that is always present is a row nobody reads.
    const plain = { ...DETAIL, warmupSets: 0, failureSets: 0, dropsetSets: 0 } as SessionDetail
    const { container } = render(<SessionHero detail={plain} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\d[WFD]\b/)
  })

  it('uses the SAME letters as the ledger and the logger', async () => {
    // Three surfaces, one vocabulary — the reason the table moved out of
    // `ExerciseBreakdown` in the first place.
    const { SET_TAGS } = await import('@/lib/training/setTags')
    expect(SET_TAGS.warmup.label).toBe('W')
    expect(SET_TAGS.failure.label).toBe('F')
    expect(SET_TAGS.dropset.label).toBe('D')
  })
})

describe('the fixture the browser measures', () => {
  it('renders the header and lands in the fixture', () => {
    const markup = renderToStaticMarkup(
      <div id="probe-summary" style={{ background: '#0A0B0D', padding: 8 }}>
        <div data-probe-part="title">
          <SessionTitle label="Legs & Core B" accent={GOLD} date="2026-08-14" onBack={() => {}} />
        </div>
        <div data-probe-part="hero">
          <SessionHero detail={DETAIL} />
        </div>
      </div>,
    )
    mkdirSync(dirname(FIXTURE), { recursive: true })
    writeFileSync(FIXTURE, markup, 'utf8')
    // The longest day label, and the widest realistic figure.
    expect(markup).toContain('Legs &amp; Core B')
    expect(markup).toContain('12,480')
  })
})
