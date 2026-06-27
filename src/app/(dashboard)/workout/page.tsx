'use client'

import { useState } from 'react'
import { DataTable, type TableColumn } from '@/components/data/DataTable'
import { WorkoutChat } from '@/components/logger/WorkoutChat'
import { Sheet } from '@/components/ui/Sheet'
import { useWorkoutHistory, type WorkoutSessionRow } from '@/lib/hooks/useWorkoutHistory'
import { useAllExercises, useExerciseMemory } from '@/lib/hooks/useLogger'
import { LOGGER_SPLITS, type SplitDay } from '@/lib/types/workout'
import { Check, Plus, TrendingUp } from 'lucide-react'

const HISTORY_COLUMNS: TableColumn<WorkoutSessionRow>[] = [
  {
    key: 'date', header: 'Date',
    render: (r) => (
      <div>
        <span className="text-text font-medium">
          {new Date(r.startedAt).toLocaleDateString('en-IL', { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
        <div className="text-[11px] text-muted-vital mt-0.5">{r.isoWeek.replace('-', ' ')}</div>
      </div>
    ),
  },
  { key: 'split', header: 'Split', render: (r) => <span className="text-sm font-bold" style={{ color: r.splitColor }}>{r.splitLabel}</span> },
  {
    key: 'volume', header: 'Volume', align: 'right',
    render: (r) => r.totalVolumeKg !== null
      ? <span className="vital-number font-semibold text-text">{Math.round(r.totalVolumeKg).toLocaleString()}<span className="text-xs font-normal text-muted-vital ml-0.5">kg</span></span>
      : <span className="text-muted-vital">—</span>,
  },
  {
    key: 'notes', header: 'Notes',
    render: (r) => r.notes && !r.notes.startsWith('__seed_')
      ? <span className="text-xs text-muted-vital line-clamp-1 max-w-[180px]" dir="auto" title={r.notes}>{r.notes}</span>
      : <span className="text-muted-vital">—</span>,
  },
  {
    key: 'notion', header: 'Notion', align: 'center',
    render: (r) => r.notionSynced ? <Check className="w-4 h-4 text-primary mx-auto" aria-label="Synced" /> : <span className="text-muted-vital text-xs">—</span>,
  },
]

export default function WorkoutPage() {
  const { data: grouped, isLoading: exLoading } = useAllExercises()
  const { data: memory } = useExerciseMemory()
  const { data: sessions, isLoading: histLoading } = useWorkoutHistory()
  const [openSplit, setOpenSplit] = useState<SplitDay | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Workout</h1>
        <p className="text-muted-vital text-fluid-sm mt-0.5">Tap a split to log · exercise memory · full history</p>
      </div>

      {/* ── Split columns (horizontal snap on mobile) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {LOGGER_SPLITS.map(({ day, label, color }) => {
          const exercises = grouped?.[day === 'lower' ? 'legs' : day as 'upper' | 'legs' | 'push' | 'pull'] ?? []
          return (
            <div key={day} className="glass-card p-3 flex flex-col">
              <button
                onClick={() => setOpenSplit(day)}
                className="flex items-center justify-between mb-3 group"
              >
                <span className="font-heading font-bold text-base" style={{ color }}>{label}</span>
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
                  style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
                  aria-label={`Log ${label}`}
                >
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
                            <TrendingUp className="w-2.5 h-2.5 text-success" />
                            {prev.weightKg}kg × {prev.reps}
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
        <DataTable
          columns={HISTORY_COLUMNS}
          rows={sessions ?? []}
          keyExtractor={(r) => r.id}
          isLoading={histLoading}
          emptyMessage="No sessions yet. Tap a split above to log your first workout!"
        />
      </div>

      {/* ── Logger sheet (bottom-sheet on mobile, dialog on desktop) ── */}
      <Sheet
        open={!!openSplit}
        onClose={() => setOpenSplit(null)}
        title={openSplit ? `${openSplit[0].toUpperCase()}${openSplit.slice(1)} — Log Session` : undefined}
      >
        {openSplit && <WorkoutChat splitDay={openSplit} onClose={() => setOpenSplit(null)} />}
      </Sheet>
    </div>
  )
}
