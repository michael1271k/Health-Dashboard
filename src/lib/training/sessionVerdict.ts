/**
 * What the session actually did, in a sentence — and specifically, what to say
 * when tonnage fell.
 *
 * ── WHY TONNAGE ALONE IS A LIAR ──────────────────────────────────────────────
 * Volume is weight × reps summed over the session, so it falls whenever you
 * shorten a set, drop a set, or — the case that matters — add load and lose
 * reps to it. On a double-progression program that last one is not a bad
 * session, it is the exact moment the program was waiting for: you cleared the
 * rep ceiling, the load went up, and the reps reset to the floor. Tonnage
 * reports that as a regression, in red, every single time it happens.
 *
 * So when volume is down and any movement went UP in load, the load increase is
 * named FIRST and the volume drop second, as its consequence rather than as a
 * verdict. Nothing here forgives a genuine bad session: volume down with no
 * load increase anywhere says so plainly.
 *
 * PURE — no React, no clock, no formatting of units (the caller owns display
 * conversion, because kg/lb is a user preference).
 */

export interface VerdictExercise {
  name: string
  /** Heaviest load this session, in kg. */
  topKg: number
  /** Heaviest load the previous session of this type, or null if it is new. */
  prevKg: number | null
  /** True for movements with no external load — reps are the axis. */
  unloaded?: boolean
}

export type VerdictTone = 'praise' | 'neutral' | 'caution'

export interface SessionVerdict {
  tone: VerdictTone
  /** The lead sentence. Always present. */
  headline: string
  /** The movements that carried it, heaviest jump first. May be empty. */
  loadGains: Array<{ name: string; fromKg: number; toKg: number }>
}

const pctText = (pct: number) => `${Math.abs(Math.round(pct))}%`

/**
 * Judge the session against the previous one of the same type.
 *
 * Returns null when there is nothing to compare — the first session of a type
 * has no verdict to give, and inventing an encouraging one would make the
 * sentence meaningless the week it is actually earned.
 */
export function sessionVerdict(
  volumeDeltaPct: number | null,
  exercises: readonly VerdictExercise[],
): SessionVerdict | null {
  if (volumeDeltaPct == null) return null

  const loadGains = exercises
    .filter((e) => !e.unloaded && e.prevKg != null && e.topKg > e.prevKg)
    .map((e) => ({ name: e.name, fromKg: e.prevKg as number, toKg: e.topKg }))
    .sort((a, b) => (b.toKg - b.fromKg) - (a.toKg - a.fromKg))

  if (volumeDeltaPct < 0 && loadGains.length) {
    const lead = loadGains[0]
    return {
      tone: 'praise',
      // The load leads. A sentence that opens "volume down 7%" has already told
      // the reader they failed before it gets to the part where they did not.
      headline: loadGains.length === 1
        ? `Heavier on ${lead.name} — tonnage ${pctText(volumeDeltaPct)} lower for it.`
        : `Heavier on ${loadGains.length} movements — tonnage ${pctText(volumeDeltaPct)} lower for it.`,
      loadGains,
    }
  }

  if (volumeDeltaPct > 0 && loadGains.length) {
    return {
      tone: 'praise',
      headline: `Up on both — ${pctText(volumeDeltaPct)} more tonnage, and heavier on ${loadGains[0].name}.`,
      loadGains,
    }
  }

  if (volumeDeltaPct > 0) {
    return { tone: 'praise', headline: `${pctText(volumeDeltaPct)} more tonnage than last time.`, loadGains: [] }
  }

  if (volumeDeltaPct < 0) {
    return {
      tone: 'caution',
      // No load increase anywhere: this one is what it looks like, and saying
      // otherwise would make every praise above worthless.
      headline: `${pctText(volumeDeltaPct)} less tonnage, and no load increase to explain it.`,
      loadGains: [],
    }
  }

  return { tone: 'neutral', headline: 'Matched last time, tonne for tonne.', loadGains: [] }
}
