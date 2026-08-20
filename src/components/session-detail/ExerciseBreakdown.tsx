'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Medal, Timer, TrendingUp, ChevronRight } from 'lucide-react'
import type { DetailExercise, DetailSet } from '@/lib/hooks/useSessionDetail'
import { prAxisLabel, type PrAxis } from '@/lib/training/prEngine'
import { useSessionIntel } from '@/lib/hooks/useSessionIntel'
import { useSessionTrends, LOAD_STEP_KG } from '@/lib/hooks/useSessionTrends'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { isTimedExercise } from '@/lib/exercises/timed'
import { Surface } from '@/components/ui/Zone'
import { formatSet } from '@/lib/utils/setFormat'
import { rpeColor, rpeLabel } from '@/lib/training/effort'
import { exerciseColor } from '@/lib/theme/muscleHue'
import { useGlobalSetHistory, workingSets, type HistorySet } from '@/lib/hooks/useExerciseSetHistory'
import { repWindowFor, holdTargetFor } from '@/lib/training/ceilings'
import { restTargetFor, formatRestTarget } from '@/lib/training/restTargets'
import { eraForDate } from '@/lib/programs'
import { GOLD, OXIDE, EMERALD, SAPPHIRE, EMBER, STEEL, MUTED } from '@/lib/theme/palette'

// recharts lives ONLY in this sheet, which opens on tap. Loading it statically
// pulled the whole chart library into the Session Report's first-load bundle
// (~330 kB) even though it renders nothing until you tap an exercise. Deferring
// it keeps recharts out of the critical path of opening the report.
const ExerciseHistorySheet = dynamic(
  () => import('@/components/exercises/ExerciseHistorySheet').then((m) => m.ExerciseHistorySheet),
  { ssr: false },
)

// "Warmup" is eight characters on the one row that has no spare width: set
// number, load × reps, tag, trophy + axis chips, RPE and the 1RM column all
// share it, and the tag pushed the numbers into a wrap on a phone. "W" reads
// unambiguously in context (it is the only single-letter tag on a warm-up row)
// and the full word survives where there IS room — the weekly export writes
// "(Warmup)" verbatim (weeklyExport.ts), which is what a coach reads.
// "Dropset" and "Failure" are seven characters each — the same overflow the
// warm-up tag was already shortened for. All three are single letters now, with
// the full word in the tooltip, and the LOGGER uses exactly the same three tags
// (SetEditorRow) so a set reads identically while you type it and after.
//
// Warm-up is EMBER, not emerald. Ember is the documented set-type colour, and
// emerald already means "committed" in the logger — a green warm-up chip on a
// green-ticked row says two things at once.
const TAG: Record<string, { label: string; full: string; color: string }> = {
  warmup: { label: 'W', full: 'Warm-up', color: EMBER },
  failure: { label: 'F', full: 'Taken to failure', color: OXIDE },
  dropset: { label: 'D', full: 'Drop set', color: '#9A6DD7' },
}

/**
 * vs-last-same-type glyph: ⬆️ improved · ═ held · ⬇️ regressed · 🆕 baseline.
 *
 * ✅ used to mean "matched", off top LOAD alone — which on a double-progression
 * program is most weeks, because the load is deliberately held while reps climb.
 * The basis is estimated 1RM now (see `useSessionIntel`), so the arrow moves when
 * the training does; a tick that never changes is not feedback.
 */
function deltaGlyph(delta: -1 | 0 | 1 | null | undefined): string | null {
  if (delta === undefined) return null
  if (delta == null) return '🆕'
  return delta === 1 ? '⬆️' : delta === -1 ? '⬇️' : '═'
}

/** Continuous est-1RM trend — one point per session. */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null
  const min = Math.min(...points), max = Math.max(...points)
  const span = max - min || 1
  const n = points.length - 1
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / n) * 44 + 1} ${18 - ((v - min) / span) * 14}`).join(' ')
  const lastY = 18 - ((points[n] - min) / span) * 14
  return (
    <svg viewBox="0 0 48 22" className="w-16 h-6 shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
      <circle cx={45} cy={lastY} r="1.8" fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
    </svg>
  )
}

/**
 * Group sets into display rows. A unilateral pair (two rows sharing a `pairId`,
 * one 'L' one 'R') collapses to ONE row carrying both sides as sub-set chips.
 *
 * Warm-ups keep their place in the sequence but do NOT consume a set number —
 * "Set 1" should be the first WORKING set, which is what the program
 * prescribes and what "2/3 sets at ceiling" is counted against.
 */
type Row =
  | { kind: 'single'; num: number | null; set: DetailSet }
  | { kind: 'pair'; num: number | null; left?: DetailSet; right?: DetailSet }

export function toRows(sets: DetailSet[]): Row[] {
  const rows: Row[] = []
  const byPair = new Map<string, Extract<Row, { kind: 'pair' }>>()
  let num = 0
  for (const s of sets) {
    const counts = s.setType !== 'warmup'
    if (s.pairId) {
      let g = byPair.get(s.pairId)
      if (!g) {
        if (counts) num += 1
        g = { kind: 'pair', num: counts ? num : null }
        byPair.set(s.pairId, g)
        rows.push(g)
      }
      if (s.side === 'R') g.right = s; else g.left = s
    } else {
      if (counts) num += 1
      rows.push({ kind: 'single', num: counts ? num : null, set: s })
    }
  }
  return rows
}

/**
 * The ledger's column template — declared once, used by the header row and
 * every data row, so a column cannot be added to one without the other.
 *
 * Column 1 grew 18px → 26px to carry the badge box (see `SetBadge`).
 *
 * ── WHY COLUMN 4 IS A FIXED WIDTH AND NOT `max-content` ──────────────────────
 * The effort column was a hard 46px, which at 10px bold uppercase fits about
 * six characters — so "VERY HARD" and "MAX EFFORT", the two ratings a reader
 * most wants, were the two that ellipsized. The obvious fix is to let the word
 * size the column. It does not work here and the browser probe caught it:
 * every ROW is its own grid container, so `max-content` resolves per row, and a
 * row whose effort is blank gives that width back to the columns beside it.
 * Measured drift across five rows: 14px. Columns that move are not columns.
 *
 * So the width is fixed, and it is the WORD that gives — wrapping to a second
 * line rather than being cut. A rating split over two lines is still a rating
 * you can read; "VER…" is not.
 *
 * The three widths are measured, not guessed. At 360px the row has 280px to
 * share after the badge and the gaps, and the binding constraint is the widest
 * real load — "102.25kg × 8", which is 107px of monospace at this size. An
 * earlier split gave column 2 exactly 106.7px of text in a 107px box: it "fit"
 * by a quarter of a pixel and the browser drew an ellipsis anyway. So column 2
 * takes the larger share, Prev (a muted reference, and the one thing here that
 * can afford to be abbreviated) gives some back, and the effort column keeps
 * enough for "R VERY HARD" — the widest string it ever holds, from a unilateral
 * pair whose sides were rated differently.
 */
const LEDGER_GRID =
  'grid grid-cols-[26px_minmax(0,1.25fr)_minmax(0,0.95fr)_64px] gap-2 pl-[18px] pr-3'

/** One side's effort, when the two sides of a pair disagree. */
function Effort({ side, rpe }: { side: 'L' | 'R'; rpe: number }) {
  return (
    <span className="flex items-baseline gap-1 justify-end" style={{ color: rpeColor(rpe) }} title={`${side} — effort ${rpe} / 10`}>
      <span className="opacity-60">{side}</span>
      {rpeLabel(rpe)}
    </span>
  )
}

/**
 * Pair each display row with the previous session's matching set(s).
 *
 * ── THE OFF-BY-ONE THIS FIXES ────────────────────────────────────────────────
 * It was `prevSets[row.num - 1]`. `row.num` counts a unilateral PAIR as one set
 * (correctly — a pair is one set of work), but `prevSets` comes from
 * `workingSets()`, which returns one entry per PHYSICAL set and therefore two
 * per pair. So on any unilateral movement the Prev column drifted one place
 * further out of step with every pair above it: set 2 quoted set 1's left side,
 * set 3 quoted set 2's left side, and the last row quoted nothing at all.
 *
 * Walking the rows and advancing by what each one actually consumes is the only
 * indexing that holds for both kinds. Warm-ups consume nothing — `workingSets`
 * already filtered them out, and a light first set matched against last week's
 * working set compares two different things.
 */
function rowsWithPrev(rows: Row[], prevSets: HistorySet[]): Array<{
  row: Row; prev?: HistorySet; prevRight?: HistorySet
}> {
  let i = 0
  return rows.map((row) => {
    if (row.num == null) return { row }              // warm-up: no counterpart
    if (row.kind === 'pair') {
      const out = { row, prev: prevSets[i], prevRight: prevSets[i + 1] }
      i += 2
      return out
    }
    return { row, prev: prevSets[i++] }
  })
}

/**
 * The set's identity, in one box.
 *
 * ── WHAT IT REPLACES ─────────────────────────────────────────────────────────
 * Three separate mechanisms that could not agree when a set was more than one
 * thing at once:
 *
 *   · W and F REPLACED the number in an 18px column;
 *   · D did not — it was a chip in the load cell, next to the numbers;
 *   · a record was a trophy in the load cell too, two columns from the number
 *     it was about, and on a unilateral pair it rendered TWICE.
 *
 * So a set taken to failure that also set a record showed `F` where its number
 * used to be, a trophy two columns over, and a gold wash across the row — three
 * marks for one set, with the ordinal gone entirely and nothing tying them
 * together. This is the same box the live logger uses (`SetEditorRow`), so the
 * ledger and the deck finally describe a set the same way.
 *
 * Precedence: a type letter beats the ordinal (a warm-up is not "set 1 of 4",
 * it IS the W), and a record beats a bare ordinal. When BOTH are true the
 * letter keeps the box — the type is the more specific fact about what the set
 * WAS — and the record is carried by a gold border and a gold corner dot. One
 * badge, two facts, no ambiguity about which set it belongs to.
 */
function SetBadge({ num, tag, isPr, timed, axes = [] }: {
  num: number | null
  tag?: { label: string; full: string; color: string }
  isPr: boolean
  timed: boolean
  /** `prAxes` is read defensively: the query cache persists to localStorage, so
   *  a device opening a session it viewed BEFORE the field existed rehydrates
   *  sets without it. The medal alone is the correct degraded state. */
  axes?: PrAxis[]
}) {
  const ordinal = num != null ? `set ${num}` : 'set'
  const prPart = isPr
    ? ` — personal record${axes.length ? ` (${axes.map((a) => prAxisLabel(a, timed)).join(', ')})` : ''}`
    : ''
  const label = tag ? `${tag.full}, ${ordinal}${prPart}` : `${ordinal[0].toUpperCase()}${ordinal.slice(1)}${prPart}`

  const face = tag?.color ?? (isPr ? GOLD : null)
  return (
    <span
      className="relative w-6 h-6 shrink-0 rounded-md flex items-center justify-center
                 helix-num text-[11px] font-bold uppercase"
      style={face
        ? { color: face, background: `${face}1f`, border: `1px solid ${isPr ? GOLD : `${face}55`}` }
        : { color: 'rgba(255,255,255,0.55)' }}
      title={label}
      aria-label={label}
    >
      {tag ? tag.label : isPr ? <Medal className="w-3.5 h-3.5" aria-hidden="true" /> : (num != null ? num : '·')}
      {/* The record, when the letter already owns the box. Small on purpose —
          the row's gold wash is the loud signal; this is what ties that wash to
          a specific set rather than to the row it happens to be on. */}
      {isPr && tag && (
        <span className="absolute -top-0.5 -right-0.5 w-[5px] h-[5px] rounded-full"
          style={{ background: GOLD, boxShadow: `0 0 4px ${GOLD}` }} aria-hidden="true" />
      )}
    </span>
  )
}

/**
 * Session Report exercises — a GROUPED LEDGER, not a stack of cards.
 *
 * Each exercise used to be its own glass card: border, backdrop blur, shadow,
 * padding, a title row carrying up to five chips, a muscle-chip row, a
 * metadata row, a progression row, then the sets. The chrome was most of the
 * pixels and it repeated per exercise, so the more you trained the worse the
 * report got — six exercises meant a full-screen scroll to read numbers that
 * occupy two columns.
 *
 * One container, hairline dividers, dense monospace set rows. The muscle-group
 * accent survives as a 3px rule beside the header, which is the only thing the
 * card border was actually communicating. Records moved out to
 * `SessionHighlights` at the top; the three metadata rows collapsed to one.
 *
 * Every set stays VISIBLE. Collapsing them behind a tap would be shorter still,
 * but a session report you have to expand six times is not a report.
 */
/**
 * The double-progression decision, compressed to a chip.
 *
 * `ready` means the load ceiling was cleared on two consecutive sessions of
 * this routine day — add load. `one-more` means once more will do it. Anything
 * else has nothing to say and must render nothing: a cue that always appears is
 * a cue nobody reads.
 */
export function progressionCue(
  t: { progression: { state: string; ceiling: number | null; suggestKg: number | null } } | undefined,
  timed: boolean,
  unit: string,
): { short: string; title: string; color: string } | null {
  const p = t?.progression
  if (!p || (p.state !== 'ready' && p.state !== 'one-more')) return null
  const ceil = `${p.ceiling}${timed ? 's' : ' reps'}`
  if (p.state === 'one-more') {
    return { short: '1 more', title: `One more clean session at ${ceil}`, color: GOLD }
  }
  if (timed) return { short: 'extend', title: `Cleared twice — extend past ${p.ceiling}s`, color: EMBER }
  // No load to add on bodyweight work; the cue is reps.
  if (p.suggestKg == null) return { short: 'extend', title: `Cleared twice — extend past ${ceil}`, color: EMBER }
  return {
    short: `+${LOAD_STEP_KG}${unit}`,
    title: `Cleared twice — add ${LOAD_STEP_KG}${unit} to ${displayWeight(p.suggestKg)}${unit}`,
    color: EMBER,
  }
}

/**
 * The six facts a finished exercise has, computed once.
 *
 * ── WHY THIS IS A STRIP AND NOT A PARAGRAPH ──────────────────────────────────
 * The report already carried tonnage and set count in a run-on metadata line
 * and left everything else to be reconstructed by reading the ledger: total
 * reps by adding them up, effort by scanning for the ratings, rest by not being
 * recorded at all. Those are the questions asked of a finished session, and a
 * reader should not have to do arithmetic on their own workout.
 *
 * REST IS MEASURED OR ABSENT. `restSec` exists only for sessions logged through
 * the deck's tick — see `WorkoutSetSchema`. Historic and pasted sessions show a
 * dash, never a zero, because nobody rested for no time.
 *
 * Warm-ups are excluded from every figure except the set count they never had:
 * they are not the work, and a light first set drags a mean down.
 */
export function exerciseStats(ex: DetailExercise): {
  totalReps: number
  avgRpe: number | null
  medianRestSec: number | null
  topKg: number
} {
  const working = ex.sets.filter((s) => s.setType !== 'warmup')
  // A unilateral pair is ONE set of work, so its reps count once — the same
  // rule tonnage already uses, and the reason this cannot just sum the rows.
  const seen = new Set<string>()
  let totalReps = 0
  for (const s of working) {
    const key = s.pairId ?? `#${s.setNumber}-${s.side ?? ''}`
    if (s.pairId && seen.has(key)) continue
    seen.add(key)
    totalReps += s.reps
  }

  const rpes = working.map((s) => s.rpe).filter((v): v is number => v != null)
  const avgRpe = rpes.length
    ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10
    : null

  // MEDIAN, not mean: one set interrupted by a conversation should not move the
  // number that describes how you actually paced the exercise.
  const rests = working.map((s) => s.restSec).filter((v): v is number => v != null && v > 0).sort((a, b) => a - b)
  const medianRestSec = rests.length ? rests[Math.floor(rests.length / 2)] : null

  return {
    totalReps,
    avgRpe,
    medianRestSec,
    topKg: working.reduce((m, s) => Math.max(m, s.weightKg), 0),
  }
}

/** "12 Aug" — the date the PREVIOUS column is quoting. */
const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** "1:30" / "45s" — a rest interval, or null. */
export function formatRest(sec: number | null): string | null {
  if (sec == null || sec <= 0) return null
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

export function ExerciseBreakdown({ sessionId, exercises, date, dayKey }: {
  sessionId: string
  exercises: DetailExercise[]
  date: string
  /** Program day, so an exercise on two days uses the RIGHT rep window. */
  dayKey?: string | null
}) {
  const unit = useUnitSystem()
  const { data: intel } = useSessionIntel(sessionId)
  const exerciseIds = useMemo(() => exercises.map((e) => e.exerciseId), [exercises])
  const { data: trends } = useSessionTrends(exerciseIds, date, dayKey)

  /**
   * The PREVIOUS column: what these exact sets looked like last time.
   *
   * Global, not routine-scoped — "last time I pressed" is a fact about the
   * movement, and scoping it to this program day empties the column on every
   * exercise that appears in two splits, which is most of them.
   *
   * `date` is passed as an EXCLUSIVE bound. Without it the hook answers with the
   * most recent session full stop, so opening a July workout would compare each
   * set against August: a report grading itself against its own future.
   */
  const names = useMemo(() => exercises.map((e) => e.name), [exercises])
  const { data: globalHistory } = useGlobalSetHistory(names, eraForDate(date), date)
  const [active, setActive] = useState<{ id: string; name: string } | null>(null)
  const deltaFor = useMemo(
    () => new Map((intel?.deltas ?? []).map((d) => [d.exerciseId, d.delta])),
    [intel],
  )

  return (
    /* The report is three bands now, and this is the third — so no rounded
       bordered box of its own. It was already the densest and best-argued thing
       on the page; all it loses is the frame. */
    <Surface variant="band" pad="none">
      {exercises.map((ex, i) => {
        const timed = isTimedExercise(ex.name)
        const glyph = deltaGlyph(deltaFor.get(ex.exerciseId))
        const t = trends?.[ex.exerciseId]
        const rows = toRows(ex.sets)
        // Per-EXERCISE hue, not per-family. `exerciseColor` already existed and
        // was used only by the library route, so this page painted six muscle
        // groups with six colours: every pressing movement on a push day shared
        // one rule and one sparkline colour, and nothing told them apart.
        const accent = exerciseColor(ex.name, ex.muscleGroups)
        const cue = progressionCue(t, timed, unit)
        const stats = exerciseStats(ex)
        const prevSets = workingSets(globalHistory?.get(ex.name))
        const prevDate = globalHistory?.get(ex.name)?.date ?? null

        // The prescription, said the way the program says it: how many sets, at
        // what rep window, on what rest. It was previously spread across a
        // "3×" fragment in the header and two cells of a six-cell table.
        const window = timed
          ? (holdTargetFor(ex.name, dayKey) != null ? `${holdTargetFor(ex.name, dayKey)}s` : null)
          : (() => { const w = repWindowFor(ex.name, dayKey); return w ? `${w.floor}–${w.ceiling}` : null })()
        const rest = formatRest(stats.medianRestSec)
        const restTarget = restTargetFor(ex.name, dayKey)
        const prescription = [
          `${ex.workingSets} set${ex.workingSets === 1 ? '' : 's'}${window ? ` @ ${window}` : ''}`,
          rest ? `${rest} rest` : null,
        ].filter(Boolean).join(' · ')

        return (
          <section key={ex.exerciseId} style={{ borderTop: i ? '1px solid rgba(255,255,255,0.07)' : undefined }}>
            {/* ── THE HEADER, AS ONE TINTED LAYER ──
                What was here: a header line carrying "3× · 2,940kg · +4% ·
                2/3 @ 12", then a six-cell bordered table under it repeating
                volume, sets and reps at 8px — the smallest type in the app,
                spent on labels rather than on data.

                What is here now: the title, the PRESCRIPTION (sets, rep window,
                rest — what the program asked for), and one metadata strip of
                the four numbers the session actually produced. The exercise's
                own colour washes the whole block, so scrolling a six-exercise
                report reads as six distinct movements rather than one long
                ledger. */}
            <div style={{ background: `linear-gradient(180deg, ${accent}14, transparent)` }}>
              <button onClick={() => setActive({ id: ex.exerciseId, name: ex.name })}
                className="w-full flex items-center gap-2.5 pl-2.5 pr-3 pt-2 pb-1 text-left active:bg-white/[0.04] transition-colors"
                aria-label={`${ex.name} history`}>
                <span className="w-[3px] self-stretch rounded-full shrink-0" style={{ background: accent }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5 min-w-0">
                    {/* The report is a document — it can afford a second line,
                        and "Leg Press Horizontal (Machine)" cut to "Leg Press
                        Horizontal (Mac…" on the page that exists to record what
                        you did is the wrong trade. The deck still truncates. */}
                    <span className="font-heading font-bold uppercase tracking-wide text-text min-w-0"
                      style={{ fontSize: 'var(--text-exercise-title)' }}>{ex.name}</span>
                    {/* Emoji carry their own line box; without an explicit size
                        and leading they lift the title's baseline off the row. */}
                    {glyph && (
                      <span className="shrink-0" style={{ fontSize: 11, lineHeight: 1 }} aria-hidden="true">{glyph}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted helix-num">
                    <span className="truncate">{prescription}</span>
                    {t?.progression.ceiling != null && t.setsAtCeiling > 0 && (
                      <span className="shrink-0" title={`Working sets that reached the ${t.progression.ceiling}${timed ? 's' : '-rep'} ceiling`}>
                        · {t.setsAtCeiling}/{ex.workingSets} @ ceiling
                      </span>
                    )}
                  </span>
                </span>
                {/* The progression cue is a property of the EXERCISE, so it reads
                    on the exercise's own line. It used to be a bordered, tinted
                    block below the ledger with a full sentence in it — a second
                    paragraph-shaped object per movement, which on a five-exercise
                    day was five more frames. The sentence survives in the title;
                    the chip carries the decision. */}
                {cue && (
                  <span title={cue.title}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold shrink-0"
                    style={{ color: cue.color, background: `${cue.color}1a`, border: `1px solid ${cue.color}3d` }}>
                    <TrendingUp className="w-2.5 h-2.5" aria-hidden="true" />{cue.short}
                  </span>
                )}
                {t ? <Sparkline points={t.points} color={accent} />
                  : <ChevronRight className="w-4 h-4 text-muted/50 shrink-0" aria-hidden="true" />}
              </button>

              {/* Four numbers, no boxes. Wraps rather than scrolls — a strip you
                  have to drag sideways is a strip nobody reads the end of. */}
              <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap pl-[22px] pr-3 pb-2">
                <Meta label="Vol" value={t?.byReps
                  ? `${t.tonnage}${t.timed ? 's' : ''}`
                  : `${Math.round(displayWeight(ex.volumeKg) ?? 0).toLocaleString()}${unit}`}
                  delta={t?.pctChange ?? null} />
                <Meta label={timed ? 'Secs' : 'Reps'} value={`${stats.totalReps}`} />
                <Meta label="Top" value={stats.topKg > 0 ? `${displayWeight(stats.topKg)}${unit}` : '—'} />
                {/* MEASURED, and now labelled as such. It sat under the word
                    "Rest" beside the prescribed target added below, and two
                    numbers both called rest is one number nobody trusts. */}
                <Meta label="Actual" value={rest ?? '—'}
                  title={rest
                    ? 'Median measured rest between sets'
                    : 'Rest is measured from the logger — sessions logged elsewhere carry none'} />
                {/* ── THE TARGET THE PLAN ASKED FOR ──
                    Same chip as the live logger's header, same source
                    (`restTargets.ts`), same silence: a reading, never a
                    countdown. The report could not say what the prescription
                    WAS, so a 2:30 median next to a 1:30 target read as a normal
                    session. `dayKey` was already being passed to this component
                    — Calf Press rests differently on Legs A and Legs B. */}
                {restTarget != null && (
                  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-px rounded-md text-[10px] font-bold"
                    style={{ color: STEEL, background: `${STEEL}14`, border: `1px solid ${STEEL}3d` }}
                    title="Target rest between sets, from the plan">
                    <Timer className="w-2.5 h-2.5" aria-hidden="true" />
                    <span className="helix-num">{formatRestTarget(restTarget)}</span>
                  </span>
                )}
              </div>
            </div>

            {/* ── Set ledger ──
                Four columns on a real grid, not eight items on a flex line.
                The old row put set number, load × reps, tag, trophy, effort,
                estimated 1RM and rest on ONE non-wrapping line, of which only
                the "prev" fragment was width-guarded — so a sided failure set on
                a 390px phone compressed its own numbers against the tick button.

                The 1RM column is gone. It was a derived figure printed on every
                row of every session, and the one place it is actually read — the
                movement's own best — has a tile of its own in the library. Rest
                went with it: the MEDIAN is in the header, which is the question
                ("how did I pace this?"), and per-set rest survives in the title. */}
            <div className="pb-1.5">
              <div data-set-head className={`${LEDGER_GRID} items-baseline pb-1
                text-[9px] font-bold uppercase tracking-[0.1em] text-muted/60`}>
                <span aria-hidden="true" />
                <span className="truncate">{timed ? 'Load × Secs' : 'Weight × Reps'}</span>
                <span className="truncate" title={prevDate ? `Last performed ${prevDate}` : undefined}>
                  {prevSets.length && prevDate ? `Prev · ${shortDate(prevDate)}` : 'Prev'}
                </span>
                <span className="text-right">Effort</span>
              </div>
              {rowsWithPrev(rows, prevSets).map(({ row, prev, prevRight }, ri) => {
                const tagKey = row.kind === 'single' ? row.set.setType : (row.left?.setType ?? row.right?.setType)
                const tag = tagKey ? TAG[tagKey] : undefined
                // A record should be visible while scanning the ledger, not only
                // once your eye reaches the badge: the row that set it lifts
                // into gold and carries a left rule, which survives printing.
                const rowIsPr = row.kind === 'single'
                  ? !!row.set.isPr
                  : !!(row.left?.isPr || row.right?.isPr)
                const axes = row.kind === 'single'
                  ? (row.set.prAxes ?? [])
                  : ((row.left?.isPr ? row.left.prAxes : row.right?.prAxes) ?? [])

                // ── ONE SET OF WORK, ONE OF EACH THING ──
                // A pair is one set: one badge, one record, one row. Both sides
                // used to carry their own trophy, so a pair that PR'd on both
                // rendered two of them inside two chips inside one cell.
                const same = row.kind === 'pair' && !!row.left && !!row.right
                  && row.left.weightKg === row.right.weightKg && row.left.reps === row.right.reps
                const effortSplit = row.kind === 'pair' && !!row.left && !!row.right
                  && row.left.rpe != null && row.right.rpe != null && row.left.rpe !== row.right.rpe
                const pairRpe = row.kind === 'pair'
                  ? Math.max(row.left?.rpe ?? -1, row.right?.rpe ?? -1) : -1
                const rpe = row.kind === 'single' ? row.set.rpe : (pairRpe < 0 ? null : pairRpe)

                return (
                  <div key={`${row.kind}-${ri}`}
                    // Marks the set rows for the layout probe and the render
                    // tests. A class selector cannot do this job: the grid
                    // template is a Tailwind arbitrary value, so matching it
                    // means matching on `[` inside an attribute selector.
                    data-set-row={row.kind}
                    style={rowIsPr ? { background: `${GOLD}12`, boxShadow: `inset 3px 0 0 ${GOLD}` } : undefined}
                    className={`${LEDGER_GRID} items-center py-[3px] text-fluid-base`}>
                    <SetBadge num={row.num} tag={tag} isPr={rowIsPr} timed={timed} axes={axes} />

                    {row.kind === 'single' ? (
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="helix-num font-semibold text-text truncate"
                          title={formatRest(row.set.restSec) ? `Rested ${formatRest(row.set.restSec)} before this set` : undefined}>
                          {formatSet(row.set.weightKg, row.set.reps, { timed, unit, toDisplay: displayWeight })}
                        </span>
                      </span>
                    ) : (
                      /* ── THE SIDE CHIPS ARE GONE ──
                         Each side used to be a bordered, tinted chip holding a
                         letter, a value and a trophy — with the letter and the
                         trophy both `shrink-0`, so the only thing that could
                         give ground inside a half-width column was the number.
                         `8.75kg × 12` clipped to `8.7`, on the one screen whose
                         entire job is to report what you lifted. Two chips also
                         cost ~32px of border and padding to say two letters.

                         Now: a plain coloured letter and the value, stacked,
                         with the whole column to spend and no `truncate` on the
                         figure. And when both sides did the same thing, they
                         say it ONCE — two identical lines is not information. */
                      <span className="flex flex-col gap-0.5 min-w-0">
                        {same ? (
                          <span className="flex items-baseline gap-1.5 min-w-0">
                            <span className="helix-num font-semibold text-text">
                              {formatSet(row.left!.weightKg, row.left!.reps, { timed, unit, toDisplay: displayWeight })}
                            </span>
                            <span className="text-[9px] font-bold tracking-wide shrink-0"
                              style={{ color: MUTED }} title="Both sides, identical">L=R</span>
                          </span>
                        ) : (
                          (['left', 'right'] as const).map((k) => {
                            const sd = row[k]
                            if (!sd) return null
                            return (
                              <span key={k} className="flex items-baseline gap-1.5 min-w-0">
                                <span className="text-[9px] font-bold w-2 shrink-0"
                                  style={{ color: k === 'left' ? SAPPHIRE : EMBER }}>
                                  {k === 'left' ? 'L' : 'R'}
                                </span>
                                <span className="helix-num font-semibold text-text">
                                  {formatSet(sd.weightKg, sd.reps, { timed, unit, toDisplay: displayWeight })}
                                </span>
                              </span>
                            )
                          })
                        )}
                      </span>
                    )}

                    {/* The same set, last time you did this movement — on ANY
                        day, which is why a Friday leg curl can quote Monday's. */}
                    <span className="helix-num text-fluid-xs text-muted/70 flex flex-col gap-0.5 min-w-0">
                      <span className="truncate">
                        {prev ? formatSet(prev.weightKg, prev.reps, { timed, unit, toDisplay: displayWeight }) : '—'}
                      </span>
                      {row.kind === 'pair' && !same && prevRight && (
                        <span className="truncate">
                          {formatSet(prevRight.weightKg, prevRight.reps, { timed, unit, toDisplay: displayWeight })}
                        </span>
                      )}
                    </span>

                    {/* The word, not just the number — "8.5" means nothing to a
                        reader who has not memorised the ladder, and legacy rows
                        hold off-ladder values (6, 7, 8) that still resolve to a
                        CR10 anchor rather than a dash.

                        NO `truncate`, and the column sizes to its content. It
                        was a hard 46px, which at 10px bold uppercase fits about
                        six characters — so VERY HARD and MAX EFFORT, the two
                        ratings that matter most, were the two that got cut. */}
                    {effortSplit ? (
                      /* Consolidated weight, split effort: the case where the
                         two sides did the same work and one of them was harder,
                         which is the asymmetry actually worth reporting. */
                      <span className="flex flex-col gap-0.5 items-end text-[9px] font-bold uppercase tracking-wide leading-tight text-right">
                        <Effort side="L" rpe={row.left!.rpe!} />
                        <Effort side="R" rpe={row.right!.rpe!} />
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold uppercase tracking-wide leading-tight text-right"
                        style={{ color: rpe != null ? rpeColor(rpe) : 'transparent' }}
                        title={rpe != null ? `Effort ${rpe} / 10` : undefined}>
                        {rpe != null ? rpeLabel(rpe) : '—'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      <ExerciseHistorySheet
        exerciseId={active?.id ?? null}
        exerciseName={active?.name ?? ''}
        open={!!active}
        onClose={() => setActive(null)}
      />
    </Surface>
  )
}

/**
 * One fact in an exercise's metadata layer.
 *
 * Replaces `Cell`, which drew a bordered box per number by laying six divs on a
 * translucent background with `gap-px` — a table with 8px labels, the smallest
 * type in the app, spent on saying "SETS". Label and value sit on one baseline
 * here, so four facts cost one line instead of two rows of chrome.
 */
function Meta({ label, value, delta, title }: {
  label: string
  value: string
  /** Percent change vs the previous session of this type, when there is one. */
  delta?: number | null
  title?: string
}) {
  return (
    <span className="inline-flex items-baseline gap-1 min-w-0" title={title}>
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted shrink-0">{label}</span>
      <span className="helix-num text-[11px] font-bold text-text tabular-nums truncate">{value}</span>
      {delta != null && delta !== 0 && (
        <span className="helix-num text-[9px] font-bold tabular-nums shrink-0"
          style={{ color: delta > 0 ? EMERALD : OXIDE }}>
          {delta > 0 ? '+' : ''}{delta}%
        </span>
      )}
    </span>
  )
}
