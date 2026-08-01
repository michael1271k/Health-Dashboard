import { VOLUME_LANDMARKS, type VolumeZone } from '@/lib/training/landmarks'

/**
 * Regional training load for the Muscle Contour Map — PURE.
 *
 * THE OLD MATH AND WHY IT WAS MEANINGLESS
 *
 * The map coloured each region by `group.volume / max(volume)` — the group's
 * share of the single hardest-worked group's TONNAGE. Two things fall out of
 * that, and both were visible on screen:
 *
 *  1. Legs read 100%, always. Not because legs were overtrained, but because
 *     tonnage is `kg × reps` and a leg press moves four times the load of a
 *     lateral raise for the same effort. The scale's maximum was structurally
 *     pinned to the heaviest muscle group, so the brightest region was a fact
 *     about anatomy, not about training.
 *  2. Core read 8%. Hanging Knee Raise and Side Plank are logged at
 *     `weight_kg = 0`, so their tonnage is literally ZERO. The 8% was leaked in
 *     by Crunch Machine alone. A muscle can be trained to failure three times a
 *     week and register as untouched.
 *
 * THE FIX
 *
 * Count SETS, normalise to a week, and grade against that group's MAV
 * (Maximum Adaptive Volume) — the top of the productive working range. Sets are
 * the unit training volume is actually prescribed in, they are comparable
 * across muscles, and they do not care what the bar weighs. 100% now means "at
 * the top of the productive range for this muscle", which is a claim worth
 * colouring.
 *
 * `days` scales the window: 30 days of data is ~4.3 weeks, so the raw set count
 * is divided down before grading. Without that, a "Plan Era" window would paint
 * every muscle deep in the over-training band.
 */
export interface RegionalLoad {
  group: string
  /** Sets per week, normalised from the window. */
  setsPerWeek: number
  /** MAV for the group — the 100% mark. */
  mav: number
  /** `setsPerWeek / mav`, uncapped: above 1 is genuinely above the range. */
  ratio: number
  zone: VolumeZone
}

/**
 * The load ramp. Under → building → optimal → over, deliberately NOT a single
 * hue getting brighter: the old steel→sapphire→ember gradient encoded "more" and
 * left you to guess whether more was good. Emerald is the target band, and the
 * only way to leave it is to be short (cool) or beyond it (warm).
 */
export const ZONE_COLOR: Record<VolumeZone, string> = {
  under: '#4A5568',      // slate — barely worked
  building: '#3D7AB8',   // sapphire — ramping toward the target
  optimal: '#3E9E7A',    // emerald — inside the productive range
  over: '#E0703C',       // ember — past MRV, recovery cost
  na: 'rgba(255,255,255,0.05)',
}

export function regionalLoad(
  stats: ReadonlyArray<{ group: string; sets: number }>,
  days: number,
): RegionalLoad[] {
  // A window shorter than a week still reads as a week — a Tuesday mid-week
  // check should not multiply three days of work up to a fictional weekly rate.
  const weeks = Math.max(1, days / 7)
  return stats.map((s) => {
    const band = VOLUME_LANDMARKS[s.group]
    if (!band) return { group: s.group, setsPerWeek: 0, mav: 0, ratio: 0, zone: 'na' as VolumeZone }
    const setsPerWeek = s.sets / weeks
    const ratio = setsPerWeek / band.mav
    return { group: s.group, setsPerWeek, mav: band.mav, ratio, zone: zoneOf(setsPerWeek, band) }
  })
}

function zoneOf(setsPerWeek: number, band: { mev: number; mav: number; mrv: number }): VolumeZone {
  if (setsPerWeek <= 0) return 'na'
  if (setsPerWeek < band.mev) return 'under'
  if (setsPerWeek < band.mav) return 'building'
  if (setsPerWeek <= band.mrv) return 'optimal'
  return 'over'
}

/** Fill opacity for a region — floors at a visible level so a trained-but-low
 *  muscle is never indistinguishable from an untrained one. */
export function regionOpacity(r: RegionalLoad): number {
  if (r.zone === 'na') return 0
  return Math.min(0.85, 0.28 + Math.min(1.2, r.ratio) * 0.5)
}
