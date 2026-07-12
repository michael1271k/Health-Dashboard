'use client'

import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import type { SyncDetail } from '@/components/providers/RealtimeProvider'
import { formatSleep } from '@/lib/utils/format'

const SHOW_MS = 3500

/**
 * Sync Pulse — the app acknowledges a live data sync like a native companion
 * device. When realtime lands a Shortcut push, a bioluminescent glass chip
 * slides in from the top with the freshest values, then dissolves. One toast
 * per debounce window; reduce-motion collapses the slide to a fade.
 */
export function SyncPulse() {
  const [detail, setDetail] = useState<SyncDetail | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    let leaveTimer: ReturnType<typeof setTimeout> | null = null
    const onSync = (e: Event) => {
      const d = (e as CustomEvent<SyncDetail>).detail
      if (!d?.tables?.length) return
      setLeaving(false)
      setDetail(d)
      if (hideTimer) clearTimeout(hideTimer)
      if (leaveTimer) clearTimeout(leaveTimer)
      hideTimer = setTimeout(() => {
        setLeaving(true)
        leaveTimer = setTimeout(() => setDetail(null), 260)
      }, SHOW_MS)
    }
    window.addEventListener('helix-sync', onSync)
    return () => {
      window.removeEventListener('helix-sync', onSync)
      if (hideTimer) clearTimeout(hideTimer)
      if (leaveTimer) clearTimeout(leaveTimer)
    }
  }, [])

  if (!detail) return null

  const bits: string[] = []
  if (detail.steps != null) bits.push(`${detail.steps.toLocaleString()} steps`)
  if (detail.sleepMinutes != null && detail.sleepMinutes > 0) bits.push(`${formatSleep(detail.sleepMinutes)} sleep`)
  if (detail.calories != null) bits.push(`${Math.round(detail.calories).toLocaleString()} kcal`)
  const summary = bits.length ? bits.join(' · ') : `${detail.tables.length} update${detail.tables.length > 1 ? 's' : ''} synced`

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 z-[90] pointer-events-none"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        // translate3d keeps the whole entrance on the compositor.
        transform: leaving
          ? 'translate3d(-50%, -140%, 0)'
          : 'translate3d(-50%, 0, 0)',
        opacity: leaving ? 0 : 1,
        transition: 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease',
        animation: 'syncPulseIn 320ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      <div className="flex items-center gap-2 rounded-2xl px-3.5 py-2 border"
        style={{
          background: 'rgba(6, 14, 20, 0.88)',
          borderColor: '#16F5C355',
          boxShadow: '0 8px 28px rgba(0,0,0,0.5), 0 0 18px #16F5C333',
        }}>
        <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: '#16F5C3' }} aria-hidden="true" />
        <span className="text-fluid-xs font-medium text-text whitespace-nowrap">
          Synced <span className="helix-num" style={{ color: '#16F5C3' }}>{summary}</span>
        </span>
      </div>
    </div>
  )
}
