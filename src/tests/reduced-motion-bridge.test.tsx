import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { useHelixReducedMotion } from '@/lib/motion'

/**
 * HELIX has always had TWO reduced-motion signals that never knew about each
 * other: the OS media query, and an in-app Settings toggle mirrored onto
 * `html[data-reduce-motion]` before first paint and backed by the database.
 *
 * A user who flipped the in-app switch still got sprung route transitions; a
 * user with the OS setting on still got a fully animated modal. Either one
 * alone now means reduce, and that is what these pin.
 */

type Listener = () => void
const listeners = new Set<Listener>()

function setOsPreference(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? matches : false,
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: Listener) => { listeners.add(cb) },
    removeEventListener: (_: string, cb: Listener) => { listeners.delete(cb) },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function Probe() {
  return <span data-testid="v">{String(useHelixReducedMotion())}</span>
}
const value = () => screen.getByTestId('v').textContent

afterEach(() => {
  cleanup()
  listeners.clear()
  delete document.documentElement.dataset.reduceMotion
  setOsPreference(false)
})

describe('useHelixReducedMotion — one boolean from two signals', () => {
  it('is false when neither signal asks for it', () => {
    setOsPreference(false)
    render(<Probe />)
    expect(value()).toBe('false')
  })

  it('honours the OS setting on its own', () => {
    setOsPreference(true)
    render(<Probe />)
    expect(value()).toBe('true')
  })

  it('honours the in-app Settings toggle on its own', () => {
    // This is the half that framer-motion cannot see: it is an attribute the
    // app writes, not a media query.
    setOsPreference(false)
    document.documentElement.dataset.reduceMotion = 'true'
    render(<Probe />)
    expect(value()).toBe('true')
  })

  it('reads the flag on the FIRST render, not one frame later', () => {
    // The bug this replaces: LiquidModal resolved the flag in a useEffect keyed
    // on `open`, so the first modal of every session animated in full.
    setOsPreference(false)
    document.documentElement.dataset.reduceMotion = 'true'
    render(<Probe />)
    expect(value()).toBe('true')   // no act() flush needed to get here
  })

  it('reacts when the in-app toggle is flipped while mounted', async () => {
    setOsPreference(false)
    render(<Probe />)
    expect(value()).toBe('false')
    // MutationObserver delivers on a microtask, so this is one tick behind the
    // attribute write — correct for a Settings toggle, which is not a
    // per-frame signal, but it does have to be awaited here.
    await act(async () => {
      document.documentElement.dataset.reduceMotion = 'true'
      await Promise.resolve()
    })
    expect(value()).toBe('true')
  })

  it('reacts when the OS preference changes while mounted', () => {
    setOsPreference(false)
    render(<Probe />)
    expect(value()).toBe('false')
    act(() => {
      setOsPreference(true)
      listeners.forEach((cb) => cb())
    })
    expect(value()).toBe('true')
  })

  it('subscribes rather than polls', () => {
    const spy = vi.fn()
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: spy, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    render(<Probe />)
    expect(spy).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
