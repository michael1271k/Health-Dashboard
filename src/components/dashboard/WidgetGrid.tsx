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
import { Check, Layers, Minus, Plus } from 'lucide-react'
import { StackSheet, StackBadge } from './StackSheet'
import { STANDARD, SNAPPY, CROSSFADE } from '@/lib/motion/springs'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'
import { tapLight, tapSuccess } from '@/lib/native/haptics'
import {
  readLayout, writeLayout, defaultLayout, SIZE_SPAN, WIDGET_META,
  hiddenWidgets, removeFace, addWidget, resizeSlot, moveSlot, canStack,
  stackSlots, unstackFace, reorderFace, slotAt, sizesFor, WIDGET_IDS,
  type DashboardLayout, type DashboardSurface, type StackSlot, type WidgetId, type WidgetSize,
} from '@/lib/dashboard/layout'
import { useDashboardSurface } from '@/lib/hooks/useDashboardSurface'
import { fetchRemoteLayout, pushRemoteLayout, pickLayout, PUSH_DEBOUNCE_MS } from '@/lib/dashboard/layoutSync'

/**
 * How long a face stays up before a stack turns itself over.
 *
 * 12s was slow enough that a stack read as static — you had to sit and watch a
 * tile to discover it had another side. 9s is a beat quicker without ever
 * flipping while a number is being read.
 */
const ROTATE_MS = 9_000

/**
 * ── AND WHY EVERY STACK GETS ITS OWN PHASE ──────────────────────────────────
 * Every `StackFaces` mounted in the same frame and took the same interval, so
 * the whole dashboard turned over on the same millisecond: three tiles snapping
 * in unison reads as a page refresh, not as a set of tiles each minding its own
 * business. A deterministic offset per slot — the id's hash, so it survives a
 * remount and does not shuffle on every render — spreads them across a window
 * just under one full period.
 */
const STAGGER_WINDOW_MS = 7_000

export function staggerFor(slotId: string): number {
  let h = 0
  for (let i = 0; i < slotId.length; i += 1) h = (h * 31 + slotId.charCodeAt(i)) | 0
  return Math.abs(h) % STAGGER_WINDOW_MS
}
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
  /**
   * ── WHICH SCREEN THIS IS, AND THEREFORE WHICH ARRANGEMENT ─────────────────
   * The phone and the desktop keep SEPARATE layouts — see `DashboardSurface`.
   * `surface` is a dependency of every read and every write below, so dragging a
   * window across 1280px swaps the whole arrangement rather than reflowing one
   * built for the other screen.
   */
  const surface = useDashboardSurface()

  // Read AFTER mount. `readLayout` touches localStorage, so seeding state from
  // it directly would render different markup on the server and hydrate wrong.
  const [layout, setLayout] = useState<DashboardLayout>(() => defaultLayout())
  useEffect(() => { setLayout(readLayout(surface)) }, [surface])

  /**
   * ── THE CLOUD COPY ─────────────────────────────────────────────────────────
   * Local first, always: the effect above has already painted the arrangement
   * from localStorage before this one's promise resolves, so there is no frame
   * where the grid shows its defaults waiting for the network. This only ever
   * REPLACES that with a strictly newer remote — which on a reinstall is every
   * remote, because a fresh install's local copy carries `updatedAt: 0`.
   *
   * `alive` because adopting a layout after unmount is a setState on a dead
   * component, and on this page an unmount means the user navigated away mid-
   * flight, which is the common case on a slow connection.
   */
  useEffect(() => {
    let alive = true
    void fetchRemoteLayout(surface).then((remote) => {
      if (!alive || !remote) return
      setLayout((local) => {
        const winner = pickLayout(local, remote)
        // Only touch localStorage when the remote actually won. Writing the
        // local copy back over itself would be a no-op with a side effect.
        if (winner !== local) writeLayout(winner, surface)
        return winner
      })
    })
    return () => { alive = false }
  }, [surface])

  /**
   * Push, debounced.
   *
   * A resize cycles S → M → L as three separate commits and a drag settles into
   * one; without the debounce a single afternoon of fiddling is dozens of
   * upserts of a row whose only reader is the next reinstall. The timer is
   * cleared on unmount rather than flushed — the local copy is already written
   * synchronously, so the worst case is that the backup lags by one edit until
   * the next one, and that is strictly better than a fetch racing a teardown.
   */
  const pushTimer = useRef<number | null>(null)
  useEffect(() => () => { if (pushTimer.current != null) window.clearTimeout(pushTimer.current) }, [])
  const schedulePush = useCallback((next: DashboardLayout) => {
    if (pushTimer.current != null) window.clearTimeout(pushTimer.current)
    pushTimer.current = window.setTimeout(() => { void pushRemoteLayout(next, surface) }, PUSH_DEBOUNCE_MS)
  }, [surface])

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
    writeLayout(next, surface)
    schedulePush(next)
  }, [schedulePush, surface])

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
    if (!canStack(slotAt(layout, String(e.active.id)), slotAt(layout, overId), surface)) return
    hover.current.id = overId
    hover.current.timer = window.setTimeout(() => {
      setMergeTarget(overId)
      void tapLight()
    }, MERGE_HOLD_MS)
  }

  /**
   * ── LONG-PRESS A STACK, RELEASE WITHOUT MOVING → EDIT IT ───────────────────
   *
   * The obvious implementation — a second long-press timer on the tile — cannot
   * work, because dnd-kit's PointerSensor is already listening on the same
   * element with a 450ms clock and there is no way to un-fire the lift it has
   * begun. Racing it with a 400ms timer of our own would mean a drag that starts
   * with a modal open over it.
   *
   * So the gesture is read from the END of the drag instead of the start, which
   * dnd-kit reports exactly: press-and-hold a stacked tile and let go WITHOUT
   * travelling, and `delta` is (near) zero and there is nothing to reorder. That
   * event is already a no-op today — it is the `overId === activeId` early
   * return below — so nothing is being taken away to make room for it, and a
   * press that turns into a real drag is untouched.
   *
   * 6px, not 0: a thumb never releases on the pixel it pressed, and the sensor's
   * own `tolerance` is 8, so anything that survived the lift moved less than
   * that or it would have been cancelled as a swipe.
   */
  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    const merging = mergeTarget
    const still = Math.abs(e.delta.x) < 6 && Math.abs(e.delta.y) < 6
    clearHover()
    setDragging(null)
    setMergeTarget(null)
    if (!overId || overId === activeId) {
      const slot = slotAt(layout, activeId)
      if (still && slot && slot.items.length > 1) { void tapLight(); setStackSheet(activeId) }
      return
    }
    if (merging === overId) {
      void tapSuccess()
      commit(stackSlots(layout, activeId, overId, surface))
      return
    }
    commit(moveSlot(layout, activeId, overId))
  }

  // The rules themselves live in `layout.ts` and are tested there; these are
  // the gestures that reach for them.
  const resize = (slotId: string) => { void tapLight(); commit(resizeSlot(layout, slotId, surface)) }
  const drop = (slotId: string, index: number) => { void tapLight(); commit(removeFace(layout, slotId, index)) }
  const add = (id: WidgetId) => { void tapLight(); commit(addWidget(layout, id, surface)) }

  const draggedSlot = dragging ? slotAt(layout, dragging) : null

  /* ── THE STACK SHEET ──
     Held as a slot id rather than as the slot, so the sheet re-reads the live
     layout on every render: reordering inside it commits a new layout, and a
     sheet holding a snapshot would keep drawing the order from before the drag
     it just performed. */
  const [stackSheet, setStackSheet] = useState<string | null>(null)
  const sheetSlot = stackSheet ? slotAt(layout, stackSheet) : null
  // A stack edited down to one face is no longer a stack, so the sheet has
  // nothing left to be about and closes itself rather than showing a list of one.
  useEffect(() => {
    if (stackSheet && (!sheetSlot || sheetSlot.items.length < 2)) setStackSheet(null)
  }, [stackSheet, sheetSlot])

  /** Whether the "add another" gallery is open. Edit mode only. */
  const [galleryOpen, setGalleryOpen] = useState(false)

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
                surface={surface}
                face={Math.min(faces[slot.id] ?? 0, slot.items.length - 1)}
                onFace={setFace}
                onResize={() => resize(slot.id)}
                onDropFace={(i) => drop(slot.id, i)}
                onEditStack={() => setStackSheet(slot.id)}
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

      {/* ── THE TRAY, AND THE GALLERY BEHIND IT ──
          Taking a widget off the grid has to be reversible somewhere the user
          can find, and a widget that is off the grid is by definition not on it
          to tap. That is the tray, and it renders only in edit mode and only
          when something is missing, so the dashboard carries no permanent
          "0 hidden" row.

          ── AND WHY THERE IS A SECOND LIST UNDER IT ──
          The tray is keyed on ABSENCE, so it can only ever offer a widget you
          do not have. `StackSlot.items` has always been a list rather than a
          set — two Fuel faces in one stack is an arrangement the model can
          express — but with the tray as the only way to add anything, a second
          copy of a widget was unreachable: the moment one exists, the tray stops
          offering it. The gallery is the whole catalogue, always, and adding
          from it never asks whether the widget is already placed. */}
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

      {/* ── THE GALLERY ──
          Collapsed by default: it is the whole catalogue and it is the rarer
          errand, so it must not push the tray — which answers "where did my
          Sleep tile go" — below the fold on a phone. */}
      <AnimatePresence initial={false}>
        {editing && (
          <m.div
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={reduced ? { duration: 0 } : STANDARD}
            className="overflow-hidden"
          >
            <div className="pt-1.5">
              <button
                type="button"
                onClick={() => { void tapLight(); setGalleryOpen((v) => !v) }}
                className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 rounded-full
                           text-[10px] font-bold uppercase tracking-[0.12em] text-muted
                           border border-white/10 bg-white/[0.03]"
                aria-expanded={galleryOpen}
              >
                <Plus className={`w-3 h-3 transition-transform ${galleryOpen ? 'rotate-45' : ''}`} strokeWidth={3} aria-hidden="true" />
                Add a widget
              </button>

              {galleryOpen && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {WIDGET_IDS.map((id) => {
                    const meta = WIDGET_META[id]
                    const Icon = meta.icon
                    // How many are already on the grid. Shown rather than
                    // suppressed: "you have two of these" is the fact that makes
                    // a second Fuel tile a deliberate choice instead of a
                    // mistake the user has to notice afterwards.
                    const count = layout.slots.reduce((n, sl) => n + sl.items.filter((w) => w === id).length, 0)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => add(id)}
                        className="inline-flex items-center gap-1.5 min-h-[34px] pl-2 pr-2.5 rounded-xl
                                   text-[11px] font-bold border active:scale-95 transition-transform"
                        style={{
                          borderColor: `${meta.accent}2e`,
                          background: `${meta.accent}0d`,
                          color: meta.accent,
                        }}
                        aria-label={count > 0
                          ? `Add another ${meta.label} widget — ${count} already on the dashboard`
                          : `Add the ${meta.label} widget`}
                      >
                        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                        {meta.label}
                        {count > 0 && (
                          <span className="helix-num text-[9px] tabular-nums opacity-70">×{count}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <StackSheet
        open={!!sheetSlot}
        onClose={() => setStackSheet(null)}
        slot={sheetSlot}
        face={sheetSlot ? Math.min(faces[sheetSlot.id] ?? 0, sheetSlot.items.length - 1) : 0}
        onReorder={(from, to) => { if (stackSheet) commit(reorderFace(layout, stackSheet, from, to)) }}
        onUnstack={(i) => { if (stackSheet) commit(unstackFace(layout, stackSheet, i)) }}
        onRemove={(i) => { if (stackSheet) commit(removeFace(layout, stackSheet, i)) }}
      />
    </div>
  )
}

/**
 * The badge's letter for each size.
 *
 * The two wide ones read "W" and "XL" rather than continuing the single-letter
 * run: they are not a fourth and fifth step of the same ladder, they are the
 * desktop's own pair, and a badge saying "XL" is the one place the arrangement
 * tells you that this tile spans the whole window.
 */
const SIZE_WORD: Record<WidgetSize, string> = { s: 'S', m: 'M', l: 'L', w: 'W', xl: 'XL' }

function SortableSlot({ slot, editing, reduced, merging, surface, face, onFace, onResize, onDropFace, onEditStack, children }: {
  slot: StackSlot
  editing: boolean
  reduced: boolean
  /** This tile is the one a held drag is offering to stack onto. */
  merging: boolean
  /** Which grid this is — the size ladder the resize badge steps through. */
  surface: DashboardSurface
  /** Which face is up. Owned by the grid so the drag overlay can read it too. */
  face: number
  onFace: (slotId: string, next: number | ((f: number) => number)) => void
  onResize: () => void
  onDropFace: (index: number) => void
  /** Open the stack sheet. Stacked tiles only. */
  onEditStack: () => void
  children: (id: WidgetId, size: WidgetSize) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.id })
  const canResize = sizesFor(slot.items, surface).length > 1
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
            {/* ── ONE BADGE, NOT TWO BUTTONS ──
                This used to be a bare Unlink that split off whichever face
                happened to be up. That is one of the two things you might want
                to do to a stack and it can only ever name ONE of its members —
                the visible one — so a five-face stack had no way to reach the
                other four at all. The badge says how many there are and opens
                the sheet, which can name every face, reorder them, and offer
                both unstack and remove per row.

                A tap here is deliberate; a press-and-release on the tile itself
                reaches the same sheet (see `onDragEnd`), which is the gesture
                iOS uses. */}
            {stacked && (
              <m.span
                initial={reduced ? false : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduced ? { duration: 0 } : SNAPPY}
                className="inline-flex"
              >
                <StackBadge
                  count={slot.items.length}
                  accent={WIDGET_META[slot.items[at]].accent}
                  onOpen={onEditStack}
                />
              </m.span>
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
  // Set by a swipe that fired, cleared by the click it eats.
  const swallow = useRef(false)

  const go = useCallback((delta: number) => {
    touchedAt.current = Date.now()
    setDir(delta > 0 ? 1 : -1)
    setFace((f) => (f + delta + slot.items.length) % slot.items.length)
    void tapLight()
  }, [setFace, slot.items.length])

  useEffect(() => {
    if (!stacked || editing) return
    let tick: number | null = null
    const advance = () => {
      if (document.hidden) return
      if (Date.now() - touchedAt.current < ROTATE_MS) return
      setDir(1)
      setFace((f) => (f + 1) % slot.items.length)
    }
    // The first turn is delayed by this slot's own phase; every one after it is
    // on the plain period, so the offsets hold for the life of the page.
    const first = window.setTimeout(() => {
      advance()
      tick = window.setInterval(advance, ROTATE_MS)
    }, ROTATE_MS + staggerFor(slot.id))
    return () => {
      window.clearTimeout(first)
      if (tick != null) window.clearInterval(tick)
    }
  }, [stacked, editing, slot.id, slot.items.length, setFace])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!stacked) return
    gesture.current = { y: e.clientY, x: e.clientX, at: Date.now(), scroll: window.scrollY }
  }

  /**
   * ── THE SWIPE HAD THREE WAYS TO MISS, AND ONE WAY TO BE UNDONE ────────────
   * It asked for 44px of travel inside 500ms with no more than 30px sideways.
   * An ordinary, deliberate thumb swipe on a 175px tile is shorter than that,
   * takes longer than that, and drifts more than that — so the gesture existed
   * and mostly did not fire.
   *
   * 24px is past any tap jitter and is roughly a third of a small tile's
   * height. 900ms allows a swipe that is placed rather than flicked. And the
   * horizontal test is now RELATIVE — what disqualifies a swipe is that it was
   * mostly sideways, not that it moved sideways at all.
   *
   * The fourth problem is the one that made it look broken even when it did
   * fire: the tile underneath opens a domain sheet on click, so a successful
   * swipe turned the face over AND opened a sheet on top of it. `swallow`
   * eats exactly one click, in the capture phase, before it can reach the body.
   */
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current
    gesture.current = null
    if (!g || !stacked) return
    const dy = e.clientY - g.y
    const dx = e.clientX - g.x
    // The page moved under the finger: this was a scroll that began on a tile,
    // not a swipe of the tile.
    if (Math.abs(window.scrollY - g.scroll) > 2) return
    if (Date.now() - g.at > 900) return
    if (Math.abs(dy) < 24 || Math.abs(dx) > Math.abs(dy) * 0.8) return
    swallow.current = true
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
      onClickCapture={(e) => {
        if (!swallow.current) return
        swallow.current = false
        e.stopPropagation()
        e.preventDefault()
      }}
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
