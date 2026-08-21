'use client'

import { memo, useEffect, useState } from 'react'
import { Check, Medal, Trophy } from 'lucide-react'
import { tapLight } from '@/lib/native/haptics'
import { isSetCommitted, type DraftSet } from '@/lib/sessions/draft'
import { prAxisLabel, type PrAxis } from '@/lib/training/prEngine'
import { rpeColor, rpeLabel } from '@/lib/training/effort'
import { RpeLadder } from './RpeLadder'
import { SetActionSheet, type SetTypeValue } from './SetActionSheet'
import { setGridFor, SET_BADGE_W, SET_SUBLINE_INDENT, SET_TAIL_W, type SetGridMode } from './setGrid'

/** Plate step (the outer ± of the weight pill) and the microload step (the inner ±). */
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
 * fields with inline steppers and an effort ladder); tap the badge for
 * everything else the set can be.
 *
 * ── THE ROW IS A TABLE ROW ───────────────────────────────────────────────────
 * It used to be a four-column grid with no header above it, and two of those
 * columns were doing more than one job: today's weight AND reps AND a type chip
 * AND a stale-rating dot shared one `flex` cell, while the last column was a
 * fixed 44px holding words like "VERY HARD" and "MAX EFFORT". The first made
 * the numbers zig-zag down the card, because a cell that packs a variable
 * number of children cannot line up with the cell below it. The second
 * truncated: at 10px bold uppercase, 44px is about six characters.
 *
 * Now: SET · PREVIOUS · KG · REPS · ✓, one job per column, a header row above
 * them (`setGrid.ts` owns the template so the two cannot drift), and everything
 * of variable width — the effort word, the record chips — on a second line that
 * can be as wide as it needs to be.
 *
 * ── AND ITS COLUMNS DEPEND ON THE MOVEMENT ───────────────────────────────────
 * `gridMode` comes from the card, resolved once for every row in it. A hold has
 * no KG column and a knee raise has no KG column, because neither has a KG. See
 * `SetGridMode`.
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
export const SetEditorRow = memo(function SetEditorRow({ index, displayNum, subRow = false, set, prev, active, timed = false, bodyweight = false, gridMode = 'loaded', trackRpe = false, prAxes = [], onActivate, onChange, onRemove, onToggleDone, onSplit, onPrTap }: {
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
   * hold). Decides whether the tuner offers an "Add load" escape hatch — the
   * COLUMN question is `gridMode`'s, and the card answers it once.
   */
  bodyweight?: boolean
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
  const hasPr = prAxes.length > 0

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
  // The badge box is 28px. "Warmup" and "Dropset" are six and seven uppercase
  // characters and were never going to fit — they spilled into the load column
  // 10px away. So the box holds only what is guaranteed to fit (a digit, a
  // letter, a medal) and the grid stays aligned however the set is typed.
  //
  // ── THE LEFT COLUMN IS THE SET'S IDENTITY, AND NOW ITS CONTROL ──
  // It used to read `S1` and carry the type as a separate chip further along
  // the row, which meant a warm-up announced itself twice — once as a number it
  // is not (a warm-up is not "set 1 of 4") and once as a tag. Hevy puts the
  // letter WHERE the number goes, because a warm-up has no ordinal: it is the W.
  //
  // A RECORD OUTRANKS THE ORDINAL for the same reason. The set number is the
  // least interesting fact about the one set of the day that beat something,
  // and a medal in the identity slot is legible at a glance from arm's length,
  // which is the distance a phone on a bench actually gets read from. A side
  // still wins the box (L/R is the more specific fact) and its type falls back
  // to a chip on the second line.
  const typeBadge = isWarm ? { label: 'W', full: 'Warm-up', color: ORANGE }
    : isFail ? { label: 'F', full: 'Taken to failure', color: DANGER }
    : isDrop ? { label: 'D', full: 'Drop set', color: DROP }
    : null
  const showMedal = hasPr && !set.side
  const badge = set.side ?? typeBadge?.label ?? `${displayNum ?? index + 1}`
  const badgeColor = set.side ? sideColor : showMedal ? GOLD : typeBadge?.color ?? null
  // Only when the box could not carry it — a sided row that is also to failure,
  // or a row whose box the medal took.
  const typeTag = typeBadge && (set.side || showMedal)
    ? { label: set.side ? `${typeBadge.label}-${set.side}` : typeBadge.label, full: typeBadge.full, color: typeBadge.color }
    : null

  const setTypeValue: SetTypeValue = isWarm ? 'warmup' : isFail ? 'failure' : isDrop ? 'dropset' : 'normal'
  const subLine = set.rpe != null || hasPr || typeTag != null
  const ordinal = displayNum ?? index + 1
  const setLabel = `Set ${ordinal}${set.side === 'L' ? ' · Left' : set.side === 'R' ? ' · Right' : ''}`

  return (
    <div
      // ── DONE OUTRANKS ACTIVE ──
      // The expanded row used to drop its green the moment you opened it, so
      // the one state the tick exists to show disappeared exactly when you were
      // editing the set it belonged to — and a row you reopened to fix a rep
      // count looked identical to one you had never completed. Green stays;
      // the active row is distinguished by its ring instead.
      //
      // The green is now a FULL-WIDTH BAND with no border of its own. A ticked
      // set is not an outlined object among unticked ones, it is a stripe you
      // can find without reading — which is how it reads on the reference and
      // how it reads from three feet away.
      className={`rounded-lg transition-colors ${
        done ? 'bg-[#3E9E7A]/[0.13]'
        : active ? 'bg-white/[0.045]'
        : isWarm ? 'bg-[#E0703C]/[0.06]' : ''}`}
      style={{
        ...(subRow && sideColor
          ? { borderLeft: `2px solid ${sideColor}`, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 }
          : null),
        // The active ring, drawn as a shadow so it survives the done colours.
        ...(active ? { boxShadow: 'inset 0 0 0 1px rgba(224,112,60,0.45)' } : null),
      }}
    >
      {/* ── Summary line (always visible) ──
          One job per column. Anything whose width depends on its value — the
          effort word, the record chips, a type tag the badge could not carry —
          lives on the second line, where nothing has to line up with anything
          and so nothing has to be cut short.

          Three flex children: the badge, the grid, the tick. The outer two are
          buttons, so they cannot be tracks inside the grid — the grid itself is
          the row's activate button, and a button cannot contain a button. The
          header above reproduces this exact frame. */}
      <div className="flex items-center gap-2 px-2 py-1">
        {/* SET — the identity: side, then record, then type, then ordinal. And
            the way in to everything the set can BE: type, split, remove. A
            control that displays a value is the obvious place to change it. */}
        <button
          type="button"
          onPointerDown={() => { void tapLight() }}
          onClick={() => setActionSheet(true)}
          className={`${SET_BADGE_W} h-7 shrink-0 rounded-md flex items-center justify-center
                      helix-num text-[12px] font-bold uppercase tabular-nums
                      active:scale-95 transition-transform`}
          style={badgeColor
            ? { color: badgeColor, background: `${badgeColor}1f`, border: `1px solid ${badgeColor}55` }
            : { color: 'var(--color-text)', border: '1px solid rgba(255,255,255,0.10)' }}
          title={showMedal ? 'Personal record — tap for set options' : typeBadge ? `${typeBadge.full} — tap for set options` : 'Set options'}
          aria-label={showMedal ? `${setLabel} — personal record. Set options`
            : typeBadge ? `${typeBadge.full}, ${setLabel}. Set options`
            : `${setLabel}. Set options`}
        >
          {showMedal
            ? <Medal className="w-3.5 h-3.5" aria-hidden="true" />
            : badge}
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
                order the reference reads them in — what it was, then what it is
                — and because a target you glance at belongs to the left of the
                value you are about to type.

                It carries its UNIT. "17.5×12" next to a bare 17.5 in the KG
                column made the reader supply the kg themselves; the whole point
                of a reference is that it costs nothing to read. On an unloaded
                movement there is no weight to quote, so it quotes the reps —
                or the seconds, which is the only number a hold has.

                Dimmed and never editable: a reference that looks like an input
                gets typed into. */}
            <span className="helix-num text-[11px] tabular-nums text-muted/70 truncate"
              title={prev ? 'Last time you did this movement' : undefined}>
              {prev
                ? gridMode === 'time' ? `${prev.reps}s`
                  : prev.weightKg > 0 ? `${prev.weightKg}kg × ${prev.reps}`
                  : `${prev.reps}`
                : '—'}
            </span>

            {/* KG — its own column, so every weight in the card shares an edge.
                Absent entirely on an unloaded movement: see `SetGridMode`. */}
            {showLoad && (
              <span className={`helix-num text-fluid-base font-bold tabular-nums truncate ${isWarm ? 'text-muted' : 'text-text'}`}>
                {weightLabel}<span className="text-[10px] text-muted font-normal ml-0.5">kg</span>
              </span>
            )}

            {/* REPS (or seconds on a hold). */}
            <span className={`helix-num text-fluid-base font-bold tabular-nums truncate ${isWarm ? 'text-muted' : 'text-text'}`}>
              {set.reps}{timed && <span className="text-[10px] text-muted font-normal ml-0.5">s</span>}
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
            aria-label={done ? `Mark ${setLabel} not done` : `Mark ${setLabel} done`}
            className={`${SET_TAIL_W} shrink-0 min-h-[34px] rounded-lg flex items-center justify-center
                        active:scale-95 transition-[color,background-color,border-color,transform] duration-150`}
            style={done
              ? { color: '#fff', background: GREEN, border: `1px solid ${GREEN}` }
              : { color: 'var(--color-muted)', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)' }}
          >
            <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* ── Second line: effort, records, and any type the badge could not carry ──
          Everything here is variable-width, which is exactly why it is not in
          the grid. The effort word used to live in a fixed 44px column and be
          ellipsized to "VER…"; here it is a chip that is as wide as the word.

          Records come from the SAME engine that writes personal_records at
          commit — a badge shown here is a badge that gets recorded. The trophy
          run is its own control: it used to sit INSIDE the row's activate
          button, where it could not be tapped independently (a button cannot
          hold a button) and any tap opened the tuner instead. Tapping it now
          opens the record sheet, which is the only place the numbers behind the
          badge — what was beaten, and by how much — actually exist. */}
      {subLine && (
        <div className={`flex items-center flex-wrap gap-1 ${SET_SUBLINE_INDENT} pr-2 pb-1.5 -mt-0.5`}>
          {set.rpe != null && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide leading-none px-1.5 py-1 rounded"
              style={{
                color: rpeColor(set.rpe),
                background: `${rpeColor(set.rpe)}1a`,
                border: `1px solid ${rpeColor(set.rpe)}55`,
                // A value inherited from last session renders dimmer, because it
                // is a proposal until you either confirm it or commit.
                opacity: set.rpeSeed != null ? 0.6 : 1,
              }}
              title={set.rpeSeed != null ? 'Carried from last session — tap the set to confirm or change' : undefined}
            >
              {rpeLabel(set.rpe)}
            </span>
          )}
          {/* Cleared because the load or the reps went up. One dot, no banner. */}
          {set.rpe == null && set.rpeStale && (
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: ORANGE }}
              title="Heavier than last time — rate this set" aria-label="Needs an effort rating" />
          )}
          {typeTag && (
            <span className="text-[10px] font-bold uppercase tracking-wide leading-none px-1.5 py-1 rounded"
              style={{ color: typeTag.color, background: `${typeTag.color}1f`, border: `1px solid ${typeTag.color}55` }}
              title={typeTag.full} aria-label={typeTag.full}>
              {typeTag.label}
            </span>
          )}
          {hasPr && (
            <button
              type="button"
              onPointerDown={onPrTap ? () => { void tapLight() } : undefined}
              onClick={onPrTap ? () => onPrTap(index) : undefined}
              disabled={!onPrTap}
              className={`flex items-center gap-1 flex-wrap text-left
                          ${onPrTap ? 'active:scale-[0.97] transition-transform duration-150' : ''}`}
              aria-label={onPrTap ? `Records on this set — ${prAxes.map((a) => prAxisLabel(a, timed)).join(', ')}` : undefined}
            >
              <Trophy className="w-2.5 h-2.5 shrink-0" style={{ color: GOLD }} aria-hidden="true" />
              {prAxes.map((axis) => (
                <span key={axis} className="text-[10px] font-bold uppercase tracking-wide leading-none px-1.5 py-1 rounded"
                  style={{ color: GOLD, background: `${GOLD}1a`, border: `1px solid ${GOLD}55` }}
                  title={`Personal record — ${prAxisLabel(axis, timed)}`}>
                  {prAxisLabel(axis, timed)}
                </span>
              ))}
            </button>
          )}
        </div>
      )}

      {/* ── Tuner (active row only) ──
          ONE VALUE PER LINE, EACH ON ONE LINE.

          It used to open with six controls on a single non-wrapping flex line —
          `− weight + × − reps +` — where both number fields were `flex-1`
          competing for what the four 34px steppers and two unit labels left
          behind. On a 390px phone that is a few characters each, and since
          `globals.css` forces 16px on every form control (the iOS zoom guard),
          "8.75" and "14" were clipping inside their own inputs.

          The fix for that was two half-width blocks, each two tiers tall: a
          stepper row, then a separate bordered microload pair underneath. It
          stopped the clipping and cost ~250px of height for one set.

          This is the same information in one tier. Each value gets the FULL
          width — which is what actually resolves the cramping — and both step
          sizes are segments of the value's own pill rather than a second row:

              Weight · kg   [ −2.5 │ −0.25 │  8.75  │ +0.25 │ +2.5 ]

          The order you reach for them is unchanged: the numbers, then effort
          (asked every working set). Type, Split and Remove are asked rarely and
          one of them is destructive, so they left the row entirely — the badge
          opens them. See `SetActionSheet`. */}
      {active && (
        <div className="px-2 pb-2 pt-0.5 space-y-2">
          {showLoadControls && (
            <TunerRow label="Weight · kg">
              <Step label={`−${PLATE_STEP}`} ariaLabel={`${PLATE_STEP}kg less`} onClick={() => nudgeWeight(-PLATE_STEP)} />
              <Divider />
              {/* The quarter-kg grid: microloading is how a 3.75kg lateral raise
                  progresses, and it is not something you want to open a keyboard
                  for. Inside the same pill as the plate steps, so the two sizes
                  read as one control with a coarse and a fine end. */}
              <Step label={`−${FINE_STEP}`} ariaLabel={`${FINE_STEP}kg less`} fine onClick={() => nudgeWeight(-FINE_STEP)} />
              <Divider />
              <NumberField
                value={set.weightKg}
                inputMode="decimal"
                ariaLabel={`Weight for ${setLabel}`}
                onCommit={(n) => onChange(index, { weightKg: Math.max(0, n) })}
              />
              <Divider />
              <Step label={`+${FINE_STEP}`} ariaLabel={`${FINE_STEP}kg more`} fine onClick={() => nudgeWeight(+FINE_STEP)} />
              <Divider />
              <Step label={`+${PLATE_STEP}`} ariaLabel={`${PLATE_STEP}kg more`} onClick={() => nudgeWeight(+PLATE_STEP)} />
            </TunerRow>
          )}

          <TunerRow label={timed ? 'Seconds' : 'Reps'}>
            <Step label="−" ariaLabel={timed ? 'One second less' : 'One rep less'} onClick={() => nudgeReps(-1)} />
            <Divider />
            <NumberField
              value={set.reps}
              inputMode="numeric"
              ariaLabel={`${timed ? 'Seconds' : 'Reps'} for ${setLabel}`}
              onCommit={(n) => onChange(index, { reps: Math.max(1, Math.round(n)) })}
            />
            <Divider />
            <Step label="+" ariaLabel={timed ? 'One second more' : 'One rep more'} onClick={() => nudgeReps(+1)} />
          </TunerRow>

          {/* Weighted variants stay one tap away — a belt on a dip, a plate held
              on a knee raise. Revealing the controls is enough; the load itself
              stays 0 until the user sets one, so a stray tap cannot invent
              tonnage or cost the set its reps axis. */}
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

          {/* Effort, per SET, and only on a working one. A warm-up is never
              rated, for the same reason it wins no record: it is not the effort
              the question is about. Rating the Failure stop also tags the set
              `failure`, because that is what the word means on this row — but
              only ADDITIVELY: clearing the rating leaves a type the user set
              separately alone. */}
          {trackRpe && !isWarm && (
            <RpeLadder
              value={set.rpe}
              stale={set.rpeStale}
              seeded={set.rpeSeed != null}
              setLabel={`set ${ordinal}`}
              onPick={(choice) => onChange(index, {
                rpe: choice?.rpe,
                // The other direction of the same sync as `pickType`: the top
                // stop lights the failure type, and stepping off it (or clearing
                // the rating) puts it out. Only a type this control set is
                // withdrawn — a warm-up or drop set is left alone.
                ...(choice?.failure ? { setType: 'failure' as const }
                  : isFail ? { setType: undefined } : {}),
              })}
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
 * One labelled control line in the tuner.
 *
 * The label is what lets the pill be unambiguous: a number field flanked by ±
 * could be either of the two values, and the reader should not have to infer it
 * from which one has a `kg` after it.
 *
 * ── THE UNIT LIVES IN THE LABEL, NOT IN THE FIELD ───────────────────────────
 * It used to be both: a block headed WEIGHT containing "8.75 KG", and a block
 * headed REPS containing "14 REPS". Two statements of the same fact, and the
 * second one was charging rent — at 360px the suffix crowded the number hard
 * enough that "8.75KG" ran together with no space between them, on the exact
 * control this refactor exists to make readable. The label says it once, above,
 * where it does not compete with the value for width.
 */
function TunerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-muted/60">{label}</span>
      {/* One pill, hairline-divided. A single bordered container rather than
          separate bordered buttons: five outlines in a 44px row reads as five
          objects, and they are one control. */}
      <div className="flex items-stretch rounded-xl border border-border bg-surface-2 overflow-hidden min-h-[44px]">
        {children}
      </div>
    </div>
  )
}

/** The hairline between two segments of a tuner pill. */
function Divider() {
  return <span className="w-px shrink-0 self-stretch" style={{ background: 'rgba(255,255,255,0.08)' }} aria-hidden="true" />
}

/**
 * One ± segment of a tuner pill.
 *
 * Its own component because there are up to six of them and each is one target
 * whose only job is a haptic nudge — inline, they were near-identical seven-line
 * className strings, which is how the reps stepper and the weight chips drifted
 * onto different radii in the first place.
 *
 * 44px tall, which is the smallest target a thumb hits reliably; this one gets
 * pressed with a shaking hand between sets. `fine` is the quarter-kg end of the
 * pill: same height, quieter type, because it is the smaller claim.
 */
function Step({ label, ariaLabel, onClick, fine = false }: {
  label: string
  ariaLabel: string
  onClick: () => void
  fine?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`shrink-0 px-2.5 min-h-[44px] tabular-nums active:scale-95 transition-transform
                  ${fine ? 'text-[11px] font-bold text-muted' : 'text-[13px] font-bold text-text'}`}
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
 * pointer — the iOS auto-zoom guard, and non-negotiable. So the input's width
 * has to be budgeted for 16px glyphs rather than for the 13px the surrounding
 * type suggests: `102.25` is six characters plus a decimal point. It takes the
 * whole centre of the pill (`flex-1`), which is the widest this value has ever
 * been, and centring means an over-long value is visibly over-long rather than
 * silently scrolled out of frame.
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
      className="flex-1 min-w-0 bg-transparent text-center font-bold tabular-nums text-text outline-none px-1"
    />
  )
}
