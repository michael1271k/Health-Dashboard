'use client'

import { ChevronRight } from 'lucide-react'
import { ZoneRow } from '@/components/ui/Zone'

/**
 * The three row shapes a settings list needs.
 *
 * Settings was a page of cards, each inventing its own label/description/control
 * layout — a `flex items-center justify-between gap-4` with two `<div>`s, copied
 * five times with small differences in text size and no shared idea of a row
 * height. These are that idea, once: 52px, label over hint, control or value on
 * the right, and `ZoneRow` underneath carrying the padding, the divider and the
 * tap haptic the rest of the app already uses.
 */
/**
 * One settings row that leads somewhere: label, what it is for, its current
 * value, and a chevron.
 *
 * The value on the row is the point. A list of names with no readings makes you
 * open every one of them to find the setting you meant — which is exactly what
 * the old page's cards did at card scale.
 */
export function SettingRow({ label, hint, value, onOpen, href }: {
  label: string
  hint?: string
  value?: string
  /** Opens a drawer. Ignored when `href` is set. */
  onOpen?: () => void
  /**
   * Navigate instead of opening a sheet.
   *
   * A settings detail that is a PAGE gets a real link: the back gesture works,
   * the URL survives a reload, and the row reads as a link rather than as a
   * button that mysteriously reveals a screen. `ZoneRow` has supported this all
   * along and nothing here used it.
   */
  href?: string
}) {
  return (
    <ZoneRow
      {...(href ? { href } : { asButton: true as const, onClick: onOpen })}
      className="flex items-center gap-3 min-h-[52px]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-fluid-sm text-text font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-muted leading-snug">{hint}</span>}
      </span>
      {value && <span className="helix-num text-fluid-xs text-muted shrink-0 tabular-nums">{value}</span>}
      <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
    </ZoneRow>
  )
}

/** A row whose control is a two-or-three-way choice, decided in place. */
export function ChoiceRow<T extends string | number>({ label, hint, options, value, onChange }: {
  label: string
  hint?: string
  options: ReadonlyArray<readonly [T, string]>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <ZoneRow className="flex items-center gap-3 min-h-[52px]">
      <span className="min-w-0 flex-1">
        <span className="block text-fluid-sm text-text font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-muted leading-snug">{hint}</span>}
      </span>
      <span className="flex rounded-xl border border-border overflow-hidden shrink-0">
        {options.map(([v, text]) => (
          <button key={String(v)} onClick={() => onChange(v)} aria-pressed={v === value}
            className={`px-3.5 min-h-[36px] text-fluid-xs font-semibold ${v === value ? 'bg-primary/15 text-primary' : 'text-muted'}`}>
            {text}
          </button>
        ))}
      </span>
    </ZoneRow>
  )
}

/** A row whose control is a switch. */
export function ToggleRow({ label, hint, on, onToggle }: {
  label: string
  hint?: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <ZoneRow className="flex items-center gap-3 min-h-[52px]">
      <span className="min-w-0 flex-1">
        <span className="block text-fluid-sm text-text font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-muted leading-snug">{hint}</span>}
      </span>
      <button onClick={onToggle} aria-pressed={on} aria-label={label}
        className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${on ? 'bg-primary' : 'bg-surface-2 border border-border'}`}>
        {/* translate, not `left`: `left` is a layout property, so the knob was
            reflowing the button on every toggle. */}
        <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </ZoneRow>
  )
}

