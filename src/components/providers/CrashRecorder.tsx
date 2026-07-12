'use client'

import { useEffect } from 'react'

/**
 * Global flight recorder: every uncaught error and unhandled rejection is
 * persisted (message + stack + build + time) so a crash report is a diagnosis,
 * not a guess. Settings surfaces the last record. Never throws itself.
 */
export function CrashRecorder() {
  useEffect(() => {
    const record = (message: string, stack?: string | null) => {
      try {
        localStorage.setItem('helix_last_crash', JSON.stringify({
          message: message.slice(0, 500),
          stack: stack?.slice(0, 2000) ?? null,
          buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown',
          at: new Date().toISOString(),
        }))
      } catch { /* storage full/blocked — nothing to do */ }
    }
    const onError = (e: ErrorEvent) => record(e.message ?? 'unknown error', e.error?.stack)
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason
      record(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : null)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
