import { describe, it, expect } from 'vitest'
import { routeTransition } from '@/lib/nav/transition'
import { isNavActive } from '@/lib/nav-items'

/**
 * ── TWO QUESTIONS THAT LOOK LIKE ONE ─────────────────────────────────────────
 *
 * `isNavActive` asks "which tab is lit", and must be a PREFIX match:
 * `/workout/exercises/<id>` has to keep the Workout tab highlighted while you
 * are inside it.
 *
 * `routeTransition` asks "is this a tab switch or a push", and must be an EXACT
 * match: that same route is a level deeper, and animating it like a sideways
 * tab move is precisely the thing that made every navigation in this app read
 * as a web page rather than an iOS screen.
 *
 * Conflating them is the easy mistake, so both are asserted against the same
 * routes here.
 */
describe('routeTransition', () => {
  it.each(['/', '/nutrition', '/workout', '/pathfinder', '/settings'])(
    '%s is a tab — instant, no animation, scroll preserved',
    (path) => { expect(routeTransition(path)).toBe('tab') },
  )

  it.each([
    '/day/2026-08-31',
    '/session',
    '/session/abc-123',
    '/report/xyz',
    '/reports',
    '/workout/exercises',
    '/workout/exercises/bench-press',
    '/settings/plan',
    '/nutrition/micros',
  ])('%s is a push — it slides in from the trailing edge', (path) => {
    expect(routeTransition(path)).toBe('push')
  })

  it('a tab sub-route is a PUSH even though it lights its own tab', () => {
    // The two rules disagree here on purpose, and that disagreement is correct.
    expect(isNavActive('/workout', '/workout/exercises/bench-press')).toBe(true)
    expect(routeTransition('/workout/exercises/bench-press')).toBe('push')
  })

  it('an unknown route is a push, not a tab', () => {
    // Failing open to "tab" would silently drop the animation on any route
    // added later; failing to "push" is merely a slide where none was wanted.
    expect(routeTransition('/something-new')).toBe('push')
  })
})

/**
 * Scroll memory moved to `nav-scroll-memory.test.ts`. What used to live here
 * asserted that `rememberScroll` did not throw, which the broken implementation
 * also satisfied — the value it stored was wrong, not absent. The replacement
 * asserts the navigation SEQUENCE instead, which is the only shape that can
 * tell the two apart.
 */
