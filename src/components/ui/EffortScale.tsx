'use client'

import { CR10_MIN, CR10_MAX, cr10Label, cr10Color } from '@/lib/training/effort'

/**
 * Borg CR10 effort picker — one component for strength sessions and cardio.
 *
 * Ten discrete taps rather than a slider: a slider on a phone is imprecise
 * exactly where precision matters (the 7–9 band), and a rating you fat-finger
 * is worse than no rating. Tapping the active value clears it, so "I don't want
 * to rate this" stays reachable without a separate control.
 */
export function EffortScale({ value, onChange, label = 'Session effort', compact = false }: {
  value: number | null | undefined
  onChange: (v: number | null) => void
  label?: string
  compact?: boolean
}) {
  const steps = Array.from({ length: CR10_MAX - CR10_MIN + 1 }, (_, i) => CR10_MIN + i)
  const active = value ?? null

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`${compact ? 'text-[11px]' : 'text-xs'} text-muted font-medium`}>{label}</span>
        <span className="text-[11px] font-semibold tabular-nums" style={{ color: cr10Color(active) }}>
          {active != null ? `${active} · ${cr10Label(active)}` : 'Not rated'}
        </span>
      </div>
      <div
        className="flex gap-1"
        role="radiogroup"
        aria-label={`${label} — Borg CR10, 1 very light to 10 maximal`}
      >
        {steps.map((n) => {
          const on = active != null && n <= active
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active === n}
              aria-label={`${n} — ${cr10Label(n)}`}
              onClick={() => onChange(active === n ? null : n)}
              className={`flex-1 rounded-md text-[11px] font-bold tabular-nums transition-colors
                          ${compact ? 'min-h-[32px]' : 'min-h-[40px]'}`}
              style={on
                ? { background: `${cr10Color(active)}26`, color: cr10Color(active), border: `1px solid ${cr10Color(active)}66` }
                : { background: 'rgba(255,255,255,0.03)', color: 'var(--color-muted)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}
