/**
 * SessionDraft — the editable, client-side state between input (pasted coach
 * JSON / live gym session) and commit (POST /api/sessions). Autosaved to
 * localStorage so an in-gym session survives app restarts; discarded or
 * cleared on successful commit. Never persisted server-side.
 */
import type { SplitDay } from '@/lib/types/workout'
import type { SaveWorkoutInput } from '@/lib/sessions/schema'

export interface DraftSet {
  weightKg: number
  reps: number
  rpe?: number
  /** Live-mode check-off; un-done sets are dropped at commit. */
  done?: boolean
}

export interface DraftExercise {
  /** Stable client-side key for dnd-kit sortables. */
  localId: string
  /** Canonical display name (alias-mapped). */
  name: string
  /** Original incoming name, pre-alias — audit only. */
  rawName?: string
  status?: 'PR' | 'PROGRESS' | 'HOLD' | 'REGRESS' | 'NEW'
  note?: string
  targetNext?: string
  supersetGroup?: string
  muscleGroups?: string[]
  sets: DraftSet[]
}

export interface SessionDraft {
  mode: 'review' | 'live'
  /** Coach session.id — idempotency key (absent on live drafts). */
  clientSessionId?: string
  dayKey?: 'cb_a' | 'legs_a' | 'arms' | 'cb_b' | 'legs_b'
  splitDay: SplitDay
  date: string                  // YYYY-MM-DD
  title?: string
  week?: number
  phase?: string
  coachInsight?: string
  nextSessionFlag?: string
  stats?: {
    duration_min: number
    volume_kg: number
    sets_completed: number
    prs: number
    avg_hr_bpm: number | null
    calories_kcal: number
    volume_delta_pct_vs_prior: number | null
  }
  notes: string
  startedAt: string             // ISO — live mode: deck-open time (persisted)
  exercises: DraftExercise[]
  /** Full validated coach JSON, archived on commit. */
  coachReport?: unknown
}

export const DRAFT_STORAGE_KEY = 'helix_session_draft:v1'

/** Σ weight×reps over the committable sets. */
export function draftTotals(draft: SessionDraft, onlyDone = false): { volumeKg: number; sets: number; doneSets: number } {
  let volumeKg = 0; let sets = 0; let doneSets = 0
  for (const ex of draft.exercises) {
    for (const s of ex.sets) {
      sets += 1
      if (s.done) doneSets += 1
      if (!onlyDone || s.done) volumeKg += s.weightKg * s.reps
    }
  }
  return { volumeKg: Math.round(volumeKg), sets, doneSets }
}

/**
 * Draft → POST /api/sessions body. Review mode commits every set; live mode
 * commits only checked-off sets. Set numbers renumber 1..n per exercise;
 * exerciseOrder mirrors the (possibly reordered) deck position.
 */
export function buildCommitPayload(draft: SessionDraft, endedAt: string): SaveWorkoutInput {
  const onlyDone = draft.mode === 'live'
  const sets: SaveWorkoutInput['sets'] = []
  draft.exercises.forEach((ex, order) => {
    const committable = onlyDone ? ex.sets.filter((s) => s.done) : ex.sets
    committable.forEach((s, i) => {
      sets.push({
        exerciseName: ex.name,
        setNumber: i + 1,
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe,
        exerciseOrder: order,
        muscleGroups: ex.status === 'NEW' ? ex.muscleGroups : undefined,
      })
    })
  })

  return {
    splitDay: draft.splitDay,
    startedAt: draft.startedAt,
    endedAt,
    sets,
    notes: draft.notes,
    clientSessionId: draft.clientSessionId,
    dayKey: draft.dayKey,
    coachReport: draft.coachReport,
    nextSessionFlag: draft.nextSessionFlag,
    reportMd: draft.coachInsight,
    metrics: draft.stats ? {
      durationMin: draft.stats.duration_min || null,
      avgBpm: draft.stats.avg_hr_bpm,
      caloriesBurned: draft.stats.calories_kcal || null,
    } : undefined,
  }
}
