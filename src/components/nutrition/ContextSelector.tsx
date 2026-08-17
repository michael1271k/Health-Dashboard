'use client'

import { CONTEXT_MODES, CONTEXT_META, isRangeMode, type ContextMode } from '@/lib/nutrition/context'
import { AMETHYST, MUTED } from '@/lib/theme/palette'

/**
 * The ONE context control, used by the day banner and by Settings.
 *
 * Two controls existed before — a stack of five checkboxes on the day and a
 * four-row radio list in Settings — reading and writing different columns with
 * overlapping vocabularies. Whichever one you used, the other was wrong.
 *
 * ── WHY A SEGMENTED ROW AND NOT CHECKBOXES ───────────────────────────────────
 * Checkboxes said the states were combinable. They never were: you cannot be
 * Travel and Illness at once, and the old UI let you tick both and then stored
 * the last write. One row, one selection, tap the selected one to return to
 * Normal.
 *
 * The two-tone treatment is load-bearing: a RANGE mode persists until ended and
 * a one-day mode does not, so they cannot look identical when picked.
 */
export function ContextSelector({ value, onChange, disabled = false, showRangeHint = true }: {
  value: ContextMode
  onChange: (next: ContextMode) => void
  disabled?: boolean
  /** The one-line explanation under the row. Off where space is tight. */
  showRangeHint?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Context">
        {CONTEXT_MODES.map((mode) => {
          const on = value === mode
          const range = isRangeMode(mode)
          return (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              // Tapping the ACTIVE mode returns to Normal — the same "tap again
              // to undo" the weigh-in chips use, and the only way to end a range
              // without hunting for a Normal button.
              onClick={() => onChange(on ? 'normal' : mode)}
              className="min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40"
              style={{
                color: on ? (mode === 'normal' ? undefined : AMETHYST) : MUTED,
                background: on ? `${AMETHYST}1f` : 'rgba(255,255,255,0.035)',
                border: `1px solid ${on ? `${AMETHYST}59` : 'rgba(255,255,255,0.07)'}`,
                // A range mode picked shows a heavier left edge: it is a state
                // you are IN, not a note about one day.
                borderLeftWidth: on && range ? 3 : 1,
              }}
            >
              {CONTEXT_META[mode].label}
            </button>
          )
        })}
      </div>
      {showRangeHint && (
        <p className="text-[10px] text-muted leading-snug">
          {CONTEXT_META[value].desc}
          {isRangeMode(value) && ' · stays on until you tap it again.'}
        </p>
      )}
    </div>
  )
}
