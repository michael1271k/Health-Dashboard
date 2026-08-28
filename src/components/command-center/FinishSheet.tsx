'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Timer, HeartPulse, Flame, Layers, Dumbbell } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { isSetCommitted, type SessionDraft } from '@/lib/sessions/draft'
import { deriveSessionRpe } from '@/lib/training/rpeMemory'
import { EFFORT_WORDS, cr10Color, effortWordFor, suggestEffortWord } from '@/lib/training/effort'
import { useEffortBaseline } from '@/lib/hooks/useEffortBaseline'
import { fmtVolume } from '@/lib/utils/units'
import { parseDurationMin } from '@/lib/utils/duration'
import { useSessionMetricsSeed } from '@/lib/hooks/useSessionMetricsSeed'
import { shortDate } from '@/lib/utils/day'
import { EMBER, STEEL, OXIDE, GOLD, SAPPHIRE } from '@/lib/theme/palette'

type StatPatch = Partial<NonNullable<SessionDraft['stats']>>

/**
 * The last screen of a workout.
 *
 * Duration, average heart rate and calories used to be three editable badges at
 * the TOP of the logging deck — which asked, throughout the session, for three
 * numbers that do not exist until it is over. They are asked here instead, once,
 * at the only moment you can answer them.
 *
 * Session effort moved with them for the same reason, and it arrives PRE-FILLED
 * with the volume-weighted mean of the per-set ratings (`deriveSessionRpe`) —
 * the same figure `saveSession` would derive if you left it alone. Shown as a
 * proposal you can override rather than a blank you must fill: the app already
 * knows the answer, and making you retype it would be asking for agreement, not
 * for information.
 */
export function FinishSheet({ open, onClose, draft, totals, busy, error, elapsedMin, onSetStats, onClockDuration, onSessionRpe, onCommit }: {
  open: boolean
  onClose: () => void
  draft: SessionDraft
  /** Computed once in `SessionDeck`, so the bar, the sheet and the deck header
   *  can never disagree about what the session weighs. */
  totals: { volumeKg: number; sets: number }
  busy: boolean
  error: string | null
  /**
   * What the header's session clock read when Finish was pressed, in whole
   * minutes. Null on a back-dated or edited deck, where there is no live
   * session to have timed.
   */
  elapsedMin: number | null
  onSetStats: (patch: StatPatch) => void
  /**
   * The clock's own writer. Distinct from `onSetStats` on purpose: this one
   * overwrites the duration and does NOT mark it as edited, so the next reading
   * replaces it too. See `useSessionDraft.setClockDuration`.
   */
  onClockDuration: (min: number | null) => void
  onSessionRpe: (v: number | null) => void
  onCommit: () => void
}) {
  const s = draft.stats
  const isEdit = !!draft.replaceSessionId

  /**
   * ── THE THREE FIELDS ARRIVE PRE-FILLED ─────────────────────────────────────
   * From the previous performance of THIS routine (`day_key`, never the
   * weekday), per field, with the routine's recent average as the fallback —
   * see `useSessionMetricsSeed`. Session effort has proposed its answer for a
   * while and these three had stayed blank, which made the sheet look like it
   * knew less than it does: Upper A has taken 62 minutes eleven times running.
   *
   * The fill runs ONCE per opening and only over fields that are empty. A
   * number you typed is never overwritten, and clearing a field on purpose
   * stays cleared — the guard is the ref, not the value, so a blanked field is
   * not re-seeded the moment the query settles.
   */
  const { data: seed } = useSessionMetricsSeed(draft.dayKey, draft.replaceSessionId)

  /**
   * ── THE SEED LATCHES; THE CLOCK DELIBERATELY DOES NOT ──────────────────────
   * The clock reading is handed in SYNCHRONOUSLY — `SessionDeck` takes it in
   * the same tick that opens the sheet — while `seed` is a query that settles a
   * moment later, so one latch over both was a race the clock always won: the
   * effect ran on the first render with `elapsedMin` set and `seed` still
   * undefined, filled the duration, latched, and bailed when the seed arrived.
   *
   * `seedFilled` still closes once the query's values have been applied, and
   * reopens when the sheet closes. The clock has no latch at all any more — see
   * the effect below.
   */
  const seedFilled = useRef(false)

  /**
   * ── THE CLOCK OUTRANKS THE SEED, AND OUTRANKS ITS OWN LAST READING ─────────
   * The historical seed is a good guess about a typical run of this routine.
   * The header's session clock is a MEASUREMENT of the one that just happened,
   * so when there is one it wins — and because it lands first, the seed's own
   * pass below simply finds the field already filled and leaves it. The seed
   * stays the fallback for a back-dated or edited deck, which has nothing to
   * have timed.
   *
   * ── WHY THIS NO LONGER SKIPS A FILLED FIELD (2026-08-28) ───────────────────
   * It used to fill only an EMPTY duration, and latch. Both guards had the same
   * consequence: pressing Finish at 42 minutes to LOOK at this sheet, closing
   * it, and pressing Finish again at 70 stored 42. The first reading had filled
   * the field, and every reading after it found the field full and declined.
   *
   * So the clock now writes on every open, through `onClockDuration` — which
   * refuses only when `durationEdited` says a human typed the number. That is
   * the distinction the old `== null` test was reaching for and could not make:
   * "empty" is not the same as "not yours". `SessionDeck` takes one final
   * reading at commit, because the seconds between opening this sheet and
   * pressing Complete are still part of the session.
   */
  useEffect(() => {
    if (!open || elapsedMin == null) return
    onClockDuration(elapsedMin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, elapsedMin])

  useEffect(() => {
    if (!open) { seedFilled.current = false; return }
    if (seedFilled.current || !seed) return
    seedFilled.current = true
    const patch: StatPatch = {}
    // Duration only when the clock had nothing to say — a back-dated or edited
    // deck. On a live session the effect above has already filled it.
    if (s?.duration_min == null && elapsedMin == null && seed.durationMin != null) {
      patch.duration_min = seed.durationMin
    }
    if (s?.avg_hr_bpm == null && seed.avgBpm != null) patch.avg_hr_bpm = seed.avgBpm
    if (s?.calories_kcal == null && seed.calories != null) patch.calories_kcal = seed.calories
    if (Object.keys(patch).length) onSetStats(patch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed, elapsedMin])

  // The same set list the commit payload will carry, so the proposed rating
  // matches the one that gets stored.
  const committed = draft.exercises
    .filter((e) => e.kind !== 'cardio')
    .flatMap((e) => e.sets.filter(isSetCommitted))
  const derivedRpe = deriveSessionRpe(committed)
  // What this day type usually costs — the same quantity, so the comparison is
  // like with like. See `useEffortBaseline` for why it is not `session_rpe`.
  const { data: baseline } = useEffortBaseline(draft.dayKey)
  const suggested = suggestEffortWord(derivedRpe, baseline ?? [])
  const picked = effortWordFor(draft.sessionRpe) ?? suggested

  return (
    <Sheet open={open} onClose={onClose} title={isEdit ? 'Save edits' : 'Finish session'} accent={EMBER}>
      <div className="space-y-5 pb-2">
        {/* ── WHAT YOU DID, THEN WHAT ONLY YOU KNOW ──
            The two totals are already true and are not asked for; the three
            fields below are the only numbers the app cannot derive. Splitting
            them visually is the whole point of this screen — a grid of five
            identical boxes makes "volume" look like something you type. */}
        <div className="grid grid-cols-2 gap-2">
          <Total icon={Dumbbell} value={fmtVolume(totals.volumeKg)} unit="kg" label="Volume" color={EMBER} />
          <Total icon={Layers} value={String(totals.sets)} label="Sets" color={STEEL} />
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted mb-2">The parts only you know</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Duration" unit="min" icon={Timer} color={SAPPHIRE} value={s?.duration_min ?? null}
              onChange={(v) => onSetStats({ duration_min: v })} parse={parseDurationMin} />
            <Field label="Avg HR" unit="bpm" icon={HeartPulse} color={OXIDE} value={s?.avg_hr_bpm ?? null}
              onChange={(v) => onSetStats({ avg_hr_bpm: v })} />
            <Field label="Calories" unit="kcal" icon={Flame} color={GOLD} value={s?.calories_kcal ?? null}
              onChange={(v) => onSetStats({ calories_kcal: v })} />
          </div>
          {/* Where the numbers came from, and the duration is now a different
              answer from the other two — it was TIMED, not guessed, so saying
              "pre-filled from 20 Aug" about it would be false. */}
          {elapsedMin != null ? (
            <p className="text-[10px] text-muted/60 mt-1.5">
              Duration timed from the session clock{seed?.lastDate ? `; the rest pre-filled from ${shortDate(seed.lastDate)}` : ''} · edit anything that changed.
            </p>
          ) : seed?.lastDate ? (
            <p className="text-[10px] text-muted/60 mt-1.5">
              Pre-filled from {shortDate(seed.lastDate)}{seed.averaged ? ' and your recent average' : ''} · edit anything that changed.
            </p>
          ) : (
            <p className="text-[10px] text-muted/60 mt-1.5">Left blank → estimated.</p>
          )}
        </div>

        {totals.sets > 0 && (
          <div>
            {/* ── OVERALL EFFORT, IN WORDS ─────────────────────────────────────
                This was a 10-pip numeric scale under the line "proposed 9.5
                from your per-set ratings". Two things were wrong with it.

                The proposal was a volume-weighted mean of per-set RPE, and
                per-set RPE is reps-in-reserve — it clusters at 8.5–9.5 on any
                hypertrophy block. So it proposed ~8.9 against an answer that
                has never once exceeded 8, every session, and `battery.ts` reads
                the result as `sessionRpe / 10`, making the over-proposal a
                measurably larger drain.

                And the control could not express its own suggestion: it built
                ten INTEGER steps, so a proposed 9.5 was displayed and could not
                be picked. Five words have no such gap, and nobody reads "Hard"
                and asks why it is not 8.9. The chosen word still writes a
                number to `session_rpe`, so every existing reader is untouched. */}
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted mb-2">
              Overall effort
              {suggested && draft.sessionRpe == null && (
                <span className="ml-2 font-normal tracking-normal normal-case text-muted/70">
                  suggested from your recent {draft.title ?? 'sessions'}
                </span>
              )}
            </p>
            <div role="radiogroup" aria-label="Overall session effort" className="grid grid-cols-5 gap-1">
              {EFFORT_WORDS.map((w) => {
                const on = picked?.key === w.key
                const chosen = effortWordFor(draft.sessionRpe)?.key === w.key
                return (
                  <button
                    key={w.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    title={w.hint}
                    // Tapping the chosen one clears it back to the suggestion.
                    onClick={() => onSessionRpe(chosen ? null : w.cr10)}
                    className="min-h-[52px] rounded-xl px-1 flex items-center justify-center
                               active:scale-95 transition-transform"
                    style={{
                      background: on ? `${cr10Color(w.cr10)}24` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${on ? `${cr10Color(w.cr10)}8c` : 'rgba(255,255,255,0.08)'}`,
                      color: on ? cr10Color(w.cr10) : undefined,
                      // The suggestion is shown selected but dimmed until you
                      // confirm it, so "what the app thinks" and "what you said"
                      // are never the same mark.
                      opacity: on && !chosen ? 0.7 : 1,
                    }}
                  >
                    <span className={`text-[11px] font-bold leading-tight text-center ${on ? '' : 'text-muted'}`}>
                      {w.label}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-muted/70 mt-1.5 min-h-[12px]">
              {picked ? picked.hint : 'Rate the session, or leave it unrated.'}
            </p>
          </div>
        )}

        {error && <p className="text-danger text-fluid-sm" dir="auto">{error}</p>}

        <button
          type="button"
          onClick={onCommit}
          disabled={busy || totals.sets === 0}
          className="btn-primary w-full justify-center disabled:opacity-50 min-h-[52px] text-fluid-base"
        >
          {busy
            ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {isEdit ? 'Saving…' : 'Completing…'}</>
            : <><Check className="w-4 h-4" aria-hidden="true" /> {isEdit ? 'Save Changes' : 'Complete Session'}</>}
        </button>
      </div>
    </Sheet>
  )
}

function Total({ icon: Icon, value, unit, label, color }: {
  icon: typeof Dumbbell; value: string; unit?: string; label: string; color: string
}) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: `${color}0f`, border: `1px solid ${color}33` }}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color }}>
        <Icon className="w-3 h-3" aria-hidden="true" />
        {label}
      </div>
      <div className="helix-num font-bold text-fluid-xl tabular-nums leading-none mt-1 text-text">
        {value}{unit && <span className="text-[11px] font-normal ml-1 text-muted">{unit}</span>}
      </div>
    </div>
  )
}

/**
 * One end-of-session number. A local text buffer while focused, for the same
 * reason `NumberField` keeps one: a value-derived input fights the user
 * mid-word, and an empty field must commit null rather than 0 — you did not
 * burn zero calories, you did not record the number.
 */
function Field({ label, unit, value, onChange, parse, icon: Icon, color }: {
  label: string
  unit: string
  value: number | null
  onChange: (v: number | null) => void
  /** Custom string→number parser (Duration accepts "1:06"). */
  parse?: (raw: string) => number | null
  icon: typeof Timer
  color: string
}) {
  const [text, setText] = useState<string | null>(null)
  const toNumber = parse ?? ((raw: string) => (raw.trim() === '' ? null : Number(raw)))
  const shown = text ?? (value != null ? String(value) : '')
  return (
    /* ── WHY THE TEXT USED TO FLOAT ──
       The label sat OUTSIDE the box and the box was `items-baseline` with a
       `min-h-[44px]` and no vertical padding: content aligned on a baseline
       inside a 44px shell, i.e. pinned near the top of it with all the slack
       underneath. Beside it, `Total` had real `py-2.5` and no min-height and so
       centred naturally — which is why the two rows of this sheet looked like
       they came from different screens.

       The fix is to stop having two anatomies. The label moves INSIDE the box
       and the box takes `Total`'s chrome (tinted fill, tinted hairline, same
       radius, same padding), so all five read as one family, and vertical
       centring stops being something the CSS has to be asked for. */
    <label className="min-w-0 block rounded-xl px-3 py-2 cursor-text"
      style={{ background: `${color}0f`, border: `1px solid ${color}33` }}>
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide" style={{ color }}>
        <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex items-baseline gap-1 mt-1">
        <input
          type={parse ? 'text' : 'number'}
          inputMode="numeric"
          value={shown}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => { onChange(toNumber(e.target.value)); setText(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="—"
          className="helix-num w-full min-w-0 bg-transparent field-compact font-bold text-text tabular-nums outline-none leading-none placeholder:text-muted placeholder:font-normal"
          aria-label={label}
        />
        <span className="text-[10px] text-muted shrink-0">{unit}</span>
      </span>
    </label>
  )
}
