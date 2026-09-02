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
import { useLiveDraft } from '@/lib/hooks/useLiveDraft'
import {
  activeProgram, scheduleDayFor, isTrainingDay, eraForDate, ERA_META, type Program,
} from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { Plus, Moon, Flag, ChevronRight, BookOpen } from 'lucide-react'
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

  /**
   * ── A RUNNING WORKOUT IS ANNOUNCED ONCE ────────────────────────────────────
   * There used to be an orange "Resume session draft" card here, and it was a
   * second copy of what `LiveSessionPill` says on every screen in the app,
   * persistently, above the tab bar. Two controls for one fact — and this one
   * read from a mount-time photo of localStorage, so it went on offering to
   * resume a draft that had been committed and deleted minutes earlier.
   *
   * The pill is the answer. This is the subscription that lets the rest of the
   * page stop competing with it.
   */
  const liveDraft = useLiveDraft()

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
      {/* ── HEADER ──
          Not a two-column `justify-between` row any more. It became one when a
          plan chip lived on the right; that chip was deleted (see the tombstone
          further down) and the flex row stayed, so the layout was still
          reserving a column for something that no longer existed.

          The subtitle lost its middle clause. "Active program ·
          progressive-overload memory · tap a day to log" is three clauses and
          wrapped to two lines on a phone, and the one that wrapped described an
          implementation detail — the memory is a thing the app does, not a
          thing you do on this screen. Two clauses fit one line: what this is,
          and what to do with it. */}
      <div>
        <h1 className="font-heading text-fluid-2xl font-bold text-text">Workout</h1>
        <p className="text-muted text-fluid-sm mt-0.5">Active program · tap a day to log</p>
      </div>

      {/* ── THE PLAN IS THE FIRST THING ON THE PAGE ──
          It used to sit two thirds of the way down, under today's hero, the
          coach's alerts, a plan chip and the exercise library — so the question
          this tab is opened to answer ("which day is it, and when is the rest
          of the week") was below the fold on every phone.

          It leads now, and today's session sits directly under it, which is the
          order the two are actually read in: the row tells you where you are in
          the week, and the block beneath it is what that means today. The other
          way round, the calendar was context arriving after the thing it was
          meant to give context to.

          Every cell resolves through `scheduleDayFor`, so per-date overrides,
          the permanent layout and the era are already correct. */}
      <div className="space-y-2">
        {/* "This Week", not "Plan". The heading sits directly on top of a
            seven-day row of the CURRENT week — "Plan" named the abstraction
            behind it rather than the thing being shown, and the page already
            says "Active program" one heading above. */}
        <h2 className="font-heading text-fluid-lg font-bold text-text">This Week</h2>
        <WeekScheduler />
      </div>

      {/* ── Today: Post-Workout Summary (if logged) or Log/Rest hero ──
          The hero stands down while a session is running. Its whole offer is
          "Log Upper A", and tapping that mid-workout opens a SECOND deck over a
          draft that is already live — not a redundant control, an actively
          dangerous one. The pill above the tab bar is saying where the workout
          is, with its live volume and set count, and one tap returns to it —
          so the slot stays EMPTY rather than growing a second announcement of
          the same thing. */}
      {liveDraft ? null : loggedToday ? (
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
          /* ── A REST DAY IS ONE LINE, NOT A MONUMENT ────────────────────────
             This was the training day's own layout with nothing in it: a 48px
             glowing disc, `text-fluid-2xl` (24–30px) type — the largest heading
             on the tab — and a full sentence of prose, all to say the thing the
             screen says by having no session to log. A training day earns that
             size because it is an instruction with an exercise count, a colour
             and a primary button under it. A rest day is a FACT, and it was
             being announced twice as loudly as the workouts around it.

             One row: the glyph at chip size, the name at the size of a label,
             and Swap — which is the only decision available here and was
             previously the smallest thing in the block. The sentence is gone;
             "Swap" is the affordance the last half of it was describing. */
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `${REST_VIOLET}1c`, color: REST_VIOLET }}>
              <Moon className="w-3.5 h-3.5" />
            </span>
            <h2 className="split-label font-bold text-fluid-base leading-tight min-w-0 truncate"
              style={{ color: REST_VIOLET }}>
              Rest · Zone-2
            </h2>
            {/* No Log/Paste button on rest days — routine changes go through Swap. */}
            <SwapDayControl date={today} className="shrink-0 ml-auto" />
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

      {/* ── THE PLAN CHIP AND ITS LINK ARE GONE ──
          A "HELIX-5" pill beside "Change plan & phase in Settings →", floating
          between two Surfaces with no card of its own. It was a navigation
          link dressed as a status readout: the chip named the active plan,
          which the whole page above it already demonstrates, and the sentence
          pointed at a screen reachable from the tab bar. The one thing it
          asserted that nothing else did — WHICH plan — is now said by the
          scheduler at the top, in the days it draws.

          `PlanPhaseTags` still names plan and phase where a reader needs it
          stated rather than shown. */}

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

      {/* Gym/muscle-progress graphs — Intensity Calendar · Volume Stream ·
          Muscle Analytics (moved out of Momentum). */}
      <MuscleAnalyticsPanel />
    </div>
  )
}
