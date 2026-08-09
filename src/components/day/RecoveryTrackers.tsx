'use client'

import { useState } from 'react'
import { Activity, Dumbbell } from 'lucide-react'
import { useDoms, useLogDoms, useDomsSources, DOMS_MUSCLES, DOMS_LEVELS, type DomsMuscle } from '@/lib/hooks/useRecovery'
import { EMBER, MUTED, HAIRLINE } from '@/lib/theme/palette'
import { Sheet } from '@/components/ui/Sheet'
import { SorenessMap, GROUP_MUSCLES, GROUP_LABEL, type SorenessGroup } from '@/components/day/SorenessMap'
import { SEVERITY_COLOR, SEVERITY_WORD } from '@/components/day/severity'

// Re-exported: the ramp moved to its own leaf module to break the import cycle
// with SorenessMap, and callers shouldn't have to care where it lives.
export { SEVERITY_COLOR, SEVERITY_WORD }

const OFFSET_LABEL = ['same day', '+1 day', '+2 days']

/** How many bar segments a severity fills, out of `SEGMENTS`. */
const SEGMENTS = 12

export interface SorenessSummary {
  /** Muscles rated above zero, worst first, then in display order. */
  sore: Array<{ muscle: DomsMuscle; severity: number }>
  /** Everything else — rendered as one muted line, not nine empty rows. */
  clear: DomsMuscle[]
  /** The worst severity present, 0 when nothing is logged. */
  peak: number
}

/**
 * Split today's ratings into the sore rows and the all-clear remainder.
 *
 * Pure and exported so the ordering is testable: the panel's whole claim is
 * that the worst thing is at the top.
 */
export function sorenessSummary(doms: Partial<Record<DomsMuscle, number>> | undefined): SorenessSummary {
  const sore: SorenessSummary['sore'] = []
  const clear: DomsMuscle[] = []
  for (const muscle of DOMS_MUSCLES) {
    const severity = doms?.[muscle] ?? 0
    if (severity > 0) sore.push({ muscle, severity })
    else clear.push(muscle)
  }
  // Stable within a severity: DOMS_MUSCLES order breaks ties, so the list does
  // not reshuffle when two muscles are rated the same.
  sore.sort((a, b) => b.severity - a.severity
    || DOMS_MUSCLES.indexOf(a.muscle) - DOMS_MUSCLES.indexOf(b.muscle))
  return { sore, clear, peak: sore[0]?.severity ?? 0 }
}

/** A 12-segment intensity bar, filled `severity/3` and tinted by severity. */
function SeverityBar({ severity }: { severity: number }) {
  const filled = Math.round((severity / 3) * SEGMENTS)
  const c = SEVERITY_COLOR[severity] ?? MUTED
  return (
    <span className="flex gap-px flex-1 min-w-[64px]" aria-hidden="true">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span key={i} className="h-2 flex-1 rounded-[1px]"
          style={{ background: i < filled ? c : 'rgba(255,255,255,0.06)' }} />
      ))}
    </span>
  )
}

/** The 4-way severity picker for one muscle, plus its attribution chip. */
function MuscleRow({ muscle, current, source, onRate }: {
  muscle: DomsMuscle
  current: number | undefined
  source: { label: string; dayOffset: number } | undefined
  onRate: (severity: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-fluid-sm text-text w-[84px] shrink-0 truncate">{muscle}</span>
        <div className="flex gap-1.5 flex-1">
          {DOMS_LEVELS.map((lv) => {
            const on = current === lv.v
            const c = SEVERITY_COLOR[lv.v]
            return (
              <button
                key={lv.v}
                type="button"
                onClick={() => onRate(lv.v)}
                aria-pressed={on}
                aria-label={`${muscle}: ${lv.label}`}
                className="flex-1 rounded-lg min-h-[44px] text-[10px] font-bold uppercase tracking-wide transition-colors"
                style={{
                  color: on ? c : MUTED,
                  background: on ? `${c}1f` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${on ? `${c}66` : HAIRLINE}`,
                }}
              >
                {lv.label}
              </button>
            )
          })}
        </div>
      </div>
      {source && current != null && current > 0 && (
        <div className="flex items-center gap-1 pl-[92px] text-[9px] text-muted">
          <Dumbbell className="w-2.5 h-2.5 shrink-0" style={{ color: EMBER }} aria-hidden="true" />
          <span className="truncate">
            <span className="font-semibold" style={{ color: EMBER }}>{source.label}</span>
            {' · '}{OFFSET_LABEL[source.dayOffset] ?? `+${source.dayOffset} days`}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * DOMS tracker — rate delayed-onset soreness in the 72h AFTER a session, which is
 * when it actually shows up and fades. Whole-body (Chest · Back · Arms ·
 * Shoulders · Abs · Glutes · Quads · Hamstrings · Calves); each muscle's rating
 * is auto-attributed to the most recent session that TRAINED it, so "sore chest"
 * ties to the last Upper day and "sore glutes" to the last leg day.
 *
 * THE MAP IS THE INTERFACE. Nine muscles as a list of nine 4-button rows was a
 * form you scrolled; as a silhouette it is a glance. Tapping a region opens that
 * broad area's picker — the legs open with Glutes, Quads, Hamstrings and Calves
 * together, because that is how a leg day gets rated.
 *
 * The bar list beside the map is not decoration: it is the accessible, exact
 * reading of the same data (severity words, attribution), and it is what remains
 * legible if the SVG can't render.
 */
export function DomsTracker({ date }: { date: string }) {
  const { data: doms } = useDoms(date)
  const { data: sources } = useDomsSources(date)
  const log = useLogDoms(date)
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [picking, setPicking] = useState<SorenessGroup | null>(null)

  const { sore, clear, peak } = sorenessSummary(doms)

  return (
    // No card chrome: this is the content of a Nexus band, and the band's label
    // already says Soreness. A heading here would say it twice.
    <div className="px-3 py-2 space-y-2.5">
      <div className="flex items-center gap-1.5 min-h-[32px]">
        {sore.length > 0 ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: SEVERITY_COLOR[peak] }}>
            <Activity className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            {sore.length} sore · {SEVERITY_WORD[peak]}
          </span>
        ) : (
          <span className="text-[10px] text-muted">Tap a muscle to rate</span>
        )}
        {/* Front / back — a segmented pill, the RangeSelector pattern. */}
        <div className="ml-auto flex rounded-lg overflow-hidden border border-white/[0.08] shrink-0">
          {(['front', 'back'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              aria-pressed={side === s}
              className="px-2.5 min-h-[32px] text-[10px] font-semibold uppercase tracking-wide capitalize transition-colors"
              style={side === s
                ? { background: `${EMBER}1f`, color: EMBER }
                : { color: MUTED }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* The map. Fixed aspect so the two views can't jump height on flip. */}
        <div className="shrink-0 w-[86px] sm:w-[104px]" style={{ aspectRatio: '120 / 260' }}>
          <SorenessMap side={side} doms={doms} onPick={setPicking} />
        </div>

        {/* The exact reading, worst first. */}
        <div className="flex-1 min-w-0 space-y-1">
          {sore.map(({ muscle, severity }) => {
            const src = sources?.[muscle]
            return (
              <div key={muscle} className="flex items-center gap-2">
                <span className="text-fluid-xs text-text w-[68px] shrink-0 truncate">{muscle}</span>
                <SeverityBar severity={severity} />
                <span className="text-[9px] uppercase tracking-wide w-14 shrink-0 text-right"
                  style={{ color: SEVERITY_COLOR[severity] }}>{SEVERITY_WORD[severity]}</span>
                {src && (
                  <span className="hidden sm:flex items-center gap-1 text-[9px] text-muted shrink-0 max-w-[120px]">
                    <Dumbbell className="w-2.5 h-2.5 shrink-0" style={{ color: EMBER }} aria-hidden="true" />
                    <span className="truncate">{src.label}</span>
                  </span>
                )}
              </div>
            )
          })}
          {clear.length > 0 && (
            <p className="text-[10px] text-muted leading-snug pt-0.5">
              <span className="uppercase tracking-wide opacity-70">Clear</span>{' · '}
              {clear.join('  ')}
            </p>
          )}
        </div>
      </div>

      {/* One drawer per broad area — the whole group rated in one place.
          A rating pass is a handful of taps you want to leave quickly, which is
          exactly what swipe-to-dismiss is for; the centred glass box it replaces
          could only be closed by aiming at an X. */}
      <Sheet
        open={picking != null}
        onClose={() => setPicking(null)}
        title={picking ? GROUP_LABEL[picking] : undefined}
        accent={EMBER}
      >
        <p className="text-[11px] text-muted leading-snug mb-3">
          Rate 24–72h after training — that&apos;s when soreness peaks. Each muscle links to the workout that caused it.
        </p>
        <div className="space-y-3">
          {(picking ? GROUP_MUSCLES[picking] : []).map((m) => (
            <MuscleRow
              key={m}
              muscle={m}
              current={doms?.[m]}
              source={sources?.[m]}
              onRate={(severity) => log.mutate({ muscle: m, severity, source: sources?.[m] })}
            />
          ))}
        </div>
      </Sheet>
    </div>
  )
}
