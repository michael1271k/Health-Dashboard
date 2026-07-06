/**
 * Training-phase anchors. Drives the glowing week badges in Weekly Summaries.
 * Edit this config to add future phases (each `start` should be a Sunday to
 * align with the calendar's Sunday-start weeks).
 */

export type PhaseKind = 'cut' | 'peak' | 'bulk' | 'maintenance'

export interface WeekPhase {
  kind: PhaseKind
  label: string         // full label, e.g. "Cut Week 3" / "Peak Week (Maintenance)"
  short: string         // compact label for the calendar cell, e.g. "Cut W3" / "Peak"
}

interface PhaseDef {
  kind: PhaseKind
  name: string
  start: string         // YYYY-MM-DD (a Sunday)
  weeks: number
  numbered?: boolean    // append "Week N" per week
  short?: string        // compact override
  firstWeek?: number    // week numbering offset (blocks split around a deload)
}

export const PHASES: PhaseDef[] = [
  // ── PPL Legacy era ──
  { kind: 'bulk', name: 'Bulk',                    start: '2026-03-08', weeks: 9, numbered: true },
  { kind: 'cut',  name: 'Cut',                     start: '2026-05-10', weeks: 6, numbered: true },
  { kind: 'peak', name: 'Peak Week (Maintenance)', start: '2026-06-21', weeks: 1, short: 'Peak' },
  // ── SYSTEM UPDATE v5.1 (APEX-5.1 era) ──
  // Cut W1–6, scheduled maintenance week (NOT an adherence failure), Cut W7–12
  // (nominal exit ~10-10, flex to 10-17), Transition, then Lean Bulk → 2027-01-16.
  { kind: 'cut',         name: 'Cut',         start: '2026-07-19', weeks: 6,  numbered: true },
  { kind: 'maintenance', name: 'Maintenance Week', start: '2026-08-30', weeks: 1, short: 'Maint' },
  { kind: 'cut',         name: 'Cut',         start: '2026-09-06', weeks: 6,  numbered: true, firstWeek: 7 },
  { kind: 'maintenance', name: 'Transition',  start: '2026-10-18', weeks: 2,  numbered: true, short: 'Trans' },
  { kind: 'bulk',        name: 'Lean Bulk',   start: '2026-11-01', weeks: 11, numbered: true },
]

/** v5.1 phase exit / kill-switch protocol (judged on 7-day averages). */
export const PHASE_RULES = {
  cutExit: 'Exit Cut when 7-day avg BIA ≤ 13.0% AND navel waist ≤ 74 cm · hard stop 2026-10-17',
  bulkKill: 'Kill Lean Bulk on ANY of: BIA ≥ 16.5% · waist +4 cm vs post-cut baseline · 2027-01-16',
  rates: 'Cut −0.40…−0.50 kg/wk · Bulk +0.20…+0.25 kg/wk — 7-day rolling average only',
} as const

const isoUTC = (d: Date) => d.toISOString().slice(0, 10)

export interface ProgramWeek { weekStart: string; weekEnd: string; kind: PhaseKind; n: number; label: string }

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
      out.push({ weekStart: isoUTC(ws), weekEnd: isoUTC(we), kind: p.kind, n, label: p.numbered ? `Week ${n}` : p.name })
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
        if (p.numbered) {
          const n = i + (p.firstWeek ?? 1)
          return { kind: p.kind, label: `${p.name} Week ${n}`, short: `${p.short ?? p.name} W${n}` }
        }
        return { kind: p.kind, label: p.name, short: p.short ?? p.name }
      }
    }
  }
  return null
}

/** Glow / color styling per phase kind for the calendar badge. */
export function phaseBadgeStyle(kind: PhaseKind, selected: boolean): import('react').CSSProperties {
  // Cyber Mint cool spectrum (all distinct, all cool)
  const palette: Record<PhaseKind, string> = {
    cut: '56,225,255',          // cyan
    peak: '25,227,177',         // teal (signature)
    bulk: '67,245,155',         // mint green
    maintenance: '79,195,255',  // aqua-blue
  }
  const rgb = palette[kind]
  return {
    background: `rgba(${rgb},0.12)`,
    border: `1px solid rgba(${rgb},0.40)`,
    boxShadow: selected ? `0 0 16px rgba(${rgb},0.55)` : `0 0 9px rgba(${rgb},0.22)`,
    color: `rgb(${rgb})`,
  }
}
