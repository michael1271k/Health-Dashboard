'use client'

import { useState } from 'react'
import { Check, CopyCheck, Flag, Trophy } from 'lucide-react'
import { CoachHeaderCard } from './CoachHeaderCard'
import { ExerciseDeckList } from './ExerciseDeckList'
import { CommitBar } from './CommitBar'
import { useExerciseSetHistory } from '@/lib/hooks/useExerciseSetHistory'
import { eraForDate } from '@/lib/programs'
import { tapSuccess } from '@/lib/native/haptics'
import type { useSessionDraft, CommitResult } from '@/lib/hooks/useSessionDraft'

/**
 * The Command Center deck — ONE component system, two entry points:
 * review mode (pasted coach JSON → fine-tune → commit) and live mode
 * (in-gym logger seeded from the program day, per-set check-off).
 */
export function SessionDeck({ store, onClose }: {
  store: ReturnType<typeof useSessionDraft>
  onClose: () => void
}) {
  const { draft, updateSet, addSet, removeSet, reorder, discard, commit } = store
  const [result, setResult] = useState<CommitResult | null>(null)

  // Era-aware previous-session memory for every exercise in the deck.
  const names = draft?.exercises.map((ex) => ex.name) ?? []
  const { data: history } = useExerciseSetHistory(names, draft ? eraForDate(draft.date) : undefined)

  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-success">
          {result.duplicate ? <CopyCheck className="w-5 h-5" aria-hidden="true" /> : <Check className="w-5 h-5" aria-hidden="true" />}
          <h3 className="font-heading font-bold text-lg text-text">
            {result.duplicate ? 'Already logged' : 'Session Committed'}
          </h3>
        </div>
        {result.duplicate ? (
          <p className="text-sm text-muted">This coach report was committed before — nothing was duplicated.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Volume" value={`${Math.round(result.totalVolumeKg).toLocaleString()}kg`} />
              <Stat label="Sets" value={String(result.setCount)} />
              <Stat label="PRs" value={String(result.prCount)} />
            </div>
            {result.newPRs.length > 0 && (
              <div className="rounded-xl px-3 py-2.5 space-y-1"
                style={{ background: 'rgba(232,197,122,0.07)', border: '1px solid rgba(232,197,122,0.35)' }}>
                {result.newPRs.map((pr) => (
                  <p key={pr.exerciseName} className="text-sm flex items-center gap-1.5" style={{ color: '#E8C57A' }}>
                    <Trophy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {pr.exerciseName} — est. 1RM {Math.round(pr.est1rm)}kg
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        <button onClick={onClose} className="btn-primary w-full justify-center min-h-[48px]">Done</button>
      </div>
    )
  }

  if (!draft) return null

  return (
    <div className="space-y-3">
      <CoachHeaderCard draft={draft} />
      <ExerciseDeckList
        draft={draft}
        history={history}
        onReorder={reorder}
        onUpdateSet={updateSet}
        onAddSet={addSet}
        onRemoveSet={removeSet}
      />
      {draft.mode === 'live' && draft.nextSessionFlag && (
        <p className="text-xs flex items-center gap-1.5 px-1" style={{ color: '#E8C57A' }} dir="auto">
          <Flag className="w-3 h-3 shrink-0" aria-hidden="true" /> {draft.nextSessionFlag}
        </p>
      )}
      <CommitBar
        draft={draft}
        busy={commit.isPending}
        error={commit.isError ? (commit.error instanceof Error ? commit.error.message : 'Save failed') : null}
        onCommit={() => {
          commit.mutate(undefined, {
            onSuccess: (r) => { if (!r.duplicate) void tapSuccess(); setResult(r) },
          })
        }}
        onDiscard={() => { discard(); onClose() }}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card py-2.5">
      <div className="helix-num font-bold text-text">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  )
}
