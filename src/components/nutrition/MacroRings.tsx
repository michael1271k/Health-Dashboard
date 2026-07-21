'use client'

import { memo } from 'react'
import type { DailyLog } from '@/lib/hooks/useNutrition'
import { PHASE_META } from '@/lib/nutrition/phase'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { KineticNumber } from '@/components/fx/KineticNumber'

interface Goals { calorie: number; protein: number | null; carbs: number | null; fat: number | null }

function Ring({ value, goal, color, size, stroke, over }: {
  value: number | null; goal: number | null; color: string; size: number; stroke: number; over?: boolean
}) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = value != null && goal ? Math.min(1, value / goal) : 0
  const full = pct >= 1
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
      {pct > 0 && (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={over ? '#FB7185' : color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{
            transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)',
            filter: full || over ? `drop-shadow(0 0 5px ${over ? '#FB7185' : color})` : undefined,
          }}
        />
      )}
    </svg>
  )
}

/**
 * MacroRings — the MFP-on-steroids nutrition hero. One large calories ring
 * (turns rose past the 2,050 cut-band ceiling) flanked by P/C/F rings, all in
 * the global bioluminescent macro colors, with a 7-day phase-cell history.
 */
export const MacroRings = memo(function MacroRings({ today, logs, goals }: {
  today: { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null } | null
  logs: DailyLog[]           // recent days, newest first (fuel cells)
  goals: Goals
}) {
  const kcal = today?.calories != null ? Math.round(today.calories) : null
  const over = kcal != null && kcal > 2050   // v5.1 cut-day ceiling
  const remaining = kcal != null ? goals.calorie - kcal : null
  const cells = [...logs].slice(0, 7).reverse()

  const macros = [
    { label: 'Protein', value: today?.proteinG ?? null, goal: goals.protein, color: MACRO_COLORS.protein },
    { label: 'Carbs', value: today?.carbsG ?? null, goal: goals.carbs, color: MACRO_COLORS.carbs },
    { label: 'Fat', value: today?.fatG ?? null, goal: goals.fat, color: MACRO_COLORS.fat },
  ]

  return (
    <section className="helix-card">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-heading font-semibold text-text">Fuel</h2>
        <span className="text-fluid-xs text-muted">goal <span className="helix-num">{goals.calorie.toLocaleString()}</span> kcal</span>
      </div>

      <div className="flex flex-col items-center gap-8 py-2">
        {/* Hero calories ring — the focal point */}
        <div className="relative shrink-0">
          <Ring value={kcal} goal={goals.calorie} color={MACRO_COLORS.calories} size={208} stroke={14} over={over} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {kcal != null
              ? <KineticNumber value={kcal} className="helix-num text-5xl font-bold leading-none" duration={800} />
              : <span className="helix-num text-5xl font-bold text-muted">—</span>}
            <span className="text-[11px] text-muted uppercase tracking-widest mt-1.5">kcal</span>
            {remaining != null && (
              <span className="helix-num text-fluid-sm mt-1" style={{ color: over ? '#FB7185' : MACRO_COLORS.calories }}>
                {remaining >= 0 ? `${remaining.toLocaleString()} left` : `+${Math.abs(remaining).toLocaleString()} over`}
              </span>
            )}
          </div>
        </div>

        {/* P / C / F — three large, equal, centred rings that fill the width.
            Value sits inside each ring (Apple Activity style); label below. */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-md mx-auto">
          {macros.map((m) => (
            <div key={m.label} className="flex flex-col items-center gap-2.5">
              <div className="relative shrink-0">
                <Ring value={m.value} goal={m.goal} color={m.color} size={100} stroke={10} />
                <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                  <span className="helix-num text-fluid-xl font-bold text-text">{m.value != null ? Math.round(m.value) : '—'}</span>
                  <span className="text-[10px] text-muted mt-0.5">/ {m.goal ?? '—'}g</span>
                </div>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: m.color }}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 7-day phase fuel cells */}
      <div className="flex items-center justify-center gap-1.5 mt-5">
        {cells.map((d) => {
          const c = d.phase ? PHASE_META[d.phase].color : null
          return (
            <div key={d.date} title={`${d.date}${d.calories != null ? ` · ${Math.round(d.calories)} kcal` : ''}`}
              className="w-7 h-9 rounded-md border flex items-end justify-center pb-0.5"
              style={{ borderColor: c ? `${c}55` : 'rgba(255,255,255,0.08)', background: c ? `${c}18` : 'rgba(255,255,255,0.02)', boxShadow: c ? `0 0 8px ${c}30` : undefined }}>
              <span className="text-[8px] font-bold" style={{ color: c ?? '#5A6B85' }}>
                {new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'narrow' })}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
})
