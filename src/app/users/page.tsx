'use client'

import { Users, Dumbbell, Flame, BatteryMedium } from 'lucide-react'
import { useUserDirectory, type ManagedUser } from '@/lib/hooks/useUserDirectory'
import { displayWeight, useUnitSystem } from '@/lib/utils/units'

function scoreColor(score: number | null): string {
  if (score == null) return '#8B97B2'
  if (score >= 80) return '#8B5CF6'
  if (score >= 60) return '#22D3EE'
  if (score >= 40) return '#FBBF24'
  return '#FB7185'
}

function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return <span className="text-fluid-xs text-muted">—</span>
  const min = Math.min(...points), max = Math.max(...points)
  const norm = (v: number) => (max === min ? 0.5 : (v - min) / (max - min))
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i / (points.length - 1)) * 72} ${18 - norm(p) * 16}`).join(' ')
  return (
    <svg width="72" height="20" viewBox="0 0 72 20" aria-hidden="true">
      <path d={d} fill="none" stroke="#8B5CF6" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function MemberCard({ m, unit }: { m: ManagedUser; unit: string }) {
  const color = scoreColor(m.score)
  return (
    <section className="helix-card space-y-3" style={{ borderColor: `${color}30` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}66` }} aria-hidden="true" />
          <h2 className="font-heading font-semibold text-text truncate">{m.displayName}</h2>
          {m.isSelf && <span className="text-[9px] uppercase tracking-wide text-muted shrink-0">you</span>}
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 rounded shrink-0"
          style={m.role === 'admin'
            ? { color: '#8B5CF6', background: '#8B5CF61a', border: '1px solid #8B5CF640' }
            : { color: '#8B97B2', background: '#8B97B21a', border: '1px solid #8B97B240' }}>
          {m.role}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 text-center">
        <div>
          <span className="helix-num text-fluid-lg font-bold" style={{ color }}>{m.score ?? '—'}</span>
          <span className="block text-[9px] uppercase tracking-wide text-muted">score</span>
        </div>
        <div>
          <span className="helix-num text-fluid-lg font-bold text-text flex items-center justify-center gap-1">
            <BatteryMedium className="w-3.5 h-3.5 text-info" aria-hidden="true" />{m.batteryPct != null ? `${m.batteryPct}%` : '—'}
          </span>
          <span className="block text-[9px] uppercase tracking-wide text-muted">battery</span>
        </div>
        <div>
          <span className="helix-num text-fluid-lg font-bold text-text flex items-center justify-center gap-1">
            <Flame className="w-3.5 h-3.5 text-warn" aria-hidden="true" />{m.trioStreak}
          </span>
          <span className="block text-[9px] uppercase tracking-wide text-muted">day streak</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-fluid-xs text-muted">
        <span className="flex items-center gap-1.5 min-w-0 truncate">
          <Dumbbell className="w-3 h-3 shrink-0" />
          {m.lastSession
            ? `${m.lastSession.split[0]?.toUpperCase()}${m.lastSession.split.slice(1)} · ${new Date(m.lastSession.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${m.lastSession.volumeKg != null ? ` · ${((displayWeight(m.lastSession.volumeKg) ?? 0) / 1000).toFixed(1)}${unit === 'lb' ? 'k' : 't'}` : ''}`
            : 'no sessions yet'}
        </span>
        <Spark points={m.weightSpark} />
      </div>
    </section>
  )
}

/**
 * User Management — every managed account at a glance. Access control is
 * layered: RLS guarantees non-admins can never READ other users' rows, and the
 * page itself renders an access notice for non-admin roles.
 */
export default function UserManagementPage() {
  const { data, isLoading, error } = useUserDirectory()
  const unit = useUnitSystem()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" aria-hidden="true" /> User Management
        </h1>
        <p className="text-muted text-fluid-sm mt-0.5">Every managed account · one isolated vault each</p>
      </div>

      {isLoading && <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="helix-card h-36 animate-pulse" />)}</div>}
      {error && <div className="helix-card border-danger/40"><p className="text-danger text-fluid-sm">{(error as Error).message}</p></div>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.members.map((m) => <MemberCard key={m.userId} m={m} unit={unit} />)}
          </div>
          {!data.isAdmin && (
            <p className="text-fluid-xs text-muted">Administrator access required — you can only see your own account here.</p>
          )}
        </>
      )}
    </div>
  )
}
