'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { SessionDetail } from '@/lib/hooks/useSessionDetail'
import { useEditSession } from '@/lib/hooks/useEditSession'
import { useDeleteSession, useGlobalSessionNumber } from '@/lib/hooks/useDayVault'
import { getWeekPhase, phaseBadgeStyle } from '@/lib/phases'
import { weekStartOf } from '@/lib/utils/week'
import { PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId } from '@/lib/programs'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { blurOnTap } from '@/lib/utils/blurOnTap'

const CYAN = '#22D3EE', VIOLET = '#8B5CF6', ROSE = '#FB7185', GOLD = '#F5C15A', EMBER = '#FBBF24', TEAL = '#34D399'

function StatTile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-1.5 py-2 text-center">
      <span className="helix-num block text-fluid-sm font-bold text-text leading-tight tabular-nums">{value}</span>
      <span className="text-[8px] uppercase tracking-wide" style={{ color }}>{label}</span>
    </div>
  )
}

/**
 * Deep-dive header: session identity (program-day label · date · phase badge ·
 * "Session #N"), a six-tile at-a-glance stat grid, and the Edit / Delete
 * actions. Edit routes through the same commit → global-update cascade; Delete
 * removes only this session + its sets, then navigates back.
 */
export function SessionHero({ detail }: { detail: SessionDetail }) {
  const router = useRouter()
  const edit = useEditSession()
  const del = useDeleteSession(detail.date)
  const { data: globalNum } = useGlobalSessionNumber(detail.date)
  const [confirm, setConfirm] = useState(false)

  const program = PROGRAMS[getActiveProgramId()] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
  const label = (detail.dayKey && program.days.find((d) => d.key === detail.dayKey)?.label)
    ?? (detail.splitDay[0].toUpperCase() + detail.splitDay.slice(1))
  const phase = getWeekPhase(weekStartOf(detail.date))
  const unit = weightUnit()
  const pretty = new Date(detail.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })

  return (
    <section className="helix-card holo-sheen space-y-3" style={{ borderColor: `${CYAN}33`, boxShadow: `0 0 24px ${CYAN}14` }}>
      <div className="flex items-start gap-3">
        <button onClick={() => router.back()} onPointerUp={blurOnTap} className="btn-glass shrink-0 min-h-[40px]" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-fluid-lg font-bold text-text leading-tight truncate">
            {label}{globalNum ? <span className="text-muted font-semibold"> · Session #{globalNum}</span> : null}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-fluid-xs text-muted">{pretty}</span>
            {phase && (
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={phaseBadgeStyle(phase.kind, false, phase.era)}>{phase.eraTag}</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <StatTile value={detail.durationMin != null ? `${detail.durationMin}m` : '—'} label="Duration" color={VIOLET} />
        <StatTile value={`${Math.round(displayWeight(detail.volumeKg) ?? 0).toLocaleString()}`} label={`Vol ${unit}`} color={CYAN} />
        <StatTile value={`${detail.setCount}`} label="Sets" color={ROSE} />
        <StatTile value={`${detail.prCount}`} label="PRs" color={GOLD} />
        <StatTile value={detail.avgBpm != null ? `${detail.avgBpm}` : '—'} label="Avg BPM" color="#FF9F7A" />
        <StatTile value={detail.calories != null ? `${detail.calories}` : '—'} label="kcal" color={EMBER} />
      </div>

      {confirm ? (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-fluid-xs text-muted flex-1 min-w-[140px]">Delete this workout? Your nutrition, sleep &amp; weight for the day stay.</span>
          <button type="button" onClick={() => setConfirm(false)} onPointerUp={blurOnTap} className="btn-glass min-h-[38px] text-fluid-xs">Cancel</button>
          <button type="button" disabled={del.isPending}
            onClick={() => del.mutate(detail.id, { onSuccess: () => router.back() })}
            className="min-h-[38px] px-3.5 rounded-lg text-fluid-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ color: '#fff', background: ROSE, boxShadow: `0 0 16px ${ROSE}55` }}>
            {del.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
            Delete
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-1">
          <button type="button" disabled={edit.loading} onClick={() => edit.load(detail.id)} onPointerUp={blurOnTap}
            className="btn-glass min-h-[40px] text-fluid-xs justify-center flex-1" style={{ color: CYAN }}>
            {edit.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
            Edit Workout
          </button>
          <button type="button" onClick={() => setConfirm(true)} onPointerUp={blurOnTap} aria-label="Delete workout"
            className="min-h-[40px] px-3.5 rounded-lg text-fluid-xs font-bold inline-flex items-center gap-1.5 justify-center"
            style={{ color: ROSE, background: `${ROSE}1a`, border: `1px solid ${ROSE}55` }}>
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {(detail.failureSets > 0 || detail.warmupSets > 0) && (
        <div className="flex items-center gap-3 text-[10px] text-muted pt-0.5">
          {detail.failureSets > 0 && <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: ROSE }} />{detail.failureSets} to failure</span>}
          {detail.warmupSets > 0 && <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: TEAL }} />{detail.warmupSets} warm-up</span>}
        </div>
      )}
    </section>
  )
}
