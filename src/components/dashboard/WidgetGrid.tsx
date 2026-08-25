'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, MeasuringStrategy,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { AnimatePresence, m } from 'framer-motion'
import { Check, Layers, Minus, Plus, Unlink } from 'lucide-react'
import { STANDARD, SNAPPY, CROSSFADE } from '@/lib/motion/springs'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'
import { tapLight, tapSuccess } from '@/lib/native/haptics'
import {
  readLayout, writeLayout, defaultLayout, SIZE_SPAN, WIDGET_META,
  hiddenWidgets, removeFace, addWidget, resizeSlot, moveSlot, canStack,
  stackSlots, unstackFace, slotAt, sizesFor,
  type DashboardLayout, type StackSlot, type WidgetId, type WidgetSize,
} from '@/lib/dashboard/layout'

/** How long a face stays up before a stack turns itself over. */
const ROTATE_MS = 12_000
/** How long you must hover a same-size tile mid-drag before it offers to stack. */
const MERGE_HOLD_MS = 600

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
 * `tolerance: 8` is also what keeps the stack's swipe gesture reachable: a
 * flick past 8px inside the delay window aborts the lift, so a vertical swipe
 * on a stack turns its faces over instead of picking the tile up.
 *
 * ── STACKING IS A HOVER-HOLD, THE WAY A FOLDER IS ────────────────────────────
 * A sortable grid reorders the instant you hover a neighbour, so "dropped ON"
 * and "dropped BETWEEN" are the same event and cannot be told apart by position
 * alone. iOS resolves exactly this ambiguity with time: drag an app over another
 * and hold, and after a beat the target opens into a folder. Same rule here —
 * hold over a tile OF THE SAME SIZE for 600ms and it lights up as a stack
 * target; release anywhere else and it is an ordinary reorder.
 *
 * Exit is `Done`, or Escape on a keyboard. Both restore taps immediately.
 */
export function WidgetGrid({ children }: {
  /** Render one widget for an id, given the size its slot is currently set to. */
  children: (id: WidgetId, size: WidgetSize) => React.ReactNode
}) {
  // Read AFTER mount. `readLayout` touches localStorage, so seeding state from
  // it directly would render different markup on the server and hydrate wrong.
  const [layout, setLayout] = useState<DashboardLayout>(defaultLayout)
  useEffect(() => { setLayout(readLayout()) }, [])

  const [editing, setEditing] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  /**
   * Which face each stack is currently showing, by slot id.
   *
   * It lives up here rather than inside the tile because the DRAG OVERLAY needs
   * it: the overlay is a second render of the tile you are holding, mounted
   * outside the grid, and without this it would draw face one while the tile
   * under your finger was showing face three. Slots that have never been turned
   * simply have no entry.
   */
  const [faces, setFaces] = useState<Record<string, number>>({})
  const setFace = useCallback((slotId: string, next: number | ((f: number) => number)) => {
    setFaces((prev) => {
      const at = prev[slotId] ?? 0
      return { ...prev, [slotId]: typeof next === 'function' ? next(at) : next }
    })
  }, [])
  const [mergeTarget, setMergeTarget] = useState<string | null>(null)
  const reduced = useHelixReducedMotion()

  // The hover clock. A ref, not state: it is written on every drag-over and
  // reading it must never schedule a render.
  const hover = useRef<{ id: string | null; timer: number | null }>({ id: null, timer: null })
  const clearHover = useCallback(() => {
    if (hover.current.timer != null) window.clearTimeout(hover.current.timer)
    hover.current = { id: null, timer: null }
  }, [])

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

  useEffect(() => clearHover, [clearHover])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 450, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const hidden = hiddenWidgets(layout)
  const slotIds = layout.slots.map((s) => s.id)

  const onDragStart = (e: DragStartEvent) => {
    setDragging(String(e.active.id))
    setEditing(true)
    void tapLight()
  }

  const onDragOver = (e: DragOverEvent) => {
    const overId = e.over ? String(e.over.id) : null
    if (overId === hover.current.id) return
    clearHover()
    setMergeTarget(null)
    if (!overId || overId === String(e.active.id)) return
    if (!canStack(slotAt(layout, String(e.active.id)), slotAt(layout, overId))) return
    hover.current.id = overId
    hover.current.timer = window.setTimeout(() => {
      setMergeTarget(overId)
      void tapLight()
    }, MERGE_HOLD_MS)
  }

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    const merging = mergeTarget
    clearHover()
    setDragging(null)
    setMergeTarget(null)
    if (!overId || overId === activeId) return
    if (merging === overId) {
      void tapSuccess()
      commit(stackSlots(layout, activeId, overId))
      return
    }
    commit(moveSlot(layout, activeId, overId))
  }

  // The rules themselves live in `layout.ts` and are tested there; these are
  // the gestures that reach for them.
  const resize = (slotId: string) => { void tapLight(); commit(resizeSlot(layout, slotId)) }
  const drop = (slotId: string, index: number) => { void tapLight(); commit(removeFace(layout, slotId, index)) }
  const split = (slotId: string, index: number) => { void tapLight(); commit(unstackFace(layout, slotId, index)) }
  const add = (id: WidgetId) => { void tapLight(); commit(addWidget(layout, id)) }

  const draggedSlot = dragging ? slotAt(layout, dragging) : null

  return (
    <div className="space-y-2">
      {/* The mode's only permanent chrome, and it exists only while the mode
          does. Sticky so Done is reachable without scrolling back up from the
          bottom of a fifteen-tile grid. */}
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
              Drag to reorder · hold over a tile to stack
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
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => { clearHover(); setDragging(null); setMergeTarget(null) }}
      >
        <SortableContext items={slotIds} strategy={rectSortingStrategy}>
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
              see the note on `SIZE_SPAN`. */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 auto-rows-[minmax(52px,auto)]">
            {layout.slots.map((slot) => (
              <SortableSlot
                key={slot.id}
                slot={slot}
                editing={editing}
                reduced={reduced}
                merging={mergeTarget === slot.id}
                face={Math.min(faces[slot.id] ?? 0, slot.items.length - 1)}
                onFace={setFace}
                onResize={() => resize(slot.id)}
                onDropFace={(i) => drop(slot.id, i)}
                onSplitFace={(i) => split(slot.id, i)}
              >
                {children}
              </SortableSlot>
            ))}
          </div>
        </SortableContext>

        {/* The lifted tile follows the finger above the reflow, so the grid can
            settle underneath without the thing you are holding jumping. */}
        <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
          {draggedSlot ? (
            <div className="h-full opacity-95 rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
              {children(
                draggedSlot.items[Math.min(faces[draggedSlot.id] ?? 0, draggedSlot.items.length - 1)],
                draggedSlot.size,
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ── THE TRAY ──
          Taking a widget off the grid has to be reversible somewhere the user
          can find, and a widget that is off the grid is by definition not on it
          to tap. It renders only in edit mode and only when something is
          missing, so the dashboard carries no permanent "0 hidden" row. */}
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
                Not on the grid · {hidden.length}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {hidden.map((id) => {
                  const meta = WIDGET_META[id]
                  const Icon = meta.icon
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => add(id)}
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

function SortableSlot({ slot, editing, reduced, merging, face, onFace, onResize, onDropFace, onSplitFace, children }: {
  slot: StackSlot
  editing: boolean
  reduced: boolean
  /** This tile is the one a held drag is offering to stack onto. */
  merging: boolean
  /** Which face is up. Owned by the grid so the drag overlay can read it too. */
  face: number
  onFace: (slotId: string, next: number | ((f: number) => number)) => void
  onResize: () => void
  onDropFace: (index: number) => void
  onSplitFace: (index: number) => void
  children: (id: WidgetId, size: WidgetSize) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.id })
  const canResize = sizesFor(slot.items).length > 1
  // A stack that lost a face must not keep pointing past the end of itself.
  const at = Math.min(face, slot.items.length - 1)
  const setFace = useCallback(
    (next: number | ((f: number) => number)) => onFace(slot.id, next),
    [onFace, slot.id],
  )
  const stacked = slot.items.length > 1

  return (
    <m.div
      ref={setNodeRef}
      // dnd-kit's own transform during the drag; framer's spring for the reflow
      // of everything else. `STANDARD` is critically damped — the tiles that
      // move to make room were not thrown, so they must not overshoot.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      animate={
        merging ? { scale: 1.06 }
          : editing && !isDragging && !reduced ? { scale: 1.02 }
            : { scale: 1 }
      }
      transition={reduced ? { duration: 0 } : STANDARD}
      className={`${SIZE_SPAN[slot.size]} relative min-w-0 ${isDragging ? 'opacity-30' : ''}`}
      {...attributes}
      {...listeners}
    >
      <StackFaces
        slot={slot}
        face={at}
        setFace={setFace}
        editing={editing}
        reduced={reduced}
      >
        {children}
      </StackFaces>

      {/* ── THE MERGE HALO ──
          The one thing a hover-hold needs is to SAY that it has armed, before
          the finger lifts. A ring in the target's own accent plus the layers
          glyph is the whole affordance — iOS does the same with a widening
          plate under the app you are hovering. */}
      {merging && (
        <m.span
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduced ? { duration: 0 } : SNAPPY}
          className="absolute inset-0 z-[3] rounded-2xl pointer-events-none grid place-items-center"
          style={{
            border: `2px solid ${WIDGET_META[slot.items[at]].accent}`,
            background: `${WIDGET_META[slot.items[at]].accent}1f`,
          }}
        >
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/70 text-[10px] font-bold text-text">
            <Layers className="w-3 h-3" aria-hidden="true" /> Stack
          </span>
        </m.span>
      )}

      {/* ── THE TAP SHIELD ──
          In edit mode a tap must arrange, never navigate. Without this, tapping
          a tile to nudge it opens the Sleep sheet over the grid you are editing.
          It is a transparent sibling rather than `pointer-events-none` on the
          body, because the body's OWN controls (Cardio's repeat, Workout's log
          link) must be blocked too — and because the drag listeners live on this
          parent, so swallowing the click here does not cost the gesture. */}
      {editing && (
        <span
          className="absolute inset-0 z-[1] rounded-2xl"
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
          aria-hidden="true"
        />
      )}

      {/* Arrange mode's controls. No jiggle: a 1.02 lift and a brightened edge
          say "these are movable" without turning the dashboard into a cartoon,
          and the drag itself is the real affordance.

          `−` and not `×`: this removes the face from the grid, it does not
          delete anything, and the tray one scroll below puts it back. */}
      {editing && (
        <>
          <m.button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDropFace(at) }}
            onPointerDown={(e) => e.stopPropagation()}
            initial={reduced ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduced ? { duration: 0 } : SNAPPY}
            className="absolute top-1.5 left-1.5 z-[2] h-6 w-6 grid place-items-center rounded-full
                       bg-black/70 border border-white/20 text-text backdrop-blur-sm"
            aria-label={`Remove the ${WIDGET_META[slot.items[at]].label} widget from the grid`}
          >
            <Minus className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
          </m.button>

          <span className="absolute top-1.5 right-1.5 z-[2] flex items-center gap-1">
            {/* Unstacking is only offered when there is a stack to leave, and it
                lifts the face you are LOOKING AT — which is the only one the
                user has any way to name. */}
            {stacked && (
              <m.button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSplitFace(at) }}
                onPointerDown={(e) => e.stopPropagation()}
                initial={reduced ? false : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduced ? { duration: 0 } : SNAPPY}
                className="h-6 w-6 grid place-items-center rounded-full
                           bg-black/70 border border-white/20 text-text backdrop-blur-sm"
                aria-label={`Take ${WIDGET_META[slot.items[at]].label} out of this stack`}
              >
                <Unlink className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />
              </m.button>
            )}
            {canResize && (
              <m.button
                type="button"
                onClick={(e) => { e.stopPropagation(); onResize() }}
                onPointerDown={(e) => e.stopPropagation()}
                initial={reduced ? false : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduced ? { duration: 0 } : SNAPPY}
                className="h-6 min-w-[24px] px-1.5 rounded-lg text-[10px] font-bold
                           bg-black/70 border border-white/20 text-text backdrop-blur-sm"
                aria-label={`Resize this tile — currently ${SIZE_WORD[slot.size]}`}
              >
                {SIZE_WORD[slot.size]}
              </m.button>
            )}
          </span>
        </>
      )}
    </m.div>
  )
}

/**
 * The faces of one tile, and the two ways they turn over.
 *
 * ── A STACK ROTATES, AND IT ALSO OBEYS A FINGER ──────────────────────────────
 * iOS Smart Stacks do both: they turn themselves over on their own schedule, and
 * a vertical swipe takes you through them by hand. Only doing the first makes
 * the tile feel like it is hiding things from you; only doing the second makes
 * the whole feature invisible to anyone who never tries the gesture.
 *
 * The auto-rotation is deliberately slow (12s) and stops dead whenever the
 * dashboard is being edited, whenever the tab is in the background, and for a
 * while after any manual swipe — a tile that flips out from under a finger that
 * just chose a face is a tile that has overruled its user.
 *
 * ── AND WHY THE SWIPE IS HAND-ROLLED ─────────────────────────────────────────
 * A framer `drag="y"` here would fight dnd-kit for the same pointer, and the
 * loser is whichever one binds second. The sensor's own `tolerance: 8` already
 * cancels the long-press the moment a finger travels, so all this has to do is
 * measure the travel it was handed.
 *
 * The one thing it must not do is flip on a PAGE SCROLL that happened to start
 * on a stack, which is the common case on a phone: hence the scroll-position
 * check, which is a fact rather than a heuristic.
 */
function StackFaces({ slot, face, setFace, editing, reduced, children }: {
  slot: StackSlot
  face: number
  setFace: (updater: number | ((f: number) => number)) => void
  editing: boolean
  reduced: boolean
  children: (id: WidgetId, size: WidgetSize) => React.ReactNode
}) {
  const stacked = slot.items.length > 1
  const [dir, setDir] = useState(1)
  // Set on a manual flip, so the timer does not immediately overrule the hand.
  const touchedAt = useRef(0)
  const gesture = useRef<{ y: number; x: number; at: number; scroll: number } | null>(null)

  const go = useCallback((delta: number) => {
    touchedAt.current = Date.now()
    setDir(delta > 0 ? 1 : -1)
    setFace((f) => (f + delta + slot.items.length) % slot.items.length)
    void tapLight()
  }, [setFace, slot.items.length])

  useEffect(() => {
    if (!stacked || editing) return
    const tick = window.setInterval(() => {
      if (document.hidden) return
      if (Date.now() - touchedAt.current < ROTATE_MS) return
      setDir(1)
      setFace((f) => (f + 1) % slot.items.length)
    }, ROTATE_MS)
    return () => window.clearInterval(tick)
  }, [stacked, editing, slot.items.length, setFace])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!stacked) return
    gesture.current = { y: e.clientY, x: e.clientX, at: Date.now(), scroll: window.scrollY }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current
    gesture.current = null
    if (!g || !stacked) return
    const dy = e.clientY - g.y
    const dx = e.clientX - g.x
    // The page moved under the finger: this was a scroll that began on a tile,
    // not a swipe of the tile.
    if (Math.abs(window.scrollY - g.scroll) > 2) return
    if (Date.now() - g.at > 500) return
    if (Math.abs(dy) < 44 || Math.abs(dx) > 30) return
    go(dy < 0 ? 1 : -1)
  }

  const id = slot.items[face]

  if (!stacked) {
    return <div className="h-full">{children(id, slot.size)}</div>
  }

  return (
    <div
      className="relative h-full overflow-hidden rounded-2xl"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { gesture.current = null }}
    >
      <AnimatePresence initial={false} mode="popLayout" custom={dir}>
        <m.div
          key={`${slot.id}:${face}:${id}`}
          custom={dir}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: dir > 0 ? '24%' : '-24%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: dir > 0 ? '-24%' : '24%' }}
          transition={reduced ? CROSSFADE : STANDARD}
          className="h-full"
        >
          {children(id, slot.size)}
        </m.div>
      </AnimatePresence>

      {/* ── THE PAGE CONTROL ──
          Dots, on the trailing edge, exactly where iOS puts them. They are real
          buttons rather than decoration so the stack is reachable by keyboard
          and by VoiceOver — a gesture-only control is a control that does not
          exist for anybody who cannot make the gesture. */}
      <span className="absolute right-1 top-1/2 -translate-y-1/2 z-[2] flex flex-col gap-1">
        {slot.items.map((w, i) => (
          <button
            key={`${w}:${i}`}
            type="button"
            onClick={(e) => { e.stopPropagation(); touchedAt.current = Date.now(); setDir(i > face ? 1 : -1); setFace(i) }}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-1.5 w-1.5 rounded-full transition-opacity"
            style={{
              background: i === face ? WIDGET_META[w].accent : 'rgba(255,255,255,0.28)',
              opacity: i === face ? 1 : 0.7,
            }}
            aria-label={`Show ${WIDGET_META[w].label}`}
            aria-current={i === face}
          />
        ))}
      </span>
    </div>
  )
}
