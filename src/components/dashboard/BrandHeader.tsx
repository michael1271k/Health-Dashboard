'use client'

import { useEffect, useState } from 'react'
import { ApexMark } from '@/components/ApexMark'

/** Israel-local hour, robust to server timezone. */
function israelHour(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false,
  }).formatToParts(new Date())
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '12') % 24
}

function periodFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

/**
 * Premium dashboard header: glowing gradient "APEX" wordmark, an elegant
 * subtitle, and a time-of-day + date line. Greeting computed after mount to
 * avoid hydration mismatch.
 */
export function BrandHeader() {
  const [period, setPeriod] = useState<string | null>(null)
  useEffect(() => { setPeriod(periodFor(israelHour())) }, [])

  const today = new Intl.DateTimeFormat('en-IL', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date())

  return (
    <header className="space-y-1.5">
      {/* Logo sized in `em` so it tracks the wordmark cap-height on every screen */}
      <h1 className="flex items-center gap-2.5 text-fluid-3xl leading-none">
        <ApexMark className="h-[0.95em] w-[0.95em] shrink-0" />
        <span className="apex-wordmark font-heading font-extrabold tracking-tight">APEX</span>
      </h1>
      <p className="font-heading text-fluid-base font-medium text-text/90">Your Personal Health Dashboard</p>
      <p className="text-fluid-xs text-muted-vital">Good {period ?? 'day'} · {today}</p>
    </header>
  )
}
