'use client'

import { useState } from 'react'
import { Pencil, RotateCcw } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { NumberRow } from '@/components/settings/NumberRow'
import { EMBER, SAND, STEEL, MUTED } from '@/lib/theme/palette'
import { tapLight } from '@/lib/native/haptics'
import { useDailyTarget, useSaveDailyTarget, useClearDailyTarget } from '@/lib/hooks/useDailyTargets'
import { useTargetProfiles, useApplyProfile } from '@/lib/hooks/useTargetProfiles'
import { matchesProfile, type TargetProfile } from '@/lib/nutrition/profiles'
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
 *
 * ── AND WHY THERE IS A ROW OF NAMES ABOVE THE NUMBERS ────────────────────────
 * Typing four figures is the right control for a day that is unlike any other.
 * It is the wrong one for the two days that recur every week: a home day and a
 * restaurant day are the same two shapes over and over, and retyping 2,400 / 170
 * every time you eat out is how a per-day layer stops being used.
 *
 * So the sheet opens on a row of profile chips — one tap, day done — and the
 * number rows stay underneath for the day that is genuinely its own. Picking a
 * profile SNAPSHOTS its figures rather than pointing at it; editing "Restaurant"
 * next month must not re-grade every restaurant day you have ever eaten. See
 * `profiles.ts`.
 *
 * The highlighted chip comes from `matchesProfile`, not from the day's stamp: a
 * restaurant day nudged from 2,400 to 2,650 is still stamped "restaurant" and is
 * no longer 2,400, and a chip claiming otherwise would be showing a selection
 * that is not true. It dims instead — the stamp survives, the claim does not.
 */
export function DayTargetCard({ date, goals }: {
  date: string
  /** The resolved targets, override already applied — see `useNutritionGoals`. */
  goals: ActiveNutritionGoals
}) {
  const [open, setOpen] = useState(false)
  const { data: target } = useDailyTarget(date)
  const { data: profiles } = useTargetProfiles()
  const saveTarget = useSaveDailyTarget()
  const clearTarget = useClearDailyTarget()
  const applyProfile = useApplyProfile()

  const active = (profiles ?? []).find((p) => matchesProfile(target, p)) ?? null
  const stamped = goals.profileKey
  // Stamped but no longer matching: the day was hand-edited after the profile
  // was applied. The name is still true about the decision; the numbers are not.
  const stampedLabel = stamped && !active
    ? (profiles ?? []).find((p) => p.key === stamped)?.label ?? null
    : null

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
            {/* The profile's NAME where the generic badge used to be: "Restaurant"
                says everything "set for today" said and also says which shape. */}
            {(active || stampedLabel || goals.dayOverride) && (
              <span className="text-[9px] font-bold uppercase tracking-wide truncate" style={{ color: SAND }}>
                {active?.label ?? (stampedLabel ? `${stampedLabel} · edited` : 'set for today')}
              </span>
            )}
          </span>
          <span className="helix-num block text-fluid-sm font-bold text-text tabular-nums">
            {goals.calorie > 0 ? `${goals.calorie.toLocaleString()} kcal` : '—'}
          </span>
          {/* ── AN UNTRACKED MACRO IS NOT A MISSING ONE ─────────────────────
              An em-dash here would read as "we do not know your fat target",
              which is the opposite of what a restaurant day means: there IS no
              fat target, deliberately, and nothing is being graded against it.
              "off" says that in three characters. */}
          <span className="helix-num block text-[10px] text-muted tabular-nums">
            {goals.protein ?? '—'}P
            {' · '}
            <span style={{ color: goals.trackFat ? undefined : MUTED, opacity: goals.trackFat ? 1 : 0.65 }}>
              {goals.trackFat ? `${goals.fat ?? '—'}F` : 'F off'}
            </span>
            {' · '}
            <span style={{ color: goals.trackCarbs ? undefined : MUTED, opacity: goals.trackCarbs ? 1 : 0.65 }}>
              {goals.trackCarbs ? `${goals.carbs ?? '—'}C` : 'C off'}
            </span>
          </span>
        </span>
        <Pencil className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Target for today" accent={EMBER} layer="stacked">
        {/* ── THE TWO DAYS THAT RECUR, BEFORE THE ONE THAT DOES NOT ─────────── */}
        <div className="mb-3">
          <span className="block px-1 mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            Day shape
          </span>
          <div role="radiogroup" aria-label="Day shape"
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${(profiles?.length ?? 0) + 1}, minmax(0, 1fr))` }}>
            {(profiles ?? []).map((p) => (
              <ProfileChip key={p.key} profile={p} on={active?.key === p.key}
                onPick={() => {
                  void tapLight()
                  // Tapping the live profile again CLEARS the day rather than
                  // re-writing it — the same "tap the chosen one to undo it"
                  // rule the fatigue and DOMS scales use, so no chip is a trap.
                  applyProfile.mutate({ date, profile: active?.key === p.key ? null : p })
                }} />
            ))}
            {/* Not a profile — the absence of one. It is highlighted exactly when
                the day carries figures that match no profile, which is what
                "Custom" honestly means. */}
            <button
              type="button" role="radio" aria-checked={goals.dayOverride && !active}
              onClick={() => { void tapLight(); if (goals.dayOverride) clearTarget.mutate(date) }}
              className="min-h-[52px] rounded-xl px-1.5 flex flex-col items-center justify-center gap-0.5
                         active:scale-95 transition-transform"
              style={{
                background: goals.dayOverride && !active ? `${STEEL}22` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${goals.dayOverride && !active ? `${STEEL}8c` : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <span className="text-[11px] font-bold leading-none"
                style={{ color: goals.dayOverride && !active ? STEEL : undefined }}>
                {goals.dayOverride && !active ? 'Custom' : 'Plan'}
              </span>
              <span className="text-[8px] text-muted leading-none">
                {goals.dayOverride && !active ? 'tap to reset' : 'the rung'}
              </span>
            </button>
          </div>
          {active && (
            <p className="mt-1.5 px-1 text-[10px] text-muted leading-snug">{active.summary}</p>
          )}
        </div>

        <span className="block px-1 mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
          Figures
        </span>
        <div className="space-y-1">
          <NumberRow label="Calories" unit="kcal" step={5}
            value={target?.kcal ?? goals.calorie}
            onCommit={(v) => commit({ kcal: v })} />
          <NumberRow label="Protein" unit="g"
            value={target?.protein_g ?? goals.protein}
            onCommit={(v) => commit({ protein_g: v })} />
          {/* ── AN UNTRACKED MACRO HIDES ITS FIELD ───────────────────────────
              A number box under "Fat" on a restaurant day invites you to fill it
              in, and filling it in is precisely the thing the profile exists to
              stop you doing at a table. Typing one is still possible — pick
              Custom, or Home — but it can no longer happen by reflex. */}
          {goals.trackFat ? (
            <NumberRow label="Fat" unit="g"
              value={target?.fat_g ?? goals.fat}
              onCommit={(v) => commit({ fat_g: v })} />
          ) : <UntrackedRow label="Fat" />}
          {goals.trackCarbs ? (
            <NumberRow label="Carbohydrate" unit="g"
              value={target?.carbs_g ?? goals.carbs}
              onCommit={(v) => commit({ carbs_g: v })} />
          ) : <UntrackedRow label="Carbohydrate" />}
        </div>

        <p className="mt-3 px-1 text-[11px] text-muted leading-snug">
          This applies to {date} only. Everything you leave alone keeps whatever the
          rung in force asks for, and a macro that is off is not graded at all —
          it does not count as a miss and it does not enter the week&apos;s balance.
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

/**
 * One profile, as a chip.
 *
 * Two lines: the name, and its calorie figure — because "Restaurant" and
 * "Restaurant, 2,400" are different amounts of help at the moment you are
 * deciding, and the second costs one row of 8px type.
 */
function ProfileChip({ profile, on, onPick }: {
  profile: TargetProfile
  on: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button" role="radio" aria-checked={on}
      aria-label={`${profile.label} — ${profile.summary}`}
      title={profile.summary}
      onClick={onPick}
      className="min-h-[52px] rounded-xl px-1.5 flex flex-col items-center justify-center gap-0.5
                 active:scale-95 transition-transform"
      style={{
        background: on ? `${SAND}24` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${on ? `${SAND}8c` : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <span className="text-[11px] font-bold leading-none truncate max-w-full"
        style={{ color: on ? SAND : undefined }}>
        {profile.label}
      </span>
      <span className="helix-num text-[8px] text-muted leading-none tabular-nums">
        {profile.kcal.toLocaleString()}
      </span>
    </button>
  )
}

/**
 * The row that stands where a number field would, for a macro that is off.
 *
 * It keeps the list's rhythm — four rows, always, so the sheet does not resize
 * when a profile changes — and says the one thing the missing box has to say.
 */
function UntrackedRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 min-h-[52px] px-3 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <span className="text-fluid-sm text-muted flex-1 min-w-0">{label}</span>
      <span className="text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>
        not tracked today
      </span>
    </div>
  )
}
