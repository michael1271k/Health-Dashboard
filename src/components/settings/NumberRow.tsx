'use client'

import { useEffect, useRef, useState } from 'react'
import { ZoneRow } from '@/components/ui/Zone'

/**
 * One editable number in a settings band — label left, value right, no chrome.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────
 * Every numeric field in Settings was a bare `<input type="number">` inside a
 * grid (`EditPlanCard`'s `Field` and `OptField`, and a raw text input in the
 * volume sheet). Three of them looked different from each other and none of them
 * looked like the rows they sat between, so a page that is otherwise a list of
 * `label · value ›` rows broke into a form partway down.
 *
 * ── COMMIT ON BLUR, NOT ON KEYSTROKE ─────────────────────────────────────────
 * The editor this replaces staged everything behind an explicit Save, for a
 * stated reason: these numbers are what today is GRADED against, so writing one
 * re-scores the day. That reason is real, and it is an argument against writing
 * on every keystroke — "1", "19", "195" and "1955" are four different targets,
 * three of which were never meant — not against writing at all.
 *
 * So the commit happens when you leave the field, plus a debounce for the case
 * where you type and never blur. The draft is local until then, which is also
 * what lets the field hold "" while you clear it: a controlled input bound
 * straight to a number cannot be empty, and the old one snapped to 0 the moment
 * you selected-all and pressed delete.
 */
export function NumberRow({
  label, hint, value, unit, step = 1, min = 0, max, onCommit, placeholder,
}: {
  label: string
  hint?: string
  /** Null renders as empty — "not set", which is different from zero. */
  value: number | null
  /** Printed after the field: "kcal", "g", "steps". */
  unit?: string
  step?: number
  min?: number
  max?: number
  placeholder?: string
  /** Called with the parsed value, or null when the field was cleared. */
  onCommit: (next: number | null) => void
}) {
  const [draft, setDraft] = useState<string>(value == null ? '' : String(value))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const committed = useRef<string>(value == null ? '' : String(value))

  // Follow the prop when it changes underneath us (a lever applied elsewhere,
  // a reload) — but never while the user is mid-edit, which is what `committed`
  // distinguishes: it holds what we last agreed on with the parent.
  useEffect(() => {
    const next = value == null ? '' : String(value)
    if (next === committed.current) return
    committed.current = next
    setDraft(next)
  }, [value])

  const commit = (raw: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const trimmed = raw.trim()
    if (trimmed === committed.current) return
    committed.current = trimmed
    if (trimmed === '') { onCommit(null); return }
    const n = Number(trimmed)
    if (!Number.isFinite(n)) return
    onCommit(n)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <ZoneRow className="flex items-center gap-3 min-h-[52px]">
      <span className="min-w-0 flex-1">
        <span className="block text-fluid-sm text-text">{label}</span>
        {hint && <span className="block text-[10px] text-muted leading-snug">{hint}</span>}
      </span>
      <span className="flex items-baseline gap-1.5 shrink-0">
        <input
          type="number"
          inputMode="numeric"
          step={step}
          min={min}
          max={max}
          placeholder={placeholder}
          value={draft}
          aria-label={label}
          onChange={(e) => {
            setDraft(e.target.value)
            if (timer.current) clearTimeout(timer.current)
            // Long enough that typing four digits is one write, short enough
            // that walking away from the phone still saves.
            timer.current = setTimeout(() => commit(e.target.value), 600)
          }}
          onBlur={(e) => commit(e.target.value)}
          className="helix-num w-24 rounded-lg bg-surface-2 border border-border px-2.5 py-1.5 text-right field-compact text-text tabular-nums"
        />
        {unit && <span className="text-[10px] text-muted w-8 shrink-0">{unit}</span>}
      </span>
    </ZoneRow>
  )
}
