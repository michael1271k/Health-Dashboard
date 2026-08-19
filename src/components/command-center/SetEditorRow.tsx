'use client'

import { memo, useEffect, useState } from 'react'
import { Check, X, Trophy } from 'lucide-react'
import { tapLight } from '@/lib/native/haptics'
import { isSetCommitted, type DraftSet } from '@/lib/sessions/draft'
import { prAxisLabel, type PrAxis } from '@/lib/training/prEngine'
import { rpeColor, rpeLabel } from '@/lib/training/effort'
import { RpeLadder } from './RpeLadder'

/** Plate step (the flanking ± on the weight field) and the microload step. */
const PLATE_STEP = 2.5
const FINE_STEP = 0.25
const ORANGE = '#E0703C' // warm-up
const DANGER = '#C4514E' // failure
const DROP = '#9A6DD7'   // drop set
const GREEN = '#3E9E7A'  // completed (ticked green)
const GOLD = '#C9A227'   // personal record
/** The ladder stop that MEANS failure — the one rating the `F` tag mirrors. */
const FAILURE_RPE = 10

/**
 * One set row of the deck: tap to activate the tuner (typeable weight/reps
 * fields with flanking steppers, microload chips, Warm-up/Failure/Drop toggles,
 * Split L/R, effort ladder).
 *
 * ── THE SLIDER IS GONE ───────────────────────────────────────────────────────
 * A Radix weight slider used to sit between the number fields and the steppers.
 * It was the tallest control in the tuner — a 24px track plus a 20px thumb plus
 * its own margins — to do imprecisely what the field above it and the chips
 * below it both did precisely. It also carried the only piece of state in this
 * file that existed purely to protect an interaction from itself: a grow-only
 * `sliderMax`, because a max derived from the live value rescaled the track
 * mid-drag and snapped 35 to 25.
 *
 * ── MEMOIZED — THIS IS THE ONE THAT ACTUALLY PAYS ────────────────────────────
 * A keystroke re-rendered all six cards and all twenty-four rows: 2.664 ms,
 * 16% of a frame in jsdom before any paint. Memoizing the CARD turned out not
 * to be enough on its own — `ExerciseCard` calls `useSortable`, and a context
 * change re-renders every consumer no matter how stable its props are (probed:
 * 60 renders across 10 keystrokes with memo in place, versus 10 without the
 * hook). dnd-kit republishes that context on every parent render.
 *
 * The rows subscribe to nothing. They are 24 of the ~30 components in the deck
 * and they carry four effects each, so this boundary is where the work stops.
 * The card shells above still re-execute; they are cheap once their subtree
 * bails out.
 */
export const SetEditorRow = memo(function SetEditorRow({ index, displayNum, subRow = false, set, prev, active, timed = false, bodyweight = false, trackRpe = false, prAxes = [], onActivate, onChange, onRemove, onToggleDone, onSplit, onPrTap }: {
  index: number
  /**
   * What you did on THIS set number the last time you trained this movement,
   * from any routine — see `useGlobalSetHistory`. Absent when the movement is
   * new, or when last time had fewer sets than this one does.
   */
  prev?: { weightKg: number; reps: number } | null
  /**
   * `user_goals.track_rpe`. Off = the ladder never mounts and no rating is ever
   * written; the column simply stays null, which is what "not reported" means
   * everywhere downstream.
   */
  trackRpe?: boolean
  /** Records this set just set, computed live by the parent from `prEngine`. */
  prAxes?: PrAxis[]
  /**
   * Movement with no load to progress (Hanging Knee Raise, Reverse Crunch, a
   * hold). Its load controls stay hidden while the set is at 0 kg — see
   * `isBodyweightExercise`.
   */
  bodyweight?: boolean
  /** Human set number (groups a unilateral pair as ONE set); falls back to index+1. */
  displayNum?: number
  /** True when rendered as a Left/Right sub-row nested inside a "Set N" pair card. */
  subRow?: boolean
  set: DraftSet
  active: boolean
  /** Time-based movement (plank/hold) — the reps field is seconds, not reps. */
  timed?: boolean
  /*
   * ── EVERY HANDLER TAKES `index` ───────────────────────────────────────────
   * Same reason ExerciseCard's take `localId`: these were pre-bound closures
   * (`onChange={(patch) => onUpdateSet(localId, i, patch)}`), rebuilt on every
   * card render, so all six props changed identity and `memo` never held. The
   * row already receives its own `index`; binding it was not the card's job.
   */
  onActivate: (index: number) => void
  onChange: (index: number, patch: Partial<DraftSet>) => void
  onRemove: (index: number) => void
  /** Tick the set complete (green) / uncomplete — only green sets are recorded. */
  onToggleDone?: (index: number) => void
  /** Unilateral: split a normal set into Left/Right (absent once already split). */
  onSplit?: (index: number) => void
  /** Tapping the trophy opens the record sheet for this set. */
  onPrTap?: (index: number) => void
}) {
  // 3.75 must display as 3.75, not "3.8" — quarter-step plates are real loads.
  const weightLabel = set.weightKg % 1 === 0 ? set.weightKg.toFixed(0)
    : (set.weightKg * 10) % 1 === 0 ? set.weightKg.toFixed(1) : set.weightKg.toFixed(2)

  /**
   * Show the load half at all? "0kg × 15 reps" on a Hanging Knee Raise states a
   * weight that does not exist and buries the only number the set has. A
   * bodyweight movement carrying actual load (weighted pull-up) renders as any
   * other loaded set — the test is the movement AND the value, never one alone.
   */
  const unloadedMovement = bodyweight || timed
  const showLoad = !unloadedMovement || set.weightKg > 0

  /**
   * The tuner's load controls are LATCHED open, not derived from the value.
   *
   * `NumberField` commits on every keystroke, so typing "0.5" commits 0 on the
   * first character. Deriving the controls from `weightKg > 0` therefore
   * unmounted the input mid-word: focus lost, keyboard dismissed, row back to
   * bodyweight. Any sub-1 kg load — a 0.5 kg magnet on a dip belt — was
   * untypeable on exactly the movements this feature is for. Once revealed the
   * controls stay for the whole edit; the latch clears when the row closes
   * still at 0, so it collapses back next time it is opened.
   */
  const [loadOpen, setLoadOpen] = useState(set.weightKg > 0)
  useEffect(() => {
    if (set.weightKg > 0) setLoadOpen(true)
    else if (!active) setLoadOpen(false)
  }, [set.weightKg, active])
  const showLoadControls = showLoad || loadOpen

  /**
   * A HOLD gets no load affordance at all. Weight is invisible to the PR engine
   * on a timed set (`detectSetPrs` returns after the seconds axis) but NOT to
   * `sessionVolumeKg`, which has no timed concept and multiplies weight by
   * `reps` — i.e. by SECONDS. One tap plus a 60 s plank would inject 150 kg of
   * phantom tonnage into the week. Reachable before, but never invited.
   */
  const canAddLoad = bodyweight && !timed

  const isWarm = set.setType === 'warmup'
  const isFail = set.setType === 'failure'
  const isDrop = set.setType === 'dropset'
  // Green = committable = will be recorded on finish. Template decks seed every
  // set as NOT committed (done:false); pasted/edited sets are committed by default.
  const done = isSetCommitted(set)

  const nudgeWeight = (delta: number) => {
    void tapLight()
    // Snap to the 0.25 kg grid (quarter-kg microloads), not the old 0.5 grid.
    onChange(index, { weightKg: Math.max(0, Math.round((set.weightKg + delta) * 4) / 4) })
  }
  const nudgeReps = (delta: number) => {
    void tapLight()
    onChange(index, { reps: Math.max(1, set.reps + delta) })
  }
  /**
   * ── FAILURE AND A 10 ARE THE SAME CLAIM, SO THEY MOVE TOGETHER ─────────────
   * The ladder's top stop already tagged the set `failure` on the way in, and
   * nothing carried the fact back: tapping `F` left the rating untouched, and
   * clearing a 10 left the `F` chip lit. So a set could read "F" at RPE 8, and
   * "10 · Failure" with no tag — two controls describing one fact and
   * disagreeing about it, which is what `setType` gets exported as and what the
   * PR engine reads.
   *
   * The sync is strict and it is narrow. Only the FAILURE tag is mirrored (a
   * warm-up and a drop set say nothing about proximity to failure), only while
   * ratings are being tracked at all, and only over a rating that IS the
   * failure stop — dropping the tag never touches an 8.5 you entered yourself.
   */
  const toggleType = (t: 'warmup' | 'failure' | 'dropset') => {
    void tapLight()
    const nextType = set.setType === t ? undefined : t
    const patch: Partial<DraftSet> = { setType: nextType }
    if (t === 'failure' && trackRpe) {
      if (nextType === 'failure') patch.rpe = FAILURE_RPE
      else if (set.rpe === FAILURE_RPE) patch.rpe = undefined
    }
    onChange(index, patch)
  }

  const sideColor = set.side === 'L' ? '#8E9AAC' : set.side === 'R' ? '#E0703C' : null
  // The badge box is 24px (`w-6 shrink-0`). "Warmup" and "Dropset" are six and
  // seven uppercase characters, and `shrink-0` stops them even trying to fit —
  // they spilled into the load column 10px away. So the box now holds only what
  // is guaranteed to fit (S1 / L / R) and the grid stays aligned however the set
  // is typed; the TYPE moves to a chip beside the numbers, where `F` already
  // lived. The earlier objection to a bare letter — that "W" next to "20kg"
  // reads as a unit — is answered by the chip's border and tint, which read as a
  // tag rather than a suffix, plus the full word in `title`/`aria-label`. This
  // is the treatment the read-only ledger already shipped (ExerciseBreakdown).
  // ── THE LEFT COLUMN IS THE SET'S IDENTITY ──
  // It used to read `S1` and carry the type as a separate chip further along
  // the row, which meant a warm-up announced itself twice — once as a number it
  // is not (a warm-up is not "set 1 of 4") and once as a tag. Hevy puts the
  // letter WHERE the number goes, because a warm-up has no ordinal: it is the W.
  // A split side still wins the box (L/R is the more specific fact) and its type
  // falls back to the chip.
  const typeBadge = isWarm ? { label: 'W', full: 'Warm-up', color: ORANGE }
    : isFail ? { label: 'F', full: 'Taken to failure', color: DANGER }
    : isDrop ? { label: 'D', full: 'Drop set', color: DROP }
    : null
  const badge = set.side ?? typeBadge?.label ?? `${displayNum ?? index + 1}`
  const badgeColor = set.side ? sideColor : typeBadge?.color ?? null
  // Only when the box could not carry it — a sided row that is also to failure.
  const typeTag = set.side && typeBadge
    ? { label: `${typeBadge.label}-${set.side}`, full: typeBadge.full, color: typeBadge.color }
    : null

  return (
    <div
      // ── DONE OUTRANKS ACTIVE ──
      // The expanded row used to drop its green the moment you opened it, so
      // the one state the tick exists to show disappeared exactly when you were
      // editing the set it belonged to — and a row you reopened to fix a rep
      // count looked identical to one you had never completed. Green stays;
      // the active row is distinguished by its ring instead.
      className={`rounded-lg border transition-colors ${
        done ? 'border-[#3E9E7A]/45 bg-[#3E9E7A]/[0.10]'
        : active ? 'border-primary/30 bg-white/[0.03]'
        : isWarm ? 'border-transparent bg-[#E0703C]/[0.06]' : 'border-transparent'}`}
      style={{
        ...(subRow && sideColor
          ? { borderLeft: `2px solid ${sideColor}`, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 }
          : null),
        // The active ring, drawn as a shadow so it survives the done colours.
        ...(active ? { boxShadow: 'inset 0 0 0 1px rgba(224,112,60,0.45)' } : null),
      }}
    >
      {/* ── Summary block (always visible) ──
          Two lines, Hevy-style. The numbers own the first line; records hang
          UNDER them on a second. They used to sit inline after the reps, which
          on a three-axis set (Weight + Volume + 1RM) pushed the row past the
          viewport and slid under the green tick — the one control that must
          always be hittable. A sub-line cannot collide with it by construction,
          however many axes a set wins. */}
      <div className="flex items-center gap-2 px-2 py-1">
        <button
          type="button"
          onClick={() => onActivate(index)}
          className="flex-1 min-w-0 flex flex-col gap-1 text-left min-h-[34px] justify-center"
          aria-expanded={active}
        >
          <span className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-1.5 min-w-0">
            <span
              className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-[11px] font-bold uppercase tabular-nums"
              style={badgeColor
                ? { color: badgeColor, background: `${badgeColor}1f`, border: `1px solid ${badgeColor}55` }
                : { color: 'var(--color-muted)' }}
              title={typeBadge?.full}
              aria-label={typeBadge ? `${typeBadge.full}, set ${displayNum ?? index + 1}` : `Set ${displayNum ?? index + 1}`}
            >
              {badge}
            </span>

            {/* TODAY */}
            <span className="flex items-baseline gap-1 min-w-0">
              {showLoad && (
                <>
                  <span className={`helix-num text-fluid-base font-bold tabular-nums truncate ${isWarm ? 'text-muted' : 'text-text'}`}>
                    {weightLabel}<span className="text-[10px] text-muted font-normal ml-0.5">kg</span>
                  </span>
                  <span className="text-muted text-xs shrink-0">×</span>
                </>
              )}
              <span className={`helix-num text-fluid-base font-bold tabular-nums shrink-0 ${isWarm ? 'text-muted' : 'text-text'}`}>
                {set.reps}{timed && <span className="text-[10px] text-muted font-normal ml-0.5">sec</span>}
              </span>
              {typeTag && (
                <span className="text-[9px] font-bold uppercase px-1 py-px rounded shrink-0"
                  style={{ color: typeTag.color, background: `${typeTag.color}1f`, border: `1px solid ${typeTag.color}55` }}
                  title={typeTag.full} aria-label={typeTag.full}>
                  {typeTag.label}
                </span>
              )}
              {/* Cleared because the load or the reps went up. One dot, no banner. */}
              {set.rpe == null && set.rpeStale && (
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ORANGE }}
                  title="Heavier than last time — rate this set" aria-label="Needs an effort rating" />
              )}
            </span>

            {/* ── PREVIOUS ──
                What this same set number was last time you did the movement, on
                ANY routine. It sits between today's numbers and the effort
                because that is the order you read them in: what it is, what it
                was, how hard it felt.

                A COLUMN, not a chip. This value was already fetched, threaded
                and rendered — behind `hidden xs:inline`, i.e. invisible on every
                phone narrower than 400px, which is the device it exists for. The
                card above it carried a "Prev 36kg × 12, 11, 10" pill instead,
                where you re-counted commas to find the set you were on.

                Dimmed and never editable: a reference that looks like an input
                gets typed into. */}
            <span className="helix-num text-[11px] tabular-nums text-muted/70 truncate"
              title={prev ? 'Last time you did this movement' : undefined}>
              {prev ? (prev.weightKg > 0 ? `${prev.weightKg}×${prev.reps}` : `${prev.reps}`) : '—'}
            </span>

            {/* Effort readout. Carries the WORD, not just the number: "8.5"
                means nothing to someone who has not memorised the ladder. A
                value inherited from last session renders dimmer, because it is
                a proposal until you either confirm it or commit the session. */}
            <span
              className="text-[10px] font-bold uppercase tracking-wide text-right truncate"
              style={set.rpe != null
                ? { color: rpeColor(set.rpe), opacity: set.rpeSeed != null ? 0.55 : 1 }
                : { color: 'transparent' }}
              title={set.rpe == null ? undefined
                : set.rpeSeed != null ? 'Carried from last session — tap to confirm or change' : undefined}
            >
              {set.rpe != null ? rpeLabel(set.rpe) : '—'}
            </span>
          </span>
        </button>
        {onToggleDone && (
          <button
            type="button"
            // Haptic on pointer-DOWN, commit on click. The press highlight
            // (active:scale-95) already fires on touch-down, so firing the
            // haptic on release put the two senses on different frames — the
            // one thing that reliably breaks the illusion. Committing still
            // happens on click, so dragging off the button still cancels.
            onPointerDown={() => { void tapLight() }}
            onClick={() => { onToggleDone(index) }}
            aria-pressed={done}
            aria-label={done ? `Mark set ${index + 1} not done` : `Mark set ${index + 1} done`}
            className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center active:scale-95 transition-[color,background-color,border-color,transform] duration-150"
            style={done
              ? { color: '#fff', background: GREEN, border: `1px solid ${GREEN}` }
              : { color: 'var(--color-muted)', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)' }}
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-muted hover:text-danger active:scale-95 transition-transform"
          aria-label={`Remove set ${index + 1}`}
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* ── Live records ──
          Appears the instant the set is ticked green, from the SAME engine that
          writes personal_records at commit — a badge shown here is a badge that
          gets recorded. Indented to the load column so it reads as belonging to
          these numbers, and one trophy leads the run rather than repeating per
          axis.

          ITS OWN CONTROL, on its own line. It used to live INSIDE the row's
          activate button, where it could not be tapped independently (a button
          cannot hold a button) and any tap opened the tuner instead. Tapping it
          now opens the record sheet, which is the only place the numbers behind
          the badge — what was beaten, and by how much — actually exist. */}
      {prAxes.length > 0 && (
        <button
          type="button"
          onPointerDown={onPrTap ? () => { void tapLight() } : undefined}
          onClick={onPrTap ? () => onPrTap(index) : undefined}
          disabled={!onPrTap}
          className={`w-full flex items-center gap-1 flex-wrap pl-[42px] pr-2 pb-1.5 -mt-0.5 text-left
                      ${onPrTap ? 'active:scale-[0.98] transition-transform duration-150' : ''}`}
          aria-label={onPrTap ? `Records on this set — ${prAxes.map((a) => prAxisLabel(a, timed)).join(', ')}` : undefined}
        >
          <Trophy className="w-2.5 h-2.5 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
          {prAxes.map((axis) => (
            <span key={axis} className="text-[8px] font-bold uppercase tracking-wide leading-none px-1 py-0.5 rounded"
              style={{ color: GOLD, background: `${GOLD}1a`, border: `1px solid ${GOLD}55` }}
              title={`Personal record — ${prAxisLabel(axis, timed)}`}>
              {prAxisLabel(axis, timed)}
            </span>
          ))}
        </button>
      )}

      {/* ── Tuner (active row only) ──
          THREE ROWS, DOWN FROM SIX. It used to stack: number fields, a weight
          slider, a stepper row, the W/F/D group, the effort ladder and Split
          L/R on its own line — a control surface taller than the four set rows
          around it, for a set whose whole content is two numbers and a rating.

          The fields absorbed the steppers (± flanks the number it changes,
          which is also where your thumb already is), the slider left, and Split
          moved up beside the type chips it belongs with. What is left is: the
          numbers, what kind of set it was, how hard it was. */}
      {active && (
        <div className="px-2 pb-2 space-y-1.5">
          {/* Row 1 — the numbers. Type them, or step them from either side. */}
          <div className="flex items-center gap-1.5">
            {showLoadControls && (
              <>
                <Step label="−" ariaLabel={`${PLATE_STEP}kg less`} onClick={() => nudgeWeight(-PLATE_STEP)} />
                <label className="flex-1 min-w-0 flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 min-h-[38px]">
                  <NumberField
                    value={set.weightKg}
                    inputMode="decimal"
                    ariaLabel={`Weight for set ${index + 1}`}
                    onCommit={(n) => onChange(index, { weightKg: Math.max(0, n) })}
                  />
                  <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">kg</span>
                </label>
                <Step label="+" ariaLabel={`${PLATE_STEP}kg more`} onClick={() => nudgeWeight(+PLATE_STEP)} />
                <span className="text-muted text-xs shrink-0 px-0.5">×</span>
              </>
            )}
            <Step label="−" ariaLabel="One rep less" onClick={() => nudgeReps(-1)} />
            <label className="flex-1 min-w-0 flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 min-h-[38px]">
              <NumberField
                value={set.reps}
                inputMode="numeric"
                ariaLabel={`${timed ? 'Seconds' : 'Reps'} for set ${index + 1}`}
                onCommit={(n) => onChange(index, { reps: Math.max(1, Math.round(n)) })}
              />
              <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">{timed ? 'sec' : 'reps'}</span>
            </label>
            <Step label="+" ariaLabel="One rep more" onClick={() => nudgeReps(+1)} />
          </div>

          {/* Row 2 — microloads, set type, and Split.
              Wraps rather than overflows: on a unilateral movement at 390px this
              line carries two microload chips, three type chips and Split, and a
              second line is a better failure than a clipped control.

              Set type is Warm-up / Failure / Drop set (Hevy parity). "Normal" is
              the absence of all three; "Remove" is the X on the summary line.
              Failure is PER SIDE for a split set (F on Right while Left holds).
              ONE SEGMENTED GROUP, not three floating buttons: these are mutually
              exclusive (see `toggleType`) and three separate outlines claimed
              otherwise. */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {showLoadControls ? (
              // The quarter-kg grid survives the slider's removal: microloading is
              // how a 3.75kg lateral raise progresses, and it is not something you
              // want to open a keyboard for.
              <div className="inline-flex items-stretch rounded-lg overflow-hidden shrink-0"
                style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                <FineStep label={`−${FINE_STEP}`} onClick={() => nudgeWeight(-FINE_STEP)} />
                <span className="w-px" style={{ background: 'rgba(255,255,255,0.10)' }} aria-hidden="true" />
                <FineStep label={`+${FINE_STEP}`} onClick={() => nudgeWeight(+FINE_STEP)} />
              </div>
            ) : canAddLoad ? (
              // Weighted variants stay one tap away — a belt on a dip, a plate
              // held on a knee raise. Revealing the controls is enough; the
              // load itself stays 0 until the user sets one, so a stray tap
              // cannot invent tonnage or cost the set its reps axis.
              <button
                type="button"
                onClick={() => { void tapLight(); setLoadOpen(true) }}
                aria-label={`Add load to set ${displayNum ?? index + 1}`}
                className="rounded-lg border border-white/[0.10] bg-white/[0.04] px-2.5 min-h-[32px] text-[11px] font-semibold text-muted active:scale-95 transition-transform shrink-0"
              >
                + Add load
              </button>
            ) : null}

            <div className="inline-flex items-stretch rounded-lg overflow-hidden shrink-0"
              style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
              <TypeChip active={isWarm} color={ORANGE} label="Warm-up" short="W" onClick={() => toggleType('warmup')} />
              <span className="w-px" style={{ background: 'rgba(255,255,255,0.10)' }} aria-hidden="true" />
              <TypeChip active={isFail} color={DANGER} label="Failure" short="F" onClick={() => toggleType('failure')} />
              <span className="w-px" style={{ background: 'rgba(255,255,255,0.10)' }} aria-hidden="true" />
              <TypeChip active={isDrop} color={DROP} label="Drop set" short="D" onClick={() => toggleType('dropset')} />
            </div>

            {/* Unilateral — split into Left/Right. Offered ONLY on a movement
                trained one side at a time (`isUnilateralExercise`, checked in
                `ExerciseCard`): splitting a bilateral set is not cosmetic, since
                a pair is scored at its weaker side and counts as ONE set of work.
                Merge lives on the parent "Set N" card, so a nested sub-row shows
                only its own tuner. */}
            {onSplit && (
              <button type="button" onClick={() => onSplit(index)}
                className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wide text-muted border border-white/10 hover:text-text active:scale-95 transition-colors shrink-0 ml-auto">
                Split L / R
              </button>
            )}
          </div>

          {/* Row 3 — effort, per SET, and only on a working one.
              A warm-up is never rated, for the same reason it wins no record:
              it is not the effort the question is about. Rating the Failure
              stop also tags the set `failure`, because that is what the word
              means on this row — but only ADDITIVELY: clearing the rating
              leaves a W/F/D chip the user set separately alone. */}
          {trackRpe && !isWarm && (
            <RpeLadder
              value={set.rpe}
              stale={set.rpeStale}
              seeded={set.rpeSeed != null}
              setLabel={`set ${displayNum ?? index + 1}`}
              onPick={(choice) => onChange(index, {
                rpe: choice?.rpe,
                // The other direction of the same sync as `toggleType`: the top
                // stop lights the F tag, and stepping off it (or clearing the
                // rating) puts the tag out. Only a tag this control set is
                // withdrawn — a warm-up or drop set chip is left alone.
                ...(choice?.failure ? { setType: 'failure' as const }
                  : isFail ? { setType: undefined } : {}),
              })}
            />
          )}
        </div>
      )}
    </div>
  )
})

/**
 * The ± that flanks a number field.
 *
 * Its own component because there are four of them and each is a 34px square
 * whose only job is a haptic nudge — inline, they were four near-identical
 * seven-line className strings, which is how the reps stepper and the weight
 * chips drifted onto different radii in the first place.
 */
function Step({ label, ariaLabel, onClick }: { label: string; ariaLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] min-h-[38px] min-w-[34px]
                 text-sm font-bold text-text active:scale-95 transition-transform"
    >
      {label}
    </button>
  )
}

/** A microload chip — the quarter-kg grid, inside the segmented pair. */
function FineStep({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} kilograms`}
      className="min-h-[32px] px-2 text-[11px] font-bold text-muted tabular-nums hover:text-text
                 active:scale-95 transition-[color,transform] duration-150"
    >
      {label}
    </button>
  )
}

/**
 * Typeable numeric field. Keeps a local text buffer while focused so partial
 * entries ("16", "16.", "16.2") don't fight the parsed value; commits every
 * valid parse up to the parent. Weight is NOT snapped to the 0.25 grid on typed
 * input — the user gets the exact number they enter (the ± chips still snap).
 */
function NumberField({ value, onCommit, inputMode, ariaLabel }: {
  value: number
  onCommit: (n: number) => void
  inputMode: 'decimal' | 'numeric'
  ariaLabel: string
}) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setText(String(value)) }, [value, editing])
  return (
    <input
      type="text"
      inputMode={inputMode}
      value={editing ? text : String(value)}
      aria-label={ariaLabel}
      onFocus={(e) => { setEditing(true); setText(String(value)); e.currentTarget.select() }}
      onChange={(e) => {
        const t = e.target.value
        setText(t)
        const n = parseFloat(t)
        if (Number.isFinite(n)) onCommit(n)
      }}
      onBlur={() => { const n = parseFloat(text); if (Number.isFinite(n)) onCommit(n); setEditing(false) }}
      className="w-full min-w-0 bg-transparent field-compact font-bold tabular-nums text-text outline-none"
    />
  )
}

function TypeChip({ active, color, label, short, onClick }: {
  active: boolean; color: string; label: string; short: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="min-h-[32px] px-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors active:scale-95"
      style={active
        ? { color, background: `${color}24` }
        : { color: 'var(--color-muted)', background: 'transparent' }}
    >
      <span aria-hidden="true">{short}</span>
      <span className="ml-1 hidden sm:inline">{label}</span>
    </button>
  )
}
