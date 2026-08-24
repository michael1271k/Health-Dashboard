import { describe, it, expect, beforeEach } from 'vitest'
import { readLayout, writeLayout, defaultLayout, WIDGET_IDS, type DashboardLayout } from '@/lib/dashboard/layout'

/**
 * The layout read is a MERGE against the current catalogue, not a parse.
 *
 * These pin the three ways a stored layout goes stale — a widget that has been
 * added since it was written, one that has been removed, and a value that is
 * not a layout at all — because every one of them would otherwise be a
 * dashboard that renders wrong or not at all, on a device whose only symptom is
 * a localStorage entry nobody can see.
 */
describe('dashboard layout — stored arrangement, current catalogue', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns the defaults when nothing is stored', () => {
    expect(readLayout()).toEqual(defaultLayout())
  })

  it('appends widgets the stored layout has never heard of', () => {
    // A layout written before six of the nine widgets existed.
    writeLayout({ order: ['fuel', 'sleep'], size: { ...defaultLayout().size }, hidden: [] } as DashboardLayout)
    const out = readLayout()
    expect(out.order.slice(0, 2)).toEqual(['fuel', 'sleep'])
    // Every known widget survives — a new one must never be invisible.
    expect([...out.order].sort()).toEqual([...WIDGET_IDS].sort())
  })

  it('drops ids the catalogue no longer has', () => {
    localStorage.setItem('helix_dashboard_layout', JSON.stringify({
      v: 1, order: ['fuel', 'ghost', 'sleep'], size: { ghost: 'l' }, hidden: ['phantom'],
    }))
    const out = readLayout()
    expect(out.order).not.toContain('ghost')
    expect(out.hidden).toEqual([])
    expect(Object.keys(out.size).sort()).toEqual([...WIDGET_IDS].sort())
  })

  it('falls back to the defaults on a corrupt value or an older version', () => {
    localStorage.setItem('helix_dashboard_layout', 'not json{')
    expect(readLayout()).toEqual(defaultLayout())
    localStorage.setItem('helix_dashboard_layout', JSON.stringify({ v: 0, order: ['fuel'] }))
    expect(readLayout()).toEqual(defaultLayout())
  })

  it('round-trips an arrangement the user made', () => {
    const mine = readLayout()
    mine.order = [...mine.order].reverse()
    mine.size.sleep = 'l'
    writeLayout(mine)
    const back = readLayout()
    expect(back.order).toEqual(mine.order)
    expect(back.size.sleep).toBe('l')
  })

  it('rejects a size that is not a size, without losing the rest', () => {
    localStorage.setItem('helix_dashboard_layout', JSON.stringify({
      v: 1, order: [...WIDGET_IDS], size: { sleep: 'enormous', fuel: 'l' }, hidden: [],
    }))
    const out = readLayout()
    expect(out.size.sleep).toBe(defaultLayout().size.sleep)
    expect(out.size.fuel).toBe('l')
  })
})
