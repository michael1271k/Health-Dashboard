'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeftRight, Check, ChevronDown, Footprints, GripVertical, History, NotebookPen, Plus, Target, Timer, Weight, X } from 'lucide-react'
import { tapLight } from '@/lib/native/haptics'
import { SetEditorRow } from './SetEditorRow'
import { useTrackRpe } from '@/lib/hooks/useTrackRpe'
import { cardioSummary, isSetCommitted, type DraftExercise, type DraftSet } from '@/lib/sessions/draft'
import { isTimedExercise } from '@/lib/exercises/timed'
import { isBodyweightExercise, isLoadableBodyweightExercise } from '@/lib/exercises/bodyweight'
import { isUnilateralExercise } from '@/lib/exercises/unilateral'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { repWindowFor, holdTargetFor, ladderVerdict, levelUpCue } from '@/lib/training/ceilings'
import { restTargetFor, hasRestOverride, formatRestTarget } from '@/lib/training/restTargets'
import { useRestTargets } from '@/lib/hooks/useRestTargets'
import { RestTargetSheet } from './RestTargetSheet'
import { setGridFor, setValueLabel, SET_BADGE_W, SET_FRAME_GAP, SET_HEADER_TEXT, SET_TAIL_W, type SetGridMode } from './setGrid'
import { workingSets, type ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'
import type { PrAxis } from '@/lib/training/prEngine'
import type { ReportTargets } from '@/lib/reports/fmtV2'
import { targetForExercise, formatTarget } from '@/lib/reports/targetMatch'
import { livePrKey } from '@/lib/sessions/livePrs'
import { SAPPHIRE, STEEL, MUTED, HAIRLINE } from '@/lib/theme/palette'
import { exerciseColor } from '@/lib/theme/muscleHue'

const STATUS_META: Record<NonNullable<DraftExercise['status']>, { label: string; color: string }> = {
  PR:       { label: 'PR',       color: '#D4AF37' },  // gold
  PROGRESS: { label: 'PROG ▲',   color: '#3E9E7A' },
  HOLD:     { label: 'HOLD',     color: '#79808C' },
  REGRESS:  { label: 'REGR ▼',   color: '#C4514E' },
  NEW:      { label: 'NEW',      color: '#8E9AAC' },
}

export const CARDIO_VIOLET = '#B4522A'
const READY_GOLD = '#D4AF37'
const AMBER = '#E0A03C'   // one-more-session: earned, not yet due

/**
 * One numeric field of a cardio block.
 *
 * Keeps a local text buffer while focused, for the same reason `NumberField`
 * does in `SetEditorRow`: committing on every keystroke means typing "0.4"
 * commits 0 on the first character, and a value-derived input fights the user
 * mid-word. An empty field commits `null` — clearing a distance is a real edit,
 * not a zero.
 */
function CardioField({ label, unit, step, value, onCommit }: {
  label: string
  unit: string
  step: number
  value: number | null | undefined
  onCommit: (v: number | null) => void
}) {
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? (value != null ? String(value) : '')
  return (
    <label className="flex-1 min-w-0">
      <span className="block text-[9px] font-bold uppercase tracking-widest text-muted mb-1">{label}</span>
      <span className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2 min-h-[38px]">
        <input
          type="number" inputMode="decimal" step={step} min={0}
          value={shown}
          onChange={(e) => {
            setText(e.target.value)
            const t = e.target.value.trim()
            if (t === '') { onCommit(null); return }
            const n = Number(t)
            if (Number.isFinite(n) && n >= 0) onCommit(n)
          }}
          onBlur={() => setText(null)}
          className="helix-num w-full bg-transparent field-compact font-bold text-text tabular-nums outline-none min-w-0"
          aria-label={`${label} in ${unit}`}
        />
        <span className="text-[10px] text-muted shrink-0">{unit}</span>
      </span>
    </label>
  )
}

/** Smart-Coach cue for this lift. `ready` = earned the bump (two clean sessions
 *  at the top load); `one-more` = cleared once and needs it repeated. */
export interface ReadyCue {
  suggestKg: number | null
  currentKg: number | null
  timed: boolean
  state: 'ready' | 'one-more'
}

// A unilateral L/R pair reads as ONE numbered set that expands into Left/Right
// sub-rows — NOT two sibling rows. groupSets folds the flat draft list into that
// display shape while preserving each side's original index (for edit/remove).
type SetGroup =
  | { kind: 'single'; idx: number; set: DraftSet; num: number }
  | { kind: 'pair'; pairId: string; num: number; left?: { idx: number; set: DraftSet }; right?: { idx: number; set: DraftSet } }

function groupSets(sets: DraftSet[]): SetGroup[] {
  const groups: SetGroup[] = []
  const byPair = new Map<string, Extract<SetGroup, { kind: 'pair' }>>()
  let num = 0
  sets.forEach((set, idx) => {
    if (set.pairId) {
      let g = byPair.get(set.pairId)
      if (!g) { num += 1; g = { kind: 'pair', pairId: set.pairId, num }; byPair.set(set.pairId, g); groups.push(g) }
      if (set.side === 'R') g.right = { idx, set }
      else g.left = { idx, set }
    } else {
      num += 1
      groups.push({ kind: 'single', idx, set, num })
    }
  })
  return groups
}

/** Weaker-side imbalance for a pair, by per-side volume (weight×reps). We count
 *  the FULL real work of both sides (sum) — this badge just surfaces the gap. */
function pairAsymmetry(l?: DraftSet, r?: DraftSet): { pct: number; weak: 'L' | 'R' } | null {
  if (!l || !r) return null
  const lv = l.weightKg * l.reps, rv = r.weightKg * r.reps
  const hi = Math.max(lv, rv)
  if (hi <= 0) return null
  const pct = Math.round((1 - Math.min(lv, rv) / hi) * 100)
  if (pct < 3) return null // ignore trivial (<3%) imbalance / rounding
  return { pct, weak: lv < rv ? 'L' : 'R' }
}

// Show the real load: 3.75 must never display as "3.8" (quarter-step plates).
const fmtKg = (w: number) => (w % 1 === 0 ? w.toFixed(0) : (w * 10) % 1 === 0 ? w.toFixed(1) : w.toFixed(2))
/**
 * One exercise widget of the deck: dnd-kit sortable (drag from the grip only),
 * coach status chip, the era-scoped "PREV" reference chip beside today's
 * inputs, an editable note, and the per-set tuner rows. Cardio entries render
 * as a slim violet card (distance/duration, no set rows — excluded at commit).
 *
 * ── MEMOIZED, AND WHY THE memo ALONE DOES NOT SAVE MUCH ──────────────────────
 * A keystroke reconciled all six cards and all twenty-four rows: 2.664 ms per
 * keystroke on a 6×4 deck, 16% of a frame in jsdom before a browser adds style,
 * layout or paint. The PR engine everyone suspected was 0.0126 ms of that —
 * 0.5%, and flat whatever the history size.
 *
 * Three things had to change before `memo` could hold at all: the ten inline
 * closures the deck list bound per card, the fresh `livePrs` Map each render,
 * and `SortableContext items={…}` being a new array every time. All fixed.
 *
 * `memo` still does not stop this component re-executing, and cannot: it calls
 * `useSortable`, and a context change re-renders every consumer regardless of
 * props. Probed directly — 60 row renders across 10 keystrokes with memo in
 * place, versus 10 without the hook. What the memo boundary does buy is that
 * the SUBTREE bails: `SetEditorRow` subscribes to nothing, so the 24 rows and
 * their 96 effects drop out.
 *
 * Measured end to end: 2.664 ms → 2.019 ms, 24% off. The remaining cost is six
 * card bodies re-executing because of that context subscription. Removing it
 * means lifting `useSortable` into a shell component and moving the grip out of
 * this header — a real refactor, deliberately not done here.
 */
export const ExerciseCard = memo(function ExerciseCard({ exercise, history, globalHistory, livePrs, dayKey, ready, reportTargets, reducedMotion = false, dragCollapsed = false, onUpdateSet, onSplitSet, onMergeSet, onAddSet, onRemoveSet, onToggleDone, onRemoveExercise, onSetNote, onPrTap, onUpdateCardio }: {
  exercise: DraftExercise
  history: ExerciseHistory | null
  /**
   * The last time this movement was done in ANY routine — what the PREVIOUS
   * column on each set row shows. Separate from `history`, which is
   * routine-scoped because everything that PACES you must be.
   */
  globalHistory?: ExerciseHistory | null
  /** Live records keyed `${localId}|${setIdx}` — computed once for the whole
   *  deck so a set is judged against the ones ticked before it. */
  livePrs?: Map<string, PrAxis[]>
  /** The routine being logged. Rep windows are per DAY — Calf Press on Legs B
   *  has a different ceiling than on Legs A — so this must be threaded through
   *  or the card silently falls back to the strictest window in the program. */
  dayKey?: string | null
  /** Forward-carried progression cue for this lift (cleared its ceiling twice). */
  ready?: ReadyCue | null
  /**
   * What the last pasted report prescribed, for the whole session. Passed as the
   * WHOLE object rather than this card's row so the deck resolves it once: the
   * match runs through the catalog alias table and a per-card hook would also
   * add a query subscription to every card, which is what memo here exists to
   * avoid.
   */
  reportTargets?: ReportTargets | null
  /**
   * `prefers-reduced-motion`, resolved once by the deck rather than per card.
   *
   * This prop USED to be `collapsed`, forcing every card to its header row the
   * instant a drag lifted. The intent was clarity — see the whole session at
   * once — and the effect was the opposite: the list's height and every
   * sibling's position changed under a finger that had already committed to a
   * gesture, so the card you grabbed jumped and the drop targets moved. That is
   * most of what made reordering feel broken.
   */
  reducedMotion?: boolean
  /**
   * ── AND YET IT COLLAPSES AGAIN, DELIBERATELY (2026-08-23) ──────────────────
   * The note above is the history of a collapse that was WRONG, and it is worth
   * keeping because this one is the same shape and is not. Three things changed:
   *
   *   1. It is `dragCollapsed`, not `collapsed` — only the OTHER cards fold. The
   *      one under your finger rides in the `DragOverlay` portal at full size,
   *      so the thing you grabbed never changes under you.
   *   2. `SortableContext` re-measures continuously while a drag is live
   *      (`MeasuringStrategy.Always` in `ExerciseDeckList`). The original
   *      version measured once, at lift, so when the list shrank the drop
   *      targets stayed where the tall cards used to be — which IS the
   *      "everything moves and nothing lands where you aimed" bug. Measuring
   *      every frame is what makes the fold safe.
   *   3. The fold is CSS-only (`showBody` goes false), so no state is lost:
   *      an open card, an in-progress note, an active set row all come back
   *      exactly as they were when the drag ends.
   *
   * What it buys: a ten-exercise deck is roughly 3.5 screens tall, so reordering
   * the first lift to the end meant an autoscroll drag of several seconds with
   * no view of the destination. Folded, the whole session is one screen and the
   * drop is a single short movement.
   *
   * Folded cards show the NAME and the programmed floor–ceiling only. Everything
   * else on that header — status, the progression cue, the report target, the
   * live glance, the rest chip — is about the set in front of you, and while you
   * are dragging there is no set in front of you.
   */
  dragCollapsed?: boolean
  /*
   * ── EVERY HANDLER TAKES `localId` ────────────────────────────────────────
   * These used to be pre-bound: the card received `(setIdx, patch)` and the
   * deck list supplied `onUpdateSet={(i, p) => onUpdateSet(ex.localId, i, p)}`.
   * Ten arrow functions per card, rebuilt on every parent render, which meant
   * all ten props changed identity on every keystroke and `memo` could never
   * hit — one character typed reconciled all six cards and all twenty-four
   * rows when only one card's data had changed.
   *
   * Taking `localId` here lets the deck list pass the store's own `useCallback`
   * handlers straight through, unwrapped and stable for the session's lifetime.
   * The card already knows its own id; binding it was never the parent's job.
   */
  onUpdateSet: (localId: string, setIdx: number, patch: Partial<DraftSet>) => void
  onSplitSet: (localId: string, setIdx: number) => void
  onMergeSet: (localId: string, pairId: string) => void
  onAddSet: (localId: string) => void
  onRemoveSet: (localId: string, setIdx: number) => void
  onToggleDone: (localId: string, setIdx: number) => void
  onRemoveExercise: (localId: string) => void
  onSetNote: (localId: string, note: string) => void
  /** Tapping a set's trophy strip — opens the record sheet for that set. */
  onPrTap?: (localId: string, setIdx: number) => void
  /** Cardio blocks only: edit distance / duration / incline. */
  onUpdateCardio?: (localId: string, patch: { distanceKm?: number; durationSec?: number; inclinePct?: number }) => void
}) {
  const localId = exercise.localId

  const [open, setOpen] = useState(true)
  // The drag fold wins over the card's own state, and does not touch it — see
  // `dragCollapsed`. `open` is untouched, so the card comes back as it was.
  const showBody = open && !dragCollapsed
  const [activeSet, setActiveSet] = useState<number | null>(null)
  const [editingNote, setEditingNote] = useState(false)
  const [restSheet, setRestSheet] = useState(false)

  /*
   * Bound ONCE per card, not once per row per render. These are what let
   * `memo(SetEditorRow)` hold: previously each of the twenty-four rows received
   * five fresh arrow closures on every card render, so every row re-rendered
   * on every keystroke anywhere in the deck. The row supplies its own index.
   */
  // Effort is per SET now, so there is no longer a single row to nominate. The
  // flag rides down to each `SetEditorRow`, which renders the ladder only for
  // working sets — a warm-up is not the effort the question is about, which is
  // the same reason it wins no record.
  const trackRpe = useTrackRpe()
  // Rest targets are a module-level cache; without this subscription an edit
  // made here would not reach the routine layout (or the next card) until an
  // unrelated re-render. Same contract as `useScheduleVersion`.
  const restVersion = useRestTargets()
  const restEdited = useMemo(
    () => { void restVersion; return hasRestOverride(exercise.name, dayKey) },
    [restVersion, exercise.name, dayKey],
  )

  // The band's rule. Cardio keeps its violet — it is not a muscle, and giving it
  // a muscle hue would file it under one.
  const accent = useMemo(
    () => (exercise.kind === 'cardio' ? CARDIO_VIOLET : exerciseColor(exercise.name, exercise.muscleGroups)),
    [exercise.kind, exercise.name, exercise.muscleGroups],
  )

  const handleActivate = useCallback((i: number) => setActiveSet((cur) => (cur === i ? null : i)), [])
  const handleChange = useCallback((i: number, patch: Partial<DraftSet>) => onUpdateSet(localId, i, patch), [onUpdateSet, localId])
  const handleRemove = useCallback((i: number) => { setActiveSet(null); onRemoveSet(localId, i) }, [onRemoveSet, localId])
  const handleToggleDone = useCallback((i: number) => onToggleDone(localId, i), [onToggleDone, localId])
  const handleSplit = useCallback((i: number) => onSplitSet(localId, i), [onSplitSet, localId])
  const handleMerge = useCallback((pairId: string) => onMergeSet(localId, pairId), [onMergeSet, localId])
  // Undefined when the parent supplies no handler, so the row renders the
  // trophy strip as inert rather than as a dead-looking button.
  const handlePrTap = useMemo(
    () => (onPrTap ? (i: number) => onPrTap(localId, i) : undefined),
    [onPrTap, localId],
  )
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: exercise.localId })

  /**
   * ── THE SIBLINGS' SHUFFLE ──────────────────────────────────────────────────
   * dnd-kit's own `transition` is `250ms linear` — the one easing curve that
   * never occurs in the physical world, which is why the deck used to reorder
   * like a spreadsheet rather than settle like objects. It is replaced with the
   * house curve (the cubic-bézier form of `SNAPPY`), and dropped entirely under
   * `prefers-reduced-motion`, where travel is exactly what the user asked not
   * to see.
   *
   * The DRAGGED card is not styled here at all any more: it rides in a
   * `DragOverlay` portal (see `ExerciseDeckList`) and this one just fades in
   * place, so it no longer needs a hand-written z-index to escape the list's
   * stacking context — which it never fully managed anyway.
   */
  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition: reducedMotion ? undefined
      : transition?.replace(/linear/, 'cubic-bezier(0.2, 0.9, 0.3, 1)') ?? undefined,
    willChange: isDragging ? 'transform' as const : undefined,
    opacity: isDragging ? 0.4 : undefined,
  }
  const dragClass = ''

  const grip = (
    <button
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      className="touch-none min-h-[40px] min-w-[32px] flex items-center justify-center rounded-lg text-muted
                 hover:text-text cursor-grab active:cursor-grabbing"
      aria-label={`Reorder ${exercise.name}`}
    >
      <GripVertical className="w-4 h-4" aria-hidden="true" />
    </button>
  )

  // Programmed target for this lift — floor–ceiling (loaded) or hold seconds (timed).
  //
  // Memoized on (name, dayKey) because these are not cheap lookups: each one
  // canonicalises the name, then scans every day of the active program parsing
  // rep-window strings. They ran on EVERY render of this card — i.e. on every
  // keystroke of every weight field in it.
  //
  // Declared ABOVE the cardio early-return: hooks must run in the same order on
  // every render, and a cardio card returns before this point.
  const prevWork = useMemo(() => workingSets(history ?? undefined), [history])
  // Indexed by working-set position, which is what the row's "Previous" means:
  // set 2 against set 2. A session with fewer sets than today simply runs out,
  // and the later rows show nothing rather than repeating the last one.
  const prevGlobal = useMemo(
    () => workingSets(globalHistory ?? history ?? undefined),
    [globalHistory, history],
  )
  const timedEx = useMemo(() => isTimedExercise(exercise.name), [exercise.name])
  // No load to progress → the deck shows no load controls (see SetEditorRow).
  const bodyweightEx = useMemo(() => isBodyweightExercise(exercise.name), [exercise.name])
  // Whether the tuner offers "Add load" at all — a dip takes a belt, a reverse
  // crunch does not. Separate from `bodyweightEx`, which answers the COLUMN
  // question and stays true for both.
  const loadableEx = useMemo(() => isLoadableBodyweightExercise(exercise.name), [exercise.name])

  /**
   * ── WHICH COLUMNS THIS EXERCISE HAS ────────────────────────────────────────
   * Resolved ONCE, here, and handed to every row — rows of one card that
   * disagreed about their columns would not be a table, and the header is drawn
   * from this same value so it cannot describe a column that is not rendered.
   *
   * The `weightKg > 0` clause is what keeps a weighted variant working. A
   * belt on a dip or a plate on a knee raise promotes the WHOLE exercise back
   * to `loaded` the moment any set carries load, which is also what the tuner's
   * "+ Add load" button is for: it reveals the field, the user types a number,
   * and the column appears for every row at once.
   */
  const gridMode: SetGridMode = useMemo(() => {
    const carriesLoad = exercise.sets.some((s) => s.weightKg > 0)
    if (carriesLoad) return 'loaded'
    if (timedEx) return 'time'
    if (bodyweightEx) return 'reps'
    return 'loaded'
  }, [exercise.sets, timedEx, bodyweightEx])
  // Both of these resolve through `activeProgram()`, so they DO depend on
  // something that can change while you log: the plan/phase preference lands
  // from `user_goals` after first render, and the phase decides the prescribed
  // window. Frozen, the double-progression coach told you to add load against
  // the previous phase's ceiling. (The memos are still worth keeping — they
  // otherwise re-scan every program day on every keystroke.)
  const planVersion = useScheduleVersion()
  const repWindow = useMemo(
    () => { void planVersion; return timedEx ? null : repWindowFor(exercise.name, dayKey) },
    [timedEx, exercise.name, dayKey, planVersion],
  )
  const holdTarget = useMemo(
    () => { void planVersion; return timedEx ? holdTargetFor(exercise.name, dayKey) : null },
    [timedEx, exercise.name, dayKey, planVersion],
  )
  // Strict-ceiling coach over the LOAD LADDER. Mixed loads within one exercise
  // are judged by the lowest ("binding") load — see ladderVerdict. This is the
  // same verdict whether you went heavy-to-light or light-to-heavy.
  const committedWork = useMemo(
    () => exercise.sets
      .filter((s) => isSetCommitted(s) && s.setType !== 'warmup')
      .map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
    [exercise.sets],
  )
  const ladder = useMemo(
    () => (repWindow ? ladderVerdict(committedWork, repWindow.ceiling) : null),
    [repWindow, committedWork],
  )
  // Mixed loads with the top rung handled: level the light sets up, don't add.
  const levelUp = useMemo(
    () => (repWindow ? levelUpCue(committedWork, repWindow) : null),
    [repWindow, committedWork],
  )

  // What the last report asked for on THIS movement, matched by canonical name.
  // Null for every exercise the report did not name — a target nobody wrote is
  // not a target of the current load.
  /**
   * ── THE LIVE REST STOPWATCH IS GONE (2026-08-19) ───────────────────────────
   * A `RestTimer` used to sit in this header counting up from the last set's
   * tick, fed by a client-only `doneAt` stamp on every DraftSet and written out
   * as `workout_sets.rest_sec` on commit. It measured honestly and answered the
   * wrong question: a running clock tells you what you have done, and the thing
   * a lifter needs between sets is what the plan ASKS for. It also nagged by
   * construction — a number that ticks demands to be looked at, every set,
   * twenty-four times a session.
   *
   * Helix 5.1 writes the prescription down instead (`ProgramExercise.restSec`),
   * so the chip below is a TARGET: fixed, editable, and silent. `rest_sec` stays
   * in the schema and Session Inspect still reads it — the rows logged while the
   * stopwatch existed are real data — but nothing writes it any more.
   */
  const restTarget = useMemo(
    () => { void restVersion; return restTargetFor(exercise.name, dayKey) },
    [restVersion, exercise.name, dayKey],
  )

  const reportTarget = useMemo(
    () => targetForExercise(reportTargets, exercise.name),
    [reportTargets, exercise.name],
  )

  // Unilateral lifts (already split, or a movement trained one side at a time)
  // get the asymmetry rule: the STRONG side sets the rep count, the weak side
  // matches it — and only they are offered the Split L/R control.
  //
  // The name test used to be a four-alternation regex spelled right here, which
  // covered the three catalog entries saying "single arm" and missed every
  // movement that is unilateral without saying so. It lives in
  // `exercises/unilateral.ts` now, beside its siblings and under test.
  //
  // The `sets.some(...)` half stays as an escape hatch: a set already carrying a
  // side or a pairId must remain editable whatever the name check thinks.
  const unilateral = exercise.sets.some((s) => s.side || s.pairId)
    || isUnilateralExercise(exercise.name)

  // Highest-priority coach line only. Order = how actionable it is in THIS set:
  // an unmet obligation beats an earned reward, which beats a status note,
  // which beats a standing technique reminder.
  /**
   * ── THE SET IN FRONT OF YOU OUTRANKS THE ONE BEHIND ────────────────────────
   * `ready` is a verdict on the last two SESSIONS, fetched by
   * `useProgressionQueue` before this one started. It was rendered
   * unconditionally, so a lift that earned its bump last week kept saying
   * "add load: 30 → 32.5kg" while today's rows read 30kg × 11 against a
   * ceiling of 12 — a weight increase advised on a set that had not reached the
   * programmed ceiling. That is the bug; the ceiling itself was never wrong
   * (`repWindowFor` reads the explicit window off the active program, per day).
   *
   * Two live facts retire the historical verdict:
   *
   *   · `bumpTaken` — today's top load is already at or past the suggestion, so
   *     the advice has been followed and the old chain is finished.
   *   · `shortOfCeiling` — there IS committed work today and it has not cleared
   *     the ceiling. What is owed is reps, not plates.
   *
   * Before the first set is ticked neither holds, and the badge is exactly what
   * it should be: today's instruction.
   */
  const liveTopKg = useMemo(
    () => (committedWork.length ? Math.max(...committedWork.map((w) => w.weightKg)) : null),
    [committedWork],
  )
  const bumpTaken = ready?.suggestKg != null && liveTopKg != null && liveTopKg >= ready.suggestKg
  const shortOfCeiling = committedWork.length > 0 && ladder?.state === 'incomplete'
  const readyNow = ready && !bumpTaken && !shortOfCeiling ? ready : null

  const coachCue = useMemo((): { text: string; color: string; icon: typeof Target } | null => {
    // MIXED LOADS: never "add weight". The correct move is to bring the light
    // sets up to the load already being handled, earned at the window FLOOR.
    if (levelUp) {
      return {
        color: READY_GOLD, icon: Target,
        text: `Raise ${fmtKg(levelUp.fromKg)}kg → ${fmtKg(levelUp.toKg)}kg, target ${levelUp.atReps} reps`,
      }
    }
    if (ladder?.state === 'blocked') {
      return {
        color: READY_GOLD, icon: Target,
        text: `Clear ${fmtKg(ladder.bindingLoadKg ?? 0)}kg first — ${ladder.repsOwed} more rep${ladder.repsOwed === 1 ? '' : 's'} to reach ${ladder.ceiling} on every set before ${fmtKg(ladder.topLoadKg ?? 0)}kg replaces it.`,
      }
    }
    // Today's work is under the programmed ceiling at ONE load. Whatever last
    // week earned, the instruction for the set in front of you is reps.
    if (shortOfCeiling && ladder && ladder.repsOwed > 0 && ladder.bindingLoadKg != null) {
      return {
        color: AMBER, icon: Target,
        text: `${ladder.repsOwed} more rep${ladder.repsOwed === 1 ? '' : 's'} to reach ${ladder.ceiling} at ${fmtKg(ladder.bindingLoadKg)}kg before the load moves`,
      }
    }
    if (readyNow?.state === 'ready' && !readyNow.timed && readyNow.currentKg != null && readyNow.suggestKg != null) {
      return {
        color: READY_GOLD, icon: Target,
        text: `Ceiling cleared twice — add load: ${fmtKg(readyNow.currentKg)} → ${fmtKg(readyNow.suggestKg)}kg`,
      }
    }
    // Earned the progression with no load to add. Reps ARE the record here, so
    // the instruction is a rep beyond the ceiling — the branch above needs a
    // `suggestKg` this movement can never have, and without this the card fell
    // through to a generic line and said nothing about what it just earned.
    if (readyNow?.state === 'ready' && !readyNow.timed && readyNow.suggestKg == null && repWindow) {
      return {
        color: READY_GOLD, icon: Target,
        text: `Ceiling cleared twice — go past ${repWindow.ceiling} reps this session`,
      }
    }
    if (readyNow?.state === 'one-more') {
      return {
        color: AMBER, icon: Target,
        text: readyNow.timed
          ? 'Hold cleared — one more session like it to earn a longer hold'
          : 'Top load cleared — one more session like it to earn the next load',
      }
    }
    if (exercise.targetNext) return { color: READY_GOLD, icon: Target, text: `Next: ${exercise.targetNext}` }
    if (unilateral) {
      return {
        color: STEEL, icon: ArrowLeftRight,
        text: 'Strong side sets the rep count — the weak side matches, never exceeds.',
      }
    }
    return null
  }, [ladder, levelUp, readyNow, shortOfCeiling, repWindow, exercise.targetNext, unilateral])

  // ── Cardio variant: slim card, distance/duration, no set rows ──
  //
  // INTERACTIVE. The two figures used to be display-only chips, so the treadmill
  // card could be read and never corrected — and since commit flattened cardio
  // into the notes string, an edit of the session brought it back as prose with
  // no inputs at all. Both are editable here, and the block commits to
  // `cardio_logs` keyed on the session.
  if (exercise.kind === 'cardio') {
    const chip = (label: string, value: string) => (
      <span className="helix-num text-fluid-sm font-bold tabular-nums px-2 py-1 rounded-lg"
        style={{ color: CARDIO_VIOLET, background: `${CARDIO_VIOLET}14`, border: `1px solid ${CARDIO_VIOLET}33` }}>
        {value}<span className="text-[10px] font-normal ml-0.5">{label}</span>
      </span>
    )
    return (
      <div ref={setNodeRef} style={sortableStyle}
        className={`rounded-2xl border border-white/[0.07] bg-white/[0.03] p-2.5 !rounded-2xl shadow-[0_4px_22px_rgba(0,0,0,0.26)] ${dragClass}`}
      >
        <div className="flex items-center gap-2">
          {grip}
          <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${CARDIO_VIOLET}1c`, color: CARDIO_VIOLET }}>
            <Footprints className="w-4 h-4" aria-hidden="true" />
          </span>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="flex-1 min-w-0 text-left">
            <span className="font-semibold text-text leading-snug truncate block" style={{ fontSize: 'var(--text-exercise-title)' }}>{exercise.name}</span>
            {/* No longer hardcoded "warm-up": a block added mid-session is a
                finisher, and calling it a warm-up misdescribes it. */}
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: CARDIO_VIOLET }}>
              {exercise.note?.trim() || 'Cardio'}
            </span>
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            {!open && exercise.distanceKm != null && chip('km', String(exercise.distanceKm))}
            {!open && exercise.durationSec != null && chip('min', String(Math.round(exercise.durationSec / 60)))}
            {!open && exercise.inclinePct != null && exercise.inclinePct > 0 && chip('%', String(exercise.inclinePct))}
            {!open && exercise.distanceKm == null && exercise.durationSec == null && (
              <span className="text-[10px] text-muted">Tap to log</span>
            )}
            <button type="button" onClick={() => onRemoveExercise(localId)}
              className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-muted hover:text-danger"
              aria-label={`Remove ${cardioSummary(exercise)}`}>
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {open && onUpdateCardio && (
          <div className="mt-2 border-t border-white/[0.06] pt-2 flex items-end gap-2">
            <CardioField
              label="Distance" unit="km" step={0.1} value={exercise.distanceKm}
              onCommit={(v) => onUpdateCardio(localId, { distanceKm: v ?? undefined })}
            />
            <CardioField
              label="Duration" unit="min" step={1}
              value={exercise.durationSec != null ? Math.round((exercise.durationSec / 60) * 10) / 10 : null}
              // Stored in SECONDS — the deck's own unit is minutes because that
              // is how a treadmill is set, but a 4:30 warm-up must survive.
              onCommit={(v) => onUpdateCardio(localId, { durationSec: v == null ? undefined : Math.round(v * 60) })}
            />
            {/* ── INCLINE ──
                A treadmill walk at 0% and the same walk at 12% are not the same
                session, and until now the deck had nowhere to say which one
                happened — the two figures beside this one describe how far and
                how long, and neither is the reason a 5 km/h walk was hard.

                Half-percent steps, because that is the grid a treadmill's own
                buttons move on. */}
            <CardioField
              label="Incline" unit="%" step={0.5} value={exercise.inclinePct}
              onCommit={(v) => onUpdateCardio(localId, { inclinePct: v ?? undefined })}
            />
          </div>
        )}
      </div>
    )
  }

  const status = exercise.status ? STATUS_META[exercise.status] : null
  const groups = groupSets(exercise.sets)
  // A pair contributes one "L|R" token so the header doesn't double-count sides.
  const summary = groups.map((g) => g.kind === 'single' ? g.set.reps : `${g.left?.set.reps ?? '–'}|${g.right?.set.reps ?? '–'}`).join('/')
  const topWeight = Math.max(...exercise.sets.map((s) => s.weightKg), 0)
  return (
    /**
     * ── A BAND, NOT A CARD ────────────────────────────────────────────────────
     * This was `rounded-2xl border bg-white/[0.03] p-3` with a 22px shadow. Ten
     * exercises is ten shadows and 60px of vertical padding spent on frames
     * around content that is already a list — and a shadow that deep on a
     * near-black canvas reads as smudge rather than as elevation.
     *
     * What replaces the frame is a 3px rule in THE EXERCISE'S OWN HUE
     * (`muscleHue.ts`), which is what actually makes a long deck scannable: you
     * find the leg movement by its blue, not by counting cards. The radius stays
     * only on the left edge so the rule reads as an edge rather than a chip.
     */
    <div ref={setNodeRef} style={{ ...sortableStyle, borderLeft: `3px solid ${accent}` }}
      className={`rounded-r-xl border-y border-r border-white/[0.06] bg-white/[0.02] px-3 py-2.5 ${dragClass}`}
    >
      {/* ── Header: grip + name + status + collapse ── */}
      <div className="flex items-center gap-2">
        {grip}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left min-h-[38px]"
        >
          <div className="min-w-0">
            {/* `flex-wrap`, and one size down. Long names ("Leg Press Horizontal
                (Machine)") were fighting 2–3 status chips for one non-wrapping
                line, so the NAME lost — truncated to an ellipsis while the chips
                kept their width. Now the chips drop to a second line instead. */}
            <div className="flex items-center gap-x-2 gap-y-1 min-w-0 flex-wrap">
              <span className="font-semibold text-text leading-snug truncate" style={{ fontSize: 'var(--text-exercise-title)' }}>{exercise.name}</span>
              {/* Everything from here to the rep window is about the set in
                  front of you. While a drag is live there is no set in front of
                  you — see `dragCollapsed`. */}
              {!dragCollapsed && status && (
                <span
                  className="shrink-0 inline-flex items-center px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: status.color, background: `${status.color}1f`, border: `1px solid ${status.color}55` }}
                >
                  {status.label}
                </span>
              )}
              {/* Same rule as the cue: an earned bump stops being today's
                  instruction the moment today's own sets contradict it. */}
              {!dragCollapsed && readyNow && (
                <span
                  className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: READY_GOLD, background: `${READY_GOLD}1f`, border: `1px solid ${READY_GOLD}66` }}
                  title={bodyweightEx
                    ? 'Cleared the ceiling twice — add a rep this session'
                    : 'Cleared the ceiling twice — add load this session'}
                >
                  {/* A BODYWEIGHT movement has no load to add. The fallback here
                      used to be the literal string "+2.5kg", so a Hanging Knee
                      Raise that earned its progression was told to add a plate
                      it cannot hold — the one instruction on the card, and it
                      was impossible to follow. `suggestKg` is already null for
                      unloaded work; only the fallback was wrong. */}
                  ▲ {readyNow.timed ? 'HOLD+'
                    : readyNow.suggestKg != null ? `${fmtKg(readyNow.suggestKg)}kg`
                    : '+1 REP'}
                </span>
              )}
              {/* Programmed target — floor–ceiling, ceiling highlighted gold. */}
              {repWindow && (
                <span
                  className="shrink-0 inline-flex items-center px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wide tabular-nums"
                  style={{ color: MUTED, background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}` }}
                  title="Target rep range · floor–ceiling"
                >
                  {repWindow.floor}<span className="opacity-40 mx-px">–</span>
                  <span style={{ color: READY_GOLD }}>{repWindow.ceiling}</span>
                </span>
              )}
              {/* What your last report asked for on this lift. RETRIEVED from a
                  document you pasted — the app writes no targets of its own. */}
              {!dragCollapsed && reportTarget && formatTarget(reportTarget) && (
                <span
                  className="shrink-0 inline-flex items-center gap-1 px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wide tabular-nums"
                  style={{ color: SAPPHIRE, background: `${SAPPHIRE}18`, border: `1px solid ${SAPPHIRE}55` }}
                  title="From your last pasted report — never generated in-app"
                >
                  <Target className="w-2.5 h-2.5" aria-hidden="true" />
                  {formatTarget(reportTarget)}
                </span>
              )}
              {timedEx && holdTarget != null && (
                <span
                  className="shrink-0 inline-flex items-center px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wide tabular-nums"
                  style={{ color: MUTED, background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}` }}
                  title="Target hold"
                >
                  <span style={{ color: READY_GOLD }}>{holdTarget}s</span>
                </span>
              )}
            </div>
            {/* ── THE PREV CHIP IS GONE — IT IS A COLUMN NOW ──
                It read "Prev 36kg × 12, 11, 10 · 12 Aug": every set of last
                session's numbers, comma-separated, in one tinted pill above the
                rows those numbers belong to. To use it you re-counted commas
                against set rows, and it duplicated data the row already had —
                `SetEditorRow` has been handed `prev` per set for a while and was
                hiding it below the `xs` breakpoint.

                What survives is the one thing the column cannot say: that there
                is NO history, so the numbers you are looking at came from the
                program rather than from you. */}
            {!dragCollapsed && !prevWork.length && (
              <span
                className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md text-[10px] leading-snug"
                style={{ color: MUTED, background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}` }}
              >
                <History className="w-3 h-3 shrink-0" aria-hidden="true" />
                No history in this era — showing program targets
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Current-input glance — only when the card is collapsed. Expanded,
                the live set rows below say the same thing, so it's redundant. */}
            {/* Folded for a drag, the tail is the SET COUNT — how big a block
                you are moving. The live glance ("36kg × 12,11,10") is about the
                work; while dragging, the question is the shape of the session. */}
            {dragCollapsed ? (
              <span className="helix-num text-xs text-muted tabular-nums">
                {exercise.sets.length || '—'} {exercise.sets.length === 1 ? 'set' : 'sets'}
              </span>
            ) : (
              <>
                {!showBody && (
                  <span className="helix-num text-xs text-muted tabular-nums">
                    {timedEx ? `${summary} sec`
                      : topWeight > 0 ? `${fmtKg(topWeight)}kg × ${summary}`
                      : `${summary} reps`}
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </>
            )}
          </div>
        </button>

        {/* ── Target rest — the ONLY rest control on the card ──
            What the plan asks for between working sets. A plain fact, not a
            countdown: nothing ticks, nothing has to be dismissed. Tapping it
            opens the sheet that used to be a permanently-mounted ± dial under
            the exercise name — the same number, rendered twice, on a card whose
            job is set rows.

            A SIBLING of the collapse button, not a child of it. A button cannot
            contain a button (the PR trophy strip learned this the hard way in
            `SetEditorRow`), so this lives outside and the header's tap target
            stops at the chevron. */}
        {!dragCollapsed && restTarget != null && (
          <button
            type="button"
            onPointerDown={() => { void tapLight() }}
            onClick={() => setRestSheet(true)}
            className="shrink-0 inline-flex items-center gap-1 px-2 min-h-[32px] rounded-lg text-[10px] font-bold tabular-nums
                       active:scale-95 transition-transform"
            style={{ color: STEEL, background: `${STEEL}14`, border: `1px solid ${STEEL}3d` }}
            aria-label={`Target rest ${formatRestTarget(restTarget)}${restEdited ? ', your own value' : ''} — tap to change`}
            title={`Target rest between sets${restEdited ? ' — your own value' : ''}`}
          >
            <Timer className="w-2.5 h-2.5" aria-hidden="true" />
            {formatRestTarget(restTarget)}
            {restEdited && <span className="opacity-60" aria-hidden="true">*</span>}
          </button>
        )}
      </div>

      <RestTargetSheet
        open={restSheet}
        onClose={() => setRestSheet(false)}
        exerciseName={exercise.name}
        dayKey={dayKey}
      />

      {/* ── Note (editable) + next-target ── */}
      {showBody && (
        <div className="mt-2 ml-8 space-y-1.5">
          {editingNote ? (
            <textarea
              autoFocus
              rows={2}
              defaultValue={exercise.note ?? ''}
              onBlur={(e) => { onSetNote(localId, e.target.value.trim()); setEditingNote(false) }}
              dir="auto"
              placeholder="Note for this exercise…"
              className="w-full rounded-lg bg-white/[0.04] border border-white/[0.12] px-2.5 py-1.5 field-compact text-text
                         placeholder:text-muted/50 outline-none focus:border-primary/40 resize-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className={`w-full text-left flex items-start gap-1.5 rounded-lg transition-colors min-h-[28px]
                          ${exercise.note ? 'text-muted hover:text-text' : 'text-muted/60 hover:text-text'}`}
              aria-label={exercise.note ? `Edit note for ${exercise.name}` : `Add note for ${exercise.name}`}
            >
              <NotebookPen className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-xs leading-snug" dir="auto">{exercise.note || 'Add note'}</span>
            </button>
          )}
          {/* ONE cue, not a stack. Four of these could render at once — a target,
              a ladder verdict, a ready-to-progress nudge and a unilateral hint —
              turning the top of a card into a paragraph you stop reading. They
              are ranked by how actionable they are RIGHT NOW and only the winner
              shows. */}
          {coachCue && (
            <p className="text-xs leading-snug flex items-center gap-1" style={{ color: coachCue.color }}>
              <coachCue.icon className="w-3 h-3 shrink-0" aria-hidden="true" />
              {coachCue.text}
            </p>
          )}

        </div>
      )}

      {/* ── Set rows ── */}
      {showBody && (
        <div className="mt-2 border-t border-white/[0.06] pt-1.5 space-y-0.5">
          {/* ── Column headers ──
              The set rows carried none, so every value had to be identified by
              what it looked like: the muted pair was last time, the bold pair
              was now, probably. Four words remove that inference, and they cost
              one 14px line per card.

              The frame comes from `setGrid.ts`, the same module the rows import
              — badge width, grid template and tail width — so a column cannot
              be added here without the data moving with it, and a movement with
              no load cannot grow a KG header over a column that is not there.

              The tick has a header now too. It was an empty `aria-hidden`
              spacer, which lined the row up correctly and left the one column
              carrying the most consequential control on the deck as the only
              unlabelled thing in the table. */}
          <div className={`flex items-center ${SET_FRAME_GAP} px-2 pb-1`}>
            <span className={`${SET_BADGE_W} shrink-0 ${SET_HEADER_TEXT}`}>Set</span>
            <span className={`flex-1 ${setGridFor(gridMode)} ${SET_HEADER_TEXT}`}>
              <span>Previous</span>
              {/* The load track is always in the template so every value in the
                  deck shares an edge; on an unloaded movement it carries no
                  label, because there is nothing under it. */}
              {gridMode === 'loaded' ? (
                <span className="inline-flex items-center gap-1">
                  <Weight className="w-2.5 h-2.5" aria-hidden="true" />kg
                </span>
              ) : <span aria-hidden="true" />}
              <span>{setValueLabel(gridMode)}</span>
              <span className="text-right" title="Effort — the RPE you rated this set">RPE</span>
            </span>
            <span className={`${SET_TAIL_W} shrink-0 flex items-center justify-center ${SET_HEADER_TEXT}`}
              title="Completed — only ticked sets are recorded">
              <Check className="w-2.5 h-2.5" strokeWidth={3} aria-hidden="true" />
              <span className="sr-only">Completed</span>
            </span>
          </div>
          {groups.map((g) => {
            const timed = timedEx
            if (g.kind === 'single') {
              const i = g.idx
              return (
                <SetEditorRow
                  trackRpe={trackRpe}
                  key={`s${i}`}
                  index={i}
                  displayNum={g.num}
                  set={g.set}
                  prev={prevGlobal[g.num - 1] ?? null}
                  active={activeSet === i}
                  timed={timed} gridMode={gridMode}
                  loadable={loadableEx}
                  prAxes={livePrs?.get(livePrKey(exercise.localId, i))}
                  onActivate={handleActivate}
                  onChange={handleChange}
                  onRemove={handleRemove}
                  onToggleDone={handleToggleDone}
                  // ── SPLIT L/R IS FOR UNILATERAL WORK ONLY ──
                  // It was offered on every set of every movement, including a
                  // barbell bench press, where "left side 60 kg" is not a thing
                  // that can happen. Worse than clutter: a mis-tap silently
                  // halves one set into two rows that the PR engine then judges
                  // per side. `unilateral` is the same test the coach cue uses —
                  // an already-split set, or a name that says single-arm /
                  // single-leg / per side.
                  onSplit={unilateral ? handleSplit : undefined}
                  onPrTap={handlePrTap}
                />
              )
            }
            // Unilateral pair → ONE "Set N" card that expands into L/R sub-rows.
            //
            // ONE TICK PER SET, NOT ONE PER ARM. The two sub-rows each used to
            // render their own checkmark, which showed two controls for one
            // physical set and made the deck look like it had twice the work in
            // it. `toggleSetDone` was already pair-aware — ticking either side
            // ticked both — so the second control never even did anything the
            // first did not. It lives on the container now, which is also what
            // the completed tint should follow.
            const asym = pairAsymmetry(g.left?.set, g.right?.set)
            const pairIdx = g.left?.idx ?? g.right?.idx
            const pairDone = isSetCommitted(g.left?.set ?? g.right?.set ?? { weightKg: 0, reps: 0, done: false })
            return (
              <div key={`p${g.pairId}`}
                className={`rounded-lg border p-1.5 space-y-1 transition-colors ${
                  pairDone ? 'border-[#3E9E7A]/40 bg-[#3E9E7A]/[0.10]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Set {g.num}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-px rounded"
                    style={{ color: '#E0703C', background: '#E0703C1f', border: '1px solid #E0703C55' }}>L / R</span>
                  {asym && (
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-px rounded"
                      style={{ color: '#C4514E', background: '#C4514E1f', border: '1px solid #C4514E55' }}
                      title={`${asym.weak === 'L' ? 'Left' : 'Right'} side ${asym.pct}% weaker (by volume)`}>
                      −{asym.pct}% {asym.weak}
                    </span>
                  )}
                  {pairIdx != null && (
                    <button
                      type="button"
                      // Haptic on pointer-DOWN so it lands on the same frame as
                      // the press highlight; commit on click, so dragging off
                      // still cancels.
                      onPointerDown={() => { void tapLight() }}
                      onClick={() => handleToggleDone(pairIdx)}
                      aria-pressed={pairDone}
                      aria-label={pairDone ? `Mark set ${g.num} not done` : `Mark set ${g.num} done — both sides`}
                      className={`ml-auto ${SET_TAIL_W} min-h-[34px] rounded-lg flex items-center justify-center shrink-0
                                 active:scale-95 transition-[color,background-color,border-color,transform] duration-150`}
                      style={pairDone
                        ? { color: '#fff', background: '#3E9E7A', border: '1px solid #3E9E7A' }
                        : { color: 'var(--color-muted)', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)' }}
                    >
                      <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {g.left && (
                  <SetEditorRow
                  trackRpe={trackRpe}
                    key={`l${g.left.idx}`} index={g.left.idx} displayNum={g.num} subRow set={g.left.set}
                    prev={prevGlobal[g.num - 1] ?? null}
                    active={activeSet === g.left.idx} timed={timed} gridMode={gridMode} loadable={loadableEx}
                    prAxes={livePrs?.get(livePrKey(exercise.localId, g.left.idx))}
                    onActivate={handleActivate}
                    onChange={handleChange}
                    onRemove={handleRemove}
                    onPrTap={handlePrTap}
                  />
                )}
                {g.right && (
                  <SetEditorRow
                  trackRpe={trackRpe}
                    key={`r${g.right.idx}`} index={g.right.idx} displayNum={g.num} subRow set={g.right.set}
                    prev={prevGlobal[g.num - 1] ?? null}
                    active={activeSet === g.right.idx} timed={timed} gridMode={gridMode} loadable={loadableEx}
                    prAxes={livePrs?.get(livePrKey(exercise.localId, g.right.idx))}
                    onActivate={handleActivate}
                    onChange={handleChange}
                    onRemove={handleRemove}
                    onPrTap={handlePrTap}
                  />
                )}
                {/* Merge collapses the pair back into one bilateral set.
                    The "Linked" toggle is GONE. It mirrored weight and reps
                    between the two sides, which defeats the only reason to split
                    a set in the first place: an arm that is genuinely weaker
                    cannot be recorded if editing one side silently rewrites the
                    other. Asymmetry is the measurement, not a mistake. */}
                <div className="flex items-center gap-1.5 px-1 pt-0.5">
                  <button type="button" onClick={() => handleMerge(g.pairId)}
                    className="min-h-[30px] px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wide text-muted border border-white/10 hover:text-danger active:scale-95 transition-colors">
                    Merge
                  </button>
                </div>
              </div>
            )
          })}
          <button
            type="button"
            onClick={() => onAddSet(localId)}
            className="w-full min-h-[36px] rounded-xl border border-dashed border-white/[0.12] text-muted
                       hover:text-text hover:border-white/[0.25] text-xs font-medium flex items-center justify-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add set
          </button>
          {/* Effort moved ONTO THE SET.
              It used to live here, once per exercise, written onto whichever
              row happened to be the last working set. That made every rating a
              claim about a set the control never named, and it threw away the
              shape of the exercise — the first set and the fifth are not the
              same question. The ladder now renders inside each set's tuner
              (`SetEditorRow`), which is also the only place the numbers it is
              rating are visible. */}
        </div>
      )}
    </div>
  )
})
