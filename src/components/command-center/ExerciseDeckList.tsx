'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { Footprints } from 'lucide-react'
import { ExerciseCard, CARDIO_VIOLET, type ReadyCue } from './ExerciseCard'
import { tapLight } from '@/lib/native/haptics'
import type { SessionDraft, DraftSet } from '@/lib/sessions/draft'
import type { ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'
import type { PrAxis } from '@/lib/training/prEngine'

/** Module-level so the array identity never changes — see the note on `ids`. */
const DRAG_MODIFIERS = [restrictToVerticalAxis, restrictToParentElement]

/**
 * The sortable exercise deck. Long-press (250 ms) lifts a card on touch so
 * dragging never fights page scroll; the grip handle is the only activator,
 * and keyboard users reorder with space + arrows (dnd-kit sortable defaults).
 * Stays a SINGLE column at every breakpoint — verticalListSortingStrategy +
 * restrictToVerticalAxis are only valid for a one-column list.
 */
export function ExerciseDeckList({ draft, history, livePrs, readyByName, onReorder, onUpdateSet, onSplitSet, onMergeSet, onAddSet, onRemoveSet, onToggleDone, onCheckAll, onRemoveExercise, onSetNote, onPrTap, onUpdateCardio, onAddCardio }: {
  draft: SessionDraft
  history: Map<string, ExerciseHistory> | undefined
  /** Live records keyed `${localId}|${setIdx}` — see `computeLivePrs`. */
  livePrs?: Map<string, PrAxis[]>
  /** Forward-carried progression cues, keyed by exercise name. */
  readyByName?: Map<string, ReadyCue>
  onReorder: (orderedIds: string[]) => void
  onUpdateSet: (localId: string, setIdx: number, patch: Partial<DraftSet>) => void
  onSplitSet: (localId: string, setIdx: number) => void
  onMergeSet: (localId: string, pairId: string) => void
  onAddSet: (localId: string) => void
  onRemoveSet: (localId: string, setIdx: number) => void
  onToggleDone: (localId: string, setIdx: number) => void
  onCheckAll: (localId: string) => void
  onRemoveExercise: (localId: string) => void
  onSetNote: (localId: string, note: string) => void
  /** Tapping a set's trophy strip — opens the record sheet for that set. */
  onPrTap?: (localId: string, setIdx: number) => void
  /** Cardio blocks only: edit distance / duration. */
  onUpdateCardio?: (localId: string, patch: { distanceKm?: number; durationSec?: number }) => void
  /** Append a cardio block to the deck. */
  onAddCardio?: (name?: string) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Hevy-style reorder clarity: the moment a drag lifts, collapse EVERY card to
  // its header row so the whole session is visible at once; drop restores them.
  const [reordering, setReordering] = useState(false)

  /*
   * ── THESE MUST KEEP THEIR IDENTITY, OR memo(ExerciseCard) IS POINTLESS ─────
   * `items` was `draft.exercises.map(…)` inline — a new array every render.
   * SortableContext memoizes its context value on `items`, so a fresh array
   * republished the context, and CONTEXT PROPAGATION BYPASSES memo: all six
   * `useSortable` consumers re-rendered no matter how stable their props were.
   * Memoizing the card alone changed nothing (measured: 2.585 ms, unmoved).
   *
   * The id list only changes when an exercise is added, removed or reordered,
   * so it is derived from a join key rather than from the array identity —
   * `draft.exercises` is itself rebuilt on every keystroke by the reducer.
   */
  const idKey = draft.exercises.map((ex) => ex.localId).join('|')
  const ids = useMemo(() => (idKey ? idKey.split('|') : []), [idKey])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setReordering(false)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    void tapLight()
    onReorder(arrayMove(ids, from, to))
  }, [ids, onReorder])

  const handleDragStart = useCallback(() => { setReordering(true); void tapLight() }, [])
  const handleDragCancel = useCallback(() => setReordering(false), [])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={DRAG_MODIFIERS}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {/* Every handler below is passed through UNWRAPPED. They are the
            store's own useCallback handlers, stable for the session. The ten
            arrows that used to bind `ex.localId` here were rebuilt on every
            render, which changed all ten props on every keystroke and was the
            reason memo(ExerciseCard) could not hold. The card knows its own
            id and binds it itself. */}
        <div className="space-y-2">
          {draft.exercises.map((ex) => (
            <ExerciseCard
              key={ex.localId}
              exercise={ex}
              history={history?.get(ex.name) ?? null}
              livePrs={livePrs}
              dayKey={draft.dayKey}
              ready={readyByName?.get(ex.name) ?? null}
              collapsed={reordering}
              onUpdateSet={onUpdateSet}
              onSplitSet={onSplitSet}
              onMergeSet={onMergeSet}
              onAddSet={onAddSet}
              onRemoveSet={onRemoveSet}
              onToggleDone={onToggleDone}
              onCheckAll={onCheckAll}
              onRemoveExercise={onRemoveExercise}
              onSetNote={onSetNote}
              onPrTap={onPrTap}
              onUpdateCardio={onUpdateCardio}
            />
          ))}
        </div>
      </SortableContext>

      {/* ── Add a cardio block ──
          Cardio is a first-class deck entry, not a fixed warm-up slot. The only
          one that existed was the Treadmill card the template prepends, so a
          finisher had nowhere to go and ended up typed into the notes box. A new
          block lands at the end and drags anywhere — the sort strategy already
          covers it, because a cardio card has always been a sortable. */}
      {onAddCardio && (
        <button
          type="button"
          onClick={() => onAddCardio()}
          className="mt-2 w-full min-h-[38px] rounded-xl border border-dashed text-xs font-medium
                     flex items-center justify-center gap-1.5 transition-colors active:scale-[0.99]"
          style={{ color: CARDIO_VIOLET, borderColor: `${CARDIO_VIOLET}4d` }}
        >
          <Footprints className="w-3.5 h-3.5" aria-hidden="true" /> Add cardio
        </button>
      )}
    </DndContext>
  )
}
