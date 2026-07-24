'use client'

import { Moon } from 'lucide-react'
import type { Tables } from '@/lib/supabase/types'
import { formatSleep } from '@/lib/utils/format'
import { AMETHYST, SAPPHIRE, STEEL, OXIDE, MUTED, HAIRLINE, EMERALD, GOLD } from '@/lib/theme/palette'

/**
 * Sleep, as architecture rather than four flat squares.
 *
 * NOTE ON HONESTY: we persist stage TOTALS (deep/rem/core/awake minutes), not
 * the stage TIMELINE. HealthKit exposes no precomputed "time asleep" scalar
 * either — Apple derives its number from the same category samples we read. So
 * this is a proportional STAGE SPLIT with the real bed/wake bounds around it,
 * deliberately not labelled a hypnogram: the segment ORDER is nominal, only the
 * widths carry meaning. Storing per-segment intervals would need a new table.
 */

const STAGES = [
  { key: 'deep_min', label: 'Deep', color: AMETHYST },
  { key: 'rem_min', label: 'REM', color: SAPPHIRE },
  { key: 'core_min', label: 'Core', color: STEEL },
  { key: 'awake_min', label: 'Awake', color: OXIDE },
] as const

/** Local HH:MM for an ISO instant. */
function clock(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function SleepStages({ sleep, log, goalHours }: {
  sleep: Tables<'sleep_sessions'> | null
  log: { avg_rest_heart_rate: number | null; blood_oxygen: number | null; respiratory_rate: number | null; sleep_minutes: number | null } | null
  goalHours: number | null
}) {
  // The sleep_sessions row is the detailed record; daily_logs.sleep_minutes is
  // the fallback when only a total was ever pushed (legacy Shortcut days).
  const totalMin = sleep?.duration_min ?? log?.sleep_minutes ?? null
  const parts = STAGES
    .map((s) => ({ ...s, min: (sleep?.[s.key] as number | null) ?? 0 }))
    .filter((s) => s.min > 0)
  const ribbonTotal = parts.reduce((n, p) => n + p.min, 0)

  const bed = clock(sleep?.start_time)
  const wake = clock(sleep?.end_time)
  const goalMin = goalHours != null ? goalHours * 60 : null
  const vsGoal = totalMin != null && goalMin ? Math.round(totalMin - goalMin) : null

  if (totalMin == null) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <Moon className="w-6 h-6" style={{ color: AMETHYST }} aria-hidden="true" />
        <p className="text-fluid-sm text-text">No sleep synced for last night</p>
        <p className="text-[11px] text-muted">Sync your Watch to score the day.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3.5">
      {/* Hero: total + the night's real bounds */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <span className="helix-num text-4xl font-bold leading-none text-text">{formatSleep(totalMin)}</span>
          <span className="text-[10px] uppercase tracking-widest text-muted ml-2">asleep</span>
        </div>
        {vsGoal != null && (
          <span className="helix-num text-fluid-xs font-bold"
            style={{ color: vsGoal >= 0 ? EMERALD : vsGoal >= -45 ? GOLD : OXIDE }}>
            {vsGoal >= 0 ? '+' : '−'}{formatSleep(Math.abs(vsGoal))} vs goal
          </span>
        )}
      </div>

      {bed && wake && (
        <div className="flex items-center gap-2 text-[11px] text-muted helix-num">
          <span className="text-text font-semibold">{bed}</span>
          <span className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${AMETHYST}66, ${GOLD}66)` }} aria-hidden="true" />
          <span className="text-text font-semibold">{wake}</span>
        </div>
      )}

      {/* Stage split — proportional widths, one segment per stage present */}
      {ribbonTotal > 0 && (
        <>
          <div className="flex h-4 w-full rounded-full overflow-hidden" role="img"
            aria-label={parts.map((p) => `${p.label} ${formatSleep(p.min)}`).join(', ')}>
            {parts.map((p) => (
              <span key={p.key} className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${(p.min / ribbonTotal) * 100}%`,
                  background: `linear-gradient(180deg, ${p.color}, ${p.color}b8)`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14)`,
                }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {parts.map((p) => (
              <span key={p.key} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} aria-hidden="true" />
                <span className="text-muted">{p.label}</span>
                <span className="helix-num font-bold text-text">{formatSleep(p.min)}</span>
                <span className="text-muted/70 helix-num">{Math.round((p.min / ribbonTotal) * 100)}%</span>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted/80 leading-snug">
            Stage split by duration — Apple reports totals, not a stage timeline, so segment order is nominal.
          </p>
        </>
      )}

      {/* Overnight vitals, one thin row */}
      <div className="grid grid-cols-3 gap-2 pt-2.5 border-t" style={{ borderColor: HAIRLINE }}>
        {[
          { label: 'Resting HR', v: log?.avg_rest_heart_rate, unit: 'bpm', d: 0 },
          { label: 'Blood O₂', v: log?.blood_oxygen, unit: '%', d: 0 },
          { label: 'Respiratory', v: log?.respiratory_rate, unit: 'br/min', d: 1 },
        ].map((x) => (
          <div key={x.label}>
            <div className="text-[9px] uppercase tracking-wide" style={{ color: MUTED }}>{x.label}</div>
            <div className="helix-num text-fluid-sm font-bold text-text mt-0.5">
              {x.v == null ? '—' : (x.d === 0 ? Math.round(x.v) : Math.round(x.v * 10) / 10)}
              {x.v != null && <span className="text-[10px] font-normal text-muted ml-1">{x.unit}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
