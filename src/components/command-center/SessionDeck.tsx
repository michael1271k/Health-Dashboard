'use client'

import { useState } from 'react'
import { Check, CopyCheck, Trophy } from 'lucide-react'
import { CoachHeaderCard } from './CoachHeaderCard'
import { ExerciseDeckList } from './ExerciseDeckList'
import { SessionNotesCard } from './SessionNotesCard'
import { CommitBar } from './CommitBar'
import { useExerciseSetHistory } from '@/lib/hooks/useExerciseSetHistory'
import { useDeleteSession } from '@/lib/hooks/useDayVault'
import { eraForDate } from '@/lib/programs'
import { fmtVolume } from '@/lib/utils/units'
import { tapSuccess } from '@/lib/native/haptics'
import type { useSessionDraft, CommitResult } from '@/lib/hooks/useSessionDraft'

/**
 * The Command Center deck — the ONE logging surface. Hosted fullscreen on
 * /session; every entry point (paste, template, schedule shortcut) feeds the
 * same draft store. Mobile: single column, sticky commit. Desktop (≥lg):
 * sticky left rail (identity/insight/notes/commit) + the sortable deck.
 */
export function SessionDeck({ store, onClose, onViewDay }: {
  store: ReturnType<typeof useSessionDraft>
  onClose: () => void
  onViewDay?: (date: string) => void
}) {
  const { draft, updateSet, splitSet, mergeSet, toggleSetLink, addSet, removeSet, removeExercise, reorder, setNotes, setExerciseNote, setStats, setDate, discard, commit } = store
  const [result, setResult] = useState<CommitResult | null>(null)
  const [committedDate, setCommittedDate] = useState<string | null>(null)
  // Delete the ACTUAL committed session (edit mode's trash), keyed to its date.
  const del = useDeleteSession(draft?.date ?? '')

  // Era-aware previous-session memory for every exercise in the deck.
  const names = draft?.exercises.filter((ex) => ex.kind !== 'cardio').map((ex) => ex.name) ?? []
  const { data: history } = useExerciseSetHistory(names, draft ? eraForDate(draft.date) : undefined)

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
                style={{ background: 'rgba(232,197,122,0.07)', border: '1px solid rgba(232,197,122,0.35)' }}>
                {result.newPRs.map((pr) => (
                  <p key={pr.exerciseName} className="text-sm flex items-center gap-1.5" style={{ color: '#C9A227' }}>
                    <Trophy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {pr.exerciseName} — est. 1RM {Math.round(pr.est1rm)}kg
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        <div className="flex flex-col gap-2">
          {onViewDay && committedDate && (
            <button onClick={() => onViewDay(committedDate)} className="btn-primary w-full justify-center min-h-[48px]">
              View day in the Nexus
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
            // Expected flow: the save lands and the deck transitions straight
            // into the Daily Nexus for that day (which shows the session, PRs and
            // progression). Falls back to the in-deck result screen if no handler.
            if (onViewDay) onViewDay(date)
            else setResult(r)
          },
        })
      }}
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
        <CoachHeaderCard draft={draft} onSetDate={setDate} onSetStats={setStats} />
        <SessionNotesCard notes={draft.notes} onChange={setNotes} />
        <div className="hidden lg:block">{commitBar}</div>
      </div>

      {/* ── The deck (single column — required by the vertical sort strategy) ── */}
      <div className="space-y-3 mt-3 lg:mt-0">
        <ExerciseDeckList
          draft={draft}
          history={history}
          onReorder={reorder}
          onUpdateSet={updateSet}
          onSplitSet={splitSet}
          onMergeSet={mergeSet}
          onToggleLink={toggleSetLink}
          onAddSet={addSet}
          onRemoveSet={removeSet}
          onRemoveExercise={removeExercise}
          onSetNote={setExerciseNote}
        />
        <div className="lg:hidden">{commitBar}</div>
      </div>
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
