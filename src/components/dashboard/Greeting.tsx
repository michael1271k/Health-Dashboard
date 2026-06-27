'use client'

import { useEffect, useState } from 'react'

/**
 * Time-of-day greeting. No hardcoded name.
 * Uses Israel local time (Asia/Jerusalem) computed robustly via Intl — not
 * hardcoded sunrise/sunset, and independent of the server's timezone.
 *   Morning 05–11 · Afternoon 12–16 · Evening 17–21 · Night 22–04
 */
function israelHour(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const h = parts.find((p) => p.type === 'hour')?.value ?? '12'
  // "24" can appear at midnight in some environments → normalize to 0
  return Number(h) % 24
}

function periodFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Morning'
  if (hour >= 12 && hour < 17) return 'Afternoon'
  if (hour >= 17 && hour < 22) return 'Evening'
  return 'Night'
}

export function Greeting() {
  // Compute after mount to avoid SSR/client hydration mismatch.
  const [period, setPeriod] = useState<string | null>(null)
  useEffect(() => { setPeriod(periodFor(israelHour())) }, [])

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-text">
        Good {period ?? 'Day'}
      </h1>
    </div>
  )
}
