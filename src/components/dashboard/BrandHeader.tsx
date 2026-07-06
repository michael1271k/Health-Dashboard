'use client'

import { useEffect, useState } from 'react'
import { HelixMark } from '@/components/HelixMark'
import { useLastUpdated } from '@/lib/hooks/useDashboard'

/** Ticking clock (client-only to avoid hydration mismatch). */
function useClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

const IL = 'Asia/Jerusalem'

/**
 * Scientific header: a dedicated live date + clock line, the "APEX" wordmark with
 * an AXIS-5 era badge, the biomechanical subtitle, and a Last-Updated sync stamp.
 */
export function BrandHeader() {
  const now = useClock()
  const { data: lastUpdated } = useLastUpdated()

  const dateStr = now ? new Intl.DateTimeFormat('en-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: IL }).format(now) : ''
  const timeStr = now ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: IL }).format(now) : ''
  const lu = lastUpdated ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: IL }).format(new Date(lastUpdated)) : null

  return (
    <header className="space-y-1.5">
      {/* Dedicated date + live clock line */}
      <div className="flex items-center justify-between gap-3 text-fluid-xs min-h-[16px]">
        <span className="text-muted-vital tracking-wide">
          {dateStr}{timeStr && <> · <span className="vital-number text-text/80">{timeStr}</span></>}
        </span>
        {lu && (
          <span className="text-muted-vital/70 flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            Updated {lu}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
        <h1 className="flex items-center gap-2.5 text-fluid-3xl leading-none">
          <HelixMark className="h-[0.95em] w-[0.95em] shrink-0" />
          <span className="apex-wordmark font-heading font-extrabold tracking-tight">HELIX</span>
        </h1>
        <span className="font-heading text-fluid-sm font-semibold text-muted-vital uppercase tracking-[0.18em]">Adaptation Systems</span>
        <span
          className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider"
          style={{ color: '#38E1FF', background: '#38E1FF1f', border: '1px solid #38E1FF55', boxShadow: '0 0 10px #38E1FF44' }}
        >
          APEX-5.1
        </span>
      </div>

      <p className="text-fluid-sm text-muted-vital tracking-wide font-medium">Stimulus · Recovery · Adaptation</p>
    </header>
  )
}
