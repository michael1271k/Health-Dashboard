'use client'

import { ArrowLeftRight, Trash2 } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Segmented } from '@/components/ui/Segmented'
import { tapLight } from '@/lib/native/haptics'

/** The four mutually exclusive things a set can be. Mirrors `DraftSet.setType`. */
export type SetTypeValue = 'normal' | 'warmup' | 'failure' | 'dropset'

const ORANGE = '#E0703C' // warm-up
const DANGER = '#C4514E' // failure
const DROP = '#9A6DD7'   // drop set

/**
 * Everything you do to a set that is not its two numbers.
 *
 * ── WHY IT LEFT THE ROW ──────────────────────────────────────────────────────
 * The expanded tuner was about 250px tall for one set. Roughly 90px of that was
 * spent on three controls you touch a handful of times a session: a four-segment
 * set-type picker that is `Normal` on twenty-three sets out of twenty-four, a
 * Split L/R offered on every unilateral row whether or not you intend to split
 * it, and a Remove.
 *
 * They are not less important — they are less FREQUENT, and a control's
 * permanent height should be paid for by how often it is reached, not by how
 * much it matters when it is. So they moved behind the one thing that is always
 * on screen and had nothing to do: the set's own badge.
 *
 * ── AND WHY THE BADGE IS THE TRIGGER ─────────────────────────────────────────
 * The badge already SHOWS the set's type — `W`, `F`, `D`, or the ordinal. A
 * control that displays a value is the obvious place to change it, and it costs
 * no new pixels because the box was already drawn.
 *
 * The row's other tap target, the trophy on the second line, keeps opening
 * `PrRecordSheet`. Two targets, two jobs, and neither is a long-press.
 */
export function SetActionSheet({
  open, onClose, setLabel, value, onPick, onSplit, onRemove,
}: {
  open: boolean
  onClose: () => void
  /** "Set 3", "Set 3 · Left" — names what the sheet is about to change. */
  setLabel: string
  value: SetTypeValue
  onPick: (choice: SetTypeValue) => void
  /** Unilateral movements only — absent on a bilateral lift and on a sub-row. */
  onSplit?: () => void
  onRemove: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={setLabel}>
      <div className="space-y-3 pb-2">
        <div>
          <span className="block mb-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-muted/60">
            Set type
          </span>
          {/* FOUR SEGMENTS, AND ONE OF THEM IS "NORMAL". These are mutually
              exclusive and the null state is a real choice — it used to be the
              absence of three separate toggles, which meant the control could
              not show you what the set currently IS, only what it is not.

              Picking does NOT close the sheet: changing a set to a warm-up and
              then wanting to split it is one errand, and a sheet that dismisses
              on the first tap makes it two. */}
          <Segmented
            fluid
            size="sm"
            label={`Set type for ${setLabel}`}
            value={value}
            onChange={onPick}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'warmup', label: 'Warm-up', color: ORANGE },
              { value: 'failure', label: 'Failure', color: DANGER },
              { value: 'dropset', label: 'Drop', color: DROP, title: 'Drop set' },
            ]}
          />
        </div>

        {/* Unilateral — split into Left/Right. Offered ONLY on a movement
            trained one side at a time (`isUnilateralExercise`, checked in
            `ExerciseCard`): splitting a bilateral set is not cosmetic, since a
            pair is scored at its weaker side and counts as ONE set of work. */}
        {onSplit && (
          <button
            type="button"
            onPointerDown={() => { void tapLight() }}
            onClick={() => { onSplit(); onClose() }}
            className="w-full min-h-[48px] px-3 rounded-xl text-[12px] font-bold uppercase tracking-wide
                       text-text border border-white/10 bg-white/[0.03] active:scale-[0.98] transition-transform
                       flex items-center justify-center gap-2"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
            Split L / R
          </button>
        )}

        {/* ── REMOVE, AS FAR FROM THE TICK AS IT CAN GET ──
            It was a permanent 32px × on every collapsed row, one thumb-width
            from the green tick — the two most consequential controls on the
            deck, adjacent, one of them destructive. Then it was a full-width
            button in the tuner, which was better but still one tap from the
            numbers you were editing. Here it takes a deliberate two. */}
        <button
          type="button"
          onPointerDown={() => { void tapLight() }}
          onClick={() => { onRemove(); onClose() }}
          className="w-full min-h-[48px] px-3 rounded-xl text-[12px] font-bold uppercase tracking-wide
                     text-danger border border-danger/25 bg-danger/[0.06] active:scale-[0.98] transition-transform
                     flex items-center justify-center gap-2"
          aria-label={`Remove ${setLabel}`}
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          Remove set
        </button>
      </div>
    </Sheet>
  )
}
