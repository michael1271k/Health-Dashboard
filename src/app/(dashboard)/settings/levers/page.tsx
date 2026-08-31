'use client'

import { useRouter } from 'next/navigation'
import { Gauge } from 'lucide-react'
import { m, AnimatePresence } from 'framer-motion'
import { BackLink } from '@/components/nav/NavChevron'
import { Zone, ZoneRow } from '@/components/ui/Zone'
import { NumberRow } from '@/components/settings/NumberRow'
import { ToggleRow } from '@/components/settings/SettingsRows'
import { EMBER, GOLD, SAND, STEEL } from '@/lib/theme/palette'
import { CROSSFADE, useHelixReducedMotion } from '@/lib/motion'
import { useSettingsGoals } from '@/lib/hooks/useSettingsGoals'
import {
  DEFICIT_LEVERS, atwaterKcal, leverById, type LeverId,
} from '@/lib/nutrition/levers'
import { maintenanceSpanFor } from '@/lib/nutrition/maintenance'
import { logicalTodayISO } from '@/lib/utils/day'
import { useTargetProfiles, useSaveTargetProfile } from '@/lib/hooks/useTargetProfiles'
import type { TargetProfile } from '@/lib/nutrition/profiles'

/**
 * Every lever, and the five numbers they replace, on one page.
 *
 * ── THIS WAS THREE PAGES, AND THE SPLIT WAS THE PROBLEM ──────────────────────
 * `/settings/targets` held the numbers, `/settings/lever` held the deficit
 * rungs, `/settings/maintenance` held the release rung, and the Settings hub
 * held the toggle that switched between them — which then SPROUTED a fourth row
 * linking to the third page whenever it was on.
 *
 * Splitting them was right when the alternative was one 485-line drawer, and
 * wrong as soon as you tried to answer the only question the screen exists for:
 * WHAT AM I EATING TODAY, AND WHY. That answer was assembled from three routes
 * and a conditional, and two of them showed numbers that the third was
 * overriding without saying so.
 *
 * One page: pick the instruction at the top, read the resulting numbers at the
 * bottom, and they are the same numbers in both states.
 *
 * ── "CACHED" IS NOT A THING THIS PAGE HAS TO DO ──────────────────────────────
 * Switching a rung on does not overwrite your figures. `savePlanNumbers` writes
 * `user_goals.calorie_goal` and friends; `setMaintenance` writes ONLY
 * `active_lever` and `maintenance_until`. The rung is a read-time layer —
 * `leverForDate` → `applyLever` — so your own numbers sit untouched underneath
 * it and reappear the moment it comes off. There is no cache to keep, which is
 * exactly why the held state can be honest about what it is: a rung on top,
 * not an edit.
 */
export default function LeversPage() {
  const router = useRouter()
  const reduced = useHelixReducedMotion()
  const {
    goals, loading, saving, status, save, savePlanNumbers,
    activeLever, leverInForce, maintenanceOn, maintenanceUntil, setMaintenance,
  } = useSettingsGoals()

  if (loading) return <p className="text-muted text-sm">Loading…</p>

  const selected = activeLever ?? leverInForce
  const heldBy = leverById(leverInForce)
  /** The figures actually in force — the rung's when one holds, else your own. */
  const shown = heldBy
    ? {
        calorie: heldBy.calorieGoal, protein: heldBy.proteinGoalG,
        carbs: heldBy.carbsGoalG, fat: heldBy.fatGoalG, steps: heldBy.stepsGoal,
      }
    : {
        calorie: goals.calorie_goal, protein: goals.protein_goal_g,
        carbs: goals.carbs_goal_g, fat: goals.fat_goal_g, steps: goals.steps_goal,
      }

  /** Select a rung — or `custom`, which writes your current figures back as-is. */
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

  /** Write the five lever-governed numbers, and select `custom` by doing so. */
  const commitPlan = (patch: Partial<typeof goals>) => {
    const next = { ...goals, ...patch }
    void savePlanNumbers(
      {
        calorie_goal: next.calorie_goal, protein_goal_g: next.protein_goal_g,
        carbs_goal_g: next.carbs_goal_g, fat_goal_g: next.fat_goal_g,
        steps_goal: next.steps_goal,
      },
      {
        sleep_goal_hours: next.sleep_goal_hours,
        active_cal_goal: next.active_cal_goal,
        water_goal_ml: next.water_goal_ml,
      },
      // Typing your own numbers IS a selection — `custom` names it. Leaving the
      // rung selected while the figures no longer match it would make the app
      // claim a target it is not grading against.
      'custom',
      // No fourth argument: this page has no opinion about where the phase is
      // steering, and passing nulls to say so would CLEAR the body targets.
    )
  }

  /**
   * The Saturday of the week the switch is being flipped ON during.
   *
   * A release rung MUST have an end — `LEVER_SCHEDULE` says so and admits that
   * "forgetting is the default outcome". `PHASES` no longer carries a
   * maintenance row to read one off, so this is the week's own last day.
   */
  const defaultEnd = () => {
    const today = logicalTodayISO()
    const span = maintenanceSpanFor(today)
    if (span) return span.end
    const d = new Date(`${today}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + (6 - d.getUTCDay()))
    return d.toISOString().slice(0, 10)
  }

  const atwater = atwaterKcal(shown.protein ?? 0, shown.carbs ?? 0, shown.fat ?? 0)
  const gap = (shown.calorie ?? 0) - atwater

  return (
    <div data-boxed className="space-y-4">
      <header className="flex items-center gap-3">
        <BackLink onClick={() => router.back()} />
        <div className="min-w-0">
          <h1 className="font-heading text-fluid-lg font-bold text-text flex items-center gap-2">
            <Gauge className="w-4 h-4" style={{ color: GOLD }} aria-hidden="true" /> Levers
          </h1>
          <p className="text-fluid-xs text-muted">What you are eating, and what decided it</p>
        </div>
      </header>

      <Zone label="Rungs" accent={GOLD}>
        {DEFICIT_LEVERS.map((l) => (
          <RungRow
            key={l.id} on={selected === l.id} accent={GOLD} onPick={() => pick(l.id)}
            label={l.label} hint={l.summary}
            figures={`${l.proteinGoalG}/${l.carbsGoalG}/${l.fatGoalG} · ${(l.stepsGoal / 1000).toFixed(0)}k`}
            kcal={l.calorieGoal}
          />
        ))}
        <RungRow
          on={selected === 'custom'} accent={GOLD} onPick={() => pick('custom')}
          label="My own numbers"
          hint="Typed below. A real selection, not an absence."
        />
      </Zone>

      {/* ── THE RELEASE, BESIDE THE LADDER AND NOT ON IT ──────────────────────
          A maintenance week is the opposite move to a rung — planned, bounded,
          taken on purpose inside the cut — so it gets its own zone and its own
          colour rather than a fifth radio button in a list of tightenings. The
          end date lives here too: it is the half of the decision that used to
          be on a separate page, and a release with no end is not a week. */}
      <Zone label="Release" accent={SAND}>
        <ToggleRow
          label="Maintenance week"
          hint={maintenanceOn
            ? 'Full food, lighter steps. Still cutting.'
            : 'A planned week at maintenance, without leaving the cut.'}
          on={maintenanceOn}
          onToggle={() => void setMaintenance(!maintenanceOn, maintenanceOn ? null : defaultEnd())}
        />
        <ZoneRow className="flex items-center gap-3 min-h-[52px]">
          <span className="min-w-0 flex-1">
            <span className="block text-fluid-sm text-text">Ends</span>
            <span className="block text-[10px] text-muted leading-snug">
              After this date the cut resumes on its own.
            </span>
          </span>
          <input
            type="date"
            value={maintenanceUntil ?? ''}
            disabled={!maintenanceOn}
            onChange={(e) => void setMaintenance(true, e.target.value || null)}
            className="helix-num rounded-lg bg-surface-2 border border-border px-2.5 py-1.5 field-compact text-text disabled:opacity-40"
          />
        </ZoneRow>
      </Zone>

      {/* ── ONE INPUT BLOCK, TWO STATES ──────────────────────────────────────
          The five numbers a rung replaces WHOLESALE. When one is in force they
          are its figures, read-only: a rung is defined in `levers.ts` and
          asserted Atwater-exact by `levers.test.ts`, and an editable copy here
          would be a second source for the same numbers whose first act would be
          to drift. Editing one while a rung holds is not a correction, it is a
          different decision — so the way back is the `My own numbers` rung
          above, which says so. */}
      <AnimatePresence initial={false} mode="wait">
        <m.div
          key={heldBy ? 'held' : 'own'}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced ? undefined : { opacity: 0 }}
          transition={CROSSFADE}
          className="space-y-4"
        >
          {heldBy && (
            <div
              className="rounded-xl px-3 py-2.5 text-[11px] leading-snug"
              style={{ background: `${SAND}14`, border: `1px solid ${SAND}3d`, color: 'var(--color-text)' }}
              role="status"
            >
              <span className="font-bold" style={{ color: SAND }}>{heldBy.label}</span>
              {' is holding your targets. '}
              <span className="text-muted">
                {heldBy.kind === 'release' && maintenanceUntil
                  ? `Your own numbers resume ${longDate(maintenanceUntil)}.`
                  : 'Your own numbers are untouched underneath and return when it comes off.'}
              </span>
            </div>
          )}

          <Zone label={heldBy ? 'Targets · held' : 'Targets'} accent={heldBy ? SAND : EMBER}>
            {heldBy ? (
              <>
                <HeldRow label="Calories" value={`${heldBy.calorieGoal.toLocaleString()} kcal`} />
                <HeldRow label="Protein" value={`${heldBy.proteinGoalG} g`} />
                <HeldRow label="Carbohydrate" value={`${heldBy.carbsGoalG} g`} />
                <HeldRow label="Fat" value={`${heldBy.fatGoalG} g`} />
                <HeldRow label="Steps" value={heldBy.stepsGoal.toLocaleString()} />
              </>
            ) : (
              <>
                <NumberRow label="Calories" unit="kcal" step={5} value={goals.calorie_goal}
                  onCommit={(v) => v != null && commitPlan({ calorie_goal: v })} />
                <NumberRow label="Protein" unit="g" value={goals.protein_goal_g}
                  onCommit={(v) => v != null && commitPlan({ protein_goal_g: v })} />
                <NumberRow label="Carbohydrate" unit="g" value={goals.carbs_goal_g}
                  onCommit={(v) => v != null && commitPlan({ carbs_goal_g: v })} />
                <NumberRow label="Fat" unit="g" value={goals.fat_goal_g}
                  onCommit={(v) => v != null && commitPlan({ fat_goal_g: v })} />
                <NumberRow label="Steps" unit="steps" step={500} value={goals.steps_goal}
                  onCommit={(v) => v != null && commitPlan({ steps_goal: v })} />
              </>
            )}
          </Zone>
        </m.div>
      </AnimatePresence>

      {/* The one piece of arithmetic worth stating out loud. `levers.ts` has been
          burned twice by a calorie literal sitting beside macros that summed to
          something else — 1950 vs 1955, and 2450 vs 2445.

          Only while the figures are YOURS: a rung's triple is asserted exact by
          `levers.test.ts`, so a mismatch warning over numbers you cannot edit
          would be a bug report addressed to nobody. */}
      {!heldBy && Math.abs(gap) >= 5 && (
        <p className="px-1 text-[11px] text-muted leading-snug">
          Those macros are{' '}
          <span className="helix-num text-text">{atwater.toLocaleString()} kcal</span>{' '}
          by Atwater (4/4/9) — {gap > 0 ? `${gap} more` : `${Math.abs(gap)} fewer`} than the
          calorie figure above.
        </p>
      )}

      {/* ── DAY SHAPES ───────────────────────────────────────────────────────
          Below the rungs and deliberately not among them. A rung is a decision
          about a WEEK — ordered, in force from a date, recorded when pulled. A
          profile is a shape a single day can take, neither harder nor easier
          than the other, and two of them happen inside the same week under the
          same rung. See `profiles.ts`.

          They are also not gated on the phase: a restaurant day is a restaurant
          day in a cut, in a bulk and at maintenance alike. */}
      <ProfilesZone />

      {/* Everything no lever governs. It stays editable in both states, because
          a rung has never had an opinion about how much you sleep. */}
      <Zone label="Recovery & activity" accent={STEEL}>
        <NumberRow label="Active energy" unit="kcal" step={50} value={goals.active_cal_goal}
          onCommit={(v) => v != null && save({ active_cal_goal: v })} />
        <NumberRow label="Sleep" unit="h" step={0.25} value={goals.sleep_goal_hours}
          onCommit={(v) => v != null && save({ sleep_goal_hours: v })} />
        <NumberRow label="Water" unit="ml" step={100} value={goals.water_goal_ml}
          onCommit={(v) => v != null && save({ water_goal_ml: v })} />
      </Zone>

      <p className="px-1 text-[11px] text-muted leading-snug">
        A rung applies from today forward and never re-marks a finished day — those
        were eaten against whatever was in force at the time. To eat something
        different on ONE day, tap that day&apos;s calorie figure on the Day screen:
        a per-day target sits above every rung and is the only thing that can speak
        for a single date.
      </p>

      {status && (
        <p className={`text-sm px-1 ${status.type === 'success' ? 'text-success' : 'text-danger'}`}>{status.msg}</p>
      )}
      {saving && <p className="text-xs text-muted px-1">Saving…</p>}
    </div>
  )
}

/** One selectable instruction: radio, name, one line of why, and its figures. */
function RungRow({ on, accent, onPick, label, hint, figures, kcal }: {
  on: boolean
  accent: string
  onPick: () => void
  label: string
  hint: string
  figures?: string
  kcal?: number
}) {
  return (
    <ZoneRow asButton onClick={onPick} className="flex items-center gap-3 min-h-[56px]">
      <span
        className="h-4 w-4 rounded-full border-2 shrink-0"
        style={{ borderColor: on ? accent : 'rgba(255,255,255,0.22)', background: on ? accent : 'transparent' }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-fluid-sm font-medium text-text">{label}</span>
        <span className="block text-[10px] text-muted leading-snug">{hint}</span>
      </span>
      {kcal != null && (
        <span className="helix-num text-[10px] text-muted text-right shrink-0 tabular-nums">
          <span className="block text-text">{kcal.toLocaleString()} kcal</span>
          {figures}
        </span>
      )}
    </ZoneRow>
  )
}

/**
 * A target the rung is stating rather than one you are setting.
 *
 * Deliberately NOT a disabled `NumberRow`: a greyed-out input still reads as a
 * field you have failed to reach, and the tap that finds it does nothing. This
 * is a value, and it looks like one.
 */
function HeldRow({ label, value }: { label: string; value: string }) {
  return (
    <ZoneRow className="flex items-center gap-3 min-h-[44px]">
      <span className="flex-1 text-fluid-sm text-text">{label}</span>
      <span className="helix-num text-fluid-sm tabular-nums" style={{ color: SAND }}>{value}</span>
    </ZoneRow>
  )
}

/** "Sat 5 Sep" — the end date read as a day you can picture, not an ISO string. */
function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * The named day shapes, editable.
 *
 * ── EDITING ONE DOES NOT REACH BACKWARDS ─────────────────────────────────────
 * Applying a profile to a day SNAPSHOTS its figures into that day's row, so a
 * change here governs the days you tag from now on and leaves every day already
 * eaten exactly as it was asked. That is the same invariant `leverForDate`
 * protects one layer down, and it is the reason `daily_targets.profile_key` is a
 * stamp rather than a foreign key.
 *
 * ── AND AN EMPTY MACRO FIELD IS A REAL SETTING HERE ──────────────────────────
 * Clearing Carbohydrate on "Restaurant" is not "no opinion, ask the rung" — at
 * this layer it is "this profile does not grade carbohydrate", which is what
 * makes a restaurant day a restaurant day. The row says so rather than leaving
 * a blank box to be read either way.
 */
function ProfilesZone() {
  const { data: profiles } = useTargetProfiles()
  const saveProfile = useSaveTargetProfile()
  const patch = (p: TargetProfile, next: Partial<TargetProfile>) =>
    saveProfile.mutate({ ...p, ...next })

  return (
    <Zone label="Day shapes" accent={SAND}>
      {(profiles ?? []).map((p) => (
        <div key={p.key} className="py-1">
          <ZoneRow className="flex items-baseline gap-2 min-h-[36px]">
            <span className="text-fluid-sm font-semibold text-text shrink-0">{p.label}</span>
            <span className="text-[11px] text-muted truncate min-w-0">{p.summary}</span>
          </ZoneRow>
          <NumberRow label="Calories" unit="kcal" step={5} value={p.kcal}
            onCommit={(v) => v != null && patch(p, { kcal: v })} />
          <NumberRow label="Protein" unit="g" value={p.proteinG}
            onCommit={(v) => v != null && patch(p, { proteinG: v })} />
          {/* `null` is a legitimate commit for these two — it is how a macro is
              turned OFF for this shape, and the placeholder says so. */}
          <NumberRow label="Fat" unit="g" value={p.fatG}
            onCommit={(v) => patch(p, { fatG: v })} />
          <NumberRow label="Carbohydrate" unit="g" value={p.carbsG}
            onCommit={(v) => patch(p, { carbsG: v })} />
          {(p.carbsG == null || p.fatG == null) && (
            <p className="px-1 pb-1 text-[10px] text-muted leading-snug">
              {[p.fatG == null && 'Fat', p.carbsG == null && 'Carbohydrate'].filter(Boolean).join(' and ')}
              {' '}left empty, so a day given this shape is not graded on
              {p.carbsG == null && p.fatG == null ? ' either' : ' it'} — it counts as
              neither a hit nor a miss, and stays out of the week&apos;s balance.
            </p>
          )}
        </div>
      ))}
      <p className="px-1 py-1 text-[11px] text-muted leading-snug">
        Changing a figure here applies to days you tag from now on. Days already
        tagged keep the numbers they were given, because that is what they were
        eaten against.
      </p>
    </Zone>
  )
}
