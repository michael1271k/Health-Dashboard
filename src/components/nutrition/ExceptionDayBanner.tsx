'use client'

import { useState } from 'react'
import { m } from 'framer-motion'
import { BadgeCheck, Plus, CircleDashed } from 'lucide-react'
import { NUTRITION_EXCEPTION_REASONS, exceptionReason } from '@/lib/nutrition/exceptionDay'
import { useSetNutritionException } from '@/lib/hooks/useNutritionException'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'
import { SNAPPY, CROSSFADE } from '@/lib/motion/springs'
import { SAND, STEEL, MUTED, alpha } from '@/lib/theme/palette'

/**
 * A day's nutrition context: it was allowed to miss its target, and/or its
 * numbers are a guess.
 *
 * ── TWO FLAGS, ONE CONTROL, AND THEY MEAN DIFFERENT THINGS ───────────────────
 * An exception is PERMISSION — the day was declared allowed to miss its calorie
 * target, and it is graded on protein alone. An estimate is CONFIDENCE — you ate
 * out and could not weigh it, and it changes no number and no grade whatsoever.
 * They co-occur constantly (a restaurant birthday is both), which is exactly why
 * they are two fields rather than one enum, and why the estimate has to be
 * settable on an otherwise perfectly ordinary day.
 *
 * ── WHY SAND, AND WHY THE ESTIMATE IS NOT SAND ───────────────────────────────
 * The palette already carries the exception's meaning. SAND is documented as
 * "the travel/deload tone — a deliberate 'away' colour, not a mistake", which is
 * precisely what an exception day is. It costs no new hue and collides with
 * nothing: EMBER is the cut phase itself (an exception is not a phase change),
 * GOLD is a record, EMERALD is a target met, OXIDE is danger — and this is none
 * of those. The whole point is that the day is not a failure.
 *
 * The estimate gets STEEL instead, and the difference is the point: it is not an
 * 'away' day, it is an ordinary day whose measurement is fuzzy. Painting it SAND
 * would say the day was excused, which is the one thing an estimate never does.
 *
 * ── WHY NO FROSTED BLUR ──────────────────────────────────────────────────────
 * `globals.css` reserves translucency for structural chrome, because a
 * backdrop-filter on a content surface over a flat canvas pays a full blur pass
 * to sample a solid colour. The material read comes from a tint over the
 * surface and a hairline, the same way every other band in the app gets it.
 *
 * ── WHY IT IS QUIET UNTIL IT IS USED ─────────────────────────────────────────
 * Unflagged, this is one muted line — an ordinary day must not be dominated by
 * an offer to excuse it, and an always-open row of tempting chips is an
 * invitation to use them. Flagged, it becomes a full band that states what the
 * flag actually did, because forgiveness the user cannot see the terms of is
 * indistinguishable from the app quietly not counting things.
 *
 * ── IT IS NOT ABOUT TODAY ────────────────────────────────────────────────────
 * Every string here is date-neutral, because the one thing you reliably know
 * about an exception is that you know it afterwards. `date` has always been a
 * plain prop and the write hook has always been date-generic; the copy was the
 * only thing pinning this component to today, which is why `daily_logs` held
 * zero flagged days for as long as the feature existed. The day page passes a
 * past date; the nutrition page passes today. Nothing else differs.
 */
export function ExceptionDayBanner({ date, stored, estimated = false }: {
  date: string
  stored: string | null
  estimated?: boolean
}) {
  const reason = exceptionReason(stored)
  const [picking, setPicking] = useState(false)
  const reduced = useHelixReducedMotion()
  const set = useSetNutritionException(date)

  const transition = reduced ? CROSSFADE : SNAPPY
  const choose = (next: string | null) => {
    set.mutate({ reason: next })
    setPicking(false)
  }
  // Deliberately does NOT close the picker: the estimate is usually the second
  // thing you set after a reason, and collapsing the row under the finger would
  // make setting both a two-tap-two-open chore.
  const toggleEstimated = () => set.mutate({ estimated: !estimated })

  const controls = (
    <ContextChips
      open={picking}
      current={reason}
      estimated={estimated}
      onChoose={choose}
      onToggleEstimated={toggleEstimated}
      reduced={reduced}
      inset={reason != null || estimated}
    />
  )

  // ── Ordinary day, nothing declared: one line, and nothing more ──
  if (!reason && !estimated) {
    return (
      <div>
        <m.button
          type="button"
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          whileTap={reduced ? undefined : { scale: 0.98 }}
          transition={transition}
          className="w-full flex items-center gap-2 rounded-xl px-3 min-h-[44px] text-left border transition-colors"
          style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
        >
          <Plus className="w-3.5 h-3.5 shrink-0" style={{ color: MUTED }} aria-hidden="true" />
          <span className="text-[12px] text-muted">
            Off-plan or estimated? <span className="text-text/80 font-semibold">Add context</span>
          </span>
        </m.button>
        {controls}
      </div>
    )
  }

  // ── Estimated only: an ordinary day with fuzzy numbers. Not an exception, and
  //    the band must not imply it was one. ──
  if (!reason) {
    return (
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: alpha(STEEL, 0.26), background: alpha(STEEL, 0.06) }}
      >
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: alpha(STEEL, 0.14), color: STEEL }}
          >
            <CircleDashed className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight" style={{ color: STEEL }}>
              Estimated intake
            </p>
            <p className="text-[11px] text-muted leading-snug mt-0.5">
              Counted in full. Nothing is forgiven — this only flags the numbers as a guess.
            </p>
          </div>
          <ChangeButton picking={picking} onClick={() => setPicking((v) => !v)} reduced={reduced} />
        </div>
        {controls}
      </div>
    )
  }

  // ── Declared exception (with or without an estimate on top) ──
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: alpha(SAND, 0.28), background: alpha(SAND, 0.07) }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: alpha(SAND, 0.14), color: SAND }}
        >
          <BadgeCheck className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight" style={{ color: SAND }}>
            Exception day · {reason}
            {estimated && <span className="font-normal" style={{ color: STEEL }}> · estimated</span>}
          </p>
          {/* The terms, stated. "Forgiven" without saying what was forgiven is
              how a score quietly stops meaning anything. */}
          <p className="text-[11px] text-muted leading-snug mt-0.5">
            Graded on protein only. Intake still counts toward the week and the trend.
          </p>
        </div>
        <ChangeButton picking={picking} onClick={() => setPicking((v) => !v)} reduced={reduced} />
      </div>
      {controls}
    </div>
  )
}

function ChangeButton({ picking, onClick, reduced }: {
  picking: boolean; onClick: () => void; reduced: boolean
}) {
  return (
    <m.button
      type="button"
      onClick={onClick}
      aria-expanded={picking}
      whileTap={reduced ? undefined : { scale: 0.96 }}
      transition={reduced ? CROSSFADE : SNAPPY}
      className="shrink-0 rounded-full px-3 min-h-[36px] text-[11px] font-semibold border transition-colors"
      style={{ color: MUTED, borderColor: 'rgba(255,255,255,0.10)' }}
    >
      Change
    </m.button>
  )
}

/**
 * The reason row, plus the estimate toggle.
 *
 * Expanded with `grid-template-rows: 0fr → 1fr` rather than `height: auto`.
 * Animating to `auto` makes the compositor measure the subtree every frame; the
 * grid form is a single interpolated track and costs one layout on each end.
 *
 * The estimate sits after a hairline divider rather than as a sixth reason chip.
 * It is not a reason and it is not mutually exclusive with one — dropping it in
 * the same row would read as "pick one of six", which is the precise mistake the
 * two-column schema exists to avoid.
 */
function ContextChips({
  open, current, estimated, onChoose, onToggleEstimated, reduced, inset = false,
}: {
  open: boolean
  current: string | null
  estimated: boolean
  onChoose: (next: string | null) => void
  onToggleEstimated: () => void
  reduced: boolean
  inset?: boolean
}) {
  const chipTransition = reduced ? CROSSFADE : SNAPPY
  return (
    <m.div
      initial={false}
      animate={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
      transition={chipTransition}
      className="grid"
      style={{ gridTemplateRows: '0fr' }}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">
        <div
          className={inset ? 'px-3 pb-3 pt-0.5' : 'pt-2'}
          // Chips are unreachable by keyboard while collapsed, not merely invisible.
          {...(open ? {} : { inert: '' as unknown as boolean })}
        >
          <div className="flex flex-wrap gap-1.5">
            {NUTRITION_EXCEPTION_REASONS.map((r) => {
              const on = current === r
              return (
                <m.button
                  key={r}
                  type="button"
                  // Tapping the active reason withdraws the exception entirely —
                  // the same "tap it again to undo" the weigh-in chips use.
                  onClick={() => onChoose(on ? null : r)}
                  aria-pressed={on}
                  whileTap={reduced ? undefined : { scale: 0.94 }}
                  transition={chipTransition}
                  className="rounded-full px-3 min-h-[36px] text-[11px] font-semibold transition-colors"
                  style={{
                    color: on ? SAND : undefined,
                    background: on ? alpha(SAND, 0.14) : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${on ? alpha(SAND, 0.42) : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  {r}
                </m.button>
              )
            })}
            {current && (
              <m.button
                type="button"
                onClick={() => onChoose(null)}
                whileTap={reduced ? undefined : { scale: 0.94 }}
                transition={chipTransition}
                className="rounded-full px-3 min-h-[36px] text-[11px] font-semibold text-muted transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Not an exception
              </m.button>
            )}
          </div>

          <div className="h-px my-2.5" style={{ background: 'rgba(255,255,255,0.07)' }} />

          <m.button
            type="button"
            onClick={onToggleEstimated}
            aria-pressed={estimated}
            whileTap={reduced ? undefined : { scale: 0.96 }}
            transition={chipTransition}
            className="w-full flex items-center gap-2 rounded-lg px-2.5 min-h-[40px] text-left transition-colors"
            style={{
              background: estimated ? alpha(STEEL, 0.12) : 'rgba(255,255,255,0.03)',
              border: `1px solid ${estimated ? alpha(STEEL, 0.40) : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            <CircleDashed
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: estimated ? STEEL : MUTED }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span
                className="block text-[11px] font-semibold leading-tight"
                style={{ color: estimated ? STEEL : undefined }}
              >
                Estimated
              </span>
              <span className="block text-[10px] text-muted leading-tight mt-px">
                Ate out — couldn&apos;t weigh it. Changes no score.
              </span>
            </span>
          </m.button>
        </div>
      </div>
    </m.div>
  )
}
