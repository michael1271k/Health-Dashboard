'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Loader2 } from 'lucide-react'
import type { SessionDetail } from '@/lib/hooks/useSessionDetail'
import { useEditSession } from '@/lib/hooks/useEditSession'
import { useDeleteSession, useGlobalSessionNumber } from '@/lib/hooks/useDayVault'
import { dayColor, STEEL, EMBER, OXIDE, GOLD, EMERALD, MACRO } from '@/lib/theme/palette'
import { displayWeight, weightUnit, fmtVolume } from '@/lib/utils/units'
import { blurOnTap } from '@/lib/utils/blurOnTap'

/*
 * This file used to open with six local constants, four of which named a colour
 * they did not hold:
 *
 *   CYAN   = '#8E9AAC'  → STEEL      ROSE = '#C4514E'  → OXIDE
 *   VIOLET = '#E0703C'  → EMBER      TEAL = '#3E9E7A'  → EMERALD
 *   EMBER  = '#D4AF37'  → GOLD, i.e. an exact duplicate of the GOLD beside it
 *
 * That last one was not just a bad name. The kcal stat imported `EMBER` and got
 * record-gold, so a session's calorie figure rendered in the one hue V2 reserved
 * for "this is a personal record". Nobody could see it, because the constant
 * said ember. Values are otherwise unchanged — this is a naming fix, and any
 * actual repaint belongs to the palette phase.
 */

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

  // The day label and the phase badge moved to the page's sticky command bar;
  // only the ACCENT is still read here, to tint the card's border and glow.
  const accent = dayColor(detail.dayKey, detail.splitDay)
  const unit = weightUnit()
  const pretty = new Date(detail.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 space-y-3" style={{ borderColor: `${accent}33`, boxShadow: `0 0 24px ${accent}14` }}>
      {/* IDENTITY LIVES IN THE STICKY COMMAND BAR, not here.
          The page went full-bleed and grew a pinned header carrying the back
          button, the day label in its own colour, the date and the phase badge.
          Repeating all four inside a card 60 px below it read as a rendering
          bug, so the hero keeps only what the bar has no room for: which
          session this is in the global count. */}
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
          Session{globalNum ? ` · #${String(globalNum).padStart(2, '0')}` : ''}
        </span>
        <span className="text-fluid-xs text-muted ml-auto truncate">{pretty}</span>
      </div>

      {/* TWO tiers, not one flat strip.
          Tier 1 — what the session WAS: time, tonnage, records. Fixed three-up,
          display size, no scroll: these must never be the thing you swipe to
          reach. Tier 2 — how it went and what it was made of. */}
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-2.5 space-y-2.5">
        <div className="flex items-start gap-3">
          <Headline value={detail.durationMin != null ? `${detail.durationMin}′` : '—'} label="Duration" color={EMBER} />
          <span className="w-px self-stretch bg-white/[0.07]" aria-hidden="true" />
          <Headline value={fmtVolume(displayWeight(detail.volumeKg))} label={`Volume ${unit}`} color={STEEL} />
          <span className="w-px self-stretch bg-white/[0.07]" aria-hidden="true" />
          <Headline value={`${detail.prCount}`} label={detail.prCount === 1 ? 'Record' : 'Records'} color={GOLD} />
        </div>
        <div className="flex items-baseline gap-4 overflow-x-auto no-scrollbar border-t border-white/[0.06] pt-2">
          {detail.avgBpm != null && <Stat value={`${detail.avgBpm}`} label="bpm" color={EMBER} />}
          {/* Calories take the app-wide calorie hue, not the record hue. */}
          {detail.calories != null && <Stat value={`${detail.calories}`} label="kcal" color={MACRO.calories} />}
          {/* Session difficulty as logged on the commit bar — /10 so it reads as
              a scale rather than a count sitting beside "18 sets". */}
          {detail.sessionRpe != null && <Stat value={`${detail.sessionRpe}/10`} label="difficulty" color={EMBER} />}
          <Stat value={`${detail.setCount}`} label="sets" color={STEEL} />
          {detail.failureSets > 0 && <Stat value={`${detail.failureSets}`} label="to failure" color={OXIDE} />}
          {detail.warmupSets > 0 && <Stat value={`${detail.warmupSets}`} label="warm-up" color={EMERALD} />}
        </div>
      </div>

      {confirm ? (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-fluid-xs text-muted flex-1 min-w-[140px]">Delete this workout? Your nutrition, sleep &amp; weight for the day stay.</span>
          <button type="button" onClick={() => setConfirm(false)} onPointerUp={blurOnTap} className="btn-glass min-h-[38px] text-fluid-xs">Cancel</button>
          <button type="button" disabled={del.isPending}
            onClick={() => del.mutate(detail.id, { onSuccess: () => router.back() })}
            className="min-h-[38px] px-3.5 rounded-lg text-fluid-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ color: '#fff', background: OXIDE, boxShadow: `0 0 16px ${OXIDE}55` }}>
            {del.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
            Delete
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-1">
          <button type="button" disabled={edit.loading} onClick={() => edit.load(detail.id)} onPointerUp={blurOnTap}
            className="btn-glass min-h-[40px] text-fluid-xs justify-center flex-1" style={{ color: STEEL }}>
            {edit.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
            Edit Workout
          </button>
          <button type="button" onClick={() => setConfirm(true)} onPointerUp={blurOnTap} aria-label="Delete workout"
            className="min-h-[40px] px-3.5 rounded-lg text-fluid-xs font-bold inline-flex items-center gap-1.5 justify-center"
            style={{ color: OXIDE, background: `${OXIDE}1a`, border: `1px solid ${OXIDE}55` }}>
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  )
}
