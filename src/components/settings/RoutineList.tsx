'use client'

import { activeProgram } from '@/lib/programs'
import { parseRepWindow } from '@/lib/training/ceilings'
import { countCommittedSets } from '@/lib/sessions/schema'
import { useRoutineTemplates } from '@/lib/hooks/useRoutineTemplate'
import { GOLD } from '@/lib/theme/palette'
import type { NutritionMode } from '@/lib/types/workout'

const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * What each programmed day actually runs.
 *
 * De-duplicated: a Push that runs Sun AND Thu is listed once with the weekdays
 * it lands on. THE STORED TEMPLATE WINS when there is one and this is the
 * active plan — this list used to show the programme as AUTHORED, which stopped
 * being what you actually run the first time you dropped a set or reordered
 * anything, and no screen anywhere showed the real routine. `routine_templates`
 * is rewritten from the exact deck on every commit, so it is the honest answer.
 * The rep window still comes from the programme: it is the TARGET, and a
 * template records what happened, not what to aim for.
 */
export function RoutineList({ planId, phase, isActive }: {
  planId: string
  phase: NutritionMode
  isActive: boolean
}) {
  // Read here rather than handed down: the page was fetching this only to pass
  // it through, which put a query in the page for a component that could ask.
  const { data: templates } = useRoutineTemplates()
  const phaseDays = activeProgram(planId, phase).days
  const routineSig = (d: (typeof phaseDays)[number]) =>
    d.exercises.map((e) => `${e.name}·${e.sets}×${e.reps}`).join('|')
  const routines: Array<{ day: (typeof phaseDays)[number]; weekdays: number[] }> = []
  const seen = new Map<string, { day: (typeof phaseDays)[number]; weekdays: number[] }>()
  for (const d of phaseDays) {
    const sig = routineSig(d)
    const hit = seen.get(sig)
    if (hit) hit.weekdays.push(d.weekday)
    else { const entry = { day: d, weekdays: [d.weekday] }; seen.set(sig, entry); routines.push(entry) }
  }

  return (
    <div className="space-y-2">
      {routines.map(({ day: d, weekdays }) => {
        const stored = isActive ? templates?.get(d.key) : undefined
        const rows = stored
          ? stored.template.exercises
            .filter((e) => e.kind !== 'cardio')
            .map((e) => {
              // Physical sets — a unilateral pair is two rows and ONE set, and
              // printing the row count here is the exact confusion this removes.
              const programmed = d.exercises.find((x) => x.name === e.name)
              return { name: e.name, sets: countCommittedSets(e.sets), reps: programmed?.reps }
            })
          : d.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps }))
        return (
          <div key={d.key} className="rounded-lg bg-white/[0.015] border border-white/[0.05] px-2.5 py-2">
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-[11px] font-bold" style={{ color: d.color }}>{d.label}</span>
              <span className="text-[9px] text-muted">{weekdays.map((w) => WD_SHORT[w]).join(' & ')}</span>
              {d.sub && <span className="text-[9px] text-muted">· {d.sub}</span>}
            </div>
            {stored && (
              <div className="text-[9px] text-muted mb-1">
                As last performed{stored.updatedAt ? ` · ${stored.updatedAt.slice(0, 10)}` : ''}
              </div>
            )}
            <div className="space-y-0.5">
              {rows.map((e) => {
                const w = e.reps ? parseRepWindow(e.reps) : null
                return (
                  <div key={e.name} className="flex items-baseline justify-between gap-2 text-[11px] leading-snug">
                    <span className="text-text/80 truncate">{e.name}</span>
                    <span className="helix-num text-muted shrink-0 tabular-nums">
                      {e.sets}×{' '}
                      {w
                        ? <>{w.floor}<span className="opacity-40">–</span><span style={{ color: GOLD }}>{w.ceiling}</span></>
                        : e.reps ?? ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

