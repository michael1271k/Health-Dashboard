'use client'

import { useMemo } from 'react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Hero, Spark, StatTile } from './parts'
import { LedgerRow, compositionRows } from '@/components/body/CompositionLedger'
import { useTodayDailyLog } from '@/lib/hooks/useDashboard'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { BODY, EMBER } from '@/lib/theme/palette'
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
  /** Weight history in DISPLAY units, oldest first. */
  weightSeries: Array<number | null>
}) {
  const { data: log } = useTodayDailyLog()
  const unit = weightUnit()
  // A loose record on purpose — the ledger's derivation cares about the body
  // columns, not about which query shape they arrived in.
  const comp = useMemo(() => compositionRows(log as unknown as Record<string, unknown> | null), [log])

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
        <WidgetEmpty accent={EMBER} size={size} message="Ready for your first weigh-in" hint="Step on the scale to map your composition" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-0.5">
          <Hero value={kg} unit={unit} color={EMBER} decimals={1} />
          <span className="text-[9px] text-muted truncate">
            {comp.bodyFatPct != null ? `${r1(comp.bodyFatPct)}% body fat` : 'composition'}
          </span>
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          <span className="grid grid-cols-3 gap-1.5">
            <StatTile label="Weight" value={kg} unit={unit} color={EMBER} />
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

          {size === 'l' && (
            <span className="block mt-auto pt-1.5 border-t border-white/[0.06]">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Weight · 30 days</span>
              <Spark series={weightSeries} color={EMBER} height={30} />
            </span>
          )}
        </span>
      )}
    </WidgetFrame>
  )
}
