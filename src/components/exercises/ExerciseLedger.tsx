'use client'

import { Loader2 } from 'lucide-react'
import { useExerciseSetLedger, PER_SET_HISTORY_FROM, type LedgerSet } from '@/lib/hooks/useExerciseSetLedger'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { formatSet } from '@/lib/utils/setFormat'
import { isTimedExercise } from '@/lib/exercises/timed'
import { rpeColor, rpeLabel } from '@/lib/training/effort'
import { EMBER, OXIDE, SAPPHIRE, MUTED } from '@/lib/theme/palette'

/** Same three tags, same three letters, same three colours as everywhere else. */
const TAG: Record<string, { label: string; full: string; color: string }> = {
  warmup: { label: 'W', full: 'Warm-up', color: EMBER },
  failure: { label: 'F', full: 'Taken to failure', color: OXIDE },
  dropset: { label: 'D', full: 'Drop set', color: '#9A6DD7' },
}

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' })

/**
 * Every set of one exercise, grouped by the workout it happened on.
 *
 * ── WHY A LIST AND NOT A TABLE ───────────────────────────────────────────────
 * The question this answers is "what did I actually do last time, and the time
 * before" — which is read down, one session at a time, not across. A table with
 * a row per session would have to summarise each one to fit, and summarising is
 * precisely what the Summary tab already does.
 *
 * The sets themselves reuse the session report's anatomy — marker, load × reps,
 * effort, with W/F replacing the number — so a set looks the same in the logger,
 * in the report and here.
 */
export function ExerciseLedger({ exerciseId, exerciseName, accent = MUTED }: {
  exerciseId: string | null
  exerciseName: string
  accent?: string
}) {
  const unit = useUnitSystem()
  const timed = isTimedExercise(exerciseName)
  const { data, isLoading } = useExerciseSetLedger(exerciseId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10" role="status" aria-label="Loading history">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: accent }} aria-hidden="true" />
      </div>
    )
  }

  if (!data?.length) {
    return (
      <div className="py-8 text-center space-y-1.5">
        <p className="text-fluid-sm text-text/80">No sets recorded for this movement.</p>
        <Floor />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {data.map((session) => (
        <section key={session.sessionId}>
          {/* The workout, not the weekday. A swapped session lands on a
              different day of the week and is still Upper A. */}
          <div className="flex items-baseline gap-2 pb-1.5 border-b" style={{ borderColor: `${accent}33` }}>
            <span className="split-label text-fluid-sm truncate" style={{ color: accent }}>{session.label}</span>
            <span className="text-[10px] text-muted shrink-0">{longDate(session.date)}</span>
            <span className="helix-num text-[11px] text-muted tabular-nums ml-auto shrink-0">
              {session.workingSets} × · {Math.round(displayWeight(session.volumeKg) ?? 0).toLocaleString()}{unit}
            </span>
          </div>

          <div className="pt-1">
            {session.sets.map((s, i) => <Row key={`${s.setNumber}-${s.side ?? ''}-${i}`} set={s} timed={timed} unit={unit} />)}
          </div>
        </section>
      ))}
      <Floor />
    </div>
  )
}

function Row({ set, timed, unit }: { set: LedgerSet; timed: boolean; unit: string }) {
  const tag = set.setType ? TAG[set.setType] : undefined
  // W and F replace the number; a drop set keeps its number and carries the tag
  // beside the load. Identical to the session report's ledger, deliberately.
  const replaces = set.setType === 'warmup' || set.setType === 'failure'
  const marker = replaces && tag ? tag.label : (set.workingNum != null ? String(set.workingNum) : '·')

  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)_46px] items-center gap-2 py-[3px] text-fluid-sm">
      <span className="helix-num text-[10px] font-bold text-right tabular-nums"
        style={{ color: replaces && tag ? tag.color : 'rgba(255,255,255,0.45)' }}
        title={tag?.full}>
        {marker}
      </span>
      <span className="flex items-center gap-1.5 min-w-0">
        {set.side && (
          <span className="text-[9px] font-bold shrink-0" style={{ color: set.side === 'L' ? SAPPHIRE : EMBER }}>
            {set.side}
          </span>
        )}
        <span className="helix-num font-semibold text-text tabular-nums truncate">
          {formatSet(set.weightKg, set.reps, { timed, unit, toDisplay: displayWeight })}
        </span>
        {tag && !replaces && (
          <span className="text-[8px] font-bold uppercase px-1 py-px rounded shrink-0"
            style={{ color: tag.color, background: `${tag.color}1f` }}
            title={tag.full} aria-label={tag.full}>{tag.label}</span>
        )}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-right truncate"
        style={{ color: set.rpe != null ? rpeColor(set.rpe) : 'transparent' }}
        title={set.rpe != null ? `Effort ${set.rpe} / 10` : undefined}>
        {set.rpe != null ? rpeLabel(set.rpe) : '—'}
      </span>
    </div>
  )
}

/**
 * Where the record starts.
 *
 * Stated rather than implied: the pre-July sessions arrived from Notion as
 * totals, and although most were rebuilt into real sets on 2026-08-22, ten could
 * not be reconciled and still carry none — so a ledger that simply ends looks
 * like a training gap that never happened.
 */
function Floor() {
  const from = new Date(`${PER_SET_HISTORY_FROM}T12:00:00Z`)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <p className="text-[10px] text-muted/70 leading-snug">
      Set-by-set history begins {from}. Earlier sessions were imported as totals and carry no individual sets.
    </p>
  )
}
