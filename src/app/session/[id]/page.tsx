'use client'

import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useSessionDetail } from '@/lib/hooks/useSessionDetail'
import { SessionHero } from '@/components/session-detail/SessionHero'
import { ExerciseBreakdown } from '@/components/session-detail/ExerciseBreakdown'
import { MuscleFocus } from '@/components/session-detail/MuscleFocus'
import { ProgressionTrail } from '@/components/session-detail/ProgressionTrail'

/**
 * Workout Analysis — the dedicated deep-dive for one session (reached by tapping
 * any completed workout, from the timeline, Daily Nexus, Post-Workout Summary or
 * the dashboard). Not a bottom-nav tab: a fullscreen analysis page with a back
 * button (the bottom nav already hides on /session*).
 */
export default function SessionAnalysisPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data, isLoading } = useSessionDetail(id ?? null)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="helix-card h-40 animate-pulse" />
        <div className="helix-card h-56 animate-pulse" />
        <div className="helix-card h-40 animate-pulse" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-muted">This session couldn&apos;t be found.</p>
        <button onClick={() => router.back()} className="btn-glass mx-auto min-h-[44px]">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-8">
      <SessionHero detail={data} />
      <ProgressionTrail sessionId={data.id} />
      <ExerciseBreakdown sessionId={data.id} exercises={data.exercises} date={data.date} dayKey={data.dayKey} />
      <MuscleFocus detail={data} />
    </div>
  )
}
