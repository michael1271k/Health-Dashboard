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
import { Surface, StatStrip } from '@/components/ui/Zone'

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
 * One metric in the secondary strip — heart rate, calories, difficulty, set
 * composition. Scrolls horizontally rather than wrapping, so it can never
 * become the two-row block of boxes it started as.
 */
function Stat({ value, label, color, estimated }: {
  value: string; label: string; color: string
  /** Derived by formula rather than measured — see `sessions/estimates.ts`. */
  estimated?: boolean
}) {
  return (
    <span className="inline-flex items-baseline gap-1 shrink-0">
      <span className="helix-num text-fluid-base font-bold text-text tabular-nums leading-none">{value}</span>
      <span className="text-[10px] uppercase tracking-wide" style={{ color }}>{label}</span>
      {/* The value keeps its own colour — an estimate is still your best figure
          and is counted at full weight everywhere. What it must not do is pass
          for a measurement, so the provenance is stated rather than implied. */}
      {estimated && (
        <span
          className="text-[9px] uppercase tracking-wide text-muted"
          title="Calculated by formula — no watch data for this session"
        >
          calc
        </span>
      )}
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
    <Surface variant="band" accent={accent} pad="snug" className="space-y-2.5">
      {/* IDENTITY LIVES IN THE STICKY COMMAND BAR, not here.
          The page went full-bleed and grew a pinned header carrying the back
          button, the day label in its own colour, the date and the phase badge.
          Repeating all four inside a card 60 px below it read as a rendering
          bug, so the header keeps only what the bar has no room for: which
          session this is in the global count. */}
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
          Session{globalNum ? ` · #${String(globalNum).padStart(2, '0')}` : ''}
        </span>
        <span className="text-fluid-xs text-muted ml-auto truncate">{pretty}</span>
      </div>

      {/* ── ONE STRIP, NOT A FRAME INSIDE A FRAME ──
          This was a rounded, bordered, tinted box nested inside the rounded,
          bordered, tinted card that already surrounded it — chrome inside
          chrome, which is most of what made this page feel grandiose. Inside it,
          three `text-fluid-xl` headlines separated by `w-px` rules took a full
          display row to say four short numbers.

          A StatStrip says the same four in one scrolling line, and the second
          line carries the composition. The hierarchy that the display size was
          buying is now carried by ORDER — what the session was, then what it was
          made of — which is cheaper and survives a narrow screen. */}
      <StatStrip stats={[
        { label: 'Duration', value: detail.durationMin != null ? `${detail.durationMin}′` : null, color: EMBER },
        { label: `Volume ${unit}`, value: fmtVolume(displayWeight(detail.volumeKg)), color: STEEL },
        ...(detail.sessionRpe != null
          ? [{ label: 'Difficulty', value: `${detail.sessionRpe}/10`, color: EMBER }] : []),
        { label: 'Sets', value: `${detail.setCount}`, color: STEEL },
        ...(detail.prCount > 0
          ? [{ label: detail.prCount === 1 ? 'Record' : 'Records', value: `${detail.prCount}`, color: GOLD }] : []),
      ]} />

      <div className="flex items-baseline gap-4 overflow-x-auto no-scrollbar">
        {detail.avgBpm != null && <Stat value={`${detail.avgBpm}`} label="bpm" color={EMBER} estimated={detail.avgBpmEstimated} />}
        {/* Calories take the app-wide calorie hue, not the record hue. */}
        {detail.calories != null && <Stat value={`${detail.calories}`} label="kcal" color={MACRO.calories} estimated={detail.caloriesEstimated} />}
        {detail.failureSets > 0 && <Stat value={`${detail.failureSets}`} label="to failure" color={OXIDE} />}
        {detail.warmupSets > 0 && <Stat value={`${detail.warmupSets}`} label="warm-up" color={EMERALD} />}
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
    </Surface>
  )
}
