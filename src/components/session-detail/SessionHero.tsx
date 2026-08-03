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
import { dayColor } from '@/lib/theme/palette'
import { displayWeight, weightUnit, fmtVolume } from '@/lib/utils/units'
import { blurOnTap } from '@/lib/utils/blurOnTap'

const CYAN = '#8E9AAC', VIOLET = '#E0703C', ROSE = '#C4514E', GOLD = '#D4AF37', EMBER = '#D4AF37', TEAL = '#3E9E7A'

/**
 * A HEADLINE metric — duration, volume, records.
 *
 * These three answer "what was this session", and they used to be the same 13px
 * as "warm-up sets" in one undifferentiated scroll strip. Given their own row at
 * display size, they read before anything else does; the value stays on the
 * neutral text colour and the LABEL carries the accent, so three big numbers
 * side by side don't turn into three competing colours.
 */
function Headline({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
      <span className="helix-num text-fluid-xl font-extrabold text-text tabular-nums leading-none truncate">{value}</span>
      <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color }}>{label}</span>
    </div>
  )
}

/**
 * One metric in the secondary strip — heart rate, calories, difficulty, set
 * composition. Scrolls horizontally rather than wrapping, so it can never
 * become the two-row block of boxes it started as.
 */
function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 shrink-0">
      <span className="helix-num text-fluid-base font-bold text-text tabular-nums leading-none">{value}</span>
      <span className="text-[10px] uppercase tracking-wide" style={{ color }}>{label}</span>
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
  const accent = dayColor(detail.dayKey, detail.splitDay)
  const unit = weightUnit()
  const pretty = new Date(detail.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })

  return (
    <section className="helix-card holo-sheen space-y-3" style={{ borderColor: `${accent}33`, boxShadow: `0 0 24px ${accent}14` }}>
      <div className="flex items-start gap-3">
        <button onClick={() => router.back()} onPointerUp={blurOnTap} className="btn-glass shrink-0 min-h-[40px]" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
            Session Report{globalNum ? ` · #${String(globalNum).padStart(2, '0')}` : ''}
          </span>
          {/* The workout's own colour, globally assigned per day key (DAY_COLOR).
              Upper A is always steel, Legs & Core B always emerald — so the
              report identifies itself before the title is read. */}
          <h1 className="font-heading text-fluid-lg font-bold leading-tight truncate mt-0.5" style={{ color: accent }}>
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

      {/* TWO tiers, not one flat strip.
          Tier 1 — what the session WAS: time, tonnage, records. Fixed three-up,
          display size, no scroll: these must never be the thing you swipe to
          reach. Tier 2 — how it went and what it was made of. */}
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-2.5 space-y-2.5">
        <div className="flex items-start gap-3">
          <Headline value={detail.durationMin != null ? `${detail.durationMin}′` : '—'} label="Duration" color={VIOLET} />
          <span className="w-px self-stretch bg-white/[0.07]" aria-hidden="true" />
          <Headline value={fmtVolume(displayWeight(detail.volumeKg))} label={`Volume ${unit}`} color={CYAN} />
          <span className="w-px self-stretch bg-white/[0.07]" aria-hidden="true" />
          <Headline value={`${detail.prCount}`} label={detail.prCount === 1 ? 'Record' : 'Records'} color={GOLD} />
        </div>
        <div className="flex items-baseline gap-4 overflow-x-auto no-scrollbar border-t border-white/[0.06] pt-2">
          {detail.avgBpm != null && <Stat value={`${detail.avgBpm}`} label="bpm" color="#E0703C" />}
          {detail.calories != null && <Stat value={`${detail.calories}`} label="kcal" color={EMBER} />}
          {/* Session difficulty as logged on the commit bar — /10 so it reads as
              a scale rather than a count sitting beside "18 sets". */}
          {detail.sessionRpe != null && <Stat value={`${detail.sessionRpe}/10`} label="difficulty" color={VIOLET} />}
          <Stat value={`${detail.setCount}`} label="sets" color={CYAN} />
          {detail.failureSets > 0 && <Stat value={`${detail.failureSets}`} label="to failure" color={ROSE} />}
          {detail.warmupSets > 0 && <Stat value={`${detail.warmupSets}`} label="warm-up" color={TEAL} />}
        </div>
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
