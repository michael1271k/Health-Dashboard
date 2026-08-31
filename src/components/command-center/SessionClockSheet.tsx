'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { m } from 'framer-motion'
import { Timer as TimerIcon, Play, Pause, Square, RotateCcw, Minus, Plus } from 'lucide-react'
import { SheetMenuRow } from './SheetMenuRow'
import { Sheet } from '@/components/ui/Sheet'
import { tapLight, tapSuccess } from '@/lib/native/haptics'
import { SNAPPY } from '@/lib/motion/springs'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'
import { useVisibleInterval } from '@/lib/hooks/useVisibleInterval'
import { STEEL, EMERALD, EMERALD_DEEP, EMBER, OXIDE, MUTED } from '@/lib/theme/palette'
import {
  DURATION_STEP_SEC, MAX_DURATION_SEC, MIN_DURATION_SEC,
  clockIsLive, clockReadingSec, elapsedMs, formatClock, getSessionClock,
  getSessionClockServerSnapshot, isTimerDone, pauseClock, resetClock,
  setClockMode, setDurationSec, startClock, subscribeSessionClock,
  type ClockMode, type SessionClock,
} from '@/lib/sessions/sessionClock'

/**
 * The session clock: a countdown and a stopwatch behind one button.
 *
 * ── WHY IT IS A HEADER CONTROL AND NOT A CARD ────────────────────────────────
 * The thing you need from a rest timer is the number, at a glance, while you
 * are looking at the set you are about to do. A panel in the deck would be
 * below the fold by the third exercise — the same reason Finish moved up here
 * and the muscle figure moved out of the commit bar. So the button IS the
 * readout: idle it is an icon, running it is `1:12`, and the digits are the
 * whole interface for the ninety seconds they matter.
 *
 * ── WHY TWO TABS AND NOT ONE MODE ────────────────────────────────────────────
 * This control used to be a count-up rest clock with a preset target, and its
 * own header argued that a rest must never count down: a countdown that hits
 * zero has to decide what to do next, and every answer is wrong when what you
 * are measuring is REST, which is a measurement and not a deadline.
 *
 * The argument holds and it is an argument about rest, not about clocks. So the
 * count-up became the Stopwatch — the same semantics with no target left to lie
 * about — and beside it sits a Timer you set deliberately, where zero means the
 * thing you asked for has happened and `Done` is the true answer. Two questions
 * that were being answered by one control that could only be right about one of
 * them. Rest as a PRESCRIPTION never lived here anyway: it is
 * `ProgramExercise.restSec`, edited on the exercise card (see `rest-is-a-target`).
 *
 * ── AND WHY THE BUTTONS SIT WHERE iOS PUTS THEM ──────────────────────────────
 * Green starts, red stops, grey resets, and a stopped stopwatch offers Reset and
 * Start rather than one button that changes meaning. `apple-design` §4 on
 * familiarity: things that look the same must behave the same, and this is the
 * one screen in the app whose exact equivalent is already on every phone that
 * runs it.
 */
export function SessionClock({ size = 'lg', variant = 'button' }: {
  /** `lg` matches the hero's 44px targets, `sm` the collapsed bar's 38px ones. */
  size?: 'sm' | 'lg'
  /**
   * `button` is the 44px icon control; `row` is a labelled row inside the
   * session menu.
   *
   * The clock left the header when it was carrying five things at once — a
   * title, an overflow menu, a stopwatch, an elapsed tile and a muscle figure —
   * and the two it kept are the two you read rather than the two you press. A
   * `row` renders its own sheet as a STACKED layer, so opening it leaves the
   * menu standing underneath and closing it returns you there.
   */
  variant?: 'button' | 'row'
}) {
  const clock = useSyncExternalStore(subscribeSessionClock, getSessionClock, getSessionClockServerSnapshot)
  const [open, setOpen] = useState(false)
  const running = clock.startedAt != null

  /**
   * One second, only while something is being counted, and only while the app
   * is on screen.
   *
   * It was 250 ms with no visibility gate. The readout is `mm:ss`, so three of
   * every four ticks changed nothing and re-rendered this header anyway — and
   * because `LiveSessionBar` and `LiveSessionHero` keep it mounted for the
   * whole workout, that ran at 4 Hz for the whole workout, pocket included.
   * `useVisibleInterval` resyncs on the way back, so a throttled or dropped
   * background timer cannot leave the number behind.
   */
  const [now, setNow] = useState(() => Date.now())
  useVisibleInterval(() => setNow(Date.now()), 1000, running)

  const done = isTimerDone(clock, now)
  const live = clockIsLive(clock)
  const reading = clockReadingSec(clock, now)

  /**
   * The countdown announces itself once, on the second it runs out — the moment
   * the information is worth interrupting for. `Causality`: the haptic fires on
   * the crossing, not on the render that noticed it, which is why the guard is
   * a ref and not a piece of state.
   */
  const announced = useRef<number | null>(null)
  useEffect(() => {
    if (!running) { if (!live) announced.current = null; return }
    if (done && announced.current !== clock.startedAt) {
      announced.current = clock.startedAt
      void tapSuccess()
      // Nothing else to count. Bank the reading so the sheet can say `Done`
      // without the number sliding on past zero behind it.
      pauseClock()
    }
  }, [done, running, live, clock.startedAt])

  const color = clock.mode === 'stopwatch'
    ? (running ? EMERALD : STEEL)
    : done ? EMBER : running ? EMERALD : STEEL
  const box = size === 'lg' ? 'min-h-[44px]' : 'min-h-[38px]'
  const showDigits = live

  if (variant === 'row') {
    return (
      <>
        <SheetMenuRow
          icon={<TimerIcon className="w-4 h-4" aria-hidden="true" />}
          label="Rest timer"
          hint={live
            ? `${clock.mode === 'timer' ? 'Timer' : 'Stopwatch'} running · ${formatClock(reading)}`
            : 'Count a rest down, or a hold up'}
          accent={color}
          onClick={() => setOpen(true)}
        />
        <Sheet open={open} onClose={() => setOpen(false)} title="Clock" accent={color} layer="stacked">
          <ClockBody clock={clock} now={now} color={color} done={done} />
        </Sheet>
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onPointerDown={() => { void tapLight() }}
        onClick={() => setOpen(true)}
        aria-label={showDigits
          ? `${clock.mode === 'timer' ? 'Timer' : 'Stopwatch'} ${formatClock(reading)} — open the clock`
          : 'Timer and stopwatch'}
        title={showDigits ? `${clock.mode === 'timer' ? 'Timer' : 'Stopwatch'} · ${formatClock(reading)}` : 'Timer and stopwatch'}
        className={`shrink-0 ${box} rounded-xl flex items-center justify-center gap-1.5 transition-transform
                    active:scale-95 ${showDigits ? 'px-2.5' : 'w-11'}`}
        style={{
          background: showDigits ? `${color}1f` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${showDigits ? `${color}59` : 'rgba(255,255,255,0.08)'}`,
        }}
      >
        <TimerIcon className="w-4 h-4 shrink-0" style={{ color }} aria-hidden="true" />
        {showDigits && (
          <span className="helix-num font-bold tabular-nums text-[13px] leading-none" style={{ color }}>
            {formatClock(reading)}
          </span>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Clock" accent={color}>
        <ClockBody clock={clock} now={now} color={color} done={done} />
      </Sheet>
    </>
  )
}

/**
 * The sheet's contents.
 *
 * Split out so the sheet's subtree re-renders on the tick and the header button
 * does not have to hold the whole panel in scope — and so the two tabs share one
 * dial rather than two implementations of the same circle.
 */
function ClockBody({ clock, now, color, done }: {
  clock: SessionClock
  now: number
  color: string
  done: boolean
}) {
  const running = clock.startedAt != null
  const live = clockIsLive(clock)
  const isTimer = clock.mode === 'timer'
  const reading = clockReadingSec(clock, now)

  // Fraction of the countdown consumed. The stopwatch has no end, so its dial
  // is the SECOND hand — one lap a minute — rather than a progress bar with no
  // destination, which would either stay empty forever or lie about one.
  const progress = isTimer
    ? Math.min(1, elapsedMs(clock, now) / Math.max(1, clock.durationSec * 1000))
    : (elapsedMs(clock, now) % 60_000) / 60_000

  return (
    <div className="space-y-5 pb-2">
      <ModeTabs mode={clock.mode} />

      <Dial value={reading} progress={progress} color={color} spin={!isTimer && running}>
        <p className="text-[11px] text-muted mt-1.5">
          {isTimer
            ? done ? 'Done' : running ? `of ${formatClock(clock.durationSec)}` : `${formatClock(clock.durationSec)} timer`
            : running ? 'Running' : live ? 'Stopped' : 'Ready'}
        </p>
      </Dial>

      {isTimer ? <TimerControls clock={clock} running={running} done={done} live={live} />
        : <StopwatchControls running={running} live={live} />}

      <p className="text-[11px] text-muted leading-snug">
        The clock is a wall-clock reading, so it keeps counting while the app is in
        the background and survives a reload. It is not written to the session —
        rest is a target you set per movement, on the exercise card.
      </p>
    </div>
  )
}

/**
 * Timer · Stopwatch.
 *
 * A real segmented control rather than two buttons: the sliding indicator is
 * what tells you the two are alternatives rather than actions, and it is the
 * one element on the sheet that moves without being a number.
 */
function ModeTabs({ mode }: { mode: ClockMode }) {
  const reduce = useHelixReducedMotion()
  const items: Array<{ id: ClockMode; label: string }> = [
    { id: 'timer', label: 'Timer' },
    { id: 'stopwatch', label: 'Stopwatch' },
  ]
  return (
    <div
      role="tablist"
      aria-label="Clock mode"
      className="relative grid grid-cols-2 gap-1 p-1 rounded-2xl"
      style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {items.map((it) => {
        const on = mode === it.id
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={on}
            onPointerDown={() => { void tapLight() }}
            onClick={() => setClockMode(it.id)}
            className="relative min-h-[38px] rounded-xl text-[13px] font-bold transition-colors"
            style={{ color: on ? 'var(--color-text)' : 'var(--color-muted)' }}
          >
            {on && (
              <m.span
                layoutId="clock-tab"
                aria-hidden="true"
                className="absolute inset-0 rounded-xl -z-10"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)' }}
                transition={reduce ? { duration: 0 } : SNAPPY}
              />
            )}
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The readout, at the size it deserves once it has a screen to itself, inside
 * the ring that says how much of it is left.
 *
 * SVG rather than a conic gradient: a `stroke-dashoffset` is one animatable
 * number and it lands on the compositor, where a repainted conic gradient does
 * not. `preserveAspectRatio` is left alone and the box is square, so the ring
 * cannot go oval on a wide phone.
 */
function Dial({ value, progress, color, spin, children }: {
  value: number
  progress: number
  color: string
  /** Stopwatch: the ring is a sweeping second hand, not a fill. */
  spin?: boolean
  children?: React.ReactNode
}) {
  const R = 46
  const C = 2 * Math.PI * R
  return (
    <div className="relative mx-auto w-[220px] h-[220px] flex flex-col items-center justify-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />
        <circle
          cx="50" cy="50" r={R} fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={spin ? `${C * 0.18} ${C}` : C}
          strokeDashoffset={spin ? C * (1 - progress) : C * progress}
          style={{ transition: 'stroke-dashoffset 240ms linear' }}
        />
      </svg>
      <p
        className="helix-num font-bold tabular-nums leading-none text-[52px]"
        style={{ color }}
        // Not a live region: it changes every second, and a screen reader
        // announcing a stopwatch four times a second is the definition of
        // over-feedback. The button's own label carries the reading on demand.
        aria-live="off"
      >
        {formatClock(value)}
      </p>
      {children}
    </div>
  )
}

/**
 * −15s · +15s · Start.
 *
 * The two steppers flank the duration because that is where a value's
 * decrement and increment belong — the same arrangement the set tuner uses, at
 * the size a primary control deserves. They are hidden while the countdown is
 * running: changing the length of a timer mid-flight can only mean restarting
 * it, and a control that silently does something other than what it says is
 * worse than one that is not there.
 */
function TimerControls({ clock, running, done, live }: {
  clock: SessionClock
  running: boolean
  done: boolean
  live: boolean
}) {
  const step = (delta: number) => {
    void tapLight()
    setDurationSec(clock.durationSec + delta)
  }
  return (
    <div className="space-y-3">
      {!live && (
        <div className="flex items-center gap-2">
          <StepButton
            label={`− ${DURATION_STEP_SEC}s`}
            ariaLabel={`${DURATION_STEP_SEC} seconds less`}
            onClick={() => step(-DURATION_STEP_SEC)}
            disabled={clock.durationSec <= MIN_DURATION_SEC}
          />
          <StepButton
            label={`+ ${DURATION_STEP_SEC}s`}
            ariaLabel={`${DURATION_STEP_SEC} seconds more`}
            onClick={() => step(+DURATION_STEP_SEC)}
            disabled={clock.durationSec >= MAX_DURATION_SEC}
          />
        </div>
      )}

      <div className="flex gap-2">
        {live && (
          <BigButton
            tone="neutral"
            icon={<RotateCcw className="w-4 h-4" aria-hidden="true" />}
            label="Reset"
            onClick={() => { void tapLight(); resetClock() }}
          />
        )}
        {running ? (
          <BigButton
            tone="stop"
            icon={<Pause className="w-4 h-4" aria-hidden="true" />}
            label="Pause"
            onClick={() => { void tapLight(); pauseClock() }}
          />
        ) : (
          <BigButton
            tone="go"
            icon={<Play className="w-4 h-4" aria-hidden="true" />}
            // A finished countdown has nothing left to resume, so the primary
            // starts a fresh one rather than offering to continue past zero.
            label={done ? 'Start again' : live ? 'Resume' : 'Start'}
            onClick={() => { void tapLight(); if (done) resetClock(); startClock('timer') }}
          />
        )}
      </div>
    </div>
  )
}

/** Start · Stop, and Reset beside Start once there is something to reset. */
function StopwatchControls({ running, live }: { running: boolean; live: boolean }) {
  return (
    <div className="flex gap-2">
      {!running && live && (
        <BigButton
          tone="neutral"
          icon={<RotateCcw className="w-4 h-4" aria-hidden="true" />}
          label="Reset"
          onClick={() => { void tapLight(); resetClock() }}
        />
      )}
      {running ? (
        <BigButton
          tone="stop"
          icon={<Square className="w-3.5 h-3.5" aria-hidden="true" />}
          label="Stop"
          onClick={() => { void tapLight(); pauseClock() }}
        />
      ) : (
        <BigButton
          tone="go"
          icon={<Play className="w-4 h-4" aria-hidden="true" />}
          label={live ? 'Resume' : 'Start'}
          onClick={() => { void tapLight(); startClock('stopwatch') }}
        />
      )}
    </div>
  )
}

/** One of the ±15s pills. Half the row each, 48px tall — this is the primary
 *  interaction of the Timer tab before it is running. */
function StepButton({ label, ariaLabel, onClick, disabled }: {
  label: string
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex-1 min-h-[48px] rounded-xl font-bold text-[14px] helix-num tabular-nums
                 inline-flex items-center justify-center gap-1.5 text-text
                 border border-white/[0.10] bg-white/[0.05] active:scale-95
                 transition-transform disabled:opacity-35 disabled:active:scale-100"
    >
      {label.startsWith('−')
        ? <Minus className="w-3.5 h-3.5" aria-hidden="true" />
        : <Plus className="w-3.5 h-3.5" aria-hidden="true" />}
      {label.slice(2)}
    </button>
  )
}

/**
 * The primary. Green go, red stop, grey reset — the platform's own colours for
 * these three verbs, because this control's exact equivalent is already on the
 * phone and disagreeing with it would be a decision that costs the user and
 * buys nothing.
 */
function BigButton({ tone, icon, label, onClick }: {
  tone: 'go' | 'stop' | 'neutral'
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  const style = tone === 'go'
    ? { color: '#fff', background: `linear-gradient(150deg, ${EMERALD} 0%, ${EMERALD_DEEP} 100%)`, border: `1px solid ${EMERALD}66`, boxShadow: `0 0 18px ${EMERALD}3d` }
    : tone === 'stop'
      ? { color: '#fff', background: `linear-gradient(150deg, ${OXIDE} 0%, ${OXIDE}c4 100%)`, border: `1px solid ${OXIDE}66`, boxShadow: `0 0 18px ${OXIDE}3d` }
      : { color: MUTED, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 min-h-[52px] rounded-2xl font-bold text-[14px] inline-flex items-center
                 justify-center gap-2 active:scale-[0.98] transition-transform"
      style={style}
    >
      {icon}{label}
    </button>
  )
}
