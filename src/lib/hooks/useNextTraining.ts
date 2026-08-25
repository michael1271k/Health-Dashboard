'use client'

import { useMemo } from 'react'
import {
  scheduleDayFor, programDayByKey, setsForPhase, activePhase,
  type ProgramExercise, type ScheduleDay,
} from '@/lib/programs'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { logicalTodayISO } from '@/lib/utils/day'
import { isoAddDays } from '@/lib/utils/week'

export interface NextTraining {
  date: string
  day: ScheduleDay
  dayKey: string
  /** Today IS the session — not a preview of a future one. */
  isToday: boolean
  /** In PROGRAM ORDER, phase-resolved, bulk-only lifts already dropped on a cut. */
  exercises: ProgramExercise[]
}

/** How far forward to look. Two weeks covers any swap the planner can make. */
const HORIZON = 14

/**
 * The next session the plan asks for, and the lifts it asks for in order.
 *
 * ── PROGRAM ORDER, NOT "CLOSEST TO A RECORD" ─────────────────────────────────
 * The ranking was a real choice and it went the other way on purpose. Sorting by
 * how near each lift is to its record answers a question you ask at the end of a
 * block; walking into the gym you are about to do the FIRST movement, and a tile
 * that opened with the sixth is a tile you have to search. Program order is also
 * the order the logger will present them in, so the tile and the deck agree.
 *
 * ── AND WHY IT SCANS FORWARD ─────────────────────────────────────────────────
 * On a rest day there is still a next session, and it is the useful thing to
 * know — the whole point of a rest day is what it is preparing you for. The scan
 * honours swaps, because `scheduleDayFor` does: a moved Wednesday resolves at
 * the date it moved to, never at the weekday it started on.
 */
export function useNextTraining(today = logicalTodayISO()): NextTraining | null {
  const scheduleVersion = useScheduleVersion()

  return useMemo(() => {
    void scheduleVersion   // scheduleDayFor reads the store; this is the read
    const phase = activePhase()
    for (let i = 0; i < HORIZON; i += 1) {
      const date = isoAddDays(today, i)
      const day = scheduleDayFor(date)
      if (day === 'rest' || !day.dayKey) continue
      const program = programDayByKey(day.dayKey)
      const exercises = (program?.exercises ?? []).filter((e) => setsForPhase(e, phase) > 0)
      return { date, day, dayKey: day.dayKey, isToday: i === 0, exercises }
    }
    return null
  }, [today, scheduleVersion])
}
