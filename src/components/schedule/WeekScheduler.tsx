'use client'

import { useMemo, useState } from 'react'
import { Moon, Check, ArrowRight, RotateCcw, AlertTriangle } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { activeProgram, scheduleDayFor, type ProgramDay } from '@/lib/programs'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { useWeekSessions } from '@/lib/hooks/useWeekSessions'
import { useSwapDay } from '@/lib/hooks/useScheduleOverrides'
import {
  useProgramLayouts, usePermanentMove, useResetProgramLayout,
  previewPermanentMove, currentDateForDay, isLayoutCustomised,
} from '@/lib/hooks/useProgramLayout'
import { blockForPlacement, describeBlock, shortDayLabel, dateForWeekday, weekDatesOf, type LoggedDay } from '@/lib/schedule/swap'
import { weekStartOf } from '@/lib/utils/week'
import { logicalTodayISO } from '@/lib/utils/day'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { MUTED, EMERALD, GOLD, EMBER_DEEP } from '@/lib/theme/palette'

const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * The training week, and the way to rearrange it.
 *
 * ── WHY THIS REPLACED THE OLD "WEEK PLAN" CARD ───────────────────────────────
 * That card listed `program.days` by their AUTHORED weekday. It was therefore
 * blind to every swap the user had made — the one screen whose whole job is to
 * say what the week looks like was the one screen showing the plan as written
 * rather than as run. Every cell here resolves through `scheduleDayFor`, so
 * per-date overrides, the permanent layout, and the era are all already correct.
 *
 * ── WHY IT STARTS WHERE SETTINGS SAYS ────────────────────────────────────────
 * `weekStartOf` has honoured "Week starts on" since it was written; the old card
 * simply never asked. Sunday or Monday, this reads the same preference the
 * reports and the weekly export do.
 *
 * ── WHY TAP AND NOT DRAG ─────────────────────────────────────────────────────
 * dnd-kit's sortable model is a REORDER: dropping Tuesday onto Thursday rotates
 * everything between them, quietly moving two days you never touched. What this
 * feature means by "swap" is an EXCHANGE — the two days trade slots and nothing
 * else moves — which is the rule `planDaySwap` and `moveDay` both implement and
 * the reason a rest day re-homes its session instead of deleting it. A gesture
 * that silently contradicts the model underneath it is worse than a tap, however
 * good it feels. Tapping also states the consequence before anything happens,
 * which a drop cannot.
 */
export function WeekScheduler() {
  void useScheduleVersion()          // the whole grid is synchronous cache reads
  useProgramLayouts()                // hydrates the permanent layout store

  const today = logicalTodayISO()
  const weekStart = weekStartOf(today)
  const { data: week } = useWeekSessions(weekStart)
  const [moving, setMoving] = useState<ProgramDay | null>(null)

  const program = activeProgram()
  const dates = useMemo(() => weekDatesOf(weekStart), [weekStart])

  const logged: LoggedDay[] = useMemo(
    () => (week?.sessions ?? []).map((s) => ({ date: s.date, dayKey: s.dayKey })),
    [week],
  )
  const loggedByDate = useMemo(() => new Map(logged.map((l) => [l.date, l])), [logged])

  const reset = useResetProgramLayout()
  const customised = isLayoutCustomised()

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-1.5 divide-y divide-white/[0.05]">
        {dates.map((date) => {
          const schedule = scheduleDayFor(date)
          const day = schedule === 'rest' ? null : program.days.find((d) => d.key === schedule.dayKey) ?? null
          const isToday = date === today
          const isPast = date < today
          const done = loggedByDate.get(date)
          const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()

          return (
            <button
              key={date}
              type="button"
              // A rest day has nothing to move. Tapping a logged day opens the
              // sheet anyway — it will explain why it can't move, which is more
              // useful than a control that does nothing.
              disabled={!day}
              onClick={() => day && setMoving(day)}
              onPointerUp={blurOnTap}
              className="w-full flex items-center gap-2 px-2 py-2 text-left min-h-[44px] disabled:opacity-100 disabled:cursor-default"
              style={{ background: isToday ? `${day?.color ?? MUTED}0f` : undefined, borderRadius: 8 }}
            >
              <span className="w-9 shrink-0">
                <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: isToday ? (day?.color ?? MUTED) : MUTED }}>
                  {WD_SHORT[weekday]}
                </span>
                <span className="block text-[9px]" style={{ color: MUTED }}>{date.slice(8)}</span>
              </span>

              {day ? (
                <>
                  <span className="w-1 h-5 rounded-full shrink-0" style={{ background: day.color }} aria-hidden="true" />
                  <span className="split-label font-bold text-fluid-sm truncate" style={{ color: day.color }}>{day.label}</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 shrink-0" style={{ color: EMBER_DEEP }} aria-hidden="true" />
                  <span className="text-fluid-sm font-semibold" style={{ color: EMBER_DEEP }}>Rest</span>
                </>
              )}

              <span className="ml-auto flex items-center gap-1.5 shrink-0">
                {done && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: EMERALD }}>
                    <Check className="w-3 h-3" aria-hidden="true" /> Logged
                  </span>
                )}
                {!done && isPast && day && (
                  <span className="text-[10px]" style={{ color: MUTED }}>missed</span>
                )}
                {isToday && (
                  <span className="text-[9px] px-1 rounded font-bold"
                    style={{ color: day?.color ?? MUTED, background: `${day?.color ?? MUTED}22` }}>
                    TODAY
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {customised && (
        <button
          type="button"
          disabled={reset.isPending}
          onClick={() => reset.mutate()}
          className="w-full flex items-center gap-1.5 justify-center text-[11px] min-h-[36px] disabled:opacity-50"
          style={{ color: MUTED }}
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
          {reset.isPending ? 'Restoring…' : `Restore ${program.label} to its authored week`}
        </button>
      )}

      <MoveDaySheet day={moving} onClose={() => setMoving(null)} logged={logged} today={today} />
    </div>
  )
}

/**
 * "Where should this go?" — a destination, then a scope, each stating what it
 * will do before it does it.
 *
 * Two steps rather than one grid of fourteen buttons: the destination is a
 * spatial question and the scope is a commitment question, and answering both at
 * once is how you end up permanently rewriting a plan you meant to nudge.
 */
function MoveDaySheet({ day, onClose, logged, today }: {
  day: ProgramDay | null
  onClose: () => void
  logged: readonly LoggedDay[]
  today: string
}) {
  const [weekday, setWeekday] = useState<number | null>(null)
  const swap = useSwapDay()
  const permanent = usePermanentMove()
  const program = activeProgram()

  const close = () => { setWeekday(null); onClose() }
  const sourceDate = day ? currentDateForDay(day.key, today) : null
  const targetDate = weekday != null ? dateForWeekday(today, weekday) : null

  const labelFor = (key: string | null) =>
    program.days.find((d) => d.key === key)?.label ?? 'That session'

  const block = day && targetDate
    ? blockForPlacement(targetDate, day.key, logged, sourceDate)
    : null

  // The permanent plan is previewed, never guessed at: it is the only thing that
  // knows which of this week's days are already spent and will be pinned.
  const plan = day && weekday != null && !block ? previewPermanentMove(day.key, weekday, logged) : null
  const busy = swap.isPending || permanent.isPending

  return (
    <Sheet open={!!day} onClose={close} title={day ? `Move ${day.label}` : 'Move'} accent={day?.color}>
      {!day ? null : weekday == null ? (
        <>
          <p className="text-fluid-xs mb-3" style={{ color: MUTED }}>
            Currently {sourceDate ? shortDayLabel(sourceDate) : WD_LONG[day.weekday]}. Where should it go?
          </p>
          <div className="space-y-1">
            {WD_LONG.map((name, wd) => {
              const date = dateForWeekday(today, wd)
              const there = scheduleDayFor(date)
              const occupant = there === 'rest' ? null : program.days.find((d) => d.key === there.dayKey)
              const isCurrent = date === sourceDate
              return (
                <button
                  key={wd}
                  type="button"
                  disabled={isCurrent || busy}
                  onClick={() => setWeekday(wd)}
                  onPointerUp={blurOnTap}
                  className="w-full flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left min-h-[48px] hover:bg-white/[0.05] disabled:opacity-40 transition-colors"
                >
                  <span className="text-fluid-sm font-semibold text-text w-24 shrink-0">{name}</span>
                  {occupant ? (
                    <span className="text-[11px] truncate" style={{ color: occupant.color }}>{occupant.label}</span>
                  ) : (
                    <span className="text-[11px]" style={{ color: EMBER_DEEP }}>Rest</span>
                  )}
                  {isCurrent && <span className="ml-auto text-[10px] shrink-0" style={{ color: MUTED }}>current</span>}
                  {!isCurrent && <ArrowRight className="w-3.5 h-3.5 ml-auto shrink-0" style={{ color: MUTED }} aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </>
      ) : block ? (
        <>
          <div className="flex items-start gap-2 rounded-xl border px-3 py-2.5"
            style={{ borderColor: `${GOLD}33`, background: `${GOLD}0f` }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: GOLD }} aria-hidden="true" />
            <span className="text-[11px] text-text/90">{describeBlock(block, labelFor)}</span>
          </div>
          <p className="text-[11px] mt-2 leading-snug" style={{ color: MUTED }}>
            A logged session keeps its own identity whatever the calendar says, so moving the plan
            around it would leave the week counting work that was never done — or counting it twice.
          </p>
          <button type="button" onClick={() => setWeekday(null)}
            className="btn-glass w-full justify-center min-h-[44px] mt-4">Pick another day</button>
        </>
      ) : (
        <>
          <p className="text-fluid-xs mb-3" style={{ color: MUTED }}>
            {day.label} → {targetDate ? shortDayLabel(targetDate) : WD_LONG[weekday]}
          </p>

          <button
            type="button"
            disabled={busy || !targetDate}
            onPointerUp={blurOnTap}
            onClick={() => targetDate && swap.mutate({ date: targetDate, dayKey: day.key }, { onSuccess: close })}
            className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3 text-left hover:bg-white/[0.05] disabled:opacity-50 transition-colors"
          >
            <span className="block text-fluid-sm font-semibold text-text">Just this week</span>
            <span className="block text-[11px] mt-0.5" style={{ color: MUTED }}>
              An exchange — whatever is on {targetDate ? shortDayLabel(targetDate) : 'that day'} takes
              {sourceDate ? ` ${shortDayLabel(sourceDate)}` : ' this slot'}. Next week is untouched.
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onPointerUp={blurOnTap}
            onClick={() => permanent.mutate({ dayKey: day.key, weekday, logged }, { onSuccess: close })}
            className="w-full rounded-xl border px-3 py-3 text-left mt-2 disabled:opacity-50 transition-colors"
            style={{ borderColor: `${day.color}44`, background: `${day.color}0d` }}
          >
            <span className="block text-fluid-sm font-semibold" style={{ color: day.color }}>Every week from now on</span>
            <span className="block text-[11px] mt-0.5" style={{ color: MUTED }}>
              Changes the plan itself.
              {plan?.pinned.length
                ? ` ${plan.pinned.map(shortDayLabel).join(', ')} already happened, so ${plan.pinned.length === 1 ? 'it stays' : 'they stay'} as ${plan.pinned.length === 1 ? 'it was' : 'they were'}.`
                : ' It takes effect from today.'}
            </span>
          </button>

          {(swap.isError || permanent.isError) && (
            <p className="text-danger text-fluid-xs mt-3" role="alert">
              {(swap.error ?? permanent.error) instanceof Error
                ? ((swap.error ?? permanent.error) as Error).message
                : 'Could not save the change'}
            </p>
          )}

          <button type="button" onClick={() => setWeekday(null)} disabled={busy}
            className="w-full text-[11px] min-h-[40px] mt-1 disabled:opacity-50" style={{ color: MUTED }}>
            Back
          </button>
        </>
      )}
    </Sheet>
  )
}
