import { describe, it, expect } from 'vitest'
import {
  CoachReportSchema, coachReportToDraft, parseSetsReps, COACH_SPLIT_TO_DAY_KEY, CoachSplit,
} from '@/lib/coach/reportSchema'
import { buildCommitPayload } from '@/lib/sessions/draft'
import { canonicalExerciseName } from '@/lib/exercises/aliases'
import { SaveWorkoutSchema } from '@/lib/sessions/schema'

/** The exact sample shape from the coach spec. */
const SPEC_SAMPLE = {
  session: {
    id: '2026-07-19-D1',
    split: 'UPPER_A',
    title: 'CHEST+BACK A',
    date: '2026-07-19',
    week: 1,
    phase: 'CUT',
  },
  stats: {
    duration_min: 62,
    volume_kg: 8420,
    sets_completed: 18,
    prs: 2,
    avg_hr_bpm: null,
    calories_kcal: 410,
    volume_delta_pct_vs_prior: null,
  },
  coach_insight: 'Pressing strength held under the deficit. Keep the top set honest and stop one rep shy of failure.',
  exercises: [
    {
      name: 'Incline DB Press',
      weight_kg: 36,
      sets_reps: '12, 11, 10',
      status: 'PR',
      note: 'Top set moved fast — add 1 rep next week.',
    },
  ],
  next_session_flag: 'Open with 36kg and chase 12/12/11.',
}

describe('CoachReportSchema — strict contract', () => {
  it('parses the spec sample exactly', () => {
    const parsed = CoachReportSchema.parse(SPEC_SAMPLE)
    expect(parsed.session.id).toBe('2026-07-19-D1')
    expect(parsed.session.unit).toBe('kg')          // default
    expect(parsed.exercises[0].status).toBe('PR')
  })

  it('rejects an unknown split and a malformed sets_reps', () => {
    expect(CoachReportSchema.safeParse({
      ...SPEC_SAMPLE, session: { ...SPEC_SAMPLE.session, split: 'PUSH_A' },
    }).success).toBe(false)
    expect(CoachReportSchema.safeParse({
      ...SPEC_SAMPLE,
      exercises: [{ ...SPEC_SAMPLE.exercises[0], sets_reps: '12x3' }],
    }).success).toBe(false)
  })

  it('accepts the additive optional fields', () => {
    const parsed = CoachReportSchema.parse({
      ...SPEC_SAMPLE,
      session: { ...SPEC_SAMPLE.session, unit: 'lb' },
      exercises: [{
        ...SPEC_SAMPLE.exercises[0],
        sets: [{ weight_kg: 80, reps: 12 }, { weight_kg: 70, reps: 10, rpe: 9 }],
        muscle_groups: ['chest', 'triceps'],
        superset_group: 'A',
        target_next: '38kg × 10–12',
        hevy_name: 'Incline Bench Press (Dumbbell)',
      }],
    })
    expect(parsed.exercises[0].sets).toHaveLength(2)
    expect(parsed.session.unit).toBe('lb')
  })
})

describe('parseSetsReps', () => {
  it('parses spaced and unspaced lists', () => {
    expect(parseSetsReps('12, 11, 10')).toEqual([12, 11, 10])
    expect(parseSetsReps('8,8,8,8')).toEqual([8, 8, 8, 8])
    expect(parseSetsReps('15')).toEqual([15])
  })
})

describe('COACH_SPLIT_TO_DAY_KEY', () => {
  it('maps every coach split to a HELIX-5 day key (total)', () => {
    for (const split of CoachSplit.options) {
      expect(COACH_SPLIT_TO_DAY_KEY[split]).toBeTruthy()
    }
    expect(COACH_SPLIT_TO_DAY_KEY.UPPER_A).toBe('cb_a')
    expect(COACH_SPLIT_TO_DAY_KEY.DELTS_ARMS).toBe('arms')
    expect(COACH_SPLIT_TO_DAY_KEY.LEGS_B).toBe('legs_b')
  })
})

describe('alias canonicalization', () => {
  it('maps the Hevy close-grip placeholder to the neutral-grip movement', () => {
    expect(canonicalExerciseName('Lat Pulldown - Close Grip (Cable)')).toBe('Neutral-Grip Lat Pulldown')
    expect(canonicalExerciseName('  lat pulldown - close grip (cable)  ')).toBe('Neutral-Grip Lat Pulldown')
  })
  it('passes unknown names through untouched', () => {
    expect(canonicalExerciseName('Incline DB Press')).toBe('Incline DB Press')
  })
})

describe('coachReportToDraft', () => {
  it('expands sets_reps × weight_kg into per-set rows with deck order', () => {
    const draft = coachReportToDraft(CoachReportSchema.parse(SPEC_SAMPLE))
    expect(draft.clientSessionId).toBe('2026-07-19-D1')
    expect(draft.dayKey).toBe('cb_a')
    expect(draft.splitDay).toBe('upper')
    expect(draft.exercises[0].sets).toEqual([
      { weightKg: 36, reps: 12, rpe: undefined },
      { weightKg: 36, reps: 11, rpe: undefined },
      { weightKg: 36, reps: 10, rpe: undefined },
    ])
    expect(draft.startedAt.slice(0, 10)).toBe('2026-07-19')
  })

  it('prefers the per-set array and converts lb → kg (snapped to 0.25)', () => {
    const draft = coachReportToDraft(CoachReportSchema.parse({
      ...SPEC_SAMPLE,
      session: { ...SPEC_SAMPLE.session, unit: 'lb' },
      exercises: [{
        ...SPEC_SAMPLE.exercises[0],
        sets: [{ weight_kg: 80, reps: 12 }, { weight_kg: 70, reps: 10, rpe: 9 }],
      }],
    }))
    expect(draft.exercises[0].sets).toHaveLength(2)
    expect(draft.exercises[0].sets[0].weightKg).toBe(36.25)  // 80 lb → 36.287 → 36.25
    expect(draft.exercises[0].sets[1].rpe).toBe(9)
  })

  it('canonicalizes alias names in the deck', () => {
    const draft = coachReportToDraft(CoachReportSchema.parse({
      ...SPEC_SAMPLE,
      exercises: [{ ...SPEC_SAMPLE.exercises[0], name: 'Lat Pulldown - Close Grip (Cable)' }],
    }))
    expect(draft.exercises[0].name).toBe('Neutral-Grip Lat Pulldown')
    expect(draft.exercises[0].rawName).toBe('Lat Pulldown - Close Grip (Cable)')
  })
})

describe('buildCommitPayload', () => {
  const draft = coachReportToDraft(CoachReportSchema.parse(SPEC_SAMPLE))

  it('produces a body that satisfies SaveWorkoutSchema (round-trip)', () => {
    const body = buildCommitPayload(draft)
    const parsed = SaveWorkoutSchema.safeParse(body)
    expect(parsed.success).toBe(true)
    expect(body.clientSessionId).toBe('2026-07-19-D1')
    expect(body.dayKey).toBe('cb_a')
    expect(body.reportMd).toBe(SPEC_SAMPLE.coach_insight)
    expect(body.sets.map((s) => s.setNumber)).toEqual([1, 2, 3])
    expect(body.sets.every((s) => s.exerciseOrder === 0)).toBe(true)
    expect(body.metrics?.durationMin).toBe(62)
  })

  it('derives endedAt from startedAt + duration (late logging stays sane)', () => {
    const body = buildCommitPayload(draft)
    const windowMin = (new Date(body.endedAt).getTime() - new Date(body.startedAt).getTime()) / 60_000
    expect(windowMin).toBe(62)                          // stats.duration_min, never wall-clock "now"
    expect(body.endedAt.slice(0, 10)).toBe('2026-07-19')
  })

  it('reordered exercises carry their new deck position', () => {
    const two = coachReportToDraft(CoachReportSchema.parse({
      ...SPEC_SAMPLE,
      exercises: [
        SPEC_SAMPLE.exercises[0],
        { name: 'Chest-Supported Row', weight_kg: 50, sets_reps: '10, 10', status: 'PROGRESS', note: '' },
      ],
    }))
    two.exercises = [two.exercises[1], two.exercises[0]]   // drag row to the top
    const body = buildCommitPayload(two)
    const rowSets = body.sets.filter((s) => s.exerciseName === 'Chest-Supported Row')
    expect(rowSets.every((s) => s.exerciseOrder === 0)).toBe(true)
    const pressSets = body.sets.filter((s) => s.exerciseName === 'Incline DB Press')
    expect(pressSets.every((s) => s.exerciseOrder === 1)).toBe(true)
  })
})
