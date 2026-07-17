'use client'

import { useState } from 'react'
import { CalendarRange, ChevronRight, Trophy } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { useWeekSessions, weekStartOf, isoAddDays, type WeekSummary } from '@/lib/hooks/useWeekSessions'
import { PROGRAMS, DEFAULT_PROGRAM_ID } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'

const GOLD = '#E8C57A'
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Weekly Session Summary — deterministic, no LLM. The gold CTA appears on
 * Fridays once the week's final session (Legs B) is committed; the quiet
 * footer link reviews the completed prior week any day.
 */
export function WeeklySummaryCard() {
  const today = logicalTodayISO()
  const thisWeekStart = weekStartOf(today)
  const priorWeekStart = isoAddDays(thisWeekStart, -7)

  const thisWeek = useWeekSessions(thisWeekStart)
  const priorWeek = useWeekSessions(priorWeekStart)
  const [open, setOpen] = useState<'this' | 'prior' | null>(null)

  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
  const todaySessions = thisWeek.data?.sessions.filter((s) => s.date === today) ?? []
  // Friday + the final session of the week committed (day_key when known).
  const weekComplete = weekday === 5
    && todaySessions.some((s) => (s.dayKey ? s.dayKey === 'legs_b' : true))

  const shown = open === 'this' ? thisWeek.data : open === 'prior' ? priorWeek.data : null
  const baseline = open === 'this' ? priorWeek.data : null

  return (
    <>
      {weekComplete && (
        <button onClick={() => setOpen('this')}
          className="w-full glass-card px-4 py-3 flex items-center gap-3 text-left transition-transform active:scale-[0.99]"
          style={{ borderColor: `${GOLD}55`, boxShadow: `0 0 20px ${GOLD}1f` }}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${GOLD}1c`, color: GOLD }}>
            <Trophy className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold" style={{ color: GOLD }}>Week complete — Session Summary ready</span>
            <span className="block text-[11px] text-muted">
              {thisWeek.data?.sessions.length ?? 0} sessions · {thisWeek.data?.totals.volumeKg.toLocaleString() ?? 0} kg · vs last week inside
            </span>
          </span>
          <ChevronRight className="w-4 h-4 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
        </button>
      )}

      {!weekComplete && (priorWeek.data?.sessions.length ?? 0) > 0 && (
        <button onClick={() => setOpen('prior')}
          className="w-full flex items-center justify-center gap-1.5 text-fluid-xs text-muted hover:text-text min-h-[36px] transition-colors">
          <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" /> Last week in review
        </button>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)}
        title={open === 'this' ? 'This Week — Session Summary' : 'Last Week — Session Summary'}>
        {shown && <WeekBody week={shown} baseline={baseline} />}
      </Sheet>
    </>
  )
}

function WeekBody({ week, baseline }: { week: WeekSummary; baseline: WeekSummary | null | undefined }) {
  const program = PROGRAMS[DEFAULT_PROGRAM_ID]
  const dayLabel = (s: WeekSummary['sessions'][number]) =>
    (s.dayKey && program.days.find((d) => d.key === s.dayKey)?.label)
    ?? s.splitDay[0]?.toUpperCase() + s.splitDay.slice(1)

  const delta = (cur: number, base: number | undefined | null): string | null => {
    if (base == null || base === 0) return null
    const pct = Math.round(((cur - base) / base) * 100)
    if (pct === 0) return null
    return `${pct > 0 ? '+' : ''}${pct}%`
  }

  const stats: Array<{ label: string; value: string; d: string | null; goodUp?: boolean }> = [
    { label: 'Volume', value: `${week.totals.volumeKg.toLocaleString()}kg`, d: delta(week.totals.volumeKg, baseline?.totals.volumeKg) },
    { label: 'Sets', value: String(week.totals.sets), d: delta(week.totals.sets, baseline?.totals.sets) },
    { label: 'PRs', value: String(week.totals.prs), d: null },
    { label: 'Time', value: `${Math.round(week.totals.durationMin)}m`, d: delta(week.totals.durationMin, baseline?.totals.durationMin) },
    { label: 'Avg HR', value: week.totals.avgBpm != null ? `${week.totals.avgBpm}` : '—', d: null },
    { label: 'Calories', value: week.totals.calories ? week.totals.calories.toLocaleString() : '—', d: delta(week.totals.calories, baseline?.totals.calories) },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {stats.map((s) => (
          <div key={s.label} className="glass-card py-2.5">
            <div className="helix-num font-bold text-fluid-sm text-text tabular-nums">{s.value}</div>
            <div className="text-[10px] text-muted">{s.label}</div>
            {s.d && (
              <div className="text-[10px] font-semibold tabular-nums"
                style={{ color: s.d.startsWith('+') ? '#43F59B' : '#FF5470' }}>{s.d} vs prior</div>
            )}
          </div>
        ))}
      </div>

      {week.sessions.length === 0
        ? <p className="text-sm text-muted">No sessions this week.</p>
        : (
          <div className="space-y-1.5">
            {week.sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl bg-white/[0.02] border border-white/[0.05] px-3 py-2">
                <span className="text-[10px] font-bold uppercase text-muted w-8 shrink-0">
                  {WD[new Date(`${s.date}T12:00:00Z`).getUTCDay()]}
                </span>
                <span className="flex-1 min-w-0 text-sm font-medium text-text truncate">{dayLabel(s)}</span>
                {(s.prCount ?? 0) > 0 && (
                  <span className="shrink-0 text-[10px] font-bold" style={{ color: GOLD }}>{s.prCount} PR</span>
                )}
                <span className="shrink-0 helix-num text-xs text-muted tabular-nums">
                  {s.volumeKg != null ? `${Math.round(s.volumeKg).toLocaleString()}kg` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
