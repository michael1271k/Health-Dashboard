'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useLatestSessionFlag } from '@/lib/hooks/useLogger'
import { useWeekSessions, weekStartOf } from '@/lib/hooks/useWeekSessions'
import { PostWorkoutSummary } from '@/components/command-center/PostWorkoutSummary'
import { SwapDayControl, RestTodayButton } from '@/components/day/SwapDayControl'
import { RestSuggestion } from '@/components/day/RestSuggestion'
import { ProgressionAlerts } from '@/components/command-center/ProgressionAlerts'
import { peekSessionDraft, type SessionDraft } from '@/lib/sessions/draft'
import {
  activeProgram, scheduleDayFor, isTrainingDay, eraForDate, ERA_META, type Program,
} from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { isTimedExercise } from '@/lib/exercises/timed'
import { Plus, TrendingUp, Moon, ArrowRight, Flag, FileClock, ChevronDown, ChevronRight, BookOpen } from 'lucide-react'
import { WeekScheduler } from '@/components/schedule/WeekScheduler'
import { Surface } from '@/components/ui/Zone'
import { RestTargetControl } from '@/components/training/RestTargetControl'
import { Segmented } from '@/components/ui/Segmented'
import { useExerciseSetHistory, workingSets, type ExerciseHistory } from '@/lib/hooks/useExerciseSetHistory'
import { sessionVolumeKg } from '@/lib/sessions/volume'
import { STEEL, EMBER } from '@/lib/theme/palette'

const PLAN_VIEWS = [
  { value: 'week' as const, label: 'Week' },
  { value: 'routine' as const, label: 'Routine' },
]
type PlanView = (typeof PLAN_VIEWS)[number]['value']

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// Gym/muscle-progress graphs (Contour Map, Intensity Calendar, Volume Stream,
// Muscle Analytics) — relocated here from the Momentum → Analytics tab.
const MuscleAnalyticsPanel = dynamic(() => import('@/components/command-center/MuscleAnalyticsPanel').then((m) => m.MuscleAnalyticsPanel), { ssr: false })

const REST_VIOLET = '#B4522A'

export default function WorkoutPage() {
  const router = useRouter()
  const { data: nextFlag } = useLatestSessionFlag()
  // The active plan+phase is chosen in Settings → Plans (single source).
  // Init to a deterministic default so SSR and first client render match; the
  // effect then reads the real active plan (localStorage) after mount.
  const [program, setProgram] = useState<Program>(() => activeProgram('apex51', 'bulk'))
  const [openPlan, setOpenPlan] = useState<string | null>(null)
  const [planView, setPlanView] = useState<PlanView>('week')
  const unit = weightUnit()

  // The per-routine "previous top set" memory (`useRoutineMemory`) is gone from
  // this page. It answered with ONE set per exercise, which is the question the
  // expanded plan day now answers with the whole session — see `lastRun`.

  // Surviving deck draft (autosaved on /session) — offer to resume it.
  const [resumeDraft, setResumeDraft] = useState<SessionDraft | null>(null)
  useEffect(() => { setResumeDraft(peekSessionDraft()) }, [])

  useEffect(() => { setProgram(activeProgram()) }, [])

  /** Every logging path is the fullscreen deck route. */
  const openDeck = (templateKey?: string) =>
    router.push(templateKey ? `/session?template=${templateKey}` : '/session')

  // Today, era-aware — drives the hero + the highlighted card in the week grid.
  const today = logicalTodayISO()
  // Already-logged detection: today's sessions from the week query (shared with
  // WeeklySummaryCard, so no extra fetch). When present, the hero becomes the
  // Post-Workout Summary instead of a "Log X" button.
  const week = useWeekSessions(weekStartOf(today))
  const todaySessions = useMemo(
    () => week.data?.sessions.filter((s) => s.date === today) ?? [],
    [week.data, today],
  )
  const loggedToday = todaySessions.length > 0
  // The schedule store is an external store; without this subscription the hero
  // keeps whatever day it drew at mount, even after the DB says otherwise.
  useScheduleVersion()
  const schedule = scheduleDayFor(today)
  const training = isTrainingDay(today)
  const eraMeta = ERA_META[eraForDate(today)]
  // `new Date(...)` in the render body re-parsed on every keystroke anywhere on
  // the page; the day-of-week of "today" is not going to change while you look
  // at it.
  const todayWD = useMemo(
    () => new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
    [today],
  )
  const todayKey = schedule !== 'rest' ? schedule.dayKey : undefined

  /**
   * The last time you ran the day you just expanded.
   *
   * Fetched for the OPEN day only — expanding is the signal, so a page that
   * nobody expands costs nothing, and the query is routine-scoped because a
   * preview of Legs A that blends in Legs B's leg curl is not a preview of Legs A.
   */
  const openDay = program.days.find((d) => d.key === openPlan) ?? null
  const openNames = useMemo(() => openDay?.exercises.map((e) => e.name) ?? [], [openDay])
  const { data: lastRunSets } = useExerciseSetHistory(openNames, eraForDate(today), openPlan ?? undefined)

  const lastRun = useMemo(() => {
    if (!lastRunSets?.size) return null
    // Each entry is that exercise's most recent session of this routine, which
    // is usually the same session for all of them — but not if a lift was
    // skipped last time. Sum only the ones that share the newest date, so the
    // header never adds two sessions together.
    let date = ''
    for (const h of lastRunSets.values()) if (h.date > date) date = h.date
    if (!date) return null

    let volumeKg = 0
    let sets = 0
    const byName = new Map<string, ExerciseHistory>()
    for (const [name, h] of lastRunSets) {
      if (h.date !== date) continue
      byName.set(name, h)
      const work = workingSets(h)
      volumeKg += sessionVolumeKg(work.map((sd) => ({
        weightKg: sd.weightKg, reps: sd.reps, side: sd.side ?? null, pairId: sd.pairId ?? null,
      })))
      // A unilateral pair is ONE set of work — the same rule tonnage uses.
      const pairs = new Set<string>()
      for (const sd of work) {
        if (sd.pairId) { if (!pairs.has(sd.pairId)) { pairs.add(sd.pairId); sets += 1 } }
        else sets += 1
      }
    }
    return { date, volumeKg: Math.round(volumeKg), sets, byName }
  }, [lastRunSets])
  const todayDay = useMemo(
    () => (todayKey ? program.days.find((d) => d.key === todayKey) : undefined),
    [todayKey, program],
  )

  return (
    <div data-boxed className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-fluid-2xl font-bold text-text">Training</h1>
          <p className="text-muted text-fluid-sm mt-0.5">Active program · progressive-overload memory · tap a day to log</p>
        </div>
      </div>

      {/* ── Today: Post-Workout Summary (if logged) or Log/Rest hero ── */}
      {loggedToday ? (
        <PostWorkoutSummary sessions={todaySessions} date={today} />
      ) : (
      <Surface variant="band" measure="grid" pad="snug"
        style={{
          borderColor: training && todayDay ? `${todayDay.color}44` : `${REST_VIOLET}33`,
          boxShadow: training && todayDay ? `0 0 26px ${todayDay.color}1f` : undefined,
        }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{ color: eraMeta.color, background: `${eraMeta.color}1a`, border: `1px solid ${eraMeta.color}40` }}>{eraMeta.short}</span>
          <span className="text-fluid-xs text-muted ml-auto">{todayWD} · Today</span>
        </div>
        {training && todayDay ? (
          <>
            {/* Under-recovered? Offer the swap before the session, not after. */}
            <RestSuggestion date={today} dayLabel={todayDay.label} />
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <h2 className="split-label font-bold text-fluid-2xl leading-tight" style={{ color: todayDay.color }}>{todayDay.label}</h2>
                {todayDay.sub && <p className="text-fluid-sm text-muted">{todayDay.sub}</p>}
                <p className="text-[11px] text-muted mt-1">
                  {todayDay.exercises.length} exercises · {todayDay.exercises.reduce((n, e) => n + e.sets, 0)} sets
                </p>
              </div>
              {/* A training day used to offer Log and nothing else — the one
                  branch with no way to say "not today", which is precisely the
                  branch you're standing in when you slept four hours. */}
              <div className="flex flex-col gap-1.5 shrink-0 items-stretch">
                <button onClick={() => openDeck(todayDay.key)}
                  className="btn-primary min-h-[48px]"
                  style={{ background: todayDay.color, boxShadow: `0 0 18px ${todayDay.color}55` }}>
                  <Plus className="w-4 h-4" /> Log {todayDay.label}
                </button>
                <RestTodayButton date={today} />
              </div>
            </div>
          </>
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
            style={{ color: '#D4AF37' }} dir="auto">
            <Flag className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" /> {nextFlag}
          </p>
        )}
      </Surface>
      )}

      {/* Smart Coach — lifts that cleared their ceiling twice, due a load bump. */}
      <ProgressionAlerts />

      {/* Surviving draft (autosaved) — resume where the session left off */}
      {resumeDraft && (
        <button onClick={() => router.push('/session')}
          className="w-full rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 flex items-center gap-3 text-left">
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

      {/* Active plan chip — selection lives in Settings → Plans & Phases now. */}
      <button onClick={() => router.push('/settings')}
        className="flex items-center gap-2 text-fluid-xs text-muted hover:text-text transition-colors">
        <span className="px-2.5 py-1 rounded-xl font-semibold"
          style={{ color: '#8E9AAC', background: '#8E9AAC14', border: '1px solid #8E9AAC33' }}>{program.label}</span>
        <span>Change plan &amp; phase in Settings →</span>
      </button>

      {/* Every lift with history, grouped by what it trains. A sub-route rather
          than a sixth tab — nav-items.ts argues against a sixth, and this is
          somewhere you go FROM training, not a peer of it. */}
      <Surface as="button" href="/workout/exercises" measure="grid" pad="snug"
        label="Open the exercise library">
        <span className="flex items-center gap-2.5">
          <BookOpen className="w-4 h-4 shrink-0" style={{ color: STEEL }} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-fluid-sm text-text">Exercise library</span>
            <span className="block text-[10px] text-muted">Records and trends for every lift you have logged</span>
          </span>
          <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
        </span>
      </Surface>

      {/* ── ONE SECTION, TWO QUESTIONS ──
          These were two stacked `<h2>`s — "This week" over the scheduler, then
          "Routine" over the plan accordion — argued for as "content vs
          calendar". They ARE two questions, but they are two questions about
          the same thing, asked one after the other down a scrolling page, so
          answering the second meant losing sight of the first. A segmented
          control is what "two views of one subject" looks like; two headings is
          what "two subjects" looks like. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-fluid-lg font-bold text-text">Plan</h2>
          <Segmented
            options={PLAN_VIEWS}
            value={planView}
            onChange={setPlanView}
            accent={EMBER}
            size="sm"
            label="Plan view"
          />
        </div>

        {planView === 'week' ? (
          /* Which day falls when, and how to rearrange it. This used to be the
             accordion below, which listed `program.days` by their AUTHORED
             weekday and was therefore blind to every swap already made. */
          <WeekScheduler />
        ) : (
          /* What each day PRESCRIBES — and, once expanded, what you actually did
             the last time you ran it. No weekday chip here on purpose: after a
             permanent move the authored weekday is no longer where the day sits,
             and two views disagreeing about that is worse than one staying
             silent. */
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-1.5 divide-y divide-white/[0.05]">
            {program.days.map((day) => {
              const isToday = day.key === todayKey
              // Program week-plan defaults to MINIMIZED — every day collapsed until
              // tapped (the today "Session block" hero above stays expanded).
              const isOpen = openPlan === day.key
              // day is phase-resolved — its exercises are already the current phase's.
              const totalSets = day.exercises.reduce((n, e) => n + e.sets, 0)
              return (
                <div key={day.key} className="overflow-hidden"
                  style={{ background: isToday ? `${day.color}0f` : undefined, borderRadius: 8 }}>
                  <button
                    onClick={() => setOpenPlan(isOpen ? '' : day.key)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
                  >
                    <span className="w-1 h-4 rounded-full shrink-0" style={{ background: day.color }} aria-hidden="true" />
                    <span className="split-label font-bold text-fluid-sm truncate" style={{ color: day.color }}>{day.label}</span>
                    {isToday && <span className="text-[9px] px-1 rounded font-bold shrink-0" style={{ color: day.color, background: `${day.color}22` }}>TODAY</span>}
                    <span className="ml-auto text-[10px] text-muted shrink-0">{day.exercises.length} ex · {totalSets} sets</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {isOpen && (
                    <div className="px-2.5 pb-2 space-y-1">
                      {day.sub && <p className="text-[10px] text-muted mb-1">{day.sub}</p>}

                      {/* ── LAST TIME YOU RAN THIS DAY ──
                          The accordion used to show the PLAN and, per exercise,
                          one top set carried over from `useRoutineMemory`. What
                          you want before repeating a workout is the workout:
                          every set, at the loads you actually used. Fetched only
                          for the day you expand, and routine-scoped on purpose —
                          a preview of Legs A must not blend in Legs B's leg curl. */}
                      {lastRun && (
                        <p className="text-[10px] text-muted helix-num">
                          Last performed {shortDate(lastRun.date)} · {Math.round(displayWeight(lastRun.volumeKg) ?? 0).toLocaleString()}{unit} · {lastRun.sets} sets
                        </p>
                      )}

                      {day.exercises.map((ex) => {
                        const done = isOpen ? workingSets(lastRun?.byName.get(ex.name)) : []
                        const target = displayWeight(ex.wk1Kg)
                        const exTimed = isTimedExercise(ex.name)
                        return (
                          <div key={ex.name} className="rounded-lg px-2.5 py-1.5 bg-white/[0.02] border border-white/[0.05]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-fluid-sm font-medium text-text leading-tight truncate">{ex.name}</span>
                              <span className="text-fluid-xs text-muted shrink-0 helix-num">{ex.sets}×{ex.reps}</span>
                            </div>
                            {/* Target rest, from the plan and adjustable here.
                                The logger shows the same number and edits the
                                same store, so a change made on the gym floor is
                                the plan's number afterwards — not a per-session
                                tweak that evaporates on commit. */}
                            <div className="mt-1">
                              <RestTargetControl exerciseName={ex.name} dayKey={day.key} />
                            </div>
                            <div className="text-fluid-xs text-muted flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {done.length > 0 ? (
                                <>
                                  <TrendingUp className="w-2.5 h-2.5 shrink-0 text-success" aria-hidden="true" />
                                  {done.map((sd, i) => (
                                    <span key={i} className="helix-num tabular-nums text-text/80">
                                      {sd.weightKg > 0
                                        ? `${displayWeight(sd.weightKg)}×${sd.reps}`
                                        : `${sd.reps}${exTimed ? 's' : ''}`}
                                    </span>
                                  ))}
                                </>
                              ) : target != null ? (
                                <span>Wk1 {target}{unit}</span>
                              ) : null}
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
        )}
      </div>

      {/* Weekly volume vs target now lives inside MuscleAnalyticsPanel below —
          it was rendered twice on this page, from the same hook. */}
      {/* Progression snapshot */}

      {/* Gym/muscle-progress graphs — Contour Map · Intensity Calendar ·
          Volume Stream · Muscle Analytics (moved out of Momentum). */}
      <MuscleAnalyticsPanel />
    </div>
  )
}
