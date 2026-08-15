'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { AppBar } from '@/components/nav/AppBar'
import dynamic from 'next/dynamic'
import { useExerciseCatalog } from '@/lib/hooks/useExerciseCatalog'
import { exerciseHistoryQuery } from '@/lib/hooks/useExerciseHistory'
import { MUTED } from '@/lib/theme/palette'
import { exerciseColor, groupColor } from '@/lib/theme/muscleHue'
import { blurOnTap } from '@/lib/utils/blurOnTap'

/*
 * recharts is ~120 kB and this was the ONE route importing it statically —
 * every other chart in the app is already `next/dynamic`. The header, the
 * prev/next walk and the record tiles all render without it, so paying for the
 * chart library before the first paint bought nothing but a slower push.
 */
const ExerciseHistoryBody = dynamic(
  () => import('@/components/exercises/ExerciseHistoryBody').then((m) => m.ExerciseHistoryBody),
  { ssr: false, loading: () => <div className="h-64 rounded-xl bg-surface-2/60 animate-pulse" /> },
)

/**
 * One exercise, everything it has ever done.
 *
 * A push route rather than a sheet, for three reasons that are really one:
 * prev/next needs a URL you can go Back from, the drawer form already exists
 * for the in-session case, and browsing is a place you are rather than a thing
 * you peek at.
 *
 * Prev/next costs no query. Both this page and the list read the SAME
 * `useExerciseCatalog`, so on a push the ordered array is already in the cache
 * and the neighbours are an index away — the chevrons walk the library in
 * exactly the order it is displayed.
 */
export default function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const { data } = useExerciseCatalog()

  const flat = data?.flat ?? []
  const i = flat.findIndex((e) => e.id === id)
  const current = i >= 0 ? flat[i] : null
  const prev = i > 0 ? flat[i - 1] : null
  const next = i >= 0 && i < flat.length - 1 ? flat[i + 1] : null
  // Accented by the EXERCISE, not by its group. The group is already spelled out
  // in the label under the title, so spending the accent on it says the same
  // thing twice; spending it on the exercise makes two lifts in one family
  // distinguishable while you walk the library with the chevrons.
  const accent = current ? exerciseColor(current.name) : MUTED
  const groupTint = current ? groupColor(current.group) : MUTED

  // Warm both neighbours once the page is idle, so ‹ and › are instant. Skipped
  // on a metered connection — this is convenience, not content.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const conn = (navigator as { connection?: { saveData?: boolean } }).connection
    if (conn?.saveData) return
    const idle = window.requestIdleCallback?.bind(window) ?? ((cb: () => void) => window.setTimeout(cb, 400))
    const handle = idle(() => {
      for (const n of [prev, next]) {
        if (n && !qc.getQueryData(exerciseHistoryQuery(n.id).queryKey)) {
          void qc.prefetchQuery(exerciseHistoryQuery(n.id))
        }
      }
    })
    return () => window.cancelIdleCallback?.(handle as number)
  }, [prev, next, qc])

  return (
    <div data-fullbleed className="min-h-dvh">
      <AppBar accent={accent}>
        {/* `replace`, not `push`. Pushing grew the stack every time you stepped
            out of an exercise, so the list's own Back button had somewhere
            forward to walk to. Replacing keeps the depth flat: whatever you came
            from stays the thing behind the list. */}
        <button onClick={() => router.replace('/workout/exercises')} onPointerUp={blurOnTap}
          className="btn-glass shrink-0 min-h-[44px]" aria-label="Back to exercises">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-fluid-sm font-bold text-text truncate leading-tight">
            {current?.name ?? 'Exercise'}
          </h1>
          {current && <span className="text-[10px]" style={{ color: groupTint }}>{current.group}</span>}
        </div>
        {/* Buttons, not a swipe: the body is a chart, and a horizontal drag over
            a chart belongs to the chart. */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => prev && router.push(`/workout/exercises/${prev.id}`)}
            disabled={!prev}
            aria-label={prev ? `Previous exercise: ${prev.name}` : 'Previous exercise'}
            className="btn-glass min-h-[44px] min-w-[38px] justify-center disabled:opacity-30 disabled:pointer-events-none">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => next && router.push(`/workout/exercises/${next.id}`)}
            disabled={!next}
            aria-label={next ? `Next exercise: ${next.name}` : 'Next exercise'}
            className="btn-glass min-h-[44px] min-w-[38px] justify-center disabled:opacity-30 disabled:pointer-events-none">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </AppBar>

      <div className="mx-auto w-full max-w-[68ch] px-3 py-3 pb-8">
        <ExerciseHistoryBody
          exerciseId={id ?? null}
          exerciseName={current?.name ?? ''}
          accent={accent}
        />
      </div>
    </div>
  )
}
