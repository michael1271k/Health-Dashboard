'use client'

import { useMemo } from 'react'
import { Target } from 'lucide-react'
import { useWeeklyVolume } from '@/lib/hooks/useWeeklyVolume'
import { useCardioHistory } from '@/lib/hooks/useCardio'
import { ZONE_META, type LandmarkMuscle } from '@/lib/training/landmarks'
import { landmarkColor } from '@/lib/theme/muscleHue'
import { weekStartOf, isoAddDays } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import { EMBER } from '@/lib/theme/palette'
import { MuscleAtlas } from '@/components/body/MuscleAtlas'
import { setsToWorked } from '@/lib/body/atlas'

/**
 * Week-to-date sets per muscle against the active program's target — the single
 * most actionable "what should I train next" view, so it sits at the TOP of the
 * Muscle Analytics tab. Muscles with no sets this week are omitted, never
 * zero-filled.
 *
 * This is the ONLY MEV/MAV card. `WeeklyVolumeCard` rendered the same hook's
 * data ten lines away on the same page — two cards, two `workout_sets` scans,
 * and they disagreed about zero-target muscles (that one printed a literal
 * "3/0").
 *
 * ── A MUSCLE WITH NO TARGET IS STILL A MUSCLE ────────────────────────────────
 * The row filter used to be `sets > 0 && target > 0`, on the reasoning that a
 * bar with no target to compare against is noise. What it actually did was hide
 * WORK. On a cut the Adductors target is 0 — so a week carrying 2.5 real sets of
 * adduction, earned off the leg press, showed nothing at all, and the only way
 * to discover them was to compare against another app. Untargeted is not
 * untrained: the row renders, the readout says `2.5 · —`, and the bar scales
 * against the week's own hardest-worked muscle instead of a target it does not
 * have.
 */
export function WeekToDateTargets() {
  const today = logicalTodayISO()
  const weekStart = weekStartOf(today)
  const { data: week } = useWeeklyVolume(weekStart, today)
  const { data: cardio } = useCardioHistory()

  const rows = useMemo(
    () => (week?.muscles ?? []).filter((m) => m.sets > 0),
    [week],
  )

  /**
   * Intensity, 0–1, relative to the week's OWN hardest-worked muscle — the same
   * scale the figure uses, computed once and handed to both. The list and the
   * body cannot drift into telling different stories about the same week
   * because they are reading the same numbers, not two parallel derivations.
   */
  const worked = useMemo(
    () => setsToWorked(Object.fromEntries(rows.map((m) => [m.muscle, m.sets]))),
    [rows],
  )

  /**
   * Treadmill work never reaches `workout_sets` — it is written to `cardio_logs`
   * and carries no muscle attribution, which is correct: a 40-minute zone-2 walk
   * is not three sets of anything. But the total then reads as if the week were
   * five sessions when it was ten, so the count is stated once, at the foot,
   * outside the breakdown rather than smuggled into it.
   */
  const cardioSessions = useMemo(() => {
    const end = isoAddDays(weekStart, 7)
    return (cardio ?? []).filter((c) => c.date >= weekStart && c.date < end).length
  }, [cardio, weekStart])

  if (!rows.length) return null

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-fluid-base font-bold text-text flex items-center gap-2">
          <Target className="w-4 h-4" style={{ color: EMBER }} aria-hidden="true" /> Week to date
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">
          Sun → {new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          {week ? ` · ${week.program} targets` : ''}
        </span>
      </div>

      {/* ── THE WEEK, ON A BODY ──
          Sixteen labelled bars answer "how much" precisely and "where" not at
          all. The figure answers the second question in one glance — a week
          that has trained nothing but the anterior chain is a shape, not a list.

          It STACKS below 640px rather than sitting beside the list. The figure
          was `shrink-0` at 150px next to a `min-w-0` column, which is exactly
          the arrangement that let "Upper back" render as "Upper b…": the body
          took its width first and the names took what was left. On a phone the
          list now gets the whole measure. */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
        <div className="h-36 w-[124px] shrink-0">
          <MuscleAtlas
            view="both"
            worked={worked}
            /* Each muscle in its OWN hue, at an alpha the atlas derives from
               `worked` — so the body says WHICH muscle by colour and HOW MUCH by
               depth, the same two channels the list uses. */
            colorFor={landmarkColor}
            label="Muscles trained this week"
          />
        </div>

        <div className="w-full sm:flex-1 min-w-0 space-y-2.5">
          {rows.map((m) => (
            <MuscleRow key={m.muscle} row={m} intensity={worked[m.muscle] ?? 0.25} />
          ))}
        </div>
      </div>

      {cardioSessions > 0 && (
        <p className="text-[10px] text-muted pt-1 border-t border-white/[0.05]">
          <span className="helix-num">{cardioSessions}</span> cardio session{cardioSessions === 1 ? '' : 's'} this
          week, counted nowhere above — cardio carries no muscle attribution.
        </p>
      )}
    </section>
  )
}

/**
 * One muscle: name, figures, bar.
 *
 * ── WHY THE NAME GETS ITS OWN LINE ───────────────────────────────────────────
 * It used to share a line with `{sets}/{target} · {zone label}`, where the
 * readout was `shrink-0` and the name was the flexible half. "Under target" is
 * twelve characters that never yield, so the name absorbed every squeeze and
 * the longest ones — Upper back, Lower back, Front delts, Hamstrings — were the
 * ones that lost. Nothing here truncates now: the name owns the left of a line
 * whose right holds four characters of number, and the zone word is gone from
 * the row entirely.
 *
 * The zone survives as a dot, which is all it was ever worth: the bar already
 * draws the target as a tick, so "1/1 · On target" was the same fact written
 * three ways.
 */
function MuscleRow({ row, intensity }: {
  row: { muscle: LandmarkMuscle; sets: number; target: number; indirectSets: number; zone: keyof typeof ZONE_META }
  intensity: number
}) {
  const meta = ZONE_META[row.zone]
  const hue = landmarkColor(row.muscle)
  /**
   * Colour says WHICH muscle, alpha says HOW MUCH.
   *
   * The bar used to be filled in the zone colour, which meant every muscle in
   * the same state was the same colour and the list read as a status board —
   * five identical green bars telling you nothing about which five. The hue is
   * now the muscle's own, and the depth is its share of the week, floored at
   * 0.45 so the quietest muscle is still legible against the track.
   */
  const fill = 0.45 + Math.min(1, Math.max(0, intensity)) * 0.55
  // Untargeted muscles have nothing to scale against, so they scale against
  // their own count — a full bar that means "all of this week's adduction",
  // not "target met".
  const scaleMax = row.target > 0 ? Math.max(row.target * 1.4, row.sets, 1) : Math.max(row.sets, 1)

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="font-semibold text-text/85 flex items-center gap-1.5 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: meta.color }}
            aria-hidden="true"
          />
          {row.muscle}
        </span>
        <span className="helix-num shrink-0 text-text/70" title={meta.label} aria-label={`${row.sets} sets, ${meta.label}`}>
          {row.sets}
          <span className="text-muted">{row.target > 0 ? `/${row.target}` : ' · —'}</span>
        </span>
      </div>

      <div className="relative h-2 rounded-full bg-white/[0.05] overflow-hidden">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(100, (row.sets / scaleMax) * 100)}%`,
            background: hue,
            opacity: fill,
            boxShadow: `0 0 6px ${hue}80`,
          }}
        />
        {row.target > 0 && (
          <span
            className="absolute inset-y-0 w-px bg-white/45"
            style={{ left: `${(row.target / scaleMax) * 100}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      {row.target > 0 && row.sets < row.target && (
        // Rounded: assisting muscles pay half sets, and 11 − 10.7 is
        // 0.2999999999999998 in float, not 0.3.
        <p className="text-[9px] text-muted">
          {Math.round((row.target - row.sets) * 10) / 10} to target
          {row.indirectSets > 0 ? ` · ${row.indirectSets} indirect` : ''}
        </p>
      )}
    </div>
  )
}
