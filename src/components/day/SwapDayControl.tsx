'use client'

import { useState } from 'react'
import { Moon, Repeat, RotateCcw } from 'lucide-react'
import { PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId } from '@/lib/programs'
import { useSwapDay, useClearScheduleOverride } from '@/lib/hooks/useScheduleOverrides'
import { getScheduleOverride, REST_OVERRIDE } from '@/lib/schedule/overrides'

const REST_VIOLET = '#B4522A'

/**
 * "Swap Day" — place any program day's workout (or an explicit Rest Day) onto
 * this date. Writes a schedule override that cascades everywhere (the Log
 * shortcut moves here and leaves the day's normal weekday slot). The chooser is
 * a wide responsive grid, not a narrow dropdown.
 */
export function SwapDayControl({ date, className = '' }: { date: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const swap = useSwapDay()
  const clear = useClearScheduleOverride()
  const program = PROGRAMS[getActiveProgramId()] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
  const overridden = getScheduleOverride(date) != null
  const busy = swap.isPending || clear.isPending

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="btn-glass min-h-[40px] text-fluid-xs justify-center"
      >
        <Repeat className="w-3.5 h-3.5" aria-hidden="true" /> Swap Day
      </button>

      {open && (
        <div className="mt-2 helix-card !p-3 space-y-2 w-full">
          <p className="text-[11px] text-muted">Place a day onto {date}:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {program.days.map((d) => (
              <button
                key={d.key}
                type="button"
                disabled={busy}
                onClick={() => swap.mutate({ date, dayKey: d.key }, { onSuccess: () => setOpen(false) })}
                className="rounded-xl px-3 py-2.5 text-left transition-colors bg-white/[0.02] border hover:bg-white/[0.05] disabled:opacity-50"
                style={{ borderColor: `${d.color}33` }}
              >
                <span className="block text-sm font-semibold truncate" style={{ color: d.color }}>{d.label}</span>
                {d.sub && <span className="block text-[10px] text-muted truncate">{d.sub}</span>}
              </button>
            ))}
            {/* Explicit Rest Day swap */}
            <button
              type="button"
              disabled={busy}
              onClick={() => swap.mutate({ date, dayKey: REST_OVERRIDE }, { onSuccess: () => setOpen(false) })}
              className="rounded-xl px-3 py-2.5 text-left transition-colors bg-white/[0.02] border hover:bg-white/[0.05] disabled:opacity-50 flex items-center gap-2"
              style={{ borderColor: `${REST_VIOLET}33` }}
            >
              <Moon className="w-4 h-4 shrink-0" style={{ color: REST_VIOLET }} aria-hidden="true" />
              <span className="block text-sm font-semibold" style={{ color: REST_VIOLET }}>Rest Day</span>
            </button>
          </div>
          {overridden && (
            <button
              type="button"
              disabled={busy}
              onClick={() => clear.mutate(date, { onSuccess: () => setOpen(false) })}
              className="w-full flex items-center gap-1.5 justify-center text-[11px] text-muted hover:text-text min-h-[32px] disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" /> Reset to default schedule
            </button>
          )}
        </div>
      )}
    </div>
  )
}
