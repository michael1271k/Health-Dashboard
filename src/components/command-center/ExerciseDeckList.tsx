'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  defaultDropAnimationSideEffects, MeasuringStrategy,
  type DragEndEvent, type DragStartEvent, type DropAnimation,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { ExerciseCard, type ReadyCue } from './ExerciseCard'
import type { ReportTargets } from '@/lib/reports/fmtV2'
import { tapLight, tapSuccess } from '@/lib/native/haptics'
import { useHelixReducedMotion } from '@/lib/motion'
import type { SessionDraft, DraftSet } from '@/lib/sessions/draft'
import type { ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'
import type { PrAxis } from '@/lib/training/prEngine'
import { exerciseColor } from '@/lib/theme/muscleHue'
import { GRAPHITE } from '@/lib/theme/palette'
import { CARDIO_VIOLET } from './ExerciseCard'

/**
 * Module-level so the array identity never changes — see the note on `ids`.
 *
 * `restrictToParentElement` USED to be here as well, and it was part of the
 * problem: it clamps the dragged element to a parent whose height was changing
 * mid-gesture (every card collapsed on lift), so the card fought a boundary that
 * was moving. With the lifted card in a portal there is nothing to clamp it to
 * and nothing that needs clamping.
 */
const DRAG_MODIFIERS = [restrictToVerticalAxis]

/**
 * ── RE-MEASURE EVERY FRAME OF A DRAG ────────────────────────────────────────
 * dnd-kit's default (`WhileDragging`) measures the droppables ONCE, at lift.
 * That is correct for a list whose geometry is fixed for the gesture, and wrong
 * the moment the list can change height mid-drag — which it now can, because
 * every card that is not in the air folds to its header (see `dragCollapsed` in
 * `ExerciseCard`). With a stale measurement the drop targets stay where the tall
 * cards used to be, so the card lands two slots from where you aimed it. That
 * exact failure is what made the FIRST attempt at a drag-collapse feel broken;
 * measuring always is what makes this one safe.
 */
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } }

/**
 * The drop is the one moment bounce is EARNED — the card was physically thrown
 * at a slot and arrives with momentum. `SNAPPY`'s curve, expressed as the cubic
 * bézier dnd-kit's drop animation can take.
 */
const DROP_ANIMATION: DropAnimation = {
  duration: 260,
  easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.4' } },
  }),
}

/**
 * The sortable exercise deck. Long-press (250 ms) lifts a card on touch so
 * dragging never fights page scroll; the grip handle is the only activator,
 * and keyboard users reorder with space + arrows (dnd-kit sortable defaults).
 * Stays a SINGLE column at every breakpoint — verticalListSortingStrategy +
 * restrictToVerticalAxis are only valid for a one-column list.
 *
 * ── WHY REORDERING USED TO FEEL BROKEN ───────────────────────────────────────
 * Four causes, and the first is the one you could feel:
 *
 *   1. EVERY CARD COLLAPSED THE INSTANT A DRAG LIFTED. The idea was clarity —
 *      see the whole session at once — but it changes the list's total height
 *      and every sibling's position under a finger that has already committed
 *      to a gesture. The card you grabbed jumps, the drop targets are somewhere
 *      new, and the whole thing reads as the app fighting you. Gone.
 *   2. NO `DragOverlay`. The lifted card was transformed in place, inside the
 *      list's own stacking context, so it needed a hand-written `z-10` and
 *      still could not paint cleanly above its neighbours.
 *   3. `restrictToParentElement`, clamping against the parent that (1) was
 *      resizing.
 *   4. `useSortable`'s default transition is `250ms linear` — the one easing
 *      curve that never occurs in the physical world, so the siblings shuffled
 *      like a spreadsheet rather than settling like objects.
 *
 * Now: the lifted card rides in a portal above everything, the siblings ease
 * with the house curve, and the drop carries the small bounce a thrown object
 * has earned. Under `prefers-reduced-motion` the travel drops out and the drop
 * is instant.
 *
 * ── AND THE COLLAPSE IS BACK, ON DIFFERENT TERMS (2026-08-23) ────────────────
 * Cause (1) above is now a FEATURE, because the two things that made it a bug
 * are gone. The card you grabbed can no longer jump — it is in the overlay, not
 * in the list — and the drop targets can no longer go stale, because
 * `MEASURING` re-measures every frame. What is left is the thing the original
 * idea was after: on a ten-exercise deck the whole session collapses to one
 * screen, so dragging the first lift to the end is a short movement instead of
 * a multi-second autoscroll with no view of the destination. The physics is
 * untouched — same sensor, same modifiers, same drop curve.
 */
export function ExerciseDeckList({ draft, history, globalHistory, livePrs, readyByName, reportTargets, onReorder, onUpdateSet, onSplitSet, onMergeSet, onAddSet, onRemoveSet, onToggleDone, onRemoveExercise, onSetNote, onPrTap, onUpdateCardio }: {
  draft: SessionDraft
  history: Map<string, ExerciseHistory> | undefined
  /** Unscoped memory — the last time this movement was done in ANY routine. */
  globalHistory?: Map<string, ExerciseHistory>
  /** Live records keyed `${localId}|${setIdx}` — see `computeLivePrs`. */
  livePrs?: Map<string, PrAxis[]>
  /** Forward-carried progression cues, keyed by exercise name. */
  readyByName?: Map<string, ReadyCue>
  /** What the last pasted report prescribed, resolved per card by name. */
  reportTargets?: ReportTargets | null
  onReorder: (orderedIds: string[]) => void
  onUpdateSet: (localId: string, setIdx: number, patch: Partial<DraftSet>) => void
  onSplitSet: (localId: string, setIdx: number) => void
  onMergeSet: (localId: string, pairId: string) => void
  onAddSet: (localId: string) => void
  onRemoveSet: (localId: string, setIdx: number) => void
  onToggleDone: (localId: string, setIdx: number) => void
  onRemoveExercise: (localId: string) => void
  onSetNote: (localId: string, note: string) => void
  /** Tapping a set that holds a record — opens the record sheet for that set. */
  onPrTap?: (localId: string, setIdx: number) => void
  /** Cardio blocks only: edit distance / duration / incline. */
  onUpdateCardio?: (localId: string, patch: { distanceKm?: number; durationSec?: number; inclinePct?: number }) => void
}) {
  const reduced = useHelixReducedMotion()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /** Which card is in the air — it draws in the overlay, not in the list. */
  const [dragId, setDragId] = useState<string | null>(null)

  /*
   * ── THESE MUST KEEP THEIR IDENTITY, OR memo(ExerciseCard) IS POINTLESS ─────
   * `items` was `draft.exercises.map(…)` inline — a new array every render.
   * SortableContext memoizes its context value on `items`, so a fresh array
   * republished the context, and CONTEXT PROPAGATION BYPASSES memo: all six
   * `useSortable` consumers re-rendered no matter how stable their props were.
   *
   * The id list only changes when an exercise is added, removed or reordered,
   * so it is derived from a join key rather than from the array identity —
   * `draft.exercises` is itself rebuilt on every keystroke by the reducer.
   */
  const idKey = draft.exercises.map((ex) => ex.localId).join('|')
  const ids = useMemo(() => (idKey ? idKey.split('|') : []), [idKey])

  const dragging = useMemo(
    () => draft.exercises.find((ex) => ex.localId === dragId) ?? null,
    [draft.exercises, dragId],
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    // The move landed. A distinct haptic from the lift, because they are
    // different events and one of them changed your session.
    void tapSuccess()
    onReorder(arrayMove(ids, from, to))
  }, [ids, onReorder])

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setDragId(String(e.active.id))
    void tapLight()
  }, [])
  const handleDragCancel = useCallback(() => setDragId(null), [])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={DRAG_MODIFIERS}
      // A deck is taller than the viewport by the third exercise, so a drag has
      // to be able to reach the end of it without letting go.
      autoScroll={{ threshold: { x: 0, y: 0.2 } }}
      measuring={MEASURING}
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
              globalHistory={globalHistory?.get(ex.name) ?? null}
              livePrs={livePrs}
              dayKey={draft.dayKey}
              // The session's own date. A rest target edited in the logger belongs
              // to THIS session, and `save.ts` allows one session per date, so
              // the date is the session id this layer can have before commit.
              dateISO={draft.date}
              ready={readyByName?.get(ex.name) ?? null}
              reportTargets={reportTargets}
              reducedMotion={reduced}
              // Every card BUT the one in the air folds while a drag is live —
              // see the long note on `dragCollapsed`. The dragged card's own
              // in-list ghost folds too: it is at 0.4 opacity behind the
              // overlay, and leaving it full height would defeat the point.
              dragCollapsed={dragId != null}
              onUpdateSet={onUpdateSet}
              onSplitSet={onSplitSet}
              onMergeSet={onMergeSet}
              onAddSet={onAddSet}
              onRemoveSet={onRemoveSet}
              onToggleDone={onToggleDone}
              onRemoveExercise={onRemoveExercise}
              onSetNote={onSetNote}
              onPrTap={onPrTap}
              onUpdateCardio={onUpdateCardio}
            />
          ))}
        </div>
      </SortableContext>

      {/* ── The card in the air ──
          A PORTAL, which is the whole point: it escapes the list's stacking and
          overflow context, so it paints above every sibling without a
          hand-written z-index and cannot be clipped by the scroller it came out
          of. What it renders is deliberately NOT the full card — a card with
          twenty-four live set rows following a finger is work per frame for a
          picture nobody can read while it moves. It is the header: the name, the
          hue rule that identifies it, and the set count. */}
      <DragOverlay dropAnimation={reduced ? null : DROP_ANIMATION} modifiers={DRAG_MODIFIERS}>
        {dragging ? (
          <div
            className="rounded-r-xl border-y border-r border-white/[0.10] px-3 py-3
                       shadow-[0_16px_48px_rgba(0,0,0,0.6)] cursor-grabbing"
            style={{
              // OPAQUE, not the deck's `bg-white/[0.02]`. This floats above the
              // list, and a translucent card in the air shows the cards it is
              // passing over straight through itself.
              background: GRAPHITE,
              borderLeft: `3px solid ${dragging.kind === 'cardio'
                ? CARDIO_VIOLET
                : exerciseColor(dragging.name, dragging.muscleGroups)}`,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text leading-snug truncate"
                style={{ fontSize: 'var(--text-exercise-title)' }}>
                {dragging.name}
              </span>
              <span className="ml-auto shrink-0 helix-num text-[11px] text-muted tabular-nums">
                {dragging.sets.length || '—'} {dragging.sets.length === 1 ? 'set' : 'sets'}
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>

      {/* ── NO "Add cardio" BUTTON ──
          It sat under every deck, on every training day, to serve the rare
          finisher — and cardio has its own logger on the day surface, which is
          where a walk or a bike actually gets recorded. A permanent button for
          an occasional action, one tap from the last set you are trying to
          finish, is a mis-tap waiting to happen. Cardio blocks that arrive from
          a TEMPLATE still render and still edit; only the manual entry point is
          gone from here. */}
    </DndContext>
  )
}
