'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Trophy, TrendingUp, ChevronRight } from 'lucide-react'
import type { DetailExercise, DetailSet } from '@/lib/hooks/useSessionDetail'
import { prAxisLabel } from '@/lib/training/prEngine'
import { useSessionIntel } from '@/lib/hooks/useSessionIntel'
import { useSessionTrends, LOAD_STEP_KG } from '@/lib/hooks/useSessionTrends'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { isTimedExercise } from '@/lib/exercises/timed'
import { Surface } from '@/components/ui/Zone'
import { formatSet } from '@/lib/utils/setFormat'
import { rpeColor, rpeLabel } from '@/lib/training/effort'
import { GROUP_COLOR } from '@/lib/hooks/useMuscleAnalytics'
import { GOLD, OXIDE, EMERALD, SAPPHIRE, EMBER, PLATINUM } from '@/lib/theme/palette'

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
 * vs-last-same-type glyph: 📈 improved · ═ held · 📉 regressed · 🆕 baseline.
 *
 * ✅ used to mean "matched", off top LOAD alone — which on a double-progression
 * program is most weeks, because the load is deliberately held while reps climb.
 * The basis is estimated 1RM now (see `useSessionIntel`), so the arrow moves when
 * the training does; a tick that never changes is not feedback.
 */
function deltaGlyph(delta: -1 | 0 | 1 | null | undefined): string | null {
  if (delta === undefined) return null
  if (delta == null) return '🆕'
  return delta === 1 ? '📈' : delta === -1 ? '📉' : '═'
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
    <svg viewBox="0 0 48 22" className="w-11 h-5 shrink-0" aria-hidden="true">
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

/** Trophy + axis labels, on the set row that earned them. */
function SetPrBadges({ set, timed, compact = false }: { set: DetailSet; timed: boolean; compact?: boolean }) {
  if (!set.isPr) return null
  // `prAxes` is read defensively: the query cache persists to localStorage, so a
  // device that opens a session it viewed BEFORE this field existed rehydrates
  // sets without it. The trophy alone is the correct degraded state.
  const axes = set.prAxes ?? []
  if (compact || !axes.length) {
    return <Trophy className={compact ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} style={{ color: GOLD }} aria-hidden="true" />
  }
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <Trophy className="w-3 h-3 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
      {axes.map((ax) => (
        <span key={ax} className="text-[8px] font-bold uppercase px-1 py-px rounded"
          style={{ color: GOLD, background: `${GOLD}1f`, border: `1px solid ${GOLD}4d` }}>
          {prAxisLabel(ax, timed)}
        </span>
      ))}
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
        const accent = GROUP_COLOR[ex.muscleGroups[0]] ?? PLATINUM
        const cue = progressionCue(t, timed, unit)
        const stats = exerciseStats(ex)

        return (
          <section key={ex.exerciseId} style={{ borderTop: i ? '1px solid rgba(255,255,255,0.07)' : undefined }}>
            {/* ── Header: accent rule · NAME · totals · trend ── */}
            <button onClick={() => setActive({ id: ex.exerciseId, name: ex.name })}
              className="w-full flex items-center gap-2.5 pl-2.5 pr-3 py-2 text-left active:bg-white/[0.04] transition-colors"
              aria-label={`${ex.name} history`}>
              <span className="w-[3px] self-stretch rounded-full shrink-0" style={{ background: accent }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5 min-w-0">
                  <span className="font-heading font-bold uppercase tracking-wide leading-tight text-text truncate"
                    style={{ fontSize: 'var(--text-exercise-title)' }}>{ex.name}</span>
                  {glyph && <span className="text-[10px] shrink-0" aria-hidden="true">{glyph}</span>}
                </span>
                {/* ONE metadata line. Was three — muscle chips, a totals line,
                    and a separate tonnage / top-set / ceiling row. */}
                <span className="flex items-center gap-1.5 text-[10px] text-muted helix-num">
                  <span>{ex.workingSets}×</span>
                  <span aria-hidden="true">·</span>
                  {/* Tonnage is kg only when the movement is loaded; for a hold
                      or bodyweight work `tonnage` counts seconds / reps. */}
                  <span>{t?.byReps ? `${t.tonnage} ${t.timed ? 'sec' : 'reps'}`
                    : `${Math.round(displayWeight(ex.volumeKg) ?? 0).toLocaleString()}${unit}`}</span>
                  {t?.pctChange != null && t.pctChange !== 0 && (
                    <span className="font-bold" style={{ color: t.pctChange > 0 ? EMERALD : OXIDE }}>
                      {t.pctChange > 0 ? '+' : ''}{t.pctChange}%
                    </span>
                  )}
                  {t?.progression.ceiling != null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{t.setsAtCeiling}/{ex.workingSets} @ {t.progression.ceiling}{timed ? 's' : ''}</span>
                    </>
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

            {/* ── The exercise's own numbers, as a strip ──
                Effort, PRs, tonnage, sets, reps and rest, side by side. Each
                cell renders a dash when the fact does not exist, rather than
                disappearing — a strip whose cells come and go cannot be
                compared between two exercises at a glance, which is the only
                reason to put them in a row. */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-px mx-2.5 mb-1.5 rounded-lg overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.05)' }}>
              <Cell label="Volume" value={t?.byReps
                ? `${t.tonnage}${t.timed ? 's' : ''}`
                : `${Math.round(displayWeight(ex.volumeKg) ?? 0).toLocaleString()}${unit}`} />
              <Cell label="Sets" value={`${ex.workingSets}`} />
              <Cell label={timed ? 'Seconds' : 'Reps'} value={`${stats.totalReps}`} />
              <Cell label="Top" value={stats.topKg > 0 ? `${displayWeight(stats.topKg)}${unit}` : '—'} />
              <Cell label="Effort" value={stats.avgRpe != null ? rpeLabel(stats.avgRpe) : '—'}
                color={stats.avgRpe != null ? rpeColor(stats.avgRpe) : undefined} />
              <Cell label="Rest" value={formatRest(stats.medianRestSec) ?? '—'}
                title={stats.medianRestSec != null
                  ? 'Median measured rest between sets'
                  : 'Rest is measured from the logger — sessions logged elsewhere carry none'} />
            </div>

            {/* ── Set ledger ── */}
            <div className="pb-1.5">
              {rows.map((row, ri) => {
                const tag = row.kind === 'single' ? TAG[row.set.setType] : undefined
                // A record should be visible while scanning the ledger, not only
                // once your eye reaches the trophy: the row that set it lifts
                // into gold and carries a left rule, which survives printing.
                const rowIsPr = row.kind === 'single'
                  ? !!row.set.isPr
                  : !!(row.left?.isPr || row.right?.isPr)
                return (
                  <div key={`${row.kind}-${ri}`}
                    style={rowIsPr ? { background: `${GOLD}12`, boxShadow: `inset 3px 0 0 ${GOLD}` } : undefined}
                    className="flex items-center gap-2 pl-[22px] pr-3 py-[3px] text-fluid-xs">
                    <span className="helix-num w-4 shrink-0 text-[10px] text-muted/70 text-right tabular-nums">
                      {row.num ?? '·'}
                    </span>
                    {row.kind === 'single' ? (
                      <>
                        <span className="helix-num font-semibold text-text tabular-nums shrink-0"
                          style={{ minWidth: '5.5rem' }}>
                          {formatSet(row.set.weightKg, row.set.reps, { timed, unit, toDisplay: displayWeight })}
                        </span>
                        {tag && (
                          <span className="text-[8px] font-bold uppercase px-1 py-px rounded shrink-0"
                            style={{ color: tag.color, background: `${tag.color}1f` }}
                            title={tag.full} aria-label={tag.full}>{tag.label}</span>
                        )}
                        <SetPrBadges set={row.set} timed={timed} />
                        {/* The word, not just the number — "8.5" means nothing
                            to a reader who has not memorised the ladder, and
                            legacy rows hold off-ladder values (6, 7, 8) that
                            still resolve to a CR10 anchor rather than a dash. */}
                        {row.set.rpe != null && (
                          <span className="text-[10px] font-bold uppercase tracking-wide shrink-0"
                            style={{ color: rpeColor(row.set.rpe) }}
                            title={`Effort ${row.set.rpe} / 10`}>
                            {rpeLabel(row.set.rpe)}
                          </span>
                        )}
                        {/* `> 0`, not `!= null`: bodyweight rows written before
                            Epley returned null hold a stored 0, which rendered
                            as "1RM 0" on every Reverse Crunch. */}
                        {row.set.est1rmKg != null && row.set.est1rmKg > 0 && !timed && (
                          <span className="ml-auto helix-num text-[10px] text-muted/70 shrink-0 tabular-nums">
                            1RM {displayWeight(row.set.est1rmKg)}
                          </span>
                        )}
                        {/* The rest BEFORE this set — never shown on set 1, which
                            has nothing before it to measure from. */}
                        {formatRest(row.set.restSec) && (
                          <span className="helix-num text-[10px] text-muted/60 shrink-0 tabular-nums ml-2"
                            title="Measured rest before this set">
                            ⏱ {formatRest(row.set.restSec)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {(['left', 'right'] as const).map((k) => {
                          const s = row[k]
                          if (!s) return null
                          const c = k === 'left' ? SAPPHIRE : EMBER
                          return (
                            <span key={k} className="inline-flex items-center gap-1 rounded px-1.5 py-px"
                              style={{ background: `${c}14`, border: `1px solid ${c}33` }}>
                              <span className="text-[9px] font-bold" style={{ color: c }}>{k === 'left' ? 'L' : 'R'}</span>
                              <span className="helix-num font-semibold text-text text-[11px] tabular-nums">
                                {formatSet(s.weightKg, s.reps, { timed, unit, toDisplay: displayWeight })}
                              </span>
                              <SetPrBadges set={s} timed={timed} compact />
                            </span>
                          )
                        })}
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

/** One cell of an exercise's stat strip. */
function Cell({ label, value, color, title }: {
  label: string; value: string; color?: string; title?: string
}) {
  return (
    <div className="px-2 py-1" style={{ background: 'rgb(12,13,16)' }} title={title}>
      <div className="text-[8px] uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="helix-num text-[11px] font-bold tabular-nums" style={{ color: color ?? undefined }}>{value}</div>
    </div>
  )
}
