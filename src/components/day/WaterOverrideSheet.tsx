'use client'

import { useEffect, useState } from 'react'
import { Droplets, RotateCcw } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { useWaterOverride, useClearWaterOverride, useHasWaterOverride, MIN_WATER_ML } from '@/lib/hooks/useWaterOverride'
import { SAPPHIRE } from '@/lib/theme/palette'

const ACCENT = SAPPHIRE   // the same hue WaterHelix uses for its chrome

/** Steps sized to what you actually drink from: a glass and a bottle. */
const STEPS = [250, 500] as const

/**
 * Hand-correct a day's hydration.
 *
 * ── WHY LITRES IN, MILLILITRES STORED ────────────────────────────────────────
 * Every readout in the app prints hydration as `2.7 / 3.0 L`, so the input has
 * to be the unit on screen — asking for 2730 next to a gauge that says 2.7 makes
 * the user do the conversion the app already knows how to do. One decimal is the
 * real precision of the thing being measured; the stored value stays ml because
 * that is what both tables and the scorer are keyed on.
 *
 * ── WHY THERE IS A FLOOR AND NOT A ZERO ──────────────────────────────────────
 * `computeHydrationScore` excludes a day with `waterMl <= 0` from the composite
 * rather than scoring it zero, because an unlogged morning is not a failed one.
 * So storing 0 would silently mean "untracked", not the deliberate zero someone
 * typed. The floor is {@link MIN_WATER_ML} and the copy points at the honest
 * action instead: hand the day back to Apple Health and let it read as untracked.
 *
 * ── WHY THE RESET IS CONDITIONAL ─────────────────────────────────────────────
 * It only appears once the day carries an override. Offered unconditionally, it
 * would let one tap wipe a perfectly good synced reading, and nothing on the
 * button could tell you which of the two it was about to do.
 */
export function WaterOverrideSheet({ open, onClose, date, currentMl, goalMl }: {
  open: boolean
  onClose: () => void
  date: string
  currentMl: number | null
  goalMl: number
}) {
  const override = useWaterOverride(date)
  const clear = useClearWaterOverride(date)
  const { data: hasOverride } = useHasWaterOverride(date)
  const [litres, setLitres] = useState('')

  // Reseed from the day's real value on each open, so the sheet always opens on
  // the truth rather than on whatever the last edit left behind.
  useEffect(() => {
    if (!open) return
    setLitres(currentMl != null ? (currentMl / 1000).toFixed(1) : '')
    override.reset()
    clear.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const ml = Math.round((Number(litres) || 0) * 1000)
  const tooLow = litres !== '' && ml < MIN_WATER_ML
  const pct = goalMl > 0 ? Math.min(100, Math.round((ml / goalMl) * 100)) : 0
  const busy = override.isPending || clear.isPending
  const error = override.error ?? clear.error

  const bump = (delta: number) => {
    const next = Math.max(0, ml + delta)
    setLitres((next / 1000).toFixed(1))
  }

  return (
    <Sheet open={open} onClose={onClose} title="Correct hydration" accent={ACCENT} layer="stacked">
      <p className="text-fluid-xs text-muted mb-4">
        Replaces this day&apos;s water entirely and recalculates your Daily Score.
        Apple Health won&apos;t overwrite it afterwards.
      </p>

      <div className="rounded-2xl border p-4 space-y-3"
        style={{ borderColor: `${ACCENT}30`, background: `${ACCENT}0d` }}>
        <div className="flex items-end justify-between gap-3">
          <label className="flex items-baseline gap-1.5 min-w-0">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              autoFocus
              value={litres}
              onChange={(e) => setLitres(e.target.value)}
              aria-label="Water in litres"
              className="helix-num text-fluid-2xl font-bold bg-transparent text-text outline-none w-24 min-w-0"
            />
            <span className="text-fluid-xs text-muted shrink-0">/ {(goalMl / 1000).toFixed(1)} L</span>
          </label>
          <span className="text-[11px] font-bold shrink-0" style={{ color: ACCENT }}>{pct}%</span>
        </div>

        {/* Live rail — the same fill the gauge behind the sheet will show. */}
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full transition-[width] duration-200"
            style={{ width: `${pct}%`, background: ACCENT }} />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {STEPS.map((s) => (
            <button key={`minus-${s}`} type="button" onClick={() => bump(-s)} disabled={busy}
              className="btn-glass min-h-[36px] text-[11px] px-2.5 disabled:opacity-50">−{s}</button>
          ))}
          {STEPS.map((s) => (
            <button key={`plus-${s}`} type="button" onClick={() => bump(s)} disabled={busy}
              className="btn-glass min-h-[36px] text-[11px] px-2.5 disabled:opacity-50"
              style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>+{s}</button>
          ))}
        </div>
      </div>

      {tooLow && (
        <p className="text-[11px] text-muted mt-3 leading-snug">
          Below {MIN_WATER_ML} ml the day would score as untracked rather than as a low day.
          To leave it blank, hand it back to Apple Health below.
        </p>
      )}

      {error && (
        <p className="text-danger text-fluid-xs mt-3" role="alert">
          {error instanceof Error ? error.message : 'Save failed'}
        </p>
      )}

      <button
        type="button"
        onClick={() => override.mutate(ml, { onSuccess: onClose })}
        disabled={busy || tooLow || litres === ''}
        className="btn-primary w-full justify-center min-h-[48px] mt-4 disabled:opacity-50"
      >
        <Droplets className="w-4 h-4" aria-hidden="true" />
        {override.isPending ? 'Saving…' : 'Save & recalculate'}
      </button>

      {hasOverride && (
        <button
          type="button"
          onClick={() => clear.mutate(undefined, { onSuccess: onClose })}
          disabled={busy}
          className="w-full flex items-center gap-1.5 justify-center text-[11px] text-muted hover:text-text min-h-[40px] mt-1 disabled:opacity-50"
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
          {clear.isPending ? 'Clearing…' : 'Clear & use Apple Health'}
        </button>
      )}
    </Sheet>
  )
}
