/**
 * The drawers a `?section=` deep link may open on the day page.
 *
 * ── WHY THIS IS A LIST, AND WHY IT IS NOT IN THE PAGE ────────────────────────
 * The parameter arrives from a widget tap, which is to say from a custom URL
 * scheme anything on the device can call. `safePath` has already decided the
 * ROUTE is allowed; this decides the named drawer is real. An unrecognised value
 * opens the day with nothing open — never throws, never guesses at the nearest
 * match.
 *
 * It lives here rather than beside `DaySheet` because a Next.js page module may
 * only export the fields the framework recognises (`default`, `metadata`,
 * `dynamic`, …). Exporting a constant from `day/[date]/page.tsx` fails the build
 * with "DAY_SECTIONS is not a valid Page export field" — so the shared value
 * moves out and the page imports it like everyone else.
 *
 * `widget-link-parity.test.ts` asserts every `section` the Swift side emits is a
 * member. Before that, a widget could name a drawer that did not exist and the
 * tap would simply do nothing, on a surface with no error to see and no console
 * to read.
 */
export const DAY_SECTIONS = [
  'sleep', 'body', 'inbody', 'water', 'water-edit', 'macros', 'nutrition',
] as const

/** One of the drawers, or null for "no drawer". Mirrors the page's `DaySheet`. */
export type DaySection = (typeof DAY_SECTIONS)[number]

/** The drawer a `?section=` value names, or null when it names nothing real. */
export function parseDaySection(raw: string | null | undefined): DaySection | null {
  return (DAY_SECTIONS as readonly string[]).includes(raw ?? '') ? (raw as DaySection) : null
}
