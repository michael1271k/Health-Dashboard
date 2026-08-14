'use client'

import { memo, useState } from 'react'
import type { DailyLog } from '@/lib/hooks/useNutrition'
import { isExceptionDay } from '@/lib/nutrition/exceptionDay'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { OXIDE, EMERALD, MUTED, DIM, AMETHYST, SAND } from '@/lib/theme/palette'
import { logicalTodayISO } from '@/lib/utils/day'
import { KineticNumber } from '@/components/fx/KineticNumber'
import { useDoubleTap } from '@/lib/utils/doubleTap'
import { MacroOverrideSheet } from '@/components/nutrition/MacroOverrideSheet'
import type { MacroValues } from '@/lib/hooks/useMacroOverride'

interface Goals { calorie: number; protein: number | null; carbs: number | null; fat: number | null }
type MacroField = keyof MacroValues

/**
 * One horizontal fill, with the target marked and the overshoot shown.
 *
 * ── THE FILL USED TO CLAMP AT THE GOAL ───────────────────────────────────────
 * `Math.min(1, value / goal)` meant 2,100 kcal against a 1,950 goal and 3,400
 * kcal against the same goal drew the IDENTICAL full bar. The one reading the
 * bar exists to give — how far past you went — was the one it could not draw.
 *
 * So the track rescales to `max(value, goal)`: the fill runs to the goal, a
 * tick marks where the goal sits, and the excess continues past it in OXIDE.
 * The tick is what keeps the bar readable while it rescales — without it, a
 * bar that shortens as you eat more is just confusing.
 *
 * The track alpha is the ring track's `rgba(255,255,255,0.07)` unchanged — the
 * empty part of the goal reads at exactly the weight it always did.
 */
function Bar({ value, goal, color, height = 6 }: {
  value: number | null; goal: number | null; color: string; height?: number
}) {
  const v = value ?? 0
  const g = goal ?? 0
  const scale = Math.max(v, g)
  const pct = (n: number) => (scale > 0 ? (n / scale) * 100 : 0)
  const over = g > 0 && v > g

  return (
    <div
      className="relative w-full rounded-full overflow-hidden"
      style={{ height, background: 'rgba(255,255,255,0.07)' }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${pct(Math.min(v, g || v))}%`,
          background: color,
          transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
      {over && (
        <div
          className="absolute inset-y-0 rounded-r-full"
          style={{
            left: `${pct(g)}%`,
            width: `${pct(v - g)}%`,
            background: OXIDE,
            transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1), left 0.9s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      )}
      {/* The target tick. Only drawn once there is something past it to
          separate — on an under-budget day the end of the fill IS the answer. */}
      {over && (
        <div
          className="absolute inset-y-0 w-px"
          style={{ left: `${pct(g)}%`, background: 'rgba(255,255,255,0.55)' }}
        />
      )}
    </div>
  )
}

/** The seven-day rail's four states, in the order they are tested. */
const CELL_STATES = {
  exception: { color: AMETHYST, label: 'Exception' },
  estimated: { color: SAND, label: 'Estimated' },
  tracked: { color: EMERALD, label: 'Tracked' },
  untracked: { color: null, label: 'Not tracked' },
} as const

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
  // OVER THE TARGET YOU SET, not a constant. This read `kcal > 2050`, a
  // hardcoded v5.1 cut ceiling, so editing the calorie goal in Settings moved
  // the number and the remainder but not the colour — a 1,900 goal called a
  // 2,000 kcal day fine, and a 2,400 goal called it over.
  const over = kcal != null && goals.calorie > 0 && kcal > goals.calorie
  const todayISO = logicalTodayISO()
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

      {/* ── 7-day adherence rail ──
          These cells used to be tinted by PHASE, which is the one thing about a
          day this strip could not usefully say: on a cut every cell is the same
          colour, so seven identical boxes carried a weekday letter and nothing
          else. Adherence changes day to day, which is what makes a row of seven
          worth looking at — and it is the axis the exception and estimate flags
          already describe.

          The colours match the history rows exactly: an Exception is AMETHYST
          in both places, an Estimate is SAND in both. Two surfaces disagreeing
          about what colour a declared day is would be worse than either. */}
      <div className="flex items-center justify-center gap-1.5 pt-1">
        {cells.map((d) => {
          const state = isExceptionDay(d.exception) ? CELL_STATES.exception
            : d.estimated ? CELL_STATES.estimated
            : d.calories != null ? CELL_STATES.tracked
            : CELL_STATES.untracked
          const c = state.color
          const isToday = d.date === todayISO
          return (
            <div key={d.date}
              title={`${d.date} · ${state.label}${d.calories != null ? ` · ${Math.round(d.calories)} kcal` : ''}`}
              className="w-7 h-9 rounded-md border flex items-end justify-center pb-0.5"
              style={{
                borderColor: c ? `${c}55` : 'rgba(255,255,255,0.08)',
                background: c ? `${c}18` : 'rgba(255,255,255,0.02)',
                boxShadow: c ? `0 0 8px ${c}30` : undefined,
                // Today keeps an outline rather than a colour of its own — it
                // has a state like every other day and must still show it.
                outline: isToday ? '1px solid rgba(255,255,255,0.35)' : undefined,
                outlineOffset: isToday ? '1px' : undefined,
              }}>
              <span className="text-[8px] font-bold" style={{ color: c ?? DIM }}>
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
