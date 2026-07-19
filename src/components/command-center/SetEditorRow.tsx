'use client'

import { useEffect, useState } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { X } from 'lucide-react'
import { tapLight } from '@/lib/native/haptics'
import type { DraftSet } from '@/lib/sessions/draft'

const WEIGHT_STEPS = [-2.5, -0.25, +0.25, +2.5] as const
const ORANGE = '#FF8A3D' // warm-up
const DANGER = '#FB7185' // failure

/** Stable slider ceiling for a load (multiple of 10, ≥ weight + 30 headroom). */
const maxFor = (w: number) => Math.max(60, Math.ceil((w + 30) / 10) * 10)

/**
 * One set row of the deck: tap to activate the tuner (Radix weight slider +
 * haptic stepper chips, reps ±1, Warm-up/Failure toggles). Only the active row
 * mounts its slider, keeping long decks light.
 */
export function SetEditorRow({ index, set, active, timed = false, onActivate, onChange, onRemove }: {
  index: number
  set: DraftSet
  active: boolean
  /** Time-based movement (plank/hold) — the reps field is seconds, not reps. */
  timed?: boolean
  onActivate: () => void
  onChange: (patch: Partial<DraftSet>) => void
  onRemove: () => void
}) {
  // 3.75 must display as 3.75, not "3.8" — quarter-step plates are real loads.
  const weightLabel = set.weightKg % 1 === 0 ? set.weightKg.toFixed(0)
    : (set.weightKg * 10) % 1 === 0 ? set.weightKg.toFixed(1) : set.weightKg.toFixed(2)

  // The Radix max must NOT be derived from the live value: a shrinking max
  // rescales the track mid-drag and snaps the value (the 35→25 jump). Keep it
  // grow-only so an interaction never rescales downward.
  const [sliderMax, setSliderMax] = useState(() => maxFor(set.weightKg))
  useEffect(() => {
    const cand = maxFor(set.weightKg)
    setSliderMax((m) => (cand > m ? cand : m))
  }, [set.weightKg])

  const isWarm = set.setType === 'warmup'
  const isFail = set.setType === 'failure'

  const nudgeWeight = (delta: number) => {
    void tapLight()
    // Snap to the 0.25 kg grid (quarter-kg microloads), not the old 0.5 grid.
    onChange({ weightKg: Math.max(0, Math.round((set.weightKg + delta) * 4) / 4) })
  }
  const nudgeReps = (delta: number) => {
    void tapLight()
    onChange({ reps: Math.max(1, set.reps + delta) })
  }
  const toggleType = (t: 'warmup' | 'failure') => {
    void tapLight()
    onChange({ setType: set.setType === t ? undefined : t })
  }

  return (
    <div
      className={`rounded-lg border transition-colors ${
        active ? 'border-primary/30 bg-white/[0.03]'
        : isWarm ? 'border-transparent bg-[#FF8A3D]/[0.06]' : 'border-transparent'}`}
    >
      {/* ── Summary line (always visible) ── */}
      <div className="flex items-center gap-2 px-2 py-1">
        <button
          type="button"
          onClick={onActivate}
          className="flex-1 min-w-0 flex items-center gap-2.5 text-left min-h-[36px]"
          aria-expanded={active}
        >
          <span
            className="w-6 shrink-0 text-[10px] font-bold uppercase tracking-wide tabular-nums"
            style={{ color: isWarm ? ORANGE : isFail ? DANGER : 'var(--color-muted)' }}
          >
            {isWarm ? 'W' : `S${index + 1}`}
          </span>
          <span className={`helix-num text-fluid-base font-bold tabular-nums ${isWarm ? 'text-muted' : 'text-text'}`}>
            {weightLabel}<span className="text-[10px] text-muted font-normal ml-0.5">kg</span>
          </span>
          <span className="text-muted text-xs">×</span>
          <span className={`helix-num text-fluid-base font-bold tabular-nums ${isWarm ? 'text-muted' : 'text-text'}`}>
            {set.reps}<span className="text-[10px] text-muted font-normal ml-0.5">{timed ? 'sec' : 'reps'}</span>
          </span>
          {isFail && (
            <span className="text-[9px] font-bold uppercase px-1 py-px rounded"
              style={{ color: DANGER, background: `${DANGER}1f`, border: `1px solid ${DANGER}55` }}>F</span>
          )}
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
        <div className="px-2 pb-2 space-y-2">
          <Slider.Root
            className="relative flex items-center select-none touch-none w-full h-6"
            min={0}
            max={sliderMax}
            step={0.25}
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
                         shadow-[0_0_12px_rgba(139,92,246,0.55)]"
            />
          </Slider.Root>
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1">
              {WEIGHT_STEPS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => nudgeWeight(d)}
                  className="glass-card px-2 min-h-[34px] text-[11px] font-semibold text-text tabular-nums active:scale-95 transition-transform"
                >
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => nudgeReps(-1)} aria-label="One rep less"
                className="glass-card min-h-[34px] min-w-[34px] text-sm font-bold text-text active:scale-95 transition-transform">−</button>
              <span className="helix-num text-fluid-sm font-bold text-text w-7 text-center tabular-nums">{set.reps}</span>
              <button type="button" onClick={() => nudgeReps(+1)} aria-label="One rep more"
                className="glass-card min-h-[34px] min-w-[34px] text-sm font-bold text-text active:scale-95 transition-transform">+</button>
            </div>
          </div>
          {/* Set modifiers — Warm-up / Failure (Hevy parity) */}
          <div className="flex items-center gap-1.5">
            <TypeChip active={isWarm} color={ORANGE} label="Warm-up" short="W" onClick={() => toggleType('warmup')} />
            <TypeChip active={isFail} color={DANGER} label="Failure" short="F" onClick={() => toggleType('failure')} />
          </div>
        </div>
      )}
    </div>
  )
}

function TypeChip({ active, color, label, short, onClick }: {
  active: boolean; color: string; label: string; short: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors active:scale-95"
      style={active
        ? { color, background: `${color}1f`, border: `1px solid ${color}66` }
        : { color: 'var(--color-muted)', background: 'transparent', border: '1px solid rgba(255,255,255,0.10)' }}
    >
      <span aria-hidden="true">{short}</span>
      <span className="ml-1 hidden sm:inline">{label}</span>
    </button>
  )
}
