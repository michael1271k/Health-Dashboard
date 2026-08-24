'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Timer, Play, Square, RotateCcw } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { tapLight, tapSuccess } from '@/lib/native/haptics'
import { STEEL, EMERALD, EMBER } from '@/lib/theme/palette'
import {
  getRestClock, getRestClockServerSnapshot, subscribeRestClock,
  startRest, stopRest, setRestTargetSec, restElapsedSec, formatClock,
} from '@/lib/sessions/restClock'

/** The four rests the program actually prescribes — same set as `RestTargetSheet`. */
const PRESETS = [60, 90, 120, 180] as const

/**
 * Rest, counted.
 *
 * ── WHY IT IS A HEADER CONTROL AND NOT A CARD ────────────────────────────────
 * The thing you need from a rest timer is the number, at a glance, while you
 * are looking at the set you are about to do. A panel in the deck would be
 * below the fold by the third exercise — the same reason Finish moved up here
 * and the muscle figure moved out of the commit bar. So the button IS the
 * readout: idle it is an icon, running it is `1:12`, and the digits are the
 * whole interface for the ninety seconds they matter.
 *
 * ── AND WHY IT COUNTS UP, NOT DOWN ───────────────────────────────────────────
 * A countdown that hits zero has to decide what to do next, and every answer is
 * wrong: keep counting down into negatives, freeze at 0:00 and stop telling you
 * anything, or disappear and lose the fact that you are two minutes over. Rest
 * is not a deadline, it is a measurement — so it counts up, and the TARGET is
 * expressed as colour: steel under it, emerald at it, ember past it. You always
 * know both numbers and the display never has to lie.
 *
 * The tick is 1 Hz and runs only while the clock does. Nothing re-renders on a
 * screen with no rest in progress.
 */
export function RestTimer({ size = 'lg' }: {
  /** `lg` matches the hero's 44px targets, `sm` the collapsed bar's 38px ones. */
  size?: 'sm' | 'lg'
}) {
  const clock = useSyncExternalStore(subscribeRestClock, getRestClock, getRestClockServerSnapshot)
  const [open, setOpen] = useState(false)
  const running = clock.startedAt != null

  // One second, and only while something is being counted.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running, clock.startedAt])

  const elapsed = restElapsedSec(clock, now)
  const reached = running && elapsed >= clock.targetSec

  /**
   * The target announces itself once, on the second it is crossed — the moment
   * the information is worth interrupting for. `Causality`: the haptic fires on
   * the crossing, not on the render that noticed it, which is why the guard is
   * a ref and not a piece of state.
   */
  const announced = useRef<number | null>(null)
  useEffect(() => {
    if (!running) { announced.current = null; return }
    if (reached && announced.current !== clock.startedAt) {
      announced.current = clock.startedAt
      void tapSuccess()
    }
  }, [reached, running, clock.startedAt])

  const color = !running ? STEEL : reached ? (elapsed >= clock.targetSec + 30 ? EMBER : EMERALD) : STEEL
  const box = size === 'lg' ? 'min-h-[44px]' : 'min-h-[38px]'

  return (
    <>
      <button
        type="button"
        onPointerDown={() => { void tapLight() }}
        onClick={() => setOpen(true)}
        aria-label={running ? `Rest ${formatClock(elapsed)} of ${formatClock(clock.targetSec)} — open the timer` : 'Rest timer'}
        title={running ? `Resting — target ${formatClock(clock.targetSec)}` : 'Rest timer'}
        className={`shrink-0 ${box} rounded-xl flex items-center justify-center gap-1.5 transition-transform
                    active:scale-95 ${running ? 'px-2.5' : 'w-11'}`}
        style={{
          background: running ? `${color}1f` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${running ? `${color}59` : 'rgba(255,255,255,0.08)'}`,
        }}
      >
        <Timer className="w-4 h-4 shrink-0" style={{ color }} aria-hidden="true" />
        {running && (
          <span className="helix-num font-bold tabular-nums text-[13px] leading-none" style={{ color }}>
            {formatClock(elapsed)}
          </span>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Rest timer" accent={STEEL}>
        <div className="space-y-5 pb-2">
          {/* The readout, at the size it deserves once it has a screen to
              itself. The target sits under it as a fraction rather than as a
              second big number — you are reading one figure and checking it
              against another, not comparing two. */}
          <div className="text-center space-y-1">
            <p
              className="helix-num font-bold tabular-nums leading-none text-[56px]"
              style={{ color }}
              aria-live="off"
            >
              {formatClock(elapsed)}
            </p>
            <p className="text-[11px] text-muted">
              {running
                ? reached ? `Target ${formatClock(clock.targetSec)} reached` : `Target ${formatClock(clock.targetSec)}`
                : `Target ${formatClock(clock.targetSec)} — not running`}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted mb-2">Target</p>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((sec) => {
                const on = clock.targetSec === sec
                return (
                  <button
                    key={sec}
                    type="button"
                    onPointerDown={() => { void tapLight() }}
                    onClick={() => setRestTargetSec(sec)}
                    aria-pressed={on}
                    className="min-h-[44px] rounded-xl text-[13px] font-bold helix-num tabular-nums transition-colors"
                    style={{
                      color: on ? STEEL : 'var(--color-muted)',
                      background: on ? `${STEEL}1f` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${on ? `${STEEL}59` : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    {formatClock(sec)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Start is the primary and it RESTARTS while running, because that is
              what the next set means — you do not stop a rest, you begin the
              following one. Stop is the exception, and it keeps the target. */}
          <div className="flex gap-2">
            <button
              type="button"
              onPointerDown={() => { void tapLight() }}
              onClick={() => startRest()}
              className="flex-1 min-h-[48px] rounded-xl font-bold text-[13px] inline-flex items-center justify-center gap-2"
              style={{
                color: '#fff',
                background: `linear-gradient(150deg, ${EMERALD}dd 0%, ${EMERALD} 100%)`,
                border: `1px solid ${EMERALD}66`,
              }}
            >
              {running ? <><RotateCcw className="w-4 h-4" aria-hidden="true" /> Restart</> : <><Play className="w-4 h-4" aria-hidden="true" /> Start rest</>}
            </button>
            <button
              type="button"
              disabled={!running}
              onPointerDown={() => { void tapLight() }}
              onClick={() => stopRest()}
              className="min-h-[48px] px-4 rounded-xl font-bold text-[13px] inline-flex items-center justify-center gap-2
                         border border-white/[0.10] bg-white/[0.04] text-muted disabled:opacity-40"
            >
              <Square className="w-3.5 h-3.5" aria-hidden="true" /> Stop
            </button>
          </div>

          <p className="text-[11px] text-muted leading-snug">
            The clock is a wall-clock reading, so it keeps counting while the app is
            in the background and survives a reload. It is not written to the
            session — rest is a target you set per movement, on the exercise card.
          </p>
        </div>
      </Sheet>
    </>
  )
}
