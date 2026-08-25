'use client'

import { useMemo } from 'react'
import { Scale } from 'lucide-react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Hero, Spark } from './parts'
import { LedgerRow, compositionRows } from '@/components/body/CompositionLedger'
import { useTodayDailyLog } from '@/lib/hooks/useDashboard'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { EMBER } from '@/lib/theme/palette'
import type { WidgetSize } from '@/lib/dashboard/layout'

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
 * Medium shows THREE rows, not six. Fat, lean soft tissue and water are the ones
 * that move week to week; protein and bone mineral are near-constants that
 * belong in the full ledger a tap away, and skeletal muscle is only present on
 * the days the reading was actually taken.
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

  // The three that move. Ordered heaviest-share first so the bars descend.
  const shown = useMemo(
    () => ['muscle', 'water', 'fat']
      .map((k) => comp.rows.find((r) => r.key === k))
      .filter((r): r is NonNullable<typeof r> => !!r),
    [comp.rows],
  )

  const kg = comp.weight != null ? displayWeight(comp.weight) : null

  return (
    <WidgetFrame icon={Scale} label="Body" accent={EMBER} size={size} onOpen={onOpen}>
      {comp.weight == null ? (
        <WidgetEmpty accent={EMBER} message="Ready for your first weigh-in" hint="Step on the scale to map your composition" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-0.5">
          <Hero value={kg} unit={unit} color={EMBER} decimals={1} />
          <span className="text-[9px] text-muted truncate">
            {comp.bodyFatPct != null ? `${Math.round(comp.bodyFatPct * 10) / 10}% body fat` : 'composition'}
          </span>
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-2 justify-center">
          <span className="flex items-baseline gap-2 min-w-0">
            <Hero value={kg} unit={unit} color={EMBER} decimals={1} tight />
            {comp.bodyFatPct != null && (
              <span className="helix-num text-[11px] tabular-nums text-muted ml-auto shrink-0">
                {Math.round(comp.bodyFatPct * 10) / 10}<span className="text-[9px]">% fat</span>
              </span>
            )}
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
        </span>
      )}

      {size === 'l' && comp.weight != null && (
        <span className="block pt-2 mt-1 border-t border-white/[0.06]">
          <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Weight · 21 days</span>
          <Spark series={weightSeries} color={EMBER} height={34} />
        </span>
      )}
    </WidgetFrame>
  )
}
