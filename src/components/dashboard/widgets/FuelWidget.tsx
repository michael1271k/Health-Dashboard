'use client'

import { memo, useMemo } from 'react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { BalanceBars, Hero } from './parts'
import { Bar } from '@/components/nutrition/MacroCards'
import { useTodayNutrients } from '@/lib/hooks/useTodayNutrients'
import { NUTRIENT_TARGETS } from '@/lib/nutrition/nutrientTargets'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { OXIDE, SAPPHIRE, EMERALD, MUTED } from '@/lib/theme/palette'
import { WIDGET_META, type WidgetSize } from '@/lib/dashboard/layout'

/**
 * Calories, the three macros and water — the day's budget, and nothing else.
 *
 * ── THE RINGS ARE GONE, AND WHY ──────────────────────────────────────────────
 * Four nested arcs said "one budget, four components", which is a true and
 * elegant thing to say. It is also unreadable at tile scale: the innermost ring
 * had a 13px radius, so fat — the macro most likely to be the day's problem —
 * was a 26px circle whose fill you had to squint at, and four arcs of different
 * lengths cannot be compared to each other by eye at all. Length can. The
 * nutrition page has always drawn these as horizontal bars for exactly that
 * reason, and this tile uses that page's OWN `Bar` component rather than a
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
 * ── THE MICROS MOVED OUT, AND THAT WAS THE FIX ───────────────────────────────
 * Fiber, sodium and iron used to sit at the foot of this tile, which made medium
 * carry eight readings of two different KINDS: five budgets you spend down, and
 * three checks you either pass or fail. Nothing in a widget's anatomy said which
 * was which, so the tile read as a wall and medium had to be tall to hold it.
 *
 * They are their own widget now (`NutrientsWidget`). That is the Apple answer to
 * this and not a dodge: Health does not put micronutrients on the Activity card,
 * it gives them their own place, because "did I clear 30 g of fiber" is a
 * different question asked at a different time from "how many calories are
 * left". Splitting them lets each tile be the right SIZE for what it says —
 * Fuel's five bars are a medium, the micro checklist is a small — and lets the
 * reader keep only the one they care about.
 *
 * ── AND WHY LARGE'S HISTORY IS COLUMNS, NOT A LINE ───────────────────────────
 * Large drew seven days of intake as a sparkline, which is the wrong shape
 * twice: it implies a value between Tuesday and Wednesday, and it plots the
 * intake ALONE, so a 2,100 kcal day looked identical whether the target was
 * 1,900 or 2,400. The baseline is now the TARGET and each day is a column from
 * it — under in the calorie hue, over in oxide — so a fortnight reads as a row
 * of verdicts. The target used is today's, which is stated on the chart: a
 * lever pulled mid-window moved the real line, and drawing one line while
 * implying fourteen would be the more misleading of the two options.
 */
function FuelWidgetImpl({ size, onOpen, kcal, kcalGoal, protein, carbs, fat, goals, waterMl, waterGoalMl, series, phaseLabel, phaseColor }: {
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
  /** Calorie history, oldest first. Large only. */
  series: Array<number | null>
  phaseLabel: string | null
  phaseColor: string | null
}) {
  const over = kcal != null && kcalGoal != null && kcal > kcalGoal

  const rows = [
    { key: 'calories', label: 'Calories', value: kcal, goal: kcalGoal, color: MACRO_COLORS.calories, unit: '' },
    { key: 'protein', label: 'Protein', value: protein, goal: goals.protein, color: MACRO_COLORS.protein, unit: 'g' },
    { key: 'carbs', label: 'Carbs', value: carbs, goal: goals.carbs, color: MACRO_COLORS.carbs, unit: 'g' },
    { key: 'fat', label: 'Fat', value: fat, goal: goals.fat, color: MACRO_COLORS.fat, unit: 'g' },
    { key: 'water', label: 'Water', value: waterMl, goal: waterGoalMl, color: SAPPHIRE, unit: 'ml' },
  ]

  /** Intake against today's target, per day. Negative is under. */
  const balance = useMemo(
    () => (kcalGoal ? series.map((v) => (v == null ? null : Math.round(v - kcalGoal))) : []),
    [series, kcalGoal],
  )

  return (
    <WidgetFrame {...WIDGET_META.fuel} size={size} onOpen={onOpen}>
      {kcal == null && protein == null ? (
        <WidgetEmpty accent={MACRO_COLORS.calories} size={size} message="Ready for today's first meal" hint={kcalGoal ? `${kcalGoal.toLocaleString()} kcal to spend` : undefined} />
      ) : size === 's' ? (
        /* Small carries the three macros too. It was a calorie count and a bar,
           which is the one reading a cut does NOT turn on: 1,900 kcal at 90 g of
           protein and 1,900 at 190 g are opposite days. Three 3px bars cost 14px
           of the body and answer it. */
        <span className="flex-1 min-h-0 flex flex-col justify-between gap-1">
          <Hero value={kcal} unit="kcal" color={over ? OXIDE : MACRO_COLORS.calories} tight />
          <Bar value={kcal} goal={kcalGoal} color={MACRO_COLORS.calories} height={5} />
          <span className="grid grid-cols-3 gap-1">
            {rows.slice(1, 4).map((r) => (
              <span key={r.key} className="min-w-0 flex flex-col gap-0.5">
                <span className="helix-num text-[9px] font-bold tabular-nums leading-none truncate" style={{ color: r.color }}>
                  {r.value != null ? Math.round(r.value) : '—'}
                  <span className="text-[7px] font-normal text-muted ml-0.5">{r.label.slice(0, 1)}</span>
                </span>
                <Bar value={r.value} goal={r.goal} color={r.color} height={3} />
              </span>
            ))}
          </span>
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

          {size === 'l' && balance.length > 1 && (
            <span className="block mt-auto pt-1.5 border-t border-white/[0.06]">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">
                  Intake vs target · {balance.length} days
                </span>
                <span className="helix-num text-[8px] tabular-nums text-muted ml-auto">
                  {balance.filter((v) => v != null && v <= 0).length} under
                </span>
              </span>
              <span className="block mt-1">
                <BalanceBars
                  values={balance}
                  under={MACRO_COLORS.calories}
                  over={OXIDE}
                  height={54}
                  zeroLabel={kcalGoal ? `the line is today's ${kcalGoal.toLocaleString()} kcal target` : undefined}
                />
              </span>
            </span>
          )}
        </span>
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * MICROS
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Fiber, sodium and iron: one floor that is hard to hit on a cut, one ceiling
 * that is easy to blow through, and one floor that quietly matters for training
 * turnover. Large adds the rest of the table.
 */
/**
 * How far off target a nutrient is, as a fraction — 0 when it is fine.
 *
 * A floor is missed by its SHORTFALL (18 g of a 30 g fibre target is 0.4 short);
 * a ceiling is missed by its OVERAGE (4,200 mg against a 3,000 mg sodium ceiling
 * is 0.4 over). Expressing both as a fraction of their own target is what makes
 * milligrams of sodium and grams of fibre comparable at all — the alternative
 * ranks by raw magnitude, which puts sodium first every single day purely
 * because it is measured in a smaller unit.
 *
 * An unmeasured nutrient scores -1 and sorts last. It is not at risk; it is
 * unknown, and promoting it would push a real shortfall off the tile in favour
 * of a row reading "—".
 */
export function nutrientRisk(have: number | null, target: number, kind: 'floor' | 'ceiling'): number {
  if (have == null) return -1
  if (target <= 0) return 0
  return kind === 'ceiling'
    ? Math.max(0, have / target - 1)
    : Math.max(0, 1 - have / target)
}

/**
 * The micronutrient checklist.
 *
 * ── IT IS A CHECKLIST, NOT A BUDGET, AND THAT IS WHY IT IS ITS OWN TILE ──────
 * Calories and macros are quantities you spend down: the reading is how much is
 * LEFT, and a bar is the right shape because the remainder is the point. A
 * micronutrient is a threshold — 30 g of fiber is a floor you clear, 2,300 mg of
 * sodium is a ceiling you stay under — and the reading is a verdict, not a
 * remainder. Drawing them as five more bars under the macros is what made the
 * Fuel tile a wall: eight rows that looked identical and meant two different
 * things.
 *
 * So each one is a colour and a number. Green cleared, oxide did not, and the
 * qualifier says which direction it was judged in — `/30 g` for a floor, `≤2300
 * mg` for a ceiling. Painting both the same colour would congratulate a day that
 * ate 4,200 mg of sodium.
 *
 * The targets are not invented here — they come from `NUTRIENT_TARGETS`, the same
 * evidence-based table the Nutrients page grades against, including whether each is
 * a floor or a ceiling. The INTAKE likewise comes from `useTodayNutrients`, which
 * folds the supplement stack's label doses in with food; a tile that counted
 * only food would report a shortfall the multivitamin had already covered.
 */
function NutrientsWidgetImpl({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const micros = useTodayNutrients()

  const rows = useMemo(() => {
    const graded = NUTRIENT_TARGETS.map((m) => {
      const have = micros[m.key] ?? null
      const ok = have != null && (m.kind === 'ceiling' ? have <= m.target : have >= m.target)
      return { ...m, have, ok, risk: nutrientRisk(have, m.target, m.kind) }
    })
    // ── RANKED BY RISK, NOT BY A FIXED LIST ──────────────────────────────────
    // The headline was hardcoded to fibre, sodium and iron. Those are reasonable
    // guesses at what usually goes wrong, and that is the problem: on the day
    // something else tanks, the tile shows three nutrients that are fine and
    // says nothing about the one that is not. The order is now the day's own —
    // worst first, met after, unmeasured last.
    const ranked = [...graded].sort((a, b) => b.risk - a.risk)
    return { ranked, graded }
  }, [micros])

  const known = rows.graded.filter((r) => r.have != null)
  const cleared = known.filter((r) => r.ok).length

  const cell = (r: typeof rows.graded[number]) => (
    <span key={r.key} className="min-w-0 flex flex-col gap-0.5">
      <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-muted truncate">{r.label}</span>
      <span className="helix-num text-[12px] font-bold tabular-nums leading-none truncate"
        style={{ color: r.have == null ? MUTED : r.ok ? EMERALD : OXIDE }}>
        {r.have == null ? '—' : Math.round(r.have)}
        <span className="text-[8px] font-normal text-muted ml-0.5">
          {r.kind === 'ceiling' ? '≤' : '/'}{r.target}{r.unit}
        </span>
      </span>
    </span>
  )

  return (
    <WidgetFrame {...WIDGET_META.micros} size={size} onOpen={onOpen}>
      {!known.length ? (
        <WidgetEmpty accent={EMERALD} size={size} message="No micronutrients logged today" hint="Food and the stack both count" />
      ) : size === 's' ? (
        /* ── SMALL IS FOUR NUTRIENTS, NOT A SCORE AND THREE ─────────────────
           It led with `12 of 18` at hero size and then squeezed three micros
           into a 3-column grid under it, in ~70px. Two things were wrong.

           "12 of 18" is not a reading. It counts how many of an arbitrary
           twenty-nutrient table happened to be both measured and met today, so
           it moves when your logging changes rather than when your diet does —
           and there is no action attached to it at any value.

           And it was taking the room the actual nutrients needed. Three cells
           across a small tile leaves roughly 50px per label, which is where
           "Vitamin C" and "Magnesium" started clipping. Dropping the score buys
           a 2×2 of the four furthest off target, at the size the medium face
           uses, with labels that fit. */
        <span className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-x-2 gap-y-1 content-center">
          {rows.ranked.slice(0, 4).map(cell)}
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          <span className="flex items-baseline gap-2">
            <Hero value={cleared} unit={`of ${known.length} cleared`} color={cleared === known.length ? EMERALD : OXIDE} tight />
          </span>
          {/* Four columns at large, not three: `NUTRIENT_TARGETS` carries twenty
              nutrients and a three-wide grid would run seven rows deep, past the
              bottom of a 292px tile. Twelve is what fits, and the page behind
              the tap is where the whole table lives. */}
          <span className={`grid gap-x-2 gap-y-1.5 ${size === 'l' ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {rows.ranked.slice(0, size === 'l' ? 12 : 6).map(cell)}
          </span>
          <span className="text-[8px] text-muted/70 mt-auto pt-1 border-t border-white/[0.06]">
            Furthest off target first · floors met, ceilings stayed under · food plus the stack
          </span>
        </span>
      )}
    </WidgetFrame>
  )
}

/*
 * ── EVERY WIDGET BODY IS MEMOIZED ────────────────────────────────────────────
 * The dashboard's render prop (`renderWidget` in `app/page.tsx`) is rebuilt
 * whenever any of the page's ~20 data hooks resolves, which walks the grid and
 * calls this file's components again. Before these wrappers, that meant every
 * tile re-ran its layout maths and its charts on every unrelated data change —
 * and the comment on the dashboard claiming the widgets were "memoised where it
 * pays" described something that did not exist anywhere in this directory.
 *
 * Shallow comparison is the whole contract, so it only holds while callers pass
 * stable props: see the hoisted constants and `useMemo`s in `app/page.tsx`,
 * which exist for this reason. A fresh `.map()` or object literal at the call
 * site silently turns these back into plain components.
 */
export const FuelWidget = memo(FuelWidgetImpl)
export const NutrientsWidget = memo(NutrientsWidgetImpl)
