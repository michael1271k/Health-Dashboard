import { describe, it, expect, beforeEach } from 'vitest'
import {
  readLayout, writeLayout, defaultLayout, clampSize, sizesFor,
  WIDGET_IDS, WIDGET_SIZES, hiddenWidgets, placedWidgets,
  removeFace, addWidget, reorderFace, stackSlots, slotAt,
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
      hidden: [],
      updatedAt: 1,
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
    // `steps` was hidden, and it STAYS hidden. A v1 layout already recorded the
    // intent, so the upgrade carries it: this used to append `steps` back onto
    // the grid, which is the same reappearing-widget bug the v2 format had no
    // way to avoid at all.
    expect(placedWidgets(out)).not.toContain('steps')
    expect(hiddenWidgets(out)).toContain('steps')
  })

  it('round-trips an arrangement the user made, stacks included', () => {
    const mine = readLayout()
    const stacked = {
      ...mine,
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
 * ── THE WIDGET THAT CAME BACK ────────────────────────────────────────────────
 *
 * Hiding a widget wrote a layout without it and the very next read put it back,
 * because `reconcile` appends every catalogue entry that has no face — which is
 * also how a newly shipped widget reaches an existing layout. The two rules were
 * indistinguishable on disk, so the intent is stored now.
 *
 * These go THROUGH localStorage on purpose. The bug was never in `removeFace`,
 * which always returned the right layout; it was in what survived the trip, so
 * a test that only called the mutation would have passed against the bug.
 */
describe('a removed widget stays removed', () => {
  beforeEach(() => { localStorage.clear() })

  it('survives a reload', () => {
    const base = readLayout()
    const slot = base.slots.find((s) => s.items.includes('steps'))!
    writeLayout(removeFace(base, slot.id, 0))

    const back = readLayout()
    expect(placedWidgets(back)).not.toContain('steps')
    expect(hiddenWidgets(back)).toEqual(['steps'])
  })

  it('survives a reload a second and a third time', () => {
    let l = readLayout()
    for (const id of ['steps', 'cardio', 'micros'] as const) {
      l = removeFace(l, l.slots.find((s) => s.items.includes(id))!.id, 0)
      writeLayout(l)
      l = readLayout()
    }
    expect(placedWidgets(l)).not.toContain('steps')
    expect(placedWidgets(l)).not.toContain('cardio')
    expect(placedWidgets(l)).not.toContain('micros')
    expect(hiddenWidgets(l).sort()).toEqual(['cardio', 'micros', 'steps'])
  })

  it('comes back for good when it is added back', () => {
    const base = readLayout()
    writeLayout(removeFace(base, base.slots.find((s) => s.items.includes('pr'))!.id, 0))
    writeLayout(addWidget(readLayout(), 'pr'))
    const back = readLayout()
    expect(placedWidgets(back).filter((id) => id === 'pr')).toHaveLength(1)
    expect(hiddenWidgets(back)).toEqual([])
  })

  it('still appends a widget the stored layout has genuinely never seen', () => {
    // A hidden list is not a licence to drop a NEW widget: `water` is in neither
    // the slots nor the hidden set here, so it must appear.
    localStorage.setItem('helix_dashboard_layout', JSON.stringify({
      v: 3,
      slots: [{ id: 'a', size: 'm', items: ['fuel'] }],
      hidden: ['steps'],
      updatedAt: 1,
    }))
    const out = readLayout()
    expect(placedWidgets(out)).toContain('water')
    expect(placedWidgets(out)).not.toContain('steps')
  })

  it('keeps a widget on the grid while any face of it is left', () => {
    // Two Fuel faces, one removed: Fuel is still on screen, so the tray must not
    // offer to add it back.
    const base = readLayout()
    const twice = addWidget(base, 'fuel')
    const slot = twice.slots.find((s) => s.items.includes('fuel'))!
    const next = removeFace(twice, slot.id, 0)
    expect(placedWidgets(next)).toContain('fuel')
    expect(hiddenWidgets(next)).not.toContain('fuel')
  })
})

/**
 * Stacks hold DUPLICATES and reorder in place — the two things the sheet does.
 */
describe('stack contents', () => {
  it('stacks the same widget onto itself', () => {
    const base = defaultLayout()
    const a = base.slots.find((s) => s.items[0] === 'micros')!
    const dup = addWidget(base, 'micros')
    const b = dup.slots[dup.slots.length - 1]
    const merged = stackSlots(dup, b.id, a.id)
    expect(slotAt(merged, a.id)!.items).toEqual(['micros', 'micros'])
  })

  it('reorders faces without touching the slot size', () => {
    const base = defaultLayout()
    const a = base.slots.find((s) => s.items[0] === 'micros')!
    const merged = stackSlots(addWidget(base, 'bar'), base.slots.length === 0 ? '' : addWidget(base, 'bar').slots.at(-1)!.id, a.id)
    const before = slotAt(merged, a.id)!
    const after = slotAt(reorderFace(merged, a.id, 0, 1), a.id)!
    expect(after.items).toEqual([...before.items].reverse())
    expect(after.size).toBe(before.size)
  })

  it('ignores an out-of-range reorder rather than dropping a face', () => {
    const base = defaultLayout()
    const id = base.slots[0].id
    expect(reorderFace(base, id, 0, 9)).toBe(base)
    expect(reorderFace(base, id, -1, 0)).toBe(base)
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
