import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useScrollMemory } from '@/lib/nav/scrollMemory'

/**
 * ── THE BUG THIS FILE EXISTS FOR ─────────────────────────────────────────────
 *
 * Scroll memory shipped broken, passed its own tests, and the tests were the
 * reason: they asserted that `rememberScroll` did not throw. Nothing asserted
 * the only thing that mattered — that the value it stores is the offset of the
 * page being LEFT.
 *
 * It was not. The capture ran in a passive-effect cleanup, and React runs those
 * AFTER the incoming tree's layout effects, by which point App Router has
 * already reset the document to the top. Every tab stored 0, every restore read
 * 0 as "nothing remembered", and returning to a tab put you at the top — which
 * is precisely the behaviour the feature was added to remove.
 *
 * So the shape of every test here is the navigation SEQUENCE, not a single
 * call: scroll, leave, have the document reset underneath you, come back.
 */

let scrollTarget: number | null = null
let scrollCalls = 0

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true })
}

/** Scroll the way a finger does — the value moves, then the event fires. */
function userScrollTo(y: number) {
  act(() => {
    setScrollY(y)
    window.dispatchEvent(new Event('scroll'))
  })
}

function Harness({ path }: { path: string }) {
  useScrollMemory(path)
  return null
}

/** Mount a route, run its restore, and return an unmount that leaves it. */
function visit(path: string) {
  const view = render(<Harness path={path} />)
  return () => view.unmount()
}

beforeEach(() => {
  scrollTarget = null
  scrollCalls = 0
  setScrollY(0)
  // jsdom implements neither of these. `scrollTo` records what was asked for;
  // it deliberately does NOT move `scrollY`, because the real failure mode is a
  // request that gets clamped by a page too short to honour it.
  window.scrollTo = ((opts: ScrollToOptions | number) => {
    scrollCalls += 1
    scrollTarget = typeof opts === 'number' ? opts : (opts?.top ?? null)
  }) as typeof window.scrollTo
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('scroll memory survives the navigation commit', () => {
  it('restores the offset the user actually left, not the one the reset wrote', () => {
    const leaveWorkout = visit('/workout-a')
    userScrollTo(1500)
    leaveWorkout()

    // App Router resets the document to the top as part of the same commit that
    // mounts the next route. Under the old implementation this landed in
    // `/workout-a`'s slot and destroyed it.
    const leaveNutrition = visit('/nutrition-a')
    userScrollTo(0)
    leaveNutrition()

    visit('/workout-a')
    expect(scrollTarget).toBe(1500)
  })

  it('keeps a separate offset per route', () => {
    const leaveA = visit('/tab-a'); userScrollTo(900); leaveA()
    const leaveB = visit('/tab-b'); userScrollTo(300); leaveB()

    visit('/tab-a')
    expect(scrollTarget).toBe(900)
    cleanup()

    visit('/tab-b')
    expect(scrollTarget).toBe(300)
  })

  it('ignores the scroll events its own restore causes', () => {
    const leave = visit('/settle-a'); userScrollTo(1200); leave()

    // Coming back: the restore fires, and the browser answers with scroll
    // events. Recording those would overwrite 1200 with wherever a still-short
    // page allowed us to land.
    visit('/settle-a')
    expect(scrollTarget).toBe(1200)
    act(() => { setScrollY(120); window.dispatchEvent(new Event('scroll')) })
    cleanup()

    visit('/settle-a')
    expect(scrollTarget).toBe(1200)
  })

  it('hands the offset back to the user the moment they scroll themselves', () => {
    const leave = visit('/abort-a'); userScrollTo(1000); leave()

    visit('/abort-a')
    // A finger on the glass outranks a remembered offset. From here on their
    // scrolling is recorded again.
    act(() => { window.dispatchEvent(new Event('touchstart')) })
    userScrollTo(240)
    cleanup()

    visit('/abort-a')
    expect(scrollTarget).toBe(240)
  })

  it('does no work at all for a route that was at the top', () => {
    const leave = visit('/top-a'); userScrollTo(4); leave()
    scrollCalls = 0

    visit('/top-a')
    // Four pixels is not a position worth restoring, and a `scrollTo` on every
    // navigation that has nothing to restore is the cost the first version paid
    // on every route change in the app.
    expect(scrollCalls).toBe(0)
  })

  it('a route never visited restores nothing', () => {
    visit('/never-seen')
    expect(scrollCalls).toBe(0)
  })
})
