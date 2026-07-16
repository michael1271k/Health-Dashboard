'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { WorkoutLogList } from '@/components/workout/WorkoutLogList'
import { WorkoutChat } from '@/components/logger/WorkoutChat'
import { Sheet } from '@/components/ui/Sheet'
import { useWorkoutHistory, useDeleteSession, type WorkoutSessionRow } from '@/lib/hooks/useWorkoutHistory'
import { useExerciseMap, useExerciseMemory } from '@/lib/hooks/useLogger'
import { PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId, setActiveProgramId, daySplitEnum, type ProgramDay, eraForDate } from '@/lib/programs'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { Plus, TrendingUp, Trash2 } from 'lucide-react'

const StrengthTrends = dynamic(() => import('@/components/charts/StrengthTrends').then((m) => m.StrengthTrends), { ssr: false })

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PROGRAM_ORDER = ['apex51', 'axis4_builder', 'axis4_defender']

export default function WorkoutPage() {
  const { data: sessions, isLoading: histLoading } = useWorkoutHistory()
  const [era, setEra] = useState<'all' | 'ppl' | 'axis'>('all')
  const { data: exMap } = useExerciseMap()
  const { data: memory } = useExerciseMemory()
  const del = useDeleteSession()
  const [programId, setProgramId] = useState(DEFAULT_PROGRAM_ID)
  const [openDay, setOpenDay] = useState<ProgramDay | null>(null)
  const [focusPicker, setFocusPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<WorkoutSessionRow | null>(null)
  const unit = weightUnit()

  useEffect(() => { setProgramId(getActiveProgramId()) }, [])
  const program = PROGRAMS[programId] ?? PROGRAMS[DEFAULT_PROGRAM_ID]

  function selectProgram(id: string) { setProgramId(id); setActiveProgramId(id) }

  // "Legs & Core" is ONE master card; its two focus days live behind a picker.
  const legsDays = program.days.filter((d) => d.label === 'Legs & Core')
  const displayDays = legsDays.length > 1
    ? program.days.filter((d) => d.label !== 'Legs & Core' || d.key === legsDays[0].key)
    : program.days
  const isMergedLegs = (day: ProgramDay) => legsDays.length > 1 && day.label === 'Legs & Core'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Workout</h1>
        <p className="text-muted text-fluid-sm mt-0.5">Active program · tap a day to log · progressive overload memory</p>
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

      {/* Active-program day cards (Legs & Core = one master card → focus picker) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {displayDays.map((day) => (
          <div key={day.key} className="glass-card p-3 flex flex-col" style={{ borderColor: `${day.color}33` }}>
            <button onClick={() => (isMergedLegs(day) ? setFocusPicker(true) : setOpenDay(day))} className="flex items-center justify-between mb-2.5 group">
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="split-label font-bold text-lg truncate" style={{ color: day.color }}>{day.label}</span>
                  <span className="text-[10px] text-muted uppercase shrink-0">{isMergedLegs(day) ? legsDays.map((d) => WD[d.weekday]).join(' · ') : WD[day.weekday]}</span>
                  {day.cutSetDelta != null && (
                    <span className="text-[9px] px-1 rounded bg-white/[0.05] text-muted shrink-0" title="Cut-mode set delta">{day.cutSetDelta} cut</span>
                  )}
                </span>
                <span className="block text-[10px] text-muted leading-none mt-0.5">
                  {isMergedLegs(day) ? legsDays.map((d) => d.sub).join(' / ') : day.sub}
                </span>
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
                  <div key={ex.name} className={`rounded-lg px-2.5 py-1.5 bg-white/[0.02] border border-white/[0.05] ${ex.bulkOnly ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-text leading-tight truncate">{ex.name}{ex.bulkOnly && <span className="text-[9px] text-muted ml-1">bulk only</span>}</span>
                      <span className="text-[10px] text-muted shrink-0">{ex.sets}×{ex.reps}</span>
                    </div>
                    <div className="text-[10px] text-muted flex items-center gap-2 mt-0.5">
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

      {/* History — era-scoped (HELIX and PPL never mix) */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="font-heading font-semibold text-lg text-text">History</h2>
          <div className="flex items-center gap-1.5">
            {([['all', 'All', '#19E3B1'], ['axis', 'HELIX Era', '#3EE0FF'], ['ppl', 'PPL Legacy', '#8B97B2']] as const).map(([k, label, color]) => {
              const active = era === k
              return (
                <button key={k} onClick={() => setEra(k)}
                  className="px-3 py-1.5 rounded-xl text-fluid-xs font-semibold border transition-colors"
                  style={active ? { color, borderColor: `${color}55`, background: `${color}1f`, boxShadow: `0 0 10px ${color}33` } : { color: '#8B97B2', borderColor: 'transparent' }}>
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        <WorkoutLogList
          sessions={(sessions ?? []).filter((s) => era === 'all' || eraForDate(s.date) === era)}
          isLoading={histLoading}
          onDelete={setConfirmDelete}
          emptyMessage="No sessions yet. Tap a day above to log your first workout!"
        />
      </div>

      <StrengthTrends />

      {/* Legs & Core focus picker */}
      <Sheet open={focusPicker} onClose={() => setFocusPicker(false)} title="Legs & Core — pick today's focus">
        <div className="grid gap-3">
          {legsDays.map((d, i) => (
            <button
              key={d.key}
              onClick={() => { setFocusPicker(false); setOpenDay(d) }}
              className="glass-card w-full text-left p-4 active:opacity-80"
              style={{ borderColor: `${d.color}44` }}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-heading font-bold text-fluid-base" style={{ color: d.color }}>
                  Day {i === 0 ? 2 : 5} · {d.sub}
                </span>
                <span className="text-[10px] text-muted uppercase">{WD[d.weekday]}</span>
              </div>
              <p className="text-fluid-xs text-muted mt-1.5 truncate">
                {d.exercises.slice(0, 3).map((e) => e.name).join(' · ')} +{Math.max(0, d.exercises.length - 3)}
              </p>
            </button>
          ))}
        </div>
      </Sheet>

      {/* Logger sheet */}
      <Sheet open={!!openDay} onClose={() => setOpenDay(null)} title={openDay ? `${openDay.label}${openDay.sub ? ` · ${openDay.sub}` : ''} — Log Session` : undefined}>
        {openDay && <WorkoutChat splitDay={daySplitEnum(openDay.key)} onClose={() => setOpenDay(null)} />}
      </Sheet>

      {/* Delete confirm */}
      <Sheet open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete session?">
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-fluid-sm text-muted">
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
