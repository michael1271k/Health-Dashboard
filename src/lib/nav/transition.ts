import { navItems } from '@/lib/nav-items'

/**
 * ── A TAB SWITCH AND A PUSH ARE NOT THE SAME MOVE ────────────────────────────
 *
 * Every route change in this app used to play the same animation: fade in from
 * `opacity: 0, y: 8`. It is a perfectly good WEB transition and it is the single
 * clearest tell that this is a website in a frame rather than an iOS app,
 * because iOS has no such gesture anywhere. On iOS:
 *
 *   · a tab bar switches INSTANTLY. There is no cross-fade, no rise, and the
 *     tab you return to is exactly where you left it — same scroll offset, same
 *     state. A tab bar is five screens that all exist at once, and moving
 *     between them is looking at a different one, not travelling to it.
 *   · a hierarchical push SLIDES IN FROM THE TRAILING EDGE, and pops back out
 *     the same way. The direction carries the meaning: you went deeper, and the
 *     way back is the way you came. Apple's spatial-consistency rule — if
 *     something disappears one way, we expect it to emerge from where it came.
 *
 * So the two need different answers, which means the app needs to know which is
 * which. That is all this module does.
 */
export type RouteTransition = 'tab' | 'push'

/** The five bottom-nav destinations. A tab is exactly its own href. */
const TAB_HREFS: ReadonlySet<string> = new Set(navItems.map((n) => n.href))

/**
 * Which move is this?
 *
 * Exact match, deliberately — `isNavActive` in `nav-items.ts` uses a PREFIX
 * match, and it must: `/workout/exercises/<id>` has to keep the Workout tab lit
 * while you are inside it. But that same route is a push, not a tab, and
 * treating it as one would make going a level deeper look like going sideways.
 * The two questions are genuinely different and each needs its own rule.
 */
export function routeTransition(pathname: string): RouteTransition {
  return TAB_HREFS.has(pathname) ? 'tab' : 'push'
}
