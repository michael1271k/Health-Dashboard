'use client'

import { memo, useMemo, useState } from 'react'
import { Dumbbell, FolderOpen, Moon } from 'lucide-react'
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

/**
 * Filament row — one day as a single dense line (~48px): score dot · date ·
 * macro micro-bar · session/recovery glyph · kcal. The active (open) day locks
 * into a teal-glow state so the timeline never loses its place.
 */
const DayCard = memo(function DayCard({ d, unit, active, onOpen }: {
  d: ContinuumDay
  unit: string
  active: boolean
  onOpen: (date: string) => void
}) {
  const total = (d.proteinG ?? 0) + (d.carbsG ?? 0) + (d.fatG ?? 0)
  const day = new Date(d.date + 'T00:00:00')
  const sc = scoreColor(d.score)
  return (
    // content-visibility keeps offscreen history unrendered — the perf strategy.
    <button onClick={() => onOpen(d.date)} aria-current={active ? 'date' : undefined}
      className="w-full flex items-center gap-2.5 rounded-xl px-3 min-h-[48px] text-left border transition-colors active:opacity-80"
      style={{
        contentVisibility: 'auto', containIntrinsicSize: 'auto 48px',
        background: active ? '#16F5C314' : 'rgba(255,255,255,0.02)',
        borderColor: active ? '#16F5C366' : 'rgba(255,255,255,0.06)',
        boxShadow: active ? '0 0 14px #16F5C333' : undefined,
      } as React.CSSProperties}>
      {/* Score dot — swells when active */}
      <span className="rounded-full shrink-0 transition-all"
        style={{ width: active ? 12 : 8, height: active ? 12 : 8, background: sc, boxShadow: d.score != null ? `0 0 8px ${sc}66` : undefined }}
        aria-hidden="true" />
      {/* Date chip */}
      <span className="shrink-0 w-[72px] leading-tight">
        <span className="block font-heading font-semibold text-[12px]" style={{ color: active ? '#16F5C3' : undefined }}>
          {day.toLocaleDateString('en-GB', { weekday: 'short' })} {day.getDate()}
        </span>
        <span className="block text-[9px] text-muted-vital uppercase">{day.toLocaleDateString('en-GB', { month: 'short' })}</span>
      </span>
      {/* Macro micro-bar */}
      <span className="flex h-1.5 w-12 shrink-0 rounded-full overflow-hidden bg-white/[0.05]" aria-hidden="true">
        {total > 0 && <>
          <span style={{ width: `${((d.proteinG ?? 0) / total) * 100}%`, background: MACRO_COLORS.protein }} />
          <span style={{ width: `${((d.carbsG ?? 0) / total) * 100}%`, background: MACRO_COLORS.carbs }} />
          <span style={{ width: `${((d.fatG ?? 0) / total) * 100}%`, background: MACRO_COLORS.fat }} />
        </>}
      </span>
      {/* Session / recovery glyph + label */}
      <span className="flex items-center gap-1 min-w-0 flex-1 text-[11px] truncate"
        style={{ color: d.session ? '#3EE0FF' : VIOLET }}>
        {d.session ? <Dumbbell className="w-3 h-3 shrink-0" /> : <Moon className="w-3 h-3 shrink-0" />}
        <span className="truncate">
          {d.session
            ? `${d.session.split[0]?.toUpperCase()}${d.session.split.slice(1)}${d.session.volumeKg != null ? ` ${((displayWeight(d.session.volumeKg) ?? 0) / 1000).toFixed(1)}${unit === 'lb' ? 'k' : 't'}` : ''}${(d.session.prCount ?? 0) > 0 ? ` · ${d.session.prCount}PR` : ''}`
            : 'rest'}
        </span>
      </span>
      {/* kcal */}
      <span className="helix-num text-[11px] text-muted-vital shrink-0">
        {d.calories != null ? `${Math.round(d.calories).toLocaleString()}` : '—'}
      </span>
    </button>
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
 * trio), grouped under slim era-aware week nodes. Tap a day → its Daily Nexus;
 * tap a week's folder → that week's reports.
 */
export const ContinuumTimeline = memo(function ContinuumTimeline({ era, onOpenWeek, onOpenDay, activeDate }: {
  era: 'all' | 'ppl' | 'axis'
  onOpenWeek: (weekStart: string) => void
  onOpenDay: (date: string) => void
  activeDate: string | null
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
          <div className="space-y-1.5">
            {g.days.map((d) => <DayCard key={d.date} d={d} unit={unit} active={activeDate === d.date} onOpen={onOpenDay} />)}
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
