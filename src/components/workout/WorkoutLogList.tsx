'use client'

import { Trash2 } from 'lucide-react'
import type { WorkoutSessionRow } from '@/lib/hooks/useWorkoutHistory'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'

function Badge({ label, value, accent }: { label: string; value: string | null; accent: string }) {
  const missing = value == null
  return (
    <div className="flex flex-col items-center px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.05] min-w-[50px]">
      <span className="helix-num text-fluid-sm font-bold leading-none" style={{ color: missing ? '#5A6B85' : accent }}>{missing ? '—' : value}</span>
      <span className="text-[9px] text-muted uppercase tracking-wide mt-0.5">{label}</span>
    </div>
  )
}

/** Dense workout-history cards — date + split tag + Volume/Sets/Avg-BPM badges. */
export function WorkoutLogList({ sessions, isLoading, onDelete, emptyMessage }: {
  sessions: WorkoutSessionRow[]
  isLoading?: boolean
  onDelete: (s: WorkoutSessionRow) => void
  emptyMessage: string
}) {
  const unit = useUnitSystem()
  if (isLoading) {
    return <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-surface-2/60 animate-pulse" />)}</div>
  }
  if (!sessions.length) {
    return <div className="glass-card p-8 text-center text-muted text-fluid-sm">{emptyMessage}</div>
  }

  return (
    <div className="space-y-2">
      {sessions.map((s) => {
        const d = new Date(s.startedAt)
        const allMissing = s.totalVolumeKg == null && s.setCount == null && s.avgBpm == null
        return (
          <div key={s.id} className="glass-card px-3 py-2.5 flex items-center gap-3">
            <div className="w-11 shrink-0">
              <div className="text-fluid-xs font-semibold text-text leading-none">{d.toLocaleDateString('en-IL', { day: 'numeric', month: 'short' })}</div>
              <div className="text-[9px] text-muted leading-none mt-0.5">{d.toLocaleDateString('en-IL', { weekday: 'short' })}</div>
            </div>
            <span className="split-label text-fluid-sm font-bold w-14 shrink-0" style={{ color: s.splitColor }}>{s.splitLabel}</span>
            <div className="flex-1 flex items-center gap-1.5 justify-end">
              {allMissing ? (
                <span className="text-fluid-xs text-muted italic px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]" dir="auto">ימולא בהמשך · to be filled</span>
              ) : (
                <>
                  <Badge label="Vol" value={s.totalVolumeKg != null ? `${(displayWeight(s.totalVolumeKg)! / 1000).toFixed(1)}${unit === 'lb' ? 'k' : 't'}` : null} accent="#19E3B1" />
                  <Badge label="Sets" value={s.setCount != null ? `${s.setCount}` : null} accent="#38E1FF" />
                  <Badge label="BPM" value={s.avgBpm != null ? `${s.avgBpm}` : null} accent="#FF8A3D" />
                </>
              )}
            </div>
            <button onClick={() => onDelete(s)} className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 shrink-0" aria-label="Delete session">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
