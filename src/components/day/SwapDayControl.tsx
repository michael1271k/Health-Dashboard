'use client'

import { useState } from 'react'
import { Repeat, RotateCcw } from 'lucide-react'
import { PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId } from '@/lib/programs'
import { useSwapDay, useClearScheduleOverride } from '@/lib/hooks/useScheduleOverrides'
import { getScheduleOverride } from '@/lib/schedule/overrides'

/**
 * "Swap Day" — move any program day's workout onto this date (e.g. Tue → Wed).
 * Writes a schedule override that cascades everywhere: the Log shortcut appears
 * here and leaves the day's normal weekday slot (which becomes rest).
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
        <div className="mt-2 helix-card !p-3 space-y-1.5">
          <p className="text-[11px] text-muted">Move a workout onto this day:</p>
          {program.days.map((d) => (
            <button
              key={d.key}
              type="button"
              disabled={busy}
              onClick={() => swap.mutate({ date, dayKey: d.key }, { onSuccess: () => setOpen(false) })}
              className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors
                         bg-white/[0.02] border hover:bg-white/[0.04] disabled:opacity-50"
              style={{ borderColor: `${d.color}33` }}
            >
              <span className="text-sm font-semibold" style={{ color: d.color }}>{d.label}</span>
              {d.sub && <span className="text-[10px] text-muted">{d.sub}</span>}
            </button>
          ))}
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
