'use client'

import { useState } from 'react'
import { Pencil, RotateCcw } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { NumberRow } from '@/components/settings/NumberRow'
import { EMBER, SAND } from '@/lib/theme/palette'
import { useDailyTarget, useSaveDailyTarget, useClearDailyTarget } from '@/lib/hooks/useDailyTargets'
import type { ActiveNutritionGoals } from '@/lib/hooks/useNutritionGoals'

/**
 * Today's target, and the one place it can be changed for today only.
 *
 * ── WHY A DAY NEEDED ITS OWN LAYER ───────────────────────────────────────────
 * Every target in this app was global (`user_goals`), phase-wide
 * (`plan_phase_goals`) or rung-wide (`LEVERS`). There was no way to say "Tuesday
 * is a restaurant day, 2,400" without retyping the numbers, grading every other
 * day against them, and then remembering to put them back — which is the failure
 * mode `LEVER_SCHEDULE`'s own comment names about a rung that is never released.
 *
 * A maintenance week is where it matters most: releasing the deficit is
 * precisely the decision that individual days differ.
 *
 * The override is PARTIAL by design. Raise the calories and leave protein where
 * the rung put it; a blank field means "no opinion", not zero.
 */
export function DayTargetCard({ date, goals }: {
  date: string
  /** The resolved targets, override already applied — see `useNutritionGoals`. */
  goals: ActiveNutritionGoals
}) {
  const [open, setOpen] = useState(false)
  const { data: target } = useDailyTarget(date)
  const saveTarget = useSaveDailyTarget()
  const clearTarget = useClearDailyTarget()

  const commit = (patch: Partial<{ kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }>) => {
    saveTarget.mutate({
      date,
      kcal: target?.kcal ?? null,
      protein_g: target?.protein_g ?? null,
      carbs_g: target?.carbs_g ?? null,
      fat_g: target?.fat_g ?? null,
      steps_goal: target?.steps_goal ?? null,
      ...patch,
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 min-h-[52px] text-left active:opacity-80"
        style={{
          borderColor: goals.dayOverride ? `${SAND}55` : 'rgba(255,255,255,0.07)',
          background: goals.dayOverride ? `${SAND}0f` : 'rgba(255,255,255,0.02)',
        }}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted">Today&apos;s target</span>
            {goals.dayOverride && (
              <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: SAND }}>
                set for today
              </span>
            )}
          </span>
          <span className="helix-num block text-fluid-sm font-bold text-text tabular-nums">
            {goals.calorie > 0 ? `${goals.calorie.toLocaleString()} kcal` : '—'}
          </span>
          <span className="helix-num block text-[10px] text-muted tabular-nums">
            {goals.protein ?? '—'}P · {goals.fat ?? '—'}F · {goals.carbs ?? '—'}C
          </span>
        </span>
        <Pencil className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Target for today" accent={EMBER} layer="stacked">
        <div className="space-y-1">
          <NumberRow label="Calories" unit="kcal" step={5}
            value={target?.kcal ?? goals.calorie}
            onCommit={(v) => commit({ kcal: v })} />
          <NumberRow label="Protein" unit="g"
            value={target?.protein_g ?? goals.protein}
            onCommit={(v) => commit({ protein_g: v })} />
          <NumberRow label="Fat" unit="g"
            value={target?.fat_g ?? goals.fat}
            onCommit={(v) => commit({ fat_g: v })} />
          <NumberRow label="Carbohydrate" unit="g"
            value={target?.carbs_g ?? goals.carbs}
            onCommit={(v) => commit({ carbs_g: v })} />
        </div>

        <p className="mt-3 px-1 text-[11px] text-muted leading-snug">
          This applies to {date} only. Everything you leave alone keeps whatever the
          rung in force asks for.
        </p>

        {goals.dayOverride && (
          <button
            type="button"
            onClick={() => { clearTarget.mutate(date); setOpen(false) }}
            className="btn-glass mt-3 min-h-[44px] w-full justify-center text-fluid-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reset to the plan&apos;s numbers
          </button>
        )}
      </Sheet>
    </>
  )
}
