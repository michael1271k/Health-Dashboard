'use client'

import { useEffect, useState } from 'react'
import { Zone, ZoneRow } from '@/components/ui/Zone'
import { OXIDE } from '@/lib/theme/palette'

/** Flight-recorder readout: the last captured crash, if any, for diagnosis. */
export function CrashRecorderRow() {
  const [crash, setCrash] = useState<{ message: string; buildId: string; at: string } | null>(null)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('helix_last_crash')
      if (raw) setCrash(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])
  if (!crash) return null
  return (
    <Zone label="Diagnostics" accent={OXIDE}>
      <ZoneRow divide={false} className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-fluid-sm text-text font-medium">Last recorded crash</span>
          <button onClick={() => { try { localStorage.removeItem('helix_last_crash') } catch { /* ignore */ } setCrash(null) }}
            className="hit-44 text-fluid-xs text-muted hover:text-text min-h-[32px]">clear</button>
        </div>
        <p className="text-[11px] font-mono text-muted break-words">
          {new Date(crash.at).toLocaleString('en-GB')} · build {crash.buildId.slice(0, 10)}<br />{crash.message}
        </p>
      </ZoneRow>
    </Zone>
  )
}
