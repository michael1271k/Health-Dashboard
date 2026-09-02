'use client'

import { Footprints } from 'lucide-react'
import type { DetailCardio } from '@/lib/hooks/useSessionDetail'
import { CARDIO_VIOLET } from '@/components/command-center/ExerciseCard'
import { Surface } from '@/components/ui/Zone'

/**
 * The cardio this session carried — the treadmill warm-up, almost always.
 *
 * ── IT WAS IN THE DECK AND NOWHERE IN THE RECORD ─────────────────────────────
 * A cardio block commits to `cardio_logs`, not to `workout_sets`, and that is
 * deliberate: a 0.37 km walk must not enter the session's tonnage, its set
 * count, its muscle credit or the record book. `ExerciseCard` has a long note
 * about the three ways the treadmill used to read as "not a real exercise" in
 * the LOGGER, and it fixed all three there — but the report reads
 * `workout_sets`, so the block you walked disappeared the moment the session
 * was committed. It was a real exercise right up until it became history.
 *
 * So it is stated here, in the report, in its own band: the same violet the deck
 * gives it, the same figures in the same order (distance, duration, incline),
 * and no set count — because it has none, and inventing one is exactly the thing
 * writing it to a separate table was protecting against.
 *
 * ── AND WHY IT IS ABOVE THE BREAKDOWN, NOT INSIDE IT ─────────────────────────
 * `ExerciseBreakdown` is a list of movements with set rows, trends, records and
 * a history sheet per entry; a treadmill has one row and none of the rest, so
 * inside that list it would be an entry whose every affordance was missing. It
 * also came FIRST in the deck (it is the warm-up), and a report that reorders
 * the session is a report you have to reconcile against your memory of it.
 *
 * Renders nothing at all when the session had no cardio, which is most of them.
 */
export function SessionCardio({ cardio, accent }: {
  cardio: DetailCardio[]
  /** The session's own colour, for the band's rule. */
  accent: string
}) {
  if (cardio.length === 0) return null

  return (
    <Surface variant="band" accent={accent} pad="snug" className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: CARDIO_VIOLET }}>
          Cardio
        </h2>
        {/* The one thing a reader might otherwise assume wrongly, said once
            rather than implied by the absence of a number. */}
        <span className="text-[10px] text-muted">not counted as sets</span>
      </div>

      {cardio.map((c) => (
        <div key={c.id} className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${CARDIO_VIOLET}1c`, color: CARDIO_VIOLET }}>
            <Footprints className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 text-fluid-sm text-text capitalize truncate">{c.kind}</span>
          {/* Right-aligned figures on one numeral grid, each carrying its unit —
              a reading is not a reference unless it says what it is measuring.
              A field the row does not have is simply absent: an em dash here
              would claim the treadmill was walked at an unknown incline. */}
          <span className="helix-num tabular-nums text-fluid-sm text-text shrink-0 flex items-baseline gap-2.5">
            {c.distanceM != null && (
              <Figure value={(c.distanceM / 1000).toFixed(2)} unit="km" />
            )}
            {c.durationMin != null && (
              <Figure value={String(Math.round(c.durationMin * 10) / 10)} unit="min" />
            )}
            {c.inclinePct != null && (
              <Figure value={String(Math.round(c.inclinePct * 10) / 10)} unit="%" />
            )}
          </span>
        </div>
      ))}
    </Surface>
  )
}

function Figure({ value, unit }: { value: string; unit: string }) {
  return (
    <span className="whitespace-nowrap">
      {value}<span className="text-[10px] font-normal text-muted ml-0.5">{unit}</span>
    </span>
  )
}
