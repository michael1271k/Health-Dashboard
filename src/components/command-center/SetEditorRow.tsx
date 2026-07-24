'use client'

import { useEffect, useState } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { X } from 'lucide-react'
import { tapLight } from '@/lib/native/haptics'
import type { DraftSet } from '@/lib/sessions/draft'

const WEIGHT_STEPS = [-2.5, -0.25, +0.25, +2.5] as const
const ORANGE = '#E2683A' // warm-up
const DANGER = '#D5514E' // failure

/** Stable slider ceiling for a load (multiple of 10, ≥ weight + 30 headroom). */
const maxFor = (w: number) => Math.max(60, Math.ceil((w + 30) / 10) * 10)

/**
 * One set row of the deck: tap to activate the tuner (Radix weight slider +
 * haptic stepper chips, reps ±1, Warm-up/Failure toggles). Only the active row
 * mounts its slider, keeping long decks light.
 */
export function SetEditorRow({ index, displayNum, subRow = false, set, active, timed = false, onActivate, onChange, onRemove, onSplit, onToggleLink, onMerge }: {
  index: number
  /** Human set number (groups a unilateral pair as ONE set); falls back to index+1. */
  displayNum?: number
  /** True when rendered as a Left/Right sub-row nested inside a "Set N" pair card. */
  subRow?: boolean
  set: DraftSet
  active: boolean
  /** Time-based movement (plank/hold) — the reps field is seconds, not reps. */
  timed?: boolean
  onActivate: () => void
  onChange: (patch: Partial<DraftSet>) => void
  onRemove: () => void
  /** Unilateral: split a normal set into Left/Right (absent once already split). */
  onSplit?: () => void
  /** Unilateral: toggle whether this L/R pair mirrors weight+reps. */
  onToggleLink?: () => void
  /** Unilateral: collapse this L/R pair back into one bilateral set. */
  onMerge?: () => void
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

  const sideColor = set.side === 'L' ? '#9AA6B8' : set.side === 'R' ? '#E2683A' : null
  const badge = set.side ?? (isWarm ? 'W' : `S${displayNum ?? index + 1}`)

  return (
    <div
      className={`rounded-lg border transition-colors ${
        active ? 'border-primary/30 bg-white/[0.03]'
        : isWarm ? 'border-transparent bg-[#E2683A]/[0.06]' : 'border-transparent'}`}
      style={subRow && sideColor ? { borderLeft: `2px solid ${sideColor}`, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 } : undefined}
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
            style={{ color: sideColor ?? (isWarm ? ORANGE : isFail ? DANGER : 'var(--color-muted)') }}
          >
            {badge}
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
              style={{ color: DANGER, background: `${DANGER}1f`, border: `1px solid ${DANGER}55` }}>
              {set.side ? `F-${set.side}` : 'F'}
            </span>
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
          {/* Direct keyboard entry — type weight/reps on desktop or mobile.
              The slider + steppers below stay for tactile tuning. */}
          <div className="flex items-center gap-2">
            <label className="flex-1 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 min-h-[38px]">
              <NumberField
                value={set.weightKg}
                inputMode="decimal"
                ariaLabel={`Weight for set ${index + 1}`}
                onCommit={(n) => onChange({ weightKg: Math.max(0, n) })}
              />
              <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">kg</span>
            </label>
            <span className="text-muted text-xs shrink-0">×</span>
            <label className="flex-1 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 min-h-[38px]">
              <NumberField
                value={set.reps}
                inputMode="numeric"
                ariaLabel={`${timed ? 'Seconds' : 'Reps'} for set ${index + 1}`}
                onCommit={(n) => onChange({ reps: Math.max(1, Math.round(n)) })}
              />
              <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">{timed ? 'sec' : 'reps'}</span>
            </label>
          </div>
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
          {/* Set modifiers — Warm-up / Failure (Hevy parity). Failure is PER SIDE
              for a split set (F on Right while Left holds). */}
          <div className="flex items-center gap-1.5">
            <TypeChip active={isWarm} color={ORANGE} label="Warm-up" short="W" onClick={() => toggleType('warmup')} />
            <TypeChip active={isFail} color={DANGER} label="Failure" short="F" onClick={() => toggleType('failure')} />
          </div>
          {/* Unilateral — split into Left/Right (pair Link/Merge live on the parent
              "Set N" card, so a nested sub-row shows only its own tuner). */}
          {(onSplit || onToggleLink || onMerge) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {onSplit && (
                <button type="button" onClick={onSplit}
                  className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wide text-muted border border-white/10 hover:text-text active:scale-95 transition-colors">
                  Split L / R
                </button>
              )}
              {set.side && onToggleLink && (
                <button type="button" onClick={onToggleLink} aria-pressed={set.linked !== false}
                  className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wide active:scale-95 transition-colors"
                  style={set.linked !== false
                    ? { color: '#9AA6B8', background: '#9AA6B81f', border: '1px solid #9AA6B866' }
                    : { color: 'var(--color-muted)', background: 'transparent', border: '1px solid rgba(255,255,255,0.10)' }}>
                  {set.linked !== false ? 'Linked' : 'Unlinked'}
                </button>
              )}
              {set.side && onMerge && (
                <button type="button" onClick={onMerge}
                  className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wide text-muted border border-white/10 hover:text-danger active:scale-95 transition-colors">
                  Merge
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Typeable numeric field. Keeps a local text buffer while focused so partial
 * entries ("16", "16.", "16.2") don't fight the parsed value; commits every
 * valid parse up to the parent. Weight is NOT snapped to the 0.25 grid on typed
 * input — the user gets the exact number they enter (the ± chips still snap).
 */
function NumberField({ value, onCommit, inputMode, ariaLabel }: {
  value: number
  onCommit: (n: number) => void
  inputMode: 'decimal' | 'numeric'
  ariaLabel: string
}) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setText(String(value)) }, [value, editing])
  return (
    <input
      type="text"
      inputMode={inputMode}
      value={editing ? text : String(value)}
      aria-label={ariaLabel}
      onFocus={(e) => { setEditing(true); setText(String(value)); e.currentTarget.select() }}
      onChange={(e) => {
        const t = e.target.value
        setText(t)
        const n = parseFloat(t)
        if (Number.isFinite(n)) onCommit(n)
      }}
      onBlur={() => { const n = parseFloat(text); if (Number.isFinite(n)) onCommit(n); setEditing(false) }}
      className="w-full min-w-0 bg-transparent text-fluid-base font-bold tabular-nums text-text outline-none"
    />
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
