'use client'

import { Flame } from 'lucide-react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Bar, Hero, Ring, Spark } from './parts'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { OXIDE, SAPPHIRE } from '@/lib/theme/palette'
import type { WidgetSize } from '@/lib/dashboard/layout'

/**
 * Calories and the three macros, as the nested dials they are.
 *
 * ── WHY RINGS AND NOT FOUR BARS ──────────────────────────────────────────────
 * The four quantities are not four independent errands; they are one budget
 * spent four ways, and every one of them is a fraction of its own target. Nested
 * arcs say "one thing, four components" in a single glance and cost one square
 * of the tile, which leaves the other half for the numbers. Four stacked bars
 * would say "four unrelated errands" and would need the whole tile to say it.
 *
 * Calories is the OUTER ring because it is the one that is graded — the phase
 * decides whether the day passed. The macros sit inside it in the order they are
 * eaten off: protein, carbs, fat.
 *
 * ── AND WHY A CALORIE OVERSHOOT CHANGES COLOUR ───────────────────────────────
 * A ring that pins at full stops distinguishing "hit the target" from "went
 * 600 over", which on a cut is the only distinction that matters. Past 100% the
 * calorie arc repaints in oxide and the readout keeps saying the real number.
 * The macros do not do this: a protein target is a FLOOR, and exceeding it is
 * not a failure.
 */
export function FuelWidget({ size, onOpen, kcal, kcalGoal, protein, carbs, fat, goals, waterMl, waterGoalMl, series, phaseLabel, phaseColor }: {
  size: WidgetSize
  onOpen?: () => void
  kcal: number | null
  kcalGoal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  goals: { protein: number | null; carbs: number | null; fat: number | null }
  waterMl: number | null
  waterGoalMl: number
  /** 7-day calorie history, oldest first. Large only. */
  series: Array<number | null>
  phaseLabel: string | null
  phaseColor: string | null
}) {
  const pct = (v: number | null, g: number | null) => (v != null && g ? (v / g) * 100 : null)
  const kcalPct = pct(kcal, kcalGoal)
  const over = kcalPct != null && kcalPct > 100
  const macros = [
    { key: 'protein', label: 'P', value: protein, goal: goals.protein, color: MACRO_COLORS.protein },
    { key: 'carbs', label: 'C', value: carbs, goal: goals.carbs, color: MACRO_COLORS.carbs },
    { key: 'fat', label: 'F', value: fat, goal: goals.fat, color: MACRO_COLORS.fat },
  ] as const

  return (
    <WidgetFrame icon={Flame} label="Fuel" accent={MACRO_COLORS.calories} size={size} onOpen={onOpen}>
      {kcal == null && protein == null ? (
        <WidgetEmpty accent={MACRO_COLORS.calories} message="Ready for today's first meal" hint={kcalGoal ? `${kcalGoal.toLocaleString()} kcal to spend` : undefined} />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1">
          <Hero value={kcal} unit="kcal" color={over ? OXIDE : MACRO_COLORS.calories} />
          <Bar value={kcal} target={kcalGoal} color={MACRO_COLORS.calories} over={OXIDE} />
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex items-center gap-3">
          {/* The dial. Four nested arcs in one fixed 100×100 box — `aspect-square`
              keeps it circular at every tile width, which is the same discipline
              the sparkline needed and did not have. */}
          <span className="relative shrink-0 h-full aspect-square max-h-[104px] grid place-items-center">
            <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
              <Ring pct={kcalPct} color={over ? OXIDE : MACRO_COLORS.calories} r={44} width={8} />
              <Ring pct={pct(protein, goals.protein)} color={MACRO_COLORS.protein} r={33} width={7} />
              <Ring pct={pct(carbs, goals.carbs)} color={MACRO_COLORS.carbs} r={23} width={7} />
              <Ring pct={pct(fat, goals.fat)} color={MACRO_COLORS.fat} r={13} width={7} />
            </svg>
            <span className="absolute inset-0 grid place-items-center pointer-events-none">
              <span className="text-center leading-none">
                <span className="helix-num block font-bold text-[15px] tabular-nums" style={{ color: over ? OXIDE : MACRO_COLORS.calories }}>
                  {kcal != null ? Math.round(kcal) : '—'}
                </span>
                <span className="block text-[8px] text-muted mt-0.5">
                  {kcalGoal ? `/ ${kcalGoal.toLocaleString()}` : 'kcal'}
                </span>
              </span>
            </span>
          </span>

          <span className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            {phaseLabel && (
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] truncate" style={{ color: phaseColor ?? undefined }}>
                {phaseLabel} day
              </span>
            )}
            {macros.map((m) => (
              <span key={m.key} className="block min-w-0">
                <span className="flex items-baseline gap-1 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-wide shrink-0" style={{ color: m.color }}>{m.label}</span>
                  <span className="helix-num text-[11px] font-bold tabular-nums text-text ml-auto shrink-0">
                    {m.value != null ? Math.round(m.value) : '—'}
                    {m.goal != null && <span className="text-muted font-normal">/{m.goal}</span>}
                    <span className="text-muted font-normal ml-0.5">g</span>
                  </span>
                </span>
                <span className="block mt-0.5"><Bar value={m.value} target={m.goal} color={m.color} /></span>
              </span>
            ))}
            {/* Water is a bar and not a ring: it is not part of the energy
                budget, and giving it an arc inside the same dial would say it
                was. */}
            <span className="block min-w-0 pt-0.5">
              <span className="flex items-baseline gap-1">
                <span className="text-[9px] font-bold uppercase tracking-wide shrink-0" style={{ color: SAPPHIRE }}>W</span>
                <span className="helix-num text-[11px] font-bold tabular-nums text-text ml-auto shrink-0">
                  {waterMl != null ? (waterMl / 1000).toFixed(1) : '—'}
                  <span className="text-muted font-normal">/{(waterGoalMl / 1000).toFixed(1)}</span>
                  <span className="text-muted font-normal ml-0.5">L</span>
                </span>
              </span>
              <span className="block mt-0.5"><Bar value={waterMl} target={waterGoalMl} color={SAPPHIRE} /></span>
            </span>
          </span>
        </span>
      )}

      {size === 'l' && (kcal != null || protein != null) && (
        <span className="block pt-2 mt-1 border-t border-white/[0.06]">
          <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Intake · 7 days</span>
          <Spark series={series} color={MACRO_COLORS.calories} height={34} />
        </span>
      )}
    </WidgetFrame>
  )
}
