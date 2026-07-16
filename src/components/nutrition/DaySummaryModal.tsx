'use client'

import Link from 'next/link'
import { Moon, Footprints, Droplets, Dumbbell, ArrowRight } from 'lucide-react'
import { LiquidModal } from '@/components/ui/LiquidModal'
import { CompletenessArc } from '@/components/day/CompletenessArc'
import { useDayVault, dayCompleteness } from '@/lib/hooks/useDayVault'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { phaseDisplay } from '@/lib/nutrition/phase'
import { displayWeight, useUnitSystem } from '@/lib/utils/units'
import { formatSleep, mlToL } from '@/lib/utils/format'

const VIOLET = '#8B7CFF'

function MiniRing({ value, goalHint, color, label }: { value: number | null; goalHint: number; color: string; label: string }) {
  const size = 52, stroke = 5
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = value != null ? Math.min(1, value / goalHint) : 0
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
          {pct > 0 && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center helix-num text-[11px] font-bold text-text">
          {value != null ? Math.round(value) : '—'}
        </span>
      </div>
      <span className="text-[9px] uppercase tracking-wide" style={{ color }}>{label}</span>
    </div>
  )
}

/**
 * Day-summary popup for the Nutrition timeline: macros, movement, and the
 * day's training — or a deliberate Rest Day visual — inside a LiquidModal,
 * with the full Daily Nexus one tap away.
 */
export function DaySummaryModal({ date, onClose }: { date: string | null; onClose: () => void }) {
  const { data, isLoading } = useDayVault(date ?? '')
  const unit = useUnitSystem()

  const n = data?.nutrition
  const log = data?.log
  const session = data?.sessions[0] ?? null
  const { parts } = dayCompleteness(data)
  const pretty = date ? new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : ''

  return (
    <LiquidModal open={!!date} onClose={onClose} title={pretty} accent={session ? '#3EE0FF' : VIOLET}>
      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />)}</div>
      ) : (
        <div className="space-y-4">
          {/* Fuel: mini macro rings + phase */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <MiniRing value={n?.calories ?? null} goalHint={2050} color={MACRO_COLORS.calories} label="kcal" />
              <MiniRing value={n?.protein_g ?? null} goalHint={180} color={MACRO_COLORS.protein} label="P" />
              <MiniRing value={n?.carbs_g ?? null} goalHint={200} color={MACRO_COLORS.carbs} label="C" />
              <MiniRing value={n?.fat_g ?? null} goalHint={60} color={MACRO_COLORS.fat} label="F" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <CompletenessArc parts={parts} size={40} />
              {n?.phase && date && <span className="text-[9px] font-bold uppercase" style={{ color: phaseDisplay(n.phase, date).color }}>{phaseDisplay(n.phase, date).label}</span>}
            </div>
          </div>

          {/* Movement chips */}
          <div className="grid grid-cols-3 gap-2">
            <span className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-2 py-2 text-center">
              <Footprints className="w-3.5 h-3.5 mx-auto mb-0.5" style={{ color: '#4FC3FF' }} aria-hidden="true" />
              <span className="helix-num text-fluid-xs font-bold text-text block">{log?.steps?.toLocaleString() ?? '—'}</span>
            </span>
            <span className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-2 py-2 text-center">
              <Moon className="w-3.5 h-3.5 mx-auto mb-0.5" style={{ color: VIOLET }} aria-hidden="true" />
              <span className="helix-num text-fluid-xs font-bold text-text block">{log?.sleep_minutes != null ? formatSleep(log.sleep_minutes) : '—'}</span>
            </span>
            <span className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-2 py-2 text-center">
              <Droplets className="w-3.5 h-3.5 mx-auto mb-0.5" style={{ color: '#3EE0FF' }} aria-hidden="true" />
              <span className="helix-num text-fluid-xs font-bold text-text block">{log?.water_ml != null ? `${mlToL(log.water_ml)} L` : '—'}</span>
            </span>
          </div>

          {/* Training — or a deliberate rest visual */}
          {session ? (
            <div className="rounded-2xl border px-3.5 py-3 flex items-center gap-3" style={{ borderColor: '#3EE0FF30', background: '#3EE0FF0d' }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: '#3EE0FF1f', color: '#3EE0FF' }}>
                <Dumbbell className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-fluid-sm font-medium text-text truncate">
                  {session.split[0]?.toUpperCase()}{session.split.slice(1)} session
                </span>
                <span className="block text-fluid-xs text-muted">
                  {session.volumeKg != null && `${((displayWeight(session.volumeKg) ?? 0) / 1000).toFixed(1)}${unit === 'lb' ? 'k' : 't'} volume`}
                  {session.setCount != null && ` · ${session.setCount} sets`}
                  {(session.prCount ?? 0) > 0 && ` · ${session.prCount} PR 🏆`}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border px-3.5 py-4 text-center" style={{ borderColor: `${VIOLET}30`, background: `${VIOLET}0d` }}>
              <Moon className="w-6 h-6 mx-auto mb-1" style={{ color: VIOLET, filter: `drop-shadow(0 0 6px ${VIOLET}66)` }} aria-hidden="true" />
              <span className="block text-fluid-sm font-medium" style={{ color: VIOLET }}>Rest & Recovery</span>
              <span className="block text-fluid-xs text-muted mt-0.5">
                {log?.hrv_ms != null ? `HRV ${Math.round(log.hrv_ms)} ms · ` : ''}adaptation happens here
              </span>
            </div>
          )}

          {/* Full record */}
          {date && (
            <Link href={`/day/${date}`} onClick={onClose}
              className="btn-glass w-full justify-center min-h-[44px]">
              Open Daily Nexus <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      )}
    </LiquidModal>
  )
}
