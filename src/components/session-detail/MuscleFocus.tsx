'use client'

import { useMemo } from 'react'
import { Target } from 'lucide-react'
import type { SessionDetail } from '@/lib/hooks/useSessionDetail'
import { useWeeklyVolume } from '@/lib/hooks/useWeeklyVolume'
import { MUSCLE_COLOR, ZONE_META, volumeZone, type LandmarkMuscle } from '@/lib/training/landmarks'
import { weekStartOf } from '@/lib/utils/week'
import { EMBER, MUTED } from '@/lib/theme/palette'

/**
 * Muscle Focus — what this session actually trained, and where that leaves the
 * week.
 *
 * ONE taxonomy throughout: the 13 landmark muscles, resolved from the exercise
 * NAMES that were performed. The previous version crossed two:
 * `detail.muscleSets` spoke in landmark muscles while the weekly band looked
 * each one up in `VOLUME_LANDMARKS`, which is keyed by the six BROAD display
 * groups. Only "Chest" and "Back" are spelled the same in both, so every muscle
 * a leg day trains fell through the lookup and was dropped — leaving a Legs &
 * Core B session rendering "Chest" and "Back" at zero sets.
 *
 * Muscles with no sets are omitted entirely, this session and week-to-date.
 */
export function MuscleFocus({ detail }: { detail: SessionDetail }) {
  const weekStart = weekStartOf(detail.date)
  // Week-to-date UP TO this session's day — a report on Wednesday shouldn't
  // include sets that were logged on Friday.
  const { data: week } = useWeeklyVolume(weekStart, detail.date)

  const thisSession = useMemo(
    () => new Map<LandmarkMuscle, number>(detail.muscleSets.map((m) => [m.muscle, m.sets])),
    [detail.muscleSets],
  )

  // Only muscles that were actually worked — this session or earlier in the week.
  const rows = useMemo(() => {
    const worked = (week?.muscles ?? []).filter((m) => m.sets > 0)
    if (worked.length) return worked
    // Week data not loaded (or pre-migration): fall back to this session alone,
    // graded against no target rather than inventing one.
    return detail.muscleSets.map((m) => ({
      muscle: m.muscle, sets: m.sets, target: 0,
      zone: volumeZone(m.sets, 0), color: MUSCLE_COLOR[m.muscle],
    }))
  }, [week, detail.muscleSets])

  if (!detail.muscleSets.length) return null
  const maxSets = Math.max(...detail.muscleSets.map((m) => m.sets), 1)

  return (
    <section className="helix-card space-y-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-fluid-base font-bold text-text flex items-center gap-2">
          <Target className="w-4 h-4" style={{ color: EMBER }} aria-hidden="true" /> Muscle Focus
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">
          {detail.muscleSets.reduce((n, m) => n + m.sets, 0)} direct sets
        </span>
      </div>

      {/* 1 · This session's direct-set distribution */}
      <div className="space-y-2">
        {detail.muscleSets.map((m) => {
          const color = MUSCLE_COLOR[m.muscle] ?? MUTED
          return (
            <div key={m.muscle} className="flex items-center gap-2.5">
              <span className="text-fluid-xs font-semibold w-[74px] shrink-0 truncate" style={{ color }}>{m.muscle}</span>
              <span className="flex-1 h-2.5 rounded-full bg-white/[0.05] overflow-hidden">
                <span className="block h-full rounded-full"
                  style={{ width: `${(m.sets / maxSets) * 100}%`, background: color, boxShadow: `0 0 8px ${color}66` }} />
              </span>
              <span className="helix-num text-fluid-xs text-muted w-10 text-right tabular-nums">
                {m.sets} set{m.sets !== 1 ? 's' : ''}
              </span>
            </div>
          )
        })}
      </div>

      {/* 2 · Week-to-date against the active program's per-muscle target */}
      {rows.length > 0 && (
        <div className="pt-2.5 border-t border-white/[0.06] space-y-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted">
            Week to date · Sun → {new Date(`${detail.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            {week ? ` · ${week.program} targets` : ''}
          </p>
          {rows.map((m) => {
            const meta = ZONE_META[m.zone]
            const today = thisSession.get(m.muscle) ?? 0
            // Scale to the target with headroom, so "over" is visibly over.
            const scaleMax = Math.max(m.target * 1.4, m.sets, 1)
            return (
              <div key={m.muscle} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="font-semibold text-text/80 truncate">{m.muscle}</span>
                  <span className="helix-num shrink-0" style={{ color: meta.color }}>
                    {m.sets}{m.target > 0 ? `/${m.target}` : ''} · {meta.label}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-white/[0.05] overflow-hidden">
                  {/* Week-to-date fill, with THIS session's contribution brighter
                      at the leading edge so the card answers "what did today add". */}
                  <span className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${Math.min(100, (m.sets / scaleMax) * 100)}%`, background: `${meta.color}66` }} />
                  {today > 0 && (
                    <span className="absolute inset-y-0 rounded-full"
                      style={{
                        left: `${Math.max(0, Math.min(100, ((m.sets - today) / scaleMax) * 100))}%`,
                        width: `${Math.min(100, (today / scaleMax) * 100)}%`,
                        background: meta.color,
                        boxShadow: `0 0 6px ${meta.color}aa`,
                      }} />
                  )}
                  {m.target > 0 && (
                    <span className="absolute inset-y-0 w-px bg-white/45"
                      style={{ left: `${(m.target / scaleMax) * 100}%` }} aria-hidden="true" />
                  )}
                </div>
                {today > 0 && (
                  <p className="text-[9px] text-muted">
                    {today} from this session{m.target > 0 && m.sets < m.target ? ` · ${m.target - m.sets} to target` : ''}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
