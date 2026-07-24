'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, FileClock, Loader2 } from 'lucide-react'
import { SessionDeck } from '@/components/command-center/SessionDeck'
import { PastePanel } from '@/components/command-center/PastePanel'
import { useSessionDraft } from '@/lib/hooks/useSessionDraft'
import { useExerciseSetHistory } from '@/lib/hooks/useExerciseSetHistory'
import { buildTemplateDraft } from '@/lib/sessions/templateDraft'
import { SEED_TEMPLATES } from '@/lib/sessions/seedTemplates'
import { PROGRAMS, DEFAULT_PROGRAM_ID, getActiveProgramId, eraForDate } from '@/lib/programs'
import { logicalTodayISO } from '@/lib/utils/day'

/**
 * /session — the fullscreen Workout Command Center. The ONLY logging path.
 *
 * Entry states (draft store autosaves to localStorage, so back ≠ discard):
 *   ?template=cb_b[&date=…]  → self-seed from the program day (memory weights)
 *   no param, no draft       → PastePanel (Hevy text / coach JSON)
 *   surviving draft          → the deck, resumed
 *   draft + other template   → resume / start-fresh chooser
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

  const templateDay = useMemo(() => {
    if (!templateKey) return null
    const program = PROGRAMS[getActiveProgramId()] ?? PROGRAMS[DEFAULT_PROGRAM_ID]
    return program.days.find((d) => d.key === templateKey) ?? null
  }, [templateKey])

  // The exercises this deck will contain — the explicit per-set seed defines the
  // structure when one exists, otherwise the program day does.
  const seedNames = useMemo(() => {
    if (!templateDay) return []
    const seed = SEED_TEMPLATES[templateDay.key]
    return seed
      ? seed.exercises.map((e) => e.name)
      : templateDay.exercises.filter((e) => !e.bulkOnly).map((e) => e.name)
  }, [templateDay])

  // Real per-set history for those exercises, scoped to the TARGET DATE's era so
  // a HELIX deck is never seeded from PPL-legacy numbers.
  const historyQ = useExerciseSetHistory(seedNames, eraForDate(targetDate))

  // Seeding waits for history so the previous session's actual numbers land in
  // the inputs (the program's wk1 target stays the cold-start fallback).
  const seedReady = !historyQ.isPending
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
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current || !hydrated || draft || !templateDay || !seedReady) return
    seededRef.current = true
    start(buildTemplateDraft(templateDay, targetDate, historyQ.data))
  }, [hydrated, draft, templateDay, seedReady, targetDate, start, historyQ.data])

  const header = (
    <header className="flex items-center gap-3 mb-4">
      <button onClick={() => router.back()} className="btn-glass shrink-0 min-h-[44px]" aria-label="Back — the draft autosaves">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-fluid-xl font-bold text-text leading-tight truncate">Session Deck</h1>
        <p className="text-[11px] text-muted">Autosaves as you edit — back never discards</p>
      </div>
    </header>
  )

  if (!hydrated) return <PageSpinner />

  // A surviving draft + a DIFFERENT template request → the user decides.
  if (draft && templateDay && !draftMatchesTemplate) {
    return (
      <div>
        {header}
        <div className="max-w-md mx-auto helix-card !p-4 space-y-3 mt-6">
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
              onClick={() => { discard(); start(buildTemplateDraft(templateDay, targetDate, historyQ.data)) }}
              className="btn-glass w-full justify-center min-h-[48px] text-danger"
            >
              Start {templateDay.label} fresh
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {header}
      {draft ? (
        <SessionDeck
          store={store}
          onClose={() => router.back()}
          onViewDay={(date) => router.replace(`/day/${date}`)}
        />
      ) : templateDay ? (
        <PageSpinner />
      ) : (
        <PastePanel onDraft={start} />
      )}
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
