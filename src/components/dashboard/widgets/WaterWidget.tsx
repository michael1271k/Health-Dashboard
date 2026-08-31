'use client'

import { memo, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { HalfArc, MiniBars, StatTile } from './parts'
import { supabase } from '@/lib/supabase/client'
import { logicalTodayISO } from '@/lib/utils/day'
import { WIDGET_META, type WidgetSize } from '@/lib/dashboard/layout'
import { SAPPHIRE, EMERALD, STEEL } from '@/lib/theme/palette'

/** One glass, in ml. The unit a person actually counts hydration in. */
const GLASS_ML = 250

/**
 * Thirty days of hydration, oldest first.
 *
 * ── WHY THIS FETCHES INSTEAD OF TAKING PROPS ─────────────────────────────────
 * The dashboard already has TODAY's `water_ml` — the Fuel tile draws it as one
 * of five rows — so a props-only widget would have been a one-line change. But
 * the history is the half that makes a hydration tile worth having: a single
 * ratio says whether today is going well and nothing about whether it usually
 * does, and hydration is the metric in this app most likely to be quietly
 * abandoned for a fortnight. Threading a second 30-day query through the page
 * for one tile is what the "bodies fetch their own data" rule exists to avoid.
 */
function useWaterDays(days = 30) {
  return useQuery({
    queryKey: ['daily_logs', 'water', days],
    staleTime: 60_000,
    queryFn: async (): Promise<Array<{ date: string; ml: number | null }>> => {
      const to = logicalTodayISO()
      const from = new Date(`${to}T12:00:00`)
      from.setDate(from.getDate() - (days - 1))
      const { data, error } = await supabase
        .from('daily_logs')
        .select('date, water_ml')
        .gte('date', from.toISOString().slice(0, 10))
        .lte('date', to)
        .order('date', { ascending: true })
      if (error) throw error
      return ((data ?? []) as Array<{ date: string; water_ml: number | null }>)
        .map((r) => ({ date: r.date, ml: r.water_ml }))
    },
  })
}

/**
 * Hydration, as one quantity against one target.
 *
 * ── THE ARC, NOT A BAR ───────────────────────────────────────────────────────
 * Same shape as Sleep, for the same reason: both are "how much of a daily
 * target did you reach", and drawing them differently would make two identical
 * questions look like two different kinds of fact. The sweep is the ratio and
 * the centre is the litres, because litres is what a bottle is labelled in and
 * `2,340 ml` is a number nobody has ever repeated out loud.
 *
 * ── AND WHY IT IS ITS OWN TILE AT ALL ────────────────────────────────────────
 * Water is already the fifth row of the Fuel tile, where it is a 3px bar under
 * four macros — correct there, because on a cut what you drink is a footnote to
 * what you eat. It is not correct as the ONLY place it appears: a footnote
 * cannot carry a target you are meant to act on before lunch, and it cannot
 * carry the month that says whether this is a good week or a normal one.
 *
 * TWO SIZES. There is no large because there is no third answer — the ratio and
 * its history is everything hydration knows, and a large would be the medium
 * with the month stretched taller, which teaches the reader that growing a tile
 * buys nothing. See the note on `WIDGET_SIZES`.
 */
function WaterWidgetImpl({ size, onOpen, waterMl, goalMl }: {
  size: WidgetSize
  onOpen?: () => void
  waterMl: number | null
  goalMl: number
}) {
  const { data: days } = useWaterDays(30)

  const series = useMemo(() => (days ?? []).map((d) => d.ml), [days])
  const pct = waterMl != null && goalMl ? (waterMl / goalMl) * 100 : null
  const litres = waterMl != null ? Math.round((waterMl / 1000) * 10) / 10 : null
  const glasses = waterMl != null ? Math.round(waterMl / GLASS_ML) : null
  const goalGlasses = Math.round(goalMl / GLASS_ML)
  const left = waterMl != null ? Math.max(0, goalMl - waterMl) : null

  /**
   * Days on target out of days RECORDED, never out of thirty.
   *
   * A day with no row is a day the sync has not reported, not a day you drank
   * nothing — the same distinction `MIN_WATER_ML` exists for on the override —
   * and a denominator of 30 would grade an unsynced fortnight as a failure.
   */
  const logged = series.filter((v): v is number => v != null && v > 0)
  const hit = logged.filter((v) => v >= goalMl).length

  // One continuous sweep: hydration has no stages to divide it by, so the arc
  // takes a single segment in its own hue rather than a segmented ring.
  const segments = [{ key: 'water', value: 1, color: SAPPHIRE }]

  return (
    <WidgetFrame {...WIDGET_META.water} size={size} onOpen={onOpen}>
      {waterMl == null ? (
        <WidgetEmpty
          accent={SAPPHIRE}
          size={size}
          message="Nothing logged yet today"
          hint={`${(goalMl / 1000).toFixed(1)} L is the target`}
        />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex items-center justify-center">
          {/* The arc is width-driven at 100:56, so it is given the widest box
              that still fits the 70px body rather than allowed to stretch. */}
          <span className="w-[112px]">
            <HalfArc pct={pct} segments={segments} width={9}>
              <span className="text-center leading-none">
                <span className="helix-num block font-bold text-[16px] tabular-nums" style={{ color: SAPPHIRE }}>
                  {litres}<span className="text-[9px] font-normal text-muted ml-0.5">L</span>
                </span>
                <span className="block text-[7px] text-muted mt-px">of {(goalMl / 1000).toFixed(1)}L</span>
              </span>
            </HalfArc>
          </span>
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1">
          <span className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 w-[118px]">
              <HalfArc pct={pct} segments={segments} width={10}>
                <span className="text-center leading-none">
                  <span className="helix-num block font-bold text-[17px] tabular-nums" style={{ color: SAPPHIRE }}>
                    {litres}<span className="text-[10px] font-normal text-muted ml-0.5">L</span>
                  </span>
                  <span className="block text-[8px] text-muted mt-0.5">of {(goalMl / 1000).toFixed(1)}L</span>
                </span>
              </HalfArc>
            </span>

            <span className="flex-1 min-w-0 grid grid-cols-1 gap-1.5">
              <StatTile label="Glasses" value={glasses != null ? `${glasses}/${goalGlasses}` : null} color={SAPPHIRE} />
              {/* "To go" turns the ratio into the next action; at 0 it becomes
                  the verdict instead, because "0 ml to go" is a worse way of
                  saying you got there. */}
              {left != null && left > 0
                ? <StatTile label="To go" value={Math.round(left)} unit="ml" color={STEEL} />
                : <StatTile label="Target" value="Met" color={EMERALD} />}
            </span>
          </span>

          <span className="block pt-1 mt-auto border-t border-white/[0.06]">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Daily · 30</span>
              {logged.length > 0 && (
                <span className="helix-num text-[8px] tabular-nums text-muted ml-auto">
                  {hit}/{logged.length} on target
                </span>
              )}
            </span>
            <span className="block mt-1">
              <MiniBars series={series} color={SAPPHIRE} goal={goalMl} height={26} />
            </span>
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
export const WaterWidget = memo(WaterWidgetImpl)
