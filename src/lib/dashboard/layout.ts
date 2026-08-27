'use client'

/**
 * The dashboard's arrangement — which widgets, in what order, at what size, and
 * which of them are stacked on top of each other.
 *
 * ── IT IS LOCAL-FIRST, AND IT IS ALSO SYNCED ─────────────────────────────────
 * It used to be device-local on purpose, and the argument was that a phone shows
 * two columns and a desktop four so the right arrangement differs per screen.
 * That argument survives contact with two devices and does not survive contact
 * with ONE device reinstalled: localStorage goes with the app, so a reinstall
 * threw away an arrangement that had taken months to settle into, and there was
 * nowhere to get it back from.
 *
 * So localStorage is still the READ — synchronous, during render, no flash of
 * the default grid — and `dashboard_layouts` is the BACKUP OF RECORD. The merge
 * is last-write-wins on `updatedAt`, which is the correct rule for a single
 * user's own preference: there is no concurrent editor to lose work to, only an
 * older copy of yourself. See `layoutSync.ts`.
 *
 * ── THE UNIT OF ARRANGEMENT IS A SLOT, NOT A WIDGET ──────────────────────────
 * It used to be `order: WidgetId[]` plus `size: Record<WidgetId, WidgetSize>`,
 * which encodes two assumptions that Smart Stacks break: that a widget appears
 * at most once, and that a grid position holds exactly one widget. Both are now
 * false — you can stack Sleep on Workout, and you can keep Fuel at small in one
 * place and at large in another.
 *
 * So the grid is a list of SLOTS. A slot owns a position, a size, and one or
 * more widgets; a slot with two or more widgets is a stack, which rotates. Size
 * belongs to the slot because a stack has ONE size — that is what makes the flip
 * a flip rather than a reflow, and it is why two widgets may only be stacked
 * when they are already the same size.
 *
 * ── AND WHY THE READ IS A MERGE, NOT A PARSE ─────────────────────────────────
 * A stored layout names widgets by id. Ship a new widget and every existing
 * layout is missing it; remove one and every layout names something that no
 * longer exists; take `l` away from a widget and a stored layout still asks for
 * it. If the read simply trusted what was stored, the first case would hide the
 * new widget forever, the second would render a hole, and the third would draw
 * a size the body no longer has a layout for.
 *
 * So the read reconciles against the CURRENT catalogue — unknown ids dropped,
 * sizes clamped to what the widget actually offers, missing widgets appended —
 * and it also upgrades a v1 layout in place rather than throwing the user's
 * arrangement away. That is what makes shipping a widget a one-line change.
 */

import type { LucideIcon } from 'lucide-react'
import {
  Activity, BarChart3, CalendarCheck, Droplets, Dumbbell, Flame, Footprints,
  Gauge, HeartPulse, Moon, Pill, Scale, Sparkles, Target, TrendingDown, Trophy,
} from 'lucide-react'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import {
  AMETHYST, EMBER, EMERALD, GOLD, PLATINUM, SAPPHIRE, STEEL,
} from '@/lib/theme/palette'

export type WidgetSize = 's' | 'm' | 'l'

export type WidgetId =
  | 'recovery'
  | 'sleep' | 'fuel' | 'micros' | 'train' | 'body' | 'steps'
  | 'cardio' | 'stack' | 'vitals' | 'water'
  | 'muscle' | 'pr' | 'volume'
  | 'deficit' | 'bar' | 'consistency'

/**
 * Every widget the dashboard knows how to render, in first-run order.
 *
 * The order reads as the day does: what happened to you (sleep, vitals), what
 * you are deciding (fuel, micros, deficit), what you are about to do (workout,
 * the bar to beat), then the record — body, where the week's work landed, how
 * much of it there has been, what you last beat, and how consistently you have
 * shown up. Steps, cardio and the stack are the ledger.
 *
 * ── `battery` IS STILL GONE, AND `recovery` IS WHY IT CAN BE ────────────────
 * The Energy tile was removed because it restated the Readiness orb, which was
 * a fixed hero above the grid and not arrangeable precisely because it was the
 * one question the dashboard exists to answer.
 *
 * That hero is gone — the dashboard is the grid now, edge to edge — so the
 * argument has to be re-made rather than inherited. Readiness did not stop
 * being the headline question when its band was deleted; it stopped having
 * anywhere to be answered. So it becomes a widget, first in the catalogue, and
 * it absorbs the drivers panel that stood beside the orb (sleep, resting heart
 * rate, HRV, energy left) at its large size.
 *
 * There is still no separate Energy tile, for the original reason: a second
 * tile printing the same percentage and the same four drivers would be a
 * duplicate of this one.
 *
 * ── `next` IS GONE TOO, FOLDED INTO `train` ──────────────────────────────────
 * They were two tiles answering one question at two points in the same day, and
 * on a phone that is two tiles of which exactly one is ever useful. One tile
 * now, three states — before, after, rest.
 *
 * A stored layout naming either simply drops it on read; nothing to migrate.
 */
export const WIDGET_IDS: readonly WidgetId[] = [
  'recovery', 'sleep', 'vitals', 'fuel', 'water', 'micros', 'deficit', 'train', 'bar',
  'body', 'muscle', 'volume', 'pr', 'consistency', 'steps', 'cardio', 'stack',
] as const

/**
 * The sizes each widget actually has a body for.
 *
 * ── A SIZE IS A DIFFERENT ANSWER, NOT A BIGGER BOX ───────────────────────────
 * Three of these widgets have no large: Cardio, the Stack and the Latest PR.
 * Each of them says everything it knows in a medium tile — one walk, one dose
 * block, one record — and a large was the same content with 120px of nothing
 * under it. A stretched medium is worse than no large at all, because it
 * teaches the reader that growing a tile does not give them more, and after
 * that they stop trying.
 *
 * `nextSize` cycles inside this list, so the resize badge on a Cardio tile goes
 * S → M → S and the size that has no body is simply unreachable.
 */
export const WIDGET_SIZES: Record<WidgetId, readonly WidgetSize[]> = {
  recovery: ['s', 'm', 'l'],
  sleep: ['s', 'm', 'l'],
  vitals: ['s', 'm', 'l'],
  fuel: ['s', 'm', 'l'],
  micros: ['s', 'm', 'l'],
  // Hydration is one quantity against one target. Small is the ratio, medium is
  // the ratio plus the fortnight it sits in; there is no third answer, so there
  // is no large — see the note above on why a stretched medium is worse than
  // no large at all.
  water: ['s', 'm'],
  deficit: ['s', 'm', 'l'],
  train: ['s', 'm', 'l'],
  bar: ['s', 'm', 'l'],
  body: ['s', 'm', 'l'],
  muscle: ['s', 'm', 'l'],
  volume: ['s', 'm', 'l'],
  pr: ['s', 'm'],
  consistency: ['s', 'm', 'l'],
  steps: ['s', 'm', 'l'],
  cardio: ['s', 'm'],
  stack: ['s', 'm'],
}

/**
 * First-run sizes.
 *
 * Not all medium: a grid where everything is the same size is a list with extra
 * steps, and the point of three sizes is that importance is visible before a
 * single number is read. Fuel and Workout carry the day's two decisions and open
 * at medium; the rest start small and can be grown.
 */
const DEFAULT_SIZE: Record<WidgetId, WidgetSize> = {
  // The only widget that opens at LARGE. It is the question the dashboard
  // exists to answer and it used to be a 300px hero; a small tile in its place
  // would be a demotion dressed as a purge.
  recovery: 'l',
  sleep: 'm', vitals: 'm', fuel: 'm', water: 's', micros: 's', deficit: 'm',
  train: 'm', bar: 's', body: 'm', muscle: 's', volume: 's',
  pr: 's', consistency: 's', steps: 's', cardio: 's', stack: 's',
}

/** The default size a widget lands at when it is added back from the tray. */
export function defaultSizeFor(id: WidgetId): WidgetSize {
  return DEFAULT_SIZE[id]
}

/**
 * One position on the grid.
 *
 * `items` is ordered and MAY REPEAT a widget: two Fuel faces in one stack is a
 * legitimate arrangement (one small-form glance, one detail), and forbidding it
 * would be the layout model asserting something about intent it cannot know.
 * Position in the array is the identity of a face, which is why nothing here
 * carries a per-face id — there is nothing a face has that its slot and index
 * do not already say.
 */
export interface StackSlot {
  id: string
  size: WidgetSize
  items: WidgetId[]
}

export interface DashboardLayout {
  slots: StackSlot[]
  /**
   * Widgets the user has taken OFF the grid, on purpose.
   *
   * ── WHY THIS IS STORED AND NOT DERIVED ─────────────────────────────────────
   * It used to be derived — "hidden" meant "in the catalogue and not placed" —
   * and that is exactly the bug where a widget removed with the `−` button came
   * back on the next load. `reconcile` APPENDS every catalogue entry that has no
   * face, because that is how a newly shipped widget reaches an existing layout.
   * With hidden derived, those two rules are the same rule pointed in opposite
   * directions: the remove wrote a layout without the widget, and the very next
   * read decided the widget was missing and put it back.
   *
   * Nothing in a derived model can tell those two cases apart, because they are
   * identical on disk: `sleep` is absent because it is new, and `sleep` is absent
   * because you removed it, are the same absence. So the intent has to be
   * RECORDED. A widget in here is not appended; a widget in neither `slots` nor
   * here is new, and is.
   */
  hidden: WidgetId[]
  /**
   * When this arrangement was last changed, epoch ms.
   *
   * The whole conflict-resolution rule for the cloud copy — see `layoutSync.ts`.
   * A layout that has never been written carries 0, so any stored remote wins
   * over a fresh install's defaults.
   */
  updatedAt: number
}

const KEY = 'helix_dashboard_layout'
/** v3 added `hidden` — see the note on `DashboardLayout.hidden`. */
const VERSION = 3

const isWidgetId = (v: unknown): v is WidgetId =>
  typeof v === 'string' && (WIDGET_IDS as readonly string[]).includes(v)

const isSize = (v: unknown): v is WidgetSize => v === 's' || v === 'm' || v === 'l'

/** Slot ids only have to be unique within one layout, and stable across writes. */
let slotSeq = 0
export function newSlotId(): string {
  slotSeq += 1
  return `sl${Date.now().toString(36)}${slotSeq.toString(36)}`
}

export function defaultLayout(): DashboardLayout {
  return {
    slots: WIDGET_IDS.map((id) => ({ id: `sl-${id}`, size: DEFAULT_SIZE[id], items: [id] })),
    hidden: [],
    updatedAt: 0,
  }
}

/**
 * The largest size a slot may take: what every widget in it can draw.
 *
 * A stack is one tile, so a Cardio face inside it cannot be given a large just
 * because the Sleep face beside it has one — the flip would change the tile's
 * height, which is the one thing a flip must never do.
 */
export function sizesFor(items: readonly WidgetId[]): WidgetSize[] {
  const all: WidgetSize[] = ['s', 'm', 'l']
  return all.filter((s) => items.every((id) => WIDGET_SIZES[id].includes(s)))
}

/** The nearest size a slot can actually draw, preferring not to grow. */
export function clampSize(items: readonly WidgetId[], want: WidgetSize): WidgetSize {
  const ok = sizesFor(items)
  if (!ok.length) return 's'
  if (ok.includes(want)) return want
  const rank: Record<WidgetSize, number> = { s: 0, m: 1, l: 2 }
  // Step DOWN first — a widget that lost its large should not silently become
  // small when medium exists.
  return [...ok].sort((a, b) => Math.abs(rank[a] - rank[want]) - Math.abs(rank[b] - rank[want]))[0]
}

interface StoredV1 { v?: number; order?: unknown; size?: unknown; hidden?: unknown }
interface StoredV2 { v?: number; slots?: unknown }
interface StoredV3 { v?: number; slots?: unknown; hidden?: unknown; updatedAt?: unknown }

type Stored = StoredV1 & StoredV2 & StoredV3

/**
 * The stored layout, reconciled against the current catalogue.
 *
 * Never throws and never returns a partial layout: a corrupt value, a private
 * window, a browser with site data blocked and a first run all produce the
 * defaults.
 */
export function readLayout(): DashboardLayout {
  if (typeof window === 'undefined') return defaultLayout()
  let stored: Stored | null = null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) stored = JSON.parse(raw) as Stored
  } catch { /* unreadable or not JSON — defaults stand */ }
  if (!stored) return defaultLayout()
  return fromStored(stored)
}

/**
 * A stored payload — from localStorage or from the cloud row — as a layout.
 *
 * Shared so the two sources cannot drift: the remote copy is the same JSON that
 * was written locally, and it must be upgraded and reconciled by exactly the
 * same code or a v2 row synced from an old device would come back unreconciled.
 */
export function fromStored(stored: Stored): DashboardLayout {
  const slots = stored.v === VERSION || stored.v === 2
    ? parseSlots(stored.slots)
    // A v1 layout is an arrangement the user made; upgrading it costs eight
    // lines and throwing it away costs them their dashboard.
    : stored.v === 1 ? fromV1(stored) : []

  /**
   * v1 and v3 both carry `hidden`; v2 does not, and cannot.
   *
   * v2 is the version that HAD the reappearing-widget bug, so there is nothing
   * to recover from one — a v2 layout literally does not record which widgets
   * were removed, which is why they kept coming back. It upgrades to "nothing
   * hidden", and the first `−` after the upgrade sticks.
   */
  const hidden = Array.isArray(stored.hidden) ? stored.hidden.filter(isWidgetId) : []
  const updatedAt = typeof stored.updatedAt === 'number' && Number.isFinite(stored.updatedAt)
    ? stored.updatedAt
    : 0

  return reconcile({ slots, hidden, updatedAt })
}

function parseSlots(raw: unknown): StackSlot[] {
  if (!Array.isArray(raw)) return []
  const out: StackSlot[] = []
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue
    const row = s as { id?: unknown; size?: unknown; items?: unknown }
    const items = Array.isArray(row.items) ? row.items.filter(isWidgetId) : []
    if (!items.length) continue
    out.push({
      id: typeof row.id === 'string' && row.id ? row.id : newSlotId(),
      size: clampSize(items, isSize(row.size) ? row.size : DEFAULT_SIZE[items[0]]),
      items,
    })
  }
  return out
}

/** `{ order, size, hidden }` → one slot per visible widget, sizes preserved. */
function fromV1(stored: StoredV1): StackSlot[] {
  const order = Array.isArray(stored.order) ? stored.order.filter(isWidgetId) : []
  const hidden = new Set(Array.isArray(stored.hidden) ? stored.hidden.filter(isWidgetId) : [])
  const sizes = new Map<WidgetId, WidgetSize>()
  if (stored.size && typeof stored.size === 'object') {
    for (const [id, v] of Object.entries(stored.size as Record<string, unknown>)) {
      if (isWidgetId(id) && isSize(v)) sizes.set(id, v)
    }
  }
  return order
    .filter((id) => !hidden.has(id))
    .map((id) => ({
      id: `sl-${id}`,
      size: clampSize([id], sizes.get(id) ?? DEFAULT_SIZE[id]),
      items: [id],
    }))
}

/**
 * Guarantee the invariants the grid renders against: unique slot ids, and every
 * widget in the catalogue either placed or deliberately hidden.
 *
 * A widget shipped since this layout was written is APPENDED rather than left
 * out, because a widget nobody can find is a widget that does not exist. One
 * that has been placed twice is left alone — that is a stack the user built.
 * And one the user REMOVED is left out, because that is what removing it meant;
 * distinguishing those last two is the entire reason `hidden` is stored.
 *
 * `hidden` is also narrowed here: an id that is somehow both hidden and placed
 * resolves in favour of what is on screen, since the grid is the thing the user
 * can actually see and a tray offering to add a tile that is already there is
 * the contradiction the derived model used to produce.
 */
function reconcile(layout: DashboardLayout): DashboardLayout {
  const seenIds = new Set<string>()
  const slots = layout.slots.map((s) => {
    let id = s.id
    while (seenIds.has(id)) id = newSlotId()
    seenIds.add(id)
    return { ...s, id }
  })
  const placed = new Set(slots.flatMap((s) => s.items))
  const hidden = layout.hidden.filter((id) => !placed.has(id))
  const known = new Set([...placed, ...hidden])
  for (const id of WIDGET_IDS) {
    if (known.has(id)) continue
    slots.push({ id: `sl-${id}`, size: DEFAULT_SIZE[id], items: [id] })
  }
  return { slots, hidden, updatedAt: layout.updatedAt }
}

/** The wire form, shared by localStorage and the cloud row. */
export function serializeLayout(layout: DashboardLayout): Stored {
  return { v: VERSION, slots: layout.slots, hidden: layout.hidden, updatedAt: layout.updatedAt }
}

/** Persist. A failure here is a lost arrangement, never a broken dashboard. */
export function writeLayout(layout: DashboardLayout): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(serializeLayout(layout)))
  } catch { /* quota, private mode, blocked site data — the session still works */ }
}

/** Stamp an edit. Every mutation goes through this, so `updatedAt` cannot lie. */
export function touchLayout(layout: DashboardLayout): DashboardLayout {
  return { ...layout, updatedAt: Date.now() }
}

/**
 * Grid spans for a size, at both breakpoints.
 *
 * Literal class strings, never assembled: Tailwind scans source TEXT, so a
 * class built from a template at runtime is never generated into the stylesheet.
 *
 * ── THE THREE SIZES ARE THREE ANSWERS, NOT THREE AREAS ───────────────────────
 * Small is one number. Medium is the domain's SHAPE — a 2×2 of vitals, five
 * macro bars, three ledger bars — which is the whole reason a grid beats a list
 * here: fifteen domains of genuinely different density stop pretending to be
 * equal. Large adds history and, where one exists, an action.
 *
 * ── THE ROW UNIT IS 52px, AND NO SIZE IS ONE ROW ────────────────────────────
 * The spans used to be 1 / 2 / 3 rows of a 104px unit, which chains the three
 * sizes together: medium is exactly twice small plus a gap, and there is no way
 * to shrink medium without shrinking small by the same proportion. Medium came
 * out at 218px — on a 390pt phone that is a 358×218 tile, TALLER than iOS's own
 * medium widget, which is a strict 2:1. The extra height was not carrying
 * anything; it was the dead space, and every body compensated by centring its
 * content in it, which is what made the grid read as airy rather than dense.
 *
 * Halving the unit to 52px and spanning 2 / 3 / 5 breaks the chain:
 *
 *   S  2 rows  = 112px   — 175×112, a quarter tile, one number and its bar
 *   M  3 rows  = 172px   — 358×172, within a hair of iOS's medium proportion
 *   L  5 rows  = 292px   — 358×292, room for a shape AND its history
 */
export const SIZE_SPAN: Record<WidgetSize, string> = {
  s: 'col-span-1 row-span-2',
  m: 'col-span-2 row-span-3',
  l: 'col-span-2 row-span-5',
}

/**
 * The pixel height each size resolves to, for bodies that must size a shape in
 * absolute terms rather than by percentage.
 *
 * The muscle atlas is the reason this exists. Its viewBox is 120×260, so an
 * `<svg class="w-full h-full">` in a tile with no definite height resolves its
 * height from its WIDTH — 175px of tile width became a 380px figure, which is
 * the "renders massively tall" bug. A figure with a fixed aspect ratio needs a
 * definite height to letterbox inside, and that height is a property of the
 * tile, so it is stated once here rather than guessed in each body.
 *
 * Kept in step with `SIZE_SPAN` by `widget-parts.test.tsx`, which recomputes it
 * from the spans and the 52px unit.
 */
export const ROW_UNIT_PX = 52
export const GRID_GAP_PX = 8

const SPAN_ROWS: Record<WidgetSize, number> = { s: 2, m: 3, l: 5 }

/** Total tile height in px, gaps included. */
export function tileHeightPx(size: WidgetSize): number {
  const rows = SPAN_ROWS[size]
  return rows * ROW_UNIT_PX + (rows - 1) * GRID_GAP_PX
}

/**
 * The height a body actually has to draw in: the tile minus the frame's own
 * padding (8 top + 10 bottom), its 18px header and the 6px gap under it.
 */
export function bodyHeightPx(size: WidgetSize): number {
  return tileHeightPx(size) - 18 - 18 - 6
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE ARRANGEMENT RULES
 *
 * Pure, and out here rather than inside `WidgetGrid`, because they are the part
 * with rules to get wrong — the component's job is gestures. Merging two slots
 * must refuse mismatched sizes; removing the last face of a stack must remove
 * the slot rather than leave an empty tile; a widget removed from the grid must
 * still be reachable from the tray. None of those is reachable from a jsdom
 * long-press, and all three are assertions.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Every widget currently placed, in grid order, duplicates included. */
export function placedWidgets(layout: DashboardLayout): WidgetId[] {
  return layout.slots.flatMap((s) => s.items)
}

/**
 * The tray's contents: what the user took off the grid.
 *
 * Read straight off the stored set, in catalogue order so the tray's order is
 * stable rather than being the order things happened to be removed in. It used
 * to be derived from "not placed" — see `DashboardLayout.hidden` for why that
 * could not survive `reconcile`.
 */
export function hiddenWidgets(layout: DashboardLayout): WidgetId[] {
  const hidden = new Set(layout.hidden)
  return WIDGET_IDS.filter((id) => hidden.has(id))
}

export function slotAt(layout: DashboardLayout, slotId: string): StackSlot | null {
  return layout.slots.find((s) => s.id === slotId) ?? null
}

/**
 * Take one face off the grid.
 *
 * Removing a face from a stack leaves the stack; removing the last face removes
 * the slot, because an empty tile is a hole the user cannot fill or delete.
 */
export function removeFace(layout: DashboardLayout, slotId: string, index: number): DashboardLayout {
  const dropped = slotAt(layout, slotId)?.items[index] ?? null
  const slots: StackSlot[] = []
  for (const s of layout.slots) {
    if (s.id !== slotId) { slots.push(s); continue }
    const items = s.items.filter((_, i) => i !== index)
    if (!items.length) continue
    slots.push({ ...s, items, size: clampSize(items, s.size) })
  }
  /**
   * It goes to the tray only when its LAST face is gone.
   *
   * Removing one of two Fuel faces leaves a Fuel on the grid, and a tray that
   * offered to "add Fuel back" while a Fuel tile was visible would be describing
   * a dashboard the user is not looking at. Duplicates are the whole reason this
   * has to be checked against what is left rather than against what was removed.
   */
  const stillPlaced = new Set(slots.flatMap((s) => s.items))
  const hidden = dropped && !stillPlaced.has(dropped) && !layout.hidden.includes(dropped)
    ? [...layout.hidden, dropped]
    : layout.hidden
  return touchLayout({ ...layout, slots, hidden })
}

/**
 * Put a widget on the grid, at the end, at its default size.
 *
 * DUPLICATES ARE ALLOWED, and this is the function that allows them: it never
 * asks whether the widget is already placed. Two Fuel tiles at two sizes, or the
 * same tile on two stacks, are arrangements the model has always been able to
 * express (`StackSlot.items` is a list, not a set) and that nothing could reach
 * while the only way to add one was a tray keyed on absence.
 */
export function addWidget(layout: DashboardLayout, id: WidgetId): DashboardLayout {
  return touchLayout({
    ...layout,
    slots: [...layout.slots, { id: newSlotId(), size: DEFAULT_SIZE[id], items: [id] }],
    hidden: layout.hidden.filter((h) => h !== id),
  })
}

/** Advance one step round the sizes this slot's widgets can all draw. */
export function resizeSlot(layout: DashboardLayout, slotId: string): DashboardLayout {
  return touchLayout({
    ...layout,
    slots: layout.slots.map((s) => {
      if (s.id !== slotId) return s
      const ok = sizesFor(s.items)
      if (ok.length < 2) return s
      const at = ok.indexOf(s.size)
      return { ...s, size: ok[(at + 1) % ok.length] }
    }),
  })
}

/** Move a slot to another slot's position, everything else closing up behind it. */
export function moveSlot(layout: DashboardLayout, fromId: string, toId: string): DashboardLayout {
  const from = layout.slots.findIndex((s) => s.id === fromId)
  const to = layout.slots.findIndex((s) => s.id === toId)
  if (from < 0 || to < 0 || from === to) return layout
  const slots = [...layout.slots]
  const [moved] = slots.splice(from, 1)
  slots.splice(to, 0, moved)
  return touchLayout({ ...layout, slots })
}

/**
 * Whether two slots may become one.
 *
 * SAME SIZE ONLY, exactly as iOS requires. A stack is a single tile whose faces
 * swap in place; combining a small with a medium would mean the grid changing
 * height every time the stack turned over, which is not a flip, it is a reflow —
 * and it would move every tile below it on a timer the user did not ask for.
 */
export function canStack(a: StackSlot | null, b: StackSlot | null): boolean {
  if (!a || !b || a.id === b.id) return false
  return a.size === b.size
}

/**
 * Drop one slot onto another. The dragged slot's faces go UNDER the target's,
 * in order, so the tile the user was looking at is still the face on top.
 */
export function stackSlots(layout: DashboardLayout, fromId: string, ontoId: string): DashboardLayout {
  const from = slotAt(layout, fromId)
  const onto = slotAt(layout, ontoId)
  if (!canStack(from, onto) || !from || !onto) return layout
  const items = [...onto.items, ...from.items]
  return touchLayout({
    ...layout,
    slots: layout.slots
      .filter((s) => s.id !== fromId)
      .map((s) => (s.id === ontoId ? { ...s, items, size: clampSize(items, s.size) } : s)),
  })
}

/** Lift one face out of a stack into its own slot, directly after it. */
export function unstackFace(layout: DashboardLayout, slotId: string, index: number): DashboardLayout {
  const slot = slotAt(layout, slotId)
  if (!slot || slot.items.length < 2) return layout
  const id = slot.items[index]
  if (!id) return layout
  const rest = slot.items.filter((_, i) => i !== index)
  const at = layout.slots.findIndex((s) => s.id === slotId)
  const slots = [...layout.slots]
  slots[at] = { ...slot, items: rest, size: clampSize(rest, slot.size) }
  slots.splice(at + 1, 0, { id: newSlotId(), size: clampSize([id], slot.size), items: [id] })
  return touchLayout({ ...layout, slots })
}

/**
 * Reorder the faces INSIDE one stack.
 *
 * The stack sheet's whole job. It is a separate rule from `moveSlot` because the
 * two move different things — one reorders tiles on the grid, this reorders the
 * pages of a single tile — and because this one must not be able to change the
 * slot's size: every face in a stack already draws at the slot's size, so
 * permuting them cannot make a size unreachable and there is nothing to clamp.
 */
export function reorderFace(
  layout: DashboardLayout, slotId: string, from: number, to: number,
): DashboardLayout {
  const slot = slotAt(layout, slotId)
  if (!slot) return layout
  const n = slot.items.length
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return layout
  const items = [...slot.items]
  const [moved] = items.splice(from, 1)
  items.splice(to, 0, moved)
  return touchLayout({
    ...layout,
    slots: layout.slots.map((s) => (s.id === slotId ? { ...s, items } : s)),
  })
}

/**
 * The catalogue, for anything that has to name a widget it is not rendering.
 *
 * ── ONE PLACE THE LABEL IS WRITTEN ───────────────────────────────────────────
 * Edit mode's tray lists the widgets you have taken off the grid, which means it
 * has to print "Sleep" and a moon for a component that is not on screen. The
 * obvious shortcut is to retype the strings there; then a rename touches two
 * files and the tray quietly disagrees with the tile for a release. Each body
 * spreads its own row of this table into `WidgetFrame`, so the tray and the tile
 * are literally the same string and the same icon.
 *
 * The accent is the domain's own colour and is the one thing a body may
 * override — Workout swaps to amethyst on a rest day, because a rest day is not
 * a failed training day and should not wear the training hue.
 */
export interface WidgetMeta {
  label: string
  icon: LucideIcon
  accent: string
}

export const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  recovery: { label: 'Recovery', icon: Gauge, accent: EMBER },
  sleep: { label: 'Sleep', icon: Moon, accent: AMETHYST },
  vitals: { label: 'Vitals', icon: HeartPulse, accent: SAPPHIRE },
  fuel: { label: 'Fuel', icon: Flame, accent: MACRO_COLORS.calories },
  water: { label: 'Water', icon: Droplets, accent: SAPPHIRE },
  micros: { label: 'Micros', icon: Sparkles, accent: EMERALD },
  deficit: { label: 'Deficit Ledger', icon: TrendingDown, accent: MACRO_COLORS.calories },
  // "Workout", not "Train" — the tab it belongs to is called Workout, the
  // session it opens is called a workout, and the tile was the only surface in
  // the app still calling the same thing by a different name.
  train: { label: 'Workout', icon: Dumbbell, accent: EMERALD },
  bar: { label: 'Bar to Beat', icon: Target, accent: GOLD },
  body: { label: 'Body', icon: Scale, accent: EMBER },
  muscle: { label: 'Muscle Focus', icon: Target, accent: AMETHYST },
  volume: { label: 'Tonnage', icon: BarChart3, accent: STEEL },
  pr: { label: 'Latest PR', icon: Trophy, accent: GOLD },
  consistency: { label: 'Consistency', icon: CalendarCheck, accent: EMERALD },
  steps: { label: 'Steps', icon: Footprints, accent: PLATINUM },
  cardio: { label: 'Cardio', icon: Activity, accent: EMERALD },
  stack: { label: 'Stack', icon: Pill, accent: GOLD },
}
