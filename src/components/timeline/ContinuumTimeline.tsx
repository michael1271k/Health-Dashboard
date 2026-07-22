'use client'

import { memo, useMemo, useState } from 'react'
import { Dumbbell, FolderOpen, Footprints, Moon } from 'lucide-react'
import { useContinuum, type ContinuumDay } from '@/lib/hooks/useContinuum'
import { getWeekPhase, type WeekPhase } from '@/lib/phases'
import { eraForDate, programDayLabel } from '@/lib/programs'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { displayWeight, useUnitSystem, fmtVolume } from '@/lib/utils/units'
import { blurOnTap } from '@/lib/utils/blurOnTap'

const VIOLET = '#EC4899'
const STEEL = '#8B97B2'

function scoreColor(score: number | null): string {
  if (score == null) return 'rgba(255,255,255,0.12)'
  if (score >= 80) return '#8B5CF6'
  if (score >= 60) return '#22D3EE'
  if (score >= 40) return '#FBBF24'
  return '#FB7185'
}

/** Sunday week-start for a YYYY-MM-DD date. */
function weekStartOf(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

// Rough per-macro reference targets for the row's slider fills (this athlete's
// cut) — glanceable adherence, not a precise goal read.
const ROW_MACRO_TARGET = { protein: 170, carbs: 210, fat: 60 }

/** One labelled macro slider inside a day row. */
function MacroBar({ label, g, target, color }: { label: string; g: number | null; target: number; color: string }) {
  const pct = g != null ? Math.min(1, g / target) : 0
  return (
    <span className="flex-1 min-w-0 flex items-center gap-1">
      <span className="text-[9px] font-bold shrink-0" style={{ color }}>{label}</span>
      <span className="flex-1 min-w-0 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct * 100}%`, background: color }} />
      </span>
    </span>
  )
}

/**
 * Day row — Apple-clean: score dot · date · calories on the top line, three
 * colored macro sliders, then the workout name + volume. The workout label
 * resolves from day_key (so a Tuesday arms day reads "Delts & Arms", never
 * "Upper"). content-visibility keeps offscreen history unrendered.
 */
export const DayCard = memo(function DayCard({ d, unit, active, onOpen }: {
  d: ContinuumDay
  unit: string
  active: boolean
  onOpen: (date: string) => void
}) {
  const day = new Date(d.date + 'T00:00:00')
  const sc = scoreColor(d.score)
  const workoutLabel = d.session ? programDayLabel(d.session.dayKey, d.session.split) : null
  const vol = d.session?.volumeKg != null ? fmtVolume(displayWeight(d.session.volumeKg)) : null
  return (
    <button onClick={() => onOpen(d.date)} onPointerUp={blurOnTap} aria-current={active ? 'date' : undefined}
      className="w-full rounded-xl px-3 py-2.5 text-left border transition-colors active:opacity-80"
      style={{
        contentVisibility: 'auto', containIntrinsicSize: 'auto 88px',
        background: active ? '#8B5CF614' : 'rgba(255,255,255,0.02)',
        borderColor: active ? '#8B5CF666' : 'rgba(255,255,255,0.06)',
        boxShadow: active ? '0 0 14px #8B5CF633' : undefined,
      } as React.CSSProperties}>
      {/* Top line — score dot · date · calories */}
      <div className="flex items-center gap-2.5">
        <span className="rounded-full shrink-0 transition-all"
          style={{ width: active ? 11 : 8, height: active ? 11 : 8, background: sc, boxShadow: d.score != null ? `0 0 8px ${sc}66` : undefined }}
          aria-hidden="true" />
        <span className="shrink-0 font-heading font-semibold text-[13px]" style={{ color: active ? '#8B5CF6' : undefined }}>
          {day.toLocaleDateString('en-GB', { weekday: 'short' })} {day.getDate()}
          <span className="text-[9px] text-muted uppercase ml-1">{day.toLocaleDateString('en-GB', { month: 'short' })}</span>
        </span>
        <span className="flex-1" />
        <span className="helix-num text-fluid-sm font-bold text-text tabular-nums">{d.calories != null ? Math.round(d.calories).toLocaleString() : '—'}</span>
        <span className="text-[9px] text-muted">kcal</span>
      </div>
      {/* Macro sliders — Carbs · Fat · Protein */}
      <div className="flex items-center gap-3 mt-2 pl-[18px]">
        <MacroBar label="C" g={d.carbsG} target={ROW_MACRO_TARGET.carbs} color={MACRO_COLORS.carbs} />
        <MacroBar label="F" g={d.fatG} target={ROW_MACRO_TARGET.fat} color={MACRO_COLORS.fat} />
        <MacroBar label="P" g={d.proteinG} target={ROW_MACRO_TARGET.protein} color={MACRO_COLORS.protein} />
      </div>
      {/* Workout / rest line + steps */}
      <div className="flex items-center gap-1.5 mt-2 pl-[18px] text-[11px] min-w-0">
        <span className="flex items-center gap-1.5 min-w-0 flex-1" style={{ color: d.session ? '#22D3EE' : VIOLET }}>
          {d.session ? <Dumbbell className="w-3 h-3 shrink-0" /> : <Moon className="w-3 h-3 shrink-0" />}
          <span className="truncate">
            {d.session
              ? `${workoutLabel}${vol ? ` · ${vol} ${unit}` : ''}${(d.session.prCount ?? 0) > 0 ? ` · ${d.session.prCount} PR` : ''}`
              : 'Rest'}
          </span>
        </span>
        {d.steps != null && (
          <span className="flex items-center gap-1 shrink-0" style={{ color: '#818CF8' }}>
            <Footprints className="w-3 h-3" aria-hidden="true" />
            <span className="helix-num tabular-nums">{Math.round(d.steps).toLocaleString()}</span>
          </span>
        )}
      </div>
    </button>
  )
})

const WeekHeader = memo(function WeekHeader({ weekStart, phase, onOpenWeek }: {
  weekStart: string
  phase: WeekPhase | null
  onOpenWeek: (weekStart: string) => void
}) {
  const helix = phase?.era === 'helix'
  const color = phase ? (helix ? '#22D3EE' : STEEL) : STEEL
  const label = phase?.label ?? `Week of ${new Date(weekStart + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  return (
    <div className="flex items-center gap-2 pt-3 pb-1">
      <span className="h-2 w-2 rounded-full border-2 shrink-0" style={{ borderColor: color, boxShadow: helix ? `0 0 8px ${color}66` : undefined }} aria-hidden="true" />
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] truncate" style={{ color }}>{label}</span>
      <span className="h-px flex-1" style={{ background: `${color}30` }} />
      <button onClick={() => onOpenWeek(weekStart)} onPointerUp={blurOnTap} className="p-1.5 rounded-lg hover:bg-white/[0.06] min-h-[32px]" style={{ color }}
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
      // Filter DAYS by the unified date boundary (eraForDate), not the week
      // phase — the boundary week (12–18 Jul) straddles both eras, and its
      // PPL days must not leak into the Helix view (or vice versa). Week
      // headers still carry their getWeekPhase label.
      if (era !== 'all' && eraForDate(d.date) !== era) continue
      const ws = weekStartOf(d.date)
      const phase = getWeekPhase(ws)
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
    return <p className="text-fluid-sm text-muted py-8 text-center">No logged days in this era yet.</p>
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
        <button onClick={() => setFullHistory(true)} onPointerUp={blurOnTap}
          className="btn-glass w-full justify-center min-h-[44px] mt-3">
          Load full history
        </button>
      )}
    </div>
  )
})
