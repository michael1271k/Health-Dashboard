'use client'

import { useEffect, useState } from 'react'
import type { SyncDetail } from '@/components/providers/RealtimeProvider'
import { formatSleep } from '@/lib/utils/format'

const SHOW_MS = 3200

/**
 * Charge Bolt — the app acknowledges a REAL data sync like a device charging.
 * A liquid-glass capsule drops in (translate3d spring); inside, a lightning
 * bolt draws itself (stroke-dashoffset) and blooms teal, while a single charge
 * line sweeps the capsule's bottom edge. Everything animated is
 * transform/opacity/stroke on one small element — no layout, no resident
 * will-change, no per-frame blur. Reduce-motion collapses to a plain fade.
 */
export function SyncPulse() {
  const [detail, setDetail] = useState<SyncDetail | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    let leaveTimer: ReturnType<typeof setTimeout> | null = null
    const onSync = (e: Event) => {
      const d = (e as CustomEvent<SyncDetail>).detail
      if (!d?.tables?.length) return
      setReduceMotion(document.documentElement.dataset.reduceMotion === 'true')
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
  const summary = bits.length ? bits.join(' · ') : 'data synced'

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 z-[90] pointer-events-none"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        transform: leaving ? 'translate3d(-50%, -140%, 0)' : 'translate3d(-50%, 0, 0)',
        opacity: leaving ? 0 : 1,
        transition: 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease',
        animation: reduceMotion ? undefined : 'syncPulseIn 340ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      <div className="relative flex items-center gap-2.5 rounded-2xl pl-3 pr-4 py-2 border overflow-hidden"
        style={{
          background: 'rgba(6, 14, 20, 0.72)',
          backdropFilter: 'blur(18px) saturate(160%)',   // static layer — never animated itself
          WebkitBackdropFilter: 'blur(18px) saturate(160%)',
          borderColor: '#8B5CF655',
          boxShadow: '0 10px 32px rgba(0,0,0,0.55), 0 0 20px #8B5CF626, inset 0 1px 0 rgba(255,255,255,0.07)',
        }}>
        {/* The bolt draws itself, then blooms */}
        <svg width="16" height="20" viewBox="0 0 12 16" fill="none" aria-hidden="true" className="shrink-0">
          <path d="M7 1 L2 9 H5.5 L4.5 15 L10 6.5 H6.5 Z"
            stroke="#8B5CF6" strokeWidth="1.4" strokeLinejoin="round"
            className={reduceMotion ? undefined : 'charge-bolt-draw'}
            style={{ filter: 'drop-shadow(0 0 5px #8B5CF688)' }} />
        </svg>
        <span className="text-fluid-xs font-medium text-text whitespace-nowrap">
          <span className="helix-num" style={{ color: '#8B5CF6' }}>{summary}</span>
        </span>
        {/* One charge-line sweep along the bottom edge (translate3d only) */}
        {!reduceMotion && (
          <span aria-hidden="true" className="charge-line absolute bottom-0 left-0 h-[2px] w-full" />
        )}
      </div>
    </div>
  )
}
