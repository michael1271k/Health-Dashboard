'use client'

import Link from 'next/link'
import { ArrowRight, Dumbbell } from 'lucide-react'
import { PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId, scheduleDayFor } from '@/lib/programs'
import { useDayVault } from '@/lib/hooks/useDayVault'
import { logicalTodayISO } from '@/lib/utils/day'

/**
 * Training-day shortcut ("Today's schedule: Upper B — log it") shown on the
 * Nutrition and Journey views. One tap opens the fullscreen deck pre-seeded
 * with the day's template — no intermediate popups. Hidden on rest days and
 * once today's session is committed.
 */
export function ScheduleShortcut() {
  const today = logicalTodayISO()
  const schedule = scheduleDayFor(today)
  const { data } = useDayVault(today)

  if (schedule === 'rest' || !schedule.dayKey) return null
  if ((data?.sessions.length ?? 0) > 0) return null

  const program = PROGRAMS[getActiveProgramId()] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
  const day = program.days.find((d) => d.key === schedule.dayKey)
  const color = day?.color ?? '#9AA6B8'

  return (
    <Link
      href={`/session?template=${schedule.dayKey}`}
      className="w-full glass-card px-4 py-3 flex items-center gap-3 transition-transform active:scale-[0.99]"
      style={{ borderColor: `${color}44`, boxShadow: `0 0 18px ${color}14` }}
    >
      <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${color}1c`, color }}>
        <Dumbbell className="w-4 h-4" aria-hidden="true" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-muted">Today’s schedule</span>
        <span className="block text-sm font-semibold truncate" style={{ color }}>
          {schedule.label}{schedule.sub ? ` · ${schedule.sub}` : ''} — log it
        </span>
      </span>
      <ArrowRight className="w-4 h-4 shrink-0" style={{ color }} aria-hidden="true" />
    </Link>
  )
}
