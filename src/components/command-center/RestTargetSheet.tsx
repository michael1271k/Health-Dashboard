'use client'

import { useMemo } from 'react'
import { Timer, RotateCcw } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Segmented } from '@/components/ui/Segmented'
import { RestTargetControl } from '@/components/training/RestTargetControl'
import { useRestTargets } from '@/lib/hooks/useRestTargets'
import { tapLight } from '@/lib/native/haptics'
import { STEEL } from '@/lib/theme/palette'
import {
  restTargetFor, programRestSec, setRestTarget, hasRestOverride, formatRestTarget,
} from '@/lib/training/restTargets'

/** The four rests a program actually prescribes. Anything else is the dial's job. */
const PRESETS = [60, 90, 120, 180] as const

/**
 * Adjust the rest target for one movement.
 *
 * ── THERE IS EXACTLY ONE REST NUMBER ON THIS SCREEN ─────────────────────────
 * The card used to show it twice: a chip in the header and a ± dial under the
 * exercise name, both reading `restTargetFor`, neither counting anything. Two
 * controls for one fact, taking two lines of a card whose whole job is set
 * rows — and the second one was permanently mounted for a number that gets
 * changed maybe twice a training block.
 *
 * So the chip is the only reading, and it stays a plain reading: no countdown,
 * no stopwatch, nothing that moves. Editing lives here, one tap behind it,
 * which is where an occasional decision belongs.
 *
 * State is entirely `restTargets.ts` — this sheet owns no copy of the value.
 */
export function RestTargetSheet({ open, onClose, exerciseName, dayKey }: {
  open: boolean
  onClose: () => void
  exerciseName: string
  /** Calf Press rests 1:30 on Legs A and 1:45 on Legs B — the day disambiguates. */
  dayKey?: string | null
}) {
  const version = useRestTargets()
  const target = useMemo(() => { void version; return restTargetFor(exerciseName, dayKey) }, [version, exerciseName, dayKey])
  const planned = useMemo(() => { void version; return programRestSec(exerciseName, dayKey) }, [version, exerciseName, dayKey])
  const edited = useMemo(() => { void version; return hasRestOverride(exerciseName, dayKey) }, [version, exerciseName, dayKey])

  return (
    <Sheet open={open} onClose={onClose} title="Rest target" accent={STEEL}>
      <div className="space-y-5 pb-2">
        <div className="text-center space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{exerciseName}</p>
          <p className="helix-num text-fluid-3xl font-bold tabular-nums text-text leading-none">
            {target != null ? formatRestTarget(target) : '—'}
          </p>
          <p className="text-xs text-muted">
            {planned == null
              ? 'The plan prescribes no rest for this movement.'
              : edited
                ? <>Your value — the plan asks for {formatRestTarget(planned)}</>
                : 'From the plan'}
          </p>
        </div>

        {/* Presets first: four taps cover almost every prescription, and the
            dial below is for the one that is not among them. `value` simply
            fails to match when the target is off-grid, which is the honest
            rendering — no segment is selected because none of them is it. */}
        <div className="flex justify-center">
          <Segmented
            label="Common rest targets"
            accent={STEEL}
            size="md"
            value={target != null ? String(target) : ''}
            onChange={(v) => setRestTarget(exerciseName, Number(v), dayKey)}
            options={PRESETS.map((p) => ({ value: String(p), label: formatRestTarget(p) }))}
          />
        </div>

        {/* The same dial the routine layout uses — 15s steps, clamped, haptic on
            press. Reused rather than re-drawn, so the two surfaces cannot drift. */}
        <div className="flex justify-center">
          <RestTargetControl exerciseName={exerciseName} dayKey={dayKey} label="Fine" />
        </div>

        {edited && (
          <button
            type="button"
            onPointerDown={() => { void tapLight() }}
            onClick={() => setRestTarget(exerciseName, null, dayKey)}
            className="w-full min-h-[44px] rounded-xl border border-white/[0.10] bg-white/[0.03]
                       text-sm font-semibold text-muted hover:text-text active:scale-[0.98]
                       transition-transform flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Back to the plan{planned != null ? ` (${formatRestTarget(planned)})` : ''}
          </button>
        )}

        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted/70">
          <Timer className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
          A target, not a timer. HELIX shows what to rest for and never counts it
          down — the clock on your wrist is better at that than a webview is.
        </p>
      </div>
    </Sheet>
  )
}
