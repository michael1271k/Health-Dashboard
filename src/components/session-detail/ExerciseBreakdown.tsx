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
const TAG: Record<string, { label: string; full: string; color: string }> = {
  warmup: { label: 'W', full: 'Warmup', color: EMERALD },
  failure: { label: 'Failure', full: 'Failure', color: OXIDE },
  dropset: { label: 'Dropset', full: 'Dropset', color: '#9A6DD7' },
}

/** vs-last-same-type glyph: ⬆️ improved · ✅ matched · ⬇️ regressed · 🆕 baseline. */
function deltaGlyph(delta: -1 | 0 | 1 | null | undefined): string | null {
  if (delta === undefined) return null
  if (delta == null) return '🆕'
  return delta === 1 ? '⬆️' : delta === -1 ? '⬇️' : '✅'
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
    <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-white/[0.015]">
      {exercises.map((ex, i) => {
        const timed = isTimedExercise(ex.name)
        const glyph = deltaGlyph(deltaFor.get(ex.exerciseId))
        const t = trends?.[ex.exerciseId]
        const rows = toRows(ex.sets)
        const accent = GROUP_COLOR[ex.muscleGroups[0]] ?? PLATINUM

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
                  <span>{timed ? `${t?.tonnage ?? 0}s` : `${Math.round(displayWeight(ex.volumeKg) ?? 0).toLocaleString()}${unit}`}</span>
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
              {t ? <Sparkline points={t.points} color={accent} />
                : <ChevronRight className="w-4 h-4 text-muted/50 shrink-0" aria-hidden="true" />}
            </button>

            {/* ── Set ledger ── */}
            <div className="pb-1.5">
              {rows.map((row, ri) => {
                const tag = row.kind === 'single' ? TAG[row.set.setType] : undefined
                return (
                  <div key={`${row.kind}-${ri}`}
                    className="flex items-center gap-2 pl-[22px] pr-3 py-[3px] text-fluid-xs">
                    <span className="helix-num w-4 shrink-0 text-[10px] text-muted/70 text-right tabular-nums">
                      {row.num ?? '·'}
                    </span>
                    {row.kind === 'single' ? (
                      <>
                        <span className="helix-num font-semibold text-text tabular-nums shrink-0"
                          style={{ minWidth: '5.5rem' }}>
                          {timed ? `${row.set.reps}s` : <>{displayWeight(row.set.weightKg)}{unit} × {row.set.reps}</>}
                        </span>
                        {tag && (
                          <span className="text-[8px] font-bold uppercase px-1 py-px rounded shrink-0"
                            style={{ color: tag.color, background: `${tag.color}1f` }}
                            title={tag.full} aria-label={tag.full}>{tag.label}</span>
                        )}
                        <SetPrBadges set={row.set} timed={timed} />
                        {row.set.rpe != null && <span className="text-[10px] text-muted shrink-0">RPE {row.set.rpe}</span>}
                        {row.set.est1rmKg != null && !timed && (
                          <span className="ml-auto helix-num text-[10px] text-muted/70 shrink-0 tabular-nums">
                            1RM {displayWeight(row.set.est1rmKg)}
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
                                {timed ? `${s.reps}s` : <>{displayWeight(s.weightKg)}{unit} × {s.reps}</>}
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

              {/* Double progression — one line, inline with the ledger. */}
              {(t?.progression.state === 'ready' || t?.progression.state === 'one-more') && (
                <div className="flex items-center gap-1.5 mt-1 ml-[22px] mr-3 rounded-lg px-2 py-1"
                  style={t.progression.state === 'ready'
                    ? { background: `${EMBER}14`, border: `1px solid ${EMBER}3d` }
                    : { background: `${GOLD}0f`, border: `1px solid ${GOLD}2e` }}>
                  <TrendingUp className="w-3 h-3 shrink-0" style={{ color: t.progression.state === 'ready' ? EMBER : GOLD }} aria-hidden="true" />
                  <span className="text-[10px] font-semibold" style={{ color: t.progression.state === 'ready' ? EMBER : GOLD }}>
                    {t.progression.state === 'ready'
                      ? (timed
                        ? <>Cleared twice — extend past {t.progression.ceiling}s</>
                        : <>Cleared twice — add {LOAD_STEP_KG}{unit}{t.progression.suggestKg != null && <> → {displayWeight(t.progression.suggestKg)}{unit}</>}</>)
                      : (timed
                        ? <>One more session at {t.progression.ceiling}s</>
                        : <>One more clean session at {t.progression.ceiling} reps</>)}
                  </span>
                </div>
              )}
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
    </div>
  )
}
