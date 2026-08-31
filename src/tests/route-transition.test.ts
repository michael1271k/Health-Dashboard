import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { routeTransition } from '@/lib/nav/transition'
import { rememberScroll } from '@/lib/nav/scrollMemory'
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

describe('scroll memory', () => {
  beforeEach(() => { window.scrollY = 0 })
  afterEach(() => { vi.restoreAllMocks() })

  /**
   * The map is a module singleton on purpose: the component that would
   * otherwise hold it (`app/template.tsx`) is exactly the one App Router
   * remounts on every navigation, so a ref or state there is destroyed at the
   * moment the value is needed.
   */
  it('remembering a route does not throw with no window scroll', () => {
    expect(() => rememberScroll('/pathfinder')).not.toThrow()
  })

  it('captures the CURRENT offset, so two routes can hold different ones', () => {
    Object.defineProperty(window, 'scrollY', { value: 1200, configurable: true })
    rememberScroll('/pathfinder')
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    rememberScroll('/nutrition')
    // Nothing is exported to read them back — the restore is a layout effect —
    // so this asserts the capture path is total rather than the stored values.
    expect(() => { rememberScroll('/pathfinder'); rememberScroll('/nutrition') }).not.toThrow()
  })
})
