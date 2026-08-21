'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, CopyCheck, Trophy } from 'lucide-react'
import { CoachNotes } from './CoachNotes'
import { LiveSessionBar } from './LiveSessionBar'
import { LiveSessionHero } from './LiveSessionHero'
import { ExerciseDeckList } from './ExerciseDeckList'
import type { ReadyCue } from './ExerciseCard'
import { SessionNotesCard } from './SessionNotesCard'
import { CommitBar } from './CommitBar'
import { FinishSheet } from './FinishSheet'
import { useExerciseSetHistory, useGlobalSetHistory } from '@/lib/hooks/useExerciseSetHistory'
import { useExerciseBaselines } from '@/lib/hooks/useExerciseBaselines'
import { computeLivePrs, livePrDigest, livePrKey } from '@/lib/sessions/livePrs'
import { PrRecordSheet } from './PrRecordSheet'
import { useProgressionQueue } from '@/lib/hooks/useProgressionQueue'
import { useDeleteSession } from '@/lib/hooks/useDayVault'
import { eraForDate } from '@/lib/programs'
import { dayColor, EMBER, STEEL, GOLD, MUTED } from '@/lib/theme/palette'
import { draftTotals } from '@/lib/sessions/draft'
import { fmtVolume } from '@/lib/utils/units'
import { tapSuccess } from '@/lib/native/haptics'
import type { useSessionDraft, CommitResult } from '@/lib/hooks/useSessionDraft'
import { prAxisLabel } from '@/lib/training/prEngine'
import { isTimedExercise } from '@/lib/exercises/timed'
import { useReportTargets } from '@/lib/hooks/useReportTargets'

/**
 * The Command Center deck — the ONE logging surface. Hosted fullscreen on
 * /session; every entry point (paste, template, schedule shortcut) feeds the
 * same draft store. Mobile: single column, sticky commit. Desktop (≥lg):
 * sticky left rail (identity/insight/notes/commit) + the sortable deck.
 */
export function SessionDeck({ store, onClose, onViewDay, onViewSession }: {
  store: ReturnType<typeof useSessionDraft>
  onClose: () => void
  onViewDay?: (date: string) => void
  /** Post-finish destination: the just-committed session's analysis page. */
  onViewSession?: (sessionId: string) => void
}) {
  const { draft, updateSet, splitSet, mergeSet, updateCardio, addSet, removeSet, toggleSetDone, removeExercise, reorder, setNotes, setExerciseNote, setStats, setSessionRpe, setDate, discard, commit } = store
  const [result, setResult] = useState<CommitResult | null>(null)
  const [finishOpen, setFinishOpen] = useState(false)
  const [committedDate, setCommittedDate] = useState<string | null>(null)
  // Delete the ACTUAL committed session (edit mode's trash), keyed to its date.
  const del = useDeleteSession(draft?.date ?? '')

  // Era-aware previous-session memory for every exercise in the deck.
  const names = draft?.exercises.filter((ex) => ex.kind !== 'cardio').map((ex) => ex.name) ?? []
  const { data: history } = useExerciseSetHistory(names, draft ? eraForDate(draft.date) : undefined, draft?.dayKey)
  // The PREVIOUS column asks a different question from the coach — see the note
  // on `useGlobalSetHistory`. Friday's leg curl shows Monday's numbers.
  const { data: globalHistory } = useGlobalSetHistory(names, draft ? eraForDate(draft.date) : undefined)

  // Live PR detection. All-time baselines strictly BEFORE this session's date,
  // run through the same engine `saveSession` uses — so a badge that appears on
  // the green tick is a badge that gets written to personal_records.
  //
  // Keyed on a DIGEST OF THE COMMITTED SETS, not on `draft`. `draft` is a new
  // object on every keystroke, so this used to hand every ExerciseCard a fresh
  // `livePrs` Map and break memo across the whole deck. The engine itself is
  // 0.0126 ms — never the cost; the identity churn was. See livePrDigest.
  const { data: baselines } = useExerciseBaselines(names, draft?.date)
  const prKey = livePrDigest(draft)
  // `draft` is deliberately not a dependency: `prKey` already covers every
  // field the result can depend on, and including it defeats the whole point.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const livePrs = useMemo(() => computeLivePrs(draft, baselines), [prKey, baselines])

  // ONE `draftTotals` for the whole deck. It was called in three places —
  // CoachHeaderCard, CommitBar and FinishSheet — each walking every set of every
  // exercise on every render of its own subtree. Null-safe because hooks must
  // run before the `if (!draft) return null` below.
  const totals = useMemo(() => (draft ? draftTotals(draft) : { volumeKg: 0, sets: 0 }), [draft])

  // Forward-carried Smart-Coach cues — lifts due a load bump, keyed by name so a
  // matching card in this session shows the "▲ add load" chip inline.
  const { data: queue } = useProgressionQueue()
  const readyByName = useMemo(
    () => new Map<string, ReadyCue>((queue ?? []).map((a) => [a.name, { suggestKg: a.suggestKg, currentKg: a.currentKg, timed: a.timed, state: a.state }])),
    [queue],
  )

  // The last report's prescriptions, resolved ONCE for the deck. Every card
  // matches its own row out of this by canonical name.
  const { targets: reportTargets } = useReportTargets()

  // Which set's trophy was tapped. Held as (localId, setIdx) rather than as the
  // resolved record, so the sheet re-reads `livePrs` if the set changes while it
  // is open — the numbers on screen are always the numbers the engine holds.
  /**
   * ── ONE TITLE, TWO ELEMENTS ────────────────────────────────────────────────
   * The hero carries the identity at the top of the document; the pinned bar
   * carries a compact copy that appears only once the hero has left. An
   * IntersectionObserver on the hero, not a scroll handler: a scroll listener on
   * a sticky header runs on the main thread at pointer rate to answer a question
   * with two states, on the surface whose keystroke latency has been measured
   * and fixed twice.
   */
  const heroRef = useRef<HTMLDivElement>(null)
  const [titlePassed, setTitlePassed] = useState(false)
  useEffect(() => {
    const el = heroRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setTitlePassed(!entry.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const [prTarget, setPrTarget] = useState<{ localId: string; setIdx: number } | null>(null)
  const handlePrTap = useCallback(
    (localId: string, setIdx: number) => setPrTarget({ localId, setIdx }),
    [],
  )

  const prSheet = useMemo(() => {
    if (!prTarget || !draft) return null
    const ex = draft.exercises.find((e) => e.localId === prTarget.localId)
    const set = ex?.sets[prTarget.setIdx]
    if (!ex || !set) return null
    // The label names the SET, and the side when there is one — a pair's two
    // halves can each hold a record and the sheet has to say which arm.
    const setNum = ex.sets.slice(0, prTarget.setIdx + 1)
      .reduce<{ n: number; seen: Set<string> }>((acc, s) => {
        const key = s.pairId ?? `#${acc.n}`
        if (!acc.seen.has(key)) { acc.n += 1; acc.seen.add(key) }
        return acc
      }, { n: 0, seen: new Set() }).n
    const side = set.side === 'L' ? ' · Left' : set.side === 'R' ? ' · Right' : ''
    return {
      exerciseName: ex.name,
      setLabel: `Set ${setNum}${side}`,
      records: livePrs.detailBySet.get(livePrKey(prTarget.localId, prTarget.setIdx)),
      timed: isTimedExercise(ex.name),
    }
  }, [prTarget, draft, livePrs])

  if (result) {
    return (
      <div className="max-w-md mx-auto space-y-4 pt-6 px-4">
        <div className="flex items-center gap-2 text-success">
          {result.duplicate ? <CopyCheck className="w-5 h-5" aria-hidden="true" /> : <Check className="w-5 h-5" aria-hidden="true" />}
          <h3 className="font-heading font-bold text-fluid-lg text-text">
            {result.duplicate ? 'Already logged' : 'Session Complete'}
          </h3>
        </div>
        {result.duplicate ? (
          <p className="text-sm text-muted">This session was committed before — nothing was duplicated.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Volume" value={`${fmtVolume(result.totalVolumeKg)}kg`} color={EMBER} />
              <Stat label="Sets" value={String(result.setCount)} color={STEEL} />
              {/* Gold only when there is something to be gold about — a
                  permanent gold zero is how gold stops meaning a record. */}
              <Stat label={result.prCount === 1 ? 'Record' : 'Records'} value={String(result.prCount)}
                color={result.prCount > 0 ? GOLD : MUTED} />
            </div>
            {result.newPRs.length > 0 && (
              <div className="rounded-xl px-3 py-2.5 space-y-1"
                style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.38)' }}>
                {result.newPRs.map((pr) => (
                  <p key={pr.exerciseName} className="text-sm flex items-center gap-1.5 flex-wrap" style={{ color: '#D4AF37' }}>
                    <Trophy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{pr.exerciseName}</span>
                    {pr.axes.map((ax) => (
                      <span key={ax} className="text-[9px] font-bold uppercase tracking-wide px-1 py-px rounded"
                        style={{ background: 'rgba(212,175,55,0.16)', border: '1px solid rgba(212,175,55,0.5)' }}>
                        {prAxisLabel(ax, isTimedExercise(pr.exerciseName))}
                      </span>
                    ))}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        <div className="flex flex-col gap-2">
          {onViewDay && committedDate && (
            <button onClick={() => onViewDay(committedDate)} className="btn-primary w-full justify-center min-h-[48px]">
              View the day
            </button>
          )}
          <button onClick={onClose} className={`${onViewDay && committedDate ? 'btn-glass' : 'btn-primary'} w-full justify-center min-h-[48px]`}>
            Done
          </button>
        </div>
      </div>
    )
  }

  if (!draft) return null

  const doCommit = () => {
    const date = draft.date
    setCommittedDate(date)
    commit.mutate(undefined, {
      onSuccess: (r) => {
        if (!r.duplicate) void tapSuccess()
        setFinishOpen(false)
        // Finish → the just-logged session's analysis page (Workout Summary),
        // not the day view. A duplicate (already logged) still has a sessionId
        // to open. Falls back to the day view, then the in-deck result screen.
        if (onViewSession && r.sessionId) onViewSession(r.sessionId)
        else if (onViewDay) onViewDay(date)
        else setResult(r)
      },
    })
  }

  const commitError = commit.isError
    ? (commit.error instanceof Error ? commit.error.message : 'Save failed')
    : null

  const commitBar = (
    <CommitBar
      draft={draft}
      totals={totals}
      busy={commit.isPending}
      error={commitError}
      onFinish={() => setFinishOpen(true)}
      onDiscard={() => { discard(); onClose() }}
      onCancelEdit={() => { discard(); onClose() }}
      deleting={del.isPending}
      onDelete={() => {
        // The trash in edit mode ALWAYS deletes the real committed session, then
        // clears the edit draft and returns to the day.
        if (!draft.replaceSessionId) { discard(); onClose(); return }
        del.mutate(draft.replaceSessionId, {
          onSuccess: () => {
            discard()
            if (onViewDay) onViewDay(draft.date)
            else onClose()
          },
        })
      }}
    />
  )

  return (
    <>
      {/* The pinned identity + live rail. `draftTotals` runs HERE, once, and the
          bar takes three numbers: handed the draft it would re-render on every
          keystroke in every set field to redraw two figures that only move when
          a set is ticked. See `src/tests/deck-render.test*`. */}
      <LiveSessionBar
        draft={draft}
        accent={dayColor(draft.dayKey, draft.splitDay)}
        volumeKg={totals.volumeKg}
        sets={totals.sets}
        recordCount={livePrs.count}
        shown={titlePassed}
        onBack={onClose}
      />

    {/* The route is full-bleed so the bar above can span the viewport; the
        deck keeps its own measure and padding here. */}
    <div className="mx-auto w-full max-w-[80rem] px-3 sm:px-5 pb-6">
      {/* The hero spans BOTH desktop columns — it is the document's title, and a
          title indented into a sidebar is a sidebar heading. */}
      <div ref={heroRef}>
        <LiveSessionHero
          draft={draft}
          accent={dayColor(draft.dayKey, draft.splitDay)}
          volumeKg={totals.volumeKg}
          sets={totals.sets}
          recordCount={livePrs.count}
          onBack={onClose}
          onSetDate={setDate}
        />
      </div>

    <div className="lg:grid lg:grid-cols-[minmax(320px,380px)_1fr] lg:gap-5 lg:items-start">
      {/* One sheet, not one per CommitBar — the bar renders twice (desktop rail
          and mobile deck) and a dialog rendered twice is two dialogs. */}
      <FinishSheet
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        draft={draft}
        totals={totals}
        busy={commit.isPending}
        error={commitError}
        onSetStats={setStats}
        onSessionRpe={setSessionRpe}
        onCommit={doCommit}
      />
      {/* ── Left rail (sticky on desktop): insight, notes, commit ──
          Identity and the live rail left for `LiveSessionBar`: they were the
          two things that had to stay on screen and this rail scrolls away on a
          phone with the first swipe. */}
      <div className="space-y-3 lg:sticky lg:top-4">
        <CoachNotes draft={draft} />
        <SessionNotesCard notes={draft.notes} onChange={setNotes} />
        <div className="hidden lg:block">{commitBar}</div>
      </div>

      {/* ── The deck (single column — required by the vertical sort strategy) ── */}
      <div className="space-y-3 mt-3 lg:mt-0">
        <ExerciseDeckList
          draft={draft}
          history={history}
          globalHistory={globalHistory}
          livePrs={livePrs.bySet}
          readyByName={readyByName}
          reportTargets={reportTargets}
          onReorder={reorder}
          onUpdateSet={updateSet}
          onSplitSet={splitSet}
          onMergeSet={mergeSet}
          onAddSet={addSet}
          onRemoveSet={removeSet}
          onToggleDone={toggleSetDone}
          onRemoveExercise={removeExercise}
          onSetNote={setExerciseNote}
          onPrTap={handlePrTap}
          onUpdateCardio={updateCardio}
        />
        <div className="lg:hidden">{commitBar}</div>
      </div>

      {prSheet && (
        <PrRecordSheet
          open={!!prTarget}
          onClose={() => setPrTarget(null)}
          exerciseName={prSheet.exerciseName}
          setLabel={prSheet.setLabel}
          records={prSheet.records}
          timed={prSheet.timed}
        />
      )}
    </div>
    </div>
    </>
  )
}

/**
 * One tile of the success screen.
 *
 * Label ABOVE value, matching every other metric grid in the app (the session
 * header, the exercise record strip, the finish sheet). It used to be the only
 * one the other way up, so the number arrived before you knew what it counted.
 */
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  // Solid surface (no backdrop-filter): this success screen sits outside any
  // overlay, so the helix-overlay-open guard can't reach it — an opaque tile is
  // immune to the iOS composited-black glitch.
  return (
    <div className="rounded-2xl px-3 py-2.5" style={{ background: 'rgba(13,18,32,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] truncate" style={{ color }}>{label}</div>
      <div className="helix-num font-bold text-fluid-xl tabular-nums leading-none mt-1.5 text-text">{value}</div>
    </div>
  )
}
