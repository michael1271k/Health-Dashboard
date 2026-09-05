import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ExerciseHistoryBody } from '@/components/exercises/ExerciseHistoryBody'
import type { ExerciseHistoryData } from '@/lib/hooks/useExerciseHistory'
import type { ExerciseSummarySet } from '@/lib/training/exerciseSummary'

const history = vi.hoisted(() => vi.fn())
const ledger = vi.hoisted(() => vi.fn())
vi.mock('@/lib/hooks/useExerciseHistory', () => ({
  useExerciseHistory: () => history(),
  exerciseHistoryQuery: (id: string | null) => ({ queryKey: ['exercise_history', id] }),
}))
// The RPC still draws the CHARTS; the three headline numbers come from the set
// ledger through `exerciseSummary`, the twin the phone uses. The hook is mocked
// at the query boundary and the real summary function runs, so these tests pin
// the SHARED definition rather than a component's own arithmetic.
vi.mock('@/lib/hooks/useExerciseLedger', async () => {
  const real = await vi.importActual<typeof import('@/lib/hooks/useExerciseLedger')>('@/lib/hooks/useExerciseLedger')
  const { exerciseSummary, EMPTY_EXERCISE_SUMMARY } = await import('@/lib/training/exerciseSummary')
  return {
    ...real,
    useExerciseLedger: () => ({ data: ledger(), isPending: false }),
    useExerciseSummary: (_id: string | null, timed = false) => {
      const sets = ledger()
      return { summary: sets ? exerciseSummary(sets, timed) : EMPTY_EXERCISE_SUMMARY, isPending: false }
    },
  }
})
// jsdom has no layout, so ResponsiveContainer measures 0x0 and the charts warn
// without rendering anything. Nothing here asserts on a chart — the records
// grid is the subject — so they are stubbed to null. Listed explicitly rather
// than proxied: a vi.mock factory is hoisted above the JSX runtime import, so
// it cannot use JSX, and the module shape is clearer written out.
vi.mock('recharts', () => ({
  ResponsiveContainer: () => null,
  AreaChart: () => null,
  Area: () => null,
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}))

afterEach(() => { cleanup(); history.mockReset(); ledger.mockReset() })

function give(data: Partial<ExerciseHistoryData>) {
  history.mockReturnValue({
    isPending: false,
    data: {
      records: {
        heaviest_weight: null, best_1rm: null, best_set_volume: null,
        best_session_volume: null, total_reps: 0, ...(data.records ?? {}),
      },
      timeline: data.timeline ?? [],
    },
  })
}

const day = (d: string, over: Record<string, number | null> = {}) => ({
  day: d, top_weight: null, best_1rm: null, session_volume: null, reps: null, ...over,
})

/** One working set. The ledger the summary is computed from. */
const set = (
  sessionId: string, weightKg: number, reps: number,
  extra: Partial<ExerciseSummarySet> = {},
): ExerciseSummarySet => ({ sessionId, weightKg, reps, ...extra })

const sets = (...rows: ExerciseSummarySet[]) => { ledger.mockReturnValue(rows) }

/**
 * The `exercise_history` RPC computes best_1rm as a plain `max(est_1rm_kg)` —
 * no Epley fallback, no rep-floor gate. For a bodyweight or timed movement the
 * stored column is exactly 0, and the previous UI tested `!= null`, so a Plank
 * reported "Best est-1RM: 0" and drew a flat zero line.
 *
 * Zero is not a small one-rep max. These pin that the UI never says otherwise.
 */
describe('a loaded lift', () => {
  it('shows its estimated 1RM', () => {
    give({})
    sets(set('s1', 80, 5, { est: 95 }), set('s1', 70, 8))
    render(<ExerciseHistoryBody exerciseId="x" exerciseName="Barbell Bench Press" />)
    expect(screen.getByText('Best est-1RM')).toBeInTheDocument()
    expect(screen.getByText('95')).toBeInTheDocument()
  })

  it('falls back to Epley rather than printing a stored zero', () => {
    // The RPC reported `max(est_1rm_kg)` and this row stores 0 — which is
    // "missing", not an estimate. Epley answers it: 60 × (1 + 6/30) = 72.
    give({})
    sets(set('s1', 60, 6, { est: 0 }))
    render(<ExerciseHistoryBody exerciseId="x" exerciseName="Barbell Bench Press" />)
    expect(screen.getByText('72')).toBeInTheDocument()
    expect(screen.queryByText('no estimate yet')).toBeNull()
  })

  it('says "no estimate yet" rather than printing a confident zero', () => {
    give({})
    sets()
    render(<ExerciseHistoryBody exerciseId="x" exerciseName="Barbell Bench Press" />)
    expect(screen.getByText('no estimate yet')).toBeInTheDocument()
  })
})

describe('an unloaded lift', () => {
  it('reports reps instead of a one-rep max, which is not a fact about a plank', () => {
    give({ timeline: [day('2026-08-01', { reps: 120 }), day('2026-08-05', { reps: 180 })] })
    sets(set('s1', 0, 120), set('s2', 0, 180))
    render(<ExerciseHistoryBody exerciseId="x" exerciseName="Plank" />)

    // The 1RM tile is absent entirely — not dashed, not zeroed.
    expect(screen.queryByText('Best est-1RM')).toBeNull()
    expect(screen.getByText('Most reps in a set')).toBeInTheDocument()
    expect(screen.getByText('180')).toBeInTheDocument()
  })

  it('does not claim a heaviest weight for a movement you cannot load', () => {
    give({})
    sets(set('s1', 0, 15), set('s2', 0, 12))
    render(<ExerciseHistoryBody exerciseId="x" exerciseName="Pull-Up" />)
    expect(screen.getByText('Heaviest').parentElement?.textContent).toContain('—')
  })
})

describe('the caveat', () => {
  it('collapses a unilateral pair rather than apologising for not collapsing it', () => {
    give({})
    // Two physical sets, logged as four rows.
    sets(
      set('s1', 20, 12, { side: 'L', pairId: 'p1' }), set('s1', 20, 12, { side: 'R', pairId: 'p1' }),
      set('s1', 20, 10, { side: 'L', pairId: 'p2' }), set('s1', 20, 10, { side: 'R', pairId: 'p2' }),
    )
    render(<ExerciseHistoryBody exerciseId="x" exerciseName="Dumbbell Row" />)

    expect(screen.getByText('Working sets')).toBeInTheDocument()
    expect(screen.getByText(/22 reps in 2/)).toBeInTheDocument()
    // The apology for the RPC is gone, because the number no longer needs one.
    expect(screen.queryByText(/each side separately/)).toBeNull()
  })
})
