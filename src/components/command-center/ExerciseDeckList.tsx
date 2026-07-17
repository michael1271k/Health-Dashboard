'use client'

import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { ExerciseCard } from './ExerciseCard'
import { tapLight } from '@/lib/native/haptics'
import type { SessionDraft, DraftSet } from '@/lib/sessions/draft'
import type { ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'

/**
 * The sortable exercise deck. Long-press (250 ms) lifts a card on touch so
 * dragging never fights page scroll; the grip handle is the only activator,
 * and keyboard users reorder with space + arrows (dnd-kit sortable defaults).
 * Stays a SINGLE column at every breakpoint — verticalListSortingStrategy +
 * restrictToVerticalAxis are only valid for a one-column list.
 */
export function ExerciseDeckList({ draft, history, onReorder, onUpdateSet, onAddSet, onRemoveSet, onRemoveExercise, onSetNote }: {
  draft: SessionDraft
  history: Map<string, ExerciseHistory> | undefined
  onReorder: (orderedIds: string[]) => void
  onUpdateSet: (localId: string, setIdx: number, patch: Partial<DraftSet>) => void
  onAddSet: (localId: string) => void
  onRemoveSet: (localId: string, setIdx: number) => void
  onRemoveExercise: (localId: string) => void
  onSetNote: (localId: string, note: string) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ids = draft.exercises.map((ex) => ex.localId)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    void tapLight()
    onReorder(arrayMove(ids, from, to))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-2.5">
          {draft.exercises.map((ex) => (
            <ExerciseCard
              key={ex.localId}
              exercise={ex}
              history={history?.get(ex.name) ?? null}
              onUpdateSet={(i, patch) => onUpdateSet(ex.localId, i, patch)}
              onAddSet={() => onAddSet(ex.localId)}
              onRemoveSet={(i) => onRemoveSet(ex.localId, i)}
              onRemoveExercise={() => onRemoveExercise(ex.localId)}
              onSetNote={(note) => onSetNote(ex.localId, note)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
