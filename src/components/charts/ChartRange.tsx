'use client'

import { Sparkles } from 'lucide-react'
import { useEraWindow } from '@/lib/hooks/useEraWindow'
import { Segmented } from '@/components/ui/Segmented'
import { STEEL, GOLD } from '@/lib/theme/palette'

/** The default window. Every chart in the app opens on this. */
export const DEFAULT_RANGE_DAYS = 30

/**
 * The ONLY timeframe control in the app: 1 Month, or the whole active era.
 *
 * ── WHAT THIS REPLACES, AND WHY ──────────────────────────────────────────────
 * Three components and one hand-rolled button, adding up to ten segments across
 * two panels: `RangeSelector` offered 1W/2W/1M/2M/3M/4M/5M/6M, `CurrentWeekButton`
 * added a plan week, `PlanEraButton` added the era, and `MuscleAnalyticsPanel`
 * hand-rolled its own "30 Days" next to them.
 *
 * Eight of those ten answered a question nobody was asking. A trend line over
 * 2 weeks versus 3 weeks is the same line with a different amount of it visible,
 * and picking between them is work the reader has to do before they can read
 * anything. Two windows carry real meaning: **recent** (is this week like the
 * last few?) and **the whole block** (has the plan worked?). Everything between
 * was a slider disguised as a decision.
 *
 * The plan week went too, deliberately. Week-scoped facts belong in a
 * week-scoped card — `WeekToDateTargets` sits ABOVE this control in
 * `MuscleAnalyticsPanel` for exactly that reason, and MEV/MAV landmarks rendered
 * under a "30 Days" toggle implied a window they never had.
 *
 * ── ONE CONTROL, ONE MEANING ─────────────────────────────────────────────────
 * The era segment sets the window AND, through `eraForRange`, which era the
 * charts filter to — so no chart surface reads `EraFilterProvider` any more.
 * Three pills reading All / Helix 5.1 / PPL beside a toggle reading "Helix-5
 * Era" would be two controls for one meaning, neither able to say what the other
 * had done. The pills survive only on the two LIST surfaces (the Nutrition
 * history and the Progress timeline), where 'all' is the only way the
 * Notion-imported history renders at all.
 */
export function ChartRange({ value, onChange, className = '' }: {
  value: number
  onChange: (days: number) => void
  className?: string
}) {
  const era = useEraWindow()
  // Not `value === era.days`: when the plan started ~30 days ago the two windows
  // coincide, and highlighting BOTH segments would say the app cannot tell them
  // apart. The month wins the tie because it is the default.
  const monthActive = value === DEFAULT_RANGE_DAYS

  return (
    <Segmented<'month' | 'era'>
      label="Chart timeframe"
      className={className}
      value={monthActive ? 'month' : 'era'}
      onChange={(v) => onChange(v === 'month' ? DEFAULT_RANGE_DAYS : era.days)}
      options={[
        { value: 'month', label: '1 Month', color: STEEL, title: 'The last 30 days' },
        {
          value: 'era', label: era.label, icon: Sparkles, color: GOLD,
          // The anchor date, because "Helix-5 Era" alone does not say how far
          // back it reaches — and right now that is close enough to a month to
          // matter.
          title: `Since ${era.startISO} · ${era.days} days`,
        },
      ]}
    />
  )
}
