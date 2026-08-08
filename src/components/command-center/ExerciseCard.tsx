'use client'

import { useMemo, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeftRight, CheckCheck, ChevronDown, Footprints, GripVertical, History, NotebookPen, Plus, Target, X } from 'lucide-react'
import { SetEditorRow } from './SetEditorRow'
import { cardioSummary, isSetCommitted, type DraftExercise, type DraftSet } from '@/lib/sessions/draft'
import { isTimedExercise } from '@/lib/exercises/timed'
import { isBodyweightExercise } from '@/lib/exercises/bodyweight'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { repWindowFor, holdTargetFor, ladderVerdict, levelUpCue } from '@/lib/training/ceilings'
import { workingSets, type ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'
import type { PrAxis } from '@/lib/training/prEngine'
import { livePrKey } from '@/lib/sessions/livePrs'
import { SAPPHIRE, STEEL, MUTED, HAIRLINE } from '@/lib/theme/palette'

const STATUS_META: Record<NonNullable<DraftExercise['status']>, { label: string; color: string }> = {
  PR:       { label: 'PR',       color: '#D4AF37' },  // gold
  PROGRESS: { label: 'PROG ▲',   color: '#3E9E7A' },
  HOLD:     { label: 'HOLD',     color: '#79808C' },
  REGRESS:  { label: 'REGR ▼',   color: '#C4514E' },
  NEW:      { label: 'NEW',      color: '#8E9AAC' },
}

const CARDIO_VIOLET = '#B4522A'
const READY_GOLD = '#D4AF37'
const AMBER = '#E0A03C'   // one-more-session: earned, not yet due

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
const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * One exercise widget of the deck: dnd-kit sortable (drag from the grip only),
 * coach status chip, the era-scoped "PREV" reference chip beside today's
 * inputs, an editable note, and the per-set tuner rows. Cardio entries render
 * as a slim violet card (distance/duration, no set rows — excluded at commit).
 */
export function ExerciseCard({ exercise, history, livePrs, dayKey, ready, collapsed = false, onUpdateSet, onSplitSet, onMergeSet, onToggleLink, onAddSet, onRemoveSet, onToggleDone, onCheckAll, onRemoveExercise, onSetNote }: {
  exercise: DraftExercise
  history: ExerciseHistory | null
  /** Live records keyed `${localId}|${setIdx}` — computed once for the whole
   *  deck so a set is judged against the ones ticked before it. */
  livePrs?: Map<string, PrAxis[]>
  /** The routine being logged. Rep windows are per DAY — Calf Press on Legs B
   *  has a different ceiling than on Legs A — so this must be threaded through
   *  or the card silently falls back to the strictest window in the program. */
  dayKey?: string | null
  /** Forward-carried progression cue for this lift (cleared its ceiling twice). */
  ready?: ReadyCue | null
  /** Force header-only (drag-reorder collapses the whole deck for visibility). */
  collapsed?: boolean
  onUpdateSet: (setIdx: number, patch: Partial<DraftSet>) => void
  onSplitSet: (setIdx: number) => void
  onMergeSet: (pairId: string) => void
  onToggleLink: (pairId: string) => void
  onAddSet: () => void
  onRemoveSet: (setIdx: number) => void
  onToggleDone: (setIdx: number) => void
  onCheckAll: () => void
  onRemoveExercise: () => void
  onSetNote: (note: string) => void
}) {
  const [open, setOpen] = useState(true)
  const showBody = open && !collapsed
  const [activeSet, setActiveSet] = useState<number | null>(null)
  const [editingNote, setEditingNote] = useState(false)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: exercise.localId })

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    willChange: isDragging ? 'transform' as const : undefined,
  }
  const dragClass = isDragging ? 'z-10 relative shadow-[0_12px_40px_rgba(0,0,0,0.55)] border-primary/30' : ''

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
  const timedEx = useMemo(() => isTimedExercise(exercise.name), [exercise.name])
  // No load to progress → the deck shows no load controls (see SetEditorRow).
  const bodyweightEx = useMemo(() => isBodyweightExercise(exercise.name), [exercise.name])
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

  // Unilateral lifts (already split, or a single-arm/per-side movement) get the
  // asymmetry rule: the STRONG side sets the rep count, the weak side matches it.
  const unilateral = exercise.sets.some((s) => s.side || s.pairId)
    || /single[- ]?arm|one[- ]?arm|single[- ]?leg|per (side|arm)/i.test(exercise.name)

  // Highest-priority coach line only. Order = how actionable it is in THIS set:
  // an unmet obligation beats an earned reward, which beats a status note,
  // which beats a standing technique reminder.
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
    if (ready?.state === 'ready' && !ready.timed && ready.currentKg != null && ready.suggestKg != null) {
      return {
        color: READY_GOLD, icon: Target,
        text: `Ceiling cleared twice — add load: ${fmtKg(ready.currentKg)} → ${fmtKg(ready.suggestKg)}kg`,
      }
    }
    if (ready?.state === 'one-more') {
      return {
        color: AMBER, icon: Target,
        text: ready.timed
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
  }, [ladder, levelUp, ready, exercise.targetNext, unilateral])

  // ── Cardio variant: slim card, distance/duration chips, no set rows ──
  if (exercise.kind === 'cardio') {
    return (
      <div ref={setNodeRef} style={sortableStyle}
        className={`helix-card !p-2.5 !rounded-2xl shadow-[0_4px_22px_rgba(0,0,0,0.26)] ${dragClass}`}
      >
        <div className="flex items-center gap-2">
          {grip}
          <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${CARDIO_VIOLET}1c`, color: CARDIO_VIOLET }}>
            <Footprints className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-text leading-snug truncate block" style={{ fontSize: 'var(--text-exercise-title)' }}>{exercise.name}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: CARDIO_VIOLET }}>Cardio · warm-up</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {exercise.distanceKm != null && (
              <span className="helix-num text-fluid-sm font-bold tabular-nums px-2 py-1 rounded-lg"
                style={{ color: CARDIO_VIOLET, background: `${CARDIO_VIOLET}14`, border: `1px solid ${CARDIO_VIOLET}33` }}>
                {exercise.distanceKm}<span className="text-[10px] font-normal ml-0.5">km</span>
              </span>
            )}
            {exercise.durationSec != null && (
              <span className="helix-num text-fluid-sm font-bold tabular-nums px-2 py-1 rounded-lg"
                style={{ color: CARDIO_VIOLET, background: `${CARDIO_VIOLET}14`, border: `1px solid ${CARDIO_VIOLET}33` }}>
                {Math.round(exercise.durationSec / 60)}<span className="text-[10px] font-normal ml-0.5">min</span>
              </span>
            )}
            <button type="button" onClick={onRemoveExercise}
              className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-muted hover:text-danger"
              aria-label={`Remove ${cardioSummary(exercise)}`}>
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const status = exercise.status ? STATUS_META[exercise.status] : null
  const groups = groupSets(exercise.sets)
  // A pair contributes one "L|R" token so the header doesn't double-count sides.
  const summary = groups.map((g) => g.kind === 'single' ? g.set.reps : `${g.left?.set.reps ?? '–'}|${g.right?.set.reps ?? '–'}`).join('/')
  const topWeight = Math.max(...exercise.sets.map((s) => s.weightKg), 0)
  // "Prev 0kg × 15, 16" is a load that does not exist in front of the only
  // numbers a bodyweight movement has. Reps (or seconds) lead instead.
  const prevChip = (() => {
    const reps = prevWork.map((s) => s.reps).join(', ')
    if (timedEx) return `${reps} sec`
    const top = Math.max(...prevWork.map((s) => s.weightKg), 0)
    return top > 0 ? `${fmtKg(top)}kg × ${reps}` : `${reps} reps`
  })()

  return (
    <div ref={setNodeRef} style={sortableStyle}
      className={`helix-card !p-3 !rounded-2xl shadow-[0_4px_22px_rgba(0,0,0,0.26)] ${dragClass}`}
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
              {status && (
                <span
                  className="shrink-0 inline-flex items-center px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: status.color, background: `${status.color}1f`, border: `1px solid ${status.color}55` }}
                >
                  {status.label}
                </span>
              )}
              {ready && (
                <span
                  className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: READY_GOLD, background: `${READY_GOLD}1f`, border: `1px solid ${READY_GOLD}66` }}
                  title="Cleared the ceiling twice — add load this session"
                >
                  ▲ {ready.timed ? 'HOLD+' : ready.suggestKg != null ? `${fmtKg(ready.suggestKg)}kg` : '+2.5kg'}
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
            {/* Historical memory — the previous comparable session, as a clear
                reference widget. It also states PROVENANCE: whether the inputs
                below were seeded from that session or are program targets, so a
                cold-start number is never mistaken for something you lifted. */}
            <span
              className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md text-[11px] leading-snug tabular-nums"
              style={history
                ? { color: STEEL, background: `${SAPPHIRE}14`, border: `1px solid ${SAPPHIRE}47` }
                : { color: MUTED, background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}` }}
            >
              <History className="w-3 h-3 shrink-0" aria-hidden="true" />
              {/* Working sets only. The history payload now carries warm-ups so
                  seeding can reproduce them, but a warm-up in the PREV chip
                  understates the top load and misreads as a regression. */}
              {history && prevWork.length
                ? <>Prev {prevChip} · {fmtDate(history.date)}</>
                : 'No history in this era — showing program targets'}
            </span>
            {exercise.seededFrom && (
              <span className="ml-1.5 text-[10px]" style={{ color: MUTED }}>
                seeded from {fmtDate(exercise.seededFrom)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Current-input glance — only when the card is collapsed. Expanded,
                the live set rows below say the same thing, so it's redundant. */}
            {!showBody && (
              <span className="helix-num text-xs text-muted tabular-nums">
                {timedEx ? `${summary} sec`
                  : topWeight > 0 ? `${fmtKg(topWeight)}kg × ${summary}`
                  : `${summary} reps`}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </div>
        </button>
      </div>

      {/* ── Note (editable) + next-target ── */}
      {showBody && (
        <div className="mt-2 ml-8 space-y-1.5">
          {editingNote ? (
            <textarea
              autoFocus
              rows={2}
              defaultValue={exercise.note ?? ''}
              onBlur={(e) => { onSetNote(e.target.value.trim()); setEditingNote(false) }}
              dir="auto"
              placeholder="Note for this exercise…"
              className="w-full rounded-lg bg-white/[0.04] border border-white/[0.12] px-2.5 py-1.5 text-xs text-text
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
          {/* Check-all — tick every set green in one tap (log a whole exercise
              after the fact). Only green sets are recorded on finish. Sits on
              the divider rather than owning a full row of its own. */}
          <div className="flex justify-end -mt-4 mb-0.5">
            <button type="button" onClick={onCheckAll}
              className="min-h-[26px] px-2 rounded-lg text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 active:scale-95 transition-colors"
              style={{ color: '#3E9E7A', background: '#3E9E7A14', border: '1px solid #3E9E7A44' }}>
              <CheckCheck className="w-3 h-3" aria-hidden="true" /> Check all
            </button>
          </div>
          {groups.map((g) => {
            const timed = timedEx
            if (g.kind === 'single') {
              const i = g.idx
              return (
                <SetEditorRow
                  key={`s${i}`}
                  index={i}
                  displayNum={g.num}
                  set={g.set}
                  active={activeSet === i}
                  timed={timed}
                  bodyweight={bodyweightEx}
                  prAxes={livePrs?.get(livePrKey(exercise.localId, i))}
                  onActivate={() => setActiveSet((cur) => (cur === i ? null : i))}
                  onChange={(patch) => onUpdateSet(i, patch)}
                  onRemove={() => { setActiveSet(null); onRemoveSet(i) }}
                  onToggleDone={() => onToggleDone(i)}
                  onSplit={() => onSplitSet(i)}
                />
              )
            }
            // Unilateral pair → ONE "Set N" card that expands into L/R sub-rows.
            const asym = pairAsymmetry(g.left?.set, g.right?.set)
            const linked = (g.left?.set.linked ?? g.right?.set.linked) !== false
            return (
              <div key={`p${g.pairId}`} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-1.5 space-y-1">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Set {g.num}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-px rounded"
                    style={{ color: '#E0703C', background: '#E0703C1f', border: '1px solid #E0703C55' }}>L / R</span>
                  {asym && (
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-px rounded ml-auto"
                      style={{ color: '#C4514E', background: '#C4514E1f', border: '1px solid #C4514E55' }}
                      title={`${asym.weak === 'L' ? 'Left' : 'Right'} side ${asym.pct}% weaker (by volume)`}>
                      −{asym.pct}% {asym.weak}
                    </span>
                  )}
                </div>
                {g.left && (
                  <SetEditorRow
                    key={`l${g.left.idx}`} index={g.left.idx} displayNum={g.num} subRow set={g.left.set}
                    active={activeSet === g.left.idx} timed={timed} bodyweight={bodyweightEx}
                    prAxes={livePrs?.get(livePrKey(exercise.localId, g.left.idx))}
                    onActivate={() => setActiveSet((cur) => (cur === g.left!.idx ? null : g.left!.idx))}
                    onChange={(patch) => onUpdateSet(g.left!.idx, patch)}
                    onRemove={() => { setActiveSet(null); onRemoveSet(g.left!.idx) }}
                    onToggleDone={() => onToggleDone(g.left!.idx)}
                  />
                )}
                {g.right && (
                  <SetEditorRow
                    key={`r${g.right.idx}`} index={g.right.idx} displayNum={g.num} subRow set={g.right.set}
                    active={activeSet === g.right.idx} timed={timed} bodyweight={bodyweightEx}
                    prAxes={livePrs?.get(livePrKey(exercise.localId, g.right.idx))}
                    onActivate={() => setActiveSet((cur) => (cur === g.right!.idx ? null : g.right!.idx))}
                    onChange={(patch) => onUpdateSet(g.right!.idx, patch)}
                    onRemove={() => { setActiveSet(null); onRemoveSet(g.right!.idx) }}
                    onToggleDone={() => onToggleDone(g.right!.idx)}
                  />
                )}
                {/* Pair-level controls — link mirrors weight+reps; merge collapses back. */}
                <div className="flex items-center gap-1.5 px-1 pt-0.5">
                  <button type="button" onClick={() => onToggleLink(g.pairId)} aria-pressed={linked}
                    className="min-h-[30px] px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wide active:scale-95 transition-colors"
                    style={linked
                      ? { color: '#8E9AAC', background: '#8E9AAC1f', border: '1px solid #8E9AAC66' }
                      : { color: 'var(--color-muted)', background: 'transparent', border: '1px solid rgba(255,255,255,0.10)' }}>
                    {linked ? 'Linked' : 'Unlinked'}
                  </button>
                  <button type="button" onClick={() => onMergeSet(g.pairId)}
                    className="min-h-[30px] px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wide text-muted border border-white/10 hover:text-danger active:scale-95 transition-colors">
                    Merge
                  </button>
                </div>
              </div>
            )
          })}
          <button
            type="button"
            onClick={onAddSet}
            className="w-full min-h-[36px] rounded-xl border border-dashed border-white/[0.12] text-muted
                       hover:text-text hover:border-white/[0.25] text-xs font-medium flex items-center justify-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add set
          </button>
        </div>
      )}
    </div>
  )
}
