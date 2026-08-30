'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Dumbbell } from 'lucide-react'
import { BackLink } from '@/components/nav/NavChevron'
import { Sheet } from '@/components/ui/Sheet'
import { Zone } from '@/components/ui/Zone'
import { RoutineList } from '@/components/settings/RoutineList'
import { EMBER, STEEL } from '@/lib/theme/palette'
import { phaseBadgeStyle } from '@/lib/phases'
import { PROGRAMS, type Program } from '@/lib/programs'
import type { NutritionMode } from '@/lib/types/workout'
import { useSettingsGoals } from '@/lib/hooks/useSettingsGoals'

/** Live plans first, legacy (PPL) last — the order of the plan cards. */
function planList(): Program[] {
  return Object.values(PROGRAMS).sort((a, b) => Number(a.legacy ?? false) - Number(b.legacy ?? false))
}

/** Nutrition mode → the timeline phase kind, so the picker reuses the glow palette. */
const MODE_TO_PHASE = { cut: 'cut', bulk: 'bulk' } as const

/**
 * Which plan you run, in which direction, and what that actually means each day.
 *
 * ── A PAGE, AND THE ROUTINES ARE ON IT ───────────────────────────────────────
 * The picker was a Sheet on the Settings hub and the routine preview was a
 * SECOND sheet, opened from a row at the very bottom of the page under
 * "Training" — two taps and a scroll away from the decision it describes. So
 * the screen that asks "which programme?" never showed the programme, and the
 * screen that showed it had already forgotten what you were choosing between.
 *
 * They are one page now, in the order the question is asked: pick a plan, pick
 * a direction, read what you would be doing. The routine list is bound to the
 * PREVIEW, not to what is active — the whole value of putting it here is seeing
 * the answer before committing to it.
 *
 * ── AND THE PHASE CONTROL HAS TWO BUTTONS ────────────────────────────────────
 * It had three. `maintenance` was never a training decision: `forPhase` only
 * branches on `cut`, so selecting it changed no exercise and no set count — it
 * moved the calorie target, which is the LEVER's job and lives on
 * `/settings/levers`. See the note on `ProgramPhase`.
 */
export default function PlanPage() {
  const router = useRouter()
  const { loading, saving, status, activePlanId, livePhase, applyPlanPhase } = useSettingsGoals()

  const [previewId, setPreviewId] = useState<string | null>(null)
  const [drawerPhase, setDrawerPhase] = useState<NutritionMode | null>(null)
  const [confirmSwitch, setConfirmSwitch] = useState(false)

  if (loading) return <p className="text-muted text-sm">Loading…</p>

  // Default the preview to whatever is running, but let a selection override it.
  const previewPlan = PROGRAMS[previewId ?? activePlanId] ?? planList()[0]
  const phase = drawerPhase ?? livePhase
  const isActive = previewPlan.id === activePlanId && phase === livePhase

  return (
    <div data-boxed className="space-y-4 pb-6">
      <header className="flex items-center gap-3">
        <BackLink onClick={() => router.back()} />
        <div className="min-w-0">
          <h1 className="font-heading text-fluid-lg font-bold text-text flex items-center gap-2">
            <Dumbbell className="w-4 h-4" style={{ color: STEEL }} aria-hidden="true" /> Training plan
          </h1>
          <p className="text-fluid-xs text-muted">The split you run, and the direction you run it in</p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {planList().map((plan) => {
          const on = previewPlan.id === plan.id
          const active = plan.id === activePlanId
          return (
            <button
              key={plan.id}
              onClick={() => { setConfirmSwitch(false); setDrawerPhase(active ? livePhase : 'cut'); setPreviewId(plan.id) }}
              aria-pressed={on}
              className="rounded-2xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-200"
              style={on
                ? { borderColor: `${STEEL}66`, background: `${STEEL}14`, boxShadow: `0 0 16px ${STEEL}33` }
                : { borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <div className="flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5 shrink-0" style={{ color: on ? STEEL : '#79808C' }} aria-hidden="true" />
                <span className="font-heading font-bold text-sm text-text">{plan.label}</span>
                {plan.legacy && <span className="text-[9px] uppercase tracking-wide text-muted ml-auto">legacy</span>}
                {active && !plan.legacy && <span className="text-[9px] uppercase tracking-wide ml-auto" style={{ color: STEEL }}>active</span>}
              </div>
              <p className="text-[10px] text-muted mt-1 leading-snug line-clamp-2">{plan.blurb ?? `${plan.days.length}-day split`}</p>
            </button>
          )
        })}
      </div>

      {/* ── Phase — nested INSIDE the plan, because a phase is not a global
             mood: it is the set of numbers a specific plan runs on. ── */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Phase</div>
        <div className="flex rounded-xl border border-white/[0.08] overflow-hidden">
          {(['cut', 'bulk'] as NutritionMode[]).map((m) => {
            const on = phase === m
            return (
              <button
                key={m} onClick={() => setDrawerPhase(m)} aria-pressed={on}
                className="flex-1 py-2 text-fluid-xs font-semibold capitalize min-h-[44px]"
                style={on ? phaseBadgeStyle(MODE_TO_PHASE[m], true) : { color: 'var(--color-muted)' }}
              >
                {m}
                {previewPlan.id === activePlanId && livePhase === m && (
                  <span className="block text-[8px] uppercase tracking-wide opacity-70">active</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-[11px] text-muted leading-snug px-1">
        Switching rewrites calories, macros, step goal, body targets and weekly set volume to this
        phase&apos;s numbers. Edit them afterwards under Levers, which is the only place they are edited.
        A week at maintenance is not a phase — it is a lever, and it leaves this deck alone.
      </p>

      <div className="pt-1 border-t border-white/[0.06]">
        {isActive ? (
          <p className="text-fluid-xs text-muted text-center py-2">
            {previewPlan.label} · {phase} is active.
          </p>
        ) : (
          <button
            onClick={() => setConfirmSwitch(true)} disabled={saving}
            className="btn-primary w-full justify-center min-h-[46px] disabled:opacity-60"
            style={{ background: STEEL, boxShadow: `0 0 16px ${STEEL}44` }}
          >
            Make {previewPlan.label} · {phase} active
          </button>
        )}
      </div>

      {/* ── WHAT YOU ACTUALLY DO ─────────────────────────────────────────────
             Bound to the PREVIEW. `isActive` is what lets `RoutineList` prefer a
             stored template over the authored program — true only when the
             preview IS what is running, or "As last performed" would claim a
             session history for a plan you are merely looking at. */}
      <Zone label="What you do each day" accent={EMBER}>
        <div className="px-3 pb-3 pt-1">
          <RoutineList planId={previewPlan.id} phase={phase} isActive={isActive} />
        </div>
      </Zone>

      {status && (
        <p className={`text-sm px-1 ${status.type === 'success' ? 'text-success' : 'text-danger'}`}>{status.msg}</p>
      )}
      {saving && <p className="text-xs text-muted px-1">Saving…</p>}

      {/* The only destructive action in the app. A confirmation rising from the
          bottom edge over the thing it is about is the platform idiom for
          exactly this, and it cannot be reached without the prose arriving with
          it. */}
      <Sheet open={confirmSwitch} onClose={() => setConfirmSwitch(false)} title="Switch plan?" accent={EMBER}>
        <div className="space-y-4 pb-2">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: EMBER }} aria-hidden="true" />
            <p className="text-sm text-muted leading-relaxed">
              Run <span className="text-text font-semibold">{previewPlan.label}</span> on its{' '}
              <span className="text-text font-semibold">{phase}</span> phase? Calories, macros, step goal,
              body targets and weekly set volume all move to this phase&apos;s numbers, the training schedule
              changes, and analytics re-anchor from today. Your logged history is preserved.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmSwitch(false)} className="btn-glass min-h-[44px] px-4">Cancel</button>
            <button
              onClick={async () => {
                const id = previewPlan.id, m = phase
                setConfirmSwitch(false)
                await applyPlanPhase(id, m)
              }}
              disabled={saving}
              className="btn-primary min-h-[44px] px-4 disabled:opacity-60"
            >
              Confirm
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
