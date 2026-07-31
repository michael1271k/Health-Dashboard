'use client'

import { useEffect, useState } from 'react'
import { getWeekPhase, phaseBadgeStyle, type PhaseKind } from '@/lib/phases'
import { weekStartOf } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import { activeProgram, activePhase } from '@/lib/programs'

/**
 * ActivePlanBadge — a glanceable, always-visible chip announcing the plan +
 * phase you're currently training (e.g. "HELIX · Cut · Week 2"). Reads the live
 * week from `logicalTodayISO` (so it flips at the 00:00 day/week rollover) and
 * borrows the calendar's per-phase bioluminescent glow via `phaseBadgeStyle`,
 * so its colour tells you the block at a glance — cyan Cut, mint Bulk, violet
 * Maintenance.
 */
const PHASE_WORD: Record<PhaseKind, string> = {
  cut: 'Cut',
  bulk: 'Lean Bulk',
  peak: 'Peak',
  maintenance: 'Maintenance',
}

export function ActivePlanBadge({ className = '' }: { className?: string }) {
  const phase = getWeekPhase(weekStartOf(logicalTodayISO()))

  // The plan and phase come from the ACTIVE PLAN, not from the date calendar.
  // This badge used to derive both from `phases.ts` alone, so switching plan or
  // phase in Settings changed the header chip and the nutrition goals but left
  // this one announcing the old block. Read post-mount: activeProgram() reads
  // localStorage, which the server render has no access to.
  const [active, setActive] = useState<{ label: string; phase: PhaseKind } | null>(null)
  useEffect(() => {
    setActive({ label: activeProgram().label, phase: activePhase() as PhaseKind })
  }, [])

  if (!phase) return null

  // Before hydration, fall back to the calendar's era word rather than flashing
  // an empty chip.
  const plan = (active?.label ?? (phase.era === 'helix' ? 'HELIX' : 'PPL')).toUpperCase()
  const kind = active?.phase ?? phase.kind
  const weekMatch = phase.label.match(/Week\s+(\d+)/i)

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full pl-2.5 pr-3 py-1 backdrop-blur-md ${className}`}
      style={phaseBadgeStyle(kind, true, phase.era)}
      title={phase.label}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping"
          style={{ background: 'currentColor' }}
        />
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: 'currentColor' }} />
      </span>
      <span className="text-[11px] font-black uppercase tracking-[0.18em] leading-none">{plan}</span>
      <span className="opacity-40 text-[10px] leading-none">·</span>
      <span className="text-[11px] font-bold leading-none">{PHASE_WORD[kind]}</span>
      {weekMatch && (
        <span className="text-[10px] font-semibold tabular-nums leading-none opacity-80">· W{weekMatch[1]}</span>
      )}
    </div>
  )
}
