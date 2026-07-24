'use client'

import { useMemo, useState } from 'react'
import { Trophy, Dumbbell, TrendingUp, ChevronRight } from 'lucide-react'
import type { DetailExercise, DetailSet } from '@/lib/hooks/useSessionDetail'
import { useSessionIntel } from '@/lib/hooks/useSessionIntel'
import { useSessionTrends, LOAD_STEP_KG } from '@/lib/hooks/useSessionTrends'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { isTimedExercise } from '@/lib/exercises/timed'
import { GROUP_COLOR } from '@/lib/hooks/useMuscleAnalytics'
import { ExerciseHistorySheet } from '@/components/exercises/ExerciseHistorySheet'
import { GOLD, OXIDE, EMERALD, SAPPHIRE, EMBER, PLATINUM, MUTED } from '@/lib/theme/palette'

function SetTypeBadge({ type }: { type: string }) {
  if (type === 'warmup') return <span className="text-[8px] font-bold uppercase px-1 py-px rounded" style={{ color: EMERALD, background: `${EMERALD}1f` }}>WU</span>
  if (type === 'failure') return <span className="text-[8px] font-bold uppercase px-1 py-px rounded" style={{ color: OXIDE, background: `${OXIDE}1f` }}>Fail</span>
  return null
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
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / n) * 62 + 1} ${22 - ((v - min) / span) * 18}`).join(' ')
  const lastY = 22 - ((points[n] - min) / span) * 18
  return (
    <svg viewBox="0 0 66 26" className="w-16 h-6 shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
      <circle cx={63} cy={lastY} r="2" fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
    </svg>
  )
}

/**
 * Group sets into display rows. A unilateral pair (two rows sharing a `pairId`,
 * one 'L' one 'R') collapses to ONE row carrying both sides as sub-set chips —
 * Set 3 reads "Set 3 ▸ L … · R …" instead of counting as two sets.
 */
type Row =
  | { kind: 'single'; num: number; set: DetailSet }
  | { kind: 'pair'; num: number; left?: DetailSet; right?: DetailSet }

function toRows(sets: DetailSet[]): Row[] {
  const rows: Row[] = []
  const byPair = new Map<string, Extract<Row, { kind: 'pair' }>>()
  let num = 0
  for (const s of sets) {
    if (s.pairId) {
      let g = byPair.get(s.pairId)
      if (!g) { num += 1; g = { kind: 'pair', num }; byPair.set(s.pairId, g); rows.push(g) }
      if (s.side === 'R') g.right = s; else g.left = s
    } else {
      num += 1
      rows.push({ kind: 'single', num, set: s })
    }
  }
  return rows
}

/**
 * Session Report exercises — 100%-transparent glass cards so the global living
 * mesh reads straight through. Each carries muscle chips, a continuous est-1RM
 * sparkline, the vs-last baseline glyph, % change, PR badge, a strongest-lift
 * highlight, and a double-progression prompt when every working set cleared the
 * rep ceiling.
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
  const deltaFor = new Map((intel?.deltas ?? []).map((d) => [d.exerciseId, d.delta]))

  // Strongest lift of the session — highest est-1RM.
  const strongestId = useMemo(() => {
    let best: { id: string; v: number } | null = null
    for (const e of exercises) {
      const v = e.bestEst1rm ?? 0
      if (v > 0 && (!best || v > best.v)) best = { id: e.exerciseId, v }
    }
    return best?.id ?? null
  }, [exercises])

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-fluid-base font-bold text-text px-1 flex items-center gap-2">
        <Dumbbell className="w-4 h-4" style={{ color: SAPPHIRE }} aria-hidden="true" /> Exercises
      </h2>

      {exercises.map((ex) => {
        const timed = isTimedExercise(ex.name)
        const glyph = deltaGlyph(deltaFor.get(ex.exerciseId))
        const t = trends?.[ex.exerciseId]
        const rows = toRows(ex.sets)
        const hasPr = ex.sets.some((s) => s.isPr)
        const isStrongest = ex.exerciseId === strongestId
        const accent = GROUP_COLOR[ex.muscleGroups[0]] ?? PLATINUM

        return (
          <section
            key={ex.exerciseId}
            className="rounded-2xl space-y-2.5 p-4"
            style={{
              background: 'transparent',
              backdropFilter: 'blur(18px) saturate(150%)',
              WebkitBackdropFilter: 'blur(18px) saturate(150%)',
              border: `1px solid ${isStrongest ? `${GOLD}4d` : 'rgba(255,255,255,0.09)'}`,
              boxShadow: isStrongest ? `0 0 22px ${GOLD}1f` : undefined,
            }}
          >
            {/* Header */}
            <button onClick={() => setActive({ id: ex.exerciseId, name: ex.name })}
              className="w-full flex items-center gap-2.5 text-left active:opacity-80" aria-label={`${ex.name} history`}>
              <span className="w-1 h-9 rounded-full shrink-0" style={{ background: accent }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-heading font-bold text-fluid-sm text-text truncate">{ex.name}</span>
                  {glyph && <span className="text-[11px] shrink-0" aria-hidden="true">{glyph}</span>}
                  {hasPr && (
                    <span className="text-[8px] font-bold uppercase px-1 py-px rounded shrink-0 inline-flex items-center gap-0.5"
                      style={{ color: GOLD, background: `${GOLD}1f`, border: `1px solid ${GOLD}4d` }}>
                      <Trophy className="w-2.5 h-2.5" aria-hidden="true" /> PR
                    </span>
                  )}
                  {isStrongest && (
                    <span className="text-[8px] font-bold uppercase px-1 py-px rounded shrink-0"
                      style={{ color: GOLD, background: `${GOLD}14` }}>Strongest</span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {ex.muscleGroups.map((g) => (
                    <span key={g} className="text-[9px] font-semibold px-1.5 py-px rounded-full"
                      style={{ color: GROUP_COLOR[g] ?? MUTED, background: `${GROUP_COLOR[g] ?? MUTED}18` }}>{g}</span>
                  ))}
                  <span className="text-[9px] text-muted helix-num">
                    {ex.workingSets} set{ex.workingSets !== 1 ? 's' : ''} · {Math.round(displayWeight(ex.volumeKg) ?? 0).toLocaleString()}{unit}
                    {ex.bestEst1rm != null && ` · e1RM ${displayWeight(ex.bestEst1rm)}${unit}`}
                  </span>
                  {t?.pctChange != null && t.pctChange !== 0 && (
                    <span className="helix-num text-[9px] font-bold" style={{ color: t.pctChange > 0 ? EMERALD : OXIDE }}>
                      {t.pctChange > 0 ? '+' : ''}{t.pctChange}%
                    </span>
                  )}
                </span>
              </span>
              {t ? <Sparkline points={t.points} color={accent} /> : <ChevronRight className="w-4 h-4 text-muted/60 shrink-0" aria-hidden="true" />}
            </button>

            {/* Progression metrics — tonnage, top set, and where the reps sit
                inside the exercise's PROGRAMMED window. */}
            {t && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
                <span className="helix-num">
                  Tonnage <span className="font-bold text-text">{Math.round(displayWeight(t.tonnage) ?? 0).toLocaleString()}{unit}</span>
                  {t.tonnageDelta != null && t.tonnageDelta !== 0 && (
                    <span className="ml-1 font-bold" style={{ color: t.tonnageDelta > 0 ? EMERALD : OXIDE }}>
                      {t.tonnageDelta > 0 ? '+' : ''}{Math.round(displayWeight(t.tonnageDelta) ?? 0).toLocaleString()}
                    </span>
                  )}
                </span>
                {t.topSet && !timed && (
                  <span className="helix-num">
                    Top set <span className="font-bold text-text">{displayWeight(t.topSet.weightKg)}{unit} × {t.topSet.reps}</span>
                  </span>
                )}
                {t.progression.ceiling != null && (
                  <span className="helix-num">
                    Ceiling <span className="font-bold text-text">{t.setsAtCeiling}/{ex.workingSets}</span> sets @ {t.progression.ceiling} reps
                  </span>
                )}
              </div>
            )}

            {/* Double progression — the program's own rule: ALL working sets at
                the programmed ceiling, one load, TWO consecutive sessions. */}
            {t?.progression.state === 'ready' && (
              <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
                style={{ background: `${EMBER}14`, border: `1px solid ${EMBER}3d` }}>
                <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: EMBER }} aria-hidden="true" />
                <span className="text-[11px] font-semibold" style={{ color: EMBER }}>
                  Ceiling cleared twice — add {LOAD_STEP_KG}{unit}
                  {t.progression.suggestKg != null && <> → {displayWeight(t.progression.suggestKg)}{unit}</>}
                </span>
              </div>
            )}
            {t?.progression.state === 'one-more' && (
              <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
                style={{ background: `${GOLD}0f`, border: `1px solid ${GOLD}2e` }}>
                <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
                <span className="text-[11px] font-semibold" style={{ color: GOLD }}>
                  Ceiling cleared — one more session at {t.progression.ceiling} reps to earn the load
                </span>
              </div>
            )}

            {/* Sets — unilateral pairs collapse into one numbered row */}
            <div className="space-y-1">
              {rows.map((row) => (
                <div key={`${row.kind}-${row.num}`} className="flex items-center gap-2 text-fluid-xs">
                  <span className="helix-num w-10 shrink-0 text-[10px] text-muted">Set {row.num}</span>
                  {row.kind === 'single' ? (
                    <>
                      <span className="helix-num font-semibold text-text tabular-nums">
                        {timed ? `${row.set.reps}s` : <>{displayWeight(row.set.weightKg)}{unit} × {row.set.reps}</>}
                      </span>
                      <SetTypeBadge type={row.set.setType} />
                      {row.set.isPr && <Trophy className="w-3 h-3 shrink-0" style={{ color: GOLD }} aria-hidden="true" />}
                      {row.set.rpe != null && <span className="text-[10px] text-muted">RPE {row.set.rpe}</span>}
                      {row.set.est1rmKg != null && (
                        <span className="ml-auto helix-num text-[10px] text-muted shrink-0">1RM {displayWeight(row.set.est1rmKg)}{unit}</span>
                      )}
                    </>
                  ) : (
                    <span className="flex items-center gap-1.5 flex-wrap">
                      {(['left', 'right'] as const).map((k) => {
                        const s = row[k]
                        if (!s) return null
                        const c = k === 'left' ? SAPPHIRE : EMBER
                        return (
                          <span key={k} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"
                            style={{ background: `${c}14`, border: `1px solid ${c}33` }}>
                            <span className="text-[9px] font-bold" style={{ color: c }}>{k === 'left' ? 'L' : 'R'}</span>
                            <span className="helix-num font-semibold text-text text-[11px] tabular-nums">
                              {timed ? `${s.reps}s` : <>{displayWeight(s.weightKg)}{unit} × {s.reps}</>}
                            </span>
                            {s.isPr && <Trophy className="w-2.5 h-2.5" style={{ color: GOLD }} aria-hidden="true" />}
                          </span>
                        )
                      })}
                    </span>
                  )}
                </div>
              ))}
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
