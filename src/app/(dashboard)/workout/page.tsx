'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useExerciseMap, useExerciseMemory, useLatestSessionFlag } from '@/lib/hooks/useLogger'
import { useWeekSessions, weekStartOf } from '@/lib/hooks/useWeekSessions'
import { WeeklySummaryCard } from '@/components/command-center/WeeklySummaryCard'
import { PostWorkoutSummary } from '@/components/command-center/PostWorkoutSummary'
import { WidgetBoundary } from '@/components/fx/WidgetBoundary'
import { SwapDayControl } from '@/components/day/SwapDayControl'
import { peekSessionDraft, type SessionDraft } from '@/lib/sessions/draft'
import {
  PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId, setActiveProgramId,
  scheduleDayFor, isTrainingDay, isReentryWeek, eraForDate, ERA_META,
} from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { useEraFilter } from '@/lib/era/eraFilter'
import { Plus, TrendingUp, Moon, ArrowRight, Flag, ClipboardPaste, FileClock, ChevronDown } from 'lucide-react'

const StrengthTrends = dynamic(() => import('@/components/charts/StrengthTrends').then((m) => m.StrengthTrends), { ssr: false })

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PROGRAM_ORDER = ['apex51', 'axis4_builder', 'axis4_defender']
const REST_VIOLET = '#EC4899'

export default function WorkoutPage() {
  const router = useRouter()
  const { data: exMap } = useExerciseMap()
  const { data: memory } = useExerciseMemory()
  const { data: nextFlag } = useLatestSessionFlag()
  const { era } = useEraFilter()
  const [programId, setProgramId] = useState(DEFAULT_PROGRAM_ID)
  const [openPlan, setOpenPlan] = useState<string | null>(null)
  const unit = weightUnit()

  // Surviving deck draft (autosaved on /session) — offer to resume it.
  const [resumeDraft, setResumeDraft] = useState<SessionDraft | null>(null)
  useEffect(() => { setResumeDraft(peekSessionDraft()) }, [])

  useEffect(() => { setProgramId(getActiveProgramId()) }, [])
  const program = PROGRAMS[programId] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
  function selectProgram(id: string) { setProgramId(id); setActiveProgramId(id) }

  /** Every logging path is the fullscreen deck route. */
  const openDeck = (templateKey?: string) =>
    router.push(templateKey ? `/session?template=${templateKey}` : '/session')

  // Today, era-aware — drives the hero + the highlighted card in the week grid.
  const today = logicalTodayISO()
  // Already-logged detection: today's sessions from the week query (shared with
  // WeeklySummaryCard, so no extra fetch). When present, the hero becomes the
  // Post-Workout Summary instead of a "Log X" button.
  const week = useWeekSessions(weekStartOf(today))
  const todaySessions = week.data?.sessions.filter((s) => s.date === today) ?? []
  const loggedToday = todaySessions.length > 0
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
        <Link href="/pathfinder" className="btn-glass shrink-0 min-h-[40px] text-fluid-xs" aria-label="Open workout history in Pathfinder">
          History <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* ── Today: Post-Workout Summary (if logged) or Log/Rest hero ── */}
      {loggedToday ? (
        <PostWorkoutSummary sessions={todaySessions} date={today} onLogAnother={() => openDeck()} />
      ) : (
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
              <button onClick={() => openDeck(todayDay.key)}
                className="btn-primary min-h-[48px]"
                style={{ background: todayDay.color, boxShadow: `0 0 18px ${todayDay.color}55` }}>
                <Plus className="w-4 h-4" /> Log {todayDay.label}
              </button>
              <button onClick={() => openDeck()}
                className="btn-glass min-h-[40px] text-fluid-xs justify-center"
                style={{ color: todayDay.color }}>
                <ClipboardPaste className="w-3.5 h-3.5" /> Paste session
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `${REST_VIOLET}1c`, color: REST_VIOLET, boxShadow: `0 0 18px ${REST_VIOLET}55` }}>
              <Moon className="w-6 h-6" />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="split-label font-bold text-fluid-2xl leading-tight" style={{ color: REST_VIOLET }}>Rest · Zone-2 Recovery</h2>
              <p className="text-fluid-sm text-muted">Adaptation happens now — no lifting scheduled. Swap a day in if plans change.</p>
            </div>
            {/* No Log/Paste button on rest days — routine changes go through Swap. */}
            <SwapDayControl date={today} className="shrink-0" />
          </div>
        )}
        {/* Coach's action item from the last committed session */}
        {nextFlag && (
          <p className="text-xs flex items-start gap-1.5 mt-3 pt-3 border-t border-white/[0.06]"
            style={{ color: '#F5C15A' }} dir="auto">
            <Flag className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" /> {nextFlag}
          </p>
        )}
      </section>
      )}

      {/* Friday week-complete summary CTA / quiet last-week review */}
      <WeeklySummaryCard />

      {/* Surviving draft (autosaved) — resume where the session left off */}
      {resumeDraft && (
        <button onClick={() => router.push('/session')}
          className="w-full glass-card glass-card--accent px-4 py-3 flex items-center gap-3 text-left">
          <FileClock className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-text truncate">
              Resume session draft{resumeDraft.title ? ` — ${resumeDraft.title}` : ''}
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
                ? { color: '#22D3EE', borderColor: '#22D3EE55', background: '#22D3EE1f', boxShadow: '0 0 10px #22D3EE33' }
                : { color: '#8B97B2', borderColor: 'transparent' }}>
              {p.label}{p.drawer ? '' : ' ✦'}
            </button>
          )
        })}
      </div>

      {/* Week plan — a compact accordion (today expanded, others tap to open) */}
      <div className="space-y-2">
        {program.days.map((day) => {
          const isToday = day.key === todayKey
          const isOpen = (openPlan ?? todayKey) === day.key
          const nonBulk = day.exercises.filter((e) => !e.bulkOnly)
          const totalSets = nonBulk.reduce((n, e) => n + e.sets, 0)
          return (
            <div key={day.key} className="glass-card overflow-hidden"
              style={{ borderColor: isToday ? day.color : `${day.color}33`, boxShadow: isToday ? `0 0 20px ${day.color}2e` : undefined }}>
              <button
                onClick={() => setOpenPlan(isOpen ? '' : day.key)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
              >
                <span className="split-label font-bold text-base truncate" style={{ color: day.color }}>{day.label}</span>
                <span className="text-[10px] text-muted uppercase shrink-0">{WD[day.weekday]}</span>
                {isToday && <span className="text-[9px] px-1 rounded font-bold shrink-0" style={{ color: day.color, background: `${day.color}22` }}>TODAY</span>}
                <span className="ml-auto text-[10px] text-muted shrink-0">{nonBulk.length} ex · {totalSets} sets</span>
                <ChevronDown className={`w-4 h-4 text-muted shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-1">
                  {day.sub && <p className="text-[10px] text-muted mb-1">{day.sub}</p>}
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
                  <button onClick={() => openDeck(day.key)}
                    className="btn-glass w-full justify-center min-h-[40px] text-fluid-xs mt-1" style={{ color: day.color }}>
                    <Plus className="w-3.5 h-3.5" /> Log {day.label}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Progression snapshot (heavy analytics live in the Charts tab) */}
      <WidgetBoundary label="Strength trends" minHeight={200}>
        <StrengthTrends era={era} />
      </WidgetBoundary>
    </div>
  )
}
