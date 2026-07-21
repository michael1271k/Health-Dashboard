/**
 * Weekly volume landmarks (sets per muscle group per week), RP-style, adapted to
 * HELIX's six broad display groups. These are coaching heuristics, not laws:
 *  - MEV = Minimum Effective Volume — below this a group barely grows.
 *  - MAV = Maximum Adaptive Volume — the productive working range tops out here.
 *  - MRV = Maximum Recoverable Volume — beyond this is junk/overreaching volume.
 *
 * The six groups are aggregates (e.g. "Legs" folds quads + hams + glutes +
 * calves), so the numbers run higher than a single-muscle chart would.
 */

export interface Landmark { mev: number; mav: number; mrv: number }

export const VOLUME_LANDMARKS: Record<string, Landmark> = {
  Chest:     { mev: 10, mav: 16, mrv: 22 },
  Back:      { mev: 10, mav: 18, mrv: 25 },
  Shoulders: { mev: 8,  mav: 16, mrv: 26 },
  Arms:      { mev: 8,  mav: 16, mrv: 24 },
  Legs:      { mev: 12, mav: 20, mrv: 32 },
  Core:      { mev: 6,  mav: 14, mrv: 25 },
}

export function landmarkFor(group: string): Landmark | null {
  return VOLUME_LANDMARKS[group] ?? null
}

export type VolumeZone = 'under' | 'building' | 'optimal' | 'over'

/** Where this week's set count sits relative to a group's landmarks. */
export function volumeZone(weeklySets: number, l: Landmark): VolumeZone {
  if (weeklySets < l.mev) return 'under'      // not enough to drive growth
  if (weeklySets < l.mav) return 'building'   // MEV→MAV, productive
  if (weeklySets <= l.mrv) return 'optimal'   // MAV→MRV, high stimulus
  return 'over'                               // beyond MRV, recovery risk
}

export const ZONE_META: Record<VolumeZone, { label: string; color: string }> = {
  under:    { label: 'Below MEV',  color: '#8B97B2' },
  building: { label: 'Building',   color: '#38BDF8' },
  optimal:  { label: 'Optimal',    color: '#34D399' },
  over:     { label: 'Over MRV',   color: '#FB7185' },
}
