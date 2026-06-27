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
}

export const PHASES: PhaseDef[] = [
  { kind: 'cut',  name: 'Cut',                     start: '2026-05-10', weeks: 6, numbered: true },
  { kind: 'peak', name: 'Peak Week (Maintenance)', start: '2026-06-21', weeks: 1, short: 'Peak' },
]

const isoUTC = (d: Date) => d.toISOString().slice(0, 10)

/** Returns the phase for a given Sunday week-start (YYYY-MM-DD), or null. */
export function getWeekPhase(weekStartISO: string): WeekPhase | null {
  for (const p of PHASES) {
    const start = new Date(`${p.start}T00:00:00Z`)
    for (let i = 0; i < p.weeks; i++) {
      const ws = new Date(start)
      ws.setUTCDate(ws.getUTCDate() + i * 7)
      if (isoUTC(ws) === weekStartISO) {
        if (p.numbered) {
          return { kind: p.kind, label: `${p.name} Week ${i + 1}`, short: `${p.short ?? p.name} W${i + 1}` }
        }
        return { kind: p.kind, label: p.name, short: p.short ?? p.name }
      }
    }
  }
  return null
}

/** Glow / color styling per phase kind for the calendar badge. */
export function phaseBadgeStyle(kind: PhaseKind, selected: boolean): import('react').CSSProperties {
  const palette: Record<PhaseKind, string> = {
    cut: '61,125,255',          // electric blue
    peak: '124,92,255',         // energy violet — distinct from Cut
    bulk: '45,212,167',         // success teal
    maintenance: '255,176,32',  // warm amber
  }
  const rgb = palette[kind]
  return {
    background: `rgba(${rgb},0.12)`,
    border: `1px solid rgba(${rgb},0.40)`,
    boxShadow: selected ? `0 0 16px rgba(${rgb},0.55)` : `0 0 9px rgba(${rgb},0.22)`,
    color: `rgb(${rgb})`,
  }
}
