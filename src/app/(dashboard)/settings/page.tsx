'use client'

import { useState } from 'react'
import { PHASE_META } from '@/lib/nutrition/phase'
import { Sheet } from '@/components/ui/Sheet'
import { EMBER, STEEL } from '@/lib/theme/palette'
import { PROGRAMS } from '@/lib/programs'
import { LANDMARK_MUSCLES } from '@/lib/training/landmarks'
import { Zone } from '@/components/ui/Zone'
import { SettingRow, ChoiceRow, ToggleRow } from '@/components/settings/SettingsRows'
import { CrashRecorderRow } from '@/components/settings/CrashRecorderRow'
import { LEVERS, type LeverId } from '@/lib/nutrition/levers'
import { useSettingsGoals, applyPrefsToDevice } from '@/lib/hooks/useSettingsGoals'

type SettingsSheet = 'volume' | null

export default function SettingsPage() {
  const {
    goals, loading, saving, status,
    weekStart, trackRpe, activePlanId, livePhase, leverInForce, maintenanceOn,
    save, saveWeekStart, saveTrackRpe,
    resolvePhaseGoals, resolveVolume, saveVolumeTarget,
  } = useSettingsGoals()

  // ── Presentation state, and only presentation state ──
  // One drawer is left on this page — the set-volume grid. The plan picker and
  // the routine preview moved to `/settings/plan`, which is where the decision
  // and its consequences now sit together.
  const [sheet, setSheet] = useState<SettingsSheet>(null)
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
          hint="The split, the phase, and what you do each day"
          value={`${planLabel} · ${phaseLabel}`}
          href="/settings/plan"
        />
        <SettingRow
          label="Weekly set volume"
          hint={`${LANDMARK_MUSCLES.length} landmarks · ${livePhase === 'cut' ? 'MEV+' : 'MAV'}`}
          value={`${LANDMARK_MUSCLES.reduce((n, m) => n + (volTargets[m] ?? 0), 0)} sets`}
          onOpen={() => setSheet('volume')}
        />
      </Zone>

      {/* ── TARGETS ──
          This was four rows and a conditional fifth: Daily targets, Deficit
          lever, a Maintenance week switch, the extra Maintenance targets row
          that switch SPROUTED when it was on, and Body targets. Four ways in to
          one question — what am I eating today — and the first two showed
          numbers the third was overriding without saying so.

          One row now. `/settings/levers` holds the rungs, the release and the
          five figures they replace, in that order, and shows which of them is
          actually in force. */}
      <Zone label="Targets" accent={EMBER}>
        <SettingRow
          label="Levers"
          hint="What you are eating, and what decided it"
          value={maintenanceOn
            ? `Maintenance · ${goals.calorie_goal.toLocaleString()} kcal`
            : `${LEVER_LABEL(leverInForce)} · ${goals.calorie_goal.toLocaleString()} kcal`}
          href="/settings/levers"
        />
        <SettingRow
          label="Body targets"
          hint="Where this plan's phase is steering"
          value={pp.targetWeightKg != null ? `${pp.targetWeightKg} kg` : '—'}
          href="/settings/body"
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
      </Zone>

      {/* ── PROTOCOL ──
          The "Auto-log scheduled supplements" toggle lived here. It existed to
          paper over a default that was backwards: a dose only counted once a row
          was written, and nothing wrote one unless the app happened to be open
          after the slot's clock time. The stack is a protocol — what is written
          down is what happens by default — so the default flipped and the
          setting had nothing left to switch. `user_goals.auto_log_supplements`
          is left in place and unread. */}

      {/* Renders nothing at all when there is no crash to report. */}
      <CrashRecorderRow />

      {status && (
        <p className={`text-sm px-1 ${status.type === 'success' ? 'text-success' : 'text-danger'}`}>{status.msg}</p>
      )}
      {saving && <p className="text-xs text-muted px-1">Saving…</p>}

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

    </div>
  )
}

/** A rung's display name, or the honest absence of one. */
function LEVER_LABEL(id: LeverId | null): string {
  return LEVERS.find((l) => l.id === id)?.label ?? 'Custom'
}

