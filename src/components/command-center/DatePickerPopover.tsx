'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * Back-dating calendar. Rendered in a PORTAL over a backdrop with a SOLID
 * themed panel + high z-index, so it can never be clipped by the metadata card
 * or read as transparent (the old "can't see days 12–30" bug). Future dates and
 * dates that already have a logged session are disabled (a colored dot marks the
 * logged ones) — a second session can never be logged for the same date.
 */
export function DatePickerPopover({ value, max, disabledDates, onSelect, onClose }: {
  value: string
  max: string
  disabledDates: Set<string>
  onSelect: (dateISO: string) => void
  onClose: () => void
}) {
  const [y, setY] = useState(() => Number(value.slice(0, 4)))
  const [m, setM] = useState(() => Number(value.slice(5, 7)) - 1)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const firstDay = new Date(Date.UTC(y, m, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const monthLabel = new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const prevMonth = () => (m === 0 ? (setY(y - 1), setM(11)) : setM(m - 1))
  const nextMonth = () => (m === 11 ? (setY(y + 1), setM(0)) : setM(m + 1))
  const canGoNext = iso(y, m, daysInMonth) < max

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Pick session date">
      <button type="button" aria-label="Close" onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-[19rem] max-w-full rounded-2xl border p-4 shadow-2xl"
        style={{ background: '#0F1115', borderColor: 'rgba(255,255,255,0.12)', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={prevMonth} aria-label="Previous month"
            className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-white/[0.06]">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <span className="text-fluid-sm font-semibold text-text">{monthLabel}</span>
          <button type="button" onClick={nextMonth} disabled={!canGoNext} aria-label="Next month"
            className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-white/[0.06] disabled:opacity-30">
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WD.map((d, i) => <span key={i} className="text-[10px] text-muted py-1">{d}</span>)}
          {cells.map((d, i) => {
            if (d == null) return <span key={i} />
            const ds = iso(y, m, d)
            const isSelected = ds === value
            const isFuture = ds > max
            const isLogged = disabledDates.has(ds)
            const disabled = isFuture || (isLogged && !isSelected)
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => { onSelect(ds); onClose() }}
                title={isLogged ? 'Already logged' : undefined}
                className={`relative min-h-[38px] rounded-lg text-fluid-sm tabular-nums transition-colors
                  ${isSelected ? 'bg-primary text-bg font-bold'
                    : disabled ? 'text-muted/30 cursor-not-allowed'
                    : 'text-text hover:bg-white/[0.10]'}`}
              >
                {d}
                {isLogged && !isSelected && (
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-1 w-1 h-1 rounded-full"
                    style={{ background: '#E0703C' }} aria-hidden="true" />
                )}
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-muted mt-3 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#E0703C' }} aria-hidden="true" />
          Dot = already logged (can&apos;t double-log). Future dates disabled.
        </p>
      </div>
    </div>,
    document.body,
  )
}
