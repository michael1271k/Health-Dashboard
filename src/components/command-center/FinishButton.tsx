'use client'

import { Check, Loader2 } from 'lucide-react'
import { EMERALD, EMERALD_DEEP, EMERALD_LIGHT } from '@/lib/theme/palette'

/**
 * "Finish Session" — the one control that ends a workout, at the top of the
 * screen where the session's identity is.
 *
 * ── WHY IT IS SHARED ────────────────────────────────────────────────────────
 * It renders TWICE — in `LiveSessionHero` and, once that has scrolled away, in
 * `LiveSessionBar` — and the two are never on screen together. Two copies of a
 * commit button that disagreed about their disabled rule or their busy state
 * would be the worst possible pair to let drift, so there is one of them.
 *
 * ── AND WHY IT IS GREEN ─────────────────────────────────────────────────────
 * The same emerald ramp a completed set carries. Ticking the last set and
 * finishing the session are the same gesture at two scales, and the deck's
 * primary (ember) already means "the field you are editing".
 */
export function FinishButton({ onClick, busy, disabled, isEdit, size = 'lg' }: {
  onClick: () => void
  busy?: boolean
  /** No sets ticked — there is nothing to commit yet. */
  disabled?: boolean
  /** Edit mode saves changes; it does not finish anything. */
  isEdit?: boolean
  /** `lg` is the hero's 44px target, `sm` the collapsed bar's 38px one. */
  size?: 'sm' | 'lg'
}) {
  const off = !!disabled || !!busy
  const label = busy ? (isEdit ? 'Saving…' : 'Finishing…') : isEdit ? 'Save' : 'Finish'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      aria-label={isEdit ? 'Save changes to this workout' : 'Finish session'}
      title={disabled ? 'Tick a set first' : undefined}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl font-bold
                  transition-transform active:scale-95 disabled:opacity-40
                  ${size === 'lg' ? 'min-h-[44px] px-3 text-[12px]' : 'min-h-[38px] px-2.5 text-[11px]'}`}
      style={{
        color: '#fff',
        background: `linear-gradient(150deg, ${EMERALD_LIGHT} 0%, ${EMERALD} 55%, ${EMERALD_DEEP} 100%)`,
        border: `1px solid ${EMERALD_LIGHT}66`,
        boxShadow: off ? 'none' : `0 0 14px ${EMERALD}4d, inset 0 1px 0 rgba(255,255,255,0.22)`,
      }}
    >
      {busy
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        : <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />}
      {label}
    </button>
  )
}
