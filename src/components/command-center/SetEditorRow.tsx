'use client'

import * as Slider from '@radix-ui/react-slider'
import { Check, X } from 'lucide-react'
import { tapLight, tapSuccess } from '@/lib/native/haptics'
import type { DraftSet } from '@/lib/sessions/draft'

const WEIGHT_STEPS = [-2.5, -0.5, +0.5, +2.5] as const

/**
 * One set row of the deck: tap to activate the tuner (Radix weight slider +
 * haptic stepper chips, reps ±1). Live mode adds the leading check-off.
 * Only the active row mounts its slider, keeping long decks light.
 */
export function SetEditorRow({ index, set, live, active, onActivate, onChange, onRemove }: {
  index: number
  set: DraftSet
  live: boolean
  active: boolean
  onActivate: () => void
  onChange: (patch: Partial<DraftSet>) => void
  onRemove: () => void
}) {
  const weightLabel = set.weightKg % 1 === 0 ? set.weightKg.toFixed(0) : set.weightKg.toFixed(1)
  const sliderMax = Math.max(60, Math.ceil((set.weightKg + 30) / 10) * 10)

  const nudgeWeight = (delta: number) => {
    void tapLight()
    onChange({ weightKg: Math.max(0, Math.round((set.weightKg + delta) * 2) / 2) })
  }
  const nudgeReps = (delta: number) => {
    void tapLight()
    onChange({ reps: Math.max(1, set.reps + delta) })
  }

  return (
    <div
      className={`rounded-xl border transition-colors ${active ? 'border-primary/30 bg-white/[0.03]' : 'border-transparent'}`}
    >
      {/* ── Summary line (always visible) ── */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        {live && (
          <button
            type="button"
            onClick={() => { if (!set.done) void tapSuccess(); onChange({ done: !set.done }) }}
            aria-pressed={!!set.done}
            aria-label={`Mark set ${index + 1} ${set.done ? 'not done' : 'done'}`}
            className={`min-h-[32px] min-w-[32px] rounded-lg border flex items-center justify-center transition-colors
              ${set.done ? 'border-success/60 bg-success/15 text-success' : 'border-white/[0.12] text-muted'}`}
          >
            <Check className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onActivate}
          className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-[36px]"
          aria-expanded={active}
        >
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted w-6 shrink-0">S{index + 1}</span>
          <span className="helix-num text-fluid-sm font-bold text-text tabular-nums">
            {weightLabel}<span className="text-[10px] text-muted font-normal ml-0.5">kg</span>
          </span>
          <span className="text-muted text-xs">×</span>
          <span className="helix-num text-fluid-sm font-bold text-text tabular-nums">
            {set.reps}<span className="text-[10px] text-muted font-normal ml-0.5">reps</span>
          </span>
          {set.rpe != null && <span className="text-[10px] text-muted">RPE {set.rpe}</span>}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-muted hover:text-danger active:scale-95 transition-transform"
          aria-label={`Remove set ${index + 1}`}
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* ── Tuner (active row only) ── */}
      {active && (
        <div className="px-2 pb-2.5 space-y-2.5">
          <Slider.Root
            className="relative flex items-center select-none touch-none w-full h-6"
            min={0}
            max={sliderMax}
            step={0.5}
            value={[set.weightKg]}
            onValueChange={([v]) => onChange({ weightKg: v })}
            onValueCommit={() => void tapLight()}
            aria-label={`Weight for set ${index + 1}`}
          >
            <Slider.Track className="relative grow rounded-full h-1.5 bg-surface-2">
              <Slider.Range className="absolute rounded-full h-full bg-primary/80" />
            </Slider.Track>
            <Slider.Thumb
              className="block w-5 h-5 rounded-full bg-primary outline-none
                         focus-visible:ring-2 focus-visible:ring-primary/60
                         shadow-[0_0_12px_rgba(22,245,195,0.55)]"
            />
          </Slider.Root>
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1">
              {WEIGHT_STEPS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => nudgeWeight(d)}
                  className="glass-card px-2 min-h-[36px] text-[11px] font-semibold text-text tabular-nums active:scale-95 transition-transform"
                >
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => nudgeReps(-1)} aria-label="One rep less"
                className="glass-card min-h-[36px] min-w-[36px] text-sm font-bold text-text active:scale-95 transition-transform">−</button>
              <span className="helix-num text-fluid-sm font-bold text-text w-7 text-center tabular-nums">{set.reps}</span>
              <button type="button" onClick={() => nudgeReps(+1)} aria-label="One rep more"
                className="glass-card min-h-[36px] min-w-[36px] text-sm font-bold text-text active:scale-95 transition-transform">+</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
