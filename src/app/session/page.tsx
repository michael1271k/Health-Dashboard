'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FileClock, Loader2 } from 'lucide-react'
import { SessionDeck } from '@/components/command-center/SessionDeck'
import { useSessionDraft } from '@/lib/hooks/useSessionDraft'
import { useExerciseSetHistory } from '@/lib/hooks/useExerciseSetHistory'
import { useRoutineTemplate } from '@/lib/hooks/useRoutineTemplate'
import { buildTemplateDraft } from '@/lib/sessions/templateDraft'
import { SEED_TEMPLATES } from '@/lib/sessions/seedTemplates'
import { activeProgram, eraForDate } from '@/lib/programs'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { logicalTodayISO } from '@/lib/utils/day'
import { BackLink } from '@/components/nav/NavChevron'

/**
 * /session — the fullscreen Workout Command Center. The ONLY logging path.
 *
 * Entry states (draft store autosaves to localStorage, so back ≠ discard):
 *   ?template=cb_b[&date=…]  → self-seed from the program day (memory weights)
 *   surviving draft          → the deck, resumed
 *   draft + other template   → resume / start-fresh chooser
 *   nothing at all           → bounce to /workout, which is where a day is picked
 *
 * ── THERE IS NO LONGER A TEXT-IMPORT ENTRY ───────────────────────────────────
 * The fourth state used to be `PastePanel` — a textarea that took a Hevy
 * "Share → Copy workout" export or a coach-JSON blob and parsed it client-side
 * into a draft. It, `lib/hevy/` and `lib/coach/reportSchema.ts` are deleted:
 * every workout is logged natively in this deck now, so the panel's only
 * remaining function was to be the screen you landed on by accident.
 */
export default function SessionPage() {
  return (
    <>
      {/* Route-local opaque backdrop — the deck / Finish-Session screen no longer
          depends on the fixed AuroraBackground compositing (which rendered black
          on iOS), so the background is always a proper dark gradient. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-[1]"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, #121418 0%, var(--color-bg) 60%)' }}
      />
      <Suspense fallback={<PageSpinner />}>
        <SessionPageInner />
      </Suspense>
    </>
  )
}

function SessionPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const store = useSessionDraft()

  const templateKey = params.get('template')
  const targetDate = params.get('date') ?? logicalTodayISO()

  // `activeProgram()` is a synchronous read of a module cache React cannot see,
  // and the plan/phase preference arrives from `user_goals` AFTER first render
  // (AuthGate → hydratePrefsFromDb). Without the version in the deps this memo
  // froze the plan that happened to be cached at mount and the auto-seed below
  // committed the WRONG plan's exercise list to workout_sets. This is the one
  // stale read that reaches the database.
  const planVersion = useScheduleVersion()
  const templateDay = useMemo(() => {
    if (!templateKey) return null
    void planVersion   // subscription, not an input — see useScheduleVersion
    const program = activeProgram()
    return program.days.find((d) => d.key === templateKey) ?? null
  }, [templateKey, planVersion])

  // The exercises this deck will contain — the explicit per-set seed defines the
  // structure when one exists, otherwise the program day does.
  const seedNames = useMemo(() => {
    if (!templateDay) return []
    const seed = SEED_TEMPLATES[templateDay.key]
    return seed
      ? seed.exercises.map((e) => e.name)
      // templateDay is already phase-resolved (activeProgram) — cut-dropped lifts
      // are gone, so no bulk-only filter is needed here.
      : templateDay.exercises.map((e) => e.name)
  }, [templateDay])

  // Real per-set history for those exercises, scoped to the TARGET DATE's era so
  // a HELIX deck is never seeded from PPL-legacy numbers.
  const historyQ = useExerciseSetHistory(seedNames, eraForDate(targetDate), templateDay?.key)

  // The stored template outranks history (see buildTemplateDraft), so seeding
  // has to wait for it too — seeding early would open the program's cold start
  // and then never revisit it, because the auto-seed runs at most once.
  const templateQ = useRoutineTemplate(templateDay?.key)

  // Seeding waits for history so the previous session's actual numbers land in
  // the inputs (the program's wk1 target stays the cold-start fallback).
  const seedReady = !historyQ.isPending && !templateQ.isPending
  const { hydrated, draft, start, discard } = store

  // Match on program-day identity only — NOT the date. Back-dating an active
  // template deck (or editing an existing session) must never trip the
  // "Draft in progress" chooser; an edit draft (replaceSessionId) always resumes.
  const draftMatchesTemplate = !!draft && !!templateDay
    && (draft.dayKey === templateDay.key || !!draft.replaceSessionId)

  // At most ONE auto-seed per mount: without the ref, discarding a template
  // deck re-triggers this effect (draft just became null, ?template= is still
  // in the URL) and re-seeds a zombie draft in the instant before router.back()
  // unmounts the page.
  /**
   * ── THE WAKE LOCK IS NOT HERE ANY MORE ──────────────────────────────────────
   * It was: `useWakeLock(!!draft)`, on this component, for the reason its own
   * header gives — a sleeping screen is the first domino in the chain that ends
   * with iOS jetsamming the webview and Capacitor reloading into black.
   *
   * That reasoning is unchanged and is exactly why the call MOVED. Minimising a
   * workout unmounts this page while the draft is still live, so a lock held
   * here would be released at the moment the risk begins. It now lives in
   * `LiveSessionPill`, which is mounted by the root layout on every route and
   * holds the lock for the life of the DRAFT rather than the life of this
   * screen. Do not re-add it here: two components requesting the same sentinel
   * is not twice as awake, it is one wasted request per navigation.
   */

  /**
   * ── THE GHOST SCREEN ───────────────────────────────────────────────────────
   * Finishing a session used to flash the PASTE PANEL — "Paste your session",
   * a Hevy textarea — for the second or so between the commit landing and the
   * router arriving at the summary page. Nothing was wrong with the commit; the
   * sequence was simply visible:
   *
   *   1. `commit.onSuccess` calls `setDraft(null)` (correct — the draft is now a
   *      real session, and leaving it in localStorage would resurrect it).
   *   2. THIS component re-renders with `draft === null`, and the entry-state
   *      branch at the bottom is exactly right for that: no draft, no template
   *      → offer the paste gate.
   *   3. `router.replace('/session/<id>')` finally commits the navigation.
   *
   * Step 2 is the ghost, and no amount of tuning the paste panel fixes it,
   * because the paste panel is not the bug — rendering an ENTRY state during an
   * EXIT is. A navigation is in flight from the moment the commit resolves, so
   * the page holds a spinner until it lands rather than re-deciding what screen
   * you are on. The paste gate itself is untouched: it is still the deliberate
   * no-template entry (Workout → "Log workout" with no scheduled day).
   */
  const [leaving, setLeaving] = useState(false)
  const goToSession = useCallback((id: string) => { setLeaving(true); router.replace(`/session/${id}`) }, [router])
  const goToDay = useCallback((date: string) => { setLeaving(true); router.replace(`/day/${date}`) }, [router])

  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current || !hydrated || draft || !templateDay || !seedReady) return
    seededRef.current = true
    start(buildTemplateDraft(templateDay, targetDate, historyQ.data, templateQ.data))
  }, [hydrated, draft, templateDay, seedReady, targetDate, start, historyQ.data, templateQ.data])

  // Only the pre-deck states carry this. Once a draft exists, `SessionDeck`
  // renders `LiveSessionBar` — a pinned AppBar with the session's identity and
  // its live totals — and a second static header above it would be a title bar
  // stacked on a title bar.
  const header = (
    <header className="flex items-center gap-3 mb-4">
      <BackLink onClick={() => router.back()} label="Back — the draft autosaves" />
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-fluid-xl font-bold text-text leading-tight truncate">Log</h1>
        <p className="text-[11px] text-muted">Autosaves as you edit — back never discards</p>
      </div>
    </header>
  )

  /**
   * ── NOTHING TO LOG IS NOT A SCREEN ──────────────────────────────────────────
   * With the paste gate gone this route has no content of its own: a deck comes
   * either from `?template=` or from a surviving draft, and with neither there
   * is nothing to render. Bouncing to /workout — where the day is actually
   * chosen — is the honest answer, and `replace` keeps this dead end out of the
   * back stack so the chevron still leaves the flow rather than re-entering it.
   *
   * `hydrated` gates it: before the draft store has read localStorage, `draft`
   * is null for a reason that has nothing to do with whether one exists, and
   * redirecting on that would throw away a live session on every cold open.
   */
  const stranded = hydrated && !draft && !templateKey
  useEffect(() => {
    if (stranded) router.replace('/workout')
  }, [stranded, router])

  if (!hydrated) return <PageSpinner />
  // A commit has landed and the router is on its way out — see `leaving`.
  if (leaving) return <PageSpinner />

  // A surviving draft + a DIFFERENT template request → the user decides.
  if (draft && templateDay && !draftMatchesTemplate) {
    return (
      <div data-boxed>
        {header}
        <div className="max-w-md mx-auto rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-3 mt-6">
          <div className="flex items-center gap-2">
            <FileClock className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
            <h2 className="font-heading font-bold text-fluid-base text-text">Draft in progress</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            You have an unsaved draft{draft.title ? <> — <span className="text-text">{draft.title}</span></> : null} ({draft.date}).
            Starting {templateDay.label} fresh will replace it.
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={() => router.replace('/session')} className="btn-primary w-full justify-center min-h-[48px]">
              Resume draft
            </button>
            <button
              onClick={() => { discard(); start(buildTemplateDraft(templateDay, targetDate, historyQ.data, templateQ.data)) }}
              className="btn-glass w-full justify-center min-h-[48px] text-danger"
            >
              Start {templateDay.label} fresh
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Full-bleed while logging: the pinned bar has to span the viewport, and
  // `[data-boxed]`'s inline padding would inset it and its scroll-edge fade.
  if (draft) {
    return (
      <div data-fullbleed className="min-h-dvh">
        <SessionDeck
          store={store}
          onClose={() => router.back()}
          onViewDay={goToDay}
          onViewSession={goToSession}
        />
      </div>
    )
  }

  // Either a template deck is still seeding, or the redirect above is in
  // flight. Both are waits, and neither is a screen.
  return (
    <div data-boxed>
      {header}
      <PageSpinner />
    </div>
  )
}

function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[40dvh]" role="status" aria-label="Loading">
      <Loader2 className="w-6 h-6 text-primary animate-spin" aria-hidden="true" />
    </div>
  )
}
