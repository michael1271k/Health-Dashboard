import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ExerciseHistoryBody } from '@/components/exercises/ExerciseHistoryBody'
import type { ExerciseHistoryData } from '@/lib/hooks/useExerciseHistory'

const history = vi.hoisted(() => vi.fn())
vi.mock('@/lib/hooks/useExerciseHistory', () => ({
  useExerciseHistory: () => history(),
  exerciseHistoryQuery: (id: string | null) => ({ queryKey: ['exercise_history', id] }),
}))
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

afterEach(() => { cleanup(); history.mockReset() })

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
    give({ records: { heaviest_weight: 80, best_1rm: 95, best_set_volume: 800, best_session_volume: 3200, total_reps: 410 } })
    render(<ExerciseHistoryBody exerciseId="x" exerciseName="Barbell Bench Press" />)
    expect(screen.getByText('Best est-1RM')).toBeInTheDocument()
    expect(screen.getByText('95')).toBeInTheDocument()
  })

  it('says "no estimate yet" rather than printing a confident zero', () => {
    give({ records: { heaviest_weight: 60, best_1rm: 0, best_set_volume: 600, best_session_volume: 1800, total_reps: 90 } })
    render(<ExerciseHistoryBody exerciseId="x" exerciseName="Barbell Bench Press" />)
    expect(screen.getByText('no estimate yet')).toBeInTheDocument()
    expect(screen.queryByText('0')).toBeNull()
  })
})

describe('an unloaded lift', () => {
  it('reports reps instead of a one-rep max, which is not a fact about a plank', () => {
    give({
      records: { heaviest_weight: 0, best_1rm: 0, best_set_volume: 0, best_session_volume: 0, total_reps: 900 },
      timeline: [day('2026-08-01', { reps: 120 }), day('2026-08-05', { reps: 180 })],
    })
    render(<ExerciseHistoryBody exerciseId="x" exerciseName="Plank" />)

    // The 1RM tile is absent entirely — not dashed, not zeroed.
    expect(screen.queryByText('Best est-1RM')).toBeNull()
    expect(screen.getByText('Most reps in a session')).toBeInTheDocument()
    expect(screen.getByText('180')).toBeInTheDocument()
  })

  it('does not claim a heaviest weight for a movement you cannot load', () => {
    give({ records: { heaviest_weight: 0, best_1rm: 0, best_set_volume: 0, best_session_volume: 0, total_reps: 300 } })
    render(<ExerciseHistoryBody exerciseId="x" exerciseName="Pull-Up" />)
    expect(screen.getByText('Heaviest').parentElement?.textContent).toContain('—')
  })
})

describe('the set-volume caveat', () => {
  it('names what the number actually is, since the RPC does not collapse L/R pairs', () => {
    give({ records: { heaviest_weight: 40, best_1rm: 50, best_set_volume: 400, best_session_volume: 1600, total_reps: 120 } })
    render(<ExerciseHistoryBody exerciseId="x" exerciseName="Dumbbell Row" />)
    expect(screen.getByText('Heaviest single set')).toBeInTheDocument()
    expect(screen.getByText(/each side separately/)).toBeInTheDocument()
    // "Best set vol" implied a collapsed per-set record, which this is not.
    expect(screen.queryByText('Best set vol')).toBeNull()
  })
})
