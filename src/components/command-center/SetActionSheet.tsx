'use client'

import { ArrowLeftRight, Trash2, Check } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { SET_QUALITY, SET_QUALITY_KEYS } from '@/lib/training/setTags'
import { tapLight } from '@/lib/native/haptics'
import { AMBER, MUTED } from '@/lib/theme/palette'

/** The five mutually exclusive things a set can be. Mirrors `DraftSet.setType`. */
export type SetTypeValue = 'normal' | 'warmup' | 'failure' | 'dropset' | 'ghost'

const ORANGE = '#E0703C' // warm-up
const DANGER = '#C4514E' // failure
const DROP = '#9A6DD7'   // drop set

/**
 * The five types, with the letter each one wears on the row it came from.
 *
 * The badge is the trigger AND the readout (see below), so the sheet showing the
 * same glyph is what makes the connection between "the thing I tapped" and "the
 * thing I am choosing" without a sentence explaining it.
 */
const TYPES: ReadonlyArray<{ value: SetTypeValue; label: string; badge: string; color: string; hint: string }> = [
  { value: 'normal', label: 'Normal', badge: '#', color: MUTED, hint: 'Counts as work' },
  { value: 'warmup', label: 'Warm-up', badge: 'W', color: ORANGE, hint: 'Before the work' },
  { value: 'failure', label: 'Failure', badge: 'F', color: DANGER, hint: 'Taken to failure' },
  { value: 'dropset', label: 'Drop', badge: 'D', color: DROP, hint: 'No record from it' },
  /**
   * ── GHOST ────────────────────────────────────────────────────────────────
   * A set that happened and does not count: a rep you restarted, a set on the
   * wrong machine, a technique run, someone else's plates. Until now the only
   * way to record one was to call it a warm-up, which is a lie the export then
   * repeats — and which quietly made it a warm-up in the routine's own memory.
   *
   * It is excluded on BOTH sides: never a working set (so it forms no baseline
   * and the coach never paces you against it) and never PR-eligible. See
   * `isWorkingSet` and `isPrIneligible`.
   */
  { value: 'ghost', label: 'Ghost', badge: 'G', color: MUTED, hint: 'Logged, counts for nothing' },
]

/**
 * Everything you do to a set that is not its two numbers.
 *
 * ── WHY IT LEFT THE ROW ──────────────────────────────────────────────────────
 * The expanded tuner was about 250px tall for one set. Roughly 90px of that was
 * spent on three controls you touch a handful of times a session: a set-type
 * picker that is `Normal` on twenty-three sets out of twenty-four, a Split L/R
 * offered on every unilateral row whether or not you intend to split it, and a
 * Remove.
 *
 * They are not less important — they are less FREQUENT, and a control's
 * permanent height should be paid for by how often it is reached, not by how
 * much it matters when it is. So they moved behind the one thing that is always
 * on screen and had nothing to do: the set's own badge.
 *
 * ── AND WHY THE BADGE IS THE TRIGGER ─────────────────────────────────────────
 * The badge already SHOWS the set's type — `W`, `F`, `D`, `G`, or the ordinal. A
 * control that displays a value is the obvious place to change it, and it costs
 * no new pixels because the box was already drawn.
 *
 * The row's other tap target, the trophy on the second line, keeps opening
 * `PrRecordSheet`. Two targets, two jobs, and neither is a long-press.
 *
 * ── WHY IT IS NO LONGER A SEGMENTED CONTROL AND A COLUMN OF BUTTONS ──────────
 * It was a full-width four-segment picker under a section label, then a
 * full-width Split, then a full-width Remove — three stacked 48px bars and two
 * headings, about 190px of sheet, for a control reached between sets with one
 * thumb while out of breath. It read as a settings page.
 *
 * The type is a ROW OF CHIPS instead. Five options are exactly what a row of
 * chips is for: they are visible at once, each is its own object rather than a
 * slice of one bar, and each can carry its own colour — which the segmented
 * control could not, so `Warm-up` and `Drop` were the same grey until selected.
 * A fifth segment would have made each one 66px wide on a 360px phone; a fifth
 * chip costs nothing.
 *
 * Split and Remove then fit on ONE row beside each other, because neither needs
 * a full width to be legible and putting them side by side is what removes the
 * third stacked bar. Remove keeps the danger tint and stays on the far side from
 * the type chips, which are the controls you actually came here for.
 *
 * Net: about 190px down to about 110px, and nothing was taken away.
 */
export function SetActionSheet({
  open, onClose, setLabel, value, onPick, quality, onQuality, onSplit, onRemove,
}: {
  open: boolean
  onClose: () => void
  /** "Set 3", "Set 3 · Left" — names what the sheet is about to change. */
  setLabel: string
  value: SetTypeValue
  onPick: (choice: SetTypeValue) => void
  /** The set's technique note, or null when the question was never asked. */
  quality?: string | null
  /** Passing the same value again clears it — a mis-tap costs one more tap. */
  onQuality: (choice: string | null) => void
  /** Unilateral movements only — absent on a bilateral lift and on a sub-row. */
  onSplit?: () => void
  onRemove: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={setLabel} maxHeight="52dvh">
      <div className="space-y-2 pb-1">
        {/* ── THE TYPE, AS FIVE CHIPS ──
            No section heading: the sheet's own title already names the set, and
            a "Set type" label above the only thing in the sheet is a caption on
            a photograph of itself.

            Picking does NOT close the sheet. Changing a set to a warm-up and
            then wanting to split it is one errand, and a sheet that dismisses on
            the first tap makes it two. */}
        <div
          role="radiogroup"
          aria-label={`Set type for ${setLabel}`}
          className="grid grid-cols-5 gap-1"
        >
          {TYPES.map((t) => {
            const on = t.value === value
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={on}
                onPointerDown={() => { void tapLight() }}
                onClick={() => onPick(t.value)}
                title={t.hint}
                className="min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5
                           active:scale-95 transition-transform"
                style={{
                  // Selected wears its own colour at full strength; the rest are
                  // inert. The colour IS the state, so there is no tick to find.
                  background: on ? `${t.color}24` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${on ? `${t.color}8c` : 'rgba(255,255,255,0.08)'}`,
                  color: on ? t.color : undefined,
                  boxShadow: on ? 'inset 0 1px 0 rgba(255,255,255,0.10)' : undefined,
                }}
              >
                <span className={`helix-num text-[13px] font-extrabold leading-none ${on ? '' : 'text-muted'}`}>
                  {t.badge}
                </span>
                <span className={`text-[9px] font-bold leading-none ${on ? '' : 'text-muted'}`}>
                  {t.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* What the chosen type actually means, in four words, on one line that
            is always there. A tooltip is not reachable by thumb, and five hints
            stacked as helper text under five chips would put the height straight
            back. */}
        <p className="text-[10px] text-muted leading-none px-0.5 flex items-center gap-1 min-h-[12px]">
          <Check className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
          {TYPES.find((t) => t.value === value)?.hint}
        </p>

        {/* ── AND HOW IT WENT ──────────────────────────────────────────────
            A SECOND AXIS below the first, not more type chips. "Warm-up" and
            "form broke" are both true of the same set, so they cannot share a
            control — and folding technique into `set_type` would give twenty
            existing consumers of `isWorkingSet` an opinion about form, which
            none of them should have.

            It costs nothing until used: no selection is the normal state, the
            row renders no chip, and the column is not even sent on commit. This
            heading exists where the type's does not, because unlike the type
            this axis has no default anyone would infer from the chips alone. */}
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted pt-1.5 px-0.5">
          How it went
        </p>
        <div
          role="radiogroup"
          aria-label={`Set quality for ${setLabel}`}
          className="grid grid-cols-3 gap-1"
        >
          {SET_QUALITY_KEYS.map((k) => {
            const q = SET_QUALITY[k]
            const on = quality === k
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onPointerDown={() => { void tapLight() }}
                // Tapping the selected one clears it. There is no "Clean" chip:
                // clean is the absence of a claim, and a chip for it would write
                // a value asserting the set was inspected and passed.
                onClick={() => onQuality(on ? null : k)}
                title={q.full}
                className="min-h-[40px] rounded-xl px-1.5 flex items-center justify-center
                           active:scale-95 transition-transform"
                style={{
                  background: on ? `${AMBER}24` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${on ? `${AMBER}8c` : 'rgba(255,255,255,0.08)'}`,
                  color: on ? AMBER : undefined,
                }}
              >
                <span className={`text-[10px] font-bold leading-tight text-center ${on ? '' : 'text-muted'}`}>
                  {q.label}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-muted leading-none px-0.5 flex items-center gap-1 min-h-[12px]">
          {quality
            ? <><Check className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />{SET_QUALITY[quality]?.full}</>
            : 'Clean unless you say otherwise'}
        </p>

        {/* ── SPLIT AND REMOVE, SIDE BY SIDE ──
            Remove keeps its distance from the numbers you were editing — it is
            two taps from the row and it is on the opposite end of this line from
            the chips. Splitting a bilateral set is not cosmetic (a pair is
            scored at its weaker side and counts as ONE set of work), so it is
            offered only on a movement trained one side at a time. */}
        <div className="flex gap-1.5 pt-0.5">
          {onSplit && (
            <button
              type="button"
              onPointerDown={() => { void tapLight() }}
              onClick={() => { onSplit(); onClose() }}
              className="flex-1 min-h-[44px] px-3 rounded-xl text-[11px] font-bold uppercase tracking-wide
                         text-text border border-white/10 bg-white/[0.03] active:scale-[0.98] transition-transform
                         flex items-center justify-center gap-1.5"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
              Split L / R
            </button>
          )}
          <button
            type="button"
            onPointerDown={() => { void tapLight() }}
            onClick={() => { onRemove(); onClose() }}
            className={`${onSplit ? 'flex-1' : 'w-full'} min-h-[44px] px-3 rounded-xl text-[11px] font-bold uppercase tracking-wide
                       text-danger border border-danger/25 bg-danger/[0.06] active:scale-[0.98] transition-transform
                       flex items-center justify-center gap-1.5`}
            aria-label={`Remove ${setLabel}`}
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Remove
          </button>
        </div>
      </div>
    </Sheet>
  )
}
