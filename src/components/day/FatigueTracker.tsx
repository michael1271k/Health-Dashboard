'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ZoneRow } from '@/components/ui/Zone'
import { Sheet } from '@/components/ui/Sheet'
import { tapLight } from '@/lib/native/haptics'
import {
  FATIGUE_LEVELS, FATIGUE_SLOTS, SLOT_LABEL, fatigueLevel, latestFatigue,
  useFatigue, useLogFatigue, type FatigueSlot,
} from '@/lib/hooks/useFatigue'
import { AMETHYST, MUTED } from '@/lib/theme/palette'

/**
 * Fatigue, four times a day.
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
 * Four readings a day only happen if each costs one tap. A 0–10 slider asks you
 * to invent what 6 versus 7 means, four times daily, and that friction is what
 * turns a tracker into an empty table. Five named steps have one obvious answer.
 */
export function FatigueTracker({ date }: { date: string }) {
  const [open, setOpen] = useState(false)
  const { data: day } = useFatigue(date)
  const log = useLogFatigue(date)

  const readings = day ?? {}
  const logged = FATIGUE_SLOTS.filter((s) => readings[s] != null)
  const latest = latestFatigue(readings)
  const latestLevel = latest ? fatigueLevel(latest.level) : null

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
              {SLOT_LABEL[latest!.slot].toLowerCase()} · {logged.length} of 4 logged
            </span>
          </>
        ) : (
          <span className="text-fluid-xs text-text/80">Not logged today</span>
        )}
        {/* One dot per slot, in its own level — the shape of the day before any
            of the words are read. An unlogged slot is a hollow ring rather than
            a gap, so the row's width does not change as the day fills in. */}
        <span className="flex items-center gap-1 ml-auto shrink-0" aria-hidden="true">
          {FATIGUE_SLOTS.map((s) => {
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
          {FATIGUE_SLOTS.map((slot) => (
            <SlotRow
              key={slot}
              slot={slot}
              value={readings[slot] ?? null}
              onPick={(level) => { void tapLight(); log.mutate({ slot, level }) }}
            />
          ))}
          <p className="text-[10px] text-muted/70 leading-snug px-0.5">
            {/* Said once, here, because it is the question everyone asks of a
                tracker: does this move my score. It does not, on purpose. */}
            A record, not an input — fatigue is reported, never scored. Tap a
            chosen level again to clear it.
          </p>
        </div>
      </Sheet>
    </>
  )
}

function SlotRow({ slot, value, onPick }: {
  slot: FatigueSlot
  value: number | null
  onPick: (level: number | null) => void
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5 px-0.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
          {SLOT_LABEL[slot]}
        </span>
        <span className="text-[10px] ml-auto" style={{ color: fatigueLevel(value)?.color ?? MUTED }}>
          {fatigueLevel(value)?.hint ?? 'not logged'}
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
              title={l.hint}
              onClick={() => onPick(on ? null : l.value)}
              className="min-h-[44px] rounded-xl px-1 flex items-center justify-center
                         active:scale-95 transition-transform"
              style={{
                background: on ? `${l.color}24` : 'rgba(255,255,255,0.03)',
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
