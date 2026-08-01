'use client'

import { CalendarRange } from 'lucide-react'
import { weekStartOf } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import { planWeekNumber } from '@/lib/reports/weekNumber'
import { useUserGoals } from '@/lib/hooks/useDashboard'

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
 * plumbing — it just computes how many days have elapsed since Sunday.
 *
 * The label carries the PROGRAM week, not the ISO calendar week. It used to
 * read "W31", which is a fact about the year: it never reset when a new plan
 * was chosen in Settings and matched nothing else on screen. Now it counts from
 * the active plan's start (`user_goals.phase_started_on`), so a fresh plan
 * reads W1 immediately.
 */
export function CurrentWeekButton({ value, onChange }: {
  value: number
  onChange: (days: number) => void
}) {
  const { data: goals } = useUserGoals()
  const today = logicalTodayISO()
  const days = currentWeekDays(today)
  const week = planWeekNumber((goals as { phase_started_on?: string | null } | null)?.phase_started_on, today)
  const active = value === days
  return (
    <button
      onClick={() => onChange(days)}
      aria-pressed={active}
      title={`Plan week ${week} · Sunday → today (${days} day${days === 1 ? '' : 's'})`}
      className={`min-w-fit px-3 py-1.5 rounded-xl text-fluid-xs font-semibold min-h-[40px] inline-flex items-center gap-1.5 transition-colors border
        ${active ? 'bg-primary/15 text-primary border-primary/30' : 'text-muted hover:text-text border-transparent'}`}
    >
      <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" />
      Week {week}
    </button>
  )
}
