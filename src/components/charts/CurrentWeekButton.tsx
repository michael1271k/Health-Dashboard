'use client'

import { CalendarRange } from 'lucide-react'
import { weekStartOf } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import { programWeekNumber } from '@/lib/reports/weekNumber'
import { useLogicalDate } from '@/lib/hooks/useLogicalDate'

/** Days from the start of the current (configured) week through today. */
export function currentWeekDays(today = logicalTodayISO()): number {
  const start = weekStartOf(today)
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

/**
 * "Current week" as a day-count preset.
 *
 * Every chart range in the app is a single `days: number`, so this needs no new
 * plumbing — it just computes how many days have elapsed since Sunday.
 *
 * The label carries the PROGRAM week, not the ISO calendar week ("W31" is a
 * fact about the year and matched nothing else on screen) and not a
 * plan-relative count of its own — it is `programWeekNumber`, the same number
 * the Momentum timeline labels its capsules with.
 */
export function CurrentWeekButton({ value, onChange }: {
  value: number
  onChange: (days: number) => void
}) {
  const today = useLogicalDate()
  const days = currentWeekDays(today)
  const week = programWeekNumber(today)
  const active = value === days
  return (
    <button
      onClick={() => onChange(days)}
      aria-pressed={active}
      title={`Plan week ${week} · week start → today (${days} day${days === 1 ? '' : 's'})`}
      className={`min-w-fit px-3 py-1.5 rounded-xl text-fluid-xs font-semibold min-h-[40px] inline-flex items-center gap-1.5 transition-colors border
        ${active ? 'bg-primary/15 text-primary border-primary/30' : 'text-muted hover:text-text border-transparent'}`}
    >
      <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" />
      Week {week}
    </button>
  )
}
