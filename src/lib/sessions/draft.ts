/**
 * SessionDraft — the editable, client-side state between input (pasted coach
 * JSON / Hevy text / program template) and commit (POST /api/sessions).
 * Autosaved to localStorage so a draft survives app restarts; discarded or
 * cleared on successful commit. Never persisted server-side.
 */
import type { SplitDay } from '@/lib/types/workout'
import type { SaveWorkoutInput } from '@/lib/sessions/schema'

export interface DraftSet {
  weightKg: number
  reps: number
  rpe?: number
  /** Hevy-style set modifier; absent = a normal working set. Warmups count
   *  toward volume + set count but are never PR-eligible. */
  setType?: 'warmup' | 'failure'
}

export interface DraftExercise {
  /** Stable client-side key for dnd-kit sortables. */
  localId: string
  /** Canonical display name (alias-mapped). */
  name: string
  /** Original incoming name, pre-alias — audit only. */
  rawName?: string
  /** 'cardio' renders a distance/duration card and is EXCLUDED from committed sets. */
  kind?: 'strength' | 'cardio'
  distanceKm?: number
  durationSec?: number
  status?: 'PR' | 'PROGRESS' | 'HOLD' | 'REGRESS' | 'NEW'
  note?: string
  targetNext?: string
  supersetGroup?: string
  muscleGroups?: string[]
  sets: DraftSet[]
}

export interface SessionDraft {
  /** Idempotency key: coach session.id, or a synthetic id for Hevy pastes. */
  clientSessionId?: string
  /** EDIT flow: the committed session this draft replaces (delete + re-insert). */
  replaceSessionId?: string
  dayKey?: 'cb_a' | 'legs_a' | 'arms' | 'cb_b' | 'legs_b'
  splitDay: SplitDay
  date: string                  // YYYY-MM-DD (startedAt must stay in sync — use the store's setDate)
  title?: string
  week?: number
  phase?: string
  coachInsight?: string
  nextSessionFlag?: string
  stats?: {
    duration_min: number | null
    volume_kg: number | null
    sets_completed: number | null
    prs: number | null
    avg_hr_bpm: number | null
    calories_kcal: number | null
    volume_delta_pct_vs_prior: number | null
  }
  notes: string
  startedAt: string             // ISO
  exercises: DraftExercise[]
  /** Source archive (validated coach JSON / parsed Hevy workout), stored as JSONB on commit. */
  coachReport?: unknown
}

export const DRAFT_STORAGE_KEY = 'helix_session_draft:v2'
/** Pre-Command-Center-v2 drafts carried a live/review mode + per-set done flags. */
const LEGACY_DRAFT_KEY = 'helix_session_draft:v1'

/** Σ weight×reps over the committable (strength) sets. */
export function draftTotals(draft: SessionDraft): { volumeKg: number; sets: number } {
  let volumeKg = 0; let sets = 0
  for (const ex of draft.exercises) {
    if (ex.kind === 'cardio') continue
    for (const s of ex.sets) {
      // Warmups DO count toward volume + set count (they still can't be a PR).
      sets += 1
      volumeKg += s.weightKg * s.reps
    }
  }
  return { volumeKg: Math.round(volumeKg), sets }
}

/**
 * Hevy-style cascade for a set edit: apply `patch` to `setIdx`, and when the
 * first set changed, propagate its new weight/reps to every later set that
 * still shared the first set's *previous* value (manually-tuned sets are left
 * alone). setType (W/F) is never cascaded.
 */
export function cascadeSetEdit(sets: DraftSet[], setIdx: number, patch: Partial<DraftSet>): DraftSet[] {
  const prev = sets[setIdx]
  if (!prev) return sets
  const next = sets.map((s, i) => (i === setIdx ? { ...s, ...patch } : s))
  if (setIdx === 0) {
    for (let i = 1; i < next.length; i++) {
      const upd: Partial<DraftSet> = {}
      if (patch.weightKg != null && next[i].weightKg === prev.weightKg) upd.weightKg = patch.weightKg
      if (patch.reps != null && next[i].reps === prev.reps) upd.reps = patch.reps
      if (Object.keys(upd).length) next[i] = { ...next[i], ...upd }
    }
  }
  return next
}

const fmtCardioDuration = (sec: number): string => {
  const m = Math.floor(sec / 60); const s = sec % 60
  return s ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`
}

/** "Treadmill: 0.4 km · 5 min" — the human-readable cardio summary. */
export function cardioSummary(ex: DraftExercise): string {
  const parts = [
    ex.distanceKm != null ? `${ex.distanceKm} km` : null,
    ex.durationSec != null ? fmtCardioDuration(ex.durationSec) : null,
  ].filter(Boolean)
  return parts.length ? `${ex.name}: ${parts.join(' · ')}` : ex.name
}

/**
 * Draft → POST /api/sessions body. Set numbers renumber 1..n per exercise;
 * exerciseOrder mirrors the (possibly reordered) deck position. Cardio
 * exercises are excluded from `sets` HERE, at the single choke point — a
 * 0 kg × 1 junk set would corrupt volume/PR math and spawn phantom catalog
 * rows via resolveExercises — and are carried as a formatted notes line
 * instead (the raw parse survives in coach_report).
 */
export function buildCommitPayload(draft: SessionDraft): SaveWorkoutInput {
  const sets: SaveWorkoutInput['sets'] = []
  const cardioLines: string[] = []
  let order = 0
  for (const ex of draft.exercises) {
    if (ex.kind === 'cardio') {
      cardioLines.push(`Cardio — ${cardioSummary(ex)}`)
      continue
    }
    ex.sets.forEach((s, i) => {
      sets.push({
        exerciseName: ex.name,
        setNumber: i + 1,
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe,
        setType: s.setType,
        exerciseOrder: order,
        muscleGroups: ex.status === 'NEW' ? ex.muscleGroups : undefined,
      })
    })
    order += 1
  }

  // endedAt derives from startedAt + duration. Passing wall-clock "now" here
  // would blow duration_min up into DAYS whenever a session is logged after
  // the fact (the date picker exists precisely for that).
  const durationMin = draft.stats?.duration_min ?? 60
  const endedAt = new Date(new Date(draft.startedAt).getTime() + durationMin * 60_000).toISOString()

  return {
    splitDay: draft.splitDay,
    startedAt: draft.startedAt,
    endedAt,
    sets,
    notes: [draft.notes.trim(), ...cardioLines].filter(Boolean).join('\n'),
    clientSessionId: draft.clientSessionId,
    replaceSessionId: draft.replaceSessionId,
    dayKey: draft.dayKey,
    coachReport: draft.coachReport,
    nextSessionFlag: draft.nextSessionFlag,
    reportMd: draft.coachInsight,
    metrics: draft.stats ? {
      durationMin: draft.stats.duration_min,
      avgBpm: draft.stats.avg_hr_bpm,
      caloriesBurned: draft.stats.calories_kcal,
    } : undefined,
  }
}

/**
 * Read the persisted draft without owning it (resume banners, route guards).
 * Transparently migrates a v1 draft: `mode` and per-set `done` flags are
 * dropped — a migrated live draft therefore commits ALL of its sets.
 */
export function peekSessionDraft(): SessionDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (raw) return sanitizeDraft(JSON.parse(raw))
    const legacy = localStorage.getItem(LEGACY_DRAFT_KEY)
    if (!legacy) return null
    const migrated = sanitizeDraft(JSON.parse(legacy))
    if (migrated) localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(migrated))
    localStorage.removeItem(LEGACY_DRAFT_KEY)
    return migrated
  } catch {
    return null
  }
}

/** Minimal shape check + strips legacy fields (mode, per-set done). */
function sanitizeDraft(value: unknown): SessionDraft | null {
  if (!value || typeof value !== 'object') return null
  const d = value as SessionDraft & { mode?: unknown }
  if (typeof d.date !== 'string' || typeof d.splitDay !== 'string' || !Array.isArray(d.exercises)) return null
  delete d.mode
  d.exercises = d.exercises.map((ex) => ({
    ...ex,
    sets: (ex.sets ?? []).map((s) => {
      const clean: DraftSet = { weightKg: s.weightKg, reps: s.reps }
      if (s.rpe != null) clean.rpe = s.rpe
      if (s.setType === 'warmup' || s.setType === 'failure') clean.setType = s.setType
      return clean
    }),
  }))
  return d
}
