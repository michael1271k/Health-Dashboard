import { describe, it, expect, beforeEach } from 'vitest'
import {
  readLayout, writeLayout, defaultLayout, clampSize, sizesFor,
  WIDGET_IDS, WIDGET_SIZES, hiddenWidgets, placedWidgets,
} from '@/lib/dashboard/layout'

/**
 * The layout read is a MERGE against the current catalogue, not a parse.
 *
 * These pin the four ways a stored layout goes stale — a widget added since it
 * was written, one that has been removed, a size the widget no longer offers,
 * and a value that is not a layout at all — because every one of them would
 * otherwise be a dashboard that renders wrong or not at all, on a device whose
 * only symptom is a localStorage entry nobody can see.
 *
 * The fifth case is the one that only exists once: a v1 layout, written by the
 * build before Smart Stacks. Dropping those would silently reset a real
 * arrangement, which is why the upgrade is asserted rather than assumed.
 */
describe('dashboard layout — stored arrangement, current catalogue', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns the defaults when nothing is stored', () => {
    expect(readLayout()).toEqual(defaultLayout())
  })

  it('appends widgets the stored layout has never heard of', () => {
    writeLayout({
      slots: [
        { id: 'a', size: 'm', items: ['fuel'] },
        { id: 'b', size: 's', items: ['sleep'] },
      ],
    })
    const out = readLayout()
    expect(out.slots.slice(0, 2).map((s) => s.items)).toEqual([['fuel'], ['sleep']])
    // Every known widget survives — a new one must never be invisible.
    expect([...placedWidgets(out)].sort()).toEqual([...WIDGET_IDS].sort())
    expect(hiddenWidgets(out)).toEqual([])
  })

  it('drops ids the catalogue no longer has, and slots that are then empty', () => {
    localStorage.setItem('helix_dashboard_layout', JSON.stringify({
      v: 2,
      slots: [
        { id: 'a', size: 'm', items: ['fuel', 'ghost'] },
        { id: 'b', size: 's', items: ['phantom'] },
      ],
    }))
    const out = readLayout()
    expect(placedWidgets(out)).not.toContain('ghost')
    // The slot whose ONLY item was unknown is gone, not an empty tile.
    expect(out.slots.find((s) => s.id === 'b')?.items).toBeUndefined()
    expect(out.slots[0].items).toEqual(['fuel'])
  })

  it('clamps a stored size the widget no longer offers', () => {
    // `pr` lost its large when the large was a stretched medium.
    expect(WIDGET_SIZES.pr).not.toContain('l')
    localStorage.setItem('helix_dashboard_layout', JSON.stringify({
      v: 2, slots: [{ id: 'a', size: 'l', items: ['pr'] }],
    }))
    expect(readLayout().slots[0].size).toBe('m')
  })

  it('falls back to the defaults on a corrupt value', () => {
    localStorage.setItem('helix_dashboard_layout', 'not json{')
    expect(readLayout()).toEqual(defaultLayout())
  })

  it('upgrades a v1 layout rather than throwing the arrangement away', () => {
    localStorage.setItem('helix_dashboard_layout', JSON.stringify({
      v: 1,
      order: ['fuel', 'sleep', 'steps', 'battery'],
      size: { fuel: 'l', sleep: 's', steps: 'm' },
      hidden: ['steps'],
    }))
    const out = readLayout()
    // Order kept, sizes kept, the hidden one stays off the grid, and `battery`
    // — a widget this build deleted — simply does not appear.
    expect(out.slots.slice(0, 2)).toMatchObject([
      { size: 'l', items: ['fuel'] },
      { size: 's', items: ['sleep'] },
    ])
    expect(placedWidgets(out)).not.toContain('battery')
    // `steps` was hidden, so it is appended at the end by the reconcile rather
    // than sitting third — being reachable matters more than where it lands.
    expect(placedWidgets(out)).toContain('steps')
  })

  it('round-trips an arrangement the user made, stacks included', () => {
    const mine = readLayout()
    const stacked = {
      slots: [
        { id: 'x', size: 'm' as const, items: ['sleep' as const, 'train' as const] },
        ...mine.slots.filter((s) => !s.items.includes('sleep') && !s.items.includes('train')),
      ],
    }
    writeLayout(stacked)
    const back = readLayout()
    expect(back.slots[0].items).toEqual(['sleep', 'train'])
    expect(back.slots[0].size).toBe('m')
  })

  it('never hands back two slots with the same id', () => {
    localStorage.setItem('helix_dashboard_layout', JSON.stringify({
      v: 2,
      slots: [
        { id: 'dupe', size: 's', items: ['fuel'] },
        { id: 'dupe', size: 's', items: ['sleep'] },
      ],
    }))
    const ids = readLayout().slots.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

/**
 * A stack is ONE tile, so its size has to be a size every face can draw.
 * Without this a Cardio face inside a Sleep stack would be asked for a large it
 * has no body for, and the tile would change height every time it turned over.
 */
describe('a stack can only be as big as its smallest widget', () => {
  it('offers only the sizes every member has', () => {
    expect(sizesFor(['sleep'])).toEqual(['s', 'm', 'l'])
    expect(sizesFor(['sleep', 'cardio'])).toEqual(['s', 'm'])
    expect(sizesFor(['cardio', 'pr', 'stack'])).toEqual(['s', 'm'])
  })

  it('steps a too-large size down rather than collapsing it to small', () => {
    expect(clampSize(['cardio'], 'l')).toBe('m')
    expect(clampSize(['cardio'], 'm')).toBe('m')
    expect(clampSize(['sleep'], 'l')).toBe('l')
  })
})
