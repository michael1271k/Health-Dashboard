'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { WorkoutLogList } from '@/components/workout/WorkoutLogList'
import { WorkoutChat } from '@/components/logger/WorkoutChat'
import { Sheet } from '@/components/ui/Sheet'
import { useWorkoutHistory, useDeleteSession, type WorkoutSessionRow } from '@/lib/hooks/useWorkoutHistory'
import { useAllExercises, useExerciseMemory } from '@/lib/hooks/useLogger'
import { LOGGER_SPLITS, type SplitDay } from '@/lib/types/workout'
import { Plus, TrendingUp, Trash2 } from 'lucide-react'

// recharts-heavy — lazy so it never weighs down the workout route first-load
const StrengthTrends = dynamic(() => import('@/components/charts/StrengthTrends').then((m) => m.StrengthTrends), { ssr: false })

export default function WorkoutPage() {
  const { data: grouped, isLoading: exLoading } = useAllExercises()
  const { data: memory } = useExerciseMemory()
  const { data: sessions, isLoading: histLoading } = useWorkoutHistory()
  const del = useDeleteSession()
  const [openSplit, setOpenSplit] = useState<SplitDay | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<WorkoutSessionRow | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Workout</h1>
        <p className="text-muted-vital text-fluid-sm mt-0.5">Tap a split to log · exercise memory · full history</p>
      </div>

      {/* ── Split columns ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {LOGGER_SPLITS.map(({ day, label, color }) => {
          const exercises = grouped?.[day === 'lower' ? 'legs' : day as 'upper' | 'legs' | 'push' | 'pull'] ?? []
          return (
            <div key={day} className="glass-card p-3 flex flex-col">
              <button onClick={() => setOpenSplit(day)} className="flex items-center justify-between mb-3 group">
                <span className="split-label font-bold text-lg" style={{ color }}>{label}</span>
                <span className="w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
                  style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }} aria-label={`Log ${label}`}>
                  <Plus className="w-4 h-4" />
                </span>
              </button>
              <div className="space-y-1.5 flex-1">
                {exLoading ? (
                  [...Array(4)].map((_, i) => <div key={i} className="h-8 rounded-lg bg-surface-2 animate-pulse" />)
                ) : exercises.length === 0 ? (
                  <p className="text-xs text-muted-vital py-2">No exercises seeded.</p>
                ) : (
                  exercises.slice(0, 8).map((ex) => {
                    const prev = memory?.get(ex.id)
                    return (
                      <div key={ex.id} className="rounded-lg px-2.5 py-1.5 bg-white/[0.02] border border-white/[0.05]">
                        <div className="text-xs font-medium text-text leading-tight truncate">{ex.name}</div>
                        {prev && (
                          <div className="text-[10px] text-muted-vital flex items-center gap-1 mt-0.5">
                            <TrendingUp className="w-2.5 h-2.5 text-success" />{prev.weightKg}kg × {prev.reps}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── History ── */}
      <div>
        <h2 className="font-heading font-semibold text-lg text-text mb-3">History</h2>
        <WorkoutLogList
          sessions={sessions ?? []}
          isLoading={histLoading}
          onDelete={setConfirmDelete}
          emptyMessage="No sessions yet. Tap a split above to log your first workout!"
        />
      </div>

      {/* ── Strength trends (progressive overload) ── */}
      <StrengthTrends />

      {/* ── Logger sheet ── */}
      <Sheet open={!!openSplit} onClose={() => setOpenSplit(null)}
        title={openSplit ? `${openSplit[0].toUpperCase()}${openSplit.slice(1)} — Log Session` : undefined}>
        {openSplit && <WorkoutChat splitDay={openSplit} onClose={() => setOpenSplit(null)} />}
      </Sheet>

      {/* ── Delete confirm ── */}
      <Sheet open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete session?">
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-fluid-sm text-muted-vital">
              Delete the {confirmDelete.splitLabel} session from{' '}
              {new Date(confirmDelete.startedAt).toLocaleDateString('en-IL', { month: 'short', day: 'numeric' })}? This can’t be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn-glass flex-1 justify-center">Cancel</button>
              <button
                onClick={() => { del.mutate(confirmDelete.id); setConfirmDelete(null) }}
                className="flex-1 justify-center inline-flex items-center gap-2 rounded-xl bg-danger/90 text-bg font-semibold px-5 py-2.5 hover:bg-danger">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
