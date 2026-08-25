'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Check, Medal } from 'lucide-react'
import { tapLight, tapSuccess } from '@/lib/native/haptics'
import { isSetCommitted, FAILURE_RPE, type DraftSet } from '@/lib/sessions/draft'
import { type PrAxis } from '@/lib/training/prEngine'
import { rpeColor, rpeLabel } from '@/lib/training/effort'
import { useHoldRepeat } from '@/lib/hooks/useHoldRepeat'
import { RpeLadder } from './RpeLadder'
import { SetActionSheet, type SetTypeValue } from './SetActionSheet'
import { setGridFor, SET_BADGE_W, SET_CELL_LEAD, SET_CELL_VALUE, SET_FRAME_GAP, SET_TAIL_W, type SetGridMode } from './setGrid'
import { EMERALD_DEEP, EMERALD_LIGHT } from '@/lib/theme/palette'

/** Plate step (a tap on ±) and the microload step (a press-and-hold). */
const PLATE_STEP = 2.5
const FINE_STEP = 0.25
const ORANGE = '#E0703C' // warm-up
const DANGER = '#C4514E' // failure
const DROP = '#9A6DD7'   // drop set
const GREEN = '#3E9E7A'  // completed (ticked green)
const GREEN_LIGHT = EMERALD_LIGHT  // the pale end of the completed ramp
const GOLD = '#C9A227'   // personal record

/**
 * ── THE COMPLETED SET IS A GRADIENT, NOT A FILL ─────────────────────────────
 * A ticked row used to be one flat `rgba(62,158,122,0.13)` wash edge to edge,
 * and the tick itself a solid block of `#3E9E7A`. Flat colour at that alpha is
 * the cheapest possible "done" state: it reads as a highlighted table row
 * rather than as a set that has been PUT AWAY, and against the deck's near-
 * black it is the one surface in the logger with no light direction at all.
 *
 * Both are ramps now, in the same direction (light at the leading edge, falling
 * away to the right) so the row and its tick belong to one light source. The
 * row's is deliberately PALER than the old flat fill at its far end — the point
 * is a green that has settled, not a green that shouts. The tick keeps full
 * saturation because it is 34px wide and has to survive being read at a glance
 * mid-set.
 *
 * ── AND THEN PALER STILL (2026-08-25) ───────────────────────────────────────
 * `2b` at the leading edge was still loud enough that a card of four ticked
 * sets read as four green bars rather than as four sets that were finished —
 * and the deck spends most of a session in that state, so the loudest thing on
 * the screen was the part you were no longer looking at. The ramp keeps its
 * shape and drops about a third of its alpha at every stop. A completed set
 * should recede; the tick beside it is what still says done.
 */
const DONE_ROW_BG =
  `linear-gradient(100deg, ${GREEN}1c 0%, ${GREEN}0f 42%, ${GREEN}06 100%)`
const DONE_TICK_BG =
  `linear-gradient(150deg, ${GREEN_LIGHT} 0%, ${GREEN} 55%, ${EMERALD_DEEP} 100%)`
/** How long the badge is held before it opens set options instead of records. */
const LONG_PRESS_MS = 500

/**
 * One set row of the deck: tap to activate the tuner, tap the badge for this
 * set's records, hold the badge for everything else it can be.
 *
 * ── THE ROW IS A TABLE ROW ───────────────────────────────────────────────────
 * It used to be a four-column grid with no header above it, and two of those
 * columns were doing more than one job. Now: SET · PREVIOUS · KG · REPS · RPE ·
 * ✓, one job per column, a header above them, and `setGrid.ts` owning the
 * template so the two cannot drift.
 *
 * ── AND IT IS ONE LINE TALL ──────────────────────────────────────────────────
 * It was not. Effort and records lived on a SECOND line under the row — an
 * "VERY HARD" chip and a trophy strip, each ~22px, on a row whose own content
 * is 36px. A rated set was two-thirds taller than an unrated one, so a card of
 * four working sets was half again the height of the same card before you rated
 * anything, and the deck grew as you logged it.
 *
 * Both moved into the grid. Effort is a COLUMN now — the number, in its own
 * colour, blank when unrated, with the word in the tooltip. Records moved onto
 * the badge, which already showed the medal: tapping it opens the sheet that
 * says what was beaten and by how much. Nothing stacks, so a row is a row.
 *
 * ── MEMOIZED — THIS IS THE ONE THAT ACTUALLY PAYS ────────────────────────────
 * A keystroke re-rendered all six cards and all twenty-four rows: 2.664 ms,
 * 16% of a frame in jsdom before any paint. Memoizing the CARD was not enough —
 * `ExerciseCard` calls `useSortable`, and a context change re-renders every
 * consumer no matter how stable its props are. The rows subscribe to nothing,
 * so this boundary is where the work stops.
 */
export const SetEditorRow = memo(function SetEditorRow({ index, displayNum, subRow = false, set, prev, active, timed = false, loadable = false, gridMode = 'loaded', trackRpe = false, prAxes = [], onActivate, onChange, onRemove, onToggleDone, onSplit, onPrTap }: {
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
   * Bodyweight movement that has a genuine WEIGHTED variant — a dip belt, a
   * plate on the back. Decides whether the tuner offers the "Add load" escape
   * hatch, and nothing else; the COLUMN question is `gridMode`'s and the card
   * answers it once.
   *
   * It used to be a bare `bodyweight` flag, which put a full-width Add load
   * button on Reverse Crunch and Hanging Knee Raise — the largest control in
   * the tuner, on the movements with the least to configure, leading to a
   * weight field with nothing to put in it. See `isLoadableBodyweightExercise`.
   */
  loadable?: boolean
  /** Which columns this card's rows carry. Resolved once per exercise. */
  gridMode?: SetGridMode
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
   * Same reason ExerciseCard's take `localId`: these were pre-bound closures,
   * rebuilt on every card render, so all six props changed identity and `memo`
   * never held. The row already receives its own `index`.
   */
  onActivate: (index: number) => void
  onChange: (index: number, patch: Partial<DraftSet>) => void
  onRemove: (index: number) => void
  /** Tick the set complete (green) / uncomplete — only green sets are recorded. */
  onToggleDone?: (index: number) => void
  /** Unilateral: split a normal set into Left/Right (absent once already split). */
  onSplit?: (index: number) => void
  /** Tapping a set that holds a record opens the record sheet. */
  onPrTap?: (index: number) => void
}) {
  // 3.75 must display as 3.75, not "3.8" — quarter-step plates are real loads.
  const weightLabel = set.weightKg % 1 === 0 ? set.weightKg.toFixed(0)
    : (set.weightKg * 10) % 1 === 0 ? set.weightKg.toFixed(1) : set.weightKg.toFixed(2)

  /** Everything the set can be that is not its two numbers. See `SetActionSheet`. */
  const [actionSheet, setActionSheet] = useState(false)

  /**
   * Show the load half at all? "0kg × 15 reps" on a Hanging Knee Raise states a
   * weight that does not exist and buries the only number the set has. A
   * bodyweight movement carrying actual load (weighted pull-up) promotes the
   * WHOLE CARD back to `loaded`, which is why this is one flag from the parent
   * and not a per-row test: rows of one exercise must agree about their columns.
   */
  const showLoad = gridMode === 'loaded'

  /**
   * The tuner's load controls are LATCHED open, not derived from the value.
   *
   * `NumberField` commits on every keystroke, so typing "0.5" commits 0 on the
   * first character. Deriving the controls from `weightKg > 0` therefore
   * unmounted the input mid-word: focus lost, keyboard dismissed, row back to
   * bodyweight. Any sub-1 kg load — a 0.5 kg magnet on a dip belt — was
   * untypeable on exactly the movements this feature is for.
   */
  const [loadOpen, setLoadOpen] = useState(set.weightKg > 0)
  useEffect(() => {
    if (set.weightKg > 0) setLoadOpen(true)
    else if (!active) setLoadOpen(false)
  }, [set.weightKg, active])
  const showLoadControls = showLoad || loadOpen

  /**
   * A HOLD gets no load affordance at all. Weight is invisible to the PR engine
   * on a timed set but NOT to `sessionVolumeKg`, which has no timed concept and
   * multiplies weight by `reps` — i.e. by SECONDS. One tap plus a 60 s plank
   * would inject 150 kg of phantom tonnage into the week.
   */
  const canAddLoad = loadable && !timed

  const isWarm = set.setType === 'warmup'
  const isFail = set.setType === 'failure'
  const isDrop = set.setType === 'dropset'
  // Green = committable = will be recorded on finish.
  const done = isSetCommitted(set)
  const hasPr = prAxes.length > 0

  const nudgeWeight = useCallback((delta: number) => {
    // Snap to the 0.25 kg grid (quarter-kg microloads), not the old 0.5 grid.
    onChange(index, { weightKg: Math.max(0, Math.round((set.weightKg + delta) * 4) / 4) })
  }, [onChange, index, set.weightKg])
  const nudgeReps = useCallback((delta: number) => {
    onChange(index, { reps: Math.max(1, set.reps + delta) })
  }, [onChange, index, set.reps])

  /**
   * ── FAILURE AND A 10 ARE THE SAME CLAIM, SO THEY MOVE TOGETHER ─────────────
   * The ladder's top stop already tagged the set `failure` on the way in, and
   * nothing carried the fact back: tapping `F` left the rating untouched, and
   * clearing a 10 left the `F` chip lit. So a set could read "F" at RPE 8, and
   * "10 · Failure" with no tag — two controls describing one fact and
   * disagreeing about it.
   *
   * The sync is strict and narrow. Only the FAILURE tag is mirrored, only while
   * ratings are tracked at all, and only over a rating that IS the failure stop.
   */
  const pickType = (choice: SetTypeValue) => {
    void tapLight()
    const nextType = choice === 'normal' ? undefined : choice
    const patch: Partial<DraftSet> = { setType: nextType }
    if (trackRpe) {
      if (nextType === 'failure') patch.rpe = FAILURE_RPE
      else if (isFail && set.rpe === FAILURE_RPE) patch.rpe = undefined
    }
    onChange(index, patch)
  }


  const sideColor = set.side === 'L' ? '#8E9AAC' : set.side === 'R' ? '#E0703C' : null
  // The badge box is 28px. "Warmup" and "Dropset" were never going to fit, so
  // the box holds only what is guaranteed to (a digit, a letter, a medal) and
  // the grid stays aligned however the set is typed.
  //
  // ── THE LEFT COLUMN IS THE SET'S IDENTITY ──
  // It used to read `S1` and carry the type as a separate chip further along
  // the row, so a warm-up announced itself twice — once as a number it is not
  // and once as a tag. Hevy puts the letter WHERE the number goes, because a
  // warm-up has no ordinal: it is the W. A RECORD outranks the ordinal for the
  // same reason, and a medal is legible from arm's length.
  const typeBadge = isWarm ? { label: 'W', full: 'Warm-up', color: ORANGE }
    : isFail ? { label: 'F', full: 'Taken to failure', color: DANGER }
    : isDrop ? { label: 'D', full: 'Drop set', color: DROP }
    : null
  const showMedal = hasPr && !set.side
  const badge = set.side ?? typeBadge?.label ?? `${displayNum ?? index + 1}`
  const badgeColor = set.side ? sideColor : showMedal ? GOLD : typeBadge?.color ?? null

  const setTypeValue: SetTypeValue = isWarm ? 'warmup' : isFail ? 'failure' : isDrop ? 'dropset' : 'normal'
  const ordinal = displayNum ?? index + 1
  const setLabel = `Set ${ordinal}${set.side === 'L' ? ' · Left' : set.side === 'R' ? ' · Right' : ''}`

  /**
   * ── THE BADGE HAS TWO GESTURES ─────────────────────────────────────────────
   * Tap opens this set's RECORDS — the numbers behind the medal, which existed
   * nowhere until the sheet was written and were the whole reason the trophy
   * strip was on a second line eating 22px of every rated row. When the set
   * holds no record there is nothing to show, so a tap falls through to set
   * options rather than opening an empty sheet: a control that displays a value
   * should always do something when you touch it.
   *
   * Hold opens set options always. 500ms, cancelled by 8px of movement so a
   * scroll started on the badge never fires it, and confirmed with a haptic on
   * the threshold so the gesture tells you it has happened before you let go.
   */
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressOrigin = useRef<{ x: number; y: number } | null>(null)
  const wasLongPress = useRef(false)
  useEffect(() => () => { if (pressTimer.current) clearTimeout(pressTimer.current) }, [])

  const clearPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null }
    pressOrigin.current = null
  }
  const badgeDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    void tapLight()
    wasLongPress.current = false
    pressOrigin.current = { x: e.clientX, y: e.clientY }
    pressTimer.current = setTimeout(() => {
      wasLongPress.current = true
      void tapSuccess()
      setActionSheet(true)
    }, LONG_PRESS_MS)
  }
  const badgeMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const o = pressOrigin.current
    if (!o) return
    if (Math.abs(e.clientX - o.x) > 8 || Math.abs(e.clientY - o.y) > 8) clearPress()
  }
  const badgeUp = () => {
    clearPress()
    if (wasLongPress.current) return
    if (hasPr && onPrTap) onPrTap(index)
    else setActionSheet(true)
  }

  return (
    <div
      // ── DONE OUTRANKS ACTIVE ──
      // The expanded row used to drop its green the moment you opened it, so
      // the one state the tick exists to show disappeared exactly when you were
      // editing the set it belonged to. Green stays; the active row is
      // distinguished by its ring instead.
      className={`rounded-lg transition-colors ${
        done ? ''
        : active ? 'bg-white/[0.045]'
        : isWarm ? 'bg-[#E0703C]/[0.06]' : ''}`}
      style={{
        // The ramp, not a fill — see DONE_ROW_BG. A `background` (not
        // `backgroundColor`) so it can only be set from here, which is why the
        // `done` branch above no longer carries a Tailwind class.
        ...(done ? { background: DONE_ROW_BG } : null),
        ...(subRow && sideColor
          ? { borderLeft: `2px solid ${sideColor}`, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 }
          : null),
        // The active ring outranks the done ramp on purpose: DONE OUTRANKS
        // ACTIVE for COLOUR (the green stays), but the row you are editing still
        // has to say so, and a ring is the one signal the ramp cannot swallow.
        ...(active ? { boxShadow: 'inset 0 0 0 1px rgba(224,112,60,0.45)' } : null),
      }}
    >
      {/* ── The row. One line, always. ──
          Three flex children: the badge, the grid, the tick. The outer two are
          buttons, so they cannot be tracks inside the grid — the grid itself is
          the row's activate button, and a button cannot contain a button. The
          header above reproduces this exact frame. */}
      <div className={`flex items-center ${SET_FRAME_GAP} px-2 py-1`}>
        <button
          type="button"
          onPointerDown={badgeDown}
          onPointerMove={badgeMove}
          onPointerUp={badgeUp}
          onPointerCancel={clearPress}
          onContextMenu={(e) => e.preventDefault()}
          className={`${SET_BADGE_W} h-7 shrink-0 rounded-lg flex items-center justify-center
                      helix-num text-[12px] font-bold uppercase tabular-nums select-none
                      active:scale-95 transition-transform`}
          style={{
            touchAction: 'none',
            /* ── THE BADGE IS AN OBJECT, NOT A LABEL ──
               An untyped set drew a 1px outline around nothing: at 28px, against
               a near-black row, that is a rectangle you have to look for rather
               than a control you reach for — and it is the row's primary tap
               target, holding two gestures. It gets a surface, and both states
               get the same 1px top highlight and 1px drop, so a plain set and a
               typed one are lit from the same place and only the HUE tells them
               apart. */
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 1px 2px rgba(0,0,0,0.4)',
            ...(badgeColor
              ? { color: badgeColor, background: `${badgeColor}26`, border: `1px solid ${badgeColor}5e` }
              : { color: 'var(--color-text)', background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.12)' }),
          }}
          title={hasPr ? 'Personal record — tap for details, hold for set options' : 'Tap or hold for set options'}
          aria-label={showMedal ? `${setLabel} — personal record. Tap for details, hold for set options`
            : typeBadge ? `${typeBadge.full}, ${setLabel}. Hold for set options`
            : `${setLabel}. Hold for set options`}
        >
          {showMedal ? <Medal className="w-3.5 h-3.5" aria-hidden="true" /> : badge}
        </button>

        <button
          type="button"
          onClick={() => onActivate(index)}
          className="flex-1 min-w-0 text-left min-h-[36px] flex items-center"
          aria-expanded={active}
          aria-label={`Edit ${setLabel}`}
        >
          <span className={`w-full ${setGridFor(gridMode)}`}>
            {/* ── PREVIOUS ──
                What this same set number was last time you did the movement, on
                ANY routine. It sits before today's numbers because that is the
                order you read them in — what it was, then what it is — and it
                carries its UNIT, because a reference costs nothing to read or it
                is not a reference. Dimmed and never editable: a reference that
                looks like an input gets typed into. */}
            <span className={`helix-num text-[11px] tabular-nums text-muted/70 truncate ${SET_CELL_LEAD}`}
              title={prev ? 'Last time you did this movement' : undefined}>
              {prev
                ? gridMode === 'time' ? `${prev.reps}s`
                  : prev.weightKg > 0 ? `${prev.weightKg}kg × ${prev.reps}`
                  : `${prev.reps}`
                : '—'}
            </span>

            {/* KG. The track is always here so every value in the deck shares an
                edge; on an unloaded movement it is simply empty — see setGrid. */}
            {showLoad ? (
              // No `kg` suffix: the column header says it once, above. Printed
              // per row it cost ~17px on the widest real load (`102.25kg`) and
              // pushed it out of its own box at 360px — the same "one statement
              // of one fact" rule that moved the unit out of the tuner's field.
              <span className={`helix-num text-fluid-base font-bold tabular-nums truncate ${SET_CELL_VALUE} ${isWarm ? 'text-muted' : 'text-text'}`}
                title={`${weightLabel} kg`}>
                {weightLabel}
              </span>
            ) : <span aria-hidden="true" />}

            {/* REPS (or seconds on a hold). */}
            <span className={`helix-num text-fluid-base font-bold tabular-nums truncate ${SET_CELL_VALUE} ${isWarm ? 'text-muted' : 'text-text'}`}
              title={timed ? `${set.reps} seconds` : `${set.reps} reps`}>
              {set.reps}
            </span>

            {/* ── EFFORT ──
                The rating, as a NUMBER in its own colour. It was a word on a
                second line — "VERY HARD" in a chip that made every rated row
                22px taller than an unrated one, so the deck grew as you logged
                it. At 360px there is no column wide enough for the word beside
                a weight and a rep count; the number fits in 30px, the colour
                carries the severity, and the word is one hover or one
                screen-reader stop away.

                A value inherited from last session renders dimmer, because it is
                a proposal until you confirm it. A cleared-but-stale rating shows
                the dot it always did. */}
            <span className={`helix-num text-[11px] font-bold tabular-nums leading-none ${SET_CELL_VALUE}`}>
              {set.rpe != null ? (
                <span
                  style={{ color: rpeColor(set.rpe), opacity: set.rpeSeed != null ? 0.6 : 1 }}
                  title={set.rpeSeed != null
                    ? `${rpeLabel(set.rpe)} — carried from last session, tap the set to confirm`
                    : rpeLabel(set.rpe)}
                  aria-label={`Effort ${rpeLabel(set.rpe)}`}
                >
                  {set.rpe}
                </span>
              ) : set.rpeStale && set.rpeSeed != null ? (
                /* ── THE WITHDRAWN RATING, STILL LEGIBLE ──
                   This was a bare 1.5px dot: a set reading "10" lost its number
                   the moment you added a rep, and the replacement said only
                   that SOMETHING wanted answering, not what it had been. The
                   number stays, dim and dashed — the dash is what tells the two
                   states apart in a 28px column, where a second glyph will not
                   fit and a colour change alone would read as a different
                   rating rather than an unconfirmed one. */
                <span
                  style={{ color: rpeColor(set.rpeSeed), opacity: 0.45, borderBottom: `1px dashed ${ORANGE}` }}
                  title={`${rpeLabel(set.rpeSeed)} — carried from last session and no longer matches this set. Tap the set to confirm or change it.`}
                  aria-label={`Effort ${rpeLabel(set.rpeSeed)}, unconfirmed — this set got harder`}
                >
                  {set.rpeSeed}
                </span>
              ) : set.rpeStale ? (
                <span className="inline-block w-1.5 h-1.5 rounded-full align-middle" style={{ background: ORANGE }}
                  title="Heavier than last time — rate this set" aria-label="Needs an effort rating" />
              ) : null}
            </span>
          </span>
        </button>

        {onToggleDone && (
          <button
            type="button"
            // Haptic on pointer-DOWN, commit on click. The press highlight fires
            // on touch-down, so firing the haptic on release put the two senses
            // on different frames — the one thing that reliably breaks the
            // illusion. Committing still happens on click, so dragging off the
            // button still cancels.
            onPointerDown={() => { void tapLight() }}
            onClick={() => { onToggleDone(index) }}
            aria-pressed={done}
            aria-label={done ? `Mark ${setLabel} not done` : `Mark ${setLabel} done`}
            className={`${SET_TAIL_W} shrink-0 min-h-[34px] rounded-lg flex items-center justify-center
                        active:scale-95 transition-[color,background-color,border-color,transform] duration-150`}
            style={done
              ? {
                color: '#fff',
                background: DONE_TICK_BG,
                border: `1px solid ${GREEN_LIGHT}66`,
                // A single soft bloom, at the alpha the deck's other lit
                // controls use. Not a drop shadow: this button sits INSIDE the
                // row's own green, and an offset shadow there reads as grime.
                boxShadow: `0 0 12px ${GREEN}59, inset 0 1px 0 rgba(255,255,255,0.22)`,
              }
              : {
                color: 'var(--color-muted)',
                // Not `transparent`. An untouched tick is the single most
                // pressed control on the deck and it was the only one drawn as
                // an outline around nothing — same surface and same light
                // direction as the badge and Add set, so the card's raised
                // things are raised consistently and the one you press thirty
                // times a session looks pressable before you press it.
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.14)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 2px rgba(0,0,0,0.4)',
              }}
          >
            <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* ── Tuner (active row only) ──
          BOTH NUMBERS ON ONE LINE.

          It has been three shapes. First, six controls on a single non-wrapping
          flex line, where the number fields were `flex-1` fighting four steppers
          — at 390px that is a few characters each, and since `globals.css`
          forces 16px on every form control (the iOS zoom guard), "8.75" clipped
          inside its own input. Then two full-width rows, each with a five-segment
          pill: nothing clipped, and one set cost ~110px of tuner.

          This is the middle. Each number keeps a stepper either side and half the
          row — enough for `102.25` at the forced 16px, which is the constraint
          that started all this — and the microloads become a gesture on the ±
          rather than four more buttons (see `useHoldRepeat`). One line, both
          numbers, no clipping. */}
      {active && (
        <div className="px-2 pb-2 pt-0.5 space-y-2">
          <div className={`grid gap-2 ${showLoadControls ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {showLoadControls && (
              <TunerBlock label="Weight · kg">
                <Step
                  label="−" ariaLabel={`${PLATE_STEP}kg less — hold for ${FINE_STEP}kg steps`}
                  onTap={() => nudgeWeight(-PLATE_STEP)} onHold={() => nudgeWeight(-FINE_STEP)}
                />
                <NumberField
                  value={set.weightKg}
                  inputMode="decimal"
                  ariaLabel={`Weight for ${setLabel}`}
                  onCommit={(n) => onChange(index, { weightKg: Math.max(0, n) })}
                />
                <Step
                  label="+" ariaLabel={`${PLATE_STEP}kg more — hold for ${FINE_STEP}kg steps`}
                  onTap={() => nudgeWeight(+PLATE_STEP)} onHold={() => nudgeWeight(+FINE_STEP)}
                />
              </TunerBlock>
            )}

            <TunerBlock label={timed ? 'Seconds' : 'Reps'}>
              <Step
                label="−" ariaLabel={timed ? 'One second less — hold to repeat' : 'One rep less — hold to repeat'}
                onTap={() => nudgeReps(-1)} onHold={() => nudgeReps(-1)}
              />
              <NumberField
                value={set.reps}
                inputMode="numeric"
                ariaLabel={`${timed ? 'Seconds' : 'Reps'} for ${setLabel}`}
                onCommit={(n) => onChange(index, { reps: Math.max(1, Math.round(n)) })}
              />
              <Step
                label="+" ariaLabel={timed ? 'One second more — hold to repeat' : 'One rep more — hold to repeat'}
                onTap={() => nudgeReps(+1)} onHold={() => nudgeReps(+1)}
              />
            </TunerBlock>
          </div>

          {/* Weighted variants stay one tap away — a belt on a dip, a plate held
              on a knee raise. Revealing the controls is enough; the load stays 0
              until the user sets one, so a stray tap cannot invent tonnage. */}
          {!showLoadControls && canAddLoad && (
            <button
              type="button"
              onClick={() => { void tapLight(); setLoadOpen(true) }}
              aria-label={`Add load to ${setLabel}`}
              className="w-full rounded-lg border border-white/[0.10] bg-white/[0.04] min-h-[36px]
                         text-[11px] font-semibold text-muted active:scale-95 transition-transform"
            >
              + Add load
            </button>
          )}

          {/* ── Effort, on every set that has one ──
              It used to skip warm-ups, on the reasoning that a warm-up is not
              the effort the question is about. That is true of a RECORD, and the
              PR engine still ignores them — but it is not true of the log: a
              warm-up that felt like a working set is exactly the thing worth
              writing down, and so is the second half of a drop set. Rating one
              changes no verdict anywhere; it is a note to yourself. */}
          {trackRpe && (
            <RpeLadder
              value={set.rpe}
              // The remembered value memory has withdrawn from `rpe`. The ladder
              // keeps drawing it — and keeps its steppers — so the one gesture
              // that made the rating disappear no longer takes the controls
              // that restore it. See RpeLadder's `seedValue`.
              seedValue={set.rpe == null ? set.rpeSeed : undefined}
              stale={set.rpeStale}
              seeded={set.rpeSeed != null}
              setLabel={`set ${ordinal}`}
              // The rating, and only the rating. The `F` tag used to be mirrored
              // here by hand — which is why the ± steppers, who call the same
              // `onPick`, never set it: nudging 9.5 up to 10 left a set reading
              // "10 · FAILURE" with no tag. `cascadeSetEdit` derives the tag
              // from the rating now, so every path agrees by construction.
              onPick={(choice) => onChange(index, { rpe: choice?.rpe })}
            />
          )}
        </div>
      )}

      <SetActionSheet
        open={actionSheet}
        onClose={() => setActionSheet(false)}
        setLabel={setLabel}
        value={setTypeValue}
        onPick={pickType}
        onSplit={onSplit ? () => onSplit(index) : undefined}
        onRemove={() => onRemove(index)}
      />
    </div>
  )
})

/**
 * One labelled number and its two steppers.
 *
 * The label is what lets the block be half a line wide without ambiguity: a
 * number field flanked by ± could be either of the two values, and the reader
 * should not have to infer it from which one has a `kg` after it.
 *
 * ── THE UNIT LIVES IN THE LABEL, NOT IN THE FIELD ───────────────────────────
 * It used to be both: a block headed WEIGHT containing "8.75 KG", and a block
 * headed REPS containing "14 REPS". Two statements of one fact, and the second
 * was charging rent — at 360px the suffix crowded the number hard enough that
 * "8.75KG" ran together with no space, on the exact control this exists to make
 * readable.
 */
function TunerBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-muted/60">{label}</span>
      {/* One pill, hairline-divided. A single bordered container rather than
          separate bordered buttons: three outlines in a 38px row reads as three
          objects, and they are one control. */}
      <div className="flex items-stretch rounded-xl border border-border bg-surface-2 overflow-hidden min-h-[38px]">
        {children}
      </div>
    </div>
  )
}

/**
 * A ± segment of a tuner pill. Tap for the coarse step, hold for the fine one.
 *
 * 38px rather than the 44px it was: at 44px the two blocks plus their fields do
 * not fit on one line at 360px, and this control's height was two thirds of why
 * the tuner was as tall as it was. It is still comfortably above the 36px the
 * WCAG target-size minimum asks for, and the number beside it is a second, much
 * larger target for the same job.
 */
function Step({ label, ariaLabel, onTap, onHold }: {
  label: string
  ariaLabel: string
  onTap: () => void
  onHold: () => void
}) {
  const hold = useHoldRepeat({ onTap, onHold })
  return (
    <button
      type="button"
      {...hold}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="shrink-0 px-3 min-h-[38px] text-[15px] font-bold text-text tabular-nums
                 select-none active:scale-95 transition-transform"
      style={{ touchAction: 'none' }}
    >
      {label}
    </button>
  )
}

/**
 * Typeable numeric field. Keeps a local text buffer while focused so partial
 * entries ("16", "16.", "16.2") don't fight the parsed value; commits every
 * valid parse up to the parent. Weight is NOT snapped to the 0.25 grid on typed
 * input — the user gets the exact number they enter (the ± steps still snap).
 *
 * ── IT IS SIZED, NOT SQUEEZED ────────────────────────────────────────────────
 * `globals.css` forces `font-size: 16px` on every form control on a coarse
 * pointer — the iOS auto-zoom guard, and non-negotiable. So the width has to be
 * budgeted for 16px glyphs rather than for the 13px the surrounding type
 * suggests: `102.25` is six characters plus a point. It takes the whole centre
 * of the pill (`flex-1`), and centring means an over-long value is visibly
 * over-long rather than silently scrolled out of frame.
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
      className="flex-1 min-w-0 bg-transparent text-center font-bold tabular-nums text-text outline-none px-0.5"
    />
  )
}
