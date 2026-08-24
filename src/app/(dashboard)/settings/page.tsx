'use client'

import { useState } from 'react'
import { derivePhase, phaseDisplay, PHASE_META } from '@/lib/nutrition/phase'
import { logicalTodayISO } from '@/lib/utils/day'
import type { NutritionMode } from '@/lib/types/workout'
import { phaseBadgeStyle } from '@/lib/phases'
import { Sheet } from '@/components/ui/Sheet'
import { EMBER, STEEL } from '@/lib/theme/palette'
import { PROGRAMS, activeProgram, type Program } from '@/lib/programs'
import { LANDMARK_MUSCLES } from '@/lib/training/landmarks'
import { AlertTriangle, Dumbbell } from 'lucide-react'
import { Zone } from '@/components/ui/Zone'
import { SettingRow, ChoiceRow, ToggleRow } from '@/components/settings/SettingsRows'
import { RoutineList } from '@/components/settings/RoutineList'
import { CrashRecorderRow } from '@/components/settings/CrashRecorderRow'
import { EditPlanCard } from '@/components/settings/EditPlanCard'
import { LEVERS, type LeverId } from '@/lib/nutrition/levers'
import { useSettingsGoals, applyPrefsToDevice } from '@/lib/hooks/useSettingsGoals'

/** Live plans first, legacy (PPL) last — the order of the Settings plan cards. */
function planList(): Program[] {
  return Object.values(PROGRAMS).sort((a, b) => Number(a.legacy ?? false) - Number(b.legacy ?? false))
}

/** Nutrition mode → the timeline phase kind, so the picker reuses the glow palette. */
const MODE_TO_PHASE = { cut: 'cut', maintenance: 'maintenance', bulk: 'bulk' } as const

type SettingsSheet = 'targets' | 'plan' | 'volume' | 'routines' | null

export default function SettingsPage() {
  const {
    goals, loading, saving, status,
    weekStart, trackRpe, activePlanId, livePhase, leverInForce,
    save, saveWeekStart, saveTrackRpe, savePlanNumbers, applyPlanPhase,
    resolvePhaseGoals, resolveVolume, saveVolumeTarget,
  } = useSettingsGoals()

  // ── Presentation state, and only presentation state ──
  // Which drawer is open, which plan it is showing, which phase is being
  // previewed inside it, and whether the switch has been armed. None of it is
  // persisted and none of it means anything once the sheet closes, which is
  // exactly why it did not travel into the hook with the writers.
  const [sheet, setSheet] = useState<SettingsSheet>(null)
  const [previewPlan, setPreviewPlan] = useState<Program | null>(null)
  const [drawerPhase, setDrawerPhase] = useState<NutritionMode>('cut')
  const [confirmSwitch, setConfirmSwitch] = useState(false)
  if (loading) return <p className="text-muted text-sm">Loading…</p>

  const pp = resolvePhaseGoals(activePlanId, livePhase)
  const volTargets = resolveVolume(activePlanId, livePhase)
  const planLabel = PROGRAMS[activePlanId]?.label ?? activePlanId
  const phaseLabel = PHASE_META[livePhase]?.label ?? livePhase

  return (
    /**
     * ── SETTINGS IS A LIST NOW ─────────────────────────────────────────────
     * It was one 1040-line scroll of cards, and the same five numbers —
     * calories, three macros, steps — appeared in THREE of them: staged behind
     * a Save in Targets, committed on blur in the plan drawer, and restated
     * read-only ninety lines below that. Two editors with different write
     * semantics for one number is not untidiness, it is a bug that had already
     * shipped: saving in one place left the other showing a figure the row no
     * longer held.
     *
     * The fix is the platform's own answer to "many settings": groups of rows,
     * each row showing its current value, each detail behind the row that owns
     * it. `Zone` and `ZoneRow` already give the group label, the row padding,
     * the divider and the haptic — there was nothing to invent.
     */
    <div data-boxed className="space-y-4 pb-6">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Settings</h1>
        <p className="text-muted text-sm mt-0.5">Your plan, your targets, and how the app behaves</p>
      </div>

      {/* ── PLAN ── */}
      <Zone label="Plan" accent={STEEL}>
        <SettingRow
          label="Training plan"
          hint="Split, phase and everything the phase dictates"
          value={`${planLabel} · ${phaseLabel}`}
          onOpen={() => { setConfirmSwitch(false); setDrawerPhase(livePhase); setPreviewPlan(PROGRAMS[activePlanId] ?? planList()[0]); setSheet('plan') }}
        />
        <SettingRow
          label="Weekly set volume"
          hint={`${LANDMARK_MUSCLES.length} landmarks · ${livePhase === 'cut' ? 'MEV+' : livePhase === 'bulk' ? 'MAV' : 'MEV+→MAV'}`}
          value={`${LANDMARK_MUSCLES.reduce((n, m) => n + (volTargets[m] ?? 0), 0)} sets`}
          onOpen={() => setSheet('volume')}
        />
      </Zone>

      {/* ── TARGETS · the only editor ── */}
      <Zone label="Targets" accent={EMBER}>
        <SettingRow
          label="Daily targets"
          hint="Calories, macros, steps, sleep, water and where the phase is going"
          value={`${goals.calorie_goal.toLocaleString()} kcal · ${goals.protein_goal_g}P`}
          onOpen={() => setSheet('targets')}
        />
        <SettingRow
          label="Deficit lever"
          hint="Which rung of the cut is in force today"
          value={LEVER_LABEL(leverInForce)}
          onOpen={() => setSheet('targets')}
        />
      </Zone>

      {/* ── UNITS & DISPLAY ── */}
      <Zone label="Units &amp; display" accent={STEEL}>
        <ChoiceRow
          label="Weight units"
          hint="Weight, volume &amp; body composition"
          options={[['kg', 'KG'], ['lb', 'LB']] as const}
          value={goals.unit_system}
          onChange={(u) => { save({ unit_system: u }); applyPrefsToDevice(u, goals.reduce_motion) }}
        />
        <ChoiceRow
          label="Week starts on"
          hint="When weekly volume, charts &amp; the export reset"
          options={[[0, 'Sun'], [1, 'Mon']] as const}
          value={weekStart}
          onChange={(d) => saveWeekStart(d)}
        />
        <ToggleRow
          label="Reduce motion"
          hint="Disable liquid &amp; aurora animations (saves battery)"
          on={goals.reduce_motion}
          onToggle={() => { const v = !goals.reduce_motion; save({ reduce_motion: v }); applyPrefsToDevice(goals.unit_system, v) }}
        />
      </Zone>

      {/* ── TRAINING ── */}
      <Zone label="Training" accent={EMBER}>
        <ToggleRow
          label="Track effort (RPE)"
          hint="Rate each exercise Easy / Hard / Failure when you log a session"
          on={trackRpe}
          onToggle={() => saveTrackRpe(!trackRpe)}
        />
        <SettingRow
          label="Routines"
          hint="What each programmed day actually runs"
          value={`${activeProgram(activePlanId, livePhase).days.length} days`}
          onOpen={() => setSheet('routines')}
        />
      </Zone>

      {/* ── PROTOCOL ── */}
      <Zone label="Protocol" accent={STEEL}>
        <ToggleRow
          label="Auto-log scheduled supplements"
          hint="Mark each supplement taken once its scheduled time passes"
          on={goals.auto_log_supplements}
          onToggle={() => save({ auto_log_supplements: !goals.auto_log_supplements })}
        />
      </Zone>

      {/* Renders nothing at all when there is no crash to report. */}
      <CrashRecorderRow />

      {status && (
        <p className={`text-sm px-1 ${status.type === 'success' ? 'text-success' : 'text-danger'}`}>{status.msg}</p>
      )}
      {saving && <p className="text-xs text-muted px-1">Saving…</p>}

      {/* ── Targets — the ONE editor, in the row that owns it ── */}
      <Sheet open={sheet === 'targets'} onClose={() => setSheet(null)} title="Targets" accent={EMBER}>
        <EditPlanCard
          current={{
            calorie_goal: goals.calorie_goal,
            protein_goal_g: goals.protein_goal_g,
            carbs_goal_g: goals.carbs_goal_g,
            fat_goal_g: goals.fat_goal_g,
            steps_goal: goals.steps_goal,
          }}
          recovery={{
            sleep_goal_hours: goals.sleep_goal_hours,
            active_cal_goal: goals.active_cal_goal,
            water_goal_ml: goals.water_goal_ml,
          }}
          body={{
            target_weight_kg: pp.targetWeightKg ?? null,
            target_body_fat_pct: pp.targetBodyFatPct ?? null,
            target_muscle_mass_kg: pp.targetMuscleMassKg ?? null,
          }}
          activeLever={leverInForce}
          phaseBadge={(() => {
            // Reads the phase OFF the calorie target, so it belongs beside the
            // field that sets it. There used to be a SECOND copy of this exact
            // derivation on the Plans card, labelled "Active:" instead of
            // "Auto:" — the same value, computed twice, shown twice.
            const p = derivePhase(goals.calorie_goal)
            if (!p) return null
            const m = phaseDisplay(p, logicalTodayISO())
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide shrink-0"
                style={{ color: m.color, background: `${m.color}1f`, border: `1px solid ${m.color}55`, boxShadow: `0 0 10px ${m.color}44` }}>
                Auto: {m.label}
              </span>
            )
          })()}
          planLabel={planLabel}
          phaseLabel={phaseLabel}
          saving={saving}
          onSave={savePlanNumbers}
        />
      </Sheet>

      {/* ── Weekly set volume — moved OUT of the plan drawer ──
          It was a `max-h-52 overflow-y-auto` grid nested inside a height-capped
          sheet: a scroller inside a scroller inside a drawer. It is about the
          plan you are RUNNING, so it is a row under Plan and a sheet of its
          own, with room to be one list. */}
      <Sheet open={sheet === 'volume'} onClose={() => setSheet(null)}
        title={`Weekly set volume · ${phaseLabel}`} accent={STEEL}>
        <div className="space-y-1.5">
          {LANDMARK_MUSCLES.map((m) => (
            <label key={m} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.015] border border-white/[0.05] px-3 min-h-[40px]">
              <span className="text-fluid-xs text-text/80 truncate">{m}</span>
              <input
                type="text" inputMode="numeric"
                key={`${activePlanId}|${livePhase}|${m}`}
                defaultValue={volTargets[m]}
                onBlur={(e) => {
                  const n = parseInt(e.target.value, 10)
                  if (!Number.isFinite(n) || n < 0 || n === volTargets[m]) return
                  void saveVolumeTarget({ planId: activePlanId, phase: livePhase, muscle: m, targetSets: n })
                }}
                className="w-12 bg-transparent helix-num field-compact font-bold text-text text-right outline-none tabular-nums"
                aria-label={`${m} weekly set target`}
              />
            </label>
          ))}
          <p className="text-[11px] text-muted leading-snug pt-1">
            Saved against {planLabel} · {phaseLabel}. These are the MEV/MAV targets every weekly volume
            reading grades against.
          </p>
        </div>
      </Sheet>

      {/* ── Routines — also moved out of the drawer, for the same reason ── */}
      <Sheet open={sheet === 'routines'} onClose={() => setSheet(null)}
        title={`Routines · ${phaseLabel}`} accent={EMBER}>
        <RoutineList planId={activePlanId} phase={livePhase} isActive />
      </Sheet>

      {/* ── Plan — the picker, and nothing that is not about picking ──
          This drawer used to also carry eight editable goal fields, a read-only
          grid restating them, a 7-day schedule the Workout tab already owns,
          the set-volume scroller and the routine list. What is left is the
          decision it exists for. */}
      <Sheet size="wide" maxHeight="92dvh"
        open={sheet === 'plan'} onClose={() => { setSheet(null); setPreviewPlan(null); setConfirmSwitch(false) }}
        title="Training plan" accent={STEEL}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {planList().map((plan) => {
              const on = previewPlan?.id === plan.id
              const active = plan.id === activePlanId
              return (
                <button key={plan.id} onClick={() => { setConfirmSwitch(false); setDrawerPhase(active ? livePhase : 'cut'); setPreviewPlan(plan) }}
                  aria-pressed={on}
                  className="rounded-2xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-200"
                  style={on
                    ? { borderColor: `${STEEL}66`, background: `${STEEL}14`, boxShadow: `0 0 16px ${STEEL}33` }
                    : { borderColor: 'rgba(255,255,255,0.08)' }}>
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

          {previewPlan && (() => {
            const isActive = previewPlan.id === activePlanId && livePhase === drawerPhase
            return (
              <>
                {/* ── Phase — nested INSIDE the plan, because a phase is not a
                       global mood: it is the set of numbers a specific plan
                       runs on. ── */}
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Phase</div>
                  <div className="flex rounded-xl border border-white/[0.08] overflow-hidden">
                    {(['cut', 'maintenance', 'bulk'] as NutritionMode[]).map((m) => {
                      const on = drawerPhase === m
                      return (
                        <button key={m} onClick={() => setDrawerPhase(m)} aria-pressed={on}
                          className="flex-1 py-2 text-fluid-xs font-semibold capitalize min-h-[44px]"
                          style={on ? phaseBadgeStyle(MODE_TO_PHASE[m], true) : { color: 'var(--color-muted)' }}>
                          {m}
                          {previewPlan.id === activePlanId && livePhase === m && (
                            <span className="block text-[8px] uppercase tracking-wide opacity-70">active</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <p className="text-[11px] text-muted leading-snug">
                  Switching rewrites calories, macros, step goal, body targets and weekly set volume to this
                  phase&apos;s numbers. Edit them afterwards under Targets, which is the only place they are edited.
                </p>

                <div className="pt-1 border-t border-white/[0.06]">
                  {isActive ? (
                    <p className="text-fluid-xs text-muted text-center py-2">
                      {previewPlan.label} · {drawerPhase} is active.
                    </p>
                  ) : (
                    <button onClick={() => setConfirmSwitch(true)} disabled={saving}
                      className="btn-primary w-full justify-center min-h-[46px] disabled:opacity-60"
                      style={{ background: STEEL, boxShadow: `0 0 16px ${STEEL}44` }}>
                      Make {previewPlan.label} · {drawerPhase} active
                    </button>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      </Sheet>

      {/* The only destructive action in the app. A confirmation rising from the
          bottom edge over the thing it is about is the platform idiom for
          exactly this, and it cannot be reached without the prose arriving with
          it. */}
      <Sheet
        open={confirmSwitch && !!previewPlan}
        onClose={() => setConfirmSwitch(false)}
        title="Switch plan?"
        accent={EMBER}
        layer="stacked"
      >
        {previewPlan && (
          <div className="space-y-4 pb-2">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: EMBER }} aria-hidden="true" />
              <p className="text-sm text-muted leading-relaxed">
                Run <span className="text-text font-semibold">{previewPlan.label}</span> on its{' '}
                <span className="text-text font-semibold">{drawerPhase}</span> phase? Calories, macros, step goal,
                body targets and weekly set volume all move to this phase&apos;s numbers, the training schedule
                changes, and analytics re-anchor from today. Your logged history is preserved.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmSwitch(false)} className="btn-glass min-h-[44px] px-4">Cancel</button>
              <button
                onClick={async () => {
                  const id = previewPlan.id, m = drawerPhase
                  setPreviewPlan(null); setConfirmSwitch(false); setSheet(null)
                  await applyPlanPhase(id, m)
                }}
                disabled={saving}
                className="btn-primary min-h-[44px] px-4 disabled:opacity-60">
                Confirm
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

/** A rung's display name, or the honest absence of one. */
function LEVER_LABEL(id: LeverId | null): string {
  return LEVERS.find((l) => l.id === id)?.label ?? 'Custom'
}

