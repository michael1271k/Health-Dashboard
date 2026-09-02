'use client'

import { useCallback, useEffect, useRef } from 'react'
import { tapLight } from '@/lib/native/haptics'

/** How long the button is held before the fine step takes over. */
const HOLD_MS = 400
/** How often the fine step repeats while held. */
const REPEAT_MS = 120
/** Movement that cancels the gesture — the same 8px hysteresis dnd-kit uses. */
const SLOP = 8

/**
 * Tap for the coarse step, hold for the fine one.
 *
 * ── THE COARSE STEP FIRES ON PRESS, NOT ON RELEASE ───────────────────────────
 * It used to fire in `pointerup`. Nothing was slow about the handler — the
 * whole cost is that the value could not move until the finger came off, so
 * five taps on `+` were five press-hold-release cycles before the number had
 * caught up, and any press that lingered past `HOLD_MS` turned into microloads
 * instead of the plate you asked for. Both read as the button sticking.
 *
 * A stepper is the one control Apple explicitly fires on touch-DOWN and repeats
 * while held, for exactly this reason (`apple-design` §1: the moment lag appears
 * the feeling of directness falls off a cliff), and the sibling controls in this
 * app already acknowledge the press rather than the release — `Segmented`,
 * `SetActionSheet`, the pair tick. So the step lands on the frame the finger
 * touches the glass, the haptic goes with it, and the hold still takes over at
 * 400 ms with the fine step.
 *
 * A drag off the button no longer un-does the step it already applied, which is
 * how a real stepper behaves; and the button carries `touch-action: none`, so a
 * press that starts here was never going to scroll the deck anyway. The slop
 * check survives to cancel the HOLD — a finger that wanders is not asking for
 * thirty microloads.
 *
 * ── WHY THE MICROLOADS BECAME A GESTURE ──────────────────────────────────────
 * The weight tuner used to carry five segments — `−2.5 │ −0.25 │ value │ +0.25
 * │ +2.5` — across a full-width row, and the reps tuner another row under it.
 * Two rows, ~110px, for one set. Merging them onto one line halves that, and
 * half a line has no room for four step buttons.
 *
 * Holding a stepper to fine-tune is the platform's own convention (a stepper on
 * iOS accelerates while held; this inverts it to *slow down*, which is what a
 * weight actually needs — you want 2.5kg fast and 0.25kg deliberately). The
 * button says so in its `aria-label` and its tooltip, because a gesture nobody
 * is told about is a feature nobody has.
 *
 * ── WHAT THIS GUARDS AGAINST ─────────────────────────────────────────────────
 * A repeat timer attached to a pointer is a memory leak and a stuck key waiting
 * to happen: `pointerup` outside the element, a cancelled gesture, an unmount
 * mid-hold. So the pointer is CAPTURED (events keep coming to this element even
 * once the finger leaves it), every exit path clears the timers, and the effect
 * clears them again on unmount.
 */
export function useHoldRepeat({ onTap, onHold, disabled = false }: {
  /** Fired once on release, when the press never became a hold. */
  onTap: () => void
  /** Fired every `REPEAT_MS` while held past `HOLD_MS`. */
  onHold: () => void
}   & { disabled?: boolean }) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const held = useRef(false)
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null)

  // Read through refs so the handlers below never need to be rebuilt — these
  // are on up to six buttons per open tuner.
  const tapRef = useRef(onTap)
  const holdRef = useRef(onHold)
  tapRef.current = onTap
  holdRef.current = onHold

  const stop = useCallback(() => {
    if (delay.current) { clearTimeout(delay.current); delay.current = null }
    if (repeat.current) { clearInterval(repeat.current); repeat.current = null }
  }, [])

  useEffect(() => stop, [stop])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    // Capture, so a finger that drifts off the 36px button still ends the hold
    // here rather than leaving the interval running forever.
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not fatal */ }
    start.current = { x: e.clientX, y: e.clientY }
    held.current = false
    // The step, on the frame of the press. See the header.
    void tapLight()
    tapRef.current()
    delay.current = setTimeout(() => {
      held.current = true
      holdRef.current()
      repeat.current = setInterval(() => holdRef.current(), REPEAT_MS)
    }, HOLD_MS)
  }, [disabled])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const s = start.current
    if (!s || held.current) return
    // Past the slop this was a scroll, not a press. Cancel before it becomes a
    // hold — a deck is a scrolling surface and the tuner is in the middle of it.
    if (Math.abs(e.clientX - s.x) > SLOP || Math.abs(e.clientY - s.y) > SLOP) {
      stop()
      start.current = null
    }
  }, [stop])

  // Release does nothing but tidy up: the coarse step was applied on press and
  // any fine steps were applied while held.
  const onPointerUp = useCallback(() => {
    stop()
    start.current = null
    held.current = false
  }, [stop])

  const onPointerCancel = useCallback(() => {
    stop()
    start.current = null
    held.current = false
  }, [stop])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}
