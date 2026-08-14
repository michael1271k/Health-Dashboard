/**
 * SessionDraft — the editable, client-side state between input (pasted coach
 * JSON / Hevy text / program template) and commit (POST /api/sessions).
 * Autosaved to localStorage so a draft survives app restarts; discarded or
 * cleared on successful commit. Never persisted server-side.
 */
import type { SplitDay } from '@/lib/types/workout'
import type { SaveWorkoutInput } from '@/lib/sessions/schema'
import { sessionVolumeKg } from '@/lib/sessions/volume'
import { resolveSeededRpe } from '@/lib/training/rpeMemory'

export interface DraftSet {
  weightKg: number
  reps: number
  rpe?: number
  /**
   * RPE MEMORY — client-only, never sent to the server.
   *
   * `rpeSeed` is last session's rating for this slot, and the weight/reps it was
   * earned against. They exist so `cascadeSetEdit` can tell a rating you gave
   * from a rating you inherited: the moment the work gets harder in either axis,
   * the inherited one clears. See `resolveSeededRpe`.
   *
   * The seed is dropped the instant you tap a rating yourself — from then on the
   * value is yours and nothing may overwrite it.
   */
  rpeSeed?: number
  rpeSeedWeightKg?: number
  rpeSeedReps?: number
  /** Cleared by a load/rep increase — drives the "rate this" pip. Not persisted. */
  rpeStale?: boolean
  /** Hevy-style set modifier; absent = a normal working set. Warmups + drop sets
   *  count toward volume + set count but are never PR-eligible. Failure is tracked
   *  PER SIDE for unilateral sets. */
  setType?: 'warmup' | 'failure' | 'dropset'
  /**
   * Hevy-style completion flag. `false` = the row is NOT ticked green and is
   * EXCLUDED from the commit (template decks seed every set `false`, so nothing
   * is recorded until you check it off). `true` / absent = committed (a pasted
   * or edited session's sets are pre-completed). See {@link isSetCommitted}.
   */
  done?: boolean
  /**
   * Unilateral (per-side) tracking. A split set = two DraftSets sharing
   * `pairId`, one `side` 'L' one `'R'`, and the deck folds the two back into ONE
   * numbered set with ONE checkmark.
   *
   * THE SIDES ARE INDEPENDENT. There used to be a `linked` flag (default true)
   * that mirrored weight and reps between them on edit, with an "Unlinked"
   * toggle to opt out. It defeated the only reason to split a set: an arm that
   * is genuinely weaker cannot be recorded if typing its number silently
   * rewrites the other one, and the default meant asymmetry was lost unless you
   * knew to disable it first. Deleted — `setType` was already per side, and now
   * every field is.
   */
  side?: 'L' | 'R'
  pairId?: string
}

/** A set is committed (green, saved) unless it was explicitly ticked off
 *  (`done === false`). Only template-seeded live decks start `false`; pasted /
 *  edited / legacy sets have no flag and stay committed. */
export const isSetCommitted = (s: DraftSet): boolean => s.done !== false

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
  /**
   * Date of the session these numbers were seeded from. Absent = the program's
   * cold start, i.e. these are TARGETS, not history — the deck says so, so a
   * seeded load is never mistaken for something you actually lifted.
   */
  seededFrom?: string
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
  /** Borg CR10 session effort (1–10, 0.5 steps) — how hard the WHOLE session
   *  was. Distinct from per-set `DraftSet.rpe`, which is proximity to failure. */
  sessionRpe?: number
  stats?: {
    duration_min: number | null
    volume_kg: number | null
    sets_completed: number | null
    prs: number | null
    avg_hr_bpm: number | null
    calories_kcal: number | null
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

/** Σ weight×reps over the committable (strength) sets. Kept to 1 dp — quarter-kg
 *  microloads produce genuine half-kg volumes (e.g. 12102.5 kg) that must not be
 *  rounded away to an integer. */
export function draftTotals(draft: SessionDraft): { volumeKg: number; sets: number } {
  const committed: DraftSet[] = []
  for (const ex of draft.exercises) {
    if (ex.kind === 'cardio') continue
    for (const s of ex.sets) {
      // Only COMPLETED (green) sets count — an unchecked template set is not
      // performed. Warmups/drop sets DO count toward volume + set count.
      if (!isSetCommitted(s)) continue
      committed.push(s)
    }
  }
  // Unilateral L/R pairs are scored at the weaker side (see sessionVolumeKg), so
  // the live deck's running total matches what the commit will store.
  return { volumeKg: sessionVolumeKg(committed), sets: committed.length }
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
  // A rating you tapped yourself is yours. Releasing the seed here is what stops
  // a later weight edit from wiping a value you deliberately entered.
  if (patch.rpe !== undefined) next[setIdx] = releaseRpeSeed(next[setIdx])
  if (setIdx === 0) {
    for (let i = 1; i < next.length; i++) {
      const upd: Partial<DraftSet> = {}
      // A 0 → n weight edit is a change of KIND, not a load progression, and it
      // must not cascade. On a bodyweight movement every later set also reads 0,
      // so putting a belt on set 1 loaded sets 2 and 3 that had not been
      // performed yet — and `repsAxisEligible` requires weight 0, so the cascade
      // silently stripped the reps axis (the only axis those lifts have) from
      // every set it touched.
      if (patch.weightKg != null && prev.weightKg > 0 && next[i].weightKg === prev.weightKg) upd.weightKg = patch.weightKg
      if (patch.reps != null && next[i].reps === prev.reps) upd.reps = patch.reps
      if (Object.keys(upd).length) next[i] = { ...next[i], ...upd }
    }
  }
  // Re-resolve every inherited rating against the numbers as they now stand.
  // This runs over the WHOLE list, not just the edited row, because the cascade
  // above can raise the load on rows the user never touched — and an inherited
  // rating surviving a cascade is the same lie as one surviving a direct edit.
  return next.map(applyRpeMemory)
}

/** The user has taken ownership of this rating; memory stops governing it. */
function releaseRpeSeed(s: DraftSet): DraftSet {
  if (s.rpeSeed === undefined && !s.rpeStale) return s
  const next: DraftSet = { ...s }
  delete next.rpeSeed
  delete next.rpeSeedWeightKg
  delete next.rpeSeedReps
  delete next.rpeStale
  return next
}

/**
 * Reconcile one set's inherited rating with its current numbers.
 *
 * `weight === 0` is real data: a bodyweight set carries 0 on both sides of the
 * comparison, so the reps branch inside `resolveSeededRpe` is the only one that
 * can fire — which is what those lifts need. Do not guard this on `weightKg > 0`.
 */
function applyRpeMemory(s: DraftSet): DraftSet {
  if (s.rpeSeed === undefined || s.rpeSeedWeightKg === undefined || s.rpeSeedReps === undefined) return s
  const { rpe, stale } = resolveSeededRpe(
    { rpe: s.rpeSeed, weightKg: s.rpeSeedWeightKg, reps: s.rpeSeedReps },
    { weightKg: s.weightKg, reps: s.reps },
  )
  if (s.rpe === rpe && !!s.rpeStale === stale) return s
  const next: DraftSet = { ...s }
  if (rpe === undefined) delete next.rpe
  else next.rpe = rpe
  if (stale) next.rpeStale = true
  else delete next.rpeStale
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
  const cardio: NonNullable<SaveWorkoutInput['cardio']> = []
  let order = 0
  draft.exercises.forEach((ex, deckIdx) => {
    if (ex.kind === 'cardio') {
      // STRUCTURED, not a notes line. Flattening to prose was a one-way trip:
      // the edit deck rebuilds from the database, and `notes` is not a place a
      // distance and a duration can be read back out of. A block with neither
      // figure is dropped — an empty treadmill card is a card you did not use.
      if (ex.distanceKm != null || ex.durationSec != null) {
        cardio.push({
          name: ex.name,
          ...(ex.distanceKm != null ? { distanceKm: ex.distanceKm } : {}),
          ...(ex.durationSec != null ? { durationSec: ex.durationSec } : {}),
          ...(ex.note ? { note: ex.note } : {}),
          deckOrder: deckIdx,
        })
      }
      return
    }
    // ONLY completed (green) sets are recorded — an unchecked template set stays
    // in the deck but is never logged. Set numbers renumber over the kept sets.
    const committed = ex.sets.filter(isSetCommitted)
    if (!committed.length) return        // no green sets → the exercise didn't happen
    committed.forEach((s, i) => {
      sets.push({
        exerciseName: ex.name,
        setNumber: i + 1,
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe,
        setType: s.setType,
        exerciseOrder: order,
        side: s.side,
        pairId: s.pairId,
        muscleGroups: ex.status === 'NEW' ? ex.muscleGroups : undefined,
      })
    })
    order += 1
  })

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
    cardio: cardio.length ? cardio : undefined,
    notes: draft.notes.trim(),
    clientSessionId: draft.clientSessionId,
    replaceSessionId: draft.replaceSessionId,
    dayKey: draft.dayKey,
    coachReport: draft.coachReport,
    nextSessionFlag: draft.nextSessionFlag,
    sessionRpe: draft.sessionRpe,
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
      // RPE memory survives a reload, or reopening the app would silently stop
      // auto-clearing inherited ratings for the rest of the session. `rpeStale`
      // is derived, not stored — recomputed below from the numbers as they stand.
      if (s.rpeSeed != null && s.rpeSeedWeightKg != null && s.rpeSeedReps != null) {
        clean.rpeSeed = s.rpeSeed
        clean.rpeSeedWeightKg = s.rpeSeedWeightKg
        clean.rpeSeedReps = s.rpeSeedReps
      }
      if (s.setType === 'warmup' || s.setType === 'failure' || s.setType === 'dropset') clean.setType = s.setType
      // Preserve the Hevy completion flag across reloads (only an explicit false
      // is meaningful — everything else stays committed).
      if (s.done === false) clean.done = false
      // Preserve unilateral split state across reloads / v1→v2 migration.
      // `linked` is deliberately NOT carried across: a draft written before the
      // flag was deleted must not resurrect the mirroring it described.
      if (s.side === 'L' || s.side === 'R') { clean.side = s.side; clean.pairId = s.pairId }
      return applyRpeMemory(clean)
    }),
  }))
  return d
}
