'use client'

import { useEffect, useState } from 'react'
import { logicalTodayISO } from '@/lib/utils/day'

/** Milliseconds from now until the next device-local 00:00:00. */
function msUntilLocalMidnight(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  // +250 ms so the timer fires just AFTER the boundary — landing exactly on it
  // can still read the old date on a device whose clock lags the timer.
  return Math.max(250, next.getTime() - now.getTime() + 250)
}

/**
 * The current logical date, re-rendered EXACTLY at local midnight.
 *
 * Anything derived from "today" — the plan week number, a day heading — was
 * previously recomputed only when some unrelated interval happened to tick, so
 * "Wk 4" could keep reading "Wk 3" for up to a minute into the new week. A
 * chained `setTimeout` aimed at the next boundary is exact and costs one timer,
 * where polling for it costs 1,440 wake-ups a day to be late anyway.
 *
 * `visibilitychange` resyncs on return: a backgrounded PWA has its timers
 * throttled or dropped by the OS, so the timeout alone cannot be trusted to
 * have fired while the app was asleep.
 */
export function useLogicalDate(): string {
  const [date, setDate] = useState(logicalTodayISO)

  useEffect(() => {
    let id: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (id) clearTimeout(id)
      id = setTimeout(() => { setDate(logicalTodayISO()); schedule() }, msUntilLocalMidnight())
    }
    const resync = () => {
      if (document.visibilityState !== 'visible') return
      setDate(logicalTodayISO())
      schedule()
    }
    schedule()
    document.addEventListener('visibilitychange', resync)
    return () => { if (id) clearTimeout(id); document.removeEventListener('visibilitychange', resync) }
  }, [])

  return date
}
