'use client'

/**
 * The dashboard's arrangement — which widgets, in what order, at what size.
 *
 * ── WHY THIS IS DEVICE-LOCAL ─────────────────────────────────────────────────
 * Every other preference in HELIX syncs through `user_goals`, because a calorie
 * target means the same thing on every device. A LAYOUT does not: a phone shows
 * two columns and a desktop four, and the widget you want first on a 390px
 * screen at the gym is not the one you want first on a monitor. It is stored in
 * localStorage, read synchronously during render, and never leaves the device.
 *
 * ── AND WHY THE READ IS A MERGE, NOT A PARSE ─────────────────────────────────
 * A stored layout names widgets by id. Ship a tenth widget and every existing
 * layout is missing it; remove one and every layout names something that no
 * longer exists. If the read simply trusted the stored array, the first case
 * would hide the new widget forever and the second would crash the grid.
 *
 * So the read reconciles against the CURRENT catalogue: unknown ids are
 * dropped, known ids missing from the stored order are appended at their
 * default size, and the result is always a complete, valid layout. That is what
 * makes a new widget a one-line change with no migration to write.
 */

import type { LucideIcon } from 'lucide-react'
import {
  Activity, BarChart3, BatteryMedium, Dumbbell, Flame, Footprints,
  HeartPulse, Moon, Pill, Scale, Target, Trophy,
} from 'lucide-react'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import {
  AMETHYST, EMBER, EMERALD, GOLD, PLATINUM, SAPPHIRE, STEEL,
} from '@/lib/theme/palette'

export type WidgetSize = 's' | 'm' | 'l'

export type WidgetId =
  | 'sleep' | 'fuel' | 'train' | 'body' | 'steps'
  | 'cardio' | 'stack' | 'vitals' | 'battery'
  | 'muscle' | 'pr' | 'volume'

/**
 * Every widget the dashboard knows how to render, in first-run order.
 *
 * The order reads as the day does: what you have left (energy), what happened
 * to you (sleep), what you are deciding (fuel), what you are about to do
 * (train), then the record — body, where the week's work landed, how much of it
 * there has been, and the last thing you beat. Steps, vitals, cardio and the
 * stack are the ledger.
 *
 * ── `next` IS GONE, FOLDED INTO `train` ──────────────────────────────────────
 * They were two tiles answering one question at two points in the same day, and
 * on a phone that is two tiles of which exactly one is ever useful. Worse, they
 * disagreed: Next said "Legs & Core A" while Train said "NaN kg", because Train
 * printed a volume for a session that had not happened yet. One tile now, three
 * states — before (the plan, and what you did last time you ran it), after
 * (today's real numbers), and rest.
 *
 * A stored layout naming `next` simply drops it on read; nothing to migrate.
 */
export const WIDGET_IDS: readonly WidgetId[] = [
  'battery', 'sleep', 'fuel', 'train', 'body', 'muscle',
  'volume', 'pr', 'steps', 'vitals', 'cardio', 'stack',
] as const

/**
 * First-run sizes.
 *
 * Not all medium: a grid where everything is the same size is a list with extra
 * steps, and the point of three sizes is that importance is visible before a
 * single number is read. Fuel and Train carry the day's two decisions and open
 * at medium; the rest start small and can be grown.
 */
const DEFAULT_SIZE: Record<WidgetId, WidgetSize> = {
  battery: 'm', sleep: 'm', fuel: 'm', train: 'm', body: 'm',
  muscle: 's', volume: 's', pr: 's', steps: 's', vitals: 'm', cardio: 's', stack: 's',
}

export interface DashboardLayout {
  order: WidgetId[]
  size: Record<WidgetId, WidgetSize>
  hidden: WidgetId[]
}

const KEY = 'helix_dashboard_layout'
const VERSION = 1

export function defaultLayout(): DashboardLayout {
  return { order: [...WIDGET_IDS], size: { ...DEFAULT_SIZE }, hidden: [] }
}

interface StoredLayout {
  v?: number
  order?: unknown
  size?: unknown
  hidden?: unknown
}

const isWidgetId = (v: unknown): v is WidgetId =>
  typeof v === 'string' && (WIDGET_IDS as readonly string[]).includes(v)

const isSize = (v: unknown): v is WidgetSize => v === 's' || v === 'm' || v === 'l'

/**
 * The stored layout, reconciled against the current catalogue.
 *
 * Never throws and never returns a partial layout: a corrupt value, a private
 * window, a browser with site data blocked and a first run all produce the
 * defaults.
 */
export function readLayout(): DashboardLayout {
  if (typeof window === 'undefined') return defaultLayout()
  let stored: StoredLayout | null = null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) stored = JSON.parse(raw) as StoredLayout
  } catch { /* unreadable or not JSON — defaults stand */ }
  if (!stored || stored.v !== VERSION) return defaultLayout()

  const storedOrder = Array.isArray(stored.order) ? stored.order.filter(isWidgetId) : []
  const seen = new Set(storedOrder)
  // Anything the catalogue has gained since this layout was written goes on the
  // end, rather than being silently invisible.
  const order = [...storedOrder, ...WIDGET_IDS.filter((id) => !seen.has(id))]

  const size = { ...DEFAULT_SIZE }
  if (stored.size && typeof stored.size === 'object') {
    for (const [id, v] of Object.entries(stored.size as Record<string, unknown>)) {
      if (isWidgetId(id) && isSize(v)) size[id] = v
    }
  }

  const hidden = Array.isArray(stored.hidden) ? stored.hidden.filter(isWidgetId) : []
  return { order, size, hidden }
}

/** Persist. A failure here is a lost arrangement, never a broken dashboard. */
export function writeLayout(layout: DashboardLayout): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...layout }))
  } catch { /* quota, private mode, blocked site data — the session still works */ }
}

/**
 * Grid spans for a size, at both breakpoints.
 *
 * Literal class strings, never assembled: Tailwind scans source TEXT, so a
 * class built from a template at runtime is never generated into the stylesheet.
 *
 * ── THE THREE SIZES ARE THREE ANSWERS, NOT THREE AREAS ───────────────────────
 * Small is one number. Medium is the domain's SHAPE — a 2×2 of vitals, a set of
 * macro rings, three ledger bars — which is the whole reason a grid beats a
 * list here: nine domains of genuinely different density stop pretending to be
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
 *
 * So small got ROOMIER (104 → 112) while medium lost 46px. `auto-rows` keeps
 * `auto` as the maximum so a row can still grow if a body genuinely needs it,
 * but every body here is now written to its budget rather than to fill whatever
 * it was handed.
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

/** The next size in the cycle, for a tap on the size control. */
export const SIZE_CYCLE: Record<WidgetSize, WidgetSize> = { s: 'm', m: 'l', l: 's' }

/* ────────────────────────────────────────────────────────────────────────────
 * THE ARRANGEMENT RULES
 *
 * Pure, and out here rather than inside `WidgetGrid`, because they are the part
 * with rules to get wrong — the component's job is gestures. Hiding twice must
 * not push a duplicate; unhiding must restore a widget where it WAS, not at the
 * end of the grid; the order array is the arrangement and `hidden` is only a
 * mask over it. All three of those are assertions, and none is reachable from a
 * jsdom long-press.
 * ──────────────────────────────────────────────────────────────────────────── */

/** In arranged order, hidden ones removed. */
export function visibleWidgets(layout: DashboardLayout): WidgetId[] {
  return layout.order.filter((id) => !layout.hidden.includes(id))
}

/** In arranged order, only the hidden ones — the tray's contents. */
export function hiddenWidgets(layout: DashboardLayout): WidgetId[] {
  return layout.order.filter((id) => layout.hidden.includes(id))
}

/**
 * Take a widget off the grid.
 *
 * It stays in `order`, which is what lets it come back to its own place rather
 * than to the end. Hiding something already hidden is a no-op, not a second
 * entry — a duplicate would render the tray twice and make one `+` dead.
 */
export function hideWidget(layout: DashboardLayout, id: WidgetId): DashboardLayout {
  if (layout.hidden.includes(id)) return layout
  return { ...layout, hidden: [...layout.hidden, id] }
}

/** Put it back where it was. */
export function showWidget(layout: DashboardLayout, id: WidgetId): DashboardLayout {
  if (!layout.hidden.includes(id)) return layout
  return { ...layout, hidden: layout.hidden.filter((h) => h !== id) }
}

/** Advance one step round the S → M → L → S cycle. */
export function resizeWidget(layout: DashboardLayout, id: WidgetId): DashboardLayout {
  return { ...layout, size: { ...layout.size, [id]: SIZE_CYCLE[layout.size[id]] } }
}


/**
 * The catalogue, for anything that has to name a widget it is not rendering.
 *
 * ── ONE PLACE THE LABEL IS WRITTEN ───────────────────────────────────────────
 * Edit mode's tray lists the widgets you have hidden, which means it has to
 * print "Sleep" and a moon for a component that is not on screen. The obvious
 * shortcut is to retype the strings there; then a rename touches two files and
 * the tray quietly disagrees with the tile for a release. Each body spreads its
 * own row of this table into `WidgetFrame`, so the tray and the tile are
 * literally the same string and the same icon.
 *
 * The accent is the domain's own colour and is the one thing a body may
 * override — Train swaps to amethyst on a rest day, because a rest day is not a
 * failed training day and should not wear the training hue.
 */
export interface WidgetMeta {
  label: string
  icon: LucideIcon
  accent: string
}

export const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  battery: { label: 'Energy', icon: BatteryMedium, accent: STEEL },
  sleep: { label: 'Sleep', icon: Moon, accent: AMETHYST },
  fuel: { label: 'Fuel', icon: Flame, accent: MACRO_COLORS.calories },
  train: { label: 'Train', icon: Dumbbell, accent: EMERALD },
  body: { label: 'Body', icon: Scale, accent: EMBER },
  muscle: { label: 'Muscle Focus', icon: Target, accent: AMETHYST },
  volume: { label: 'Weekly Volume', icon: BarChart3, accent: STEEL },
  pr: { label: 'Latest PR', icon: Trophy, accent: GOLD },
  steps: { label: 'Steps', icon: Footprints, accent: PLATINUM },
  vitals: { label: 'Vitals', icon: HeartPulse, accent: SAPPHIRE },
  cardio: { label: 'Cardio', icon: Activity, accent: EMERALD },
  stack: { label: 'Stack', icon: Pill, accent: GOLD },
}
