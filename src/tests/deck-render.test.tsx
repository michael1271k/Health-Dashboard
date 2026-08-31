import { describe, it, expect, afterEach, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { render as rtlRender, cleanup, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExerciseDeckList } from '@/components/command-center/ExerciseDeckList'
import { SetEditorRow } from '@/components/command-center/SetEditorRow'
import { livePrDigest, computeLivePrs } from '@/lib/sessions/livePrs'
import { EMPTY_BASELINES } from '@/lib/training/prEngine'
import type { SessionDraft, DraftSet } from '@/lib/sessions/draft'

/**
 * ── THE DECK NEEDS A QUERY CLIENT NOW ────────────────────────────────────────
 * `ExerciseCard` resolves the treadmill's `Previous` through `usePreviousCardio`
 * — a React Query hook, disabled on every strength card, but a hook all the
 * same, so it needs a client in scope even when it never fetches.
 *
 * `retry: false` and no `gc`, because nothing in this file awaits a query: the
 * assertions are all about what is RENDERED, and a client that retried would
 * keep timers alive past `cleanup`.
 */
function render(ui: Parameters<typeof rtlRender>[0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrap = (node: Parameters<typeof rtlRender>[0]) => (
    <QueryClientProvider client={qc}>{node}</QueryClientProvider>
  )
  const out = rtlRender(wrap(ui))
  return { ...out, rerender: (next: Parameters<typeof rtlRender>[0]) => out.rerender(wrap(next)) }
}

/**
 * `isSetCommitted` is called exactly once in `SetEditorRow`'s render body, so
 * counting it counts row renders — exactly, and immune to machine load. An
 * earlier version of this file timed keystrokes instead; the same deck measured
 * 2.0 ms alone and 5.9 ms under suite contention, and a ratio between deck
 * sizes drifted 1.17→1.74 run to run. Neither could tell a regression from a
 * busy CPU. This can.
 */
const committedCalls = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/lib/sessions/draft', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/sessions/draft')>()
  return { ...real, isSetCommitted: (s: DraftSet) => { committedCalls.n += 1; return real.isSetCommitted(s) } }
})

afterEach(cleanup)

const NAMES = ['Barbell Bench Press', 'Seated Cable Row (Wide)', 'Overhead Press',
  'Lat Pulldown', 'Incline Dumbbell Press', 'Cable Lateral Raise']

/** A real Upper A deck: 6 exercises × 4 sets. Template-seeded, so `done: false`. */
function deck(committed = false, count = NAMES.length): SessionDraft {
  return {
    date: '2026-08-12', dayKey: 'upper_a', notes: '', exercises: NAMES.slice(0, count).map((name, e) => ({
      localId: `ex${e}`, name, kind: 'lift' as const,
      sets: Array.from({ length: 4 }, (_, i): DraftSet => ({
        weightKg: 40 + e * 5 + i * 2.5, reps: 10 - i, ...(committed ? {} : { done: false }),
      })),
    })),
  } as unknown as SessionDraft
}

/** What `updateSet` actually does: untouched exercises keep their identity. */
function keystroke(d: SessionDraft, weight: number): SessionDraft {
  return {
    ...d,
    exercises: d.exercises.map((ex) => ex.localId !== 'ex0' ? ex : {
      ...ex, sets: ex.sets.map((s, i) => i === 0 ? { ...s, weightKg: weight } : s),
    }),
  } as SessionDraft
}

const noop = () => {}
const PROPS: Omit<ComponentProps<typeof ExerciseDeckList>, 'draft'> = {
  history: undefined, livePrs: new Map(), readyByName: new Map(),
  onReorder: noop, onUpdateSet: noop, onSplitSet: noop, onMergeSet: noop,
  onAddSet: noop, onRemoveSet: noop, onToggleDone: noop,
  onRemoveExercise: noop, onSetNote: noop,
}

/**
 * ── THE PERFORMANCE CLAIM, ASSERTED ──────────────────────────────────────────
 * A keystroke used to reconcile all six cards and all twenty-four rows: 2.699
 * ms against this exact deck in jsdom, 16% of a frame before a browser adds
 * style, layout or paint. It is now 1.286 ms — 2.1× faster, 52% removed. In
 * exact terms, five untouched exercises went from 20 extra row renders per
 * keystroke to zero.
 *
 * Two things are worth recording, because both were wrong on the way here.
 *
 * FIRST, the suspected culprit was the PR engine re-running per keystroke. It
 * was not: `computeLivePrs` measures 0.0126 ms on this deck, 0.5% of the
 * keystroke, flat whatever the history size because `PrBaselines` arrives
 * pre-reduced. Reconciliation was 211× its cost. `useDeferredValue` would have
 * bought nothing and would have shown stale PR badges on the one screen whose
 * promise is that the badge on the tick is the badge that gets written.
 *
 * SECOND, an early prototype measured 0.424 ms and predicted 6.3×. That
 * prototype rendered the cards WITHOUT dnd-kit, which is not optional here.
 * `ExerciseCard` calls `useSortable`, and a context change re-renders every
 * consumer no matter how stable its props are — so the six card bodies still
 * re-execute and `memo` cannot stop them. What the boundary does buy is the
 * subtree: `SetEditorRow` subscribes to nothing, so 24 rows and 96 effects
 * drop out. 2.1× is the honest figure with dnd-kit in the tree, not the 6.3×
 * the prototype promised.
 */
function countRowRendersPerKeystroke(exercises: number): number {
  const base = deck(false, exercises)
  const { rerender, unmount } = render(<ExerciseDeckList draft={base} {...PROPS} />)
  act(() => { rerender(<ExerciseDeckList draft={keystroke(base, 1)} {...PROPS} />) })

  committedCalls.n = 0
  act(() => { rerender(<ExerciseDeckList draft={keystroke(base, 2)} {...PROPS} />) })
  const n = committedCalls.n
  unmount()
  return n
}

describe('one keystroke does not reconcile the whole deck', () => {
  /**
   * Six exercises, four sets each. One keystroke changes ONE set on ONE card;
   * the reducer preserves object identity for the other five.
   *
   * `memo(SetEditorRow)` is what keeps the other twenty rows out of the render
   * path. The card SHELLS still re-execute and cannot be stopped from doing so:
   * `ExerciseCard` calls `useSortable`, and a dnd-kit context change re-renders
   * every consumer whatever its props (probed directly — 60 renders across 10
   * keystrokes with memo in place versus 10 without the hook). So the shells'
   * own calls are expected; the rows' are what must not scale.
   */
  it('re-renders the edited card\'s rows, not the whole deck\'s', () => {
    const one = countRowRendersPerKeystroke(1)
    const six = countRowRendersPerKeystroke(6)

    // Measured both ways. WITH the memo: 5 calls at one exercise, 5 at six —
    // adding five untouched exercises costs exactly NOTHING. WITHOUT it: 8 and
    // 28, i.e. four extra row renders per untouched exercise. The threshold is
    // below one exercise's worth of rows, so the regression cannot slip under.
    expect(six - one, `${six - one} extra row renders for 5 untouched exercises — memo(SetEditorRow) is not holding`)
      .toBeLessThan(4)
  })
})

describe('the livePrs digest', () => {
  it('ignores a set that has not been ticked', () => {
    // Template decks start `done: false`. Typing into one cannot change any
    // record, so the engine must not be asked again — and, more importantly,
    // the Map handed to six memoized cards must keep its identity.
    const a = deck()
    const b = keystroke(a, 999)
    expect(livePrDigest(b)).toBe(livePrDigest(a))
  })

  it('moves the moment a committed set changes', () => {
    const a = deck(true)
    expect(livePrDigest(keystroke(a, 999))).not.toBe(livePrDigest(a))
  })

  it('moves when a set is ticked, which is when the answer really changes', () => {
    const a = deck()
    const ticked = {
      ...a,
      exercises: a.exercises.map((ex, e) => e !== 0 ? ex : {
        ...ex, sets: ex.sets.map((s, i) => i === 0 ? { ...s, done: true } : s),
      }),
    } as SessionDraft
    expect(livePrDigest(ticked)).not.toBe(livePrDigest(a))
  })

  it('distinguishes two exercises that share a name-and-index shape', () => {
    // The digest carries localId, so reordering or renaming cannot alias.
    const a = deck(true)
    const renamed = { ...a, exercises: a.exercises.map((ex, e) => e === 0 ? { ...ex, name: 'Other' } : ex) } as SessionDraft
    expect(livePrDigest(renamed)).not.toBe(livePrDigest(a))
  })

  it('covers every field the engine reads', () => {
    // If a field reaches the engine but not the digest, the badge silently
    // goes stale. This is the pairing that keeps the two in step.
    const a = deck(true)
    const mutate = (patch: Partial<DraftSet>) => ({
      ...a,
      exercises: a.exercises.map((ex, e) => e !== 0 ? ex : {
        ...ex, sets: ex.sets.map((s, i) => i === 0 ? { ...s, ...patch } : s),
      }),
    }) as SessionDraft

    for (const patch of [
      { weightKg: 123 }, { reps: 3 }, { setType: 'warmup' as const },
      { side: 'R' as const }, { pairId: 'p1' },
    ]) {
      expect(livePrDigest(mutate(patch)), `digest ignores ${Object.keys(patch)[0]}`)
        .not.toBe(livePrDigest(a))
    }
  })

  it('a live deck of untouched sets produces no candidates at all', () => {
    // Which is why typing in one costs nothing: the engine early-returns.
    const empty = computeLivePrs(deck(), EMPTY_BASELINES)
    expect(empty.count).toBe(0)
    expect(empty.bySet.size).toBe(0)
  })
})

/**
 * ── THE GRID, ASSERTED ───────────────────────────────────────────────────────
 * Everything below is a rendering claim that used to be false, and each one was
 * invisible to both the type checker and the linter: a header that does not
 * exist, a label cut to six characters, a set number where a medal belongs.
 * They are cheap to assert and they were expensive to notice.
 */
describe('the set row reads as a table', () => {
  it('puts column headers above the rows, once per exercise', () => {
    const { container } = render(<ExerciseDeckList draft={deck(false, 2)} {...PROPS} />)
    const text = container.textContent ?? ''
    for (const label of ['Set', 'Previous', 'kg', 'Reps']) {
      expect(text, `no "${label}" column header`).toContain(label)
    }
    // One header per card, not one per row.
    expect(container.querySelectorAll('[class*="tracking-[0.1em]"]').length).toBeGreaterThanOrEqual(2)
  })

  it('puts effort in a column, not on a second line under the row', () => {
    // "VERY HARD" was a chip below the row, ~22px, so a rated set was
    // two-thirds taller than an unrated one and the deck grew as you logged it.
    // It is the NUMBER in a 30px column now; the word survives as the accessible
    // name and the tooltip, which is what keeps the row one line tall.
    const d = deck(true)
    const rated = {
      ...d,
      exercises: d.exercises.map((ex, e) => e !== 0 ? ex : {
        ...ex, sets: ex.sets.map((s, i) => i === 0 ? { ...s, rpe: 9 } : s),
      }),
    } as SessionDraft
    const { container } = render(<ExerciseDeckList draft={rated} {...PROPS} />)
    const cell = Array.from(container.querySelectorAll('span'))
      .find((el) => el.getAttribute('aria-label') === 'Effort Very Hard')
    expect(cell, 'the effort cell does not render').toBeTruthy()
    expect(cell!.textContent, 'the column should carry the number').toBe('9')
    expect(cell!.getAttribute('title')).toBe('Very Hard')
  })

  it('has no "Check all" anywhere — the tick is a per-set assertion', () => {
    // One tap used to turn every set in an exercise green. The tick is the
    // single claim this app makes about what happened on the gym floor, and
    // every downstream number reads it as "I performed this"; a control that
    // asserts four of them at once from a card you have not looked at makes
    // that claim cheap. Removed deliberately — see `useSessionDraft`.
    const { container } = render(<ExerciseDeckList draft={deck(false, 2)} {...PROPS} />)
    expect(container.textContent ?? '').not.toContain('Check all')
  })

  it('makes the set badge a control, and keeps set type out of the row', () => {
    // The tuner was ~250px for one set, and ~90px of that went on three
    // controls reached a handful of times a session. They live behind the badge
    // now (`SetActionSheet`), which was already drawn and already displayed the
    // value they change.
    const { container } = render(<ExerciseDeckList draft={deck(true, 1)} {...PROPS} />)
    const badge = Array.from(container.querySelectorAll('button'))
      .find((b) => (b.getAttribute('aria-label') ?? '').includes('set options'))
    expect(badge, 'the set badge is not a button').toBeTruthy()

    // The row is collapsed, so nothing of the tuner should be mounted — but
    // more importantly the segmented type control must not be in the ROW at
    // any time, open or closed.
    for (const word of ['Warm-up', 'Drop set', 'Remove set', 'Split L / R']) {
      expect(container.textContent ?? '', `"${word}" is still rendered inline in the row`)
        .not.toContain(word)
    }
  })

  it('shows the previous set with its unit, not a bare pair of numbers', () => {
    // "17.5×12" made the reader supply the kg themselves, one column away from
    // a number that had one. A reference costs nothing to read or it is not a
    // reference.
    const history = new Map([[NAMES[0], {
      date: '2026-08-05',
      sets: [{ weightKg: 17.5, reps: 12 }, { weightKg: 17.5, reps: 11 }],
    }]]) as ComponentProps<typeof ExerciseDeckList>['history']
    const { container } = render(<ExerciseDeckList draft={deck(true, 1)} {...PROPS} history={history} />)
    expect(container.textContent, 'the previous column never rendered').toContain('17.5kg × 12')
    expect(container.textContent, 'a unitless previous pair is still being rendered').not.toMatch(/\d×\d/)
  })
})


/**
 * ── EFFORT ON A WARM-UP ──────────────────────────────────────────────────────
 * Rendered directly rather than through the deck: whether the ladder mounts at
 * all is `useTrackRpe()`'s decision, which reads `user_goals` and is false in a
 * test. The question here is the OTHER gate — the one this pass removed.
 */
describe('every set can be rated, not only the working ones', () => {
  const base = { weightKg: 40, reps: 10, done: true } as DraftSet
  const row = (set: DraftSet) => render(
    <SetEditorRow
      index={0} displayNum={1} set={set} prev={null} active trackRpe prAxes={[]}
      onActivate={noop} onChange={noop} onRemove={noop} onToggleDone={noop}
    />,
  )

  it('rates a warm-up, because a log is not a verdict', () => {
    // The ladder used to be gated on `!isWarm`, on the reasoning that a warm-up
    // is not the effort the question is about. True of a RECORD — and the PR
    // engine still ignores warm-ups — but not of the log: a warm-up that felt
    // like a working set is exactly the thing worth writing down.
    const { container } = row({ ...base, setType: 'warmup' })
    expect(container.textContent ?? '').toContain('Effort')
  })

  it('rates a drop set too', () => {
    const { container } = row({ ...base, setType: 'dropset' })
    expect(container.textContent ?? '').toContain('Effort')
  })

  it('still rates a normal set', () => {
    const { container } = row(base)
    expect(container.textContent ?? '').toContain('Effort')
  })
})
