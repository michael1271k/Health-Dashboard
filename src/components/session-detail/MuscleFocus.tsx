'use client'

import { Target } from 'lucide-react'
import type { SessionDetail } from '@/lib/hooks/useSessionDetail'
import { MUSCLE_COLOR, type LandmarkMuscle } from '@/lib/training/landmarks'
import { MuscleAtlas } from '@/components/body/MuscleAtlas'
import { setsToWorked } from '@/lib/body/atlas'
import { EMBER, MUTED } from '@/lib/theme/palette'

/**
 * Muscle Focus — what THIS session actually trained (direct-set distribution
 * across the 13 landmark muscles, resolved from the exercise names performed).
 *
 * The week-to-date-vs-target aggregate that used to live here moved to the Muscle
 * Analytics tab (it's a weekly view, not a per-session one, and took too much
 * room on the summary). See `WeekToDateTargets`.
 */
/** Half sets are the smallest real unit; anything finer is float noise. */
const round1 = (v: number): number => Math.round(v * 10) / 10

/**
 * ── TWO COUNTS, AND THE PAGE NOW SAYS WHICH IS WHICH ─────────────────────────
 *
 * The header says "Sets 20". This block used to say "31.5 weighted sets", one
 * word apart, twenty pixels down. Nothing on the page explained that they are
 * answers to different questions, so the only available reading was that one of
 * them was wrong.
 *
 * They are both right:
 *
 *   PHYSICAL SETS      what you performed. A unilateral pair is one set;
 *                      warm-ups are not work. This is the header's number.
 *   WEIGHTED SETS      what each MUSCLE received. One physical set credits 1.0
 *                      to every muscle it directly trains and 0.5 to every
 *                      muscle that assists, so a compound lift lands on several
 *                      muscles and the distribution sums above the set count.
 *                      This is the number weekly volume landmarks are graded on.
 *
 * Both are printed, labelled, on one line, in that order — physical first,
 * because that is the one you can count on the floor.
 */
export function MuscleFocus({ detail }: { detail: SessionDetail }) {
  if (!detail.muscleSets.length) return null
  const total = round1(detail.muscleSets.reduce((n, m) => n + m.sets, 0))
  const physical = detail.workingSets || detail.setCount

  /* ── ONE RAMP, NOT THIRTEEN BARS ──
     This was a `p-5` card with a heading and one full-width labelled bar per
     muscle — a section as tall as the exercise list, to say which muscles the
     workout you just read about trained. Every bar was scaled against the
     largest one, so the numbers on the right were the only exact reading and
     the bars were decoration for them.

     A single stacked ramp is the same distribution at a glance: each segment's
     WIDTH is its share of the session, which is the actual question, and the
     legend underneath keeps the exact per-muscle counts. */
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] flex items-center gap-1.5" style={{ color: EMBER }}>
          <Target className="w-3 h-3" aria-hidden="true" /> Focus
        </span>
        <span className="text-[10px] text-muted ml-auto helix-num tabular-nums"
          title="Physical sets performed, then the weighted total those sets distribute across the muscles (1.0 direct, 0.5 assisting)">
          <span className="font-bold text-text">{physical}</span> physical
          <span className="mx-1 opacity-40">·</span>
          <span className="font-bold text-text">{total}</span> weighted
        </span>
      </div>

      {/* ── THE FIGURE, BESIDE THE RAMP ──
          The ramp answers "in what proportion" and the body answers "where" —
          two different questions, and the second one was being asked of a
          legend of thirteen words. Both views, because a session that trained
          only the posterior chain looks EMPTY from the front, and an empty
          front is exactly the reading. */}
      <div className="flex items-center gap-3">
        <div className="h-24 shrink-0" style={{ width: 96 }}>
          <MuscleAtlas
            view="both"
            worked={setsToWorked(Object.fromEntries(
              detail.muscleSets.map((m) => [m.muscle as LandmarkMuscle, m.sets]),
            ))}
            label="Muscles trained in this session"
          />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.05]" aria-hidden="true">
            {detail.muscleSets.map((m) => (
              <span key={m.muscle}
                style={{
                  width: `${(m.sets / (total || 1)) * 100}%`,
                  background: MUSCLE_COLOR[m.muscle] ?? MUTED,
                }} />
            ))}
          </div>

          {/* The distribution's own caption, so the ramp is never read as a
              second, disagreeing set count. */}
          <p className="text-[9px] text-muted/70 leading-snug">
            Muscle volume distribution — a set credits 1.0 to each muscle it trains
            directly and 0.5 to each it assists.
          </p>

          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
            {detail.muscleSets.map((m) => {
              const color = MUSCLE_COLOR[m.muscle] ?? MUTED
              return (
                <span key={m.muscle} className="inline-flex items-center gap-1 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} aria-hidden="true" />
                  <span className="text-muted">{m.muscle}</span>
                  <span className="helix-num font-bold text-text tabular-nums">{m.sets}</span>
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
