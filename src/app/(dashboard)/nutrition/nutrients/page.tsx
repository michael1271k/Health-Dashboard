'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, FlaskConical, Pill } from 'lucide-react'
import { useTodayNutrients, useStackNutrients } from '@/lib/hooks/useTodayNutrients'
import { NUTRIENT_TARGETS, NUTRIENT_GROUPS } from '@/lib/nutrition/nutrientTargets'
import { EMERALD, OXIDE, STEEL, DIM } from '@/lib/theme/palette'
import { BackLink } from '@/components/nav/NavChevron'

/**
 * Nutrition & Nutrients deep-dive. Evidence-based daily TARGETS for this
 * athlete's cut and the supplement stack's contribution to them. Diet micros
 * light up once a paid Apple account re-enables HealthKit; stack micros are live
 * today.
 *
 * The passive HealthKit signals (HRV, blood oxygen, respiratory rate, wrist
 * temperature, daylight) used to render here too. They live in Vitals now, and
 * only there — see the note at the foot of this file.
 */
export default function NutrientsPage() {
  const router = useRouter()
  // Food plus whatever the stack has already delivered — see `useTodayNutrients`.
  // It was a memo right here, and it is a hook now because the dashboard's Fuel
  // tile prints three of these figures: two independent derivations of "how
  // much sodium today" is exactly how one screen comes to disagree with another.
  const intake = useTodayNutrients()

  // The stack's own contribution, shown separately per row — "you hit 470/90 mg
  // of vitamin C" means something different when a tablet supplied all of it.
  const fromStack = useStackNutrients()

  const [why, setWhy] = useState<string | null>(null)

  return (
    <div data-boxed className="space-y-4">
      <header className="flex items-center gap-3">
        <BackLink onClick={() => router.back()} />
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-fluid-lg font-bold text-text flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" aria-hidden="true" /> Nutrition &amp; Nutrients
          </h1>
          <span className="text-fluid-xs text-muted">Evidence-based targets for your 50-day cut</span>
        </div>
      </header>

      {/* ── Diet micro targets ──
          Four named bands of 32px rows, not twenty bordered tinted cards.

          The card grid gave every nutrient identical visual weight and a hue of
          its own — except twenty nutrients only had about seven hues between
          them, so the colour identified nothing while the label identified
          everything. Colour now says STATE: short of target, on it, or past a
          ceiling. That is the one thing the label cannot tell you.

          The progress bar is gone too: the row's own bottom hairline fills, so
          the row IS the gauge instead of containing one. */}
      {NUTRIENT_GROUPS.map((group) => {
        const rows = NUTRIENT_TARGETS.filter((m) => m.group === group)
        if (!rows.length) return null
        return (
          <section key={group}>
            <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted mb-1 px-0.5">{group}</h2>
            <div>
              {rows.map((m, i) => {
                const have = intake[m.key]
                const pct = have != null && m.target ? Math.min(1, have / m.target) : 0
                const overCeiling = m.kind === 'ceiling' && have != null && have > m.target
                const onTarget = have != null && (m.kind === 'ceiling' ? !overCeiling : have >= m.target)
                const stackShare = fromStack[m.key] ?? 0
                const state = have == null ? DIM : overCeiling ? OXIDE : onTarget ? EMERALD : STEEL
                const open = why === m.key
                return (
                  <div key={m.key} className={i > 0 ? 'border-t border-white/[0.05]' : ''}>
                    <button
                      type="button"
                      onClick={() => setWhy(open ? null : m.key)}
                      aria-expanded={open}
                      className="w-full text-left pt-2 pb-1.5 active:scale-[0.995] transition-transform"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 flex items-center gap-1 text-fluid-xs text-text/90">
                          <span className="truncate">{m.label}</span>
                          {stackShare > 0 && (
                            <Pill className="w-2.5 h-2.5 shrink-0 text-muted"
                              aria-label={`${Math.round(stackShare).toLocaleString()} ${m.unit} from the supplement stack`} />
                          )}
                          {m.kind === 'ceiling' && (
                            <span className="text-[9px] uppercase tracking-wide text-muted/70 shrink-0">max</span>
                          )}
                        </span>
                        <span className="shrink-0 helix-num text-fluid-xs tabular-nums" style={{ color: state }}>
                          {have != null ? Math.round(have).toLocaleString() : '—'}
                          <span className="text-muted font-normal"> / {m.target.toLocaleString()} {m.unit}</span>
                          {overCeiling && <AlertTriangle className="inline w-3 h-3 ml-1 -mt-0.5" aria-label="over the ceiling" />}
                        </span>
                      </span>
                      {/* The rule IS the gauge — a 1px baseline that fills, rather
                          than a 6px bar stacked under the row. */}
                      <span className="mt-1.5 block h-px w-full bg-white/[0.07]">
                        <span className="block h-px" style={{ width: `${pct * 100}%`, background: state }} />
                      </span>
                    </button>
                    {open && <p className="pb-2 text-[10px] leading-snug text-muted">{m.why}</p>}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      <p className="text-[10px] text-muted leading-snug">
        Tap a nutrient for why the target is what it is. A pill icon means the supplement stack
        credited part of it the moment you ticked the item off — Apple Health cannot export
        supplements, so those doses are read from your protocol&apos;s labels. Diet micros populate
        from your HealthKit food log on each sync; a nutrient shows &ldquo;—&rdquo; on days the
        source did not record it.
      </p>

      {/* ── "Advanced signals" (HRV, blood oxygen, respiratory rate, wrist
          temperature, daylight) used to render here as well as in Vitals.
          They are passive HealthKit readings, not nutrition: nothing on this
          page acts on them, and a number shown in two places is a number you
          have to reconcile. Vitals (Progress → Vitals, `VitalsGroups`) is the
          single home — it groups them with resting heart rate and the fitness
          engine, and gives each a 7-day window they can actually be read
          against. The HealthKit authorizations stay; only the second rendering
          is gone. ── */}
    </div>
  )
}
