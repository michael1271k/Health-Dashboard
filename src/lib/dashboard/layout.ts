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

export type WidgetSize = 's' | 'm' | 'l'

export type WidgetId =
  | 'sleep' | 'fuel' | 'train' | 'body' | 'steps'
  | 'cardio' | 'stack' | 'vitals' | 'battery'
  | 'muscle' | 'pr' | 'volume' | 'next'

/**
 * Every widget the dashboard knows how to render, in first-run order.
 *
 * The order reads as the day does: what you have left (energy), what happened
 * to you (sleep), what you are deciding (fuel, what is next), then the record —
 * body, where the week's work landed, how much of it there has been, and the
 * last thing you beat. Steps, vitals, cardio and the stack are the ledger.
 */
export const WIDGET_IDS: readonly WidgetId[] = [
  'battery', 'sleep', 'fuel', 'next', 'train', 'body', 'muscle',
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
  battery: 'm', sleep: 'm', fuel: 'm', next: 's', train: 's', body: 'm',
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
 * Medium is `row-span-2`, so on a phone (two columns) it is a square. It was
 * `row-span-1`, which made it a 2:1 letterbox — enough room for a number and a
 * sparkline and not enough for any shape at all, which is exactly why every
 * widget looked like the same widget. The base row stays 104px and the grid
 * simply gets longer; the alternative was making every SMALL widget taller to
 * buy medium its height, which taxes the eleven tiles that did not need it.
 */
export const SIZE_SPAN: Record<WidgetSize, string> = {
  s: 'col-span-1 row-span-1',
  m: 'col-span-2 row-span-2',
  l: 'col-span-2 row-span-3',
}

/** The next size in the cycle, for a tap on the size control. */
export const SIZE_CYCLE: Record<WidgetSize, WidgetSize> = { s: 'm', m: 'l', l: 's' }
