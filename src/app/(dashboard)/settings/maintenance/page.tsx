'use client'

import { useRouter } from 'next/navigation'
import { Leaf } from 'lucide-react'
import { BackLink } from '@/components/nav/NavChevron'
import { Zone, ZoneRow } from '@/components/ui/Zone'
import { SAND } from '@/lib/theme/palette'
import { useSettingsGoals } from '@/lib/hooks/useSettingsGoals'
import { leverById, atwaterKcal } from '@/lib/nutrition/levers'
import { maintenanceSpanFor } from '@/lib/nutrition/maintenance'
import { logicalTodayISO } from '@/lib/utils/day'

/**
 * The maintenance week's own numbers, and the day it ends.
 *
 * ── WHY THE FIGURES ARE READ-ONLY HERE ───────────────────────────────────────
 * A rung is a NAMED set of targets, defined in `levers.ts` and asserted by
 * `levers.test.ts` (every macro triple has to be Atwater-exact — this file has
 * been burned twice by a calorie literal disagreeing with the macros beside it).
 * An editable copy in the UI would be a second source for the same numbers, and
 * the first thing it would do is drift.
 *
 * To eat something different on one day, set a per-day target on the Day screen:
 * that layer sits ABOVE the rung and is the only one that can speak for a single
 * date. To change the week's baseline permanently, change the rung.
 *
 * ── AND WHY THE END DATE IS EDITABLE ─────────────────────────────────────────
 * Because a release that never ends is not a week. `LEVER_SCHEDULE` closes one
 * with a second hand-written row and its own comment admits the failure mode:
 * "forgetting is the default outcome". A toggle cannot add a row to a compiled
 * constant, so the end date lives in `user_goals.maintenance_until` — and the
 * cut resumes on its own whether or not anyone remembers.
 */
export default function MaintenanceTargetsPage() {
  const router = useRouter()
  const { loading, status, maintenanceUntil, maintenanceOn, setMaintenance } = useSettingsGoals()

  if (loading) return <p className="text-muted text-sm">Loading…</p>

  const rung = leverById('maintenance-week')
  const today = logicalTodayISO()
  const span = maintenanceSpanFor(today)

  return (
    <div data-boxed className="space-y-4">
      <header className="flex items-center gap-3">
        <BackLink onClick={() => router.back()} />
        <div className="min-w-0">
          <h1 className="font-heading text-fluid-lg font-bold text-text flex items-center gap-2">
            <Leaf className="w-4 h-4" style={{ color: SAND }} aria-hidden="true" /> Maintenance week
          </h1>
          <p className="text-fluid-xs text-muted">Full food, lighter steps. Still cutting.</p>
        </div>
      </header>

      {rung && (
        <Zone label="Targets" accent={SAND}>
          <Row label="Calories" value={`${rung.calorieGoal.toLocaleString()} kcal`} />
          <Row label="Protein" value={`${rung.proteinGoalG} g`} />
          <Row label="Carbohydrate" value={`${rung.carbsGoalG} g`} />
          <Row label="Fat" value={`${rung.fatGoalG} g`} />
          <Row label="Steps" value={rung.stepsGoal.toLocaleString()} />
          <Row
            label="Atwater check"
            value={`${atwaterKcal(rung.proteinGoalG, rung.carbsGoalG, rung.fatGoalG).toLocaleString()} kcal`}
          />
        </Zone>
      )}

      <Zone label="Ends on" accent={SAND}>
        <ZoneRow className="flex items-center gap-3 min-h-[52px]">
          <span className="min-w-0 flex-1">
            <span className="block text-fluid-sm text-text">Last day</span>
            <span className="block text-[10px] text-muted leading-snug">
              After this date the cut resumes on its own.
            </span>
          </span>
          <input
            type="date"
            value={maintenanceUntil ?? span?.end ?? ''}
            disabled={!maintenanceOn}
            onChange={(e) => void setMaintenance(true, e.target.value || null)}
            className="helix-num rounded-lg bg-surface-2 border border-border px-2.5 py-1.5 field-compact text-text disabled:opacity-40"
          />
        </ZoneRow>
      </Zone>

      {!maintenanceOn && (
        <p className="px-1 text-[11px] text-muted leading-snug">
          The maintenance week is not currently switched on. Turn it on in Settings
          to set an end date.
        </p>
      )}

      <p className="px-1 text-[11px] text-muted leading-snug">
        Eating something different on ONE day is a per-day target — tap today&apos;s
        calorie figure on the Day screen. That sits above this rung and is the only
        thing that can speak for a single date.
      </p>

      {status && (
        <p className={`text-sm px-1 ${status.type === 'success' ? 'text-success' : 'text-danger'}`}>{status.msg}</p>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <ZoneRow className="flex items-center gap-3 min-h-[44px]">
      <span className="flex-1 text-fluid-sm text-text">{label}</span>
      <span className="helix-num text-fluid-sm text-muted tabular-nums">{value}</span>
    </ZoneRow>
  )
}
