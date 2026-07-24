'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, Footprints, GripVertical, History, NotebookPen, Plus, Target, X } from 'lucide-react'
import { SetEditorRow } from './SetEditorRow'
import { cardioSummary, type DraftExercise, type DraftSet } from '@/lib/sessions/draft'
import { isTimedExercise } from '@/lib/exercises/timed'
import type { ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'
import { SAPPHIRE, STEEL, MUTED, HAIRLINE } from '@/lib/theme/palette'

const STATUS_META: Record<NonNullable<DraftExercise['status']>, { label: string; color: string }> = {
  PR:       { label: 'PR',       color: '#D4AF37' },  // gold
  PROGRESS: { label: 'PROG ▲',   color: '#3E9E7A' },
  HOLD:     { label: 'HOLD',     color: '#79808C' },
  REGRESS:  { label: 'REGR ▼',   color: '#C4514E' },
  NEW:      { label: 'NEW',      color: '#8E9AAC' },
}

const CARDIO_VIOLET = '#B4522A'

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
export function ExerciseCard({ exercise, history, collapsed = false, onUpdateSet, onSplitSet, onMergeSet, onToggleLink, onAddSet, onRemoveSet, onRemoveExercise, onSetNote }: {
  exercise: DraftExercise
  history: ExerciseHistory | null
  /** Force header-only (drag-reorder collapses the whole deck for visibility). */
  collapsed?: boolean
  onUpdateSet: (setIdx: number, patch: Partial<DraftSet>) => void
  onSplitSet: (setIdx: number) => void
  onMergeSet: (pairId: string) => void
  onToggleLink: (pairId: string) => void
  onAddSet: () => void
  onRemoveSet: (setIdx: number) => void
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

  // ── Cardio variant: slim card, distance/duration chips, no set rows ──
  if (exercise.kind === 'cardio') {
    return (
      <div ref={setNodeRef} style={sortableStyle}
        className={`helix-card !p-2.5 ${dragClass}`}
      >
        <div className="flex items-center gap-2">
          {grip}
          <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${CARDIO_VIOLET}1c`, color: CARDIO_VIOLET }}>
            <Footprints className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-fluid-base text-text leading-snug truncate block">{exercise.name}</span>
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

  return (
    <div ref={setNodeRef} style={sortableStyle}
      className={`helix-card !p-3 ${dragClass}`}
    >
      {/* ── Header: grip + name + status + collapse ── */}
      <div className="flex items-center gap-2">
        {grip}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left min-h-[44px]"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-fluid-base text-text leading-snug truncate">{exercise.name}</span>
              {status && (
                <span
                  className="shrink-0 inline-flex items-center px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: status.color, background: `${status.color}1f`, border: `1px solid ${status.color}55` }}
                >
                  {status.label}
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
              {history
                ? <>Prev {fmtKg(Math.max(...history.sets.map((s) => s.weightKg)))}kg × {history.sets.map((s) => s.reps).join(', ')} · {fmtDate(history.date)}</>
                : 'No history in this era — showing program targets'}
            </span>
            {exercise.seededFrom && (
              <span className="ml-1.5 text-[10px]" style={{ color: MUTED }}>
                seeded from {fmtDate(exercise.seededFrom)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="helix-num text-xs text-muted tabular-nums">
              {fmtKg(topWeight)}kg × {summary}
            </span>
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
          {exercise.targetNext && (
            <p className="text-xs leading-snug flex items-center gap-1" style={{ color: '#D4AF37' }}>
              <Target className="w-3 h-3 shrink-0" aria-hidden="true" /> Next: {exercise.targetNext}
            </p>
          )}
        </div>
      )}

      {/* ── Set rows ── */}
      {showBody && (
        <div className="mt-2 border-t border-white/[0.06] pt-1.5 space-y-0.5">
          {groups.map((g) => {
            const timed = isTimedExercise(exercise.name)
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
                  onActivate={() => setActiveSet((cur) => (cur === i ? null : i))}
                  onChange={(patch) => onUpdateSet(i, patch)}
                  onRemove={() => { setActiveSet(null); onRemoveSet(i) }}
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
                    active={activeSet === g.left.idx} timed={timed}
                    onActivate={() => setActiveSet((cur) => (cur === g.left!.idx ? null : g.left!.idx))}
                    onChange={(patch) => onUpdateSet(g.left!.idx, patch)}
                    onRemove={() => { setActiveSet(null); onRemoveSet(g.left!.idx) }}
                  />
                )}
                {g.right && (
                  <SetEditorRow
                    key={`r${g.right.idx}`} index={g.right.idx} displayNum={g.num} subRow set={g.right.set}
                    active={activeSet === g.right.idx} timed={timed}
                    onActivate={() => setActiveSet((cur) => (cur === g.right!.idx ? null : g.right!.idx))}
                    onChange={(patch) => onUpdateSet(g.right!.idx, patch)}
                    onRemove={() => { setActiveSet(null); onRemoveSet(g.right!.idx) }}
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
