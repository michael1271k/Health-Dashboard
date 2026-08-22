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
import { Plus, Moon, ArrowRight, Flag, FileClock, ChevronRight, BookOpen } from 'lucide-react'
import { WeekScheduler } from '@/components/schedule/WeekScheduler'
import { Surface } from '@/components/ui/Zone'
import { STEEL } from '@/lib/theme/palette'

// Gym/muscle-progress graphs (Intensity Calendar, Volume Stream, Muscle
// Analytics) — relocated here from the Momentum → Analytics tab.
const MuscleAnalyticsPanel = dynamic(() => import('@/components/command-center/MuscleAnalyticsPanel').then((m) => m.MuscleAnalyticsPanel), { ssr: false })

const REST_VIOLET = '#B4522A'

export default function WorkoutPage() {
  const router = useRouter()
  const { data: nextFlag } = useLatestSessionFlag()
  // The active plan+phase is chosen in Settings → Plans (single source).
  // Init to a deterministic default so SSR and first client render match; the
  // effect then reads the real active plan (localStorage) after mount.
  const [program, setProgram] = useState<Program>(() => activeProgram('apex51', 'bulk'))

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
      {/* ── ONE VIEW OF THE PLAN, NOT TWO ──
          There used to be a Week / Routine toggle here. `Routine` listed every
          programmed day as an accordion of exercise names, prescribed sets, a
          rest-target stepper per exercise and, once expanded, last time's loads.

          It went for two reasons. The first is that it was the WRONG PLACE to
          answer its own question: "what am I about to do" is answered by the
          deck itself, one tap away behind Log — at the loads the logger will
          actually offer, in the layout you will actually see, with none of the
          drift a second rendering of the same plan accumulates. The second is
          the rest steppers, which put a WRITE control on a preview: rest is a
          prescription, `RestTargetControl` still lives in the logger where the
          set it governs is, and editing it from a browse screen was a decision
          made with none of the context that makes it a decision.

          What is left is the calendar, which is the one thing the deck cannot
          show you: which day falls when, and how to move it. */}
      <div className="space-y-2">
        <h2 className="font-heading text-fluid-lg font-bold text-text">Plan</h2>
        {/* Every cell resolves through `scheduleDayFor`, so per-date overrides,
            the permanent layout and the era are already correct. */}
        <WeekScheduler />
      </div>

      {/* Weekly volume vs target now lives inside MuscleAnalyticsPanel below —
          it was rendered twice on this page, from the same hook. */}
      {/* Progression snapshot */}

      {/* Gym/muscle-progress graphs — Intensity Calendar · Volume Stream ·
          Muscle Analytics (moved out of Momentum). */}
      <MuscleAnalyticsPanel />
    </div>
  )
}
