'use client'

import { useCallback, useState } from 'react'
import { Moon, Repeat, RotateCcw, Undo2 } from 'lucide-react'
import { activeProgram, scheduleDayFor } from '@/lib/programs'
import { useSwapDay, useClearScheduleOverride } from '@/lib/hooks/useScheduleOverrides'
import { getScheduleOverride, REST_OVERRIDE } from '@/lib/schedule/overrides'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { planRestDay, describeRestPlan, shortDayLabel, type RestDayPlan } from '@/lib/schedule/swap'
import { blurOnTap } from '@/lib/utils/blurOnTap'

const REST_VIOLET = '#B4522A'

/**
 * The result of the last swap, plus the dates it touched so it can be undone in
 * one action. A rest-day swap rewrites TWO dates; offering "reset this date"
 * against that leaves the week half-rearranged.
 */
interface SwapNote { text: string; dates: string[] }

/** Everything a rest-day swap needs to say and undo. */
function useRestSwap(date: string) {
  const swap = useSwapDay()
  const clear = useClearScheduleOverride()
  const [note, setNote] = useState<SwapNote | null>(null)

  const takeRest = useCallback((onDone?: () => void) => {
    swap.mutate({ date, dayKey: REST_OVERRIDE }, {
      onSuccess: (out) => {
        if (out.kind === 'rest') {
          setNote({ text: describeRestPlan(out.plan), dates: out.plan.writes.map((w) => w.date) })
        }
        onDone?.()
      },
    })
  }, [swap, date])

  const undo = useCallback(() => {
    if (!note) return
    clear.mutate(note.dates, { onSuccess: () => setNote(null) })
  }, [clear, note])

  return { takeRest, undo, note, setNote, busy: swap.isPending || clear.isPending }
}

/** The undo strip shown after a swap lands. */
function SwapNoteRow({ note, onUndo, busy }: { note: SwapNote; onUndo: () => void; busy: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5"
      style={{ borderColor: `${REST_VIOLET}33`, background: `${REST_VIOLET}0f` }}>
      <Moon className="w-3.5 h-3.5 shrink-0" style={{ color: REST_VIOLET }} aria-hidden="true" />
      <span className="text-[11px] text-text/90 flex-1 min-w-0" role="status">{note.text}</span>
      <button type="button" onClick={onUndo} disabled={busy} onPointerUp={blurOnTap}
        className="flex items-center gap-1 text-[11px] text-muted hover:text-text min-h-[32px] px-1 disabled:opacity-50">
        <Undo2 className="w-3 h-3" aria-hidden="true" /> Undo
      </button>
    </div>
  )
}

/**
 * "Rest today" as a single, safe action.
 *
 * Two taps, and the FIRST one tells you the consequence — "Delts & Arms moves
 * to Wed 5 Aug" — because the whole point of the fix is that resting rearranges
 * the week rather than deleting a session, and an action that rearranges your
 * week silently is one you stop trusting. The destination is read from the
 * active plan at arm time, so it is the real answer, not a guess.
 */
export function RestTodayButton({ date, className = '', label = 'Rest today' }: {
  date: string
  className?: string
  label?: string
}) {
  const [plan, setPlan] = useState<RestDayPlan | null>(null)
  const { takeRest, undo, note, busy } = useRestSwap(date)

  if (note) return <div className={className}><SwapNoteRow note={note} onUndo={undo} busy={busy} /></div>

  // Armed — state the consequence, then confirm. `scheduleDayFor` reads the
  // override cache from localStorage, so it is resolved on tap (client only),
  // never during render.
  if (plan) {
    const dest = plan.outcome === 'swapped'
      ? `${plan.moved?.label} moves to ${shortDayLabel(plan.movedTo as string)}${plan.sameWeek ? '' : ' (next week)'}`
      : plan.outcome === 'no-slot'
        ? `No free rest slot ahead — ${plan.moved?.label} would be dropped`
        : plan.outcome === 'already-rest'
          ? 'Already a rest day'
          : 'Sets this day to rest'
    return (
      <div className={`space-y-1.5 ${className}`}>
        <p className="text-[11px] text-muted leading-snug">{dest}</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setPlan(null)} onPointerUp={blurOnTap}
            className="btn-glass min-h-[36px] text-[11px] px-2.5">Cancel</button>
          <button type="button" disabled={busy || plan.outcome === 'already-rest'} onPointerUp={blurOnTap}
            onClick={() => takeRest(() => setPlan(null))}
            className="btn-glass min-h-[36px] text-[11px] px-2.5 disabled:opacity-50"
            style={{ borderColor: `${REST_VIOLET}66`, color: REST_VIOLET }}>
            {busy ? 'Moving…' : 'Confirm rest'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button type="button" onPointerUp={blurOnTap}
      onClick={() => setPlan(planRestDay(date, (d) => scheduleDayFor(d)))}
      className={`btn-glass min-h-[40px] text-fluid-xs justify-center ${className}`}
      style={{ borderColor: `${REST_VIOLET}44`, color: REST_VIOLET }}>
      <Moon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
    </button>
  )
}

/**
 * "Swap Day" — place any program day's workout (or a Rest Day) onto this date.
 *
 * Both directions are now genuine EXCHANGES rather than overwrites: pulling
 * Friday's session onto Wednesday sends Wednesday's work to Friday, and taking a
 * rest day moves the displaced workout to the plan's next rest slot. See
 * `src/lib/schedule/swap.ts` for the rule and its tests.
 *
 * `bare` drops the toggle button and renders the chooser directly, for use
 * inside a sheet that is already a disclosure.
 */
export function SwapDayControl({ date, className = '', bare = false }: {
  date: string
  className?: string
  bare?: boolean
}) {
  const [open, setOpen] = useState(bare)
  const swap = useSwapDay()
  const clear = useClearScheduleOverride()
  const program = activeProgram()
  useScheduleVersion()   // "Reset to default" must appear/disappear on a remote swap too
  const overridden = getScheduleOverride(date) != null
  const { takeRest, undo, note, busy: restBusy } = useRestSwap(date)
  const busy = swap.isPending || clear.isPending || restBusy

  const panel = (
    <div className={`${bare ? '' : 'mt-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3'} space-y-2 w-full`}>
      <p className="text-[11px] text-muted">Place a day onto {date}:</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {program.days.map((d) => (
          <button
            key={d.key}
            type="button"
            disabled={busy}
            onClick={() => swap.mutate({ date, dayKey: d.key }, { onSuccess: () => !bare && setOpen(false) })}
            className="rounded-xl px-3 py-2.5 text-left transition-colors bg-white/[0.02] border hover:bg-white/[0.05] disabled:opacity-50"
            style={{ borderColor: `${d.color}33` }}
          >
            <span className="block text-sm font-semibold truncate" style={{ color: d.color }}>{d.label}</span>
            {d.sub && <span className="block text-[10px] text-muted truncate">{d.sub}</span>}
          </button>
        ))}
        {/* Rest Day — a swap, not a delete. */}
        <button
          type="button"
          disabled={busy}
          onClick={() => takeRest(() => !bare && setOpen(false))}
          className="rounded-xl px-3 py-2.5 text-left transition-colors bg-white/[0.02] border hover:bg-white/[0.05] disabled:opacity-50 flex items-center gap-2"
          style={{ borderColor: `${REST_VIOLET}33` }}
        >
          <Moon className="w-4 h-4 shrink-0" style={{ color: REST_VIOLET }} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold" style={{ color: REST_VIOLET }}>Rest Day</span>
            <span className="block text-[10px] text-muted truncate">moves the session</span>
          </span>
        </button>
      </div>
      {note && <SwapNoteRow note={note} onUndo={undo} busy={busy} />}
      {overridden && (
        <button
          type="button"
          disabled={busy}
          onClick={() => clear.mutate(date, { onSuccess: () => !bare && setOpen(false) })}
          className="w-full flex items-center gap-1.5 justify-center text-[11px] text-muted hover:text-text min-h-[32px] disabled:opacity-50"
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" /> Reset to default schedule
        </button>
      )}
    </div>
  )

  if (bare) return <div className={className}>{panel}</div>

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="btn-glass min-h-[40px] text-fluid-xs justify-center"
      >
        <Repeat className="w-3.5 h-3.5" aria-hidden="true" /> Swap Day
      </button>

      {open && panel}
      {!open && note && <div className="mt-2"><SwapNoteRow note={note} onUndo={undo} busy={busy} /></div>}
    </div>
  )
}
