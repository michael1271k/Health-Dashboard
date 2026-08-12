/**
 * Training-phase anchors. Drives the glowing week badges in Weekly Summaries.
 * Edit this config to add future phases (each `start` should be a Sunday to
 * align with the calendar's Sunday-start weeks).
 */

import { EMBER, PLATINUM, EMERALD, STEEL, MUTED, SAND, rgbTriple } from '@/lib/theme/palette'

export type PhaseKind = 'cut' | 'peak' | 'bulk' | 'maintenance'

export interface WeekPhase {
  kind: PhaseKind
  label: string         // full label, e.g. "HELIX Cut Week 3" / "PPL Cut Week 2"
  short: string         // compact label for the calendar cell, e.g. "Cut W3" / "Peak"
  eraTag: string        // era-distinct badge text: "PPL Cut" vs "Helix Cut"
  era: 'ppl' | 'helix'
  /** The phase on its own — "Cut", "Lean Bulk", "Maintenance Week". */
  name: string
  /** Week number within the phase, or null on an unnumbered phase. */
  n: number | null
}

// ─── THE global phase palette ────────────────────────────────────────────────
/**
 * One source for "what colour is a Cut". These used to live inside
 * `phaseBadgeStyle` as bare RGB triples, which meant every surface that wanted
 * a phase colour without a badge — the timeline week headers, most obviously —
 * either hardcoded a hex or fell back to steel. The Momentum week headers were
 * grey regardless of phase for exactly that reason.
 *
 * Cut is the signature ember, bulk is growth-green, maintenance is sleek steel,
 * and peak is platinum — the refined state rather than a direction of travel.
 *
 * Peak is not a direction like cut/bulk, it is the polished end state, so it
 * takes the brightest metal. Gold stays reserved for records.
 *
 * ── HEXES ARE THE SOURCE; TRIPLES ARE DERIVED ────────────────────────────────
 * Most consumers want `rgba(${rgb},0.12)`, so this table used to be written as
 * hand-typed decimal triples with the palette hex in a trailing comment. Two
 * had already drifted from the comment beside them — cut was `224,101,60`
 * (#E0653C), eleven units of green off EMBER, and peak was `22,245,195`, the
 * neon deleted two redesigns earlier. A transcription that has to be kept in
 * lockstep by hand will not be. `rgbTriple()` derives it instead.
 */
export const PHASE_HEX: Record<PhaseKind, string> = {
  cut: EMBER,
  peak: PLATINUM,
  bulk: EMERALD,
  maintenance: STEEL,
}

export const PHASE_RGB: Record<PhaseKind, string> = {
  cut: rgbTriple(PHASE_HEX.cut),
  peak: rgbTriple(PHASE_HEX.peak),
  bulk: rgbTriple(PHASE_HEX.bulk),
  maintenance: rgbTriple(PHASE_HEX.maintenance),
}

/** The desaturated PPL-legacy variants, so two Cut eras can never be confused. */
const PPL_HEX = {
  default: MUTED,      // was a fourth grey nobody named
  maintenance: SAND,   // the Thailand deload reads as a vacation, not a phase
} as const

/**
 * Phase colour as a hex, era-aware. The hex form matters wherever a consumer
 * appends an alpha (`${color}30`) rather than wrapping in `rgba()`.
 */
export function phaseHex(kind: PhaseKind, era: 'ppl' | 'helix' = 'helix'): string {
  if (era !== 'ppl') return PHASE_HEX[kind]
  // The Thailand deload is the sole PPL 'maintenance' phase and gets a warm
  // sand tone so the vacation reads distinctly in the timeline.
  return kind === 'maintenance' ? PPL_HEX.maintenance : PPL_HEX.default
}

/** Phase colour as an `rgb()` triple, era-aware. */
export function phaseRgb(kind: PhaseKind, era: 'ppl' | 'helix' = 'helix'): string {
  return rgbTriple(phaseHex(kind, era))
}

/** Phase colour as a hex-equivalent `rgb(...)` string, for `color`/`background`. */
export function phaseColor(kind: PhaseKind, era: 'ppl' | 'helix' = 'helix'): string {
  return `rgb(${phaseRgb(kind, era)})`
}

export interface WeekChip {
  /** "Helix-5" / "Push/Pull/Legs" — supplied by the caller, which knows the plan. */
  plan: string
  /** "Cut" / "Lean Bulk" / "Maintenance Week" */
  phase: string
  /** "Wk 3", or null on an unnumbered phase. */
  week: string | null
  rgb: string
  color: string
}

/**
 * The compact week identity: `[Plan] · [Phase] · [Wk N]`.
 *
 * Replaces `WeekPhase.label` ("Helix Cut · Week 3") on glanceable surfaces,
 * which crammed the plan and the phase into one run-on tag and told you nothing
 * about which programme you were running. The plan label is a parameter rather
 * than an import so this module stays free of a programs.ts dependency.
 */
export function weekChip(weekStartISO: string, planLabel: string): WeekChip | null {
  const phase = getWeekPhase(weekStartISO)
  if (!phase) return null
  return {
    plan: planLabel,
    phase: phase.name,
    week: phase.n != null ? `Wk ${phase.n}` : null,
    rgb: phaseRgb(phase.kind, phase.era),
    color: phaseColor(phase.kind, phase.era),
  }
}

interface PhaseDef {
  kind: PhaseKind
  name: string
  start: string         // YYYY-MM-DD (a Sunday)
  weeks: number
  numbered?: boolean    // append "Week N" per week
  short?: string        // compact override
  firstWeek?: number    // week numbering offset (blocks split around a deload)
  eraTag?: string       // era-distinct tag (defaults to the name)
  era?: 'ppl' | 'helix'
}

export const PHASES: PhaseDef[] = [
  // ── PPL Legacy era — the historical 50-day cut MUST stay visually separate ──
  { kind: 'bulk', name: 'Bulk',                    start: '2026-03-08', weeks: 9, numbered: true, era: 'ppl', eraTag: 'PPL Bulk' },
  { kind: 'cut',  name: 'Cut',                     start: '2026-05-10', weeks: 6, numbered: true, era: 'ppl', eraTag: 'PPL Cut' },
  { kind: 'peak', name: 'Peak Week (Maintenance)', start: '2026-06-21', weeks: 1, short: 'Peak',  era: 'ppl', eraTag: 'PPL Peak' },
  // Thailand trip deload — the Jun 28–Jul 11 gap between Peak Week and the HELIX
  // ramp. Real personal history; the only PPL-era 'maintenance' phase (its badge
  // keys off that to render warm sand rather than the muted PPL gray).
  { kind: 'maintenance', name: 'Thailand Vacation', start: '2026-06-28', weeks: 2, short: 'Thailand', era: 'ppl', eraTag: 'Thailand Vacation (Deload)' },
  // ── HELIX era ──
  // Week 0 = the transitional Axis-5 ramp (Wed/Thu/Fri 15–17 Jul) in the calendar
  // week starting 12 Jul; Helix Cut 5.1 (1935 kcal) opens 15 Jul. Cut W1–6 anchors
  // on 19 Jul (unchanged), scheduled maintenance week, Cut W7–12, Transition, then
  // Lean Bulk → 2027-01-16.
  { kind: 'peak',        name: 'Week 0 · Transition', start: '2026-07-12', weeks: 1, short: 'W0', era: 'helix', eraTag: 'HELIX · Week 0' },
  { kind: 'cut',         name: 'Cut',         start: '2026-07-19', weeks: 6,  numbered: true, era: 'helix', eraTag: 'Helix Cut' },
  { kind: 'maintenance', name: 'Maintenance Week', start: '2026-08-30', weeks: 1, short: 'Maint', era: 'helix', eraTag: 'HELIX Maintenance' },
  { kind: 'cut',         name: 'Cut',         start: '2026-09-06', weeks: 6,  numbered: true, firstWeek: 7, era: 'helix', eraTag: 'Helix Cut' },
  { kind: 'maintenance', name: 'Transition',  start: '2026-10-18', weeks: 2,  numbered: true, short: 'Trans', era: 'helix', eraTag: 'HELIX Transition' },
  { kind: 'bulk',        name: 'Lean Bulk',   start: '2026-11-01', weeks: 11, numbered: true, era: 'helix', eraTag: 'HELIX Lean Bulk' },
]


const isoUTC = (d: Date) => d.toISOString().slice(0, 10)

export interface ProgramWeek { weekStart: string; weekEnd: string; kind: PhaseKind; n: number; label: string; eraTag: string; era: 'ppl' | 'helix' }

/** Enumerate every week of the given phase kinds as "Week N" folders. */
export function enumerateWeeks(kinds: PhaseKind[]): ProgramWeek[] {
  const out: ProgramWeek[] = []
  for (const p of PHASES) {
    if (!kinds.includes(p.kind)) continue
    const start = new Date(`${p.start}T00:00:00Z`)
    for (let i = 0; i < p.weeks; i++) {
      const ws = new Date(start); ws.setUTCDate(ws.getUTCDate() + i * 7)
      const we = new Date(ws); we.setUTCDate(we.getUTCDate() + 6)
      const n = i + (p.firstWeek ?? 1)
      out.push({
        weekStart: isoUTC(ws), weekEnd: isoUTC(we), kind: p.kind, n,
        label: p.numbered ? `Week ${n}` : p.name,
        eraTag: p.eraTag ?? p.name, era: p.era ?? 'ppl',
      })
    }
  }
  return out.reverse() // newest first
}

/** Returns the phase for a given Sunday week-start (YYYY-MM-DD), or null. */
export function getWeekPhase(weekStartISO: string): WeekPhase | null {
  for (const p of PHASES) {
    const start = new Date(`${p.start}T00:00:00Z`)
    for (let i = 0; i < p.weeks; i++) {
      const ws = new Date(start)
      ws.setUTCDate(ws.getUTCDate() + i * 7)
      if (isoUTC(ws) === weekStartISO) {
        const era = p.era ?? 'ppl'
        const eraTag = p.eraTag ?? p.name
        if (p.numbered) {
          const n = i + (p.firstWeek ?? 1)
          return { kind: p.kind, label: `${eraTag} · Week ${n}`, short: `${p.short ?? p.name} W${n}`, eraTag, era, name: p.name, n }
        }
        return { kind: p.kind, label: eraTag, short: p.short ?? p.name, eraTag, era, name: p.name, n: null }
      }
    }
  }
  return null
}

/** Glow / color styling per phase kind for the calendar badge (PPL era = muted gray). */
export function phaseBadgeStyle(kind: PhaseKind, selected: boolean, era: 'ppl' | 'helix' = 'helix'): import('react').CSSProperties {
  const rgb = phaseRgb(kind, era)
  return {
    background: `rgba(${rgb},0.12)`,
    border: `1px solid rgba(${rgb},0.40)`,
    boxShadow: selected ? `0 0 16px rgba(${rgb},0.55)` : `0 0 9px rgba(${rgb},0.22)`,
    color: `rgb(${rgb})`,
  }
}
