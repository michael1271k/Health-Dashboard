'use client'

import { Flag, Footprints } from 'lucide-react'
import { PLATINUM, EMBER, SAPPHIRE, EMERALD, GOLD, MUTED, HAIRLINE, OXIDE } from '@/lib/theme/palette'

/**
 * Steps as GROUND COVERED, not a counter.
 *
 * A rail from 0 to the day's goal with milestone pips at 25/50/75/100%; the
 * marker sits at today's position and the pips behind it light up. Distance is
 * the real HealthKit walking+running distance when available, otherwise it's
 * omitted — never estimated from a stride guess, which would be a fabricated
 * number sitting next to real ones.
 */

const PIPS = [0.25, 0.5, 0.75] as const

export function StepsJourney({ steps, goal, distanceM, activeKcal, trainingMin, series }: {
  steps: number | null
  goal: number | null
  distanceM: number | null
  activeKcal: number | null
  trainingMin: number | null
  /** Trailing daily step counts, oldest → newest. */
  series: Array<number | null>
}) {
  const target = goal && goal > 0 ? goal : 10_000
  const pct = steps == null ? 0 : Math.min(1, steps / target)
  const done = pct >= 1
  const color = done ? EMERALD : pct >= 0.5 ? PLATINUM : EMBER
  const km = distanceM != null ? Math.round(distanceM / 100) / 10 : null

  const days = series.filter((v): v is number => v != null)
  const peak = days.length ? Math.max(...days, 1) : 1

  /**
   * Today against the trailing mean of the days before it, as a percentage.
   *
   * The mean EXCLUDES today: comparing a value against an average it is itself
   * part of drags the baseline toward the number being judged, so a huge day
   * would under-report and a dead day would over-report. Needs three prior days
   * to say anything — two is a coin toss with a decimal point.
   */
  const vsAvg = (() => {
    const prior = days.slice(0, -1)
    if (steps == null || prior.length < 3) return null
    const mean = prior.reduce((a, b) => a + b, 0) / prior.length
    if (mean <= 0) return null
    return Math.round(((steps - mean) / mean) * 100)
  })()

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <span className="helix-num text-4xl font-bold leading-none text-text">
            {steps?.toLocaleString() ?? '—'}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-muted ml-2">steps</span>
        </div>
        {km != null && (
          <span className="helix-num text-fluid-base font-bold" style={{ color }}>{km} km</span>
        )}
      </div>

      {/* The journey rail */}
      <div className="pt-1">
        <div className="relative h-8">
          {/* Track */}
          <span className="absolute left-0 right-0 top-3.5 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} aria-hidden="true" />
          {/* Distance covered */}
          <span className="absolute left-0 top-3.5 h-1 rounded-full"
            style={{ width: `${pct * 100}%`, background: `linear-gradient(90deg, ${EMBER}, ${color})`, boxShadow: `0 0 10px ${color}70` }}
            aria-hidden="true" />
          {/* Milestone pips */}
          {PIPS.map((p) => (
            <span key={p} className="absolute top-[11px] w-2 h-2 rotate-45 rounded-[1px]"
              style={{
                left: `calc(${p * 100}% - 4px)`,
                background: pct >= p ? color : 'rgba(255,255,255,0.12)',
                boxShadow: pct >= p ? `0 0 6px ${color}` : undefined,
              }}
              aria-hidden="true" />
          ))}
          {/* You-are-here marker */}
          <span
            className="absolute top-1.5 -translate-x-1/2 flex items-center justify-center w-5 h-5 rounded-full"
            style={{ left: `${pct * 100}%`, background: color, boxShadow: `0 0 14px ${color}` }}
            role="img" aria-label={`${Math.round(pct * 100)} percent of the step goal`}
          >
            <Footprints className="w-3 h-3" style={{ color: '#0A0B0D' }} aria-hidden="true" />
          </span>
          {/* Goal flag */}
          <Flag className="absolute right-0 top-1.5 w-4 h-4"
            style={{ color: done ? EMERALD : MUTED }} aria-hidden="true" />
        </div>
        <div className="flex justify-between text-[9px] helix-num mt-0.5" style={{ color: MUTED }}>
          <span>0</span>
          {PIPS.map((p) => <span key={p}>{Math.round(target * p / 1000)}k</span>)}
          <span style={{ color: done ? EMERALD : MUTED }}>{Math.round(target / 1000)}k</span>
        </div>
      </div>

      {/* ── SUPPORTING MOVEMENT STATS ────────────────────────────────────────
          Water is gone: it is not activity, it sat here because there was a
          spare cell, and it meant hydration was reported by two surfaces that
          could disagree — this one and Fuel, which owns it.
          In its place, the readings that ARE this sheet's subject and were
          previously only implied by the step count. Each carries a verdict
          against its own target where one exists, since a bare figure on a
          screen about a goal is the one thing this sheet should never show. */}
      <div className="grid grid-cols-4 gap-2 pt-2.5 border-t" style={{ borderColor: HAIRLINE }}>
        {[
          { label: 'Distance', v: km == null ? null : km.toFixed(1), unit: 'km', c: PLATINUM, ok: null },
          { label: 'Active', v: activeKcal == null ? null : `${Math.round(activeKcal)}`, unit: 'kcal', c: OXIDE, ok: null },
          { label: 'Training', v: trainingMin == null ? null : `${Math.round(trainingMin)}`, unit: 'min', c: EMERALD, ok: null },
          // Today against your OWN trailing norm — the only target here that is
          // measured rather than invented. A fixed "active kcal goal" would be a
          // number nobody set, graded green or red as though they had.
          { label: 'vs avg', v: vsAvg == null ? null : `${vsAvg > 0 ? '+' : ''}${vsAvg}`, unit: '%', c: SAPPHIRE, ok: vsAvg == null ? null : vsAvg >= 0 },
        ].map((x) => (
          <div key={x.label}>
            <div className="text-[9px] uppercase tracking-wide" style={{ color: MUTED }}>{x.label}</div>
            <div className="helix-num text-fluid-sm font-bold mt-0.5"
              style={{ color: x.v == null ? MUTED : x.ok == null ? x.c : x.ok ? EMERALD : OXIDE }}>
              {x.v ?? '—'}
              {x.v != null && <span className="text-[10px] font-normal text-muted ml-1">{x.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Trailing days — how today sits against the recent norm */}
      {days.length >= 3 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide mb-1" style={{ color: MUTED }}>Last {days.length} days</div>
          <div className="flex items-end gap-1 h-10">
            {days.map((v, i) => {
              const last = i === days.length - 1
              return (
                <span key={i} className="flex-1 rounded-t-sm"
                  style={{
                    height: `${Math.max(6, (v / peak) * 100)}%`,
                    background: last ? color : v >= target ? `${EMERALD}88` : `${GOLD}44`,
                  }}
                  title={`${v.toLocaleString()} steps`} />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
