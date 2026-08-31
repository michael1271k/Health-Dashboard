'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, closestCenter, MouseSensor, TouchSensor, KeyboardSensor,
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
   * ── IT USED TO BE STATE, AND THAT WAS THE MOST EXPENSIVE LINE ON THE PAGE ──
   *
   * The reason it lived up here was real: the DRAG OVERLAY is a second render of
   * the tile you are holding, mounted outside the grid, and it has to draw the
   * face that is actually up rather than face one.
   *
   * But `useState` here meant every automatic rotation — each stacked slot runs
   * its own `ROTATE_MS` timer, staggered — called `setFaces` at the GRID ROOT.
   * With three stacks phase-offset inside a 7s window, the entire dashboard and
   * every widget in it reconciled roughly every three seconds, forever, while
   * the dashboard was open. The muscle atlas alone is ~99 SVG paths, diffed for
   * a tile turning over two cards away.
   *
   * The face is now owned by `SortableSlot`, so a rotation re-renders one tile.
   * This ref is the overlay's window onto it and nothing else: slots report
   * their current face into it, and it is READ only in the overlay branch below,
   * which is reached only after `setDragging` has already scheduled a render —
   * so a ref is sufficient and a second copy of the state is not needed.
   */
  const facesRef = useRef<Record<string, number>>({})
  const reportFace = useCallback((slotId: string, at: number) => {
    facesRef.current[slotId] = at
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

  /**
   * ── A MOUSE AND A THUMB DO NOT LIFT A TILE THE SAME WAY ────────────────────
   *
   * This was one `PointerSensor` with `{ delay: 450, tolerance: 8 }`, and that
   * pair is a TOUCH contract: press and hold, because a finger that starts
   * moving immediately is scrolling the page and must not be stealing a widget.
   *
   * Handed to a mouse it is simply a grid that does not drag. Nobody presses a
   * mouse button and waits half a second on a dashboard — you press and pull —
   * and pulling is precisely what `tolerance: 8` cancels the lift for. Every
   * desktop attempt therefore travelled 8px, was cancelled as a scroll that was
   * never a scroll, and the tile stayed put. The grid looked frozen on desktop
   * and worked on a phone, which is the shape of the report.
   *
   * Two sensors, one per input, each with its own idea of "you meant this":
   *
   *   · Mouse — 8px of TRAVEL. A cursor has no ambiguity to resolve: the page
   *     does not scroll under a held button, so distance alone separates a drag
   *     from a click, and the lift happens the instant you have clearly moved.
   *   · Touch — the same 450ms hold as before, unchanged. The ambiguity is real
   *     there and the long press is how iOS resolves it too.
   *
   * `PointerSensor` cannot express both, because it is one sensor with one
   * constraint and it cannot know which device is on the other end of the
   * event. dnd-kit ships the split for exactly this reason.
   */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 450, tolerance: 8 } }),
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
   * work, because dnd-kit's TouchSensor is already listening on the same
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
  //
  // `resize` and `drop` are `useCallback` because they are passed to the
  // memoized `SortableSlot`. Their identity changes when the layout does, which
  // is precisely when every tile has to re-render anyway.
  const resize = useCallback((slotId: string) => {
    void tapLight(); commit(resizeSlot(layout, slotId, surface))
  }, [commit, layout, surface])
  const drop = useCallback((slotId: string, index: number) => {
    void tapLight(); commit(removeFace(layout, slotId, index))
  }, [commit, layout])
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
            {/* Every prop below is either a primitive or a stable identity —
                the three inline arrows that used to live on `onResize`,
                `onDropFace` and `onEditStack` were rebuilt on every grid render
                and defeated the memo before it could bail out. The slot id
                travels as an argument instead. */}
            {layout.slots.map((slot) => (
              <SortableSlot
                key={slot.id}
                slot={slot}
                editing={editing}
                reduced={reduced}
                merging={mergeTarget === slot.id}
                surface={surface}
                onFaceChange={reportFace}
                onResize={resize}
                onDropFace={drop}
                onEditStack={setStackSheet}
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
                draggedSlot.items[Math.min(facesRef.current[draggedSlot.id] ?? 0, draggedSlot.items.length - 1)],
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

      {/* `face` reads the ref for the same reason the drag overlay does: the
          sheet only opens once `setStackSheet` has scheduled a render, so the
          ref is current by the time this is evaluated. */}
      <StackSheet
        open={!!sheetSlot}
        onClose={() => setStackSheet(null)}
        slot={sheetSlot}
        face={sheetSlot ? Math.min(facesRef.current[sheetSlot.id] ?? 0, sheetSlot.items.length - 1) : 0}
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

/**
 * One tile in the grid.
 *
 * `memo` because this is the boundary a stack rotation must not cross. The face
 * is state HERE now (see `facesRef` in `WidgetGrid`), so a slot turning over
 * re-renders itself and nothing else. The memo is the second half of that: it
 * also stops an unrelated grid render — a drag starting, a merge target
 * changing — from walking every tile, provided the `children` render prop the
 * dashboard passes is stable.
 */
const SortableSlot = memo(function SortableSlot({ slot, editing, reduced, merging, surface, onFaceChange, onResize, onDropFace, onEditStack, children }: {
  slot: StackSlot
  editing: boolean
  reduced: boolean
  /** This tile is the one a held drag is offering to stack onto. */
  merging: boolean
  /** Which grid this is — the size ladder the resize badge steps through. */
  surface: DashboardSurface
  /** Report the face that is up, so the grid's drag overlay can draw it. */
  onFaceChange: (slotId: string, at: number) => void
  onResize: (slotId: string) => void
  onDropFace: (slotId: string, index: number) => void
  /** Open the stack sheet. Stacked tiles only. */
  onEditStack: (slotId: string) => void
  children: (id: WidgetId, size: WidgetSize) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.id })
  const canResize = sizesFor(slot.items, surface).length > 1
  const [face, setFace] = useState(0)
  // A stack that lost a face must not keep pointing past the end of itself.
  const at = Math.min(face, slot.items.length - 1)
  // The overlay reads this out of a ref at drag start; keeping it in an effect
  // rather than writing during render keeps the render pure.
  useEffect(() => { onFaceChange(slot.id, at) }, [onFaceChange, slot.id, at])
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
            onClick={(e) => { e.stopPropagation(); onDropFace(slot.id, at) }}
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
                  onOpen={() => onEditStack(slot.id)}
                />
              </m.span>
            )}
            {canResize && (
              <m.button
                type="button"
                onClick={(e) => { e.stopPropagation(); onResize(slot.id) }}
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
})

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
 * ── WHY IT DID NOT FIRE, AND THE ONE LINE THAT FIXES IT ──────────────────────
 * It was measured on `pointerup` and disqualified by `window.scrollY` having
 * moved. Both are right in isolation and together they made the gesture
 * impossible on the device it exists for.
 *
 * A stacked tile is 112px tall inside a page that scrolls vertically, and the
 * element had `touch-action: auto`. So the browser owned the vertical axis: a
 * thumb dragging down on a tile scrolled the DASHBOARD, which (a) moved
 * `scrollY`, tripping the guard, and (b) sent `pointercancel` rather than
 * `pointerup` the moment the scroll took over — so the handler that would have
 * flipped the face usually never ran at all, and on the occasions it did, the
 * guard vetoed it. The gesture was not slightly too strict. It could not win.
 *
 * `touch-action: pan-x` on the stacked tile is the fix, and it is what iOS
 * itself does: a Smart Stack owns the vertical swipe and hands the other axis
 * back to the Home Screen. The page still scrolls from every other pixel of the
 * dashboard — including every UNstacked tile, which keeps `auto` — and a
 * vertical drag that begins on a stack now belongs to the stack. With the axis
 * actually owned, `scrollY` cannot move under the finger, so the guard that was
 * standing in for that ownership is gone with it.
 *
 * It also fires on `pointermove`, the instant the threshold is crossed, rather
 * than waiting for a release: that is what makes it feel like the widget
 * responded to the swipe instead of to the end of it.
 *
 * ── AND IT IS A TOUCH GESTURE ONLY ───────────────────────────────────────────
 * `pointerType === 'mouse'` is excluded outright. A mouse drag of 24px is also
 * a drag dnd-kit's `MouseSensor` claims at 8px, so on desktop the two would fire
 * on the same gesture — the tile would flip AND lift. Desktop has the dots,
 * which are real buttons and were always the keyboard's route through a stack.
 */
/** Vertical travel that means "next face". Past any tap jitter, a third of a small tile. */
const SWIPE_MIN_PX = 24
const StackFaces = memo(function StackFaces({ slot, face, setFace, editing, reduced, children }: {
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
  const gesture = useRef<{ y: number; x: number; fired: boolean } | null>(null)
  // Set by a swipe that fired, cleared by the click it eats.
  const swallow = useRef(false)

  const go = useCallback((delta: number) => {
    touchedAt.current = Date.now()
    setDir(delta > 0 ? 1 : -1)
    setFace((f) => (f + delta + slot.items.length) % slot.items.length)
    void tapLight()
  }, [setFace, slot.items.length])

  /**
   * ── THE ROTATOR STOPS DEAD WHEN THE APP IS BACKGROUNDED ────────────────────
   * `advance` used to early-return on `document.hidden`, which stopped the FACE
   * from turning but left the interval firing every nine seconds in a pocket,
   * per stacked slot, forever. Suspending the timer itself is the same
   * behaviour for no wake-ups; the phase is re-taken on the way back, which is
   * cosmetic — a stack that turns over shortly after you look at it again is
   * indistinguishable from one that kept counting.
   */
  useEffect(() => {
    if (!stacked || editing) return
    let first: number | null = null
    let tick: number | null = null

    const advance = () => {
      if (Date.now() - touchedAt.current < ROTATE_MS) return
      setDir(1)
      setFace((f) => (f + 1) % slot.items.length)
    }
    const stop = () => {
      if (first != null) { window.clearTimeout(first); first = null }
      if (tick != null) { window.clearInterval(tick); tick = null }
    }
    // The first turn is delayed by this slot's own phase; every one after it is
    // on the plain period, so the offsets hold for as long as the page is up.
    const start = () => {
      if (first != null || tick != null) return
      first = window.setTimeout(() => {
        first = null
        advance()
        tick = window.setInterval(advance, ROTATE_MS)
      }, ROTATE_MS + staggerFor(slot.id))
    }

    const sync = () => { if (document.visibilityState === 'visible') start(); else stop() }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      stop()
    }
  }, [stacked, editing, slot.id, slot.items.length, setFace])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!stacked || e.pointerType === 'mouse') return
    gesture.current = { y: e.clientY, x: e.clientX, fired: false }
  }

  /**
   * ── IT RESOLVES MID-GESTURE, AND IT RESOLVES ONCE ─────────────────────────
   *
   * Three outcomes, decided as the finger travels rather than when it lands:
   *
   *   · past `SWIPE_MIN_PX` and mostly vertical → flip, and mark the gesture
   *     spent so a long drag steps one face rather than five;
   *   · past it and mostly SIDEWAYS → abandon the gesture outright. What
   *     disqualifies a swipe is that it was horizontal, not that it drifted;
   *   · short of it → keep waiting. A tap never crosses 24px, so a tap still
   *     reaches the tile's own click and opens its sheet.
   *
   * ── AND DOWN IS FORWARD ───────────────────────────────────────────────────
   * A downward swipe brings the NEXT face in from above, the way a page you
   * pull down brings the one behind it into view. The face animation follows
   * the finger for the same reason: `dir > 0` enters from the top, so what
   * arrives moves in the direction the thumb pushed.
   *
   * `swallow` is unchanged and still load-bearing: the tile underneath opens a
   * domain sheet on click, so without it a successful swipe would turn the face
   * over AND open a sheet on top of it. It eats exactly one click, in the
   * capture phase, before it can reach the body.
   */
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g || g.fired || !stacked) return
    const dy = e.clientY - g.y
    const dx = e.clientX - g.x
    if (Math.abs(dx) > Math.abs(dy) * 0.8 && Math.abs(dx) >= SWIPE_MIN_PX) { gesture.current = null; return }
    if (Math.abs(dy) < SWIPE_MIN_PX) return
    g.fired = true
    swallow.current = true
    go(dy > 0 ? 1 : -1)
  }

  const id = slot.items[face]

  if (!stacked) {
    return <div className="h-full">{children(id, slot.size)}</div>
  }

  return (
    <div
      className="relative h-full overflow-hidden rounded-2xl"
      // The vertical axis belongs to the stack, the horizontal one to the page.
      // Without this the browser scrolls instead, and the swipe below never gets
      // a `pointermove` it is allowed to act on — see the note above.
      style={{ touchAction: 'pan-x' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => { gesture.current = null }}
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
          // Forward (`dir > 0`) enters from ABOVE and pushes the old face down,
          // because forward is what a downward swipe asks for — the motion has
          // to travel the way the thumb did or the tile reads as fighting it.
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: dir > 0 ? '-24%' : '24%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: dir > 0 ? '24%' : '-24%' }}
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
})
