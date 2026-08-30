/**
 * Training-phase anchors. Drives the glowing week badges in Weekly Summaries.
 * Edit this config to add future phases (each `start` should be a Sunday to
 * align with the calendar's Sunday-start weeks).
 */

import { EMBER, PLATINUM, EMERALD, STEEL, MUTED, SAND, rgbTriple } from '@/lib/theme/palette'

/**
 * ── `deload`, NOT `maintenance` (renamed 2026-08-30) ─────────────────────────
 * "Maintenance" named two different things on two different axes, and they
 * disagreed. On THIS axis it is a block of the programme with a start date and
 * a length — the Thailand vacation, the Transition weeks — and what those have
 * in common is that they are DELOADS: the training eases off for a bounded
 * stretch and then the block resumes.
 *
 * On the other axis, `LEVERS`, "maintenance week" is a NUTRITION rung: a
 * planned week at maintenance calories, taken on purpose inside a cut, with the
 * training programme unchanged. The one-week `Maintenance Week` phase that used
 * to sit in `PHASES` at 2026-08-30 was the same week described twice, badly —
 * `maintenance.ts` exists entirely because the two copies had already drifted
 * apart once. That row is DELETED; the lever owns the week, alone.
 *
 * So a programme phase is a direction (`cut` / `bulk`), a polished end state
 * (`peak`), or a bounded easing-off (`deload`). It is never a diet.
 */
export type PhaseKind = 'cut' | 'peak' | 'bulk' | 'deload'

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
 * Cut is the signature ember, bulk is growth-green, a deload is sleek steel,
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
  deload: STEEL,
}

export const PHASE_RGB: Record<PhaseKind, string> = {
  cut: rgbTriple(PHASE_HEX.cut),
  peak: rgbTriple(PHASE_HEX.peak),
  bulk: rgbTriple(PHASE_HEX.bulk),
  deload: rgbTriple(PHASE_HEX.deload),
}

/** The desaturated PPL-legacy variants, so two Cut eras can never be confused. */
const PPL_HEX = {
  default: MUTED,      // was a fourth grey nobody named
  deload: SAND,        // the Thailand deload reads as a vacation, not a phase
} as const

/**
 * Phase colour as a hex, era-aware. The hex form matters wherever a consumer
 * appends an alpha (`${color}30`) rather than wrapping in `rgba()`.
 */
export function phaseHex(kind: PhaseKind, era: 'ppl' | 'helix' = 'helix'): string {
  if (era !== 'ppl') return PHASE_HEX[kind]
  // The Thailand deload is the sole PPL 'deload' phase and gets a warm sand
  // tone so the vacation reads distinctly in the timeline.
  return kind === 'deload' ? PPL_HEX.deload : PPL_HEX.default
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
  { kind: 'deload', name: 'Thailand Vacation', start: '2026-06-28', weeks: 2, short: 'Thailand', era: 'ppl', eraTag: 'Thailand Vacation (Deload)' },
  // ── HELIX era ──
  // Week 0 = the transitional Axis-5 ramp (Wed/Thu/Fri 15–17 Jul) in the calendar
  // week starting 12 Jul; Helix Cut 5.1 (1935 kcal) opens 15 Jul. The cut then
  // runs unbroken to the Transition, and Lean Bulk closes the block → 2027-01-16.
  //
  // ── ONE CUT, NOT TWO WITH A WEEK WEDGED BETWEEN THEM (2026-08-30) ──────────
  // This was `Cut W1–6`, then a one-week `Maintenance Week` phase, then
  // `Cut W7–12` restarting its own count at 7. That middle row was a NUTRITION
  // decision wearing a training phase's clothes — the deck it seeds is
  // identical either side of it (`forPhase` only branches on `cut`), so the
  // only thing it ever changed was the calorie target, which is the lever's
  // job and is recorded in `LEVER_SCHEDULE` as a `maintenance-week` rung.
  //
  // Keeping both meant keeping them in sync by hand, and they had already come
  // apart once: the timeline painted a maintenance week while the goals, the
  // score and the export all still ran the cut's numbers.
  //
  // Deleting it also settles a numbering disagreement it had caused. Skipping
  // the week in the cut's own count made 6 Sep "Cut Week 7" while
  // `programWeekNumber` — the counter the dashboard badge and the export use —
  // called it week 8. One unbroken 13-week cut, and the two agree again: a week
  // eaten at maintenance is still a week of the cut, and it is still trained.
  { kind: 'peak', name: 'Week 0 · Transition', start: '2026-07-12', weeks: 1, short: 'W0', era: 'helix', eraTag: 'HELIX · Week 0' },
  { kind: 'cut',    name: 'Cut',         start: '2026-07-19', weeks: 13, numbered: true, era: 'helix', eraTag: 'Helix Cut' },
  { kind: 'deload', name: 'Transition',  start: '2026-10-18', weeks: 2,  numbered: true, short: 'Trans', era: 'helix', eraTag: 'HELIX Transition' },
  { kind: 'bulk',   name: 'Lean Bulk',   start: '2026-11-01', weeks: 11, numbered: true, era: 'helix', eraTag: 'HELIX Lean Bulk' },
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
/**
 * The phase a DATE falls in, and how far into it that date is.
 *
 * `getWeekPhase` answers the same question for a week start, which is the right
 * granularity for a timeline chip and the wrong one for anything that counts
 * days: a ledger asking "how long has this phase been running" needs to know it
 * is day 3, not that the week began under the previous regime.
 *
 * Null between phases. The PPL and HELIX blocks are not contiguous — there is a
 * real gap around the Thailand trip — and inventing a phase to fill it would put
 * a deload's eating under a cut's name.
 */
export function phaseSpanFor(dateISO: string): { def: PhaseDef; start: string; dayIndex: number } | null {
  const t = Date.parse(`${dateISO}T00:00:00Z`)
  if (Number.isNaN(t)) return null
  for (const def of PHASES) {
    const start = Date.parse(`${def.start}T00:00:00Z`)
    const days = def.weeks * 7
    const idx = Math.floor((t - start) / 86_400_000)
    if (idx >= 0 && idx < days) return { def, start: def.start, dayIndex: idx }
  }
  return null
}

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
