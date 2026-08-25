'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Dumbbell, Moon } from 'lucide-react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Bar, Hero, StatTile } from './parts'
import { daysAgo } from './DailyWidgets'
import { MuscleAtlas } from '@/components/body/MuscleAtlas'
import { ATLAS_VIEWBOX, setsToWorked } from '@/lib/body/atlas'
import { landmarkColor } from '@/lib/theme/muscleHue'
import { useWeeklyVolume } from '@/lib/hooks/useWeeklyVolume'
import { useWeekSessions } from '@/lib/hooks/useWeekSessions'
import { useLastSessionOfDay } from '@/lib/hooks/useLastSessionOfDay'
import { useStreak } from '@/lib/hooks/useStreak'
import { weekStartOf } from '@/lib/utils/week'
import { useLatestPr } from '@/lib/hooks/useLatestPr'
import { prAxisLabel } from '@/lib/training/prEngine'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { logicalTodayISO } from '@/lib/utils/day'
import type { LandmarkMuscle, MuscleVolume } from '@/lib/training/landmarks'
import type { ScheduleDay } from '@/lib/programs'
import { EMERALD, GOLD, STEEL, MUTED, AMETHYST } from '@/lib/theme/palette'
import { WIDGET_META, bodyHeightPx, type WidgetSize } from '@/lib/dashboard/layout'

/**
 * Tonnage, short enough to fit a tile.
 *
 * `fmtVolume` prints `12,480.0`, which is the right answer on a report page and
 * eleven characters in a 175px tile. Above a tonne this rounds to one decimal
 * of a thousand — `12.5k` — which is the precision anybody actually reads a
 * week's tonnage at.
 */
export function tonnage(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null
  if (Math.abs(value) < 1000) return String(Math.round(value))
  return `${Math.round(value / 100) / 10}k`
}

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
 * knows about.
 *
 * ── WHY THE TILE RENDERED THREE TIMES ITS OWN HEIGHT ─────────────────────────
 * The atlas is `<svg class="w-full h-full">` over a 120×260 viewBox. In a flex
 * column with `min-h-0` the tile gives its body no DEFINITE height, so `h-full`
 * resolves to `auto` and the SVG falls back to sizing itself from its width —
 * 175px of tile width times 260/120 is a 380px figure inside a 112px tile.
 * `w-auto` in the caller's className did not help, because it and the
 * component's own `w-full` are the same property and which one wins depends on
 * stylesheet order, not on the class list.
 *
 * The fix is to stop asking the SVG to work out its own size: the wrapper is
 * given an explicit height from `bodyHeightPx(size)` and the exactly matching
 * width for the viewBox's ratio, so the figure fills the box with no
 * letterboxing and cannot exceed the tile at any size.
 *
 * Small is the figure alone — at 1×1 the shape IS the information, and a number
 * beside it would crowd out the one thing that cannot be said any other way.
 */
const NO_MUSCLES: MuscleVolume[] = []

/** Height available to the figure, per size. Large reserves a strip underneath. */
function atlasHeight(size: WidgetSize): number {
  if (size === 'l') return bodyHeightPx('l') - 56
  return bodyHeightPx(size)
}

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

  const trained = useMemo(
    () => [...muscles].filter((m) => m.sets > 0).sort((a, b) => b.sets - a.sets),
    [muscles],
  )
  // What is furthest BEHIND its target — the answer the figure is being asked
  // for. Not the biggest number, which is just "what you like training".
  const behind = useMemo(
    () => [...muscles]
      .filter((m) => m.target > 0 && m.zone === 'under')
      .sort((a, b) => (a.sets / a.target) - (b.sets / b.target))[0] ?? null,
    [muscles],
  )

  const h = atlasHeight(size)
  const w = Math.round(h * (ATLAS_VIEWBOX.width / ATLAS_VIEWBOX.height))

  return (
    <WidgetFrame {...WIDGET_META.muscle} size={size} onOpen={onOpen}>
      {!trained.length ? (
        <WidgetEmpty accent={AMETHYST} size={size} message="Nothing trained yet this week" hint="Your first session lights the map" />
      ) : (
        <span className="flex-1 min-h-0 flex flex-col">
          <span className="flex items-start gap-2.5 min-w-0">
            <span
              className={`block shrink-0 ${size === 's' ? 'mx-auto' : ''}`}
              style={{ height: h, width: w }}
            >
              <MuscleAtlas view="front" worked={worked} colorFor={landmarkColor} />
            </span>

            {size !== 's' && (
              <span className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="flex items-baseline gap-1">
                  <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted">This week</span>
                  <span className="helix-num text-[9px] tabular-nums text-muted ml-auto">
                    {trained.length} worked
                  </span>
                </span>
                {trained.slice(0, size === 'l' ? 7 : 4).map((m) => (
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
              </span>
            )}
          </span>

          {size === 'l' && behind && (
            <span className="block mt-auto pt-1.5 border-t border-white/[0.06]">
              <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted">Furthest behind</span>
              <span className="flex items-baseline gap-1.5 mt-0.5 min-w-0">
                <span className="text-[12px] font-bold truncate" style={{ color: behind.color }}>{behind.muscle}</span>
                <span className="helix-num text-[11px] font-bold tabular-nums ml-auto shrink-0" style={{ color: behind.color }}>
                  {behind.sets}/{behind.target}
                </span>
              </span>
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
 * The week, as the three numbers it actually produced.
 *
 * ── WHY THE COVERAGE FIGURE IS LANDMARKS, NOT A SET TOTAL ────────────────────
 * The headline was once `Σ sets / Σ target` across the landmark rows, and that
 * sum is not a quantity. `weeklyVolumeByMuscle` credits one PHYSICAL set to
 * every distinct landmark the movement names — in full to each primary, at
 * `SECONDARY_SET_CREDIT` to each secondary — because that is the only way a
 * per-muscle figure is comparable between a leg extension and a squat. Adding
 * the rows back up therefore counts the same physical set once per muscle it
 * touched, so a compound-heavy week inflates far more per set than an isolation
 * one and the "total" is an artifact of the exercise mix rather than of the
 * work. `landmarks.ts` states this outright for the tonnage column, which is
 * built on the identical attribution rule: "adding the rows up over-counts".
 *
 * That sum was also drawn from two different muscle sets — the numerator counted
 * sets from muscles whose target is 0 (`zone: 'na'`, e.g. Adductors on a cut)
 * while the denominator, correctly, did not.
 *
 * So coverage is the fraction that IS well-defined — how many prescribed
 * landmarks have reached their target — and the TONNAGE and SET COUNT beside it
 * come from `useWeekSessions`, which sums `workout_sessions.total_volume_kg`
 * and `.set_count`: one row per session, no attribution, nothing counted twice.
 * Three honest numbers instead of one fabricated one.
 */
export function VolumeWidget({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const { data: weekly } = useWeeklyVolume()
  const { data: week } = useWeekSessions(weekStartOf(logicalTodayISO()))
  const { current: streak } = useStreak()
  const unit = weightUnit()
  const muscles = weekly?.muscles ?? NO_MUSCLES

  // Only landmarks the program actually prescribes. A muscle at `target: 0` is
  // not "unmet", it is not asked for this phase.
  const graded = useMemo(() => muscles.filter((m) => m.target > 0), [muscles])
  const met = graded.filter((m) => m.zone !== 'under').length
  /** Physical sets logged this week — NOT the per-muscle rows added up. */
  const physicalSets = week?.totals.sets ?? 0
  const kg = displayWeight(week?.totals.volumeKg ?? null)
  const prs = week?.totals.prs ?? 0

  return (
    <WidgetFrame {...WIDGET_META.volume} size={size} onOpen={onOpen}>
      {!graded.length || physicalSets <= 0 ? (
        <WidgetEmpty accent={STEEL} size={size} message="The week is a blank page" hint={graded.length ? `${graded.length} landmarks to cover` : undefined} />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-1.5">
          <Hero value={tonnage(kg)} unit={unit} color={STEEL} />
          <Bar value={met} target={graded.length} color={STEEL} />
          <span className="helix-num text-[9px] tabular-nums text-muted truncate">
            {physicalSets} sets · {met}/{graded.length} covered
          </span>
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          <span className="grid grid-cols-4 gap-1.5">
            <StatTile label="Tonnage" value={tonnage(kg)} unit={unit} color={STEEL} />
            <StatTile label="Sets" value={physicalSets} color={STEEL} />
            <StatTile label="Records" value={prs} color={prs > 0 ? GOLD : STEEL} />
            <StatTile label="Day" value={streak} color={GOLD} />
          </span>

          <span className="block">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted">Landmarks covered</span>
              <span className="helix-num text-[10px] font-bold tabular-nums ml-auto" style={{ color: STEEL }}>
                {met}<span className="text-muted font-normal">/{graded.length}</span>
              </span>
            </span>
            <span className="block mt-1"><Bar value={met} target={graded.length} color={STEEL} /></span>
          </span>

          <span className="flex flex-col gap-1 mt-auto">
            {[...graded]
              .sort((a, b) => (a.sets / a.target) - (b.sets / b.target))
              .slice(0, size === 'l' ? 7 : 3)
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
  const { data: prs } = useLatestPr(8)
  const unit = weightUnit()
  const top = prs?.[0] ?? null

  return (
    <WidgetFrame {...WIDGET_META.pr} size={size} onOpen={onOpen}>
      {!top ? (
        <WidgetEmpty accent={GOLD} size={size} message="Your first record is waiting" hint="Beat any set and it lands here" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-end gap-0.5">
          <span className="helix-num font-bold text-fluid-lg leading-none tabular-nums truncate" style={{ color: GOLD }}>
            {top.weightKg != null && top.weightKg > 0
              ? `${displayWeight(top.weightKg)}${unit}`
              : top.reps != null ? `${top.reps} reps` : '—'}
          </span>
          <span className="text-[10px] text-text truncate">{top.exercise}</span>
          <span className="text-[9px] text-muted truncate">{daysAgo(top.achievedOn)}</span>
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          <span className="block min-w-0">
            <span className="helix-num block font-bold text-fluid-lg leading-none tabular-nums truncate" style={{ color: GOLD }}>
              {top.weightKg != null && top.weightKg > 0
                ? <>{displayWeight(top.weightKg)}<span className="text-[10px] font-normal text-muted ml-0.5">{unit}</span>
                  {top.reps != null && <span className="text-[11px] font-normal text-muted"> × {top.reps}</span>}</>
                : top.reps != null ? <>{top.reps}<span className="text-[10px] font-normal text-muted ml-1">reps</span></> : '—'}
            </span>
            <span className="block text-[11px] text-text truncate mt-0.5">{top.exercise}</span>
            <span className="block text-[9px] text-muted truncate">
              {prAxisLabel(top.axis)} · {daysAgo(top.achievedOn)}
            </span>
          </span>
          {/* The rest of the standing book, most recent first. A record is only
              news next to the ones around it. */}
          <span className="block space-y-0.5 mt-auto pt-1 border-t border-white/[0.06]">
            {(prs ?? []).slice(1, size === 'l' ? 8 : 3).map((p) => (
              <span key={`${p.exercise}:${p.axis}`} className="flex items-baseline gap-2 min-w-0">
                <span className="text-[9px] text-muted truncate flex-1">{p.exercise}</span>
                <span className="helix-num text-[9px] font-bold tabular-nums shrink-0" style={{ color: GOLD }}>
                  {p.weightKg != null && p.weightKg > 0 ? `${displayWeight(p.weightKg)}${unit}` : p.reps != null ? `${p.reps}r` : '—'}
                </span>
                <span className="text-[8px] text-muted/70 shrink-0 w-12 text-right">{daysAgo(p.achievedOn)}</span>
              </span>
            ))}
          </span>
        </span>
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * TRAIN — the plan, the last run of it, and today's result
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TodaySessionStats {
  volumeKg: number | null
  setCount: number | null
  prCount: number | null
  durationMin: number | null
}

/**
 * Today's training, in whichever of its three states the day is in.
 *
 * ── WHY THIS IS ONE TILE AND NOT TWO ─────────────────────────────────────────
 * `Train` and `Next Session` were separate widgets answering the same question
 * at two points in the same day, which on a two-column phone meant one of them
 * was always the wrong one. They also disagreed: Next named the scheduled
 * workout while Train, printing a volume for a session that had not happened,
 * showed `NaN kg` — a number computed from `undefined` and rendered anyway.
 *
 * Three states, one tile:
 *
 *   BEFORE  the plan's name, and the LAST time this exact workout was run —
 *           its tonnage, its sets, its records. That is the number to beat, and
 *           it is the only genuinely motivating thing a pre-workout tile can
 *           say. There is no "today" figure to show, so none is invented.
 *   AFTER   today's own tonnage, sets, records and duration.
 *   REST    the rest day, said properly, in amethyst rather than the training
 *           hue — a rest day is prescribed work, not a failed training day.
 *
 * "Last time" comes from `useLastSessionOfDay`, keyed on `day_key` and never on
 * the weekday: a swapped rest day is how a Wednesday "Delts & Arms" ends up in
 * the Upper A history (see `session-attribution-by-day-key`).
 *
 * ── AND WHY THE FRAME IS NOT A BUTTON ────────────────────────────────────────
 * The Log link is a real `<a>` inside the tile. A `<button>` frame would make it
 * a button inside a button — invalid HTML that Safari resolves by dropping the
 * inner one, which would silently turn the primary action into a no-op. Hence
 * `WidgetFrame`'s `role="button"` div, and `stopPropagation` here so tapping Log
 * does not ALSO fire the tile's own open.
 */
export function TrainWidget({ size, onOpen, day, logged, today }: {
  size: WidgetSize
  onOpen?: () => void
  day: ScheduleDay | 'rest'
  /** A session already exists for today — the tile switches to its numbers. */
  logged: boolean
  /** Today's session totals, when there is one. */
  today: TodaySessionStats | null
}) {
  const rest = day === 'rest'
  const dayKey = rest ? null : day.dayKey
  // Only asked for while there is no session today — the "last time" line is the
  // thing to beat, and once today exists the tile shows today instead.
  const { data: last } = useLastSessionOfDay(!rest && !logged ? dayKey : null)
  const unit = weightUnit()

  const accent = rest ? AMETHYST : EMERALD
  const meta = { ...WIDGET_META.train, accent, icon: rest ? Moon : WIDGET_META.train.icon }

  /** The three-up stat row, for whichever session is being described. */
  const stats = (s: TodaySessionStats, color: string) => (
    <span className="grid grid-cols-3 gap-1.5">
      <StatTile label="Volume" value={tonnage(displayWeight(s.volumeKg))} unit={unit} color={color} />
      <StatTile label="Sets" value={s.setCount ?? null} color={color} />
      <StatTile label="Records" value={s.prCount ?? 0} color={(s.prCount ?? 0) > 0 ? GOLD : color} />
    </span>
  )

  return (
    <WidgetFrame {...meta} size={size} onOpen={onOpen}>
      <span className="flex-1 min-h-0 flex flex-col gap-1.5">
        <span className="block min-w-0">
          <span className="helix-num block font-bold text-fluid-lg leading-tight truncate" style={{ color: accent }}>
            {rest ? 'Rest Day' : day.label}
          </span>
          <span className="block text-[9px] truncate" style={{ color: logged ? EMERALD : 'var(--color-muted)' }}>
            {rest
              ? 'adaptation happens now'
              : logged
                ? 'logged today ✓'
                : (day.sub ?? 'scheduled today')}
          </span>
        </span>

        {rest ? (
          size !== 's' && (
            <span className="flex-1 min-h-0 flex flex-col justify-center gap-1.5">
              <span className="text-[11px] leading-snug text-muted">
                No lifting scheduled. A walk in Zone 2 is the work — the adaptation
                you are paid for happens on the days you do not train.
              </span>
            </span>
          )
        ) : logged && today ? (
          <>
            {size !== 's' && stats(today, EMERALD)}
            {size === 's' && (
              <span className="helix-num text-[11px] font-bold tabular-nums mt-auto" style={{ color: EMERALD }}>
                {tonnage(displayWeight(today.volumeKg)) ?? '—'}
                <span className="text-[9px] font-normal text-muted ml-0.5">{unit}</span>
              </span>
            )}
            {size === 'l' && today.durationMin != null && (
              <span className="text-[10px] text-muted mt-auto">
                {today.durationMin} minutes under the bar.
              </span>
            )}
          </>
        ) : last ? (
          <>
            {/* The bar to clear, not a prediction of today. Muted so it can
                never be misread as something already logged. */}
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted">
              Last time · {daysAgo(last.date)}
            </span>
            {size !== 's'
              ? stats(last, MUTED)
              : (
                <span className="helix-num text-[11px] font-bold tabular-nums text-muted truncate">
                  {tonnage(displayWeight(last.volumeKg)) ?? '—'}
                  <span className="text-[9px] font-normal ml-0.5">{unit}</span>
                  {last.setCount != null && <span className="font-normal"> · {last.setCount} sets</span>}
                </span>
              )}
            {size !== 's' && (
              <Link
                href={`/session?template=${dayKey}&date=${logicalTodayISO()}`}
                onPointerUp={blurOnTap}
                onClick={(e) => e.stopPropagation()}
                className="mt-auto inline-flex items-center justify-center gap-1.5 min-h-[34px] rounded-xl
                           text-[11px] font-bold active:scale-95 transition-transform"
                style={{ background: `${EMERALD}24`, border: `1px solid ${EMERALD}59`, color: EMERALD }}
              >
                <Dumbbell className="w-3.5 h-3.5" aria-hidden="true" /> Log {day.label}
              </Link>
            )}
          </>
        ) : (
          <>
            <span className="text-[10px] text-muted leading-snug">
              First run of this one. Whatever you log becomes the bar.
            </span>
            {size !== 's' && dayKey && (
              <Link
                href={`/session?template=${dayKey}&date=${logicalTodayISO()}`}
                onPointerUp={blurOnTap}
                onClick={(e) => e.stopPropagation()}
                className="mt-auto inline-flex items-center justify-center gap-1.5 min-h-[34px] rounded-xl
                           text-[11px] font-bold active:scale-95 transition-transform"
                style={{ background: `${EMERALD}24`, border: `1px solid ${EMERALD}59`, color: EMERALD }}
              >
                <Dumbbell className="w-3.5 h-3.5" aria-hidden="true" /> Log {day.label}
              </Link>
            )}
          </>
        )}
      </span>
    </WidgetFrame>
  )
}

/** Shared muted colour for a tile with a value but nothing to say about it. */
export const NEUTRAL = MUTED
