'use client'

import { useState } from 'react'
import { ChevronDown, Dumbbell, Plus, Clock, Flame, HeartPulse, Layers, Trophy, Check } from 'lucide-react'
import type { Tables } from '@/lib/supabase/types'
import type { ScheduleDay } from '@/lib/programs'
import { PPL_SPLITS, type SplitDay } from '@/lib/types/workout'
import { displayWeight, fmtVolume, weightUnit } from '@/lib/utils/units'
import { EMERALD, EMBER, SAPPHIRE, GOLD, AMETHYST, OXIDE, MUTED, HAIRLINE } from '@/lib/theme/palette'

type Session = Tables<'workout_sessions'>

/** One inline metric in the completed-session ribbon — icon + value, no box. */
function Vital({ icon: Icon, value, unit, color }: {
  icon: typeof Clock; value: string | number | null; unit?: string; color: string
}) {
  if (value == null) return null
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} aria-hidden="true" />
      <span className="helix-num text-fluid-sm font-bold text-text leading-none">
        {value}{unit && <span className="text-[9px] text-muted font-normal ml-0.5">{unit}</span>}
      </span>
    </span>
  )
}

/**
 * The completed-session hero — shown permanently once today is logged, no expand.
 *
 * Volume is the centrepiece (a big kinetic number over a filled progress arc of
 * the day's split colour), the vitals ride a single inline ribbon, and PRs light
 * up as gold chips. The old design was a hidden 3×2 grid of identical squares
 * behind a chevron — you had to tap to see that you'd trained at all.
 */
function CompletedHero({ session, accent }: { session: Session; accent: string }) {
  const unit = weightUnit()
  const split = PPL_SPLITS[session.split_day as SplitDay]
  const volume = session.total_volume_kg != null ? fmtVolume(displayWeight(session.total_volume_kg)) : null
  const prCount = session.pr_count ?? 0

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${accent}3d`, background: `linear-gradient(158deg, ${accent}18 0%, ${accent}08 44%, transparent)` }}>
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${accent}22`, color: accent }}>
            <Check className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-wide" style={{ color: accent }}>Completed today</span>
            <span className="split-label block font-bold text-fluid-base truncate text-text">
              {split?.label ?? session.split_day}
            </span>
          </div>
          {prCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full shrink-0"
              style={{ color: GOLD, background: `${GOLD}18`, border: `1px solid ${GOLD}55`, boxShadow: `0 0 14px ${GOLD}33` }}>
              <Trophy className="w-3 h-3" aria-hidden="true" /> {prCount} PR{prCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Volume centrepiece */}
        {volume != null && (
          <div className="mb-3">
            <div className="flex items-baseline gap-1.5">
              <span className="helix-num text-fluid-2xl font-bold leading-none" style={{ color: accent }}>{volume}</span>
              <span className="text-fluid-xs text-muted">{unit} moved</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: `${accent}1a` }}>
              <div className="h-full rounded-full" style={{ width: '100%', background: accent, boxShadow: `0 0 10px ${accent}88` }} />
            </div>
          </div>
        )}

        {/* Vitals ribbon — one line, no squares */}
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
          <Vital icon={Layers} value={session.set_count} unit="sets" color={AMETHYST} />
          <Vital icon={Clock} value={session.duration_min} unit="min" color={SAPPHIRE} />
          <Vital icon={Flame} value={session.calories_burned} unit="kcal" color={EMBER} />
          <Vital icon={HeartPulse} value={session.avg_bpm} unit="bpm" color={OXIDE} />
        </div>
      </div>
    </div>
  )
}

/**
 * Training card — two faces:
 *   · NOT logged: today's scheduled session + a Log button; an expander reveals
 *     the PREVIOUS session's metadata (so you can see what to beat).
 *   · LOGGED: a permanent, non-collapsible completed-session hero.
 */
export function TrainingCard({ today, todaySession, lastSession, loggedToday, onLog }: {
  today: ScheduleDay | 'rest'
  /** Today's session — present iff loggedToday. */
  todaySession: Session | null | undefined
  /** The previous session, for the not-logged expand. */
  lastSession: Session | null | undefined
  loggedToday: boolean
  onLog: (dayKey: string) => void
}) {
  const [open, setOpen] = useState(false)
  const unit = weightUnit()
  const isRest = today === 'rest'
  const accent = isRest ? AMETHYST : EMERALD
  const lastSplit = lastSession ? PPL_SPLITS[lastSession.split_day as SplitDay] : null

  // Logged → the completed hero owns the card, no expand needed.
  if (loggedToday && todaySession) {
    return <CompletedHero session={todaySession} accent={EMERALD} />
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${accent}2e`, background: `${accent}0a` }}>
      {/* Today, at a glance */}
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accent}1c`, color: accent }}>
          <Dumbbell className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-wide text-muted">Today</span>
          <span className="split-label block font-bold text-fluid-base truncate" style={{ color: accent }}>
            {isRest ? 'Zone-2 / Rest' : today.label}
          </span>
          {!isRest && today.sub && <span className="block text-[10px] text-muted truncate">{today.sub}</span>}
        </div>
      </div>

      {/* CTA */}
      {!isRest && today.dayKey && (
        <div className="px-3.5 pb-3">
          <button onClick={() => onLog(today.dayKey as string)} className="btn-glass w-full justify-center min-h-[44px]">
            <Plus className="w-4 h-4" /> Log {today.label}
          </button>
        </div>
      )}

      {/* Expand → PREVIOUS session's metadata (what to beat) */}
      {lastSession && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-left border-t"
            style={{ borderColor: HAIRLINE }}
          >
            <span className="text-[10px] uppercase tracking-wide text-muted">Last session</span>
            <span className="text-fluid-xs font-semibold truncate" style={{ color: lastSplit?.color ?? MUTED }}>
              {lastSplit?.label ?? lastSession.split_day}
            </span>
            <span className="ml-auto text-[10px] text-muted shrink-0">
              {new Date(lastSession.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {open && (
            <div className="px-3.5 pb-3 flex items-center gap-x-4 gap-y-2 flex-wrap">
              <Vital icon={Layers} value={lastSession.set_count} unit="sets" color={AMETHYST} />
              <Vital icon={Clock} value={lastSession.duration_min} unit="min" color={SAPPHIRE} />
              <Vital icon={Flame} value={lastSession.calories_burned} unit="kcal" color={EMBER} />
              <Vital icon={HeartPulse} value={lastSession.avg_bpm} unit="bpm" color={OXIDE} />
              <Vital
                icon={Dumbbell}
                value={lastSession.total_volume_kg != null ? fmtVolume(displayWeight(lastSession.total_volume_kg)) : null}
                unit={unit} color={EMERALD} />
              {(lastSession.pr_count ?? 0) > 0 && (
                <Vital icon={Trophy} value={lastSession.pr_count} unit="PR" color={GOLD} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
