'use client'

import { memo } from 'react'
import type { DailyLog } from '@/lib/hooks/useNutrition'
import { PHASE_META, derivePhase } from '@/lib/nutrition/phase'
import { KineticNumber } from '@/components/fx/KineticNumber'

interface Goals { calorie: number; protein: number | null; carbs: number | null; fat: number | null }

const MACROS = [
  { key: 'proteinG', goal: 'protein', label: 'P', color: '#3EE0FF', r: 92 },
  { key: 'carbsG', goal: 'carbs', label: 'C', color: '#43F59B', r: 82 },
  { key: 'fatG', goal: 'fat', label: 'F', color: '#FFB86B', r: 72 },
] as const

/** Map a value in [min,max] to an angle across the 180° gauge (-90..+90). */
const angleFor = (v: number, min: number, max: number) => -90 + Math.max(0, Math.min(1, (v - min) / (max - min))) * 180
const polar = (cx: number, cy: number, r: number, deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
const arcPath = (cx: number, cy: number, r: number, fromDeg: number, toDeg: number) => {
  const s = polar(cx, cy, r, fromDeg)
  const e = polar(cx, cy, r, toDeg)
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${toDeg - fromDeg > 180 ? 1 : 0} 1 ${e.x} ${e.y}`
}

/**
 * FuelGauge — the reimagined nutrition hero. A semicircular fuel gauge (needle =
 * today's calories across deficit / target-band / over zones from the v5.1 phase
 * bands) wrapped by three concentric macro arcs, plus a 7-day fuel-cell history.
 * Pure SVG. No progress bars anywhere.
 */
export const FuelGauge = memo(function FuelGauge({ today, logs, goals }: {
  today: { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null } | null
  logs: DailyLog[]           // recent days, newest first (for the fuel cells)
  goals: Goals
}) {
  const goal = goals.calorie
  const bandTop = 2050            // v5.1 cut-day ceiling
  const min = goal - 600
  const max = goal + 650
  const kcal = today?.calories ?? null
  const phase = derivePhase(kcal)

  const cx = 110, cy = 108
  const needleDeg = kcal != null ? angleFor(kcal, min, max) : null

  const cells = [...logs].slice(0, 7).reverse()

  return (
    <section className="helix-card">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-heading font-semibold text-text">Fuel</h2>
        <span className="text-fluid-xs text-muted-vital">target {goal.toLocaleString()} kcal · band ≤ {bandTop.toLocaleString()}</span>
      </div>

      <div className="flex justify-center">
        <svg viewBox="0 0 220 128" className="w-full max-w-[340px]" role="img" aria-label="Calorie fuel gauge with macro arcs">
          {/* Zone arcs: deficit · target band · over */}
          <path d={arcPath(cx, cy, 102, -90, angleFor(goal - 100, min, max))} fill="none" stroke="#3EE0FF33" strokeWidth="9" strokeLinecap="round" />
          <path d={arcPath(cx, cy, 102, angleFor(goal - 100, min, max), angleFor(bandTop, min, max))} fill="none" stroke="#16F5C3" strokeOpacity="0.55" strokeWidth="9" strokeLinecap="round" />
          <path d={arcPath(cx, cy, 102, angleFor(bandTop, min, max), 90)} fill="none" stroke="#FF547066" strokeWidth="9" strokeLinecap="round" />

          {/* Concentric macro arcs (P/C/F vs goal) */}
          {MACROS.map((m) => {
            const val = today?.[m.key] ?? null
            const target = goals[m.goal]
            const pct = val != null && target ? Math.min(1, val / target) : 0
            return (
              <g key={m.key}>
                <path d={arcPath(cx, cy, m.r, -90, 90)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" strokeLinecap="round" />
                {pct > 0 && (
                  <path d={arcPath(cx, cy, m.r, -90, -90 + pct * 180)} fill="none" stroke={m.color} strokeWidth="6" strokeLinecap="round"
                    style={{ filter: pct >= 1 ? `drop-shadow(0 0 4px ${m.color})` : undefined }} />
                )}
                <text x={polar(cx, cy, m.r, -94).x} y={polar(cx, cy, m.r, -94).y + 3} fill={m.color} fontSize="8" fontWeight="700">{m.label}</text>
              </g>
            )
          })}

          {/* Needle */}
          {needleDeg != null && (
            <g style={{ transition: 'transform 0.8s cubic-bezier(0.34,1.4,0.4,1)', transform: `rotate(${needleDeg}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
              <line x1={cx} y1={cy} x2={cx} y2={cy - 62} stroke="#EAF2FF" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx={cx} cy={cy} r="5" fill="#EAF2FF" />
            </g>
          )}
        </svg>
      </div>

      {/* Center figure */}
      <div className="flex flex-col items-center -mt-9 relative z-10">
        <div className="flex items-baseline gap-1">
          {kcal != null
            ? <KineticNumber value={kcal} className="helix-num text-fluid-2xl font-bold leading-none" duration={800} />
            : <span className="helix-num text-fluid-2xl font-bold text-muted-vital">—</span>}
          <span className="text-fluid-xs text-muted-vital">kcal</span>
        </div>
        {phase && (
          <span className="mt-1 px-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
            style={{ color: PHASE_META[phase].color, background: `${PHASE_META[phase].color}1f`, border: `1px solid ${PHASE_META[phase].color}55` }}>
            {PHASE_META[phase].label} day
          </span>
        )}
      </div>

      {/* 7-day fuel cells */}
      <div className="flex items-center justify-center gap-1.5 mt-4">
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
