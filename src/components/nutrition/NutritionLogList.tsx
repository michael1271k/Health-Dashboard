'use client'

import type { DailyLog } from '@/lib/hooks/useNutrition'
import { PHASE_META } from '@/lib/nutrition/phase'

interface Goals { calorie: number; protein: number | null; carbs: number | null; fat: number | null }

const MACRO_COLOR = { P: '#38E1FF', C: '#43F59B', F: '#FFB020' } as const

function PhaseTag({ phase }: { phase: DailyLog['phase'] }) {
  if (!phase) return null
  const m = PHASE_META[phase]
  return (
    <span
      className="inline-flex items-center px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wide"
      style={{ color: m.color, background: `${m.color}1f`, border: `1px solid ${m.color}55`, boxShadow: `0 0 8px ${m.color}44` }}
    >
      {m.label}
    </span>
  )
}

function MacroBar({ label, value, goal }: { label: 'P' | 'C' | 'F'; value: number | null; goal: number | null }) {
  const color = MACRO_COLOR[label]
  const pct = goal && value != null ? Math.min(100, (value / goal) * 100) : 0
  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <span className="text-[9px] font-bold w-2" style={{ color }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="vital-number text-[10px] text-muted-vital tabular-nums w-7 text-right">{value != null ? Math.round(value) : '—'}</span>
    </div>
  )
}

/** Dense daily-nutrition cards — one tight row per day, optimized for mobile. */
export function NutritionLogList({ logs, goals, isLoading, emptyMessage }: {
  logs: DailyLog[]
  goals: Goals
  isLoading?: boolean
  emptyMessage: string
}) {
  if (isLoading) {
    return <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-surface-2/60 animate-pulse" />)}</div>
  }
  if (!logs.length) {
    return <div className="glass-card p-8 text-center text-muted-vital text-fluid-sm">{emptyMessage}</div>
  }

  return (
    <div className="space-y-2">
      {logs.map((l) => {
        const d = new Date(l.date + 'T00:00:00')
        const calColor = l.calories == null ? '#8B97B2'
          : Math.abs(l.calories - goals.calorie) <= 150 ? '#43F59B'
          : Math.abs(l.calories - goals.calorie) <= 350 ? '#FFB020' : '#FF5470'
        return (
          <div key={l.date} className="glass-card px-3 py-2.5 flex items-center gap-3">
            <div className="w-12 shrink-0 space-y-0.5">
              <div className="text-fluid-xs font-semibold text-text leading-none">{d.toLocaleDateString('en-IL', { day: 'numeric', month: 'short' })}</div>
              <div className="text-[9px] text-muted-vital leading-none">{d.toLocaleDateString('en-IL', { weekday: 'short' })}</div>
              <PhaseTag phase={l.phase} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="vital-number text-fluid-lg font-bold leading-none" style={{ color: calColor }}>{l.calories != null ? Math.round(l.calories).toLocaleString() : '—'}</span>
                <span className="text-[10px] text-muted-vital">kcal</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <MacroBar label="P" value={l.proteinG} goal={goals.protein} />
                <MacroBar label="C" value={l.carbsG} goal={goals.carbs} />
                <MacroBar label="F" value={l.fatG} goal={goals.fat} />
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="vital-number text-fluid-xs font-semibold text-text leading-none">{l.steps != null ? Math.round(l.steps / 1000) + 'k' : '—'}</div>
              <div className="text-[9px] text-muted-vital">steps</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
