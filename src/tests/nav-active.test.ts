import { describe, it, expect } from 'vitest'
import { isNavActive, coreNavItems } from '@/lib/nav-items'

/**
 * The bar answers "where am I". It was matching with `pathname === href`, so it
 * went dark the moment you stepped INTO a tab: `/workout/exercises/<id>` equals
 * nothing in the list and the whole bar unlit.
 */
describe('isNavActive', () => {
  it('keeps Workout lit inside the exercise library', () => {
    expect(isNavActive('/workout', '/workout/exercises')).toBe(true)
    expect(isNavActive('/workout', '/workout/exercises/abc-123')).toBe(true)
  })

  it('lights exactly one tab there', () => {
    const lit = coreNavItems.filter((n) => isNavActive(n.href, '/workout/exercises/abc-123'))
    expect(lit.map((n) => n.href)).toEqual(['/workout'])
  })

  it('keeps Nutrition lit inside micros', () => {
    expect(isNavActive('/nutrition', '/nutrition/micros')).toBe(true)
  })

  it('matches on a segment boundary, so a sibling route cannot borrow a tab', () => {
    expect(isNavActive('/workout', '/workout-log')).toBe(false)
    expect(isNavActive('/nutrition', '/nutritionx')).toBe(false)
  })

  it('Dashboard is exact-only — every path starts with "/"', () => {
    expect(isNavActive('/', '/')).toBe(true)
    expect(isNavActive('/', '/workout')).toBe(false)
    expect(isNavActive('/', '/day/2026-08-15')).toBe(false)
  })

  it('Pathfinder still adopts the daily Nexus and the session deep-dive', () => {
    expect(isNavActive('/pathfinder', '/day/2026-08-15')).toBe(true)
    expect(isNavActive('/pathfinder', '/session')).toBe(true)
    expect(isNavActive('/pathfinder', '/session/abc-123')).toBe(true)
    expect(isNavActive('/pathfinder', '/pathfinder')).toBe(true)
  })

  it('adopted sub-trees light Pathfinder and nothing else', () => {
    const lit = coreNavItems.filter((n) => isNavActive(n.href, '/day/2026-08-15'))
    expect(lit.map((n) => n.href)).toEqual(['/pathfinder'])
  })

  it('never lights two tabs for one route', () => {
    const routes = [
      '/', '/nutrition', '/nutrition/micros', '/workout', '/workout/exercises',
      '/workout/exercises/x', '/pathfinder', '/settings', '/day/2026-08-15', '/session/x',
    ]
    for (const r of routes) {
      expect(coreNavItems.filter((n) => isNavActive(n.href, r)).length).toBeLessThanOrEqual(1)
    }
  })

  it('leaves an unowned route with no tab lit rather than guessing', () => {
    expect(coreNavItems.some((n) => isNavActive(n.href, '/reports'))).toBe(false)
  })
})
