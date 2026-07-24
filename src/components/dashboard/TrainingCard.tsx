'use client'

import { useState } from 'react'
import { ChevronDown, Dumbbell, Plus } from 'lucide-react'
import type { Tables } from '@/lib/supabase/types'
import type { ScheduleDay } from '@/lib/programs'
import { PPL_SPLITS, type SplitDay } from '@/lib/types/workout'
import { displayWeight, fmtVolume, weightUnit } from '@/lib/utils/units'
import { EMERALD, EMBER, SAPPHIRE, GOLD, AMETHYST, OXIDE, MUTED, HAIRLINE } from '@/lib/theme/palette'

/** One metadata cell of the expanded last-session grid. */
function Meta({ label, value, unit, color }: { label: string; value: string | number | null; unit?: string; color: string }) {
  return (
    <div className="rounded-lg px-2 py-1.5" style={{ background: `${color}0f`, border: `1px solid ${color}26` }}>
      <span className="helix-num block text-fluid-sm font-bold leading-tight" style={{ color }}>
        {value ?? '—'}{value != null && unit ? <span className="text-[9px] text-muted ml-0.5">{unit}</span> : null}
      </span>
      <span className="text-[9px] uppercase tracking-wide text-muted">{label}</span>
    </div>
  )
}

/**
 * Training card — today's session at a glance, tapping expands INLINE into the
 * last session's rich metadata (duration · calories · HR · sets · volume · PRs).
 * Replaces the two flat stat squares.
 */
export function TrainingCard({ today, lastSession, loggedToday, onLog }: {
  today: ScheduleDay | 'rest'
  lastSession: Tables<'workout_sessions'> | null | undefined
  loggedToday: boolean
  onLog: (dayKey: string) => void
}) {
  const [open, setOpen] = useState(false)
  const unit = weightUnit()
  const isRest = today === 'rest'
  const accent = isRest ? AMETHYST : EMERALD
  const lastSplit = lastSession ? PPL_SPLITS[lastSession.split_day as SplitDay] : null

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${accent}2e`, background: `${accent}0a` }}>
      {/* Today, at a glance */}
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accent}1c`, color: accent }}>
          <Dumbbell className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-wide text-muted">Today</span>
          <span className="split-label block font-bold text-fluid-base truncate" style={{ color: accent }}>
            {isRest ? 'Zone-2 / Rest' : today.label}
          </span>
          {!isRest && today.sub && <span className="block text-[10px] text-muted truncate">{today.sub}</span>}
        </div>
        {loggedToday && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{ color: EMERALD, background: `${EMERALD}1a` }}>LOGGED ✓</span>
        )}
      </div>

      {/* Expand → last session */}
      {lastSession && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-left border-t"
            style={{ borderColor: HAIRLINE }}
          >
            <span className="text-[10px] uppercase tracking-wide text-muted">Last session</span>
            <span className="text-fluid-xs font-semibold truncate" style={{ color: lastSplit?.color ?? MUTED }}>
              {lastSplit?.label ?? lastSession.split_day}
            </span>
            <span className="ml-auto text-[10px] text-muted shrink-0">
              {new Date(lastSession.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {open && (
            <div className="grid grid-cols-3 gap-1.5 px-3.5 pb-3">
              <Meta label="Duration" value={lastSession.duration_min} unit="min" color={SAPPHIRE} />
              <Meta label="Calories" value={lastSession.calories_burned} unit="kcal" color={EMBER} />
              <Meta label="Avg HR" value={lastSession.avg_bpm} unit="bpm" color={OXIDE} />
              <Meta label="Sets" value={lastSession.set_count} color={AMETHYST} />
              <Meta label="Volume" value={lastSession.total_volume_kg != null ? fmtVolume(displayWeight(lastSession.total_volume_kg)) : null} unit={unit} color={EMERALD} />
              <Meta label="PRs" value={lastSession.pr_count} color={GOLD} />
            </div>
          )}
        </>
      )}

      {/* CTA */}
      {!loggedToday && !isRest && today.dayKey && (
        <div className="px-3.5 pb-3">
          <button onClick={() => onLog(today.dayKey as string)} className="btn-glass w-full justify-center min-h-[44px]">
            <Plus className="w-4 h-4" /> Log {today.label}
          </button>
        </div>
      )}
    </div>
  )
}
