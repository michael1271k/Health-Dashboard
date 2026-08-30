'use client'

import { useRouter } from 'next/navigation'
import { Flag } from 'lucide-react'
import { BackLink } from '@/components/nav/NavChevron'
import { Zone } from '@/components/ui/Zone'
import { NumberRow } from '@/components/settings/NumberRow'
import { STEEL } from '@/lib/theme/palette'
import { useSettingsGoals } from '@/lib/hooks/useSettingsGoals'
import type { BodyTargets } from '@/components/settings/planNumbers'

/**
 * Where the phase is steering — the destination, not the daily dose.
 *
 * ── THESE HAD TWO EDITORS, WRITING DIFFERENTLY ───────────────────────────────
 * They lived in the plan-preview drawer as three of eight text inputs committing
 * on blur into `plan_phase_goals`, and again in `EditPlanCard` staged behind a
 * Save — one number, two editors, two write semantics, ninety lines apart. That
 * is the actual defect this rebuild is fixing, not the untidiness.
 *
 * Nullable throughout: a plan may legitimately have no body-fat or muscle-mass
 * target, and clearing a field means "no target", never zero.
 */
export default function BodyTargetsPage() {
  const router = useRouter()
  const {
    goals, loading, saving, status, activePlanId, livePhase, activeLever,
    resolvePhaseGoals, savePlanNumbers,
  } = useSettingsGoals()

  if (loading) return <p className="text-muted text-sm">Loading…</p>

  const pp = resolvePhaseGoals(activePlanId, livePhase)
  const body: BodyTargets = {
    target_weight_kg: pp.targetWeightKg ?? null,
    target_body_fat_pct: pp.targetBodyFatPct ?? null,
    target_muscle_mass_kg: pp.targetMuscleMassKg ?? null,
  }

  // The daily numbers ride along unchanged: `savePlanNumbers` is one statement
  // about one plan's phase, and sending it a partial would rewrite the macros
  // from whatever this page happened to be holding.
  const commit = (patch: Partial<typeof body>) => {
    void savePlanNumbers(
      {
        calorie_goal: goals.calorie_goal, protein_goal_g: goals.protein_goal_g,
        carbs_goal_g: goals.carbs_goal_g, fat_goal_g: goals.fat_goal_g, steps_goal: goals.steps_goal,
      },
      {
        sleep_goal_hours: goals.sleep_goal_hours,
        active_cal_goal: goals.active_cal_goal,
        water_goal_ml: goals.water_goal_ml,
      },
      // Unchanged: editing a destination is not a statement about today's rung.
      activeLever ?? 'custom',
      { ...body, ...patch },
    )
  }

  return (
    <div data-boxed className="space-y-4">
      <header className="flex items-center gap-3">
        <BackLink onClick={() => router.back()} />
        <div className="min-w-0">
          <h1 className="font-heading text-fluid-lg font-bold text-text flex items-center gap-2">
            <Flag className="w-4 h-4" style={{ color: STEEL }} aria-hidden="true" /> Body targets
          </h1>
          <p className="text-fluid-xs text-muted">Where this plan&apos;s phase is steering</p>
        </div>
      </header>

      <Zone label="Destination" accent={STEEL}>
        <NumberRow label="Weight" unit="kg" step={0.1} value={body.target_weight_kg}
          placeholder="—" onCommit={(v) => commit({ target_weight_kg: v })} />
        <NumberRow label="Body fat" unit="%" step={0.1} value={body.target_body_fat_pct}
          placeholder="—" onCommit={(v) => commit({ target_body_fat_pct: v })} />
        <NumberRow label="Skeletal muscle" unit="kg" step={0.1} value={body.target_muscle_mass_kg}
          placeholder="—" onCommit={(v) => commit({ target_muscle_mass_kg: v })} />
      </Zone>

      <p className="px-1 text-[11px] text-muted leading-snug">
        Blank means no target, which is not the same as zero. Skeletal muscle mass
        is the figure the scale reports directly — not lean soft tissue, and not
        fat-free mass.
      </p>

      {status && (
        <p className={`text-sm px-1 ${status.type === 'success' ? 'text-success' : 'text-danger'}`}>{status.msg}</p>
      )}
      {saving && <p className="text-xs text-muted px-1">Saving…</p>}
    </div>
  )
}
