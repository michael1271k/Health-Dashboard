/**
 * SessionDraft — the editable, client-side state between input (pasted coach
 * JSON / Hevy text / program template) and commit (POST /api/sessions).
 * Autosaved to localStorage so a draft survives app restarts; discarded or
 * cleared on successful commit. Never persisted server-side.
 */
import type { SplitDay } from '@/lib/types/workout'
import type { SaveWorkoutInput } from '@/lib/sessions/schema'
import { sessionVolumeKg } from '@/lib/sessions/volume'
import { isSetQuality } from '@/lib/training/setTags'
import { resolveSeededRpe } from '@/lib/training/rpeMemory'
import { activeProgram } from '@/lib/programs'

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
  setType?: 'warmup' | 'failure' | 'dropset' | 'ghost'
  /**
   * How the set went, as opposed to what it was — see `SET_QUALITY`.
   *
   * A SECOND AXIS, not another set type: a warm-up can be sloppy and a drop set
   * is where form usually goes first, so the two facts cannot share a field.
   * Absent means "not reported", never "clean" — the question is only ever
   * asked, never assumed.
   */
  quality?: string
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
  /**
   * Treadmill gradient, percent. A 5 km/h walk at 0% and the same walk at 12%
   * are not the same session, and neither distance nor duration says which one
   * happened — this is the number that does.
   */
  inclinePct?: number
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
  /**
   * ── CARRIED, NEVER AUTHORED ────────────────────────────────────────────────
   * The Session Notes box was deleted: a free-text field asked for prose during
   * a workout, which is the one moment there is none to give, and nothing was
   * ever typed into it. Everything it might have carried has a structured home
   * — the per-set effort ladder, the per-exercise note, the report.
   *
   * The FIELD stays, and so does `workout_sessions.notes`, because 45 sessions
   * between 2026-04-21 and 2026-06-26 hold Notion-era prose that exists nowhere
   * else — the same corpus the 1,586 rebuilt sets were mined from. Editing a
   * session is a delete-and-re-insert (`replaceSessionId`), so a draft that
   * stopped carrying this would erase that history the first time one of those
   * days was opened and saved. It is loaded, held, and written straight back.
   *
   * New sessions write `''`, which `save.ts` stores as NULL.
   */
  notes: string
  startedAt: string             // ISO
  /**
   * ── THE DURATION HAS BEEN TYPED, SO STOP DERIVING IT ───────────────────────
   * The finish sheet fills Duration from the session clock. It must be able to
   * do that EVERY time the sheet opens and once more at commit — otherwise
   * opening the sheet at 42 minutes to look at it froze the number, and the
   * session that actually ran 70 was stored as 42 (2026-08-28).
   *
   * Overwriting on every open is only safe if a number you typed is
   * distinguishable from a number the clock wrote, which is what this flag is.
   * Set by `setStats`, never by the clock's own writer.
   */
  durationEdited?: boolean
  /** Banked milliseconds from completed pauses — see `SessionPause`. */
  pausedMs?: number
  /** ISO start of the pause in progress, null/absent while running. */
  pausedAt?: string | null
  exercises: DraftExercise[]
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
 * Can this L/R pair be drawn as ONE row?
 *
 * ── THE CASE ─────────────────────────────────────────────────────────────────
 * The overwhelmingly common unilateral set is the same load for the same reps on
 * both sides, differing only in what it FELT like — you do not load one dumbbell
 * to 32.5 kg and the other to 30. Drawing that as two full rows spends two
 * 36px lines, two badges and two three-column grids to say "32.5 × 10" twice and
 * one RPE differently, on the screen with the least room in the app.
 *
 * Compacted, the load is stated once and the two efforts sit side by side, which
 * is also the only comparison a matched pair supports.
 *
 * ── WHY EVERY CONDITION IS NEEDED ────────────────────────────────────────────
 * Both sides must be COMMITTED. An un-ticked pair is two rows you are still
 * typing into, and collapsing them would remove the fields. This is a display of
 * finished work, never an editor.
 *
 * `setType` must match. A warm-up left and a working right are not one set, and
 * folding them would hide a W badge that changes whether the row counts toward
 * a record at all.
 *
 * Weight AND reps must be exactly equal. Not "close": 32.5 vs 32.4 is a real
 * asymmetry and `pairAsymmetry` exists to surface exactly that. A row that
 * silently rounded two different loads into one would erase the imbalance the
 * card is there to show.
 */
export function isPairCompactable(l?: DraftSet, r?: DraftSet): boolean {
  if (!l || !r) return false
  if (!isSetCommitted(l) || !isSetCommitted(r)) return false
  if ((l.setType ?? 'normal') !== (r.setType ?? 'normal')) return false
  return l.weightKg === r.weightKg && l.reps === r.reps
}

/**
 * A pair's imbalance, by the work each side actually did.
 *
 * ── IT USED TO BE BLIND ON HALF THE MOVEMENTS IT EXISTS FOR ─────────────────
 * The measure was `weightKg × reps`, so on an UNLOADED unilateral movement —
 * a side plank, a single-leg glute bridge, a suitcase carry — both sides scored
 * zero, `hi` was zero, and the function returned null. A 65 s right side against
 * a 40 s left one, which is exactly the asymmetry this badge is for, reported
 * nothing at all.
 *
 * When there is no load the value column IS the work (seconds for a hold, reps
 * for bodyweight), so that is what gets compared. Same rule as
 * `unloaded-work-blind-spot`: a zero in the weight column is a movement without
 * load, never a movement without effort.
 */
export function pairAsymmetry(l?: DraftSet, r?: DraftSet): { pct: number; weak: 'L' | 'R' } | null {
  if (!l || !r) return null
  const work = (s: DraftSet) => (s.weightKg > 0 ? s.weightKg * s.reps : s.reps)
  const lv = work(l), rv = work(r)
  const hi = Math.max(lv, rv)
  if (hi <= 0) return null
  const pct = Math.round((1 - Math.min(lv, rv) / hi) * 100)
  if (pct < 3) return null // ignore trivial (<3%) imbalance / rounding
  return { pct, weak: lv < rv ? 'L' : 'R' }
}

/**
 * Cumulative session tonnage after each completed set — the Live Activity's
 * sparkline.
 *
 * ── WHY IT RECOMPUTES THE PREFIX INSTEAD OF ADDING AS IT GOES ────────────────
 * A running `total += weight * reps` would be a SECOND volume implementation,
 * and it would be wrong in the one case that matters here: a unilateral L/R pair
 * is scored at the weaker side and counts once (`sessionVolumeKg`), so adding
 * each row's own product double-counts every split set. Re-running the real
 * function over each prefix is O(n²) in the number of sets — which is at most a
 * few dozen — and cannot drift from the total printed beside it.
 *
 * ── AND WHY IT IS SAMPLED, NOT TRUNCATED ─────────────────────────────────────
 * ActivityKit budgets updates by payload as well as by frequency. Capped at
 * `cap` points, evenly spaced across the WHOLE session: keeping only the last
 * twelve would redraw the shape as the session grew, so the chart would appear
 * to flatten exactly as the work piled up.
 *
 * Fewer than two points returns empty. One dot on an axis reads as a rendering
 * failure, and a single set is not a trend.
 */
export function draftVolumeSeries(draft: SessionDraft, cap = 12): number[] {
  const committed: DraftSet[] = []
  for (const ex of draft.exercises) {
    if (ex.kind === 'cardio') continue
    for (const s of ex.sets) if (isSetCommitted(s)) committed.push(s)
  }
  if (committed.length < 2) return []

  const cumulative = committed.map((_, i) =>
    Math.round(sessionVolumeKg(committed.slice(0, i + 1))),
  )
  if (cumulative.length <= cap) return cumulative

  // Evenly spaced, both endpoints kept: the last point is the current total, so
  // the chart's right edge and the number beside it always agree.
  const out: number[] = []
  for (let i = 0; i < cap; i += 1) {
    out.push(cumulative[Math.round((i * (cumulative.length - 1)) / (cap - 1))])
  }
  return out
}

/**
 * The rating that MEANS failure, and the single definition of it.
 *
 * It lived as a private const in `SetEditorRow` while the write path in this
 * file also needed it — which is how the tag and the rating came to be synced
 * by hand at each call site. One number, one home.
 */
export const FAILURE_RPE = 10

/**
 * Cascade for a set edit: apply `patch` to `setIdx`, then carry the new
 * weight/reps to the NEXT set — and only the next one. setType (W/F) is never
 * cascaded.
 *
 * ── ONE STEP, NOT THE WHOLE TAIL (2026-08-19) ────────────────────────────────
 * This used to propagate from set 1 to EVERY later set that still matched. On
 * paper that is convenient; in a session it overreaches. Correcting set 1 from
 * 10 to 11 reps rewrote sets 2 and 3 as well, so a set you had not performed
 * yet arrived pre-filled with a claim about it — and on the double-progression
 * surfaces those pre-filled rows are indistinguishable from work, which is how
 * three sets could read at the ceiling after one of them had been touched.
 *
 * One step is the honest amount. Sets 1 and 2 share a load by construction (you
 * pick a weight and repeat it), so carrying the edit forward once is a
 * correction of the same decision; carrying it to set 3 is a prediction. The
 * guard is unchanged: only a set that still holds the edited set's PREVIOUS
 * value follows, so anything you tuned by hand is left alone.
 */
/**
 * Apply a patch to ONE set, with the two rules that hold whatever else is
 * happening around it.
 *
 * ── WHY THIS IS NOT INLINE IN `cascadeSetEdit` ───────────────────────────────
 * Because `cascadeSetEdit` is not the only write path. A unilateral (L/R) set
 * deliberately bypasses the cascade — `useSessionDraft.updateSet` edits one side
 * alone, since cascading to the other side is mirroring under a different name
 * — and it does so with a bare spread. Rules that live inside the cascade are
 * therefore rules a split set never gets, silently: the F tag would light on a
 * bilateral set taken to failure and not on a per-side one, while `DraftSet`
 * documents failure as tracked PER SIDE, and `save.ts` would persist that side
 * as `set_type: 'normal'`. Every path that edits a set calls this.
 */
export function applySetPatch(set: DraftSet, patch: Partial<DraftSet>): DraftSet {
  let next: DraftSet = { ...set, ...patch }

  /**
   * ── ANY TOUCH OF THE RATING IS THE USER TAKING IT OVER ─────────────────────
   * This tested `patch.rpe !== undefined`, which made CLEARING a rating — the
   * one gesture that is unambiguously "I am deciding this myself" — the single
   * case that did not take ownership. The seed stayed, `applyRpeMemory` ran
   * afterwards and put the remembered value straight back, so tapping the lit
   * stop on a seeded set appeared to do nothing at all.
   *
   * That is also the whole of the vanishing-Failure bug. A set seeded from a
   * session you took to failure arrives holding rpe 10 with its seed intact.
   * Tapping the lit stop looked like "rate this Failure" and was a no-op, so
   * memory stayed in charge — and the next rep you added made the work harder
   * than the seed was earned against, which cleared the rating. The readout
   * lost "10 · FAILURE" and the ± steppers went with it, because they render
   * only over a rating that exists.
   *
   * `'rpe' in patch` is the correct test: present-and-undefined is a decision,
   * absent is not.
   */
  if ('rpe' in patch) next = releaseRpeSeed(next)

  /**
   * ── FAILURE IS DERIVED FROM THE RATING, NOT KEPT BESIDE IT ─────────────────
   * The top of the ladder and the `F` tag are one claim. They used to be two
   * pieces of state kept in step by side effects at the component's two call
   * sites, and the ± steppers were not one of those sites — so nudging 9.5 up
   * to 10 left a set reading "10 · FAILURE" with no tag, while tapping the same
   * value on the pip tagged it. Two ways to say the same thing, disagreeing.
   *
   * Narrow on purpose: only a patch that TOUCHES the rating may move the tag,
   * an explicit `setType` in the same patch wins, and `warmup`/`dropset` are
   * never overwritten — those are separate declarations about the set, not
   * statements about effort.
   */
  /**
   * ── A TICKED SET IS A REPORT, NOT A PROPOSAL ───────────────────────────────
   * The tick is the single assertion this app makes about what happened on the
   * gym floor. Until now it changed nothing about the rating's STANDING: a set
   * you had ticked green at "10 · Failure" was still holding last session's
   * seed, so the next rep you added to it re-ran `applyRpeMemory`, found the
   * work harder than the seed was earned against, and withdrew the rating from
   * a set you had already declared finished.
   *
   * Committing the set therefore takes ownership of the rating on it, exactly
   * as tapping a stop does. From then on the number is yours and memory has no
   * further say.
   *
   * Guarded on there BEING a rating. A set ticked while its proposal is
   * unconfirmed (`rpeStale`) must keep both the seed and the staleness — the
   * ladder still shows the remembered value as a ghost you can confirm in one
   * tap, and the set still commits unrated until you do. Releasing the seed
   * there would destroy the only copy of the number and silently answer a
   * question the user has not answered.
   */
  if (patch.done === true && next.rpe != null) next = releaseRpeSeed(next)

  if ('rpe' in patch && !('setType' in patch)) {
    if (next.rpe === FAILURE_RPE && next.setType === undefined) next = { ...next, setType: 'failure' }
    else if (next.rpe !== FAILURE_RPE && next.setType === 'failure') {
      next = { ...next }
      delete next.setType
    }
  }

  return next
}

export function cascadeSetEdit(sets: DraftSet[], setIdx: number, patch: Partial<DraftSet>): DraftSet[] {
  const prev = sets[setIdx]
  if (!prev) return sets
  const next = sets.map((s, i) => (i === setIdx ? applySetPatch(s, patch) : s))
  const heir = setIdx + 1
  if (heir < next.length) {
    const upd: Partial<DraftSet> = {}
    // A 0 → n weight edit is a change of KIND, not a load progression, and it
    // must not cascade. On a bodyweight movement every later set also reads 0,
    // so putting a belt on set 1 loaded a set that had not been performed yet —
    // and `repsAxisEligible` requires weight 0, so the cascade silently
    // stripped the reps axis (the only axis those lifts have) from the row it
    // touched.
    if (patch.weightKg != null && prev.weightKg > 0 && next[heir].weightKg === prev.weightKg) upd.weightKg = patch.weightKg
    if (patch.reps != null && next[heir].reps === prev.reps) upd.reps = patch.reps
    if (Object.keys(upd).length) next[heir] = { ...next[heir], ...upd }
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

/**
 * The workout's NAME, without its strapline.
 *
 * ── WHY A TITLE NEEDS CLEANING ───────────────────────────────────────────────
 * `buildTemplateDraft` composes the title as `${day.label} · ${day.sub}` —
 * "Legs & Core B · Posterior Focus". That is the right string for a document
 * heading and the wrong one for a header: at 360px it truncates to "Legs & Core
 * B · Posterio…", so the part that identifies the session is intact and the part
 * that is cut is the part nobody needed. In the collapsed bar it was worse — one
 * line, ellipsized mid-strapline, on the element whose whole job is to say what
 * you are doing.
 *
 * The strapline is not lost; it is simply not the title. It stays in the
 * program, in Settings, and on the day surface, where there is room for it.
 *
 * Three sources, most specific first: the program day's own label (the
 * authoritative name), then the stored title up to its first separator, then the
 * split. Never returns empty.
 */
export function cleanSessionTitle(draft: Pick<SessionDraft, 'title' | 'dayKey' | 'splitDay'>): string {
  if (draft.dayKey) {
    const label = activeProgram().days.find((d) => d.key === draft.dayKey)?.label
    if (label) return label
  }
  const head = draft.title?.split('·')[0]?.trim()
  return head || draft.splitDay || 'Workout'
}

/** "Treadmill: 0.4 km · 5 min" — the human-readable cardio summary. */
export function cardioSummary(ex: DraftExercise): string {
  const parts = [
    ex.distanceKm != null ? `${ex.distanceKm} km` : null,
    ex.durationSec != null ? fmtCardioDuration(ex.durationSec) : null,
    ex.inclinePct ? `${ex.inclinePct}% incline` : null,
  ].filter(Boolean)
  return parts.length ? `${ex.name}: ${parts.join(' · ')}` : ex.name
}

/**
 * Draft → POST /api/sessions body. Set numbers renumber 1..n per exercise;
 * exerciseOrder mirrors the (possibly reordered) deck position. Cardio
 * exercises are excluded from `sets` HERE, at the single choke point — a
 * 0 kg × 1 junk set would corrupt volume/PR math and spawn phantom catalog
 * rows via resolveExercises — and are carried as a formatted notes line
 * instead.
 *
 * `coachReport` used to ride along here too — the raw Hevy/coach-JSON parse,
 * archived to `workout_sessions.coach_report` so a bad import could be replayed
 * from its source text. The paste importer is gone and it had the only two
 * writers, so the field would now archive `undefined` on every commit. The
 * column is left in place (nullable, and never populated on this account) —
 * nothing reads it, and dropping it is a separate, deliberate act.
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
          ...(ex.inclinePct != null ? { inclinePct: ex.inclinePct } : {}),
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
      // ── NO `restSec` IS DERIVED HERE ANY MORE (2026-08-19) ──
      // Each set used to carry a client-only `doneAt` stamp, and this loop
      // subtracted consecutive stamps into `workout_sets.rest_sec`. Measuring
      // rest turned out to answer a question nobody was asking: what a lifter
      // needs between sets is the plan's TARGET, which the program now carries
      // per exercise (`ProgramExercise.restSec`, resolved by
      // `lib/training/restTargets.ts`). The column and every reader of it stay
      // — the rows written while the stopwatch existed are real measurements —
      // but new sessions leave it null, which is what "not recorded" means
      // everywhere else in this schema.
      sets.push({
        exerciseName: ex.name,
        setNumber: i + 1,
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe,
        setType: s.setType,
        // Only a value from the closed vocabulary survives the trip. A draft is
        // localStorage — it can hold anything a stale build once wrote — and the
        // DB CHECK would reject an unknown value by deleting the session.
        quality: isSetQuality(s.quality) ? s.quality : null,
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
      if (s.setType === 'warmup' || s.setType === 'failure' || s.setType === 'dropset' || s.setType === 'ghost') clean.setType = s.setType
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
