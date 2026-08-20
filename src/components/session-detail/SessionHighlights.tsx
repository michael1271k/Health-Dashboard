'use client'

import { useMemo, useState } from 'react'
import { Trophy, Flame, ArrowUp, Plus } from 'lucide-react'
import type { DetailExercise } from '@/lib/hooks/useSessionDetail'
import { prAxisLabel } from '@/lib/training/prEngine'
import { isTimedExercise } from '@/lib/exercises/timed'
import { formatSet } from '@/lib/utils/setFormat'
import { useUnitSystem, displayWeight } from '@/lib/utils/units'
import { useSessionIntel } from '@/lib/hooks/useSessionIntel'
import { sessionVerdict } from '@/lib/training/sessionVerdict'
import { GOLD, SAPPHIRE, EMERALD } from '@/lib/theme/palette'

/** How many chips show before the row folds the rest behind a counter. */
const VISIBLE = 4

/** The highest est-1RM of the session — a ranking, not a record. */
export function strongestOf(exercises: readonly DetailExercise[]): DetailExercise | null {
  let best: DetailExercise | null = null
  for (const e of exercises) {
    const v = e.bestEst1rm ?? 0
    if (v > 0 && (!best || v > (best.bestEst1rm ?? 0))) best = e
  }
  return best
}

interface Highlight { name: string; axes: string[]; detail: string }

/** Every record in the session, one line each, resolved from the set that won it. */
export function highlightsOf(exercises: readonly DetailExercise[], toDisplay: (kg: number) => number | null, unit: string): Highlight[] {
  const out: Highlight[] = []
  for (const ex of exercises) {
    const timed = isTimedExercise(ex.name)
    const won = ex.sets.filter((s) => s.isPr)
    if (!won.length) continue
    // Collapse to ONE line per exercise: the set that carries the most axes,
    // then the heaviest. Two trophy rows for one movement reads as two records.
    // `prAxes` is read defensively throughout: a localStorage-persisted session
    // detail written before the field existed rehydrates without it, and a bare
    // `.length` here took the whole report down with an error boundary.
    const lead = [...won].sort((a, b) => (b.prAxes?.length ?? 0) - (a.prAxes?.length ?? 0) || b.weightKg - a.weightKg)[0]
    const axes = (lead.prAxes?.length ? lead.prAxes : ex.prAxes ?? []).map((a) => prAxisLabel(a, timed))
    out.push({
      name: ex.name,
      axes: [...new Set(axes)],
      detail: formatSet(lead.weightKg, lead.reps, { timed, unit, toDisplay }),
    })
  }
  return out
}

/**
 * Everything the session is notable FOR, in one row of chips: records, the
 * movements that took more load than last time, and the strongest lift.
 *
 * They used to be discoverable only by scrolling: a gold chip somewhere in one
 * exercise header, a sapphire border on another card. The two facts you most
 * want from a finished session — did I set anything, and what was the heaviest
 * thing I did — took a full scroll to answer.
 *
 * ── THE LOAD GAINS CAME HERE FROM A SENTENCE ─────────────────────────────────
 * `ProgressionTrail` used to end its verdict with
 * `loadGains.slice(0, 3).map(...).join(' · ')` — muted grey prose running into
 * a `·`-separated list of movement names and arrows, capped at three with no
 * indication that it had been capped. It was the same KIND of fact as the gold
 * record chips rendered 30px below it, in a completely different visual
 * language, which is what made the block read as two unrelated things stacked.
 *
 * One row, three tints, one geometry:
 *   gold + trophy   — a record. The loudest thing a session can contain.
 *   emerald + arrow — more load than last time on this movement.
 *   sapphire + flame— the heaviest single lift, which is a ranking, not a record.
 *
 * `useSessionIntel` is called here as well as in `SessionHero` and
 * `ProgressionTrail`; all three share a query key, so TanStack serves them from
 * one fetch. That is the established pattern on this page, not an accident.
 *
 * Renders nothing when there is nothing to say. A "0 PRs" panel is noise.
 */
export function SessionHighlights({ sessionId, exercises }: { sessionId: string; exercises: DetailExercise[] }) {
  const unit = useUnitSystem()
  const { data: intel } = useSessionIntel(sessionId)
  const [expanded, setExpanded] = useState(false)

  const highlights = useMemo(
    () => highlightsOf(exercises, (kg) => displayWeight(kg), unit),
    [exercises, unit],
  )
  const strongest = useMemo(() => strongestOf(exercises), [exercises])
  const loadGains = useMemo(() => {
    if (!intel) return []
    const v = sessionVerdict(intel.volumeDeltaPct, intel.deltas.map((d) => ({
      name: d.name, topKg: d.topKg, prevKg: d.prevKg, unloaded: d.unloaded,
    })))
    return v?.loadGains ?? []
  }, [intel])

  const chips: Chip[] = [
    ...highlights.map((h): Chip => ({
      key: `pr:${h.name}`, color: GOLD, icon: Trophy, glow: true,
      name: h.name, figure: h.detail, title: `Record · ${h.axes.join(' · ')} · ${h.detail}`,
    })),
    // A movement that also set a record is already in the row in gold; saying
    // "heavier" about it again in green is the same fact twice, quieter.
    ...loadGains
      .filter((g) => !highlights.some((h) => h.name === g.name))
      .map((g): Chip => ({
        key: `up:${g.name}`, color: EMERALD, icon: ArrowUp,
        name: g.name,
        figure: `${displayWeight(g.fromKg)}→${displayWeight(g.toKg)}${unit}`,
        title: `Heavier than last time · ${g.name}`,
      })),
    ...(strongest ? [{
      key: 'best', color: SAPPHIRE, icon: Flame,
      name: strongest.name,
      figure: `e1RM ${displayWeight(strongest.bestEst1rm ?? 0)}${unit}`,
      title: `Strongest lift of the session · ${strongest.name}`,
    } satisfies Chip] : []),
  ]

  if (!chips.length) return null

  /* ── CHIPS, NOT A PANEL ──
     A record is a FACT ABOUT the session, not a section of the report. This
     used to be a bordered panel of full-width tinted rows sitting between the
     header and Progression — so a session with one PR spent a whole card
     saying it, and a session with none left a gap where readers had learned to
     look. Inline chips inside the Progression band carry the same facts and
     cost one line. */
  const shown = expanded ? chips : chips.slice(0, VISIBLE)
  const hidden = chips.length - shown.length

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {shown.map((c) => <ChipView key={c.key} chip={c} />)}
      {hidden > 0 && (
        /* A cap that silently drops items is why the old list looked arbitrary
           — three names and then nothing, with no way to know more existed. */
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1 px-2 min-h-[28px] rounded-lg text-[10px] font-semibold
                     text-muted border border-white/[0.12] hover:text-text active:scale-95 transition-transform"
        >
          <Plus className="w-3 h-3" aria-hidden="true" />{hidden} more
        </button>
      )}
    </div>
  )
}

interface Chip {
  key: string
  color: string
  icon: typeof Trophy
  name: string
  figure: string
  title: string
  glow?: boolean
}

/**
 * One chip. Extracted so the three kinds cannot drift into three geometries —
 * which is exactly what happened last time, when the load gains were prose and
 * the records were chips.
 */
function ChipView({ chip }: { chip: Chip }) {
  const Icon = chip.icon
  return (
    <span
      title={chip.title}
      className="inline-flex items-center gap-1 px-2 min-h-[28px] rounded-lg text-[10px] font-semibold max-w-full"
      style={{ color: chip.color, background: `${chip.color}14`, border: `1px solid ${chip.color}40` }}
    >
      <Icon className="w-3 h-3 shrink-0"
        style={chip.glow ? { filter: `drop-shadow(0 0 4px ${chip.color}99)` } : undefined}
        aria-hidden="true" />
      <span className="truncate min-w-0 text-text">{chip.name}</span>
      <span className="helix-num shrink-0">{chip.figure}</span>
    </span>
  )
}
