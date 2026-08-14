'use client'

import { useCallback, useMemo, useState } from 'react'
import { Check, CopyCheck, Trophy } from 'lucide-react'
import { CoachHeaderCard } from './CoachHeaderCard'
import { ExerciseDeckList } from './ExerciseDeckList'
import type { ReadyCue } from './ExerciseCard'
import { SessionNotesCard } from './SessionNotesCard'
import { CommitBar } from './CommitBar'
import { useExerciseSetHistory } from '@/lib/hooks/useExerciseSetHistory'
import { useExerciseBaselines } from '@/lib/hooks/useExerciseBaselines'
import { computeLivePrs, livePrDigest, livePrKey } from '@/lib/sessions/livePrs'
import { PrRecordSheet } from './PrRecordSheet'
import { useProgressionQueue } from '@/lib/hooks/useProgressionQueue'
import { useDeleteSession } from '@/lib/hooks/useDayVault'
import { eraForDate } from '@/lib/programs'
import { fmtVolume } from '@/lib/utils/units'
import { tapSuccess } from '@/lib/native/haptics'
import type { useSessionDraft, CommitResult } from '@/lib/hooks/useSessionDraft'
import { prAxisLabel } from '@/lib/training/prEngine'
import { isTimedExercise } from '@/lib/exercises/timed'

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
  const { draft, updateSet, splitSet, mergeSet, addCardio, updateCardio, addSet, removeSet, toggleSetDone, checkAllSets, removeExercise, reorder, setNotes, setExerciseNote, setStats, setSessionRpe, setDate, discard, commit } = store
  const [result, setResult] = useState<CommitResult | null>(null)
  const [committedDate, setCommittedDate] = useState<string | null>(null)
  // Delete the ACTUAL committed session (edit mode's trash), keyed to its date.
  const del = useDeleteSession(draft?.date ?? '')

  // Era-aware previous-session memory for every exercise in the deck.
  const names = draft?.exercises.filter((ex) => ex.kind !== 'cardio').map((ex) => ex.name) ?? []
  const { data: history } = useExerciseSetHistory(names, draft ? eraForDate(draft.date) : undefined, draft?.dayKey)

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

  // Forward-carried Smart-Coach cues — lifts due a load bump, keyed by name so a
  // matching card in this session shows the "▲ add load" chip inline.
  const { data: queue } = useProgressionQueue()
  const readyByName = useMemo(
    () => new Map<string, ReadyCue>((queue ?? []).map((a) => [a.name, { suggestKg: a.suggestKg, currentKg: a.currentKg, timed: a.timed, state: a.state }])),
    [queue],
  )

  // Which set's trophy was tapped. Held as (localId, setIdx) rather than as the
  // resolved record, so the sheet re-reads `livePrs` if the set changes while it
  // is open — the numbers on screen are always the numbers the engine holds.
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
      <div className="max-w-md mx-auto space-y-4 pt-6">
        <div className="flex items-center gap-2 text-success">
          {result.duplicate ? <CopyCheck className="w-5 h-5" aria-hidden="true" /> : <Check className="w-5 h-5" aria-hidden="true" />}
          <h3 className="font-heading font-bold text-fluid-lg text-text">
            {result.duplicate ? 'Already logged' : 'Session Committed'}
          </h3>
        </div>
        {result.duplicate ? (
          <p className="text-sm text-muted">This session was committed before — nothing was duplicated.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Volume" value={`${fmtVolume(result.totalVolumeKg)}kg`} />
              <Stat label="Sets" value={String(result.setCount)} />
              <Stat label="PRs" value={String(result.prCount)} />
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

  const commitBar = (
    <CommitBar
      draft={draft}
      busy={commit.isPending}
      error={commit.isError ? (commit.error instanceof Error ? commit.error.message : 'Save failed') : null}
      onCommit={() => {
        const date = draft.date
        setCommittedDate(date)
        commit.mutate(undefined, {
          onSuccess: (r) => {
            if (!r.duplicate) void tapSuccess()
            // Finish → the just-logged session's analysis page (Workout Summary),
            // not the day view. A duplicate (already logged) still has a sessionId
            // to open. Falls back to the day view, then the in-deck result screen.
            if (onViewSession && r.sessionId) onViewSession(r.sessionId)
            else if (onViewDay) onViewDay(date)
            else setResult(r)
          },
        })
      }}
      onSessionRpe={setSessionRpe}
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
    <div className="lg:grid lg:grid-cols-[minmax(320px,380px)_1fr] lg:gap-5 lg:items-start">
      {/* ── Left rail (sticky on desktop): identity, insight, notes, commit ── */}
      <div className="space-y-3 lg:sticky lg:top-4">
        <CoachHeaderCard draft={draft} recordCount={livePrs.count} onSetDate={setDate} onSetStats={setStats} />
        <SessionNotesCard notes={draft.notes} onChange={setNotes} />
        <div className="hidden lg:block">{commitBar}</div>
      </div>

      {/* ── The deck (single column — required by the vertical sort strategy) ── */}
      <div className="space-y-3 mt-3 lg:mt-0">
        <ExerciseDeckList
          draft={draft}
          history={history}
          livePrs={livePrs.bySet}
          readyByName={readyByName}
          onReorder={reorder}
          onUpdateSet={updateSet}
          onSplitSet={splitSet}
          onMergeSet={mergeSet}
          onAddSet={addSet}
          onRemoveSet={removeSet}
          onToggleDone={toggleSetDone}
          onCheckAll={checkAllSets}
          onRemoveExercise={removeExercise}
          onSetNote={setExerciseNote}
          onPrTap={handlePrTap}
          onUpdateCardio={updateCardio}
          onAddCardio={addCardio}
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
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  // Solid surface (no backdrop-filter): this success screen sits outside any
  // overlay, so the helix-overlay-open guard can't reach it — an opaque tile is
  // immune to the iOS composited-black glitch.
  return (
    <div className="rounded-2xl py-2.5" style={{ background: 'rgba(13,18,32,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="helix-num font-bold text-text">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  )
}
