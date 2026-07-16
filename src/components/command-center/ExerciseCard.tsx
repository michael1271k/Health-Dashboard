'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, GripVertical, History, Plus, Target } from 'lucide-react'
import { SetEditorRow } from './SetEditorRow'
import type { DraftExercise, DraftSet } from '@/lib/sessions/draft'
import type { ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'

const STATUS_META: Record<NonNullable<DraftExercise['status']>, { label: string; color: string }> = {
  PR:       { label: 'PR',       color: '#E8C57A' },  // gold
  PROGRESS: { label: 'PROG ▲',   color: '#43F59B' },
  HOLD:     { label: 'HOLD',     color: '#8B97B2' },
  REGRESS:  { label: 'REGR ▼',   color: '#FF5470' },
  NEW:      { label: 'NEW',      color: '#3EE0FF' },
}

const fmtKg = (w: number) => (w % 1 === 0 ? w.toFixed(0) : w.toFixed(1))
const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * One exercise widget of the deck: dnd-kit sortable (drag from the grip only),
 * coach status chip, previous-session memory beside today's inputs, and the
 * per-set tuner rows. Collapsed shows a one-line summary.
 */
export function ExerciseCard({ exercise, live, history, onUpdateSet, onAddSet, onRemoveSet }: {
  exercise: DraftExercise
  live: boolean
  history: ExerciseHistory | null
  onUpdateSet: (setIdx: number, patch: Partial<DraftSet>) => void
  onAddSet: () => void
  onRemoveSet: (setIdx: number) => void
}) {
  const [open, setOpen] = useState(true)
  const [activeSet, setActiveSet] = useState<number | null>(null)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: exercise.localId })

  const status = exercise.status ? STATUS_META[exercise.status] : null
  const summary = exercise.sets.map((s) => s.reps).join('/')
  const topWeight = Math.max(...exercise.sets.map((s) => s.weightKg), 0)
  const doneCount = exercise.sets.filter((s) => s.done).length

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, willChange: isDragging ? 'transform' : undefined }}
      className={`helix-card !p-3 ${isDragging ? 'z-10 relative shadow-[0_12px_40px_rgba(0,0,0,0.55)] border-primary/30' : ''}`}
    >
      {/* ── Header: grip + name + status + collapse ── */}
      <div className="flex items-center gap-2">
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

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left min-h-[40px]"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-text leading-snug truncate">{exercise.name}</span>
              {status && (
                <span
                  className="shrink-0 inline-flex items-center px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: status.color, background: `${status.color}1f`, border: `1px solid ${status.color}55` }}
                >
                  {status.label}
                </span>
              )}
            </div>
            {/* Historical memory — previous session's full set list */}
            <span className="text-xs text-muted leading-snug flex items-center gap-1 mt-0.5">
              <History className="w-3 h-3 shrink-0 text-info" aria-hidden="true" />
              {history
                ? <>Prev: {fmtKg(Math.max(...history.sets.map((s) => s.weightKg)))}kg × {history.sets.map((s) => s.reps).join('/')} · {fmtDate(history.date)}</>
                : 'No history in this era yet'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="helix-num text-xs text-muted tabular-nums">
              {live ? `${doneCount}/${exercise.sets.length}` : `${fmtKg(topWeight)}kg × ${summary}`}
            </span>
            <ChevronDown className={`w-4 h-4 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </div>
        </button>
      </div>

      {/* ── Coach note + next-target ── */}
      {open && (exercise.note || exercise.targetNext) && (
        <div className="mt-2 ml-8 space-y-1">
          {exercise.note && <p className="text-xs text-muted leading-snug" dir="auto">{exercise.note}</p>}
          {exercise.targetNext && (
            <p className="text-xs leading-snug flex items-center gap-1" style={{ color: '#E8C57A' }}>
              <Target className="w-3 h-3 shrink-0" aria-hidden="true" /> Next: {exercise.targetNext}
            </p>
          )}
        </div>
      )}

      {/* ── Set rows ── */}
      {open && (
        <div className="mt-2.5 border-t border-white/[0.06] pt-2 space-y-1">
          {exercise.sets.map((s, i) => (
            <SetEditorRow
              key={i}
              index={i}
              set={s}
              live={live}
              active={activeSet === i}
              onActivate={() => setActiveSet((cur) => (cur === i ? null : i))}
              onChange={(patch) => onUpdateSet(i, patch)}
              onRemove={() => { setActiveSet(null); onRemoveSet(i) }}
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
