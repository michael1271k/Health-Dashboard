'use client'

import { memo, useState } from 'react'
import type { DailyLog } from '@/lib/hooks/useNutrition'
import { PHASE_META } from '@/lib/nutrition/phase'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { OXIDE, EMERALD, MUTED } from '@/lib/theme/palette'
import { KineticNumber } from '@/components/fx/KineticNumber'
import { useDoubleTap } from '@/lib/utils/doubleTap'
import { MacroOverrideSheet } from '@/components/nutrition/MacroOverrideSheet'
import type { MacroValues } from '@/lib/hooks/useMacroOverride'

interface Goals { calorie: number; protein: number | null; carbs: number | null; fat: number | null }
type MacroField = keyof MacroValues

/** The v5.1 cut-day ceiling. Past it the day is over budget, not merely on it. */
const CUT_CEILING = 2050

/**
 * One horizontal fill. Replaces the SVG ring stroke and keeps its easing, so
 * the number still animates into place rather than snapping.
 *
 * The track alpha is the ring track's `rgba(255,255,255,0.07)` unchanged — the
 * empty part of the goal reads at exactly the weight it always did.
 */
function Bar({ value, goal, color, height = 6 }: {
  value: number | null; goal: number | null; color: string; height?: number
}) {
  const pct = value != null && goal ? Math.min(1, Math.max(0, value / goal)) : 0
  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{ height, background: 'rgba(255,255,255,0.07)' }}
      aria-hidden="true"
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct * 100}%`,
          background: color,
          transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
    </div>
  )
}

/**
 * MacroCards — the compact horizontal nutrition summary.
 *
 * ── WHY THE RINGS WENT ───────────────────────────────────────────────────────
 * The hero was a 208px calories ring plus three 100px macro rings plus their
 * labels and remainders: roughly 400px before the fuel cells. On a 390px phone
 * that is the whole viewport spent on four numbers, and everything the page
 * actually does — the exception banner, water, the day list — started below the
 * fold. Two stacked cards with horizontal fills say the same four things in
 * about a third of the height.
 *
 * A ring encodes progress as an angle, which is genuinely harder to read at a
 * glance than a bar: comparing three arcs of different radii against three
 * different goals is a comparison the eye is bad at. The bars are all the same
 * length, so "further along" is literally further along.
 *
 * ── DARK, NOT WHITE ──────────────────────────────────────────────────────────
 * The layout is taken from a light-mode tracker; the surface is not. Helix is
 * Obsidian (`#0A0B0D`) and a genuinely white card here would be the only light
 * surface in the app — it would read as an embedded foreign component rather
 * than as an accent. Same card idiom as everything else: hairline + 3% white.
 *
 * ── EVERY COLOUR COMES FROM THE PALETTE ──────────────────────────────────────
 * `MACRO` for the four fills, `OXIDE`/`EMERALD` for over/under. The ring version
 * carried raw `'#C4514E'` and `'#3E9E7A'` literals; those are the same values
 * the palette exports, so they are imports now. The hex ratchet counts literals,
 * and it is right to.
 */
export const MacroCards = memo(function MacroCards({ today, logs, goals, date }: {
  today: { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null } | null
  logs: DailyLog[]           // recent days, newest first (fuel cells)
  goals: Goals
  /** When set, double-tapping a card opens the manual-override sheet for this day. */
  date?: string
}) {
  const kcal = today?.calories != null ? Math.round(today.calories) : null
  const over = kcal != null && kcal > CUT_CEILING
  const remaining = kcal != null ? goals.calorie - kcal : null
  const cells = [...logs].slice(0, 7).reverse()
  const calColor = over ? OXIDE : MACRO_COLORS.calories

  // Double-tap → manual override sheet (one handler per macro; hooks stay unconditional).
  const [editFocus, setEditFocus] = useState<MacroField | null>(null)
  const tapCal = useDoubleTap(() => date && setEditFocus('calories'))
  const tapPro = useDoubleTap(() => date && setEditFocus('protein_g'))
  const tapCarb = useDoubleTap(() => date && setEditFocus('carbs_g'))
  const tapFat = useDoubleTap(() => date && setEditFocus('fat_g'))

  // Order: Carbs · Fat · Protein (left → centre → right), unchanged from the rings.
  const macros = [
    { label: 'Carbs', value: today?.carbsG ?? null, goal: goals.carbs, color: MACRO_COLORS.carbs, onTap: tapCarb },
    { label: 'Fat', value: today?.fatG ?? null, goal: goals.fat, color: MACRO_COLORS.fat, onTap: tapFat },
    { label: 'Protein', value: today?.proteinG ?? null, goal: goals.protein, color: MACRO_COLORS.protein, onTap: tapPro },
  ]

  const tappable = date
    ? { style: { cursor: 'pointer' as const }, title: 'Double-tap to edit' }
    : {}

  return (
    <section className="space-y-2.5">
      <h2 className="font-heading font-semibold text-text">Fuel</h2>

      {/* ── Card 1 · Calories ── */}
      <div
        className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5"
        onClick={date ? tapCal : undefined}
        {...tappable}
      >
        <div className="flex items-end justify-between gap-3 mb-2.5">
          <div className="flex items-baseline gap-1.5 min-w-0">
            {/* The figure itself stays in the default text colour, as it did
                inside the ring. Over-ceiling is signalled by the fill and the
                remainder — colouring the number too would make an ordinary
                1,900 kcal day and a 2,100 kcal day look like different KINDS
                of thing rather than different amounts. */}
            {kcal != null
              ? <KineticNumber value={kcal} className="helix-num text-3xl font-bold leading-none text-text" duration={800} />
              : <span className="helix-num text-3xl font-bold leading-none text-muted">—</span>}
            <span className="text-[11px] text-muted shrink-0">cal</span>
            <span className="helix-num text-[11px] text-muted shrink-0 ml-0.5">
              / {goals.calorie.toLocaleString()}
            </span>
          </div>

          {remaining != null ? (
            <span
              className="helix-num text-[13px] font-semibold leading-none shrink-0"
              style={{ color: remaining >= 0 ? MUTED : OXIDE }}
            >
              {remaining >= 0
                ? `${remaining.toLocaleString()} left`
                : `${Math.abs(remaining).toLocaleString()} over`}
            </span>
          ) : (
            // Kept verbatim. The empty state is the one place this surface gets
            // to be warm, and a dash where a breakfast should be is not.
            <span className="text-[11px] text-muted shrink-0">Breakfast is waiting 🍳</span>
          )}
        </div>

        <Bar value={kcal} goal={goals.calorie} color={calColor} height={6} />
      </div>

      {/* ── Card 2 · Macros ── */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
        <div className="grid grid-cols-3 gap-4">
          {macros.map((m) => {
            const short = m.value != null && m.goal != null ? Math.round(m.goal - m.value) : null
            return (
              <div
                key={m.label}
                className="min-w-0"
                onClick={date ? m.onTap : undefined}
                {...tappable}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: m.color }}>
                  {m.label}
                </div>
                <div className="flex items-baseline gap-1 mb-1.5">
                  <span className="helix-num text-fluid-lg font-bold leading-none text-text">
                    {m.value != null ? Math.round(m.value) : '—'}
                  </span>
                  <span className="text-[10px] text-muted">g</span>
                  <span className="helix-num text-[10px] text-muted">/ {m.goal ?? '—'}</span>
                </div>
                <Bar value={m.value} goal={m.goal} color={m.color} height={4} />
                {short != null && (
                  <div
                    className="helix-num text-[9px] mt-1 leading-none"
                    style={{ color: short >= 0 ? EMERALD : OXIDE }}
                  >
                    {short >= 0 ? `${short} left` : `${Math.abs(short)} over`}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 7-day phase fuel cells */}
      <div className="flex items-center justify-center gap-1.5 pt-1">
        {cells.map((d) => {
          const c = d.phase ? PHASE_META[d.phase].color : null
          return (
            <div key={d.date} title={`${d.date}${d.calories != null ? ` · ${Math.round(d.calories)} kcal` : ''}`}
              className="w-7 h-9 rounded-md border flex items-end justify-center pb-0.5"
              style={{ borderColor: c ? `${c}55` : 'rgba(255,255,255,0.08)', background: c ? `${c}18` : 'rgba(255,255,255,0.02)', boxShadow: c ? `0 0 8px ${c}30` : undefined }}>
              <span className="text-[8px] font-bold" style={{ color: c ?? '#5A6472' }}>
                {new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'narrow' })}
              </span>
            </div>
          )
        })}
      </div>

      {date && (
        <MacroOverrideSheet
          open={editFocus !== null}
          onClose={() => setEditFocus(null)}
          date={date}
          focus={editFocus ?? undefined}
          initial={{
            calories: today?.calories ?? 0,
            protein_g: today?.proteinG ?? 0,
            carbs_g: today?.carbsG ?? 0,
            fat_g: today?.fatG ?? 0,
          }}
        />
      )}
    </section>
  )
})
