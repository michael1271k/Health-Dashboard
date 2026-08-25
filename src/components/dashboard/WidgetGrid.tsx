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
import { AnimatePresence, m } from 'framer-motion'
import { Check, Minus, Plus } from 'lucide-react'
import { STANDARD, SNAPPY } from '@/lib/motion/springs'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'
import { tapLight } from '@/lib/native/haptics'
import {
  readLayout, writeLayout, defaultLayout, SIZE_SPAN, SIZE_CYCLE, WIDGET_META,
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
 * come to feel like two apps.
 *
 * `rectSortingStrategy`, not `verticalListSortingStrategy`: this is a 2-D grid,
 * and the vertical strategy assumes one column.
 *
 * ── THERE IS NO "ARRANGE" BUTTON ─────────────────────────────────────────────
 * There was one, in the header, and it was the wrong shape twice over. It was a
 * permanent control for a thing done roughly twice a year, and it announced a
 * mode the platform has taught everybody to enter by *doing* it: on iOS you
 * press and hold the home screen. So the button is gone and the gesture is the
 * whole entry point — press and hold any tile.
 *
 * `delay: 450`, NOT the exercise deck's 250. The deck's tiles have no tap
 * action worth protecting, so a short delay there costs nothing. Here a tap is
 * the PRIMARY action — it opens the domain sheet — and a deliberate, unhurried
 * tap on a phone routinely lasts 250-350ms. At 250 the dashboard would drop
 * into edit mode while the user was trying to read their sleep. 450 is roughly
 * what iOS itself waits for, and is comfortably past the slowest ordinary tap.
 *
 * dnd-kit's delay constraint activates the drag once the delay elapses even if
 * the pointer never moved, so the press alone lifts the tile and opens the
 * mode; `tolerance: 8` means a scroll that starts on a tile aborts it instead.
 *
 * Exit is `Done`, or Escape on a keyboard. Both restore taps immediately.
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

  // Escape is the keyboard's Done. Bound only while the mode is open, so the
  // dashboard does not hold a global listener for a state it is almost never in.
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditing(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 450, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const visible = layout.order.filter((id) => !layout.hidden.includes(id))
  const hidden = layout.order.filter((id) => layout.hidden.includes(id))

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

  const hide = (id: WidgetId) => {
    void tapLight()
    commit({ ...layout, hidden: [...layout.hidden, id] })
  }

  /** Restore a hidden widget. It comes back where it was, not at the end — the
   *  order array never lost it, only the `hidden` set did. */
  const show = (id: WidgetId) => {
    void tapLight()
    commit({ ...layout, hidden: layout.hidden.filter((h) => h !== id) })
  }

  return (
    <div className="space-y-2">
      {/* The mode's only permanent chrome, and it exists only while the mode
          does. Sticky so Done is reachable without scrolling back up from the
          bottom of a twelve-tile grid. */}
      <AnimatePresence initial={false}>
        {editing && (
          <m.div
            initial={reduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={reduced ? { duration: 0 } : SNAPPY}
            className="sticky top-1 z-20 flex items-center gap-2 px-1"
          >
            <span className="text-[10px] text-muted leading-tight">
              Drag to reorder · tap the badge to resize
            </span>
            <button
              type="button"
              onClick={() => { void tapLight(); setEditing(false) }}
              className="ml-auto inline-flex items-center gap-1.5 min-h-[32px] px-3 rounded-full
                         text-[11px] font-bold bg-white/10 border border-white/20 text-text backdrop-blur-md"
            >
              <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" /> Done
            </button>
          </m.div>
        )}
      </AnimatePresence>

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
              dashboard for you. If an arrangement makes a hole, closing it is
              the user's call.

              `auto-rows-[minmax(52px,auto)]` with 2/3/5-row spans: the unit is
              half a tile, which is what lets medium be 172px (iOS's own medium
              proportion at this width) WITHOUT dragging small down with it —
              see the note on `SIZE_SPAN`. 52px is a floor, not a fixed height,
              so a row can still grow if a body genuinely needs it. */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 auto-rows-[minmax(52px,auto)]">
            {visible.map((id) => (
              <SortableWidget
                key={id}
                id={id}
                size={layout.size[id]}
                editing={editing}
                reduced={reduced}
                onResize={() => resize(id)}
                onHide={() => hide(id)}
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

      {/* ── THE TRAY ──
          Hiding a widget has to be reversible somewhere the user can find, and
          a hidden widget is by definition not on the grid to tap. It renders
          only in edit mode and only when something is actually hidden, so the
          dashboard carries no permanent "0 hidden" row. */}
      <AnimatePresence initial={false}>
        {editing && hidden.length > 0 && (
          <m.div
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={reduced ? { duration: 0 } : STANDARD}
            className="overflow-hidden"
          >
            <div className="pt-1">
              <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted px-1 pb-1.5">
                Hidden · {hidden.length}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {hidden.map((id) => {
                  const meta = WIDGET_META[id]
                  const Icon = meta.icon
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => show(id)}
                      className="inline-flex items-center gap-1.5 min-h-[34px] pl-2 pr-2.5 rounded-xl
                                 text-[11px] font-bold border active:scale-95 transition-transform"
                      style={{
                        borderColor: `${meta.accent}3d`,
                        background: `${meta.accent}12`,
                        color: meta.accent,
                      }}
                      aria-label={`Add ${meta.label} back to the dashboard`}
                    >
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      {meta.label}
                      <Plus className="w-3 h-3 opacity-70" strokeWidth={3} aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const SIZE_WORD: Record<WidgetSize, string> = { s: 'S', m: 'M', l: 'L' }

function SortableWidget({ id, size, editing, reduced, onResize, onHide, children }: {
  id: WidgetId
  size: WidgetSize
  editing: boolean
  reduced: boolean
  onResize: () => void
  onHide: () => void
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

      {/* ── THE TAP SHIELD ──
          In edit mode a tap must arrange, never navigate. Without this, tapping
          a tile to nudge it opens the Sleep sheet over the grid you are editing.
          It is a transparent sibling rather than `pointer-events-none` on the
          body, because the body's OWN controls (Cardio's repeat, Train's log
          link) must be blocked too — and because the drag listeners live on this
          parent, so swallowing the click here does not cost the gesture. */}
      {editing && (
        <span
          className="absolute inset-0 z-[1] rounded-2xl"
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
          aria-hidden="true"
        />
      )}

      {/* Arrange mode's two controls. No jiggle: a 1.02 lift and a brightened
          edge say "these are movable" without turning the dashboard into a
          cartoon, and the drag itself is the real affordance.

          `−` and not `×`: this removes the tile from the grid, it does not
          delete anything, and the tray one scroll below puts it back. */}
      {editing && (
        <>
          <m.button
            type="button"
            onClick={(e) => { e.stopPropagation(); onHide() }}
            onPointerDown={(e) => e.stopPropagation()}
            initial={reduced ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduced ? { duration: 0 } : SNAPPY}
            className="absolute top-1.5 left-1.5 z-[2] h-6 w-6 grid place-items-center rounded-full
                       bg-black/70 border border-white/20 text-text backdrop-blur-sm"
            aria-label={`Hide the ${WIDGET_META[id].label} widget`}
          >
            <Minus className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
          </m.button>

          <m.button
            type="button"
            onClick={(e) => { e.stopPropagation(); onResize() }}
            onPointerDown={(e) => e.stopPropagation()}
            initial={reduced ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduced ? { duration: 0 } : SNAPPY}
            className="absolute top-1.5 right-1.5 z-[2] h-6 min-w-[24px] px-1.5 rounded-lg text-[10px] font-bold
                       bg-black/70 border border-white/20 text-text backdrop-blur-sm"
            aria-label={`Resize ${WIDGET_META[id].label} — currently ${SIZE_WORD[size]}`}
          >
            {SIZE_WORD[size]}
          </m.button>
        </>
      )}
    </m.div>
  )
}
