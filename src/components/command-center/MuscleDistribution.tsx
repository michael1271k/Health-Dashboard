'use client'

import { useMemo, useState } from 'react'
import { MuscleAtlas } from '@/components/body/MuscleAtlas'
import { MuscleDistributionSheet } from './MuscleDistributionSheet'
import { setsToWorked } from '@/lib/body/atlas'
import { resolveMovers } from '@/lib/exercises/muscleMap'
import {
  SECONDARY_SET_CREDIT, toLandmarkMuscle, LANDMARK_MUSCLES,
  type LandmarkMuscle,
} from '@/lib/training/landmarks'
import { isSetCommitted, type SessionDraft } from '@/lib/sessions/draft'
import { EMBER } from '@/lib/theme/palette'

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

/**
 * PHYSICAL working sets in a draft — warm-ups excluded, a unilateral pair
 * counted once. The same rule `draftMuscleSets` counts with, before the
 * primary/secondary credit is applied.
 *
 * Exported so the sheet can print it beside the weighted totals: those numbers
 * sum well above the deck's set count by design, and without the physical
 * figure next to them the sheet reads as a second, disagreeing tally.
 */
export function draftPhysicalSets(draft: SessionDraft | null): number {
  if (!draft) return 0
  let total = 0
  for (const ex of draft.exercises) {
    if (ex.kind === 'cardio') continue
    const seen = new Set<string>()
    for (const s of ex.sets) {
      if (!isSetCommitted(s) || s.setType === 'warmup') continue
      if (s.pairId) {
        if (seen.has(s.pairId)) continue
        seen.add(s.pairId)
      }
      total += 1
    }
  }
  return total
}

export function MuscleDistribution({ draft }: { draft: SessionDraft | null }) {
  const [open, setOpen] = useState(false)
  const sets = useMemo(() => draftMuscleSets(draft), [draft])
  const worked = useMemo(() => setsToWorked(sets), [sets])
  const physical = useMemo(() => draftPhysicalSets(draft), [draft])
  const entries = LANDMARK_MUSCLES
    .map((m) => ({ muscle: m, sets: Math.round((sets[m] ?? 0) * 10) / 10 }))
    .filter((e) => e.sets > 0)
  const weighted = Math.round(entries.reduce((n, e) => n + e.sets, 0) * 10) / 10

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

      {/* The enlarged view is shared with the session report — see
          `MuscleDistributionSheet`. It used to be written inline here, which is
          why the report's body chart could not open it: this component takes a
          live draft, and a finished session has none. */}
      <MuscleDistributionSheet
        open={open}
        onClose={() => setOpen(false)}
        entries={entries}
        physical={physical}
        weighted={weighted}
      />
    </>
  )
}
