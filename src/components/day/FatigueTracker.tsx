'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ZoneRow } from '@/components/ui/Zone'
import { Sheet } from '@/components/ui/Sheet'
import { tapLight } from '@/lib/native/haptics'
import { isTrainingDay } from '@/lib/programs'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import {
  FATIGUE_LEVELS, SLOT_LABEL, fatigueDelta, fatigueLevel, latestFatigue,
  slotsForDay, useFatigue, useLogFatigue, type FatigueSlot,
} from '@/lib/hooks/useFatigue'
import { AMETHYST, MUTED, OXIDE, EMERALD } from '@/lib/theme/palette'

/**
 * Fatigue, three times a day — and two of those three move with the day.
 *
 * ── IT COPIES `DomsTracker` DELIBERATELY ─────────────────────────────────────
 * One `ZoneRow` as the resting state, the real input inside its own local
 * `Sheet`. Same band, same row height, same chevron, same "shape of the day"
 * dots on the right. Two trackers that answer the same kind of question should
 * not be two different controls, and the alternative — a fifth entry in the
 * page's `DaySheet` union — would drag `DAY_SECTIONS` and the widget deep-link
 * parity test along for a surface no widget links to.
 *
 * ── AND WHY WORDS RATHER THAN A SLIDER ───────────────────────────────────────
 * Three readings a day only happen if each costs one tap. A 0–10 slider asks you
 * to invent what 6 versus 7 means, three times daily, and that friction is what
 * turns a tracker into an empty table. Five named steps have one obvious answer
 * — and each now carries a sentence saying what it MEANS, so the answer is the
 * same one in March as it was in August. See `FATIGUE_LEVELS`.
 *
 * ── THE SLOTS COME FROM THE SCHEDULE, WHICH REACT CANNOT SEE ─────────────────
 * `isTrainingDay` reads a synchronous store that the DB fetch replaces after
 * first paint, so `useScheduleVersion()` is a real dependency and not
 * decoration: without it a swap made on another device would leave this tracker
 * asking "Midday" on a day that is now a leg day, and filing the answer under
 * the wrong slot.
 */
export function FatigueTracker({ date }: { date: string }) {
  const [open, setOpen] = useState(false)
  const scheduleVersion = useScheduleVersion()
  const training = useMemo(() => {
    void scheduleVersion   // isTrainingDay reads the store; this is the read
    return isTrainingDay(date)
  }, [date, scheduleVersion])

  const slots = slotsForDay(training)
  const { data: day } = useFatigue(date, training)
  const log = useLogFatigue(date)

  const readings = day ?? {}
  const logged = slots.filter((s) => readings[s] != null)
  const latest = latestFatigue(readings)
  const latestLevel = latest ? fatigueLevel(latest.level) : null
  const delta = fatigueDelta(readings)

  return (
    <>
      <ZoneRow divide={false} asButton onClick={() => setOpen(true)}
        title="Log how you feel"
        className="min-h-[44px] flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted shrink-0">Fatigue</span>
        {latestLevel ? (
          <>
            <span className="text-fluid-xs font-semibold shrink-0" style={{ color: latestLevel.color }}>
              {latestLevel.label}
            </span>
            <span className="text-[11px] text-muted truncate min-w-0">
              {SLOT_LABEL[latest!.slot].toLowerCase()} · {logged.length} of {slots.length}
            </span>
          </>
        ) : (
          <span className="text-fluid-xs text-text/80">Not logged today</span>
        )}
        {/* The session's cost, on the row, on the days it exists — the one
            number this tracker produces that a glance can act on. */}
        {delta != null && <DeltaChip delta={delta} />}
        {/* One dot per slot, in its own level — the shape of the day before any
            of the words are read. An unlogged slot is a hollow ring rather than
            a gap, so the row's width does not change as the day fills in. */}
        <span className="flex items-center gap-1 ml-auto shrink-0" aria-hidden="true">
          {slots.map((s) => {
            const l = fatigueLevel(readings[s])
            return (
              <span key={s} className="w-1.5 h-1.5 rounded-full"
                style={l
                  ? { background: l.color }
                  : { border: '1px solid rgba(255,255,255,0.22)' }} />
            )
          })}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
      </ZoneRow>

      <Sheet open={open} onClose={() => setOpen(false)} title="Fatigue" accent={AMETHYST}>
        <div className="px-1 pb-4 space-y-3">
          {slots.map((slot) => (
            <SlotRow
              key={slot}
              slot={slot}
              value={readings[slot] ?? null}
              onPick={(level) => { void tapLight(); log.mutate({ slot, level }) }}
            />
          ))}

          {/* ── THE SESSION'S COST ────────────────────────────────────────────
              Only ever on a training day, and only once both ends exist: a
              delta computed against a missing reading is a number that looks
              like a measurement and is not one. */}
          {training && (
            <div className="flex items-center gap-2 rounded-xl px-2.5 py-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                Session cost
              </span>
              {delta != null ? (
                <>
                  <DeltaChip delta={delta} />
                  <span className="text-[10px] text-muted/80 truncate min-w-0">
                    {delta > 0 ? 'the session took something out of you'
                      : delta < 0 ? 'you finished fresher than you started'
                        : 'you finished where you started'}
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-muted/70 ml-auto">
                  needs both before and after
                </span>
              )}
            </div>
          )}

          <p className="text-[10px] text-muted/70 leading-snug px-0.5">
            {/* Said once, here, because it is the question everyone asks of a
                tracker: does this move my score. It does not, on purpose. */}
            A record, not an input — fatigue is reported, never scored. Tap a
            chosen level again to clear it; press and hold any level to read what
            it means.
          </p>
        </div>
      </Sheet>
    </>
  )
}

/**
 * The delta, as a signed chip.
 *
 * Green for a session that cost nothing and warm for one that cost a lot, but
 * NEITHER is a grade: taking three levels out of yourself on a heavy squat day
 * is the session working. The colour is a magnitude cue for scanning a row, and
 * the sentence beside it in the sheet is what actually says what happened.
 */
function DeltaChip({ delta }: { delta: number }) {
  const color = delta >= 2 ? OXIDE : delta <= 0 ? EMERALD : MUTED
  return (
    <span className="helix-num text-[11px] font-bold tabular-nums shrink-0 px-1.5 py-0.5 rounded-md"
      style={{ color, background: `${color}1a`, border: `1px solid ${color}40` }}
      title="After training minus before training">
      {delta > 0 ? '+' : delta < 0 ? '−' : '±'}{Math.abs(delta)}
    </span>
  )
}

function SlotRow({ slot, value, onPick }: {
  slot: FatigueSlot
  value: number | null
  onPick: (level: number | null) => void
}) {
  /**
   * The level whose sentence is currently being READ rather than chosen.
   *
   * A press-and-hold, not a tap: the tap is the whole interaction budget this
   * control has, and spending it on "explain yourself" would mean the sentence
   * could only ever be reached by selecting a level you did not mean. Holding is
   * the gesture iOS already uses for "tell me more about this thing" and it
   * costs the tap nothing.
   */
  const [preview, setPreview] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef(false)

  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setPreview(null)
  }, [])
  // A hold that ends with the finger off the control still has to clear, and a
  // component unmounted mid-hold must not leave a timer behind.
  useEffect(() => cancel, [cancel])

  const shown = fatigueLevel(preview ?? value)

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5 px-0.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted shrink-0">
          {SLOT_LABEL[slot]}
        </span>
        {/* ── THE SENTENCE, NOT THE ADJECTIVE ──────────────────────────────
            One line, right-aligned, showing what the CHOSEN level means — or
            what a held one would mean. `min-h` reserves its height so the chip
            grid below does not jump as the text appears and disappears. */}
        <span className="text-[10px] ml-auto text-right leading-snug min-h-[13px] min-w-0"
          style={{ color: shown?.color ?? MUTED, opacity: preview != null ? 0.85 : 1 }}>
          {shown?.detail ?? 'not logged'}
        </span>
      </div>
      <div role="radiogroup" aria-label={`${SLOT_LABEL[slot]} fatigue`} className="grid grid-cols-5 gap-1">
        {FATIGUE_LEVELS.map((l) => {
          const on = value === l.value
          return (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={on}
              // The sentence is the accessible name's description too: a screen
              // reader gets the definition without needing the hold gesture.
              aria-label={`${l.label} — ${l.detail}`}
              title={l.detail}
              onPointerDown={() => {
                held.current = false
                timer.current = setTimeout(() => { held.current = true; setPreview(l.value) }, 350)
              }}
              onPointerUp={cancel}
              onPointerLeave={cancel}
              onPointerCancel={cancel}
              // A hold is a read, never a write — otherwise letting go of an
              // explanation would silently log it.
              onClick={() => { if (!held.current) onPick(on ? null : l.value) }}
              className="min-h-[44px] rounded-xl px-1 flex items-center justify-center
                         active:scale-95 transition-transform select-none touch-manipulation"
              style={{
                background: on ? `${l.color}24` : preview === l.value ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${on ? `${l.color}8c` : 'rgba(255,255,255,0.08)'}`,
                color: on ? l.color : undefined,
              }}
            >
              <span className={`text-[11px] font-bold leading-none ${on ? '' : 'text-muted'}`}>
                {l.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
