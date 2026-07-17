/**
 * The AI coach's strict session-report contract + the transform into an
 * editable Command Center draft. Client-safe (no server imports): pasted JSON
 * validates entirely in the browser — no LLM call, no network round-trip.
 *
 * The base fields mirror the coach prompt exactly. The ADDITIVE OPTIONAL
 * fields are backward-compatible extensions the coach may adopt over time
 * (per-set granularity, muscle seeding for NEW movements, unit declaration).
 */
import { z } from 'zod'
import { daySplitEnum } from '@/lib/programs'
import { canonicalExerciseName } from '@/lib/exercises/aliases'
import type { SessionDraft, DraftExercise } from '@/lib/sessions/draft'

export const CoachSplit = z.enum(['UPPER_A', 'LEGS_A', 'DELTS_ARMS', 'UPPER_B', 'LEGS_B'])
export type CoachSplitValue = z.infer<typeof CoachSplit>

/** Coach split → HELIX-5 program-day key (programs.ts `C` day identities). */
export const COACH_SPLIT_TO_DAY_KEY: Record<CoachSplitValue, 'cb_a' | 'legs_a' | 'arms' | 'cb_b' | 'legs_b'> = {
  UPPER_A: 'cb_a',
  LEGS_A: 'legs_a',
  DELTS_ARMS: 'arms',
  UPPER_B: 'cb_b',
  LEGS_B: 'legs_b',
}

export const CoachExerciseStatus = z.enum(['PR', 'PROGRESS', 'HOLD', 'REGRESS', 'NEW'])
export type CoachStatus = z.infer<typeof CoachExerciseStatus>

export const CoachExerciseSchema = z.object({
  name: z.string().min(1),
  weight_kg: z.number().nonnegative(),
  sets_reps: z.string().regex(/^\d+(\s*,\s*\d+)*$/, 'expected comma-separated reps, e.g. "12, 11, 10"'),
  status: CoachExerciseStatus,
  note: z.string().max(200).optional().default(''),
  // ── ADDITIVE OPTIONAL (coach-prompt extensions, backward compatible) ──
  /** Per-set granularity (drop/top-back-off sets). Overrides weight_kg × sets_reps. */
  sets: z.array(z.object({
    weight_kg: z.number().nonnegative(),
    reps: z.number().int().positive(),
    rpe: z.number().min(1).max(10).optional(),
  })).min(1).optional(),
  /** Seeds the catalog row when status is NEW (otherwise invisible to muscle analytics). */
  muscle_groups: z.array(z.string()).optional(),
  /** Exercises sharing a tag form a superset (archived now, rendered later). */
  superset_group: z.string().optional(),
  /** Next-session prescription for THIS movement, e.g. "38kg × 10–12". */
  target_next: z.string().optional(),
  /** Raw source name (pre-alias) for auditing. */
  hevy_name: z.string().optional(),
})

export const CoachReportSchema = z.object({
  session: z.object({
    id: z.string().min(1).max(64),                       // → client_session_id (dedupe key)
    split: CoachSplit,
    title: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    week: z.number().int(),
    phase: z.enum(['CUT', 'MAINTENANCE', 'BULK']),
    /** ADDITIVE: makes the kg assumption explicit; lb reports auto-convert. */
    unit: z.enum(['kg', 'lb']).optional().default('kg'),
  }),
  stats: z.object({
    duration_min: z.number().nonnegative(),
    volume_kg: z.number().nonnegative(),
    sets_completed: z.number().int().nonnegative(),
    prs: z.number().int().nonnegative(),
    avg_hr_bpm: z.number().nullable(),
    calories_kcal: z.number().nonnegative(),
    volume_delta_pct_vs_prior: z.number().nullable(),
  }),
  coach_insight: z.string().max(500),
  exercises: z.array(CoachExerciseSchema).min(1),
  next_session_flag: z.string().max(300),
})

export type CoachReport = z.infer<typeof CoachReportSchema>

/** "12, 11, 10" → [12, 11, 10] */
export function parseSetsReps(setsReps: string): number[] {
  return setsReps.split(',').map((r) => parseInt(r.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0)
}

const LB_TO_KG = 0.45359237
/** Practical gym loads: convert and snap to 0.25 kg. */
const lbToKg = (lb: number) => Math.round(lb * LB_TO_KG * 4) / 4

/**
 * Coach report → editable Command Center draft: alias canonicalization,
 * per-set expansion (the optional `sets[]` array wins over weight_kg ×
 * sets_reps), lb→kg conversion, deck order from array order.
 */
export function coachReportToDraft(report: CoachReport): SessionDraft {
  const dayKey = COACH_SPLIT_TO_DAY_KEY[report.session.split]
  const toKg = (w: number) => (report.session.unit === 'lb' ? lbToKg(w) : w)

  const exercises: DraftExercise[] = report.exercises.map((ex, i) => ({
    localId: `ex-${i}-${Math.random().toString(36).slice(2, 8)}`,
    name: canonicalExerciseName(ex.name),
    rawName: ex.hevy_name ?? ex.name,
    status: ex.status,
    note: ex.note || undefined,
    targetNext: ex.target_next,
    supersetGroup: ex.superset_group,
    muscleGroups: ex.muscle_groups,
    sets: (ex.sets ?? parseSetsReps(ex.sets_reps).map((reps) => ({ weight_kg: ex.weight_kg, reps, rpe: undefined as number | undefined })))
      .map((s) => ({ weightKg: toKg(s.weight_kg), reps: s.reps, rpe: s.rpe })),
  }))

  return {
    clientSessionId: report.session.id,
    dayKey,
    splitDay: daySplitEnum(dayKey),
    date: report.session.date,
    title: report.session.title,
    week: report.session.week,
    phase: report.session.phase,
    coachInsight: report.coach_insight,
    nextSessionFlag: report.next_session_flag,
    stats: report.stats,
    notes: '',
    startedAt: `${report.session.date}T17:00:00.000Z`,
    exercises,
    coachReport: report,
  }
}
