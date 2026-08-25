'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, MeasuringStrategy,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { m } from 'framer-motion'
import { Check, LayoutGrid } from 'lucide-react'
import { STANDARD, SNAPPY } from '@/lib/motion/springs'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'
import { tapLight } from '@/lib/native/haptics'
import {
  readLayout, writeLayout, defaultLayout, SIZE_SPAN, SIZE_CYCLE,
  type DashboardLayout, type WidgetId, type WidgetSize,
} from '@/lib/dashboard/layout'

/**
 * The arrangeable dashboard.
 *
 * ── WHY dnd-kit AND NOT A GRID LIBRARY ───────────────────────────────────────
 * react-grid-layout solves a harder problem than this one — arbitrary
 * pixel-resizable panels with collision resolution — with a mouse-first
 * interaction model and its own animation system. This app already drags things
 * (`ExerciseDeckList`, `WeekScheduler`) with dnd-kit, using a long-press sensor
 * tuned for thumbs, and a second drag vocabulary in one app is how two surfaces
 * come to feel like two apps. The sensor configuration here is deliberately the
 * same one the exercise deck uses.
 *
 * `rectSortingStrategy`, not `verticalListSortingStrategy`: this is a 2-D grid,
 * and the vertical strategy assumes one column.
 *
 * ── ARRANGE MODE IS ENTERED BY DOING IT ──────────────────────────────────────
 * A long press starts a drag (250ms, 8px tolerance) and a drag turns arrange
 * mode on — the iOS gesture, where you do not first announce that you intend to
 * rearrange. A short tap is under the delay, so it still opens the widget.
 * There is an explicit Arrange button too, because a gesture nobody performs is
 * a feature nobody has.
 */
export function WidgetGrid({ children }: {
  /** Render one widget for an id, given the size it is currently set to. */
  children: (id: WidgetId, size: WidgetSize) => React.ReactNode
}) {
  // Read AFTER mount. `readLayout` touches localStorage, so seeding state from
  // it directly would render different markup on the server and hydrate wrong.
  const [layout, setLayout] = useState<DashboardLayout>(defaultLayout)
  useEffect(() => { setLayout(readLayout()) }, [])

  const [editing, setEditing] = useState(false)
  const [dragging, setDragging] = useState<WidgetId | null>(null)
  const reduced = useHelixReducedMotion()

  const commit = useCallback((next: DashboardLayout) => {
    setLayout(next)
    writeLayout(next)
  }, [])

  const sensors = useSensors(
    // The exact constraint the exercise deck uses: long enough that a scroll
    // never lifts a widget, short enough that a deliberate press feels answered.
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const visible = layout.order.filter((id) => !layout.hidden.includes(id))

  const onDragStart = (e: DragStartEvent) => {
    setDragging(e.active.id as WidgetId)
    setEditing(true)
    void tapLight()
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = layout.order.indexOf(active.id as WidgetId)
    const to = layout.order.indexOf(over.id as WidgetId)
    if (from < 0 || to < 0) return
    commit({ ...layout, order: arrayMove(layout.order, from, to) })
  }

  const resize = (id: WidgetId) => {
    void tapLight()
    commit({ ...layout, size: { ...layout.size, [id]: SIZE_CYCLE[layout.size[id]] } })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end px-1">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted hover:text-text flex items-center gap-1.5 min-h-[32px] px-1"
        >
          {editing
            ? <><Check className="w-3.5 h-3.5" aria-hidden="true" /> Done</>
            : <><LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" /> Arrange</>}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToParentElement]}
        // `Always`, not the default `WhileDragging`: droppables are measured once
        // at lift by default, and a grid that reflows as items move needs the
        // measurements to follow it.
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <SortableContext items={visible} strategy={rectSortingStrategy}>
          {/* ── NO `grid-auto-flow: dense`, DELIBERATELY ──
              Dense backfills a hole left by a wide tile with a later small one,
              which means a widget can appear ABOVE something it was arranged
              below. On a surface whose whole promise is that the tile you reach
              for is where you left it, that is the browser rearranging your
              dashboard for you. The default sizes pair evenly on two columns so
              no hole exists to backfill, and if an arrangement makes one, moving
              a tile is the user's call.

              `auto-rows-[minmax(104px,auto)]`: 104px is the FLOOR, so a medium
              tile is two of those plus the gap and can still grow if a body
              needs the room rather than clipping it. */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 auto-rows-[minmax(104px,auto)]">
            {visible.map((id) => (
              <SortableWidget
                key={id}
                id={id}
                size={layout.size[id]}
                editing={editing}
                reduced={reduced}
                onResize={() => resize(id)}
              >
                {children(id, layout.size[id])}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>

        {/* The lifted widget follows the finger above the reflow, so the grid
            can settle underneath without the thing you are holding jumping. */}
        <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
          {dragging ? (
            <div className="h-full opacity-95 rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
              {children(dragging, layout.size[dragging])}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

const SIZE_WORD: Record<WidgetSize, string> = { s: 'S', m: 'M', l: 'L' }

function SortableWidget({ id, size, editing, reduced, onResize, children }: {
  id: WidgetId
  size: WidgetSize
  editing: boolean
  reduced: boolean
  onResize: () => void
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <m.div
      ref={setNodeRef}
      // dnd-kit's own transform during the drag; framer's spring for the reflow
      // of everything else. `STANDARD` is critically damped — the tiles that
      // move to make room were not thrown, so they must not overshoot.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      animate={editing && !isDragging && !reduced ? { scale: 1.02 } : { scale: 1 }}
      transition={reduced ? { duration: 0 } : STANDARD}
      className={`${SIZE_SPAN[size]} relative min-w-0 ${isDragging ? 'opacity-30' : ''}`}
      {...attributes}
      {...listeners}
    >
      {children}

      {/* Arrange mode's only added control. No jiggle: a 1.02 lift and a
          brightened edge say "these are movable" without turning the dashboard
          into a cartoon, and the drag itself is the real affordance. */}
      {editing && (
        <m.button
          type="button"
          onClick={(e) => { e.stopPropagation(); onResize() }}
          onPointerDown={(e) => e.stopPropagation()}
          initial={reduced ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduced ? { duration: 0 } : SNAPPY}
          className="absolute top-1.5 right-1.5 h-6 min-w-[24px] px-1.5 rounded-lg text-[10px] font-bold
                     bg-black/60 border border-white/20 text-text backdrop-blur-sm"
          aria-label={`Resize ${id} widget — currently ${SIZE_WORD[size]}`}
        >
          {SIZE_WORD[size]}
        </m.button>
      )}
    </m.div>
  )
}
