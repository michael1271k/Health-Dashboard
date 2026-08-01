'use client'

import { CalendarRange } from 'lucide-react'
import { weekStartOf } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'

/** ISO week number, so the label names the week you are actually in. */
export function isoWeekNumber(dateISO: string): number {
  const d = new Date(`${dateISO}T00:00:00Z`)
  // Shift to the Thursday of this ISO week — the year that Thursday falls in is
  // the ISO week-year, which is what makes the count correct across new year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

/** Days from the start of the current (Sunday-anchored) week through today. */
export function currentWeekDays(today = logicalTodayISO()): number {
  const start = weekStartOf(today)
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

/**
 * "Current week" as a day-count preset.
 *
 * Every chart range in the app is a single `days: number`, so this needs no new
 * plumbing — it just computes how many days have elapsed since Sunday. The
 * label carries the ISO week number because "W31" is a thing you can compare
 * notes against; "Current week" alone is not.
 */
export function CurrentWeekButton({ value, onChange }: {
  value: number
  onChange: (days: number) => void
}) {
  const today = logicalTodayISO()
  const days = currentWeekDays(today)
  const active = value === days
  return (
    <button
      onClick={() => onChange(days)}
      aria-pressed={active}
      title={`Sunday → today (${days} day${days === 1 ? '' : 's'})`}
      className={`min-w-fit px-3 py-1.5 rounded-xl text-fluid-xs font-semibold min-h-[40px] inline-flex items-center gap-1.5 transition-colors border
        ${active ? 'bg-primary/15 text-primary border-primary/30' : 'text-muted hover:text-text border-transparent'}`}
    >
      <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" />
      W{isoWeekNumber(today)}
    </button>
  )
}
