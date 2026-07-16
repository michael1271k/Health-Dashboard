'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { WorkoutChat } from '@/components/logger/WorkoutChat'
import { Sheet } from '@/components/ui/Sheet'
import { SessionDeck } from '@/components/command-center/SessionDeck'
import { useExerciseMap, useExerciseMemory, useLatestSessionFlag } from '@/lib/hooks/useLogger'
import { useSessionDraft } from '@/lib/hooks/useSessionDraft'
import type { SessionDraft } from '@/lib/sessions/draft'
import {
  PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId, setActiveProgramId, daySplitEnum,
  scheduleDayFor, isTrainingDay, isReentryWeek, eraForDate, ERA_META, type ProgramDay,
} from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { useEraFilter } from '@/lib/era/eraFilter'
import { Plus, TrendingUp, Moon, ArrowRight, Flag, PlayCircle, FileClock } from 'lucide-react'

const StrengthTrends = dynamic(() => import('@/components/charts/StrengthTrends').then((m) => m.StrengthTrends), { ssr: false })

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PROGRAM_ORDER = ['apex51', 'axis4_builder', 'axis4_defender']
const REST_VIOLET = '#8B7CFF'

const HELIX_DAY_KEYS = ['cb_a', 'legs_a', 'arms', 'cb_b', 'legs_b'] as const

export default function WorkoutPage() {
  const { data: exMap } = useExerciseMap()
  const { data: memory } = useExerciseMemory()
  const { data: nextFlag } = useLatestSessionFlag()
  const { era } = useEraFilter()
  const [programId, setProgramId] = useState(DEFAULT_PROGRAM_ID)
  const [openDay, setOpenDay] = useState<ProgramDay | null>(null)
  const [deckOpen, setDeckOpen] = useState(false)
  const deckStore = useSessionDraft()
  const unit = weightUnit()

  // Coach JSON pasted in the chat → validated draft → the editable deck.
  function openCoachDraft(draft: SessionDraft) {
    deckStore.start(draft)
    setOpenDay(null)
    setDeckOpen(true)
  }

  // Live in-gym session: seed the deck from the program day, pre-filled with
  // each exercise's previous numbers (Wk1 target as the cold-start fallback).
  function startLiveSession(day: ProgramDay) {
    const dayKey = (HELIX_DAY_KEYS as readonly string[]).includes(day.key)
      ? (day.key as SessionDraft['dayKey']) : undefined
    const exercises = day.exercises.filter((e) => !e.bulkOnly).map((ex, i) => {
      const id = exMap?.get(ex.name)
      const prev = id ? memory?.get(id) : undefined
      const weightKg = prev?.weightKg ?? ex.wk1Kg ?? 20
      const reps = prev?.reps ?? (parseInt(ex.reps, 10) || 10)
      return {
        localId: `live-${i}-${Math.random().toString(36).slice(2, 8)}`,
        name: ex.name,
        muscleGroups: ex.muscles,
        sets: Array.from({ length: ex.sets }, () => ({ weightKg, reps, done: false })),
      }
    })
    deckStore.start({
      mode: 'live',
      dayKey,
      splitDay: daySplitEnum(day.key),
      date: logicalTodayISO(),
      title: day.sub ? `${day.label} · ${day.sub}` : day.label,
      notes: '',
      startedAt: new Date().toISOString(),
      exercises,
    })
    setOpenDay(null)
    setDeckOpen(true)
  }

  useEffect(() => { setProgramId(getActiveProgramId()) }, [])
  const program = PROGRAMS[programId] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
  function selectProgram(id: string) { setProgramId(id); setActiveProgramId(id) }

  // Today, era-aware — drives the hero + the highlighted card in the week grid.
  const today = logicalTodayISO()
  const schedule = scheduleDayFor(today)
  const training = isTrainingDay(today)
  const reentry = isReentryWeek(today)
  const eraMeta = ERA_META[eraForDate(today)]
  const todayWD = WD[new Date(`${today}T12:00:00Z`).getUTCDay()]
  const todayKey = schedule !== 'rest' ? schedule.dayKey : undefined
  const todayDay = todayKey ? program.days.find((d) => d.key === todayKey) : undefined

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-fluid-2xl font-bold text-text">Command Center</h1>
          <p className="text-muted text-fluid-sm mt-0.5">Active program · progressive-overload memory · tap a day to log</p>
        </div>
        <Link href="/weekly" className="btn-glass shrink-0 min-h-[40px] text-fluid-xs" aria-label="Open workout history in Journey">
          History <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* ── Today / Next-session hero ── */}
      <section className="helix-card holo-sheen"
        style={{
          borderColor: training && todayDay ? `${todayDay.color}44` : `${REST_VIOLET}33`,
          boxShadow: training && todayDay ? `0 0 26px ${todayDay.color}1f` : undefined,
        }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{ color: eraMeta.color, background: `${eraMeta.color}1a`, border: `1px solid ${eraMeta.color}40` }}>{eraMeta.short}</span>
          {reentry && <span className="text-[10px] font-bold uppercase tracking-wide text-warn">Re-entry · ~90% loads</span>}
          <span className="text-fluid-xs text-muted ml-auto">{todayWD} · Today</span>
        </div>
        {training && todayDay ? (
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h2 className="split-label font-bold text-fluid-2xl leading-tight" style={{ color: todayDay.color }}>{todayDay.label}</h2>
              {todayDay.sub && <p className="text-fluid-sm text-muted">{todayDay.sub}</p>}
              <p className="text-[11px] text-muted mt-1">
                {todayDay.exercises.filter((e) => !e.bulkOnly).length} exercises · {todayDay.exercises.reduce((n, e) => n + e.sets, 0)} sets
              </p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button onClick={() => setOpenDay(todayDay)}
                className="btn-primary min-h-[48px]"
                style={{ background: todayDay.color, boxShadow: `0 0 18px ${todayDay.color}55` }}>
                <Plus className="w-4 h-4" /> Log {todayDay.label}
              </button>
              <button onClick={() => startLiveSession(todayDay)}
                className="btn-glass min-h-[40px] text-fluid-xs justify-center"
                style={{ color: todayDay.color }}>
                <PlayCircle className="w-3.5 h-3.5" /> Live Session
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `${REST_VIOLET}1c`, color: REST_VIOLET, boxShadow: `0 0 14px ${REST_VIOLET}30` }}>
              <Moon className="w-6 h-6" />
            </span>
            <div>
              <h2 className="split-label font-bold text-fluid-2xl leading-tight" style={{ color: REST_VIOLET }}>Rest · Zone-2</h2>
              <p className="text-fluid-sm text-muted">Recovery day — optional light Zone-2 cardio. No lifting scheduled.</p>
            </div>
          </div>
        )}
        {/* Coach's action item from the last committed session */}
        {nextFlag && (
          <p className="text-xs flex items-start gap-1.5 mt-3 pt-3 border-t border-white/[0.06]"
            style={{ color: '#E8C57A' }} dir="auto">
            <Flag className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" /> {nextFlag}
          </p>
        )}
      </section>

      {/* Surviving draft (autosaved) — resume where the gym session left off */}
      {deckStore.hydrated && deckStore.draft && !deckOpen && (
        <button onClick={() => setDeckOpen(true)}
          className="w-full glass-card glass-card--accent px-4 py-3 flex items-center gap-3 text-left">
          <FileClock className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-text truncate">
              Resume {deckStore.draft.mode === 'live' ? 'live session' : 'session review'}
              {deckStore.draft.title ? ` — ${deckStore.draft.title}` : ''}
            </span>
            <span className="block text-[11px] text-muted">Draft autosaved · tap to continue</span>
          </span>
          <ArrowRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
        </button>
      )}

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

      {/* Week plan — every training day as its own card (today glows) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {program.days.map((day) => {
          const isToday = day.key === todayKey
          return (
            <div key={day.key} className="glass-card p-3 flex flex-col"
              style={{ borderColor: isToday ? day.color : `${day.color}33`, boxShadow: isToday ? `0 0 20px ${day.color}2e` : undefined }}>
              <button onClick={() => setOpenDay(day)} className="flex items-center justify-between mb-2.5 group">
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="split-label font-bold text-lg truncate" style={{ color: day.color }}>{day.label}</span>
                    <span className="text-[10px] text-muted uppercase shrink-0">{WD[day.weekday]}</span>
                    {isToday && <span className="text-[9px] px-1 rounded font-bold shrink-0" style={{ color: day.color, background: `${day.color}22` }}>TODAY</span>}
                    {day.cutSetDelta != null && (
                      <span className="text-[9px] px-1 rounded bg-white/[0.05] text-muted shrink-0" title="Cut-mode set delta">{day.cutSetDelta} cut</span>
                    )}
                  </span>
                  <span className="block text-[10px] text-muted leading-none mt-0.5">{day.sub}</span>
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
          )
        })}
      </div>

      {/* Progression snapshot (heavy analytics live in the Charts tab) */}
      <StrengthTrends era={era} />

      {/* Logger / Command Center sheet. Closing the deck does NOT discard the
          draft (it autosaves) — discard is explicit via the deck's trash. */}
      <Sheet
        open={!!openDay || deckOpen}
        onClose={() => { setOpenDay(null); setDeckOpen(false) }}
        size={deckOpen ? 'wide' : 'default'}
        title={deckOpen
          ? (deckStore.draft?.mode === 'live' ? 'Live Session' : 'Session Review')
          : openDay ? `${openDay.label}${openDay.sub ? ` · ${openDay.sub}` : ''} — Log Session` : undefined}
      >
        {deckOpen && deckStore.draft
          ? <SessionDeck store={deckStore} onClose={() => setDeckOpen(false)} />
          : openDay
            ? <WorkoutChat splitDay={daySplitEnum(openDay.key)} onClose={() => setOpenDay(null)} onCoachDraft={openCoachDraft} />
            : null}
      </Sheet>
    </div>
  )
}
