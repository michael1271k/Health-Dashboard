/**
 * Sleep trim — what a night's stage minutes become when its window is edited.
 *
 * ── TWO STRATEGIES, ONE CONTRACT ─────────────────────────────────────────────
 * A. Native, samples available: re-aggregate the `HKCategorySample`s inside the
 *    new window (`Sleep.aggregate` over the clipped intervals — `SleepNight.swift`).
 *    That is the truth, and it lives on the phone only, because only the phone
 *    holds samples.
 * B. No samples (the web, a legacy row, a night the phone never sampled): THIS
 *    file. It operates on ASLEEP minutes, not window length — a stored night's
 *    `duration_min` is the union of its asleep stages and is what every scorer
 *    reads — and the rule is deliberately the dumbest one that respects what a
 *    stored row can actually claim:
 *
 *      trim      · minutes removed come out of AWAKE first (an edge you are
 *                  cutting off is the part of the night you were most likely
 *                  lying awake in), and whatever is left comes off the asleep
 *                  stages in proportion to their share.
 *      extension · minutes added go to CORE only. No samples means no stage
 *                  claim, and core is what a legacy duration-only row already
 *                  means by "asleep, stage unknown".
 *      shift     · the same span moved is the same night: nothing changes.
 *
 * Web shows whatever the phone synced (A when it had samples). There is NO
 * byte-parity claim across the two strategies — they answer different
 * questions from different evidence — only across the two implementations of
 * B, which the `sleep-trim` golden vector pins.
 *
 * ── A DEGENERATE WINDOW IS READ AS ITS OWN MINUTES ───────────────────────────
 * Legacy rows (Shortcut pushes, manual web entries) carry `end_time = start_time`
 * and a fallback bedtime, so their window is zero minutes wide while holding
 * seven hours of sleep. A trim measured against that span would be nonsense, so
 * a window shorter than the minutes it holds is treated as exactly as long as
 * `asleep + awake`. Nothing else about the row is trusted less for it.
 */

export interface NightStages {
  /** `duration_min` — asleep, the union of the stages. */
  asleepMin: number
  deepMin: number
  remMin: number
  coreMin: number
  awakeMin: number
}

export interface StoredNight extends NightStages {
  /** `start_time` — bedtime, ISO instant. */
  start: string
  /** `end_time` — ISO instant. */
  end: string
}

export interface NightWindowEdit {
  start: string
  end: string
}

export interface TrimmedNight extends NightStages {
  /** Minutes the edit removed from the night (0 on an extension or a shift). */
  cutMin: number
  /** Minutes the edit added (0 on a trim or a shift). */
  addedMin: number
  /** True when the row carried no stage split — awake = deep = rem = 0. */
  durationOnly: boolean
}

const nonNeg = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0)

/** Whole minutes between two ISO instants, floored at zero. `NaN` on a bad date reads as zero. */
export function spanMinutes(start: string, end: string): number {
  const ms = Date.parse(end) - Date.parse(start)
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60_000) : 0
}

/** A row with no stage split: everything asleep was filed as core (or as nothing). */
export function isDurationOnly(n: NightStages): boolean {
  return nonNeg(n.awakeMin) === 0 && nonNeg(n.deepMin) === 0 && nonNeg(n.remMin) === 0
}

/**
 * Strategy B on minute counts. `oldSpan` and `newSpan` are the two windows'
 * lengths; the difference is what moves. Exported on its own so the vector can
 * pin the arithmetic without a clock.
 */
export function trimStages(n: NightStages, oldSpanMin: number, newSpanMin: number): TrimmedNight {
  const asleep = Math.round(nonNeg(n.asleepMin))
  const awake = Math.round(nonNeg(n.awakeMin))
  const deep = Math.min(asleep, Math.round(nonNeg(n.deepMin)))
  const rem = Math.min(asleep - deep, Math.round(nonNeg(n.remMin)))
  const durationOnly = isDurationOnly(n)

  // A window shorter than the minutes it holds is read as exactly that long.
  const oldSpan = Math.max(Math.round(nonNeg(oldSpanMin)), asleep + awake)
  const newSpan = Math.round(nonNeg(newSpanMin))
  const delta = newSpan - oldSpan

  if (delta === 0) {
    return { asleepMin: asleep, deepMin: deep, remMin: rem, coreMin: asleep - deep - rem, awakeMin: awake, cutMin: 0, addedMin: 0, durationOnly }
  }

  if (delta > 0) {
    // Extension: core only. No samples, no stage claim.
    return {
      asleepMin: asleep + delta, deepMin: deep, remMin: rem, coreMin: asleep - deep - rem + delta,
      awakeMin: awake, cutMin: 0, addedMin: delta, durationOnly,
    }
  }

  // Trim: awake first, then the asleep stages in proportion.
  const cut = -delta
  const awakeCut = Math.min(awake, cut)
  const asleepCut = Math.min(asleep, cut - awakeCut)
  const newAsleep = asleep - asleepCut
  const factor = asleep > 0 ? newAsleep / asleep : 0
  let newDeep = Math.round(deep * factor)
  let newRem = Math.round(rem * factor)
  // Rounding can push deep + rem a minute past the new total; core absorbs
  // the remainder and never goes negative.
  let newCore = newAsleep - newDeep - newRem
  if (newCore < 0) {
    newRem += newCore
    newCore = 0
    if (newRem < 0) { newDeep += newRem; newRem = 0 }
  }
  return {
    asleepMin: newAsleep, deepMin: newDeep, remMin: newRem, coreMin: newCore,
    awakeMin: awake - awakeCut, cutMin: cut, addedMin: 0, durationOnly,
  }
}

/**
 * Strategy B over a stored row and the window the user chose.
 *
 * An edit whose instants do not parse, or whose end is not after its start, is
 * NOT an edit: the night comes back as a shift (unchanged minutes). A bad date
 * that read as a zero-length window would wipe seven hours of stages, and the
 * one place that can happen is exactly the picker this feeds.
 */
export function trimNight(row: StoredNight, edit: NightWindowEdit): TrimmedNight {
  const oldSpan = spanMinutes(row.start, row.end)
  const editMs = Date.parse(edit.end) - Date.parse(edit.start)
  if (!Number.isFinite(editMs) || editMs <= 0) return trimStages(row, oldSpan, oldSpan)
  return trimStages(row, oldSpan, spanMinutes(edit.start, edit.end))
}
