'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Dumbbell, Moon, Trophy } from 'lucide-react'
import { WidgetFrame, WidgetEmpty } from '@/components/dashboard/WidgetFrame'
import { Bar, Hero, MiniBars, StatTile, Trend } from './parts'
import { daysAgo } from './DailyWidgets'
import { MuscleAtlas } from '@/components/body/MuscleAtlas'
import { ATLAS_VIEWBOX, setsToWorked } from '@/lib/body/atlas'
import { landmarkColor } from '@/lib/theme/muscleHue'
import { useWeeklyVolume } from '@/lib/hooks/useWeeklyVolume'
import { useWeekSessions } from '@/lib/hooks/useWeekSessions'
import { useSessionHistory } from '@/lib/hooks/useSessionHistory'
import { useSessionDetail } from '@/lib/hooks/useSessionDetail'
import { useLastSessionOfDay } from '@/lib/hooks/useLastSessionOfDay'
import { useStreak } from '@/lib/hooks/useStreak'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { useLatestPr } from '@/lib/hooks/useLatestPr'
import { prAxisLabel } from '@/lib/training/prEngine'
import { epley1RM } from '@/lib/utils/epley'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { logicalTodayISO } from '@/lib/utils/day'
import type { LandmarkMuscle, MuscleVolume } from '@/lib/training/landmarks'
import type { ScheduleDay } from '@/lib/programs'
import { dayColor, EMERALD, GOLD, STEEL, MUTED, AMETHYST, OXIDE, REST, SAPPHIRE } from '@/lib/theme/palette'
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
 *
 * ── AND LARGE LISTS EVERY MUSCLE, NOT THE TOP SEVEN ──────────────────────────
 * A truncated list is the wrong answer for the one question this widget exists
 * to answer. "Where has the week landed" includes the muscles it has NOT landed
 * on, and those sort to the bottom — which is exactly where a `slice(0, 7)` was
 * cutting them off. Large now runs the whole landmark set in two columns.
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
  /** Everything the program grades, worked first, untouched last. */
  const all = useMemo(
    () => [...muscles].sort((a, b) => (b.sets - a.sets) || a.muscle.localeCompare(b.muscle)),
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

  const row = (m: MuscleVolume) => (
    <span key={m.muscle} className="block min-w-0">
      <span className="flex items-baseline gap-1 min-w-0">
        <span className="text-[9px] uppercase tracking-wide text-muted truncate">{m.muscle}</span>
        <span className="helix-num text-[10px] font-bold tabular-nums ml-auto shrink-0"
          style={{ color: m.sets > 0 ? m.color : MUTED }}>
          {m.sets}<span className="text-muted font-normal">/{m.target || '—'}</span>
        </span>
      </span>
      <span className="block mt-0.5"><Bar value={m.sets} target={m.target || null} color={m.color} /></span>
    </span>
  )

  return (
    <WidgetFrame {...WIDGET_META.muscle} size={size} onOpen={onOpen}>
      {!trained.length ? (
        <WidgetEmpty accent={AMETHYST} size={size} message="Nothing trained yet this week" hint="Your first session lights the map" />
      ) : size === 'l' ? (
        /* Large is the whole landmark set beside the figure — two columns, so
           sixteen muscles fit without either shrinking the body to a thumbnail
           or cutting the list at seven. */
        <span className="flex-1 min-h-0 flex flex-col gap-1">
          <span className="flex items-start gap-2 min-w-0 flex-1 min-h-0">
            <span className="block shrink-0" style={{ height: h, width: w }}>
              <MuscleAtlas view="front" worked={worked} colorFor={landmarkColor} />
            </span>
            <span className="flex-1 min-w-0 grid grid-cols-2 gap-x-2 gap-y-1 content-start">
              {all.map(row)}
            </span>
          </span>
          {behind && (
            <span className="flex items-baseline gap-1.5 pt-1 border-t border-white/[0.06] min-w-0">
              <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted shrink-0">Furthest behind</span>
              <span className="text-[11px] font-bold truncate ml-auto" style={{ color: behind.color }}>{behind.muscle}</span>
              <span className="helix-num text-[10px] font-bold tabular-nums shrink-0" style={{ color: behind.color }}>
                {behind.sets}/{behind.target}
              </span>
            </span>
          )}
        </span>
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
                {trained.slice(0, 4).map(row)}
              </span>
            )}
          </span>
        </span>
      )}
    </WidgetFrame>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * TONNAGE — the week's total work, against the week before
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * How much you actually moved, this week against last, with a month behind it.
 *
 * ── IT WAS THE MUSCLE-FOCUS TILE WITH DIFFERENT WORDS ────────────────────────
 * "Weekly Volume" led with landmark coverage and then listed the muscles
 * furthest behind their targets — which is the exact question `Muscle Focus`
 * exists for, answered less well, without the figure that makes it legible. Two
 * tiles for one reading is one tile too many, and the reader had no way to know
 * which of them to believe.
 *
 * So this one keeps the number the other cannot show: TONNAGE. Kilograms moved
 * is the only whole-body measure of a week's work that survives a change in the
 * exercise mix, and it is the one figure that answers "was this a bigger week
 * than last week" — a question the per-muscle grid genuinely cannot answer,
 * because those rows do not add up (see `landmarks.ts`: one physical set is
 * credited to every muscle it trains, so summing the rows counts it several
 * times).
 *
 * ── WHY THE COMPARISON IS THE WEEK BEFORE, NOT THE AVERAGE ───────────────────
 * A block progresses week to week, so the week before is the thing the current
 * one is supposed to beat. A four-week mean would flatter a deload and punish
 * the week after it, and both of those are the program working as intended.
 *
 * The month of bars underneath is per SESSION, not per day — a rest day has no
 * tonnage and drawing it as a zero would say the opposite.
 */
export function VolumeWidget({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const today = logicalTodayISO()
  const thisWeek = weekStartOf(today)
  const lastWeek = isoAddDays(thisWeek, -7)
  const { data: week } = useWeekSessions(thisWeek)
  const { data: prior } = useWeekSessions(lastWeek)
  const { data: history } = useSessionHistory()
  const { current: streak } = useStreak()
  const unit = weightUnit()

  const kg = displayWeight(week?.totals.volumeKg ?? null)
  const priorKg = displayWeight(prior?.totals.volumeKg ?? null)
  const sets = week?.totals.sets ?? 0
  const prs = week?.totals.prs ?? 0
  const sessions = week?.sessions.length ?? 0

  // Percent, not kilos: a 900 kg swing means something different on a 6-tonne
  // week and a 14-tonne one, and the tile has room for one number.
  const deltaPct = kg != null && priorKg ? Math.round(((kg - priorKg) / priorKg) * 100) : null

  /**
   * The last thirty days of sessions — tonnage, session colour and whether it
   * set a record, all read off the same rows so the three can never misalign.
   */
  const recent = useMemo(() => {
    const from = isoAddDays(today, -29)
    const rows = (history ?? []).filter((s) => s.date >= from)
    return {
      values: rows.map((s) => displayWeight(s.volumeKg)),
      // Each bar in its own session's hue, so a month of tonnage also shows the
      // ROTATION: a run of one colour is a split that stopped moving.
      colors: rows.map((s) => dayColor(s.dayKey, s.splitDay)),
      prs: rows.map((s) => (s.prCount ?? 0) > 0),
    }
  }, [history, today])

  return (
    <WidgetFrame {...WIDGET_META.volume} size={size} onOpen={onOpen}>
      {!sessions ? (
        <WidgetEmpty accent={STEEL} size={size} message="The week is a blank page" hint="Every set you log adds to the tonnage" />
      ) : size === 's' ? (
        <span className="flex-1 min-h-0 flex flex-col justify-between gap-1">
          <span className="flex items-baseline gap-1">
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted">This week</span>
            <span className="ml-auto shrink-0"><Trend delta={deltaPct} unit="%" /></span>
          </span>
          <Hero value={tonnage(kg)} unit={unit} color={STEEL} />
          <span className="helix-num text-[9px] tabular-nums text-muted truncate">
            {sets} sets · {sessions} session{sessions === 1 ? '' : 's'}
          </span>
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          <span className="flex items-baseline gap-2 min-w-0">
            <Hero value={tonnage(kg)} unit={unit} color={STEEL} tight />
            <span className="ml-auto shrink-0 flex items-baseline gap-1">
              <Trend delta={deltaPct} unit="%" />
              <span className="text-[8px] text-muted">vs last week</span>
            </span>
          </span>

          <span className="grid grid-cols-4 gap-1.5">
            <StatTile label="Sets" value={sets} color={STEEL} />
            <StatTile label="Sessions" value={sessions} color={STEEL} />
            <StatTile label="Records" value={prs} color={prs > 0 ? GOLD : STEEL} />
            <StatTile label="Day" value={streak} color={GOLD} />
          </span>

          <span className="block mt-auto">
            <span className="flex items-baseline gap-1.5">
              <span className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.1em] text-muted">
                Per session · 30 days
                {recent.prs.some(Boolean) && (
                  <Trophy className="w-2.5 h-2.5" style={{ color: GOLD }} aria-hidden="true" />
                )}
              </span>
              <span className="helix-num text-[8px] tabular-nums text-muted ml-auto">
                {priorKg != null ? `last week ${tonnage(priorKg)}${unit}` : 'no prior week'}
              </span>
            </span>
            <span className="block mt-1">
              <MiniBars series={recent.values} color={STEEL} colors={recent.colors}
                height={size === 'l' ? 96 : 34} />
            </span>
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
 * The last thing you beat, stated in full.
 *
 * ── WHY THE MOST RECENT AND NOT THE BIGGEST ──────────────────────────────────
 * "Heaviest ever" is a number that changes twice a year and stops being news
 * the second time you read it. The record you set on Tuesday is the one that
 * says the program is working, and it is the one that expires — which is
 * exactly what makes it worth a tile.
 *
 * ── FOUR FACTS, BECAUSE A RECORD IS FOUR FACTS ───────────────────────────────
 * The AXIS is not decoration: `92.5 kg` means one thing under Weight (a load
 * never handled before) and something quite different under 1RM (an estimate no
 * set has to have touched). Weight and reps say what was actually done, and the
 * estimated 1RM says what it is worth against every other set of that lift. The
 * tile printed the first three at best and the axis only at medium, which left
 * the small size showing a number whose MEANING was on another size.
 *
 * The 1RM is the ledger's own `value` when the record WAS the 1RM axis, and
 * Epley off the winning set otherwise — never a second stored figure, because a
 * second figure is a second thing to keep in step. `epley1RM` returns null on
 * unloaded work rather than 0: a bodyweight set has no one-rep max to estimate.
 *
 * There is no large. A record and the book behind it is a medium tile's worth —
 * see `WIDGET_SIZES`.
 */
export function PrWidget({ size, onOpen }: { size: WidgetSize; onOpen?: () => void }) {
  const { data: prs } = useLatestPr(8)
  const unit = weightUnit()
  const top = prs?.[0] ?? null

  const est1rm = useMemo(() => {
    if (!top) return null
    if (top.axis === 'e1rm' && top.value != null) return top.value
    return top.weightKg != null && top.reps != null ? epley1RM(top.weightKg, top.reps) : null
  }, [top])

  return (
    <WidgetFrame {...WIDGET_META.pr} size={size} onOpen={onOpen}>
      {!top ? (
        <WidgetEmpty accent={GOLD} size={size} message="Your first record is waiting" hint="Beat any set and it lands here" />
      ) : size === 's' ? (
        /* ── ALL FOUR FACTS, LABELLED ──
           It read: an axis label, then `40 kg ×10`, then the exercise, then
           `58.7kg 1RM`. Every number was there and none of them said what it
           was — the weight and the reps were one glued string whose `×` had to
           carry the distinction, and the 1RM was a bare figure with a suffix.
           Four unlabelled numbers in a 112px tile is a tile you have to have
           learnt before it tells you anything.

           A three-column strip labels them instead. The type stays on its own
           line above, because it qualifies all three and is the one thing that
           changes what the others MEAN — `Most reps` and `Heaviest` are
           different claims about the same row. */
        <span className="flex-1 min-h-0 flex flex-col justify-between gap-0.5">
          <span className="flex items-baseline gap-1 min-w-0">
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] truncate" style={{ color: GOLD }}>
              {prAxisLabel(top.axis)}
            </span>
            <span className="text-[8px] text-muted ml-auto shrink-0">{daysAgo(top.achievedOn)}</span>
          </span>

          <span className="text-[10px] font-semibold text-text truncate leading-none">{top.exercise}</span>

          <span className="grid grid-cols-3 gap-1">
            <MicroStat label="kg" value={top.weightKg != null && top.weightKg > 0 ? displayWeight(top.weightKg) : null} />
            <MicroStat label="reps" value={top.reps} />
            {/* Two places, for the same reason `PrRecordSheet` gives: an e1RM
                is computed and moves in fractions, so a whole number here is a
                figure that has been rounded away from the one that was beaten. */}
            <MicroStat label="1RM" value={est1rm != null ? (displayWeight(est1rm) ?? est1rm).toFixed(2) : null} />
          </span>
        </span>
      ) : (
        <span className="flex-1 min-h-0 flex flex-col gap-1.5">
          <span className="block min-w-0">
            <span className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-[8px] font-bold uppercase tracking-[0.12em]" style={{ color: GOLD }}>
                {prAxisLabel(top.axis)}
              </span>
              <span className="text-[11px] text-text truncate">{top.exercise}</span>
              <span className="text-[8px] text-muted ml-auto shrink-0">{daysAgo(top.achievedOn)}</span>
            </span>
          </span>

          <span className="grid grid-cols-3 gap-1.5">
            <StatTile
              label="Weight"
              value={top.weightKg != null && top.weightKg > 0 ? displayWeight(top.weightKg) : null}
              unit={unit} color={GOLD}
            />
            <StatTile label="Reps" value={top.reps} color={GOLD} />
            <StatTile
              label="Est. 1RM"
              value={est1rm != null ? (displayWeight(est1rm) ?? est1rm).toFixed(2) : null}
              unit={unit} color={GOLD}
            />
          </span>

          {/* The rest of the standing book, most recent first. A record is only
              news next to the ones around it. */}
          <span className="block space-y-0.5 mt-auto pt-1 border-t border-white/[0.06]">
            {(prs ?? []).slice(1, 4).map((p) => (
              <span key={`${p.exercise}:${p.axis}`} className="flex items-baseline gap-2 min-w-0">
                <span className="text-[9px] text-muted truncate flex-1">{p.exercise}</span>
                <span className="text-[8px] text-muted/70 shrink-0">{prAxisLabel(p.axis)}</span>
                <span className="helix-num text-[9px] font-bold tabular-nums shrink-0" style={{ color: GOLD }}>
                  {p.weightKg != null && p.weightKg > 0 ? `${displayWeight(p.weightKg)}${unit}` : p.reps != null ? `${p.reps}r` : '—'}
                </span>
              </span>
            ))}
          </span>
        </span>
      )}
    </WidgetFrame>
  )
}

/**
 * A labelled number for a 112px tile — smaller than `StatTile`, and with no box.
 *
 * `StatTile` draws a tinted plate, which is right in a 2×2 of vitals and wrong
 * three-across in a small tile: three plates at that width is more border than
 * content. This is the same information with the chrome removed.
 */
function MicroStat({ label, value }: { label: string; value: number | string | null }) {
  return (
    <span className="min-w-0 flex flex-col gap-px">
      <span className="helix-num text-[12px] font-bold tabular-nums leading-none truncate"
        style={{ color: value == null ? MUTED : GOLD }}>
        {value ?? '—'}
      </span>
      <span className="text-[7px] uppercase tracking-[0.08em] text-muted leading-none truncate">{label}</span>
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * WORKOUT — the plan, the last run of it, and today's result
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TodaySessionStats {
  sessionId?: string | null
  volumeKg: number | null
  setCount: number | null
  prCount: number | null
  durationMin: number | null
  avgBpm?: number | null
  calories?: number | null
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
 *           its tonnage, its sets, its records, what your heart did. That is the
 *           bar to clear, and it is the only genuinely motivating thing a
 *           pre-workout tile can say. There is no "today" figure to show, so
 *           none is invented.
 *   AFTER   today's own tonnage, sets, records, duration, heart rate and burn —
 *           and at large, every lift with its working sets and its top load.
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
  // The per-exercise breakdown is large-only and post-workout only, so the
  // query is gated on both rather than fetched for every tile on the grid.
  const { data: detail } = useSessionDetail(
    size === 'l' && logged ? (today?.sessionId ?? null) : null,
  )
  const unit = weightUnit()

  // AMETHYST is the Shoulders family now, so a rest day tinted with it read as
  // a Delts & Arms day. REST is the one tone that means "no session".
  const accent = rest ? REST : EMERALD
  const meta = { ...WIDGET_META.train, accent, icon: rest ? Moon : WIDGET_META.train.icon }

  /** The stat grid for whichever session is being described. */
  const stats = (s: TodaySessionStats, color: string) => (
    <span className={`grid gap-1.5 ${size === 's' ? 'grid-cols-3' : 'grid-cols-5'}`}>
      <StatTile label="Volume" value={tonnage(displayWeight(s.volumeKg))} unit={unit} color={color} />
      <StatTile label="Sets" value={s.setCount ?? null} color={color} />
      <StatTile label="Records" value={s.prCount ?? 0} color={(s.prCount ?? 0) > 0 ? GOLD : color} />
      {size !== 's' && <StatTile label="Avg HR" value={s.avgBpm ?? null} unit="bpm" color={s.avgBpm != null ? OXIDE : color} />}
      {size !== 's' && <StatTile label="Burn" value={s.calories ?? null} unit="kcal" color={s.calories != null ? SAPPHIRE : color} />}
    </span>
  )

  const logLink = dayKey && (
    <Link
      href={`/session?template=${dayKey}&date=${logicalTodayISO()}`}
      onPointerUp={blurOnTap}
      onClick={(e) => e.stopPropagation()}
      className="mt-auto inline-flex items-center justify-center gap-1.5 min-h-[32px] rounded-xl
                 text-[11px] font-bold active:scale-95 transition-transform"
      style={{ background: `${EMERALD}24`, border: `1px solid ${EMERALD}59`, color: EMERALD }}
    >
      <Dumbbell className="w-3.5 h-3.5" aria-hidden="true" /> Log {rest ? 'a session' : day.label}
    </Link>
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
            {/* ── MEDIUM USED TO END IN A BAND OF NOTHING ──
                Title, then five stat tiles, then ~60px of empty tile — the
                body is a flex column and the only fixed-height child was the
                grid, so every pixel of slack piled up under it.

                Two changes, and both are information rather than padding. The
                session's duration takes the line under the title (it is the one
                figure the grid has no room for, and the tile is describing a
                workout that is over, so it exists). And the grid is anchored to
                the BOTTOM: the remaining slack becomes the gap between the
                identity and the numbers, which is the shape every other tile on
                the grid already has, instead of a hole beneath them. */}
            {size !== 's' && today.durationMin != null && (
              <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted">
                {today.durationMin} min under the bar
              </span>
            )}
            <span className={size === 'm' ? 'block mt-auto' : 'block'}>{stats(today, EMERALD)}</span>
            {/* Large lists what was actually done. `topKg` is the heaviest
                working load on the lift, which is the figure you compare against
                next week — not the volume, which mixes load and reps. */}
            {size === 'l' && (
              <span className="block flex-1 min-h-0 overflow-hidden mt-0.5">
                {detail?.exercises.length ? (
                  <span className="grid grid-cols-2 gap-x-2 gap-y-0.5 content-start">
                    {detail.exercises.map((e) => (
                      <span key={e.exerciseId} className="flex items-baseline gap-1.5 min-w-0">
                        <span className="text-[9px] text-muted truncate flex-1">{e.name}</span>
                        <span className="helix-num text-[9px] tabular-nums shrink-0 text-text">
                          {e.workingSets}×
                        </span>
                        <span className="helix-num text-[9px] font-bold tabular-nums shrink-0"
                          style={{ color: e.prAxes.length ? GOLD : EMERALD }}>
                          {e.topKg > 0 ? `${displayWeight(e.topKg)}${unit}` : 'BW'}
                        </span>
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted">
                    {today.durationMin != null ? `${today.durationMin} minutes under the bar.` : ''}
                  </span>
                )}
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
            {stats(last, MUTED)}
            {size !== 's' && logLink}
          </>
        ) : (
          <>
            <span className="text-[10px] text-muted leading-snug">
              First run of this one. Whatever you log becomes the bar.
            </span>
            {size !== 's' && logLink}
          </>
        )}
      </span>
    </WidgetFrame>
  )
}

/** Shared muted colour for a tile with a value but nothing to say about it. */
export const NEUTRAL = MUTED
