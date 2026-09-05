import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { toRows, ExerciseBreakdown } from '@/components/session-detail/ExerciseBreakdown'
import { SessionTitle } from '@/components/session-detail/SessionTitle'
import type { DetailSet, DetailExercise } from '@/lib/hooks/useSessionDetail'

/**
 * The report's rendering claims — the ones that were false before this pass and
 * that nothing in the type system can hold.
 */

vi.mock('@/lib/hooks/useDayVault', () => ({
  useGlobalSessionNumber: () => ({ data: 7 }),
  useDeleteSession: () => ({}),
}))
// The ledger's three data hooks. Stubbed rather than wired to a QueryClient
// because what is under test is the RENDERING of a set — the trend sparkline
// and the progression cue are the parts that need a server.
vi.mock('@/lib/hooks/useSessionIntel', () => ({ useSessionIntel: () => ({ data: undefined }) }))
vi.mock('@/lib/hooks/useSessionTrends', () => ({ useSessionTrends: () => ({ data: undefined }), LOAD_STEP_KG: 2.5 }))
vi.mock('@/lib/hooks/useExerciseSetHistory', async (orig) => ({
  ...(await orig<typeof import('@/lib/hooks/useExerciseSetHistory')>()),
  useGlobalSetHistory: () => ({ data: undefined }),
}))
// The medal's record sheet re-derives what each PR beat from the whole history
// of the movement (see `useSessionPrRecords` for why it cannot be read from the
// ledger). It is lazy — nothing fetches until a medal is tapped — but the hook
// still calls `useQuery` on mount, which needs a client. What is under test
// here is markup, so it is stubbed like the other three.
vi.mock('@/lib/hooks/useSessionPrRecords', async (orig) => ({
  ...(await orig<typeof import('@/lib/hooks/useSessionPrRecords')>()),
  useSessionPrRecords: () => ({ data: undefined }),
}))

afterEach(cleanup)

let n = 0
const set = (over: Partial<DetailSet> = {}): DetailSet => ({
  setNumber: ++n, weightKg: 60, reps: 10, rpe: null, isPr: false, est1rmKg: null,
  setType: 'normal', side: null, pairId: null, prAxes: [], ...over,
})

const exercise = (sets: DetailSet[], name = 'Single-Arm Cable Row'): DetailExercise => ({
  exerciseId: 'ex1', name, order: 1, muscleGroups: ['Back'], isCompound: false,
  sets, workingSets: sets.filter((x) => x.setType !== 'warmup').length,
  topKg: Math.max(...sets.map((x) => x.weightKg)), volumeKg: 1000,
  bestEst1rm: 80, prAxes: [],
})

const ledger = (sets: DetailSet[]) => render(
  <ExerciseBreakdown sessionId="s1" exercises={[exercise(sets)]} date="2026-08-14" dayKey="upper_b" />,
)

describe('the date is stated once', () => {
  it('the large title carries it, with the session number', () => {
    const { container } = render(<SessionTitle label="Upper B" accent="#D4AF37" date="2026-08-14" />)
    const text = container.textContent ?? ''
    expect(text).toContain('Upper B')
    expect(text).toContain('Session #07')
    expect(text).toContain('14 August')
    // Exactly one — the bar's copy and the metadata box's copy are both gone.
    expect(text.match(/August/g)).toHaveLength(1)
  })
})

/**
 * ── THE HEADER HAD A 44px BAND HOLDING A CHEVRON ─────────────────────────────
 *
 * The page rendered a pinned `AppBar` above this title carrying a back arrow, a
 * phase badge, and a title at `opacity-0` until you scrolled past. At the top of
 * the document — where every visit starts — that is chrome around a chevron, and
 * the report opened 44px lower than it needed to.
 *
 * Both moved down here. The badge split into two on the way: "Helix Cut" fused
 * the programme, the phase and the week into one string that answered none of
 * them precisely.
 */
describe('the title row carries the way out and the week identity', () => {
  it('renders exactly one back control, in the title row', () => {
    const { container } = render(
      <SessionTitle label="Upper B" accent="#D4AF37" date="2026-08-14" onBack={() => {}} />,
    )
    const buttons = container.querySelectorAll('button[aria-label]')
    const back = [...buttons].filter((b) => /back/i.test(b.getAttribute('aria-label') ?? ''))
    expect(back).toHaveLength(1)
    // On the same line as the heading, not stacked above it.
    expect(back[0].closest('div')?.querySelector('h1')?.textContent).toBe('Upper B')
  })

  it('omits it entirely when no handler is given, rather than rendering a dead arrow', () => {
    const { container } = render(<SessionTitle label="Upper B" accent="#D4AF37" date="2026-08-14" />)
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('splits the phase badge into a plan tag and a phase-plus-week tag', () => {
    const { container } = render(
      <SessionTitle label="Upper B" accent="#D4AF37" date="2026-08-14" onBack={() => {}} />,
    )
    const text = container.textContent ?? ''
    // 14 Aug 2026 is Onyx-5, Cut, week 4 of the block.
    expect(text).toMatch(/Onyx-5/)
    expect(text).toMatch(/Cut/)
    expect(text).toMatch(/Wk \d/)
    // The fused single-tag wording is gone.
    expect(text).not.toMatch(/Helix Cut/)
  })

  it('reads the week from the SESSION date, not from current settings', () => {
    // A PPL-era report has to keep saying PPL — resolving from the active plan
    // would let the report rewrite its own history on every plan switch.
    const helix = render(<SessionTitle label="Upper B" accent="#D4AF37" date="2026-08-14" />)
    const ppl = render(<SessionTitle label="Push" accent="#8E9AAC" date="2026-03-02" />)
    expect(helix.container.textContent).not.toBe(ppl.container.textContent)
  })
})

describe('a unilateral pair is one set of work', () => {
  const pair = (l: Partial<DetailSet>, r: Partial<DetailSet>) => toRows([
    set({ ...l, side: 'L', pairId: 'p1' }),
    set({ ...r, side: 'R', pairId: 'p1' }),
  ])

  it('groups both sides into a single row that consumes one set number', () => {
    const rows = pair({ weightKg: 8.75 }, { weightKg: 8.75 })
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('pair')
    expect(rows[0].num).toBe(1)
  })

  it('numbers a following set as 2, not 3 — a pair is not two sets', () => {
    const rows = toRows([
      set({ side: 'L', pairId: 'p1' }),
      set({ side: 'R', pairId: 'p1' }),
      set({}),
    ])
    expect(rows.map((r) => r.num)).toEqual([1, 2])
  })

  it('a warm-up takes no number, so Set 1 is the first working set', () => {
    const rows = toRows([set({ setType: 'warmup' }), set({}), set({})])
    expect(rows.map((r) => r.num)).toEqual([null, 1, 2])
  })
})

describe('one badge carries every state a set can be in', () => {
  it('a plain working set shows its number', () => {
    const { container } = ledger([set()])
    expect(container.querySelector('[aria-label="Set 1"]')).toBeTruthy()
  })

  it('a record replaces the number with a medal', () => {
    const { container } = ledger([set({ isPr: true })])
    expect(container.querySelector('[aria-label*="personal record"]')).toBeTruthy()
  })

  it('a failure set that is also a record renders ONE badge saying both', () => {
    // The collision this whole box exists for. It used to render `F` where the
    // number was, a trophy two columns away, and a gold row wash — three marks,
    // no ordinal, nothing tying them together.
    const { container } = ledger([set({ isPr: true, setType: 'failure' })])
    const badges = container.querySelectorAll('[aria-label*="personal record"]')
    expect(badges).toHaveLength(1)
    expect(badges[0].getAttribute('aria-label')).toContain('Taken to failure')
    expect(badges[0].textContent).toContain('F')
  })

  it('a warm-up keeps its full name in the label even though the letter took the box', () => {
    const { container } = ledger([set({ setType: 'warmup' })])
    const badge = container.querySelector('[aria-label*="Warm-up"]')
    expect(badge?.textContent).toBe('W')
  })
})

describe('unilateral sides are readable and never doubled', () => {
  it('consolidates identical sides into one value line', () => {
    const { container } = ledger([
      set({ weightKg: 8.75, reps: 12, side: 'L', pairId: 'p1' }),
      set({ weightKg: 8.75, reps: 12, side: 'R', pairId: 'p1' }),
    ])
    const text = container.textContent ?? ''
    expect(text).toContain('L=R')
    // Scoped to the SET ROWS — the header's "Top" meta legitimately quotes the
    // same figure, and counting it would make this assertion about the wrong
    // thing. Inside the ledger the value is stated once, not once per side.
    const rows = Array.from(container.querySelectorAll('[data-set-row]'))
      .map((el) => el.textContent ?? '').join(' ')
    expect(rows.match(/8\.75/g)).toHaveLength(1)
  })

  it('keeps both lines when the sides actually differ', () => {
    const { container } = ledger([
      set({ weightKg: 8.75, reps: 12, side: 'L', pairId: 'p1' }),
      set({ weightKg: 8.5, reps: 12, side: 'R', pairId: 'p1' }),
    ])
    const text = container.textContent ?? ''
    expect(text).not.toContain('L=R')
    expect(text).toContain('8.75')
    expect(text).toContain('8.5')
  })

  it('a pair that PRs on both sides shows ONE record mark, not two', () => {
    const { container } = ledger([
      set({ weightKg: 8.75, reps: 12, side: 'L', pairId: 'p1', isPr: true }),
      set({ weightKg: 8.75, reps: 12, side: 'R', pairId: 'p1', isPr: true }),
    ])
    expect(container.querySelectorAll('[aria-label*="personal record"]')).toHaveLength(1)
  })

  it('splits the effort when only the ratings differ', () => {
    const { container } = ledger([
      set({ weightKg: 8.75, reps: 12, side: 'L', pairId: 'p1', rpe: 8.5 }),
      set({ weightKg: 8.75, reps: 12, side: 'R', pairId: 'p1', rpe: 9 }),
    ])
    const text = container.textContent ?? ''
    expect(text).toContain('L=R')       // weight consolidated
    expect(text).toContain('Hard')
    expect(text).toContain('Very Hard') // and the difference is the story
  })
})

/**
 * The markup the browser probe measures. jsdom has no layout, so the claims
 * that matter — `8.75` not clipping, `VERY HARD` not ellipsizing, columns
 * sharing an edge — can only be checked in a real engine. This emits the
 * fixture `e2e/session-ledger.spec.ts` reads; see `set-row-markup.test.tsx`
 * for why it cannot live in the Playwright spec itself.
 */
describe('the ledger markup the browser test measures', () => {
  it('renders every collision, and lands in the fixture', () => {
    const html = renderToStaticMarkup(
      <ExerciseBreakdown
        sessionId="s1"
        date="2026-08-14"
        dayKey="upper_b"
        exercises={[exercise([
          set({ weightKg: 17.5, reps: 12, setType: 'warmup' }),
          set({ weightKg: 102.25, reps: 8, rpe: 9 }),
          set({ weightKg: 60, reps: 10, rpe: 9.5, isPr: true, setType: 'failure' }),
          set({ weightKg: 8.75, reps: 12, side: 'L', pairId: 'p1', rpe: 8.5 }),
          set({ weightKg: 8.5, reps: 12, side: 'R', pairId: 'p1', rpe: 9 }),
        ], 'Leg Press Horizontal (Machine)')]}
      />,
    )

    expect(html).toContain('8.75')
    expect(html).toContain('102.25')
    expect(html).toContain('Very Hard')

    const FIXTURE = resolve(__dirname, '../../e2e/__fixtures__/session-ledger.html')
    mkdirSync(dirname(FIXTURE), { recursive: true })
    writeFileSync(FIXTURE, html, 'utf8')
  })
})
