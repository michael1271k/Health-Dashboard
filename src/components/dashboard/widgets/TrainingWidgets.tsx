'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Target, Trophy, BarChart3, CalendarClock, Dumbbell } from 'lucide-react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Bar, Hero } from './parts'
import { MuscleAtlas } from '@/components/body/MuscleAtlas'
import { setsToWorked } from '@/lib/body/atlas'
import { landmarkColor } from '@/lib/theme/muscleHue'
import { useWeeklyVolume } from '@/lib/hooks/useWeeklyVolume'
import { useWeekSessions } from '@/lib/hooks/useWeekSessions'
import { weekStartOf } from '@/lib/utils/week'
import { useLatestPr } from '@/lib/hooks/useLatestPr'
import { prAxisLabel } from '@/lib/training/prEngine'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { logicalTodayISO } from '@/lib/utils/day'
import type { LandmarkMuscle, MuscleVolume } from '@/lib/training/landmarks'
import type { ScheduleDay } from '@/lib/programs'
import { EMERALD, GOLD, STEEL, MUTED, AMETHYST } from '@/lib/theme/palette'
import type { WidgetSize } from '@/lib/dashboard/layout'

/* ────────────────────────────────────────────────────────────────────────────
 * MUSCLE FOCUS
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Where this week's work has actually landed, on the body it landed on.
 *
 * ── IT IS THE SAME FIGURE, DELIBERATELY ──────────────────────────────────────
 * `MuscleAtlas` already draws the DOMS map, the live session's distribution and
 * the weekly volume breakdown, and a generated Swift copy of the same geometry
 * draws the iOS widget. A tile-sized silhouette of its own would be a fifth
 * body to keep in step with `atlas.ts`, and `check:atlas` only pins the two it
 * knows about. This passes the same `worked` map and the same `landmarkColor`,
 * so a shoulder that reads hot here reads hot everywhere.
 *
 * Small is the figure alone — at 1×1 the shape IS the information, and a number
 * beside it would crowd out the one thing that cannot be said any other way.
 */
const NO_MUSCLES: MuscleVolume[] = []

export function MuscleWidget({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const { data: weekly } = useWeeklyVolume()
  // `?? []` inline would be a NEW array on every render while the query is
  // pending, so every memo below it would recompute forever.
  const muscles = weekly?.muscles ?? NO_MUSCLES

  const worked = useMemo(() => {
    const sets: Partial<Record<LandmarkMuscle, number>> = {}
    for (const m of muscles) if (m.sets > 0) sets[m.muscle] = m.sets
    return setsToWorked(sets)
  }, [muscles])

  const trained = muscles.filter((m) => m.sets > 0)
  // What is furthest BEHIND its target — the answer the figure is being asked
  // for. Not the biggest number, which is just "what you like training".
  const behind = useMemo(
    () => [...muscles]
      .filter((m) => m.target > 0 && m.zone === 'under')
      .sort((a, b) => (a.sets / a.target) - (b.sets / b.target))[0] ?? null,
    [muscles],
  )

  return (
    <WidgetFrame icon={Target} label="Muscle Focus" accent={AMETHYST} size={size} onOpen={onOpen}>
      {!trained.length ? (
        <WidgetEmpty accent={AMETHYST} message="Nothing trained yet this week" hint="Your first session lights the map" />
      ) : (
        <span className="flex-1 min-h-0 flex items-center gap-2.5">
          <span className={`block shrink-0 h-full ${size === 's' ? 'mx-auto' : ''}`}>
            <MuscleAtlas view="front" worked={worked} colorFor={landmarkColor} className="h-full w-auto" />
          </span>
          {size !== 's' && (
            <span className="flex-1 min-w-0 flex flex-col gap-1 justify-center">
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">This week</span>
              {[...muscles]
                .filter((m) => m.sets > 0)
                .sort((a, b) => b.sets - a.sets)
                .slice(0, size === 'l' ? 6 : 4)
                .map((m) => (
                  <span key={m.muscle} className="block min-w-0">
                    <span className="flex items-baseline gap-1 min-w-0">
                      <span className="text-[9px] uppercase tracking-wide text-muted truncate">{m.muscle}</span>
                      <span className="helix-num text-[10px] font-bold tabular-nums ml-auto shrink-0" style={{ color: m.color }}>
                        {m.sets}<span className="text-muted font-normal">/{m.target}</span>
                      </span>
                    </span>
                    <span className="block mt-0.5"><Bar value={m.sets} target={m.target} color={m.color} /></span>
                  </span>
                ))}
              {behind && (
                <span className="text-[9px] text-muted truncate mt-0.5">
                  Furthest behind: <span style={{ color: behind.color }}>{behind.muscle}</span>
                </span>
              )}
            </span>
          )}
        </span>
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * WEEKLY VOLUME
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * How much of the week's prescribed work is done.
 *
 * ── WHY THE HEADLINE IS LANDMARKS, NOT A SET TOTAL ───────────────────────────
 * It was `Σ sets / Σ target` across the landmark rows, and that sum is not a
 * quantity. `weeklyVolumeByMuscle` credits one PHYSICAL set to every distinct
 * landmark the movement names — in full to each primary, at
 * `SECONDARY_SET_CREDIT` to each secondary — because that is the only way a
 * per-muscle figure is comparable between a leg extension and a squat. Adding
 * the rows back up therefore counts the same physical set once per muscle it
 * touched, so a compound-heavy week inflates far more per set than an isolation
 * one and the "total" is an artifact of the exercise mix rather than of the
 * work. `landmarks.ts` states this outright for the tonnage column, which is
 * built on the identical attribution rule: "adding the rows up over-counts".
 *
 * The sum was also drawn from two different muscle sets — the numerator counted
 * sets from muscles whose target is 0 (`zone: 'na'`, e.g. Adductors on a cut)
 * while the denominator, correctly, did not.
 *
 * So the headline is the fraction that IS well-defined and is exactly what the
 * rows underneath already say: how many landmarks have reached their target.
 * The week's true physical set count comes from `useWeekSessions`, which sums
 * `workout_sessions.set_count` — one row per session, no attribution, no
 * double-counting — and rides underneath as context.
 */
export function VolumeWidget({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const { data: weekly } = useWeeklyVolume()
  const { data: week } = useWeekSessions(weekStartOf(logicalTodayISO()))
  const muscles = weekly?.muscles ?? NO_MUSCLES

  // Only landmarks the program actually prescribes. A muscle at `target: 0` is
  // not "unmet", it is not asked for this phase.
  const graded = useMemo(() => muscles.filter((m) => m.target > 0), [muscles])
  const met = graded.filter((m) => m.zone !== 'under').length
  /** Physical sets logged this week — NOT the per-muscle rows added up. */
  const physicalSets = week?.totals.sets ?? 0

  return (
    <WidgetFrame icon={BarChart3} label="Weekly Volume" accent={STEEL} size={size} onOpen={onOpen}>
      {!graded.length || physicalSets <= 0 ? (
        <WidgetEmpty accent={STEEL} message="The week is a blank page" hint={graded.length ? `${graded.length} landmarks to cover` : undefined} />
      ) : (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1.5">
          <Hero value={met} unit={`/ ${graded.length} landmarks`} color={STEEL} decimals={0} tight={size !== 's'} />
          <Bar value={met} target={graded.length} color={STEEL} />
          <span className="helix-num text-[9px] tabular-nums text-muted truncate">
            {physicalSets} set{physicalSets === 1 ? '' : 's'} logged
          </span>

          {size !== 's' && (
            <span className="flex flex-col gap-1 pt-1">
              {[...graded]
                .sort((a, b) => (a.sets / a.target) - (b.sets / b.target))
                .slice(0, size === 'l' ? 8 : 4)
                .map((m) => (
                  <span key={m.muscle} className="flex items-baseline gap-2 min-w-0">
                    <span className="text-[9px] uppercase tracking-wide text-muted truncate flex-1">{m.muscle}</span>
                    <span className="w-14 shrink-0"><Bar value={m.sets} target={m.target} color={m.color} /></span>
                    <span className="helix-num text-[10px] font-bold tabular-nums shrink-0 w-9 text-right" style={{ color: m.color }}>
                      {m.sets}/{m.target}
                    </span>
                  </span>
                ))}
            </span>
          )}
        </span>
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * LATEST PR
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The last thing you beat.
 *
 * ── WHY THE MOST RECENT AND NOT THE BIGGEST ──────────────────────────────────
 * "Heaviest ever" is a number that changes twice a year and stops being news
 * the second time you read it. The record you set on Tuesday is the one that
 * says the program is working, and it is the one that expires — which is
 * exactly what makes it worth a tile.
 *
 * Gold, and only gold, because gold means a personal record app-wide.
 */
export function PrWidget({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const { data: prs } = useLatestPr(6)
  const unit = weightUnit()
  const top = prs?.[0] ?? null

  const ago = (iso: string): string => {
    const days = Math.round((Date.parse(`${logicalTodayISO()}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 86_400_000)
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`
  }

  return (
    <WidgetFrame icon={Trophy} label="Latest PR" accent={GOLD} size={size} onOpen={onOpen}>
      {!top ? (
        <WidgetEmpty accent={GOLD} message="Your first record is waiting" hint="Beat any set and it lands here" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-0.5">
          <span className="helix-num font-bold text-fluid-lg leading-none tabular-nums truncate" style={{ color: GOLD }}>
            {top.weightKg != null && top.weightKg > 0
              ? `${displayWeight(top.weightKg)}${unit}`
              : top.reps != null ? `${top.reps} reps` : '—'}
          </span>
          <span className="text-[9px] text-muted truncate">{top.exercise}</span>
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1.5 justify-center">
          <span className="block min-w-0">
            <span className="helix-num block font-bold text-fluid-lg leading-none tabular-nums truncate" style={{ color: GOLD }}>
              {top.weightKg != null && top.weightKg > 0
                ? <>{displayWeight(top.weightKg)}<span className="text-[10px] font-normal text-muted ml-0.5">{unit}</span>
                  {top.reps != null && <span className="text-[11px] font-normal text-muted"> × {top.reps}</span>}</>
                : top.reps != null ? <>{top.reps}<span className="text-[10px] font-normal text-muted ml-1">reps</span></> : '—'}
            </span>
            <span className="block text-[11px] text-text truncate mt-0.5">{top.exercise}</span>
            <span className="block text-[9px] text-muted truncate">
              {prAxisLabel(top.axis)} · {ago(top.achievedOn)}
            </span>
          </span>
          {/* The rest of the standing book, most recent first. A record is only
              news next to the ones around it. */}
          <span className="block space-y-0.5 pt-1 border-t border-white/[0.06]">
            {(prs ?? []).slice(1, size === 'l' ? 6 : 3).map((p) => (
              <span key={`${p.exercise}:${p.axis}`} className="flex items-baseline gap-2 min-w-0">
                <span className="text-[9px] text-muted truncate flex-1">{p.exercise}</span>
                <span className="helix-num text-[9px] font-bold tabular-nums shrink-0" style={{ color: GOLD }}>
                  {p.weightKg != null && p.weightKg > 0 ? `${displayWeight(p.weightKg)}${unit}` : p.reps != null ? `${p.reps}r` : '—'}
                </span>
                <span className="text-[8px] text-muted/70 shrink-0 w-12 text-right">{ago(p.achievedOn)}</span>
              </span>
            ))}
          </span>
        </span>
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * NEXT SESSION
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What the plan is asking for, and the one tap that starts it.
 *
 * ── IT CARRIES AN ACTION, WHICH IS WHY THE FRAME IS NOT A BUTTON ─────────────
 * The Log link is a real `<a>` inside the tile. A `<button>` frame would make it
 * a button inside a button — invalid HTML that Safari resolves by dropping the
 * inner one, which would silently turn the primary action into a no-op. Hence
 * `WidgetFrame`'s `role="button"` div, and `stopPropagation` here so tapping
 * Log does not ALSO fire the tile's own open.
 */
export function NextSessionWidget({ size, day, logged, onOpen }: {
  size: WidgetSize
  day: ScheduleDay | 'rest'
  /** A session already exists for today — the CTA becomes a state. */
  logged: boolean
  onOpen?: () => void
}) {
  const rest = day === 'rest'
  const accent = rest ? AMETHYST : EMERALD
  const label = rest ? 'Rest · Zone-2' : day.label

  return (
    <WidgetFrame icon={CalendarClock} label="Next Session" accent={accent} size={size} onOpen={onOpen}>
      <span className="flex-1 min-h-0 flex flex-col justify-end gap-1">
        <span className="helix-num font-bold text-fluid-lg leading-tight truncate" style={{ color: accent }}>
          {label}
        </span>
        <span className="text-[9px] text-muted truncate">
          {logged ? 'logged today ✓' : rest ? 'adaptation happens now' : (day.sub ?? 'scheduled today')}
        </span>

        {size !== 's' && !rest && !logged && day.dayKey && (
          <Link
            href={`/session?template=${day.dayKey}&date=${logicalTodayISO()}`}
            onPointerUp={blurOnTap}
            onClick={(e) => e.stopPropagation()}
            className="mt-1.5 inline-flex items-center justify-center gap-1.5 min-h-[36px] rounded-xl
                       text-[11px] font-bold active:scale-95 transition-transform"
            style={{ background: `${EMERALD}24`, border: `1px solid ${EMERALD}59`, color: EMERALD }}
          >
            <Dumbbell className="w-3.5 h-3.5" aria-hidden="true" /> Log {day.label}
          </Link>
        )}
        {size !== 's' && (rest || logged) && (
          <span className="mt-1.5 text-[10px] text-muted leading-snug">
            {logged
              ? 'Today is on the board. The next one is what beats it.'
              : 'No lifting scheduled — a walk in Zone 2 is the work.'}
          </span>
        )}
      </span>
    </WidgetFrame>
  )
}

/** Shared muted colour for a tile with a value but nothing to say about it. */
export const NEUTRAL = MUTED
