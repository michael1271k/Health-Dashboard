'use client'

import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import { tapLight } from '@/lib/native/haptics'
import { useRestTargets } from '@/lib/hooks/useRestTargets'
import {
  restTargetFor, setRestTarget, hasRestOverride, formatRestTarget,
  REST_STEP_SEC, REST_MIN_SEC, REST_MAX_SEC,
} from '@/lib/training/restTargets'

/**
 * The rest-target dial — ONE implementation, used wherever a target is editable.
 *
 * It appears on two surfaces that look nothing alike (the live logger's open
 * card, the routine layout's plan row) and must behave identically on both:
 * same step, same bounds, same reset, same haptic on `pointerDown` rather than
 * on click. Two hand-rolled copies of a ± pair is two chances for those to
 * drift apart, and the drift is invisible until someone notices the logger
 * moving in fifteens and the plan in tens.
 *
 * Renders nothing when the plan prescribes no rest for the movement — a dial
 * with no prescription behind it invents one.
 */
export function RestTargetControl({ exerciseName, dayKey, label = 'Rest' }: {
  exerciseName: string
  /** The routine day. Calf Press rests 1:30 on Legs A and 1:45 on Legs B. */
  dayKey?: string | null
  /** Overridden only where the surface already says "rest" in its own words. */
  label?: string
}) {
  // Module-level cache: without the subscription this control would edit a
  // value the OTHER surface keeps showing at its old number until an unrelated
  // re-render. Same contract as `useScheduleVersion`.
  const version = useRestTargets()
  const target = useMemo(
    () => { void version; return restTargetFor(exerciseName, dayKey) },
    [version, exerciseName, dayKey],
  )
  const edited = useMemo(
    () => { void version; return hasRestOverride(exerciseName, dayKey) },
    [version, exerciseName, dayKey],
  )

  if (target == null) return null

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted shrink-0">{label}</span>
      <Nudge
        dir={-1}
        disabled={target <= REST_MIN_SEC}
        onClick={() => setRestTarget(exerciseName, target - REST_STEP_SEC, dayKey)}
      />
      <span className="helix-num text-xs font-bold tabular-nums text-text w-10 text-center">
        {formatRestTarget(target)}
      </span>
      <Nudge
        dir={1}
        disabled={target >= REST_MAX_SEC}
        onClick={() => setRestTarget(exerciseName, target + REST_STEP_SEC, dayKey)}
      />
      {edited && (
        <button
          type="button"
          onPointerDown={() => { void tapLight() }}
          onClick={() => setRestTarget(exerciseName, null, dayKey)}
          aria-label={`Reset the rest target for ${exerciseName} to the plan's`}
          title="Back to the plan's target"
          className="min-h-[28px] px-1.5 rounded-lg text-muted hover:text-text active:scale-95 transition-transform"
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/**
 * One ± of the dial.
 *
 * Its own component for the same reason `SetEditorRow` has one: two
 * near-identical 28px buttons written inline is two chances to give them
 * different hit areas, and the haptic belongs on `pointerDown`.
 */
function Nudge({ dir, disabled, onClick }: { dir: -1 | 1; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={() => { if (!disabled) void tapLight() }}
      onClick={onClick}
      aria-label={`${dir > 0 ? 'Increase' : 'Decrease'} rest target by ${REST_STEP_SEC} seconds`}
      className="min-h-[28px] min-w-[28px] rounded-lg border border-white/[0.08] bg-white/[0.04]
                 text-[13px] font-bold text-muted leading-none active:scale-95 transition-transform
                 disabled:opacity-30"
    >
      {dir > 0 ? '+' : '−'}
    </button>
  )
}
