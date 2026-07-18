'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * Compact month calendar for back-dating a session. Future dates and dates that
 * already have a logged session are grayed/disabled (except the current
 * selection) so a second session can never be logged for the same date.
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

  const firstDay = new Date(Date.UTC(y, m, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const monthLabel = new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const prevMonth = () => (m === 0 ? (setY(y - 1), setM(11)) : setM(m - 1))
  const nextMonth = () => (m === 11 ? (setY(y + 1), setM(0)) : setM(m + 1))
  const canGoNext = iso(y, m, daysInMonth) < max

  return (
    <div className="absolute right-0 top-full mt-2 z-30 helix-card !p-3 w-[17rem] shadow-2xl" role="dialog" aria-label="Pick session date">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevMonth} aria-label="Previous month"
          className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-muted hover:text-text">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <span className="text-fluid-sm font-semibold text-text">{monthLabel}</span>
        <button type="button" onClick={nextMonth} disabled={!canGoNext} aria-label="Next month"
          className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-muted hover:text-text disabled:opacity-30">
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
          const isLogged = disabledDates.has(ds) && !isSelected
          const disabled = isFuture || isLogged
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => { onSelect(ds); onClose() }}
              title={isLogged ? 'Already logged' : undefined}
              className={`min-h-[34px] rounded-lg text-fluid-xs tabular-nums transition-colors
                ${isSelected ? 'bg-primary text-bg font-bold'
                  : disabled ? 'text-muted/30 line-through cursor-not-allowed'
                  : 'text-text hover:bg-white/[0.08]'}`}
            >
              {d}
            </button>
          )
        })}
      </div>
      <p className="text-[10px] text-muted mt-2">Grayed dates already have a logged session.</p>
    </div>
  )
}
