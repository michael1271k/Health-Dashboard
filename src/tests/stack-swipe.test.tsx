import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { WidgetGrid } from '@/components/dashboard/WidgetGrid'
import { writeLayout, type DashboardLayout } from '@/lib/dashboard/layout'

/**
 * ── WHICH WAY IS FORWARD ─────────────────────────────────────────────────────
 *
 * A stacked widget cycles on a vertical swipe, and the direction shipped
 * inverted: swiping UP moved the stack upward while stepping BACKWARDS through
 * it, so the tile travelled one way and the content went the other. That is the
 * one combination that reads as the widget arguing with the thumb.
 *
 * A stack is a deck lying on the screen. Flicking UP pushes the top card off
 * and uncovers the NEXT one — the same read as every vertical feed and as the
 * iOS Smart Stack this is modelled on.
 *
 * Direction is a single sign in a single expression, which is exactly the kind
 * of thing that gets flipped back by a well-meaning edit. Asserted through the
 * real gesture handlers rather than by reading the source, so it also covers the
 * threshold, the axis arbitration and the wrap-around.
 */

// The grid pushes arrangements to Supabase on a debounce and pulls one on mount.
// Neither has anything to do with a swipe, and both need a network.
vi.mock('@/lib/dashboard/layoutSync', () => ({
  fetchRemoteLayout: () => Promise.resolve(null),
  pushRemoteLayout: () => Promise.resolve(),
  pickLayout: (local: unknown) => local,
  PUSH_DEBOUNCE_MS: 1200,
}))
vi.mock('@/lib/native/haptics', () => ({
  tapLight: () => Promise.resolve(),
  tapSuccess: () => Promise.resolve(),
  tapWarn: () => Promise.resolve(),
  tapSelection: () => Promise.resolve(),
}))

const STACK: DashboardLayout = {
  slots: [{ id: 'stack-1', size: 'm', items: ['recovery', 'sleep', 'steps'] }],
  hidden: [],
  updatedAt: Date.now(),
}

/**
 * The id of the face currently on top of the stack.
 *
 * The FIRST one: `reconcile` appends every catalogue widget that has no face to
 * the end of the layout, so the grid also renders a plain slot for each of the
 * other fifteen. The stacked slot is the one this file seeded, and it stays at
 * the head of the list.
 */
function stackEl(): HTMLElement {
  return screen.getAllByTestId('face')[0]
}
function face(): string {
  return stackEl().textContent ?? ''
}

function mountGrid() {
  writeLayout(STACK, 'phone')
  render(
    <WidgetGrid>
      {(id) => <span data-testid="face">{id}</span>}
    </WidgetGrid>,
  )
}

/**
 * One swipe. `dy` is the finger's travel: negative is upward.
 *
 * The flip fires on `pointermove`, the instant the threshold is crossed, rather
 * than on release — that is what makes the tile feel like it answered the swipe
 * instead of the end of it — so `pointerUp` here is only tidying up.
 */
function swipe(dy: number, dx = 0) {
  const target = stackEl()
  act(() => {
    fireEvent.pointerDown(target, { clientX: 100, clientY: 300, pointerType: 'touch' })
    fireEvent.pointerMove(target, { clientX: 100 + dx, clientY: 300 + dy, pointerType: 'touch' })
    fireEvent.pointerUp(target, { pointerType: 'touch' })
  })
}

beforeEach(() => { window.localStorage.clear() })
afterEach(() => { cleanup(); window.localStorage.clear() })

describe('the stack swipe', () => {
  it('goes FORWARD on an upward swipe', () => {
    mountGrid()
    expect(face()).toBe('recovery')
    swipe(-60)
    expect(face()).toBe('sleep')
    swipe(-60)
    expect(face()).toBe('steps')
  })

  it('goes BACKWARD on a downward swipe', () => {
    mountGrid()
    swipe(-60)
    expect(face()).toBe('sleep')
    swipe(60)
    expect(face()).toBe('recovery')
  })

  it('wraps around in both directions', () => {
    mountGrid()
    // Backwards off the front lands on the last face, not on nothing.
    swipe(60)
    expect(face()).toBe('steps')
    swipe(-60)
    expect(face()).toBe('recovery')
  })

  it('ignores travel below the threshold, so a tap is still a tap', () => {
    mountGrid()
    swipe(-12)
    expect(face()).toBe('recovery')
  })

  it('hands a horizontal drag back to the page', () => {
    mountGrid()
    // Horizontal-dominant travel belongs to the scroller and to the back
    // gesture, never to the stack — even when the vertical component alone
    // would have been enough to flip.
    swipe(-30, 90)
    expect(face()).toBe('recovery')
  })
})
