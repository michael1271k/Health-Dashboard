'use client'

import type { DailyLog } from '@/lib/hooks/useNutrition'
import { phaseDisplay } from '@/lib/nutrition/phase'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { isExceptionDay } from '@/lib/nutrition/exceptionDay'
import { SAND, AMETHYST } from '@/lib/theme/palette'

interface Goals { calorie: number; protein: number | null; carbs: number | null; fat: number | null }

const MACRO_COLOR = { P: MACRO_COLORS.protein, C: MACRO_COLORS.carbs, F: MACRO_COLORS.fat } as const

function PhaseTag({ phase, date }: { phase: DailyLog['phase']; date: string }) {
  if (!phase) return null
  const m = phaseDisplay(phase, date)
  return (
    <span
      className="inline-flex items-center px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wide"
      style={{ color: m.color, background: `${m.color}1f`, border: `1px solid ${m.color}55`, boxShadow: `0 0 8px ${m.color}44` }}
    >
      {m.label}
    </span>
  )
}

/**
 * A day's declaration, in the same pill language as the phase tag.
 *
 * These two facts used to render as `· Social` and `· est` — 9px text floating
 * after the calorie number, at the one place on the row the eye has already left
 * because the big number is to its left. The flag is the reason the number does
 * not mean what it appears to mean, so it has to survive a scan of the column.
 *
 * The exception carries the glow, the estimate does not: one says the day was
 * ALLOWED to miss its target, the other only says the figure is a guess. The
 * estimate is reported, never rewarded — see `exceptionDay.ts`.
 */
function ContextChip({ label, color, glow = false }: { label: string; color: string; glow?: boolean }) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wide shrink-0"
      style={{
        color, background: `${color}1f`, border: `1px solid ${color}55`,
        ...(glow ? { boxShadow: `0 0 8px ${color}44` } : {}),
      }}
    >
      {label}
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
      <span className="helix-num text-[10px] text-muted tabular-nums w-7 text-right">{value != null ? Math.round(value) : '—'}</span>
    </div>
  )
}

/**
 * Dense daily-nutrition cards — one tight row per day, optimized for mobile.
 *
 * ── EACH ROW IS GRADED BY THE TARGET THAT DAY HAD ────────────────────────────
 * The calorie colour and the three macro bars used one `goals` object for the
 * whole list, which is today's. A history list is the surface where that is
 * most obviously wrong: pulling the maintenance rung repainted a month of rows
 * against a target that came into force after every one of them. `goalFor`
 * resolves per date — see `useHistoricalGoals`.
 */
export function NutritionLogList({ logs, goals, goalFor, isLoading, emptyMessage, onDayClick }: {
  logs: DailyLog[]
  /** Today's targets — the fallback when no per-date resolver is supplied. */
  goals: Goals
  /** What each day was actually asked for. Optional; every caller passes one. */
  goalFor?: (dateISO: string) => Goals
  isLoading?: boolean
  emptyMessage: string
  onDayClick?: (date: string) => void
}) {
  if (isLoading) {
    return <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-surface-2/60 animate-pulse" />)}</div>
  }
  if (!logs.length) {
    return <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-8 text-center text-muted text-fluid-sm">{emptyMessage}</div>
  }

  return (
    <div className="space-y-2">
      {logs.map((l) => {
        const d = new Date(l.date + 'T00:00:00')
        // A declared exception is neither hit nor miss, so it takes neither
        // colour. Left on the distance ramp a planned dinner reads OXIDE — the
        // danger colour, the same one an unravelled week gets — which is
        // precisely the verdict the flag exists to withdraw.
        const flagged = isExceptionDay(l.exception)
        const dayGoals = goalFor ? goalFor(l.date) : goals
        const calColor = flagged ? AMETHYST
          : l.calories == null ? '#79808C'
          : Math.abs(l.calories - dayGoals.calorie) <= 150 ? '#3E9E7A'
          : Math.abs(l.calories - dayGoals.calorie) <= 350 ? '#D4AF37' : '#C4514E'
        return (
          <div key={l.date} role={onDayClick ? 'button' : undefined} tabIndex={onDayClick ? 0 : undefined}
            onClick={onDayClick ? () => onDayClick(l.date) : undefined}
            onKeyDown={onDayClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDayClick(l.date) } } : undefined}
            className={`rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 flex items-center gap-3 ${onDayClick ? 'cursor-pointer active:opacity-80' : ''}`}
            style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 70px' } as React.CSSProperties}>
            <div className="w-12 shrink-0 space-y-0.5">
              <div className="text-fluid-xs font-semibold text-text leading-none">{d.toLocaleDateString('en-IL', { day: 'numeric', month: 'short' })}</div>
              <div className="text-[9px] text-muted leading-none">{d.toLocaleDateString('en-IL', { weekday: 'short' })}</div>
              <PhaseTag phase={l.phase} date={l.date} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="flex items-baseline gap-1">
                  <span className="helix-num text-fluid-lg font-bold leading-none" style={{ color: calColor }}>{l.calories != null ? Math.round(l.calories).toLocaleString() : '—'}</span>
                  <span className="text-[10px] text-muted">kcal</span>
                </span>
                {flagged && l.exception && <ContextChip label={l.exception} color={AMETHYST} glow />}
                {/* An estimate does NOT take the calorie colour above — the
                    number is still counted at full weight and still graded
                    normally, so recolouring it would claim a forgiveness that
                    was never granted. It gets its own quiet mark instead, in
                    SAND rather than AMETHYST, because "I guessed" and "I was
                    allowed to miss" are different statements about a day.
                    These two hues are shared with the 7-day rail in MacroCards;
                    two surfaces disagreeing about the colour of a declared day
                    would be worse than either choice. */}
                {l.estimated && <ContextChip label="Est" color={SAND} />}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <MacroBar label="P" value={l.proteinG} goal={dayGoals.protein} />
                <MacroBar label="C" value={l.carbsG} goal={dayGoals.carbs} />
                <MacroBar label="F" value={l.fatG} goal={dayGoals.fat} />
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="helix-num text-fluid-xs font-semibold text-text leading-none">{l.steps != null ? Math.round(l.steps / 1000) + 'k' : '—'}</div>
              <div className="text-[9px] text-muted">steps</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
