'use client'

import type { DayVaultData } from '@/lib/hooks/useDayVault'
import { useLatestBodyReading } from '@/lib/hooks/useLatestBodyReading'
import { deriveBodyComp } from '@/lib/body/composition'
import { deltaVerdict, verdictColor, type Metric } from '@/lib/body/deltaVerdict'
import { activePhase } from '@/lib/programs'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { BODY, MACRO, visceralColor } from '@/lib/theme/palette'
import { displayWeight, weightUnit } from '@/lib/utils/units'
import { Head, Sub } from '@/components/session-detail/MetricGrid'
import { useIsMaintenanceDate } from '@/lib/hooks/useMaintenance'

/**
 * Body composition, as numbers and a ledger.
 *
 * ── WHAT THIS REPLACED ───────────────────────────────────────────────────────
 * `BodyMap`: a humanoid silhouette clipped into four coloured strata sized to
 * water, protein, mineral and fat, beside a stack of reference bars. It was the
 * one place in the app that answered a question with a picture, and the picture
 * was doing two jobs badly. As an illustration it read as a cartoon; as a
 * measurement it implied a segmental (per-limb) scan that a bathroom scale does
 * not perform — the note in its own header said so.
 *
 * The question it was trying to answer is a good one: *what am I made of, and is
 * each part where it should be.* That is a ledger — one row per constituent,
 * its share of bodyweight, and the band it is supposed to fall in. Read in one
 * scan, no shape to interpret.
 *
 * ── AND THE HEADLINES ARE THE APP'S OWN CELLS ────────────────────────────────
 * The four centred mini-tiles above the figure (`InBodyHeadline`) were a fifth
 * private vocabulary for printing a metric. They are `Head` and `Sub` from
 * `MetricGrid` now — the same cells the session pages use, so a number looks the
 * same wherever you meet it.
 *
 * ── WHAT IS DELIBERATELY UNCHANGED ───────────────────────────────────────────
 * Every figure and every reference band is exactly what `BodyMap` plotted, from
 * the same `deriveBodyComp` and the same shares of bodyweight. This is a change
 * of presentation; a change to the arithmetic would be a different commit with
 * a different justification.
 */

const { water: WATER, protein: PROTEIN, mineral: MINERAL, fat: FAT, muscle: MUSCLE, lean: LEAN } = BODY

/**
 * The ledger rows, with their normal reference bands.
 *
 * ── THE TRAP THIS TABLE ALREADY WALKED INTO ONCE ─────────────────────────────
 * There used to be a single row labelled "Skeletal Muscle" plotting
 * `muscle_mass_kg` — weight × muscle %, which is LEAN SOFT TISSUE and sits near
 * 78 % — against skeletal muscle's 40–50 % band. The label named one quantity,
 * the bar drew another, and the band belonged to the first, so it pinned at full
 * width every day and looked like a spectacular result.
 *
 * Two rows, each against its own band. The skeletal row renders only when the
 * scale reading was actually taken, because skeletal muscle mass is ENTERED and
 * never derived (see `lib/body/composition.ts`).
 */
const BARS = [
  { key: 'skeletal', label: 'Skeletal Muscle', color: MUSCLE, lo: 40, hi: 50 },
  { key: 'muscle', label: 'Lean Soft Tissue', color: LEAN, lo: 70, hi: 85 },
  { key: 'water', label: 'Body Water', color: WATER, lo: 50, hi: 65 },
  { key: 'protein', label: 'Protein', color: PROTEIN, lo: 16, hi: 20 },
  { key: 'mineral', label: 'Bone Mineral', color: MINERAL, lo: 3.5, hi: 6 },
  { key: 'fat', label: 'Body Fat', color: FAT, lo: 10, hi: 20 },
] as const

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * A body delta is not a session delta.
 *
 * `MetricGrid`'s own `Delta` prints a percentage and colours it by whether up is
 * good — a fixed property of the metric. Body composition does not work that
 * way: whether losing 400 g is good depends on the phase you are in, and a
 * maintenance week has a dead band inside which the scale is reporting water
 * rather than progress. `deltaVerdict` is that rule, and it is the same one the
 * timeline and the weekly export grade with.
 *
 * Absolute units, not percent: 0.4 kg means something on a bathroom scale, and
 * "0.5 %" of a weight the reader has to remember does not.
 */
function BodyDelta({ metric, value, previous, unit }: {
  metric: Metric
  value: number | null | undefined
  previous: number | null | undefined
  unit: string
}) {
  void useScheduleVersion()   // activePhase() is a module read React cannot see
  // A maintenance week judges inside a dead band — see `deltaVerdict`. Hooks
  // run before the early return; React does not allow one after it.
  const maintenance = useIsMaintenanceDate()
  if (value == null || previous == null) return null
  const delta = Math.round((value - previous) * 100) / 100
  if (delta === 0) return null
  return (
    <span className="helix-num font-bold whitespace-nowrap" style={{ color: verdictColor(deltaVerdict(metric, delta, activePhase(), maintenance)) }}>
      {delta > 0 ? '▲' : '▼'}{Math.abs(delta)}{unit}
    </span>
  )
}

/**
 * One constituent: its share of bodyweight, its mass, and where the band sits.
 *
 * Exported because the dashboard's Body widget renders the SAME rows in a tile.
 * A second implementation would be a second set of band edges to keep in step
 * with these ones, and the bands are the whole point of the row.
 *
 * ── `compact` STACKS, IT DOES NOT SHRINK ─────────────────────────────────────
 * It used to keep this row's three-column shape and simply narrow the label
 * column to 58px, which is not wide enough for any of the labels: "Lean Soft
 * Tissue" rendered as "Lean S…", "Bone Mineral" as "Bone M…". A truncated label
 * on a body-composition row is worse than no label, because the reader cannot
 * tell WHICH of the two muscle figures they are looking at — and those two
 * differ by about 23 kg (see `body-comp-is-three-metrics`).
 *
 * So the compact row puts the label and both figures on one line above a
 * full-width track. Same data, same bands, no column to run out of.
 */
export function LedgerRow({ label, color, pct, mass, lo, hi, unit, compact }: {
  label: string
  color: string
  pct: number | null
  mass: number | null
  lo: number
  hi: number
  unit: string
  /** Tile-sized: label above a full-width track instead of beside it. */
  compact?: boolean
}) {
  const fill = pct != null ? Math.max(0, Math.min(100, pct)) : 0
  const inBand = pct != null && pct >= lo && pct <= hi

  /* The track. Square ends and a flat fill on graphite — a rounded, glowing bar
     reads as a gauge with an opinion, and this one is reporting a share, not
     scoring it. The verdict lives in the band ticks. */
  const track = (
    <span className={`relative block min-w-0 rounded-[1px] bg-white/[0.06] ${compact ? 'h-2' : 'h-1.5'}`} aria-hidden="true">
      <span
        className="absolute inset-y-0 left-0 rounded-[1px]"
        style={{
          width: `${fill}%`,
          // A hair of shading along the fill, so six flat blocks of colour read
          // as six materials rather than as six swatches. Same hue throughout.
          background: compact ? `linear-gradient(90deg, ${color}cc 0%, ${color} 100%)` : color,
        }}
      />
      {/* Where normal starts and ends, as hairlines rather than a green zone:
          a coloured region behind the bar turns a reference into a grade. */}
      {[lo, hi].map((t) => (
        <span key={t} className="absolute inset-y-[-2px] w-px" style={{ left: `${t}%`, background: 'rgba(255,255,255,0.22)' }} />
      ))}
    </span>
  )

  if (compact) {
    return (
      <div className="block min-w-0">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted truncate">{label}</span>
          <span className="helix-num text-[10px] tabular-nums text-muted ml-auto shrink-0">
            {mass != null ? `${r1(displayWeight(mass) ?? 0)}${unit}` : ''}
          </span>
          <span
            className="helix-num text-[11px] font-bold tabular-nums shrink-0"
            style={{ color: inBand ? color : 'var(--color-muted)' }}
            title={`Normal ${lo}–${hi}%`}
          >
            {pct != null ? `${r1(pct)}%` : '—'}
          </span>
        </div>
        <div className="mt-0.5">{track}</div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted shrink-0 truncate w-[92px]">
        {label}
      </span>
      <span className="flex-1 min-w-0">{track}</span>
      <span className="helix-num text-[11px] tabular-nums text-text w-[62px] shrink-0 text-right">
        {mass != null ? `${r1(displayWeight(mass) ?? 0)}` : '—'}
        <span className="text-[9px] text-muted font-normal ml-0.5">{unit}</span>
      </span>
      <span
        className="helix-num text-[11px] font-bold tabular-nums shrink-0 text-right w-[46px]"
        style={{ color: inBand ? color : 'var(--color-muted)' }}
        title={`Normal ${lo}–${hi}%`}
      >
        {pct != null ? `${r1(pct)}%` : '—'}
      </span>
    </div>
  )
}

/**
 * The ledger's rows, computed once and shared.
 *
 * The Body WIDGET on the dashboard shows a subset of these in a tile. It must
 * not recompute them: `deriveBodyComp` fills in what the scale did not send,
 * and two call sites deriving separately is how the same body ends up with two
 * different fat masses on two screens. Skeletal muscle is ENTERED and never
 * derived, so its row is absent rather than guessed whenever the reading was
 * not taken (see `lib/body/composition.ts`).
 */
export function compositionRows(log: Record<string, unknown> | null | undefined): {
  weight: number | undefined
  bodyFatPct: number | undefined
  skeletalKg: number | undefined
  rows: Array<{ key: string; label: string; color: string; lo: number; hi: number; mass: number | null; pct: number | null }>
} {
  const rec = (log ?? null) as Record<string, number | null> | null
  const weight = num(rec?.weight_kg)
  const d = deriveBodyComp({
    weight_kg: num(rec?.weight_kg), body_fat_pct: num(rec?.body_fat_pct),
    muscle_percent: num(rec?.muscle_percent), water_percent: num(rec?.water_percent),
    bone_mineral: num(rec?.bone_mineral), protein_percent: num(rec?.protein_percent),
  })
  const mass: Record<string, number | undefined> = {
    skeletal: num(rec?.skeletal_muscle_mass_kg),
    muscle: num(rec?.muscle_mass_kg) ?? d.muscle_mass_kg,
    water: num(rec?.water_mass_kg) ?? d.water_mass_kg,
    protein: num(rec?.protein_mass_kg) ?? d.protein_mass_kg,
    mineral: num(rec?.bone_mineral_kg) ?? d.bone_mineral_kg,
    fat: num(rec?.fat_mass_kg) ?? d.fat_mass_kg,
  }
  const pct = (m?: number) => (m != null && weight ? (m / weight) * 100 : null)
  return {
    weight,
    bodyFatPct: num(rec?.body_fat_pct) ?? pct(mass.fat) ?? undefined,
    skeletalKg: mass.skeletal,
    rows: BARS
      .filter((b) => b.key !== 'skeletal' || mass.skeletal != null)
      .map((b) => ({ ...b, mass: mass[b.key] ?? null, pct: pct(mass[b.key]) })),
  }
}

export function CompositionLedger({ log, date }: { log: DayVaultData['log']; date: string }) {
  const rec = log as Record<string, number | null> | null
  const { data: last } = useLatestBodyReading(date)
  const unit = weightUnit()

  const weight = num(rec?.weight_kg)
  const d = deriveBodyComp({
    weight_kg: num(rec?.weight_kg), body_fat_pct: num(rec?.body_fat_pct),
    muscle_percent: num(rec?.muscle_percent), water_percent: num(rec?.water_percent),
    bone_mineral: num(rec?.bone_mineral), protein_percent: num(rec?.protein_percent),
  })
  // The previous reading through the SAME derivation, so a delta compares like
  // with like rather than a stored mass against a freshly computed one.
  const p = deriveBodyComp(last?.values ?? {})

  const mass = {
    // Entered, never derived. Absent on any day the reading wasn't taken, and
    // its row disappears rather than guessing.
    skeletal: num(rec?.skeletal_muscle_mass_kg),
    muscle: num(rec?.muscle_mass_kg) ?? d.muscle_mass_kg,
    water: num(rec?.water_mass_kg) ?? d.water_mass_kg,
    protein: num(rec?.protein_mass_kg) ?? d.protein_mass_kg,
    mineral: num(rec?.bone_mineral_kg) ?? d.bone_mineral_kg,
    fat: num(rec?.fat_mass_kg) ?? d.fat_mass_kg,
  }

  if (!weight || Object.values(mass).every((v) => v == null)) {
    return (
      <p className="text-[11px] text-muted">
        Log weight + body-fat / muscle % to map your composition.
      </p>
    )
  }

  const pct = (m?: number) => (m != null && weight ? (m / weight) * 100 : null)
  const smm = mass.skeletal
  const fatFree = num(rec?.fat_free_mass_kg) ?? d.fat_free_mass_kg
  const bodyFatPct = num(rec?.body_fat_pct) ?? pct(mass.fat)

  const rows = BARS
    // No skeletal reading → no skeletal row. It is the one figure here that
    // cannot be inferred from the others.
    .filter((b) => b.key !== 'skeletal' || smm != null)
    .map((b) => ({ ...b, mass: mass[b.key] ?? null, pct: pct(mass[b.key]) }))

  return (
    <div className="space-y-3.5">
      {/* Row 1 — the three numbers a weigh-in is FOR. */}
      <div className="grid grid-cols-3 gap-x-3">
        <Head
          first
          label="Weight"
          value={weight != null ? `${r1(displayWeight(weight) ?? 0)}` : null}
          unit={unit}
          sub={<BodyDelta metric="weight" value={weight} previous={last?.values.weight_kg} unit={unit} />}
        />
        <Head
          label="Body Fat"
          value={bodyFatPct != null ? `${r1(bodyFatPct)}` : null}
          unit="%"
          sub={<BodyDelta metric="fat" value={num(rec?.body_fat_pct)} previous={last?.values.body_fat_pct} unit="pp" />}
        />
        {/* Skeletal muscle when it was measured, lean soft tissue otherwise —
            and the delta compares against the SAME quantity, never across the
            ~23 kg that separates them. */}
        {smm != null ? (
          <Head
            label="Skeletal"
            value={`${r1(displayWeight(smm) ?? 0)}`}
            unit={unit}
            sub={<BodyDelta metric="muscle" value={smm} previous={last?.values.skeletal_muscle_mass_kg} unit={unit} />}
          />
        ) : (
          <Head
            label="Lean Soft Tissue"
            value={mass.muscle != null ? `${r1(displayWeight(mass.muscle) ?? 0)}` : null}
            unit={unit}
            sub={<BodyDelta metric="muscle" value={mass.muscle} previous={p.muscle_mass_kg} unit={unit} />}
          />
        )}
      </div>

      {/* Row 2 — context, at label size. Visceral fat is graded rather than
          identified: it is the one body metric where a higher number is worse,
          which is why it is not in the BODY hue map at all. */}
      <div className="grid grid-cols-4 gap-3 pt-2.5 border-t border-white/[0.06]">
        <Sub label="Fat-Free" value={fatFree != null ? `${r1(displayWeight(fatFree) ?? 0)}` : null} unit={unit} color={BODY.lean} />
        <Sub label="Water" value={num(rec?.water_percent) != null ? `${r1(num(rec?.water_percent) as number)}` : null} unit="%" color={BODY.water} />
        <Sub label="Visceral" value={num(rec?.visceral_fat) != null ? `${r1(num(rec?.visceral_fat) as number)}` : null} color={visceralColor(rec?.visceral_fat)} />
        <Sub label="BMR" value={num(rec?.bmr) != null ? `${Math.round(num(rec?.bmr) as number)}` : null} unit="kcal" color={MACRO.calories} />
      </div>

      {/* The ledger — what you are made of, and whether each part is where it
          should be. One hue per constituent, the same hue it wears in the
          composition chart and on the dashboard tile. */}
      <div className="space-y-1.5 pt-1">
        {rows.map((b) => (
          <LedgerRow key={b.key} label={b.label} color={b.color} pct={b.pct} mass={b.mass} lo={b.lo} hi={b.hi} unit={unit} />
        ))}
      </div>
    </div>
  )
}
