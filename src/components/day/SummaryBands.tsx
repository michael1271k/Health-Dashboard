'use client'

import { Moon, ChevronRight } from 'lucide-react'
import type { Tables } from '@/lib/supabase/types'
import type { DayVaultData } from '@/lib/hooks/useDayVault'
import { ZoneRow } from '@/components/ui/Zone'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { formatSleep } from '@/lib/utils/format'
import { AMETHYST, SAPPHIRE, STEEL, OXIDE, MUTED, SAND, BODY } from '@/lib/theme/palette'
import { bodyCompGapLabel, bodyCompGapShort } from '@/lib/body/compGap'

/**
 * The one-line summaries that replaced the paged carousel.
 *
 * ── WHY THESE ARE FIXED-HEIGHT ───────────────────────────────────────────────
 * The Today page used to put Sleep, Hydration and Body inside a SnapPager whose
 * scroller took the ACTIVE page's measured height and animated to it. Those
 * three pages are ~470px, ~200px and ~430px, so every swipe slid Soreness,
 * Cardio and the session debrief up or down by roughly 270px — and on first
 * paint the row briefly took the tallest child before collapsing.
 *
 * A summary band renders the SAME shape whether or not its data exists: one
 * row, an em-dash where a number would be, a prompt instead of a visual. The
 * 120px-vs-470px variance moves inside the sheet, where variance is legitimate
 * because the sheet is the thing you opened on purpose.
 */

const STAGES = [
  { key: 'deep_min', color: AMETHYST },
  { key: 'rem_min', color: SAPPHIRE },
  { key: 'core_min', color: STEEL },
  { key: 'awake_min', color: OXIDE },
] as const

/** Local HH:MM for an ISO instant. */
function clock(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Sleep at a glance: the total, the window it happened in, the stage split as a
 * 6px ribbon, and the gap to goal.
 *
 * The ribbon is proportion only — the same honest limit the full view carries.
 * Stage TOTALS are all that is persisted, never a timeline, so nothing here
 * implies an order.
 */
export function SleepBand({ sleep, sleepMinutes, goalHours, onOpen }: {
  sleep: Tables<'sleep_sessions'> | null
  /** daily_logs fallback for legacy days that only ever pushed a total. */
  sleepMinutes: number | null
  goalHours: number | null
  onOpen: () => void
}) {
  const totalMin = sleep?.duration_min ?? sleepMinutes ?? null
  const parts = STAGES
    .map((s) => ({ color: s.color, min: (sleep?.[s.key] as number | null) ?? 0 }))
    .filter((s) => s.min > 0)
  const ribbonTotal = parts.reduce((a, b) => a + b.min, 0)
  const bed = clock(sleep?.start_time)
  const wake = clock(sleep?.end_time)
  const goalMin = goalHours != null ? goalHours * 60 : null
  const delta = totalMin != null && goalMin != null ? Math.round(totalMin - goalMin) : null

  return (
    <ZoneRow divide={false} asButton onClick={onOpen} title="Open sleep detail"
      className="w-full text-left active:opacity-70 transition-opacity">
      <div className="flex items-center gap-3">
        <Moon className="w-3.5 h-3.5 shrink-0" style={{ color: AMETHYST }} aria-hidden="true" />
        <span className="helix-num text-fluid-lg font-black leading-none shrink-0" style={{ color: AMETHYST }}>
          {totalMin != null ? formatSleep(totalMin) : '—'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] text-muted truncate">
            {bed && wake ? `${bed} — ${wake}` : 'Sync your Watch to see stages'}
          </span>
          {/* 6px, and only when there is something real to divide. */}
          {ribbonTotal > 0 && (
            <span className="mt-1 flex h-1.5 w-full max-w-[160px] rounded-full overflow-hidden" aria-hidden="true">
              {parts.map((p, i) => (
                <span key={i} style={{ width: `${(p.min / ribbonTotal) * 100}%`, background: p.color }} />
              ))}
            </span>
          )}
        </span>
        {delta != null && (
          <span className="helix-num text-[11px] font-bold shrink-0"
            style={{ color: delta >= 0 ? BODY.lean : OXIDE }}>
            {delta >= 0 ? '+' : '−'}{formatSleep(Math.abs(delta))}
          </span>
        )}
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted" aria-hidden="true" />
      </div>
    </ZoneRow>
  )
}

/**
 * Body at a glance: weight with its delta, fat %, muscle mass, and a three
 * segment composition bar. Each number carries its substance's colour, the same
 * hue it has in the chart and on the dashboard tiles.
 */
export function BodyBand({ log, previousWeightKg = null, onOpen }: {
  log: DayVaultData['log']
  /**
   * The weight recorded BEFORE this date, for the delta chip.
   *
   * Optional and currently unset by the day page: this page can be any date in
   * the past, and the only weigh-in hook available returns the LATEST one — so
   * on a day in July it would print a delta against today. A wrong number is
   * worse than no number, and the full trend is one tap away in the sheet.
   */
  previousWeightKg?: number | null
  onOpen: () => void
}) {
  const unit = weightUnit()
  const w = log?.weight_kg ?? null
  const fat = log?.body_fat_pct ?? null
  const muscle = log?.muscle_mass_kg ?? null
  const delta = w != null && previousWeightKg != null ? w - previousWeightKg : null
  // Non-null only when a weight arrived without its manual half — see compGap.
  const gap = bodyCompGapLabel(log)
  const gapShort = bodyCompGapShort(log)

  // Fat / muscle / the rest, as a share of bodyweight. Only drawn when both
  // components are real — a bar with one known slice is a guess with a border.
  const fatKg = w != null && fat != null ? (w * fat) / 100 : null
  const segments = w != null && fatKg != null && muscle != null
    ? [
        { color: BODY.muscle, pct: (muscle / w) * 100 },
        { color: BODY.fat, pct: (fatKg / w) * 100 },
        { color: BODY.water, pct: Math.max(0, 100 - ((muscle + fatKg) / w) * 100) },
      ]
    : null

  return (
    <ZoneRow divide={false} asButton onClick={onOpen} title="Open body composition"
      className="w-full text-left active:opacity-70 transition-opacity">
      <div className="flex items-center gap-3">
        <span className="flex items-baseline gap-1 shrink-0">
          <span className="helix-num text-fluid-lg font-black leading-none" style={{ color: BODY.weight }}>
            {w != null ? displayWeight(w) : '—'}
          </span>
          <span className="text-[10px] text-muted font-bold">{unit}</span>
        </span>
        {delta != null && Math.abs(delta) >= 0.05 && (
          <span className="helix-num text-[11px] font-bold shrink-0"
            style={{ color: delta < 0 ? BODY.lean : OXIDE }}>
            {delta < 0 ? '▼' : '▲'}{Math.abs(displayWeight(delta) ?? 0).toFixed(1)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] truncate" style={{ color: gap ? SAND : MUTED }}>
            {fat != null && <span style={{ color: BODY.fat }}>{fat.toFixed(1)}% fat</span>}
            {fat != null && muscle != null && ' · '}
            {muscle != null && <span style={{ color: BODY.muscle }}>{displayWeight(muscle)}{unit} muscle</span>}
            {/* The band used to say "No weigh-in today" whenever fat and muscle
                were both absent — true on a day with no weight, FALSE on a day
                Apple Health synced one. HealthKit carries bodyweight and nothing
                else the scale measures, so that second day is a real weigh-in
                with the manual half missing, and it is the one worth acting on:
                the numbers are still on the scale's display today and will not
                be tomorrow. */}
            {fat == null && muscle == null && (gap ?? 'No weigh-in today')}
            {/* Appended, not substituted: a day with a body fat but no skeletal
                muscle is mostly complete, and hiding the numbers to ask for the
                rest of them would be a scold rather than a reminder. */}
            {gapShort && <span style={{ color: SAND }}> · {gapShort}</span>}
          </span>
          {segments && (
            <span className="mt-1 flex h-1.5 w-full max-w-[160px] rounded-full overflow-hidden" aria-hidden="true">
              {segments.map((s, i) => (
                <span key={i} style={{ width: `${s.pct}%`, background: s.color }} />
              ))}
            </span>
          )}
        </span>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted" aria-hidden="true" />
      </div>
    </ZoneRow>
  )
}
