'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { SessionDetail } from '@/lib/hooks/useSessionDetail'
import { useEditSession } from '@/lib/hooks/useEditSession'
import { useDeleteSession, useGlobalSessionNumber } from '@/lib/hooks/useDayVault'
import { getWeekPhase, phaseBadgeStyle } from '@/lib/phases'
import { weekStartOf } from '@/lib/utils/week'
import { activeProgram } from '@/lib/programs'
import { displayWeight, weightUnit, fmtVolume } from '@/lib/utils/units'
import { blurOnTap } from '@/lib/utils/blurOnTap'

const CYAN = '#8E9AAC', VIOLET = '#E0703C', ROSE = '#C4514E', GOLD = '#D4AF37', EMBER = '#D4AF37', TEAL = '#3E9E7A'

/**
 * One metric in the header strip.
 *
 * Was a bordered tile in a `grid-cols-3 sm:grid-cols-6` — two full rows of
 * boxes on a phone for six short numbers, before any training data appeared.
 * Now an inline value + unit on a single scrollable line.
 */
function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 shrink-0">
      <span className="helix-num text-fluid-sm font-bold text-text tabular-nums leading-none">{value}</span>
      <span className="text-[9px] uppercase tracking-wide" style={{ color }}>{label}</span>
    </span>
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

  const program = activeProgram()
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
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
            Session Report{globalNum ? ` · #${String(globalNum).padStart(2, '0')}` : ''}
          </span>
          <h1 className="font-heading text-fluid-lg font-bold text-text leading-tight truncate mt-0.5">
            {label}
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

      {/* ONE row. Horizontally scrollable rather than wrapping, so it can never
          become the two-row block of boxes it was. */}
      <div className="flex items-baseline gap-3.5 overflow-x-auto no-scrollbar rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-2">
        <Stat value={detail.durationMin != null ? `${detail.durationMin}` : '—'} label="min" color={VIOLET} />
        <Stat value={fmtVolume(displayWeight(detail.volumeKg))} label={unit} color={CYAN} />
        <Stat value={`${detail.setCount}`} label="sets" color={ROSE} />
        <Stat value={`${detail.prCount}`} label={detail.prCount === 1 ? 'record' : 'records'} color={GOLD} />
        {detail.avgBpm != null && <Stat value={`${detail.avgBpm}`} label="bpm" color="#E0703C" />}
        {detail.calories != null && <Stat value={`${detail.calories}`} label="kcal" color={EMBER} />}
        {/* Set-type counts join the strip instead of owning a row below it. */}
        {detail.failureSets > 0 && <Stat value={`${detail.failureSets}`} label="to failure" color={ROSE} />}
        {detail.warmupSets > 0 && <Stat value={`${detail.warmupSets}`} label="warm-up" color={TEAL} />}
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
    </section>
  )
}
