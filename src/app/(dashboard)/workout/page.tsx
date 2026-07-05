'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { WorkoutLogList } from '@/components/workout/WorkoutLogList'
import { WorkoutChat } from '@/components/logger/WorkoutChat'
import { Sheet } from '@/components/ui/Sheet'
import { useWorkoutHistory, useDeleteSession, type WorkoutSessionRow } from '@/lib/hooks/useWorkoutHistory'
import { useExerciseMap, useExerciseMemory } from '@/lib/hooks/useLogger'
import { PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId, setActiveProgramId, daySplitEnum, type ProgramDay } from '@/lib/programs'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { Plus, TrendingUp, Trash2 } from 'lucide-react'

const StrengthTrends = dynamic(() => import('@/components/charts/StrengthTrends').then((m) => m.StrengthTrends), { ssr: false })

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PROGRAM_ORDER = ['axis5_hybrid', 'axis4_builder', 'axis4_defender']

export default function WorkoutPage() {
  const { data: sessions, isLoading: histLoading } = useWorkoutHistory()
  const { data: exMap } = useExerciseMap()
  const { data: memory } = useExerciseMemory()
  const del = useDeleteSession()
  const [programId, setProgramId] = useState(DEFAULT_PROGRAM_ID)
  const [openDay, setOpenDay] = useState<ProgramDay | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<WorkoutSessionRow | null>(null)
  const unit = weightUnit()

  useEffect(() => { setProgramId(getActiveProgramId()) }, [])
  const program = PROGRAMS[programId] ?? PROGRAMS[DEFAULT_PROGRAM_ID]

  function selectProgram(id: string) { setProgramId(id); setActiveProgramId(id) }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Workout</h1>
        <p className="text-muted-vital text-fluid-sm mt-0.5">Active program · tap a day to log · progressive overload memory</p>
      </div>

      {/* Program selector (active + drawer backups) */}
      <div className="flex gap-1.5 flex-wrap">
        {PROGRAM_ORDER.map((id) => {
          const p = PROGRAMS[id]
          if (!p) return null
          const active = id === programId
          return (
            <button key={id} onClick={() => selectProgram(id)}
              className="px-3 py-1.5 rounded-xl text-fluid-xs font-semibold border transition-colors"
              style={active
                ? { color: '#38E1FF', borderColor: '#38E1FF55', background: '#38E1FF1f', boxShadow: '0 0 10px #38E1FF33' }
                : { color: '#8B97B2', borderColor: 'transparent' }}>
              {p.label}{p.drawer ? '' : ' ✦'}
            </button>
          )
        })}
      </div>

      {/* Active-program day cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {program.days.map((day) => (
          <div key={day.key} className="glass-card p-3 flex flex-col" style={{ borderColor: `${day.color}33` }}>
            <button onClick={() => setOpenDay(day)} className="flex items-center justify-between mb-2.5 group">
              <span className="flex items-baseline gap-2">
                <span className="split-label font-bold text-lg" style={{ color: day.color }}>{day.label}</span>
                <span className="text-[10px] text-muted-vital uppercase">{WD[day.weekday]}</span>
              </span>
              <span className="w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
                style={{ background: `color-mix(in srgb, ${day.color} 18%, transparent)`, color: day.color }} aria-label={`Log ${day.label}`}>
                <Plus className="w-4 h-4" />
              </span>
            </button>
            <div className="space-y-1 flex-1">
              {day.exercises.map((ex) => {
                const id = exMap?.get(ex.name)
                const prev = id ? memory?.get(id) : undefined
                const target = displayWeight(ex.wk1Kg)
                return (
                  <div key={ex.name} className="rounded-lg px-2.5 py-1.5 bg-white/[0.02] border border-white/[0.05]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-text leading-tight truncate">{ex.name}</span>
                      <span className="text-[10px] text-muted-vital shrink-0">{ex.reps}</span>
                    </div>
                    <div className="text-[10px] text-muted-vital flex items-center gap-2 mt-0.5">
                      {prev
                        ? <span className="flex items-center gap-1 text-success"><TrendingUp className="w-2.5 h-2.5" />{displayWeight(prev.weightKg)}{unit} × {prev.reps}</span>
                        : target != null && <span>Wk1 {target}{unit}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* History */}
      <div>
        <h2 className="font-heading font-semibold text-lg text-text mb-3">History</h2>
        <WorkoutLogList
          sessions={sessions ?? []}
          isLoading={histLoading}
          onDelete={setConfirmDelete}
          emptyMessage="No sessions yet. Tap a day above to log your first workout!"
        />
      </div>

      <StrengthTrends />

      {/* Logger sheet */}
      <Sheet open={!!openDay} onClose={() => setOpenDay(null)} title={openDay ? `${openDay.label} — Log Session` : undefined}>
        {openDay && <WorkoutChat splitDay={daySplitEnum(openDay.key)} onClose={() => setOpenDay(null)} />}
      </Sheet>

      {/* Delete confirm */}
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
