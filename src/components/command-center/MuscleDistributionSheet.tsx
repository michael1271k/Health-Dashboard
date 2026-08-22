'use client'

import { MuscleAtlas } from '@/components/body/MuscleAtlas'
import { landmarkColor } from '@/lib/theme/muscleHue'
import { Sheet } from '@/components/ui/Sheet'
import { setsToWorked } from '@/lib/body/atlas'
import { MUSCLE_COLOR, type LandmarkMuscle } from '@/lib/training/landmarks'
import { ATLAS_BLUE, MUTED } from '@/lib/theme/palette'

export interface MuscleEntry { muscle: LandmarkMuscle; sets: number }

/**
 * The enlarged muscle-distribution view.
 *
 * ── WHY IT IS ITS OWN COMPONENT ─────────────────────────────────────────────
 * It was written inline inside `MuscleDistribution`, which takes a
 * `SessionDraft` — so the finished-session report, which has no draft and never
 * will, could not open the same view. The report's body chart was therefore a
 * picture you could not tap, sitting next to a legend of thirteen muscle names,
 * while the identical answer existed one screen away in a form you could read.
 *
 * The two callers differ only in where their numbers come from: the logger
 * derives them from the live draft, the report reads them off `SessionDetail`.
 * So the shared piece takes the numbers, not the source.
 */
export function MuscleDistributionSheet({ open, onClose, entries, physical, weighted, accent }: {
  open: boolean
  onClose: () => void
  /** Weighted sets per muscle, already filtered to the ones that were worked. */
  entries: MuscleEntry[]
  /** Sets actually performed — what you could count on the gym floor. */
  physical: number
  /** The weighted total those sets distribute across the muscles. */
  weighted: number
  /** The session's own colour — the day's on both the report and the live deck. */
  accent?: string
}) {
  const tint = accent ?? ATLAS_BLUE
  const worked = setsToWorked(Object.fromEntries(entries.map((e) => [e.muscle, e.sets])))
  return (
    <Sheet open={open} onClose={onClose} title="Muscle distribution" accent={tint}>
      <div className="space-y-3 pb-2">
        {/* The two counts, named, before the figures that use them. The deck's
            own set count is the physical one; everything in the list below is
            the weighted one, and they are supposed to differ. */}
        <div className="grid grid-cols-2 gap-2">
          <Count value={physical} label="Physical sets" hint="What you performed on the gym floor" />
          <Count
            value={weighted}
            label="Weighted sets"
            // This tooltip used to end "Warm-ups and unticked sets are not
            // counted", which contradicted both `draftMuscleSets` (which counts
            // warm-ups, deliberately) and the line printed six elements below
            // it. One component, two answers, and the wrong one was the one you
            // got by hovering the number.
            hint={'One physical set credits 1.0 to every muscle it trains directly and 0.5 to '
              + 'every muscle that assists — so a compound lift lands on several, and this total '
              + 'is higher than the set count on purpose. It is the same credit the weekly volume '
              + 'targets are graded on. Warm-ups count; unticked sets do not.'}
          />
        </div>

        <div className="h-56 mx-auto" style={{ maxWidth: 260 }}>
          {/* Per-muscle group hues. `tint` still accents the sheet's chrome. */}
          <MuscleAtlas view="both" worked={worked} colorFor={landmarkColor} label="Muscles worked this session" />
        </div>
        <ul className="space-y-1">
          {entries.sort((a, b) => b.sets - a.sets).map((e) => (
            <li key={e.muscle} className="flex items-center gap-2 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: MUSCLE_COLOR[e.muscle] ?? MUTED }} aria-hidden="true" />
              {/* No `truncate`: "Front delts" and "Hamstrings" are the longest
                  names here and the row's only other content is a two-character
                  number, so clipping them bought nothing and cost the label. */}
              <span className="text-muted flex-1 min-w-0">{e.muscle}</span>
              <span className="helix-num font-bold text-text tabular-nums">{e.sets}</span>
            </li>
          ))}
        </ul>
        {/* ── ONE LINE, NOT FIVE ──
            This was a five-line paragraph explaining the whole credit rule, and
            it was the tallest thing in the sheet after the body itself — a
            footnote outweighing the figure it annotates. The rule has to be
            stated somewhere, because the weighted total is SUPPOSED to exceed
            the deck's set count and looks like a bug otherwise. It is stated
            here in one line, and in full on the tile it explains. */}
        <p className="text-[10px] text-muted leading-snug">
          Direct work counts 1.0, assistance 0.5. Warm-ups count; unticked sets do not.
        </p>
      </div>
    </Sheet>
  )
}

/** One of the two headline counts above the distribution. */
function Count({ value, label, hint }: { value: number; label: string; hint: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2" title={hint}>
      <span className="block helix-num text-fluid-lg font-bold text-text leading-none">{value}</span>
      <span className="block text-[10px] uppercase tracking-wide text-muted mt-1">{label}</span>
    </div>
  )
}
