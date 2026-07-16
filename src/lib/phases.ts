/**
 * Training-phase anchors. Drives the glowing week badges in Weekly Summaries.
 * Edit this config to add future phases (each `start` should be a Sunday to
 * align with the calendar's Sunday-start weeks).
 */

export type PhaseKind = 'cut' | 'peak' | 'bulk' | 'maintenance'

export interface WeekPhase {
  kind: PhaseKind
  label: string         // full label, e.g. "HELIX Cut Week 3" / "PPL Cut Week 2"
  short: string         // compact label for the calendar cell, e.g. "Cut W3" / "Peak"
  eraTag: string        // era-distinct badge text: "PPL Cut" vs "Helix 5.1 Cut"
  era: 'ppl' | 'helix'
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
  // ── HELIX era ──
  // Week 0 = the transitional Axis-5 ramp (Wed/Thu/Fri 15–17 Jul) in the calendar
  // week starting 12 Jul; Helix Cut 5.1 (1935 kcal) opens 15 Jul. Cut W1–6 anchors
  // on 19 Jul (unchanged), scheduled maintenance week, Cut W7–12, Transition, then
  // Lean Bulk → 2027-01-16.
  { kind: 'peak',        name: 'Week 0 · Transition', start: '2026-07-12', weeks: 1, short: 'W0', era: 'helix', eraTag: 'HELIX · Week 0' },
  { kind: 'cut',         name: 'Cut',         start: '2026-07-19', weeks: 6,  numbered: true, era: 'helix', eraTag: 'Helix 5.1 Cut' },
  { kind: 'maintenance', name: 'Maintenance Week', start: '2026-08-30', weeks: 1, short: 'Maint', era: 'helix', eraTag: 'HELIX Maintenance' },
  { kind: 'cut',         name: 'Cut',         start: '2026-09-06', weeks: 6,  numbered: true, firstWeek: 7, era: 'helix', eraTag: 'Helix 5.1 Cut' },
  { kind: 'maintenance', name: 'Transition',  start: '2026-10-18', weeks: 2,  numbered: true, short: 'Trans', era: 'helix', eraTag: 'HELIX Transition' },
  { kind: 'bulk',        name: 'Lean Bulk',   start: '2026-11-01', weeks: 11, numbered: true, era: 'helix', eraTag: 'HELIX Lean Bulk' },
]

/** v5.1 phase exit / kill-switch protocol (judged on 7-day averages). */
export const PHASE_RULES = {
  cutExit: 'Exit Cut when 7-day avg BIA ≤ 13.0% AND navel waist ≤ 74 cm · hard stop 2026-10-17',
  bulkKill: 'Kill Lean Bulk on ANY of: BIA ≥ 16.5% · waist +4 cm vs post-cut baseline · 2027-01-16',
  rates: 'Cut −0.40…−0.50 kg/wk · Bulk +0.20…+0.25 kg/wk — 7-day rolling average only',
} as const

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
          return { kind: p.kind, label: `${eraTag} · Week ${n}`, short: `${p.short ?? p.name} W${n}`, eraTag, era }
        }
        return { kind: p.kind, label: eraTag, short: p.short ?? p.name, eraTag, era }
      }
    }
  }
  return null
}

/** Glow / color styling per phase kind for the calendar badge (PPL era = muted gray). */
export function phaseBadgeStyle(kind: PhaseKind, selected: boolean, era: 'ppl' | 'helix' = 'helix'): import('react').CSSProperties {
  // Bioluminescent spectrum; the legacy PPL era renders desaturated so the two
  // Cut eras can never be visually confused.
  const palette: Record<PhaseKind, string> = {
    cut: '62,224,255',          // plankton cyan
    peak: '22,245,195',         // living teal
    bulk: '67,245,155',         // mint green
    maintenance: '139,124,255', // abyss violet
  }
  const rgb = era === 'ppl' ? '139,151,178' : palette[kind]
  return {
    background: `rgba(${rgb},0.12)`,
    border: `1px solid rgba(${rgb},0.40)`,
    boxShadow: selected ? `0 0 16px rgba(${rgb},0.55)` : `0 0 9px rgba(${rgb},0.22)`,
    color: `rgb(${rgb})`,
  }
}
