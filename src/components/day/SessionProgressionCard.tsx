'use client'

import { useState } from 'react'
import { Loader2, Pencil, Trash2, TrendingUp } from 'lucide-react'
import type { GymReportRow } from '@/lib/hooks/useWeekly'
import { useDeleteSession, useSessionOrdinal } from '@/lib/hooks/useDayVault'
import { useEditSession } from '@/lib/hooks/useEditSession'
import { SessionIntelCard } from '@/components/reports/SessionIntelCard'
import { PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId } from '@/lib/programs'

/**
 * Progression & Insights for one session: "Upper B · Session #N", the full
 * prev-session comparison + PR spotlight (SessionIntelCard), and an ISOLATED
 * Delete Workout action (removes only the session + sets).
 */
export function SessionProgressionCard({ session, date }: { session: GymReportRow; date: string }) {
  const del = useDeleteSession(date)
  const edit = useEditSession()
  const { data: ordinal } = useSessionOrdinal(session.dayKey, session.split, date)
  const [confirm, setConfirm] = useState(false)

  const program = PROGRAMS[getActiveProgramId()] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
  const label = (session.dayKey && program.days.find((d) => d.key === session.dayKey)?.label)
    ?? (session.split[0]?.toUpperCase() + session.split.slice(1))

  return (
    <section className="helix-card holo-sheen space-y-3" style={{ borderColor: '#16F5C328' }}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: '#16F5C31a', color: '#16F5C3' }}>
          <TrendingUp className="w-4 h-4" aria-hidden="true" />
        </span>
        <h3 className="font-heading font-bold text-fluid-base text-text">
          {label}{ordinal ? <span className="text-muted font-semibold"> · Session #{ordinal}</span> : null}
        </h3>
      </div>

      <SessionIntelCard session={session} />

      <div className="pt-3 border-t border-white/[0.06]">
        {confirm ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-fluid-xs text-muted flex-1 min-w-[140px]">Delete this workout? Your nutrition, sleep &amp; weight for the day stay.</span>
            <button type="button" onClick={() => setConfirm(false)} className="btn-glass min-h-[38px] text-fluid-xs">Cancel</button>
            <button
              type="button"
              disabled={del.isPending}
              onClick={() => del.mutate(session.id)}
              className="min-h-[38px] px-3.5 rounded-lg text-fluid-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
              style={{ color: '#fff', background: '#FF5470', boxShadow: '0 0 16px #FF547055' }}
            >
              {del.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
              Delete
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" disabled={edit.loading} onClick={() => edit.load(session.id)}
              className="btn-glass min-h-[38px] text-fluid-xs justify-center flex-1" style={{ color: '#3EE0FF' }}>
              {edit.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
              Edit Workout
            </button>
            <button type="button" onClick={() => setConfirm(true)}
              className="min-h-[38px] px-3.5 rounded-lg text-fluid-xs font-bold inline-flex items-center gap-1.5 justify-center transition-colors"
              style={{ color: '#FF5470', background: '#FF54701a', border: '1px solid #FF547055' }}>
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Delete Workout
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
