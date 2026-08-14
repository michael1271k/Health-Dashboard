/**
 * Program-day template → pre-seeded Command Center draft.
 *
 * Seeding priority, highest first:
 *   0. The STORED ROUTINE TEMPLATE (`routine_templates`), written from the exact
 *      deck committed for this day — exercise ORDER included, which is the only
 *      source that carries it. See `routineTemplate.ts`.
 *   1. The exercise's LAST REAL SESSION in the same era — reproduced EXACTLY:
 *      the same NUMBER of sets, each set's weight, reps, and failure tag. If last
 *      time was 2 sets, the deck opens with 2 sets — never the template's 3.
 *   2. The explicit per-set seed (seedTemplates.ts), which also defines cardio
 *      and the deck's structure (used only as a cold-start when there's no history).
 *   3. The program's `wk1Kg` cold start (bodyweight/timed moves seed at 0 kg).
 *
 * This used to read `useExerciseMemory`, which returned ONE set — whichever row
 * was newest by `created_at`, warm-ups included — and fanned that single value
 * across every set slot, ignoring the training era entirely. A deck of three
 * identical made-up rows is exactly the "arbitrary data" problem: the numbers
 * looked plausible but were never what was actually lifted.
 */
import { daySplitEnum, type ProgramDay } from '@/lib/programs'
import type { SessionDraft, DraftExercise, DraftSet } from '@/lib/sessions/draft'
import { SEED_TEMPLATES, WARMUP_CARDIO } from '@/lib/sessions/seedTemplates'
import { templateToDraft, type RoutineTemplate } from '@/lib/sessions/routineTemplate'

export const HELIX_DAY_KEYS = ['cb_a', 'legs_a', 'arms', 'cb_b', 'legs_b'] as const

/** Last session per exercise NAME — the shape `useExerciseSetHistory` returns. */
export interface ExerciseHistoryEntry {
  date: string
  sets: Array<{
    weightKg: number
    reps: number
    setType?: 'warmup' | 'failure' | 'dropset'
    side?: 'L' | 'R'
    pairId?: string
  }>
}

/**
 * Reproduce the previous session EXACTLY: same number of sets, each with its
 * own weight, reps, and tag. No padding to a template count, no fabricated
 * extra sets — if last time was 2 sets, you get 2 sets.
 *
 * ALL THREE tags round-trip (warm-up, failure, drop set), not just failure. The
 * point of routine-scoped memory is to see the exact shape of the last time you
 * ran THIS day — including which set you warmed up on and where you failed — so
 * you can pace against it.
 *
 * ── UNILATERAL PAIRS SURVIVE, AND THIS IS THE GHOST-SET FIX ──────────────────
 * A unilateral set is TWO rows in `workout_sets` sharing a `pair_id`, and the
 * deck folds those two back into ONE numbered set (see `groupSets`). This
 * function used to copy weight, reps and tag and nothing else, so both rows came
 * back as ordinary independent sets and the pair silently became two.
 *
 * 2026-08-13, Single Arm Triceps Pushdown: Aug 6 logged 2 physical sets — set 1
 * solo, set 2 split L/R — which is 3 rows. Aug 13's deck opened with 3 separate
 * sets, and the third was committed. Every one of the 7 pairs in the database
 * would have done the same to its day's next session.
 *
 * `pairId` is REGENERATED rather than reused: the id only has to be unique
 * within the session being logged, and carrying last week's id into this week's
 * rows makes two sessions' pairs indistinguishable in any query that groups by
 * it alone.
 *
 * `linked` is set from the observed symmetry, matching how `useEditSession`
 * restores a committed pair — mirroring a pair that was logged asymmetrically
 * would overwrite the asymmetry on the first edit.
 */
function seedFromHistory(prev: ExerciseHistoryEntry, newPairId: () => string): DraftSet[] {
  const remap = new Map<string, string>()
  const sets: DraftSet[] = prev.sets.map((s) => {
    const set: DraftSet = { weightKg: s.weightKg, reps: s.reps }
    if (s.setType) set.setType = s.setType
    if (s.pairId && (s.side === 'L' || s.side === 'R')) {
      let pid = remap.get(s.pairId)
      if (!pid) { pid = newPairId(); remap.set(s.pairId, pid) }
      set.pairId = pid
      set.side = s.side
    }
    return set
  })

  // Symmetric pair ⇒ still linked; asymmetric ⇒ unlinked.
  const byPair = new Map<string, DraftSet[]>()
  for (const s of sets) if (s.pairId) {
    const g = byPair.get(s.pairId) ?? []; g.push(s); byPair.set(s.pairId, g)
  }
  for (const g of byPair.values()) {
    const linked = g.length === 2 && g[0].weightKg === g[1].weightKg && g[0].reps === g[1].reps
    for (const s of g) s.linked = linked
  }
  return sets
}

export function buildTemplateDraft(
  day: ProgramDay,
  date: string,
  history?: ReadonlyMap<string, ExerciseHistoryEntry>,
  template?: RoutineTemplate | null,
): SessionDraft {
  const dayKey = (HELIX_DAY_KEYS as readonly string[]).includes(day.key)
    ? (day.key as SessionDraft['dayKey']) : undefined

  // PRIORITY 1: the stored template — the exact deck you last committed for this
  // day, exercise ORDER included. It already reflects history (it was written
  // FROM a session), so consulting history again here would only re-derive a
  // worse version of the same answer and discard the ordering.
  if (template?.exercises.length) return templateToDraft(template, day, date, dayKey)

  let i = 0
  const localId = () => `tpl-${i++}-${Math.random().toString(36).slice(2, 8)}`
  let p = 0
  const newPairId = () => `pair_${Date.now().toString(36)}_${p++}_${Math.random().toString(36).slice(2, 6)}`
  const historyFor = (name: string): ExerciseHistoryEntry | undefined => {
    const h = history?.get(name)
    return h?.sets.length ? h : undefined
  }

  const seed = SEED_TEMPLATES[day.key]
  const exercises: DraftExercise[] = []

  // Every seeded deck opens with the standard Treadmill warm-up.
  exercises.push({
    localId: localId(), name: WARMUP_CARDIO.name, kind: 'cardio',
    distanceKm: WARMUP_CARDIO.distanceKm, durationSec: WARMUP_CARDIO.durationSec,
    note: WARMUP_CARDIO.note, sets: [],
  })

  // A template deck is a PLAN, not a log: every set opens UNCHECKED (done:false)
  // and only the ones you tick green are recorded on finish.
  const unchecked = (sets: DraftSet[]): DraftSet[] => sets.map((s) => ({ ...s, done: false }))

  if (seed) {
    for (const ex of seed.exercises) {
      const prev = historyFor(ex.name)
      const sets = unchecked(prev
        ? seedFromHistory(prev, newPairId)
        : ex.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })))
      exercises.push({
        localId: localId(), name: ex.name, muscleGroups: ex.muscles, sets,
        seededFrom: prev?.date,
      })
    }
  } else {
    // `day` is phase-resolved (activeProgram) — cut-dropped lifts are already gone.
    for (const ex of day.exercises) {
      const prev = historyFor(ex.name)
      const sets = unchecked(prev
        ? seedFromHistory(prev, newPairId)
        // COLD START ONLY — this branch runs when the exercise has NEVER been
        // logged on this day, so the program's set count is the plan, not an
        // invention. It is not the ghost-set source: `seedFromHistory` maps
        // 1:1 and never padded to this count. Every row opens `done: false`
        // and carries no `seededFrom`, so the deck marks it a target.
        // Bodyweight / timed moves (wk1Kg null) seed at 0 kg, not a phantom 20 kg.
        : Array.from({ length: ex.sets }, () => ({
          weightKg: ex.wk1Kg ?? 0,
          reps: parseInt(ex.reps, 10) || 10,
        })))
      exercises.push({
        localId: localId(), name: ex.name, muscleGroups: ex.muscles, sets,
        seededFrom: prev?.date,
      })
    }
  }

  return {
    // Stable idempotency key for THIS logging attempt: a retry of the same
    // template deck dedupes instead of duplicating; two separate sessions get
    // distinct ids (random suffix).
    clientSessionId: `tpl-${date}-${day.key}-${Math.random().toString(36).slice(2, 8)}`,
    dayKey,
    splitDay: daySplitEnum(day.key),
    date,
    title: day.sub ? `${day.label} · ${day.sub}` : day.label,
    notes: '',
    // The chosen date + the current wall-clock time (endedAt derives from this
    // + duration at commit, so a back-dated template still gets a sane window).
    startedAt: `${date}T${new Date().toISOString().slice(11)}`,
    exercises,
  }
}
