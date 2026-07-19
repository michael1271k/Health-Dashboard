'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, Check, Loader2, RefreshCw } from 'lucide-react'
import { isNative } from '@/lib/native/platform'
import { requestHealthAuthorization, isHealthKitAvailable } from '@/lib/native/healthkit'
import { isHelixAuthAvailable } from '@/lib/native/biometric'
import { forceHealthKitSync } from '@/lib/native/sync'

const WATERMARK_KEY = 'helix_hk_last_sync'

function lastSyncLabel(): string | null {
  try {
    const t = Number(localStorage.getItem(WATERMARK_KEY) ?? 0)
    if (!t) return null
    const mins = Math.round((Date.now() - t) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min ago`
    const hrs = Math.round(mins / 60)
    return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`
  } catch { return null }
}

/**
 * Apple Health connect + manual sync (native only). Re-requests read
 * authorization (safe to call repeatedly — iOS only re-prompts for types the
 * user hasn't decided) and forces an immediate HealthKit pull.
 */
export function HealthSyncCard() {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [last, setLast] = useState<string | null>(null)
  // Live bridge status — surfaces a missing native registration on-device
  // instead of it being a silent no-op (both plugins failed exactly this way).
  const [diag, setDiag] = useState<{ hk: boolean; auth: boolean } | null>(null)

  useEffect(() => {
    setLast(lastSyncLabel())
    setDiag({ hk: isHealthKitAvailable(), auth: isHelixAuthAvailable() })
  }, [])

  const connect = useCallback(async () => {
    setBusy(true); setDone(false)
    try {
      await requestHealthAuthorization()
      await forceHealthKitSync()
      setDone(true)
      setLast(lastSyncLabel())
      setTimeout(() => setDone(false), 2000)
    } finally { setBusy(false) }
  }, [])

  if (!isNative()) return null

  return (
    <section className="helix-card space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold text-text">Apple Health</h2>
      </div>
      <p className="text-xs text-muted">
        HELIX reads activity, vitals, sleep and nutrition (calories &amp; macros) from Apple Health.
        Data also refreshes automatically when the app opens and on pull-to-refresh.
      </p>
      <button onClick={connect} disabled={busy} className="btn-primary w-full justify-center min-h-[44px]">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <Check className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
        {busy ? 'Syncing…' : done ? 'Synced' : 'Connect & Sync Now'}
      </button>
      {last && <p className="text-[11px] text-muted text-center">Last sync: {last}</p>}
      {diag && (
        <div className="pt-1 border-t border-border/60 flex items-center justify-center gap-4 text-[11px] font-mono">
          <span className={diag.hk ? 'text-success' : 'text-danger'}>{diag.hk ? '●' : '○'} HealthKit</span>
          <span className={diag.auth ? 'text-success' : 'text-danger'}>{diag.auth ? '●' : '○'} Face ID</span>
        </div>
      )}
    </section>
  )
}
