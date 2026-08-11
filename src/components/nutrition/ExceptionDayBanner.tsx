'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { BadgeCheck, Plus } from 'lucide-react'
import { NUTRITION_EXCEPTION_REASONS, exceptionReason } from '@/lib/nutrition/exceptionDay'
import { useSetNutritionException } from '@/lib/hooks/useNutritionException'
import { useHelixReducedMotion } from '@/lib/motion/useHelixReducedMotion'
import { SNAPPY, CROSSFADE } from '@/lib/motion/springs'
import { SAND, MUTED, alpha } from '@/lib/theme/palette'

/**
 * Declaring that today was allowed to miss its calorie target.
 *
 * ── WHY SAND ─────────────────────────────────────────────────────────────────
 * The palette already carries this meaning. SAND is documented as "the
 * travel/deload tone — a deliberate 'away' colour, not a mistake", which is
 * precisely what an exception day is. Using it costs no new hue and collides
 * with nothing: EMBER is the cut phase itself (an exception is not a phase
 * change), GOLD is a record, EMERALD is a target met, OXIDE is danger — and
 * this is none of those. The whole point is that the day is not a failure.
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
 */
export function ExceptionDayBanner({ date, stored }: { date: string; stored: string | null }) {
  const reason = exceptionReason(stored)
  const [picking, setPicking] = useState(false)
  const reduced = useHelixReducedMotion()
  const set = useSetNutritionException(date)

  const transition = reduced ? CROSSFADE : SNAPPY
  const choose = (next: string | null) => {
    set.mutate(next)
    setPicking(false)
  }

  // ── Ordinary day: one line, and nothing more ──
  if (!reason) {
    return (
      <div>
        <motion.button
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
            Eating off-plan today? <span className="text-text/80 font-semibold">Mark it an exception</span>
          </span>
        </motion.button>
        <ReasonChips open={picking} current={null} onChoose={choose} reduced={reduced} />
      </div>
    )
  }

  // ── Declared exception ──
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
          </p>
          {/* The terms, stated. "Forgiven" without saying what was forgiven is
              how a score quietly stops meaning anything. */}
          <p className="text-[11px] text-muted leading-snug mt-0.5">
            Graded on protein only. Intake still counts toward the week and the trend.
          </p>
        </div>
        <motion.button
          type="button"
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          whileTap={reduced ? undefined : { scale: 0.96 }}
          transition={transition}
          className="shrink-0 rounded-full px-3 min-h-[36px] text-[11px] font-semibold border transition-colors"
          style={{ color: MUTED, borderColor: 'rgba(255,255,255,0.10)' }}
        >
          Change
        </motion.button>
      </div>
      <ReasonChips open={picking} current={reason} onChoose={choose} reduced={reduced} inset />
    </div>
  )
}

/**
 * The reason row.
 *
 * Expanded with `grid-template-rows: 0fr → 1fr` rather than `height: auto`.
 * Animating to `auto` makes the compositor measure the subtree every frame; the
 * grid form is a single interpolated track and costs one layout on each end.
 */
function ReasonChips({
  open, current, onChoose, reduced, inset = false,
}: {
  open: boolean
  current: string | null
  onChoose: (next: string | null) => void
  reduced: boolean
  inset?: boolean
}) {
  return (
    <motion.div
      initial={false}
      animate={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
      transition={reduced ? CROSSFADE : SNAPPY}
      className="grid"
      style={{ gridTemplateRows: '0fr' }}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">
        <div
          className={`flex flex-wrap gap-1.5 ${inset ? 'px-3 pb-3 pt-0.5' : 'pt-2'}`}
          // Chips are unreachable by keyboard while collapsed, not merely invisible.
          {...(open ? {} : { inert: '' as unknown as boolean })}
        >
          {NUTRITION_EXCEPTION_REASONS.map((r) => {
            const on = current === r
            return (
              <motion.button
                key={r}
                type="button"
                // Tapping the active reason withdraws the exception entirely —
                // the same "tap it again to undo" the weigh-in chips use.
                onClick={() => onChoose(on ? null : r)}
                aria-pressed={on}
                whileTap={reduced ? undefined : { scale: 0.94 }}
                transition={reduced ? CROSSFADE : SNAPPY}
                className="rounded-full px-3 min-h-[36px] text-[11px] font-semibold transition-colors"
                style={{
                  color: on ? SAND : undefined,
                  background: on ? alpha(SAND, 0.14) : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${on ? alpha(SAND, 0.42) : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                {r}
              </motion.button>
            )
          })}
          {current && (
            <motion.button
              type="button"
              onClick={() => onChoose(null)}
              whileTap={reduced ? undefined : { scale: 0.94 }}
              transition={reduced ? CROSSFADE : SNAPPY}
              className="rounded-full px-3 min-h-[36px] text-[11px] font-semibold text-muted transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            >
              Not an exception
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
