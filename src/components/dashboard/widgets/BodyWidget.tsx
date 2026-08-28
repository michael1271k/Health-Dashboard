'use client'

import { useMemo } from 'react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Hero, LineChart, Spark, StatTile } from './parts'
import { LedgerRow, compositionRows } from '@/components/body/CompositionLedger'
import { useTodayDailyLog } from '@/lib/hooks/useDashboard'
import { useLatestBodyReading } from '@/lib/hooks/useLatestBodyReading'
import { logicalTodayISO, relativeDayLabel } from '@/lib/utils/day'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { BODY } from '@/lib/theme/palette'
import { WIDGET_META, type WidgetSize } from '@/lib/dashboard/layout'

/**
 * What you are made of, in the tile.
 *
 * ── IT IS THE LEDGER, NOT A COPY OF IT ───────────────────────────────────────
 * The rows come from `compositionRows` and are drawn by the ledger's own
 * `LedgerRow`, in `compact`. That matters more than it looks: each row's healthy
 * band is a pair of hairline ticks at fixed percentages, and a second
 * implementation would be a second set of band edges to keep in step. It would
 * also be a second derivation — `deriveBodyComp` fills in what the scale did not
 * send, and two call sites deriving separately is how one body ends up with two
 * different fat masses on two screens.
 *
 * ── THE TWO HEADLINE PERCENTAGES ARE NOT THE SAME MUSCLE ─────────────────────
 * Body fat % and muscle % sit above the ledger as their own tiles, because they
 * are the two figures a weigh-in is FOR and reading them off a bar is a step
 * too many. The muscle one is SKELETAL muscle when the scale actually measured
 * it and LEAN SOFT TISSUE otherwise, labelled accordingly — those two are about
 * 23 kg apart (see `body-comp-is-three-metrics`), and a tile that silently
 * swapped one for the other would show a 25-point jump on a day nothing
 * happened. `compositionRows` already decides which exists; this just follows it.
 *
 * Medium shows three rows, not six. Fat, muscle and water are the ones that
 * move week to week; protein and bone mineral are near-constants that belong in
 * the full ledger a tap away. Large shows everything the reading carried.
 */
export function BodyWidget({ size, onOpen, weightSeries }: {
  size: WidgetSize
  onOpen?: () => void
  /** Weight history in DISPLAY units, dated, oldest first. */
  weightSeries: Array<{ date: string; value: number | null }>
}) {
  const { data: log } = useTodayDailyLog()
  const unit = weightUnit()
  const today = logicalTodayISO()

  /**
   * ── THE TILE REMEMBERS THE LAST WEIGH-IN ───────────────────────────────────
   * It read today's `daily_logs` row and nothing else, so on any morning you had
   * not yet stepped on the scale — which is most of them, and every morning
   * before about 8am — the whole tile collapsed to "Ready for your first
   * weigh-in". A body composition does not cease to exist on the days it is not
   * re-measured; the app had a perfectly good reading from Tuesday and refused
   * to say so.
   *
   * `useLatestBodyReading` is the same carry-forward the Nexus already uses to
   * offer placeholders, and it is field-by-field: 07-17 has a weight and a body
   * fat but no muscle %, so the newest muscle % genuinely lives on an older row
   * than the newest weight, and taking one whole row would lose it.
   *
   * The date is not optional. A carried reading shown without saying when it was
   * taken is indistinguishable from one taken this morning, which is the one
   * thing this must never be — hence `asOf` on every face.
   */
  const { data: carried } = useLatestBodyReading(today)

  // A loose record on purpose — the ledger's derivation cares about the body
  // columns, not about which query shape they arrived in.
  const live = useMemo(() => compositionRows(log as unknown as Record<string, unknown> | null), [log])
  const memory = useMemo(() => compositionRows(carried?.values ?? null), [carried])
  // Today wins whenever today has a weight; nothing is ever blended, because a
  // weight from this morning beside a body fat from last week is a composition
  // that never existed.
  const fresh = live.weight != null
  const comp = fresh ? live : memory
  const asOf = fresh ? today : (carried?.dates.weight_kg ?? carried?.latestDate ?? null)
  const asOfLabel = relativeDayLabel(asOf, today)

  /** The three that move, heaviest share first — or everything, at large. */
  const shown = useMemo(() => {
    const wanted = size === 'l'
      ? ['skeletal', 'muscle', 'water', 'protein', 'mineral', 'fat']
      : ['muscle', 'water', 'fat']
    return wanted
      .map((k) => comp.rows.find((r) => r.key === k))
      .filter((r): r is NonNullable<typeof r> => !!r)
  }, [comp.rows, size])

  /** Skeletal when measured, lean soft tissue otherwise — never conflated. */
  const musclePct = useMemo(() => {
    const skel = comp.rows.find((r) => r.key === 'skeletal')
    if (skel?.pct != null) return { label: 'Skeletal', pct: skel.pct, color: BODY.muscle }
    const lean = comp.rows.find((r) => r.key === 'muscle')
    return lean?.pct != null ? { label: 'Lean Tissue', pct: lean.pct, color: BODY.lean } : null
  }, [comp.rows])

  const kg = comp.weight != null ? displayWeight(comp.weight) : null
  const r1 = (v: number) => Math.round(v * 10) / 10

  return (
    <WidgetFrame {...WIDGET_META.body} size={size} onOpen={onOpen}>
      {comp.weight == null ? (
        <WidgetEmpty accent={BODY.weight} size={size} message="Ready for your first weigh-in" hint="Step on the scale to map your composition" />
      ) : size === 's' ? (
        /* ── SMALL CARRIES THE OTHER HALF OF A WEIGH-IN ──
           A weight alone cannot say whether a kilo went the right way; that is
           the whole reason the scale reports body fat. Both numbers, then the
           month behind them, in the 70px the tile has. */
        <span className="flex-1 min-h-0 flex flex-col justify-between gap-0.5">
          <span className="flex items-baseline gap-1.5 min-w-0">
            <Hero value={kg} unit={unit} color={BODY.weight} decimals={1} tight />
            <span className="helix-num text-[11px] font-bold tabular-nums ml-auto shrink-0"
              style={{ color: comp.bodyFatPct != null ? BODY.fat : 'var(--color-muted)' }}>
              {comp.bodyFatPct != null ? r1(comp.bodyFatPct) : '—'}
              <span className="text-[8px] font-normal text-muted ml-0.5">% fat</span>
            </span>
          </span>
          {asOfLabel && (
            <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted truncate">{asOfLabel}</span>
          )}
          <Spark series={weightSeries.map((d) => d.value)} color={BODY.weight} height={22} />
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          {asOfLabel && (
            <span className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted truncate">
                {fresh ? 'Weighed today' : `Last weighed · ${asOfLabel}`}
              </span>
            </span>
          )}
          <span className="grid grid-cols-3 gap-1.5">
            <StatTile label="Weight" value={kg} unit={unit} color={BODY.weight} />
            <StatTile
              label="Body Fat"
              value={comp.bodyFatPct != null ? r1(comp.bodyFatPct) : null}
              unit="%"
              color={BODY.fat}
            />
            <StatTile
              label={musclePct?.label ?? 'Muscle'}
              value={musclePct ? r1(musclePct.pct) : null}
              unit="%"
              color={musclePct?.color ?? BODY.lean}
            />
          </span>

          <span className="block space-y-1.5">
            {shown.map((r) => (
              <LedgerRow
                key={r.key}
                compact
                label={r.label}
                color={r.color}
                pct={r.pct}
                mass={r.mass}
                lo={r.lo}
                hi={r.hi}
                unit={unit}
              />
            ))}
          </span>

          {/* ── THE 30-DAY CHART IS A LINE NOW, NOT A BROKEN SPARK ──
              `Spark` breaks its path on every unmeasured day, deliberately — a
              line through a day with no steps is a claim about a day with no
              data. Weight is the opposite kind of quantity: you do not stop
              having one on the mornings you skip the scale, so a body weighed
              sixteen times in thirty days came out as a shattered chart of a
              perfectly continuous trend. `LineChart` draws through the
              measurements, marks only the days that were actually weighed, and
              dates the axis so the slope is readable as a rate. */}
          {size === 'l' && (
            <span className="block mt-auto pt-1.5 border-t border-white/[0.06]">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Weight · 30 days</span>
                <span className="text-[8px] text-muted ml-auto">tap a point for its day</span>
              </span>
              {/* BODY.weight, not EMBER. Ember is the Chest family now, and the body
                  domain has had its own per-substance hue since the BODY map landed —
                  the chart was simply never moved onto it. */}
              <LineChart series={weightSeries} color={BODY.weight} height={62} decimals={1} unit={unit} />
            </span>
          )}
        </span>
      )}
    </WidgetFrame>
  )
}
