'use client'

import { memo, useEffect, useState } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { Check, X, Trophy } from 'lucide-react'
import { tapLight } from '@/lib/native/haptics'
import { isSetCommitted, type DraftSet } from '@/lib/sessions/draft'
import { prAxisLabel, type PrAxis } from '@/lib/training/prEngine'

const WEIGHT_STEPS = [-2.5, -0.25, +0.25, +2.5] as const
const ORANGE = '#E0703C' // warm-up
const DANGER = '#C4514E' // failure
const DROP = '#9A6DD7'   // drop set
const GREEN = '#3E9E7A'  // completed (ticked green)
const GOLD = '#C9A227'   // personal record

/** Stable slider ceiling for a load (multiple of 10, ≥ weight + 30 headroom). */
const maxFor = (w: number) => Math.max(60, Math.ceil((w + 30) / 10) * 10)

/**
 * One set row of the deck: tap to activate the tuner (Radix weight slider +
 * haptic stepper chips, reps ±1, Warm-up/Failure toggles). Only the active row
 * mounts its slider, keeping long decks light.
 *
 * ── MEMOIZED — THIS IS THE ONE THAT ACTUALLY PAYS ────────────────────────────
 * A keystroke re-rendered all six cards and all twenty-four rows: 2.664 ms,
 * 16% of a frame in jsdom before any paint. Memoizing the CARD turned out not
 * to be enough on its own — `ExerciseCard` calls `useSortable`, and a context
 * change re-renders every consumer no matter how stable its props are (probed:
 * 60 renders across 10 keystrokes with memo in place, versus 10 without the
 * hook). dnd-kit republishes that context on every parent render.
 *
 * The rows subscribe to nothing. They are 24 of the ~30 components in the deck
 * and they carry four effects each, so this boundary is where the work stops.
 * The card shells above still re-execute; they are cheap once their subtree
 * bails out.
 */
export const SetEditorRow = memo(function SetEditorRow({ index, displayNum, subRow = false, set, active, timed = false, bodyweight = false, prAxes = [], onActivate, onChange, onRemove, onToggleDone, onSplit, onPrTap }: {
  index: number
  /** Records this set just set, computed live by the parent from `prEngine`. */
  prAxes?: PrAxis[]
  /**
   * Movement with no load to progress (Hanging Knee Raise, Reverse Crunch, a
   * hold). Its load controls stay hidden while the set is at 0 kg — see
   * `isBodyweightExercise`.
   */
  bodyweight?: boolean
  /** Human set number (groups a unilateral pair as ONE set); falls back to index+1. */
  displayNum?: number
  /** True when rendered as a Left/Right sub-row nested inside a "Set N" pair card. */
  subRow?: boolean
  set: DraftSet
  active: boolean
  /** Time-based movement (plank/hold) — the reps field is seconds, not reps. */
  timed?: boolean
  /*
   * ── EVERY HANDLER TAKES `index` ───────────────────────────────────────────
   * Same reason ExerciseCard's take `localId`: these were pre-bound closures
   * (`onChange={(patch) => onUpdateSet(localId, i, patch)}`), rebuilt on every
   * card render, so all six props changed identity and `memo` never held. The
   * row already receives its own `index`; binding it was not the card's job.
   */
  onActivate: (index: number) => void
  onChange: (index: number, patch: Partial<DraftSet>) => void
  onRemove: (index: number) => void
  /** Tick the set complete (green) / uncomplete — only green sets are recorded. */
  onToggleDone?: (index: number) => void
  /** Unilateral: split a normal set into Left/Right (absent once already split). */
  onSplit?: (index: number) => void
  /** Tapping the trophy opens the record sheet for this set. */
  onPrTap?: (index: number) => void
}) {
  // 3.75 must display as 3.75, not "3.8" — quarter-step plates are real loads.
  const weightLabel = set.weightKg % 1 === 0 ? set.weightKg.toFixed(0)
    : (set.weightKg * 10) % 1 === 0 ? set.weightKg.toFixed(1) : set.weightKg.toFixed(2)

  /**
   * Show the load half at all? "0kg × 15 reps" on a Hanging Knee Raise states a
   * weight that does not exist and buries the only number the set has. A
   * bodyweight movement carrying actual load (weighted pull-up) renders as any
   * other loaded set — the test is the movement AND the value, never one alone.
   */
  const unloadedMovement = bodyweight || timed
  const showLoad = !unloadedMovement || set.weightKg > 0

  /**
   * The tuner's load controls are LATCHED open, not derived from the value.
   *
   * `NumberField` commits on every keystroke, so typing "0.5" commits 0 on the
   * first character. Deriving the controls from `weightKg > 0` therefore
   * unmounted the input mid-word: focus lost, keyboard dismissed, row back to
   * bodyweight. Any sub-1 kg load — a 0.5 kg magnet on a dip belt — was
   * untypeable on exactly the movements this feature is for. Once revealed the
   * controls stay for the whole edit; the latch clears when the row closes
   * still at 0, so it collapses back next time it is opened.
   */
  const [loadOpen, setLoadOpen] = useState(set.weightKg > 0)
  useEffect(() => {
    if (set.weightKg > 0) setLoadOpen(true)
    else if (!active) setLoadOpen(false)
  }, [set.weightKg, active])
  const showLoadControls = showLoad || loadOpen

  /**
   * A HOLD gets no load affordance at all. Weight is invisible to the PR engine
   * on a timed set (`detectSetPrs` returns after the seconds axis) but NOT to
   * `sessionVolumeKg`, which has no timed concept and multiplies weight by
   * `reps` — i.e. by SECONDS. One tap plus a 60 s plank would inject 150 kg of
   * phantom tonnage into the week. Reachable before, but never invited.
   */
  const canAddLoad = bodyweight && !timed

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
  const isDrop = set.setType === 'dropset'
  // Green = committable = will be recorded on finish. Template decks seed every
  // set as NOT committed (done:false); pasted/edited sets are committed by default.
  const done = isSetCommitted(set)

  const nudgeWeight = (delta: number) => {
    void tapLight()
    // Snap to the 0.25 kg grid (quarter-kg microloads), not the old 0.5 grid.
    onChange(index, { weightKg: Math.max(0, Math.round((set.weightKg + delta) * 4) / 4) })
  }
  const nudgeReps = (delta: number) => {
    void tapLight()
    onChange(index, { reps: Math.max(1, set.reps + delta) })
  }
  const toggleType = (t: 'warmup' | 'failure' | 'dropset') => {
    void tapLight()
    onChange(index, { setType: set.setType === t ? undefined : t })
  }

  const sideColor = set.side === 'L' ? '#8E9AAC' : set.side === 'R' ? '#E0703C' : null
  // The badge box is 24px (`w-6 shrink-0`). "Warmup" and "Dropset" are six and
  // seven uppercase characters, and `shrink-0` stops them even trying to fit —
  // they spilled into the load column 10px away. So the box now holds only what
  // is guaranteed to fit (S1 / L / R) and the grid stays aligned however the set
  // is typed; the TYPE moves to a chip beside the numbers, where `F` already
  // lived. The earlier objection to a bare letter — that "W" next to "20kg"
  // reads as a unit — is answered by the chip's border and tint, which read as a
  // tag rather than a suffix, plus the full word in `title`/`aria-label`. This
  // is the treatment the read-only ledger already shipped (ExerciseBreakdown).
  const badge = set.side ?? `S${displayNum ?? index + 1}`
  // setType is single-valued (see `toggleType`), so at most one tag ever shows.
  const typeTag = isWarm ? { label: 'W', full: 'Warm-up', color: ORANGE }
    : isDrop ? { label: 'D', full: 'Drop set', color: DROP }
    : isFail ? { label: set.side ? `F-${set.side}` : 'F', full: 'Taken to failure', color: DANGER }
    : null

  return (
    <div
      className={`rounded-lg border transition-colors ${
        active ? 'border-primary/30 bg-white/[0.03]'
        : done ? 'border-[#3E9E7A]/40 bg-[#3E9E7A]/[0.10]'
        : isWarm ? 'border-transparent bg-[#E0703C]/[0.06]' : 'border-transparent'}`}
      style={subRow && sideColor ? { borderLeft: `2px solid ${sideColor}`, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 } : undefined}
    >
      {/* ── Summary block (always visible) ──
          Two lines, Hevy-style. The numbers own the first line; records hang
          UNDER them on a second. They used to sit inline after the reps, which
          on a three-axis set (Weight + Volume + 1RM) pushed the row past the
          viewport and slid under the green tick — the one control that must
          always be hittable. A sub-line cannot collide with it by construction,
          however many axes a set wins. */}
      <div className="flex items-center gap-2 px-2 py-1">
        <button
          type="button"
          onClick={() => onActivate(index)}
          className="flex-1 min-w-0 flex flex-col gap-1 text-left min-h-[34px] justify-center"
          aria-expanded={active}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-6 shrink-0 text-[10px] font-bold uppercase tracking-wide tabular-nums"
              style={{ color: sideColor ?? 'var(--color-muted)' }}
            >
              {badge}
            </span>
            {showLoad && (
              <>
                <span className={`helix-num text-fluid-base font-bold tabular-nums ${isWarm ? 'text-muted' : 'text-text'}`}>
                  {weightLabel}<span className="text-[10px] text-muted font-normal ml-0.5">kg</span>
                </span>
                <span className="text-muted text-xs">×</span>
              </>
            )}
            <span className={`helix-num text-fluid-base font-bold tabular-nums ${isWarm ? 'text-muted' : 'text-text'}`}>
              {set.reps}<span className="text-[10px] text-muted font-normal ml-0.5">{timed ? 'sec' : 'reps'}</span>
            </span>
            {typeTag && (
              <span className="text-[9px] font-bold uppercase px-1 py-px rounded shrink-0"
                style={{ color: typeTag.color, background: `${typeTag.color}1f`, border: `1px solid ${typeTag.color}55` }}
                title={typeTag.full} aria-label={typeTag.full}>
                {typeTag.label}
              </span>
            )}
            {set.rpe != null && <span className="text-[10px] text-muted shrink-0">RPE {set.rpe}</span>}
          </span>
        </button>
        {onToggleDone && (
          <button
            type="button"
            // Haptic on pointer-DOWN, commit on click. The press highlight
            // (active:scale-95) already fires on touch-down, so firing the
            // haptic on release put the two senses on different frames — the
            // one thing that reliably breaks the illusion. Committing still
            // happens on click, so dragging off the button still cancels.
            onPointerDown={() => { void tapLight() }}
            onClick={() => { onToggleDone(index) }}
            aria-pressed={done}
            aria-label={done ? `Mark set ${index + 1} not done` : `Mark set ${index + 1} done`}
            className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center active:scale-95 transition-[color,background-color,border-color,transform] duration-150"
            style={done
              ? { color: '#fff', background: GREEN, border: `1px solid ${GREEN}` }
              : { color: 'var(--color-muted)', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)' }}
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-muted hover:text-danger active:scale-95 transition-transform"
          aria-label={`Remove set ${index + 1}`}
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* ── Live records ──
          Appears the instant the set is ticked green, from the SAME engine that
          writes personal_records at commit — a badge shown here is a badge that
          gets recorded. Indented to the load column so it reads as belonging to
          these numbers, and one trophy leads the run rather than repeating per
          axis.

          ITS OWN CONTROL, on its own line. It used to live INSIDE the row's
          activate button, where it could not be tapped independently (a button
          cannot hold a button) and any tap opened the tuner instead. Tapping it
          now opens the record sheet, which is the only place the numbers behind
          the badge — what was beaten, and by how much — actually exist. */}
      {prAxes.length > 0 && (
        <button
          type="button"
          onPointerDown={onPrTap ? () => { void tapLight() } : undefined}
          onClick={onPrTap ? () => onPrTap(index) : undefined}
          disabled={!onPrTap}
          className={`w-full flex items-center gap-1 flex-wrap pl-[42px] pr-2 pb-1.5 -mt-0.5 text-left
                      ${onPrTap ? 'active:scale-[0.98] transition-transform duration-150' : ''}`}
          aria-label={onPrTap ? `Records on this set — ${prAxes.map((a) => prAxisLabel(a, timed)).join(', ')}` : undefined}
        >
          <Trophy className="w-2.5 h-2.5 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
          {prAxes.map((axis) => (
            <span key={axis} className="text-[8px] font-bold uppercase tracking-wide leading-none px-1 py-0.5 rounded"
              style={{ color: GOLD, background: `${GOLD}1a`, border: `1px solid ${GOLD}55` }}
              title={`Personal record — ${prAxisLabel(axis, timed)}`}>
              {prAxisLabel(axis, timed)}
            </span>
          ))}
        </button>
      )}

      {/* ── Tuner (active row only) ── */}
      {active && (
        <div className="px-2 pb-2 space-y-2">
          {/* Direct keyboard entry — type weight/reps on desktop or mobile.
              The slider + steppers below stay for tactile tuning. */}
          <div className="flex items-center gap-2">
            {showLoadControls && (
              <>
                <label className="flex-1 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 min-h-[38px]">
                  <NumberField
                    value={set.weightKg}
                    inputMode="decimal"
                    ariaLabel={`Weight for set ${index + 1}`}
                    onCommit={(n) => onChange(index, { weightKg: Math.max(0, n) })}
                  />
                  <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">kg</span>
                </label>
                <span className="text-muted text-xs shrink-0">×</span>
              </>
            )}
            <label className="flex-1 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 min-h-[38px]">
              <NumberField
                value={set.reps}
                inputMode="numeric"
                ariaLabel={`${timed ? 'Seconds' : 'Reps'} for set ${index + 1}`}
                onCommit={(n) => onChange(index, { reps: Math.max(1, Math.round(n)) })}
              />
              <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">{timed ? 'sec' : 'reps'}</span>
            </label>
          </div>
          {showLoadControls && (
          <Slider.Root
            className="relative flex items-center select-none touch-none w-full h-6"
            min={0}
            max={sliderMax}
            step={0.25}
            value={[set.weightKg]}
            onValueChange={([v]) => onChange(index, { weightKg: v })}
            onValueCommit={() => void tapLight()}
            aria-label={`Weight for set ${index + 1}`}
          >
            <Slider.Track className="relative grow rounded-full h-1.5 bg-surface-2">
              <Slider.Range className="absolute rounded-full h-full bg-primary/80" />
            </Slider.Track>
            <Slider.Thumb
              className="block w-5 h-5 rounded-full bg-primary outline-none
                         focus-visible:ring-2 focus-visible:ring-primary/60
                         shadow-[0_0_12px_rgba(224,112,60,0.55)]"
            />
          </Slider.Root>
          )}
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1">
              {showLoadControls ? WEIGHT_STEPS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => nudgeWeight(d)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-2 min-h-[34px] text-[11px] font-semibold text-text tabular-nums active:scale-95 transition-transform"
                >
                  {d > 0 ? `+${d}` : d}
                </button>
              )) : canAddLoad ? (
                // Weighted variants stay one tap away — a belt on a dip, a plate
                // held on a knee raise. Revealing the controls is enough; the
                // load itself stays 0 until the user sets one, so a stray tap
                // cannot invent tonnage or cost the set its reps axis.
                <button
                  type="button"
                  onClick={() => { void tapLight(); setLoadOpen(true) }}
                  aria-label={`Add load to set ${displayNum ?? index + 1}`}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 min-h-[34px] text-[11px] font-semibold text-muted active:scale-95 transition-transform"
                >
                  + Add load
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => nudgeReps(-1)} aria-label="One rep less"
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] min-h-[34px] min-w-[34px] text-sm font-bold text-text active:scale-95 transition-transform">−</button>
              <span className="helix-num text-fluid-sm font-bold text-text w-7 text-center tabular-nums">{set.reps}</span>
              <button type="button" onClick={() => nudgeReps(+1)} aria-label="One rep more"
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] min-h-[34px] min-w-[34px] text-sm font-bold text-text active:scale-95 transition-transform">+</button>
            </div>
          </div>
          {/* Set type — Warm-up / Failure / Drop set (Hevy parity). "Normal" is the
              absence of all three; "Remove" is the X on the summary line. Failure is
              PER SIDE for a split set (F on Right while Left holds). */}
          <div className="flex items-center gap-1.5">
            <TypeChip active={isWarm} color={ORANGE} label="Warm-up" short="W" onClick={() => toggleType('warmup')} />
            <TypeChip active={isFail} color={DANGER} label="Failure" short="F" onClick={() => toggleType('failure')} />
            <TypeChip active={isDrop} color={DROP} label="Drop set" short="D" onClick={() => toggleType('dropset')} />
          </div>
          {/* Unilateral — split into Left/Right. Merge lives on the parent "Set N"
              card, so a nested sub-row shows only its own tuner. */}
          {onSplit && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button type="button" onClick={() => onSplit(index)}
                className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wide text-muted border border-white/10 hover:text-text active:scale-95 transition-colors">
                Split L / R
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

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
