'use client'

import { useMemo } from 'react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Hero, Spark } from './parts'
import { Bar } from '@/components/nutrition/MacroCards'
import { useTodayMicros } from '@/lib/hooks/useTodayMicros'
import { MICRO_TARGETS } from '@/lib/nutrition/microTargets'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { OXIDE, SAPPHIRE, EMERALD, MUTED } from '@/lib/theme/palette'
import { WIDGET_META, type WidgetSize } from '@/lib/dashboard/layout'

/**
 * Calories, the three macros, water — and the three micros that decide a day.
 *
 * ── THE RINGS ARE GONE, AND WHY ──────────────────────────────────────────────
 * Four nested arcs said "one budget, four components", which is a true and
 * elegant thing to say. It is also unreadable at tile scale: the innermost ring
 * had a 13px radius, so fat — the macro most likely to be the day's problem —
 * was a 26px circle whose fill you had to squint at, and four arcs of different
 * lengths cannot be compared to each other by eye at all. Length can. The
 * nutrition page has always drawn these as horizontal bars for exactly that
 * reason, and this tile now uses that page's OWN `Bar` component rather than a
 * lookalike, so the two surfaces cannot drift apart.
 *
 * That bar has one property the widget's generic `Bar` does not: it rescales
 * past the target and paints the excess in oxide beyond a tick, instead of
 * clamping at full. On a cut the distinction between "hit 1,950" and "ate
 * 2,400" is the entire point of looking, and a bar that pins at 100 % erases it.
 *
 * Full words, not `P / C / F`. The initials saved about 30px of a 358px tile
 * and cost a legend the reader has to hold in their head.
 *
 * ── AND WHY THREE MICROS, THESE THREE ────────────────────────────────────────
 * Fiber, sodium and iron: one floor that is hard to hit on a cut, one ceiling
 * that is easy to blow through, and one floor that quietly matters for
 * training turnover. Their targets are not invented here — they come from
 * `MICRO_TARGETS`, the same evidence-based table the Micros page grades
 * against, including whether each is a floor or a ceiling. The INTAKE likewise
 * comes from `useTodayMicros`, which folds the supplement stack's label doses
 * in with food; a tile that counted only food would report a shortfall the
 * multivitamin had already covered.
 */
const MICRO_KEYS = ['fiber', 'sodium', 'iron'] as const

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
  const micros = useTodayMicros()
  const over = kcal != null && kcalGoal != null && kcal > kcalGoal

  const rows = [
    { key: 'calories', label: 'Calories', value: kcal, goal: kcalGoal, color: MACRO_COLORS.calories, unit: '' },
    { key: 'protein', label: 'Protein', value: protein, goal: goals.protein, color: MACRO_COLORS.protein, unit: 'g' },
    { key: 'carbs', label: 'Carbs', value: carbs, goal: goals.carbs, color: MACRO_COLORS.carbs, unit: 'g' },
    { key: 'fat', label: 'Fat', value: fat, goal: goals.fat, color: MACRO_COLORS.fat, unit: 'g' },
    { key: 'water', label: 'Water', value: waterMl, goal: waterGoalMl, color: SAPPHIRE, unit: 'ml' },
  ]

  const microRows = useMemo(
    () => MICRO_KEYS
      .map((k) => MICRO_TARGETS.find((m) => m.key === k))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => {
        const have = micros[m.key] ?? null
        // A ceiling is passed when you go OVER it; a floor is met when you
        // reach it. Painting both the same colour would congratulate a day that
        // ate 4,200 mg of sodium.
        const ok = have != null && (m.kind === 'ceiling' ? have <= m.target : have >= m.target)
        return { ...m, have, ok }
      }),
    [micros],
  )

  return (
    <WidgetFrame {...WIDGET_META.fuel} size={size} onOpen={onOpen}>
      {kcal == null && protein == null ? (
        <WidgetEmpty accent={MACRO_COLORS.calories} size={size} message="Ready for today's first meal" hint={kcalGoal ? `${kcalGoal.toLocaleString()} kcal to spend` : undefined} />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1.5">
          <Hero value={kcal} unit="kcal" color={over ? OXIDE : MACRO_COLORS.calories} />
          <Bar value={kcal} goal={kcalGoal} color={MACRO_COLORS.calories} height={5} />
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1">
          {phaseLabel && (
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] truncate" style={{ color: phaseColor ?? undefined }}>
              {phaseLabel} day
            </span>
          )}

          {rows.map((r) => (
            <span key={r.key} className="block min-w-0">
              <span className="flex items-baseline gap-1 min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-[0.08em] truncate" style={{ color: r.color }}>
                  {r.label}
                </span>
                <span className="helix-num text-[11px] font-bold tabular-nums text-text ml-auto shrink-0">
                  {r.value != null
                    ? r.key === 'water' ? (r.value / 1000).toFixed(1) : Math.round(r.value)
                    : '—'}
                  {r.goal != null && (
                    <span className="text-muted font-normal">
                      /{r.key === 'water' ? (r.goal / 1000).toFixed(1) : Math.round(r.goal)}
                    </span>
                  )}
                  <span className="text-muted font-normal ml-0.5">{r.key === 'water' ? 'L' : r.unit}</span>
                </span>
              </span>
              <span className="block mt-0.5"><Bar value={r.value} goal={r.goal} color={r.color} height={5} /></span>
            </span>
          ))}

          {/* The micros ride at the foot as three read-outs rather than three
              more bars: they are checks, not budgets you spend down, and five
              bars plus three more is a wall. Colour carries the verdict. */}
          <span className="grid grid-cols-3 gap-1.5 mt-auto pt-1.5 border-t border-white/[0.06]">
            {microRows.map((m) => (
              <span key={m.key} className="min-w-0 flex flex-col gap-0.5">
                <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-muted truncate">
                  {m.label}
                </span>
                <span className="helix-num text-[11px] font-bold tabular-nums truncate"
                  style={{ color: m.have == null ? MUTED : m.ok ? EMERALD : OXIDE }}>
                  {m.have == null ? '—' : Math.round(m.have)}
                  <span className="text-[8px] font-normal text-muted ml-0.5">
                    {m.kind === 'ceiling' ? '≤' : '/'}{m.target}{m.unit}
                  </span>
                </span>
              </span>
            ))}
          </span>

          {size === 'l' && (
            <span className="block pt-1.5 border-t border-white/[0.06]">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Intake · 7 days</span>
              <Spark series={series} color={MACRO_COLORS.calories} height={30} />
            </span>
          )}
        </span>
      )}
    </WidgetFrame>
  )
}
