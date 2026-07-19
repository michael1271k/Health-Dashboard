'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScanFace, Loader2 } from 'lucide-react'
import { isNative } from '@/lib/native/platform'
import { isBiometricAvailable, isBiometricEnabled, enableBiometricLogin, disableBiometricLogin } from '@/lib/native/biometric'

/** Face ID sign-in toggle (native only). */
export function BiometricCard() {
  const [available, setAvailable] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void isBiometricAvailable().then(setAvailable)
    setEnabled(isBiometricEnabled())
  }, [])

  const toggle = useCallback(async () => {
    setBusy(true); setErr(null)
    try {
      if (enabled) {
        await disableBiometricLogin()
        setEnabled(false)
      } else {
        const ok = await enableBiometricLogin()
        setEnabled(ok)
        if (!ok) setErr('Could not enable Face ID. Try again.')
      }
    } finally { setBusy(false) }
  }, [enabled])

  if (!isNative() || !available) return null

  return (
    <section className="helix-card space-y-3">
      <div className="flex items-center gap-2">
        <ScanFace className="w-4 h-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold text-text">Security</h2>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-text font-medium">Face ID sign-in</div>
          <div className="text-xs text-muted">Unlock HELIX with Face ID instead of your password</div>
        </div>
        <button onClick={toggle} disabled={busy}
          className={`shrink-0 min-h-[40px] px-4 rounded-xl text-sm font-semibold transition-colors
            ${enabled ? 'bg-primary/15 text-primary' : 'btn-primary'}`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : enabled ? 'On · Disable' : 'Enable'}
        </button>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
    </section>
  )
}
