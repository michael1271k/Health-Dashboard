'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A boolean that turns itself off again — the "Copied", "Saved", "Logged" tick
 * that confirms an action and then gets out of the way.
 *
 * ── WHY IT IS A HOOK AND NOT THREE `setTimeout`s ─────────────────────────────
 * It was three, in `PathfinderTimeline`, `DailyWidgets` and `InBody`, and all
 * three were written the same way:
 *
 *     setSaved(true)
 *     setTimeout(() => setSaved(false), 2200)
 *
 * with no handle and no cleanup. Both failure modes are real on this app: a
 * confirmation is by definition shown at the moment the user is most likely to
 * navigate away, so the callback routinely fired into an unmounted component;
 * and a second action inside the window left two timers racing, so the tick
 * could clear early. Neither is visible in a test and neither crashes.
 *
 * Re-flashing restarts the clock rather than stacking a second timer, and the
 * pending timer is cleared on unmount.
 */
export function useFlash(ms = 2200): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const flash = useCallback(() => {
    setOn(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { timer.current = null; setOn(false) }, ms)
  }, [ms])

  return [on, flash]
}
