'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Search, ChevronRight } from 'lucide-react'
import { AppBar } from '@/components/nav/AppBar'
import { Zone, ZoneRow, ZoneEmpty, ZoneSkeleton } from '@/components/ui/Zone'
import { useExerciseCatalog, type CatalogExercise } from '@/lib/hooks/useExerciseCatalog'
import { exerciseHistoryQuery } from '@/lib/hooks/useExerciseHistory'
import { EMBER, MUTED } from '@/lib/theme/palette'
import { groupColor } from '@/lib/theme/muscleHue'
import { blurOnTap } from '@/lib/utils/blurOnTap'


/**
 * Every lift you have ever logged, grouped by what it trains.
 *
 * A sub-route of Training rather than a sixth tab — nav-items.ts carries an
 * explicit argument against a sixth, and a library is somewhere you go from
 * the training screen, not a peer of it.
 */
export default function ExerciseLibraryPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { data, isPending } = useExerciseCatalog()
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return data?.groups ?? []
    return (data?.groups ?? [])
      .map((g) => ({ ...g, exercises: g.exercises.filter((e) => e.name.toLowerCase().includes(needle)) }))
      .filter((g) => g.exercises.length > 0)
  }, [data, q])

  const total = data?.flat.length ?? 0

  return (
    <div data-fullbleed className="min-h-dvh">
      <AppBar accent={EMBER}>
        {/* An explicit push to the tab, NOT `router.back()`. The exercise detail
            page returns here with a push, so history grows: Workout → list →
            detail → list. `back()` from the list then walked INTO the exercise
            just left, which read as the Back button going forwards. */}
        <button onClick={() => router.push('/workout')} onPointerUp={blurOnTap}
          className="btn-glass shrink-0 min-h-[44px]" aria-label="Back to Workout">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-fluid-sm font-bold text-text truncate leading-tight">Exercises</h1>
          <span className="text-[10px] text-muted">{total} with history</span>
        </div>
      </AppBar>

      {/* Filtering is client-side over a list already in memory — a query per
          keystroke for thirty rows would be slower than not having a search. */}
      <div className="mx-auto w-full max-w-[68ch] px-3 py-2">
        <label className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 min-h-[42px]">
          <Search className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search exercises"
            aria-label="Search exercises"
            className="flex-1 min-w-0 bg-transparent text-sm text-text placeholder:text-muted outline-none"
          />
        </label>
      </div>

      {isPending ? (
        <>
          <ZoneSkeleton label="Chest" rows={4} />
          <ZoneSkeleton label="Back" rows={3} />
        </>
      ) : groups.length === 0 ? (
        <Zone label={q ? 'No match' : 'Nothing logged yet'} accent={MUTED}>
          <ZoneEmpty
            title={q ? `Nothing matches “${q}”` : 'No exercises with history'}
            hint={q
              ? 'Try a shorter search.'
              : 'Log a session and every lift in it shows up here with its records.'}
          />
        </Zone>
      ) : (
        groups.map(({ group, exercises }) => (
          <Zone key={group} label={group} accent={groupColor(group)}>
            {exercises.map((e, i) => (
              <Row key={e.id} exercise={e} divide={i > 0} accent={groupColor(group)}
                onPrefetch={() => {
                  // Pointer-DOWN, not hover — this is a phone. And only if it is
                  // not already cached, so dragging a finger down the list does
                  // not fire one RPC per row it passes.
                  const key = exerciseHistoryQuery(e.id).queryKey
                  if (!qc.getQueryData(key)) void qc.prefetchQuery(exerciseHistoryQuery(e.id))
                }} />
            ))}
          </Zone>
        ))
      )}
    </div>
  )
}

function Row({ exercise, divide, accent, onPrefetch }: {
  exercise: CatalogExercise
  divide: boolean
  accent: string
  onPrefetch: () => void
}) {
  return (
    <ZoneRow href={`/workout/exercises/${exercise.id}`} divide={divide} className="flex items-center gap-2.5">
      <span aria-hidden="true" className="w-[3px] h-7 rounded-full shrink-0" style={{ background: accent }}
        onPointerDown={onPrefetch} />
      <span className="min-w-0 flex-1" onPointerDown={onPrefetch}>
        <span className="block text-fluid-sm text-text truncate">{exercise.name}</span>
        <span className="block text-[10px] text-muted">
          {exercise.setCount} {exercise.setCount === 1 ? 'set' : 'sets'}
          {exercise.isCompound ? ' · compound' : ''}
        </span>
      </span>
      <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
    </ZoneRow>
  )
}
