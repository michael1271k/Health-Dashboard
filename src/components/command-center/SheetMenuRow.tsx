'use client'

import { Loader2 } from 'lucide-react'
import { tapLight } from '@/lib/native/haptics'
import { OXIDE } from '@/lib/theme/palette'

/**
 * One row of a sheet-as-menu: glyph, label, and the line that says what it does.
 *
 * ── LABELLED *AND* EXPLAINED ─────────────────────────────────────────────────
 * It started life inside `SessionMenu`, holding two destructive actions whose
 * only difference was which thing they destroyed — a lone bin glyph at the foot
 * of a live session was a question rather than a control. The hint is not
 * decoration; it is what makes the row safe to press.
 *
 * ── AND WHY IT LIVES IN ITS OWN FILE NOW ─────────────────────────────────────
 * The session menu grew two rows that are not its own — the rest timer and the
 * muscle figure, both moved out of the logger header. Those components own
 * their sheets, so they have to render their own row; importing it back out of
 * `SessionMenu` would have made the menu import the tools and the tools import
 * the menu. One shared primitive, no cycle.
 */
export function SheetMenuRow({ icon, label, hint, onClick, danger, busy, disabled, accent }: {
  icon: React.ReactNode
  label: string
  hint: string
  onClick: () => void
  /** Destructive — oxide glyph, oxide wash, oxide border. */
  danger?: boolean
  busy?: boolean
  disabled?: boolean
  /** Tints the glyph on a non-destructive row. Ignored when `danger`. */
  accent?: string
}) {
  const color = danger ? OXIDE : 'var(--color-text)'
  return (
    <button
      type="button"
      onPointerDown={() => { void tapLight() }}
      onClick={onClick}
      disabled={busy || disabled}
      className="w-full min-h-[56px] rounded-2xl px-3.5 py-2.5 flex items-center gap-3 text-left
                 active:scale-[0.99] transition-transform disabled:opacity-50"
      style={{
        background: danger ? `${OXIDE}14` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${danger ? `${OXIDE}3d` : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <span className="shrink-0" style={{ color: danger ? OXIDE : accent ?? color }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold" style={{ color }}>{label}</span>
        <span className="block text-[11px] text-muted leading-snug">{hint}</span>
      </span>
    </button>
  )
}
