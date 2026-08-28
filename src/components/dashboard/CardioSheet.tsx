'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Activity, ArrowRight, Flame, Footprints, HeartPulse, Timer, Zap } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { useCardioHistory, useCardioLogs } from '@/lib/hooks/useCardio'
import { activeKcalOf, distanceKm, formatPace, paceMinPerKm } from '@/lib/cardio/metrics'
import { logicalTodayISO, relativeDayLabel } from '@/lib/utils/day'
import { blurOnTap } from '@/lib/utils/blurOnTap'
import { EMERALD, EMBER, SAPPHIRE, OXIDE, MACRO } from '@/lib/theme/palette'

/**
 * Today's cardio — or, on a day you have not walked yet, the last one.
 *
 * ── WHY THIS EXISTS AS A SHEET ───────────────────────────────────────────────
 * Tapping the Cardio tile used to NAVIGATE: it pushed `/day/<today>`, on the
 * reasoning that logging a walk belongs on the day it happened. That is right
 * about LOGGING and wrong about the tap. Every other tile on the grid answers
 * itself in place — the tile is a glance and the sheet is the reading behind it
 * — so cardio was the one widget that charged you a page transition, a scroll
 * and a journey back for the crime of wanting to know your pace.
 *
 * The sheet states the reading; the row at its foot is still the way to the
 * day, which is where the form lives. The rule the old behaviour was protecting
 * survives — you still log a walk beside the walk's own entry — it just is not
 * the price of looking.
 *
 * ── AND WHY IT FALLS BACK TO THE LAST OUTING ─────────────────────────────────
 * A cardio tile on a Thursday morning has nothing to say about Thursday, and
 * "no cardio today" is a fact you already knew from the tile you tapped. The
 * most recent walk, dated, is the answer to the question actually being asked,
 * which is how the walking is going.
 */
export function CardioSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = logicalTodayISO()
  const { data: todayLogs } = useCardioLogs(today)
  const { data: history } = useCardioHistory()

  /**
   * The outing on show: today's, folded into one (distance and time add, heart
   * rate means), else the most recent day that has any.
   *
   * Folded rather than listed, because two walks on one day are one day's
   * walking — and a pace computed per row and then averaged is not a pace.
   * `paceMinPerKm` takes the totals, so it stays a real minutes-per-kilometre.
   */
  const shown = useMemo(() => {
    const rows = (todayLogs ?? []).length
      ? { date: today, rows: todayLogs ?? [] }
      : (() => {
        const hist = history ?? []
        if (!hist.length) return null
        // `useCardioHistory` is newest-first; take every row of that newest day.
        const newest = hist[0].date
        return { date: newest, rows: hist.filter((r) => r.date === newest) }
      })()
    if (!rows || !rows.rows.length) return null

    const meters = rows.rows.reduce((n, c) => n + (c.distance_m ?? 0), 0)
    const minutes = rows.rows.reduce((n, c) => n + (c.duration_min ?? 0), 0)
    const kcal = rows.rows.reduce((n, c) => n + (activeKcalOf(c) ?? 0), 0)
    const hrs = rows.rows.map((c) => c.avg_hr).filter((v): v is number => v != null)
    return {
      date: rows.date,
      kinds: [...new Set(rows.rows.map((r) => r.kind))],
      km: meters > 0 ? distanceKm(meters) : null,
      minutes: minutes > 0 ? Math.round(minutes) : null,
      pace: formatPace(paceMinPerKm(meters, minutes)),
      kcal: kcal > 0 ? Math.round(kcal) : null,
      hr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
      count: rows.rows.length,
    }
  }, [todayLogs, history, today])

  const isRun = !!shown?.kinds.includes('run')
  const accent = isRun ? EMBER : EMERALD
  const dayLabel = relativeDayLabel(shown?.date, today)

  return (
    <Sheet open={open} onClose={onClose} title="Cardio" accent={EMERALD}>
      {!shown ? (
        <div className="py-8 text-center space-y-2">
          <span className="mx-auto w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: `${EMERALD}1a`, color: EMERALD }}>
            <Activity className="w-5 h-5" aria-hidden="true" />
          </span>
          <p className="font-heading font-semibold text-fluid-sm text-text">No walks logged yet</p>
          <p className="text-[11px] text-muted">Zone-2 minutes are the work on the days you do not lift.</p>
        </div>
      ) : (
        <div className="space-y-3 pb-1">
          {/* ── WHEN, AND WHAT ──
              The date leads. A pace shown without the day it was walked is a
              number that quietly ages into a lie on the third morning you do
              not walk. */}
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${accent}1c`, color: accent }}>
              {isRun ? <Zap className="w-4 h-4" aria-hidden="true" /> : <Footprints className="w-4 h-4" aria-hidden="true" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{dayLabel}</span>
              <span className="block font-heading font-bold text-fluid-base capitalize truncate" style={{ color: accent }}>
                {shown.kinds.join(' · ')}
                {shown.count > 1 && <span className="text-muted font-normal text-fluid-xs ml-1.5">{shown.count} outings</span>}
              </span>
            </span>
            {shown.pace !== '—' && (
              <span className="shrink-0 text-right">
                <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted">Pace</span>
                <span className="helix-num block font-bold text-fluid-lg tabular-nums leading-none" style={{ color: accent }}>
                  {shown.pace}
                </span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric icon={Footprints} label="Distance" value={shown.km} unit="km" color={accent} />
            <Metric icon={Timer} label="Duration" value={shown.minutes} unit="min" color={SAPPHIRE} />
            <Metric icon={Flame} label="Active" value={shown.kcal} unit="kcal" color={MACRO.calories} />
            <Metric icon={HeartPulse} label="Avg HR" value={shown.hr} unit="bpm" color={OXIDE} />
          </div>

          {/* Logging still belongs on the day it happened — see the header note. */}
          <Link
            href={`/day/${shown.date}`}
            onPointerUp={blurOnTap}
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl px-3 min-h-[48px] text-fluid-sm font-semibold
                       active:scale-[0.99] transition-transform"
            style={{ color: EMERALD, background: `${EMERALD}14`, border: `1px solid ${EMERALD}44` }}
          >
            Log or edit cardio
            <ArrowRight className="w-4 h-4 ml-auto shrink-0" aria-hidden="true" />
          </Link>
        </div>
      )}
    </Sheet>
  )
}

/** One tinted reading, in the same family as the finish sheet's totals. */
function Metric({ icon: Icon, label, value, unit, color }: {
  icon: typeof Timer; label: string; value: number | null; unit: string; color: string
}) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: `${color}0f`, border: `1px solid ${color}2e` }}>
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color }}>
        <Icon className="w-3 h-3" aria-hidden="true" />
        {label}
      </span>
      <span className="helix-num block font-bold text-fluid-lg tabular-nums leading-none mt-1 text-text">
        {value ?? '—'}
        {value != null && <span className="text-[10px] font-normal text-muted ml-1">{unit}</span>}
      </span>
    </div>
  )
}
