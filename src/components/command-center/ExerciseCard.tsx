'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, Footprints, GripVertical, History, NotebookPen, Plus, Target, X } from 'lucide-react'
import { SetEditorRow } from './SetEditorRow'
import { cardioSummary, type DraftExercise, type DraftSet } from '@/lib/sessions/draft'
import { isTimedExercise } from '@/lib/exercises/timed'
import type { ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'

const STATUS_META: Record<NonNullable<DraftExercise['status']>, { label: string; color: string }> = {
  PR:       { label: 'PR',       color: '#F5C15A' },  // gold
  PROGRESS: { label: 'PROG ▲',   color: '#34D399' },
  HOLD:     { label: 'HOLD',     color: '#8B97B2' },
  REGRESS:  { label: 'REGR ▼',   color: '#FB7185' },
  NEW:      { label: 'NEW',      color: '#22D3EE' },
}

const CARDIO_VIOLET = '#EC4899'

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
  const summary = exercise.sets.map((s) => s.reps).join('/')
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
            {/* Historical memory — the previous comparable session, as a clear reference widget */}
            <span
              className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md text-[11px] leading-snug tabular-nums"
              style={history
                ? { color: '#22D3EE', background: 'rgba(62,224,255,0.08)', border: '1px solid rgba(62,224,255,0.28)' }
                : { color: '#8B97B2', background: 'rgba(139,151,178,0.07)', border: '1px solid rgba(139,151,178,0.2)' }}
            >
              <History className="w-3 h-3 shrink-0" aria-hidden="true" />
              {history
                ? <>Prev {fmtKg(Math.max(...history.sets.map((s) => s.weightKg)))}kg × {history.sets.map((s) => s.reps).join(', ')} · {fmtDate(history.date)}</>
                : 'No history in this era yet'}
            </span>
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
            <p className="text-xs leading-snug flex items-center gap-1" style={{ color: '#F5C15A' }}>
              <Target className="w-3 h-3 shrink-0" aria-hidden="true" /> Next: {exercise.targetNext}
            </p>
          )}
        </div>
      )}

      {/* ── Set rows ── */}
      {showBody && (
        <div className="mt-2 border-t border-white/[0.06] pt-1.5 space-y-0.5">
          {exercise.sets.map((s, i) => (
            <SetEditorRow
              key={i}
              index={i}
              set={s}
              active={activeSet === i}
              timed={isTimedExercise(exercise.name)}
              onActivate={() => setActiveSet((cur) => (cur === i ? null : i))}
              onChange={(patch) => onUpdateSet(i, patch)}
              onRemove={() => { setActiveSet(null); onRemoveSet(i) }}
              onSplit={s.pairId ? undefined : () => onSplitSet(i)}
              onToggleLink={s.pairId ? () => onToggleLink(s.pairId!) : undefined}
              onMerge={s.pairId ? () => onMergeSet(s.pairId!) : undefined}
            />
          ))}
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
