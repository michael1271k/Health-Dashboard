'use client'

import { useMemo } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { MuscleAtlas } from '@/components/body/MuscleAtlas'
import { landmarkColor } from '@/lib/theme/muscleHue'
import { setsToWorked } from '@/lib/body/atlas'
import { useWeeklyVolume } from '@/lib/hooks/useWeeklyVolume'
import { weekStartOf } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import { AMETHYST, EMERALD, GOLD, MUTED, OXIDE } from '@/lib/theme/palette'
import type { MuscleVolume } from '@/lib/training/landmarks'

/**
 * The week's muscle focus, full size.
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
 * The Muscle Focus tile routed to `/day/<today>` — the Daily View, which carries
 * a DOMS map, a soreness log and the day's session, and does not contain a
 * weekly muscle breakdown anywhere on it. Tapping a widget and landing on a
 * screen that does not answer the widget's question is the worst outcome an
 * interaction can have: it is not a dead end, it is a wrong turn, and the reader
 * has to work out for themselves that they are in the wrong place.
 *
 * The Workout tab's own atlas had the opposite failure — it was a picture with
 * no tap at all, sitting above the very list a reader would want it to enlarge.
 * Both now open this, so the same figure means the same thing wherever it is
 * touched.
 *
 * ── AND WHY IT IS A SHEET, NOT A ROUTE ───────────────────────────────────────
 * The question is a glance-deepening one — "where has the week landed, in more
 * detail than a tile can hold" — and it ends by returning to what you were
 * doing. A route replaces the screen and costs a back navigation; a sheet slides
 * over it and dismisses with a downward drag, which is the gesture the platform
 * has taught for exactly this. Every other domain on the dashboard already
 * behaves this way.
 *
 * ── THE ROWS DO NOT ADD UP, AND THAT IS CORRECT ──────────────────────────────
 * `weeklyVolumeByMuscle` credits one PHYSICAL set to every landmark the movement
 * names — in full to each primary, at `SECONDARY_SET_CREDIT` to each secondary —
 * because that is the only way a per-muscle figure is comparable between a leg
 * extension and a squat. Summing the column therefore counts one set once per
 * muscle it touched. The footer says so rather than printing a total that would
 * be an artifact of the exercise mix.
 */
export function WeeklyMuscleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = logicalTodayISO()
  const { data: weekly } = useWeeklyVolume(weekStartOf(today), today)
  const muscles = useMemo(() => weekly?.muscles ?? [], [weekly])

  const worked = useMemo(
    () => setsToWorked(Object.fromEntries(muscles.filter((m) => m.sets > 0).map((m) => [m.muscle, m.sets]))),
    [muscles],
  )

  const rows = useMemo(
    () => [...muscles].sort((a, b) => (b.sets - a.sets) || a.muscle.localeCompare(b.muscle)),
    [muscles],
  )

  const graded = rows.filter((m) => m.target > 0)
  const met = graded.filter((m) => m.zone !== 'under').length

  return (
    <Sheet open={open} onClose={onClose} title="Muscle focus · this week" accent={AMETHYST}>
      <div className="space-y-3 pb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-muted">
            Sun → {new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            {weekly ? ` · ${weekly.program} targets` : ''}
          </span>
          <span className="helix-num text-[12px] font-bold tabular-nums ml-auto" style={{ color: met === graded.length ? EMERALD : GOLD }}>
            {met}<span className="text-muted font-normal">/{graded.length} landmarks covered</span>
          </span>
        </div>

        {/* Both views. The tile can only afford the front; the reason to open
            this is the half of the body the tile cannot show. */}
        <div className="h-56 mx-auto" style={{ maxWidth: 260 }}>
          <MuscleAtlas view="both" worked={worked} colorFor={landmarkColor} label="Muscles trained this week" />
        </div>

        <ul className="space-y-2">
          {rows.map((m) => <Row key={m.muscle} m={m} />)}
        </ul>

        <p className="text-[10px] text-muted pt-1 border-t border-white/[0.05] leading-snug">
          One physical set credits 1.0 to every muscle it trains directly and 0.5 to every muscle
          that assists, so these rows deliberately do not sum to the session count. Warm-ups count.
        </p>
      </div>
    </Sheet>
  )
}

function Row({ m }: { m: MuscleVolume }) {
  const pct = m.target > 0 ? Math.min(100, (m.sets / m.target) * 100) : m.sets > 0 ? 100 : 0
  return (
    <li className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: m.sets > 0 ? m.color : MUTED }} aria-hidden="true" />
        <span className="text-[12px] text-text flex-1 min-w-0">{m.muscle}</span>
        <span className="helix-num text-[12px] font-bold tabular-nums shrink-0"
          style={{ color: m.target > 0 && m.zone === 'under' ? OXIDE : m.sets > 0 ? m.color : MUTED }}>
          {m.sets}
          <span className="text-muted font-normal">/{m.target > 0 ? m.target : '—'}</span>
        </span>
      </div>
      <div className="relative h-1.5 mt-1 rounded-full overflow-hidden bg-white/[0.07]" aria-hidden="true">
        <div className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: m.color, transition: 'width 0.6s cubic-bezier(0.2,0,0,1)' }} />
      </div>
    </li>
  )
}
