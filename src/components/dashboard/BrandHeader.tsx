'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
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

/**
 * HELIX header — one clean brand line (mark optically centered with the cap
 * height) + a live device-local date/clock line and a 24h "Updated" stamp.
 * No hardcoded timezone: everything renders in the user's actual local time.
 */
export function BrandHeader() {
  const now = useClock()
  const { data: lastUpdated } = useLastUpdated()

  const dateStr = now ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now) : ''
  const timeStr = now ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now) : ''
  const lu = lastUpdated ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(lastUpdated)) : null

  return (
    <header className="space-y-2">
      {/* Dedicated device-local date + live clock line */}
      <div className="flex items-center justify-between gap-3 text-fluid-xs min-h-[16px]">
        <span className="text-muted tracking-wide">
          {dateStr}{timeStr && <> · <span className="helix-num text-text/80">{timeStr}</span></>}
        </span>
        {lu && (
          <span className="text-muted/70 flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            Updated <span className="helix-num">{lu}</span>
          </span>
        )}
      </div>

      {/* One clean brand line — mark sized to the cap height, nudged UP a few
          px for true optical alignment with the wordmark's cap line. */}
      <div className="flex items-center gap-x-3 flex-wrap">
        <h1 className="flex items-center gap-2.5 text-fluid-3xl leading-none">
          <Image src="/icon-192.png" width={32} height={32} alt="" priority
            className="h-[0.9em] w-[0.9em] shrink-0 rounded-[0.28em] -translate-y-[0.03em] ring-1 ring-white/10" />
          <span className="helix-wordmark font-heading font-extrabold tracking-tight leading-none">HELIX</span>
        </h1>
        <span
          className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider self-center"
          style={{ color: '#22D3EE', background: '#22D3EE1f', border: '1px solid #22D3EE55', boxShadow: '0 0 10px #22D3EE44' }}
        >
          HELIX-5
        </span>
      </div>
    </header>
  )
}
