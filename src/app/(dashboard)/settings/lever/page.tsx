'use client'

import { useRouter } from 'next/navigation'
import { Gauge } from 'lucide-react'
import { BackLink } from '@/components/nav/NavChevron'
import { Zone, ZoneRow } from '@/components/ui/Zone'
import { GOLD } from '@/lib/theme/palette'
import { useSettingsGoals } from '@/lib/hooks/useSettingsGoals'
import { DEFICIT_LEVERS, type LeverId } from '@/lib/nutrition/levers'

/**
 * Which rung of the cut is in force.
 *
 * DEFICIT rungs only. The maintenance week is a `release` — the opposite move,
 * planned and bounded — and it has its own toggle on the Settings page and its
 * own page for its numbers. They shared a drawer before, where the release
 * rendered as a full-width emerald button carrying a label, a 90-character hint,
 * a macro line and a summary sentence underneath, directly below the grid of
 * things it is not one of.
 */
export default function LeverPage() {
  const router = useRouter()
  const { loading, status, goals, activeLever, leverInForce, savePlanNumbers } = useSettingsGoals()

  if (loading) return <p className="text-muted text-sm">Loading…</p>

  const pick = (id: LeverId) => {
    const rung = DEFICIT_LEVERS.find((l) => l.id === id)
    void savePlanNumbers(
      rung
        ? {
            calorie_goal: rung.calorieGoal, protein_goal_g: rung.proteinGoalG,
            carbs_goal_g: rung.carbsGoalG, fat_goal_g: rung.fatGoalG, steps_goal: rung.stepsGoal,
          }
        : {
            calorie_goal: goals.calorie_goal, protein_goal_g: goals.protein_goal_g,
            carbs_goal_g: goals.carbs_goal_g, fat_goal_g: goals.fat_goal_g, steps_goal: goals.steps_goal,
          },
      {
        sleep_goal_hours: goals.sleep_goal_hours,
        active_cal_goal: goals.active_cal_goal,
        water_goal_ml: goals.water_goal_ml,
      },
      id,
    )
  }

  const selected = activeLever ?? leverInForce

  return (
    <div data-boxed className="space-y-4">
      <header className="flex items-center gap-3">
        <BackLink onClick={() => router.back()} />
        <div className="min-w-0">
          <h1 className="font-heading text-fluid-lg font-bold text-text flex items-center gap-2">
            <Gauge className="w-4 h-4" style={{ color: GOLD }} aria-hidden="true" /> Deficit lever
          </h1>
          <p className="text-fluid-xs text-muted">One named notch, applied from today forward</p>
        </div>
      </header>

      <Zone label="Rungs" accent={GOLD}>
        {DEFICIT_LEVERS.map((l) => {
          const on = selected === l.id
          return (
            <ZoneRow key={l.id} asButton onClick={() => pick(l.id)} className="flex items-center gap-3 min-h-[56px]">
              <span
                className="h-4 w-4 rounded-full border-2 shrink-0"
                style={{ borderColor: on ? GOLD : 'rgba(255,255,255,0.22)', background: on ? GOLD : 'transparent' }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-fluid-sm font-medium text-text">{l.label}</span>
                <span className="block text-[10px] text-muted leading-snug">{l.summary}</span>
              </span>
              <span className="helix-num text-[10px] text-muted text-right shrink-0 tabular-nums">
                <span className="block text-text">{l.calorieGoal.toLocaleString()} kcal</span>
                {l.proteinGoalG}/{l.carbsGoalG}/{l.fatGoalG} · {(l.stepsGoal / 1000).toFixed(0)}k
              </span>
            </ZoneRow>
          )
        })}
        <ZoneRow asButton onClick={() => pick('custom')} className="flex items-center gap-3 min-h-[56px]">
          <span
            className="h-4 w-4 rounded-full border-2 shrink-0"
            style={{ borderColor: selected === 'custom' ? GOLD : 'rgba(255,255,255,0.22)', background: selected === 'custom' ? GOLD : 'transparent' }}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-fluid-sm font-medium text-text">My own numbers</span>
            <span className="block text-[10px] text-muted leading-snug">
              Whatever is set in Daily targets. A real selection, not an absence.
            </span>
          </span>
        </ZoneRow>
      </Zone>

      <p className="px-1 text-[11px] text-muted leading-snug">
        A rung applies from today forward and never re-marks a finished day — those
        were eaten against whatever was in force at the time.
      </p>

      {status && (
        <p className={`text-sm px-1 ${status.type === 'success' ? 'text-success' : 'text-danger'}`}>{status.msg}</p>
      )}
    </div>
  )
}
