'use client'

import { memo, useMemo, useState } from 'react'
import Link from 'next/link'
import { Dumbbell, FolderOpen, Moon, Droplets, UtensilsCrossed } from 'lucide-react'
import { useContinuum, type ContinuumDay } from '@/lib/hooks/useContinuum'
import { getWeekPhase, type WeekPhase } from '@/lib/phases'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { displayWeight, useUnitSystem } from '@/lib/utils/units'

const VIOLET = '#8B7CFF'
const STEEL = '#8B97B2'

function scoreColor(score: number | null): string {
  if (score == null) return 'rgba(255,255,255,0.12)'
  if (score >= 80) return '#16F5C3'
  if (score >= 60) return '#3EE0FF'
  if (score >= 40) return '#FFB86B'
  return '#FF5470'
}

/** Sunday week-start for a YYYY-MM-DD date. */
function weekStartOf(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

const DayCard = memo(function DayCard({ d, unit }: { d: ContinuumDay; unit: string }) {
  const total = (d.proteinG ?? 0) + (d.carbsG ?? 0) + (d.fatG ?? 0)
  const pretty = new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const trio = [
    { on: d.sleepOk, Icon: Moon, color: VIOLET, label: 'sleep' },
    { on: d.waterOk, Icon: Droplets, color: '#3EE0FF', label: 'water' },
    { on: d.foodOk, Icon: UtensilsCrossed, color: '#16F5C3', label: 'food' },
  ]
  return (
    // content-visibility keeps offscreen history unrendered — the perf strategy.
    <Link href={`/day/${d.date}`} prefetch={false}
      className="helix-card flex items-center gap-3 px-3.5 py-3 active:opacity-80"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 74px' } as React.CSSProperties}>
      {/* Score dot + date */}
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: scoreColor(d.score), boxShadow: d.score != null ? `0 0 8px ${scoreColor(d.score)}66` : undefined }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-heading font-semibold text-fluid-sm text-text truncate">{pretty}</span>
          {d.score != null && <span className="helix-num text-fluid-xs" style={{ color: scoreColor(d.score) }}>{d.score}</span>}
        </div>
        {/* Macro micro-bar */}
        {total > 0 ? (
          <div className="flex h-1.5 rounded-full overflow-hidden mt-1.5 bg-white/[0.04]" aria-hidden="true">
            <span style={{ width: `${((d.proteinG ?? 0) / total) * 100}%`, background: MACRO_COLORS.protein }} />
            <span style={{ width: `${((d.carbsG ?? 0) / total) * 100}%`, background: MACRO_COLORS.carbs }} />
            <span style={{ width: `${((d.fatG ?? 0) / total) * 100}%`, background: MACRO_COLORS.fat }} />
          </div>
        ) : (
          <div className="h-1.5 rounded-full mt-1.5 bg-white/[0.04]" aria-hidden="true" />
        )}
        <div className="flex items-center gap-2 mt-1.5 text-fluid-xs text-muted-vital">
          {d.session ? (
            <span className="flex items-center gap-1 truncate" style={{ color: '#3EE0FF' }}>
              <Dumbbell className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {d.session.split[0]?.toUpperCase()}{d.session.split.slice(1)}
                {d.session.volumeKg != null && ` · ${((displayWeight(d.session.volumeKg) ?? 0) / 1000).toFixed(1)}${unit === 'lb' ? 'k' : 't'}`}
                {(d.session.prCount ?? 0) > 0 && ` · ${d.session.prCount} PR`}
              </span>
            </span>
          ) : (
            <span style={{ color: VIOLET }}>recovery</span>
          )}
          {d.calories != null && <span className="helix-num shrink-0">{Math.round(d.calories).toLocaleString()} kcal</span>}
        </div>
      </div>
      {/* Core-trio ticks */}
      <span className="flex flex-col gap-1 shrink-0" aria-label={`Logged: ${trio.filter((t) => t.on).map((t) => t.label).join(', ') || 'nothing yet'}`}>
        {trio.map(({ on, Icon, color, label }) => (
          <Icon key={label} className="w-3 h-3" style={{ color: on ? color : 'rgba(255,255,255,0.14)' }} aria-hidden="true" />
        ))}
      </span>
    </Link>
  )
})

const WeekHeader = memo(function WeekHeader({ weekStart, phase, onOpenWeek }: {
  weekStart: string
  phase: WeekPhase | null
  onOpenWeek: (weekStart: string) => void
}) {
  const helix = phase?.era === 'helix'
  const color = phase ? (helix ? '#3EE0FF' : STEEL) : STEEL
  const label = phase?.label ?? `Week of ${new Date(weekStart + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  return (
    <div className="flex items-center gap-2 pt-3 pb-1">
      <span className="h-2 w-2 rounded-full border-2 shrink-0" style={{ borderColor: color, boxShadow: helix ? `0 0 8px ${color}66` : undefined }} aria-hidden="true" />
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] truncate" style={{ color }}>{label}</span>
      <span className="h-px flex-1" style={{ background: `${color}30` }} />
      <button onClick={() => onOpenWeek(weekStart)} className="p-1.5 rounded-lg hover:bg-white/[0.06] min-h-[32px]" style={{ color }}
        aria-label={`Open files for ${label}`}>
        <FolderOpen className="w-3.5 h-3.5" />
      </button>
    </div>
  )
})

/**
 * The Continuum — Journey's primary surface. A unified, day-first
 * timeline: every day is one card (score · macros · session/recovery · core
 * trio), grouped under slim era-aware week nodes. Tap a day → its Day Vault;
 * tap a week's folder → that week's reports.
 */
export const ContinuumTimeline = memo(function ContinuumTimeline({ era, onOpenWeek }: {
  era: 'all' | 'ppl' | 'axis'
  onOpenWeek: (weekStart: string) => void
}) {
  const [fullHistory, setFullHistory] = useState(false)
  const { data, isLoading } = useContinuum(fullHistory)
  const unit = useUnitSystem()

  const groups = useMemo(() => {
    const out: Array<{ weekStart: string; phase: WeekPhase | null; days: ContinuumDay[] }> = []
    for (const d of data ?? []) {
      const ws = weekStartOf(d.date)
      const phase = getWeekPhase(ws)
      if (era !== 'all') {
        const dayEra = phase?.era ?? 'ppl'
        if ((era === 'axis') !== (dayEra === 'helix')) continue
      }
      const last = out[out.length - 1]
      if (last?.weekStart === ws) last.days.push(d)
      else out.push({ weekStart: ws, phase, days: [d] })
    }
    return out
  }, [data, era])

  if (isLoading) {
    return (
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => <div key={i} className="helix-card h-[74px] animate-pulse" />)}
      </div>
    )
  }
  if (!groups.length) {
    return <p className="text-fluid-sm text-muted-vital py-8 text-center">No logged days in this era yet.</p>
  }

  return (
    <div>
      {groups.map((g) => (
        <div key={g.weekStart}>
          <WeekHeader weekStart={g.weekStart} phase={g.phase} onOpenWeek={onOpenWeek} />
          <div className="space-y-2">
            {g.days.map((d) => <DayCard key={d.date} d={d} unit={unit} />)}
          </div>
        </div>
      ))}
      {!fullHistory && (
        <button onClick={() => setFullHistory(true)}
          className="btn-glass w-full justify-center min-h-[44px] mt-3">
          Load full history
        </button>
      )}
    </div>
  )
})
