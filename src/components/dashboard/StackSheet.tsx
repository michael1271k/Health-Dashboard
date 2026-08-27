'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, MeasuringStrategy,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Minus, Layers, Unlink } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { tapLight, tapSuccess } from '@/lib/native/haptics'
import { WIDGET_META, type StackSlot } from '@/lib/dashboard/layout'

/** Module-level: a fresh array each render would re-run dnd-kit's modifier setup. */
const MODIFIERS = [restrictToVerticalAxis]
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } }

/**
 * What is inside one stack, and the two things you can do to it.
 *
 * ── WHY A SHEET AND NOT MORE BADGES ON THE TILE ──────────────────────────────
 * A stack of five is five faces behind one 175×112 tile, and every affordance
 * for managing them has to fit in the same corners that already hold remove,
 * unstack and resize. The tile can express "which face is up" — that is what the
 * dots are — and it cannot express an ORDER, because only one face is on screen
 * at a time. An order you cannot see is an order you cannot rearrange.
 *
 * So the tile keeps the glance and the sheet takes the editing, which is exactly
 * how iOS splits it: the widget shows one face, and "Edit Stack" opens a list.
 *
 * ── THE LIST IS THE STACK, TOP FACE FIRST ────────────────────────────────────
 * Row order IS `slot.items` order, so what the user drags is the thing the
 * gesture on the tile will step through. The face currently up is marked rather
 * than pulled to the top: moving it would mean the list reorders itself while
 * the stack rotates underneath, and a list that rearranges on a timer is not a
 * list anybody can aim at.
 *
 * ── AND WHY REMOVE AND UNSTACK ARE BOTH HERE ─────────────────────────────────
 * They are genuinely different and the difference is invisible from the tile:
 * unstacking gives the widget its OWN tile on the grid, removing takes it off
 * the grid entirely (and into the tray). One is "I want to see this by itself",
 * the other is "I do not want this". Offering only one of them is what forces
 * people to unstack-then-remove, or worse, to remove-then-hunt-the-tray.
 */
export function StackSheet({
  open, onClose, slot, face, onReorder, onUnstack, onRemove,
}: {
  open: boolean
  onClose: () => void
  /** Null once the stack has been emptied down to a single face — see below. */
  slot: StackSlot | null
  /** Which face the tile is showing, so the list can say so. */
  face: number
  onReorder: (from: number, to: number) => void
  onUnstack: (index: number) => void
  onRemove: (index: number) => void
}) {
  const [dragging, setDragging] = useState<string | null>(null)

  const sensors = useSensors(
    // 180ms, not the grid's 450: there is no tap action on these rows to
    // protect, so the only thing a long delay buys here is a list that feels
    // reluctant to be dragged.
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /**
   * Row ids are `index:widget`, not the widget id.
   *
   * A stack may hold the SAME widget twice — two Fuel faces is a legitimate
   * arrangement — and dnd-kit keys its sortable items by id. Two rows with the
   * id `fuel` would be one droppable as far as it is concerned, and dragging
   * either would move whichever it resolved first.
   */
  const ids = useMemo(() => (slot?.items ?? []).map((id, i) => `${i}:${id}`), [slot])

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setDragging(null)
    const from = ids.indexOf(String(e.active.id))
    const to = e.over ? ids.indexOf(String(e.over.id)) : -1
    if (from < 0 || to < 0 || from === to) return
    void tapSuccess()
    onReorder(from, to)
  }, [ids, onReorder])

  const onDragStart = useCallback((e: DragStartEvent) => {
    setDragging(String(e.active.id))
    void tapLight()
  }, [])

  const draggedIndex = dragging ? ids.indexOf(dragging) : -1
  const draggedId = draggedIndex >= 0 ? slot?.items[draggedIndex] ?? null : null

  return (
    <Sheet open={open} onClose={onClose} title="Edit Stack" accent={slot ? WIDGET_META[slot.items[Math.min(face, slot.items.length - 1)]].accent : undefined}>
      {slot && (
        <div className="space-y-2 pb-2">
          <p className="text-[10px] text-muted leading-snug px-0.5">
            Drag to reorder · swipe the tile to flip through them
          </p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={MODIFIERS}
            measuring={MEASURING}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragging(null)}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {slot.items.map((id, i) => (
                  <FaceRow
                    key={ids[i]}
                    rowId={ids[i]}
                    widget={id}
                    position={i}
                    total={slot.items.length}
                    showing={i === Math.min(face, slot.items.length - 1)}
                    onUnstack={() => { void tapLight(); onUnstack(i) }}
                    onRemove={() => { void tapLight(); onRemove(i) }}
                  />
                ))}
              </ul>
            </SortableContext>

            <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
              {draggedId ? (
                <div className="rounded-xl border px-2.5 py-2 flex items-center gap-2 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
                  style={{
                    borderColor: `${WIDGET_META[draggedId].accent}59`,
                    background: 'rgba(13,18,32,0.96)',
                  }}>
                  <GripVertical className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                  <span className="text-[12px] font-bold text-text">{WIDGET_META[draggedId].label}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}
    </Sheet>
  )
}

function FaceRow({ rowId, widget, position, total, showing, onUnstack, onRemove }: {
  rowId: string
  widget: keyof typeof WIDGET_META
  position: number
  total: number
  showing: boolean
  onUnstack: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rowId })
  const meta = WIDGET_META[widget]
  const Icon = meta.icon

  return (
    <li
      ref={setNodeRef}
      className={`rounded-xl border flex items-center gap-2 pl-1 pr-1.5 py-1.5 ${isDragging ? 'opacity-30' : ''}`}
      // The face on screen wears its own accent; the rest are inert, so the
      // list says which one the tile is showing without a second label.
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        borderColor: showing ? `${meta.accent}59` : 'rgba(255,255,255,0.08)',
        background: showing ? `${meta.accent}12` : 'rgba(255,255,255,0.02)',
      }}
    >
      {/* The handle is the ONLY activator. The row also carries two buttons, and
          a row that lifts from anywhere makes both of them a coin toss between
          a tap and a drag. */}
      <button
        type="button"
        className="h-8 w-6 grid place-items-center rounded-lg text-muted touch-none shrink-0"
        aria-label={`Reorder ${meta.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      <span className="flex h-[20px] w-[20px] items-center justify-center rounded-md shrink-0"
        style={{ background: `${meta.accent}1f`, color: meta.accent }}>
        <Icon className="w-3 h-3" aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1 flex items-baseline gap-1.5">
        <span className="text-[12px] font-bold text-text truncate">{meta.label}</span>
        <span className="helix-num text-[9px] tabular-nums text-muted shrink-0">{position + 1}/{total}</span>
        {showing && (
          <span className="text-[8px] font-bold uppercase tracking-[0.12em] shrink-0" style={{ color: meta.accent }}>
            On screen
          </span>
        )}
      </span>

      <button
        type="button"
        onClick={onUnstack}
        onPointerDown={(e) => e.stopPropagation()}
        className="h-8 w-8 grid place-items-center rounded-lg border border-white/10 bg-white/[0.03]
                   text-text active:scale-95 transition-transform shrink-0"
        aria-label={`Take ${meta.label} out of this stack and give it its own tile`}
      >
        <Unlink className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={onRemove}
        onPointerDown={(e) => e.stopPropagation()}
        className="h-8 w-8 grid place-items-center rounded-lg border border-danger/25 bg-danger/[0.06]
                   text-danger active:scale-95 transition-transform shrink-0"
        aria-label={`Remove ${meta.label} from the dashboard`}
      >
        <Minus className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
      </button>
    </li>
  )
}

/** The badge on a stacked tile that opens the sheet. Exported for the grid. */
export function StackBadge({ count, accent, onOpen }: {
  count: number
  accent: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); void tapLight(); onOpen() }}
      onPointerDown={(e) => e.stopPropagation()}
      className="h-6 min-w-[24px] px-1.5 grid place-items-center rounded-lg text-[10px] font-bold
                 bg-black/70 border border-white/20 text-text backdrop-blur-sm"
      style={{ color: accent }}
      aria-label={`Edit this stack — ${count} widgets`}
    >
      <span className="flex items-center gap-0.5">
        <Layers className="w-3 h-3" aria-hidden="true" />
        {count}
      </span>
    </button>
  )
}
