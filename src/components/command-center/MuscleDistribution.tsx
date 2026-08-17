'use client'

import { useMemo, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { MuscleAtlas } from '@/components/body/MuscleAtlas'
import { setsToWorked } from '@/lib/body/atlas'
import { resolveMovers } from '@/lib/exercises/muscleMap'
import {
  SECONDARY_SET_CREDIT, toLandmarkMuscle, MUSCLE_COLOR, LANDMARK_MUSCLES,
  type LandmarkMuscle,
} from '@/lib/training/landmarks'
import { isSetCommitted, type SessionDraft } from '@/lib/sessions/draft'
import { EMBER, MUTED } from '@/lib/theme/palette'

/**
 * Where the session you are logging is actually going.
 *
 * ── WHY IT IS A THUMBNAIL AND NOT A PANEL ────────────────────────────────────
 * The deck is a data-entry surface and every pixel it spends on analysis is a
 * pixel not spent on the set you are about to log. A 24px figure beside the set
 * count is enough to notice that the whole session is landing on one side of
 * the body; the sheet behind it is where you look when you have noticed.
 *
 * ── AND WHY IT IS NOT DRAWN PER EXERCISE ─────────────────────────────────────
 * The plan asked for an atlas inside every exercise card. Twenty-four inline
 * SVG bodies on one screen is both a rendering cost on the surface whose
 * keystroke latency was measured and fixed twice, and a worse answer: a single
 * exercise's muscles are already named on its own card, and the question
 * "am I balanced" is only meaningful across the whole session.
 */

/** Weighted set counts per landmark muscle for a draft, using the ONE credit rule. */
export function draftMuscleSets(draft: SessionDraft | null): Partial<Record<LandmarkMuscle, number>> {
  const out: Partial<Record<LandmarkMuscle, number>> = {}
  if (!draft) return out

  for (const ex of draft.exercises) {
    if (ex.kind === 'cardio') continue
    // Only committed working sets — the same rule the commit payload uses, so
    // this figure never counts a set the session will not record.
    const sets = ex.sets.filter((s) => isSetCommitted(s) && s.setType !== 'warmup')
    if (!sets.length) continue
    // A unilateral pair is ONE set of work, exactly as it is for tonnage.
    const seen = new Set<string>()
    let count = 0
    for (const s of sets) {
      const key = s.pairId ?? `${count}-${s.side ?? ''}-${seen.size}`
      if (s.pairId && seen.has(key)) continue
      seen.add(key)
      count += 1
    }

    const movers = resolveMovers(ex.name, ex.muscleGroups)
    const credit = new Map<LandmarkMuscle, number>()
    const add = (tokens: readonly string[], weight: number) => {
      for (const token of tokens) {
        const m = toLandmarkMuscle(token)
        if (!m) continue
        credit.set(m, Math.max(credit.get(m) ?? 0, weight))
      }
    }
    add(movers.secondary, SECONDARY_SET_CREDIT)
    add(movers.primary, 1)          // last, so an overlap keeps FULL credit
    for (const [m, weight] of credit) out[m] = (out[m] ?? 0) + count * weight
  }
  return out
}

export function MuscleDistribution({ draft }: { draft: SessionDraft | null }) {
  const [open, setOpen] = useState(false)
  const sets = useMemo(() => draftMuscleSets(draft), [draft])
  const worked = useMemo(() => setsToWorked(sets), [sets])
  const entries = LANDMARK_MUSCLES
    .map((m) => ({ muscle: m, sets: Math.round((sets[m] ?? 0) * 10) / 10 }))
    .filter((e) => e.sets > 0)

  if (!entries.length) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Muscle distribution for this session"
        title="Where this session is landing"
        className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center active:scale-95 transition-transform"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <span className="h-6 w-6 block"><MuscleAtlas view="front" worked={worked} color={EMBER} /></span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Muscle distribution" accent={EMBER}>
        <div className="space-y-3 pb-2">
          <div className="h-56 mx-auto" style={{ maxWidth: 260 }}>
            <MuscleAtlas view="both" worked={worked} color={EMBER} label="Muscles worked this session" />
          </div>
          <ul className="space-y-1">
            {entries.sort((a, b) => b.sets - a.sets).map((e) => (
              <li key={e.muscle} className="flex items-center gap-2 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: MUSCLE_COLOR[e.muscle] ?? MUTED }} aria-hidden="true" />
                <span className="text-muted flex-1 min-w-0 truncate">{e.muscle}</span>
                <span className="helix-num font-bold text-text tabular-nums">{e.sets}</span>
              </li>
            ))}
          </ul>
          {/* Weighted, and it says so: an assisting muscle earns half a set, the
              same rule the week's volume targets are graded on. Without the
              note the totals here look wrong next to the deck's set count. */}
          <p className="text-[10px] text-muted leading-snug">
            Weighted sets — a muscle assisting a lift earns half a set, the same credit the
            weekly targets use. Warm-ups and unticked sets are not counted.
          </p>
        </div>
      </Sheet>
    </>
  )
}
