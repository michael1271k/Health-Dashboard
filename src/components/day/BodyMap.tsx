'use client'

import { useId } from 'react'
import { deriveBodyComp } from '@/lib/body/composition'
import { BODY } from '@/lib/theme/palette'
import type { DayVaultData } from '@/lib/hooks/useDayVault'

// Composition colour comes from the shared BODY map — one hue per substance,
// app-wide. These were five local hexes, two of which (a candy-pink `MUSCLE` for
// muscle and a `MINERAL` white) existed nowhere else in the palette, so this
// figure and the composition CHART disagreed about what muscle looks like.
const { water: WATER, protein: PROTEIN, mineral: MINERAL, fat: FAT, muscle: MUSCLE } = BODY

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

// A connected, athletic male silhouette (viewBox 0 0 100 214). Points trace the
// RIGHT half head-top → clockwise down the arm/torso/outer leg → up the inner leg
// to the crotch apex; the left half is the mirror, reversed, so the whole figure is
// ONE closed path — head joined to neck, arms flaring off the torso, legs split by a
// real gap (no stick-figure limbs).
const RIGHT: [number, number][] = [
  // head → neck
  [50, 4], [58, 5], [64, 11], [65, 19], [63, 27], [58, 32], [55, 35], [55, 40],
  // trapezius → deltoid cap. The delt/upper-arm junction is pulled IN (80–82 vs
  // the old 83–87): the arm used to flare wider than the shoulder it hangs from,
  // which read as a cartoon rather than an anatomical model.
  [63, 40], [72, 44], [80, 52], [82, 60],
  // outer arm → hand
  [82, 74], [79.5, 92], [77, 108], [75, 114],
  // back up the inner arm to the armpit
  [71.5, 113], [69, 97], [67.5, 79], [66.5, 62], [64, 57],
  // lat flare → waist → abdomen/pelvis, widened to carry the leg mass below
  // (a narrow pelvis under heavy quads reads as a wasp waist, not a lifter).
  [67, 73], [64.5, 90], [61.5, 102], [61, 110],
  // outer leg — glute tie-in, quad sweep, knee, calf belly, ankle taper.
  // He doesn't skip leg day: thigh half-width goes 11.5 → 18, calf 7 → 12.
  [65, 116], [68, 124], [68.5, 133], [66, 145], [62.5, 153],
  [64.5, 163], [64, 173], [60, 189], [57.5, 203],
  // foot
  [55, 209], [52.5, 206],
  // inner leg back up to the crotch apex. The gap opens with the legs — a
  // hairline seam under heavy quads reads as one slab, not two limbs.
  [54, 185], [54.5, 158], [54, 133], [50, 116],
]
type Pt = [number, number]

/**
 * Centripetal Catmull-Rom through the points, emitted as cubic Béziers.
 *
 * The outline was a POLYLINE — 44 points joined by `L` commands — and that one
 * fact is why the figure read as machined rather than grown. A human silhouette
 * has no straight edges, and 44 segments across a 100-unit viewBox facet
 * visibly at the deltoid cap, the lat flare and the calf belly.
 *
 * Every point is kept, so the anatomy the comments above name (trapezius,
 * vastus lateralis, glute tie-in) is unchanged and still reviewable. Only the
 * interpolation between them changes.
 *
 * Centripetal (the sqrt of the chord length), not uniform: uniform
 * Catmull-Rom cusps and self-intersects wherever consecutive points bunch up,
 * which here is exactly the wrist and the ankle.
 */
function spline(points: Pt[], closed = true): string {
  const n = points.length
  const at = (i: number): Pt => points[closed ? (i + n) % n : Math.min(n - 1, Math.max(0, i))]
  const out: string[] = [`M ${at(0)[0].toFixed(2)} ${at(0)[1].toFixed(2)}`]

  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    // Chord lengths raised to alpha=0.5 — the centripetal parameterisation.
    const d = (a: Pt, b: Pt) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-6
    const d01 = d(p0, p1), d12 = d(p1, p2), d23 = d(p2, p3)
    const c1: Pt = [
      p1[0] + ((p2[0] - p0[0]) * d12) / (3 * (d01 + d12)),
      p1[1] + ((p2[1] - p0[1]) * d12) / (3 * (d01 + d12)),
    ]
    const c2: Pt = [
      p2[0] - ((p3[0] - p1[0]) * d12) / (3 * (d12 + d23)),
      p2[1] - ((p3[1] - p1[1]) * d12) / (3 * (d12 + d23)),
    ]
    out.push(`C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)}, ${c2[0].toFixed(2)} ${c2[1].toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`)
  }
  return `${out.join(' ')} Z`
}

/**
 * The left half is NOT an exact mirror.
 *
 * A perfectly bilateral figure reads as a pictogram — the eye recognises the
 * symmetry before it recognises the body. Pulling the left side's deviation
 * from centre in by 1.5% is far below the threshold anyone consciously notices
 * and is most of what separates "a person" from "an icon".
 */
const ASYMMETRY = 0.985

const SILHOUETTE = (() => {
  const left: Pt[] = [...RIGHT].reverse().map(([x, y]) => [50 - (x - 50) * ASYMMETRY, y])
  return spline([...RIGHT, ...left])
})()

// Low-opacity muscle contours (pecs, sternum + ab ticks, delt caps) layered inside
// the silhouette to read as a real anatomical model rather than a flat cut-out.
const CONTOURS = [
  'M 34 50 Q 43 63 50 59', 'M 66 50 Q 57 63 50 59', // pecs
  'M 50 58 L 50 104',                                 // sternum → linea alba
  // Ab separations as shallow arcs, not rules. Three straight horizontals
  // across a torso were the least human marks on the whole figure; the real
  // ones follow the abdominal curve and flatten as they descend.
  'M 43 71 Q 50 74.5 57 71', 'M 43.5 82 Q 50 85 56.5 82', 'M 44 93 Q 50 95.5 56 93',
  'M 21 53 Q 27 46 32 51', 'M 79 53 Q 73 46 68 51', // deltoid caps (narrowed)
  'M 39 104 Q 36.5 108 35 113', 'M 61 104 Q 63.5 108 65 113', // oblique → hip tie-in
  // Leg detail — without these the widened legs render as a slab. Quad sweep
  // (vastus lateralis), adductor line, then the calf belly.
  'M 56 122 Q 63 138 61 152', 'M 44 122 Q 37 138 39 152',
  'M 51.5 124 Q 54 138 55 150', 'M 48.5 124 Q 46 138 45 150',
  'M 57 162 Q 62 172 58.5 185', 'M 43 162 Q 38 172 41.5 185',
]

/**
 * Standard BIA reference bands (% of body weight) — light guidance, not a
 * diagnosis.
 *
 * The first row said "Skeletal Muscle" against a 40–50 % band while the value it
 * drew was `muscle_mass_kg` — weight × muscle %, which is LEAN MASS and
 * sits near 78 %. So the label named one quantity, the bar plotted another, and
 * the reference band belonged to the first: the bar pinned at full width every
 * single day and looked like a spectacular result.
 *
 * Both rows exist now, each against its own band, and the skeletal row only
 * renders when the scale reading was actually taken.
 */
const BARS = [
  { key: 'skeletal', label: 'Skeletal Muscle',  color: MUSCLE,     lo: 40, hi: 50 },
  { key: 'muscle',   label: 'Lean Mass', color: MUSCLE,     lo: 70, hi: 85 },
  { key: 'water',    label: 'Body Water',       color: WATER, lo: 50, hi: 65 },
  { key: 'protein',  label: 'Protein',          color: PROTEIN,  lo: 16, hi: 20 },
  { key: 'mineral',  label: 'Bone Mineral',     color: MINERAL,     lo: 3.5, hi: 6 },
  { key: 'fat',      label: 'Body Fat',         color: FAT,     lo: 10, hi: 20 },
] as const

/**
 * BodyMap — the segmented InBody figure.
 *
 * Left: a humanoid silhouette filled bottom-up with the four non-overlapping
 * compartments (water · protein · mineral · fat) sized to their share of body
 * weight, so the figure literally *is* your composition. Right: InBody-printout
 * bar rows against normal reference bands.
 *
 * NOTE: a smart scale reports WHOLE-BODY composition, not per-limb — the
 * silhouette is a visual model of the whole, not a segmental (per-arm/leg) scan.
 */
export function BodyMap({ log }: { log: DayVaultData['log'] }) {
  const uid = useId().replace(/[:]/g, '')
  const clip = `bm${uid}`
  const r = log as Record<string, number | null> | null

  const weight = num(r?.weight_kg)
  const d = deriveBodyComp({
    weight_kg: num(r?.weight_kg), body_fat_pct: num(r?.body_fat_pct),
    muscle_percent: num(r?.muscle_percent), water_percent: num(r?.water_percent),
    bone_mineral: num(r?.bone_mineral), protein_percent: num(r?.protein_percent),
  })
  const mass = {
    // Entered, never derived — see lib/body/composition.ts. Absent on any day
    // the reading wasn't taken, and its row disappears rather than guessing.
    skeletal: num(r?.skeletal_muscle_mass_kg),
    muscle: num(r?.muscle_mass_kg) ?? d.muscle_mass_kg,
    water: num(r?.water_mass_kg) ?? d.water_mass_kg,
    protein: num(r?.protein_mass_kg) ?? d.protein_mass_kg,
    mineral: num(r?.bone_mineral_kg) ?? d.bone_mineral_kg,
    fat: num(r?.fat_mass_kg) ?? d.fat_mass_kg,
  }

  if (!weight || Object.values(mass).every((v) => v == null)) {
    return (
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
        <h3 className="font-heading font-semibold text-fluid-sm text-text">Body Composition</h3>
        <p className="text-[11px] text-muted mt-1">Log weight + body-fat / muscle % in the InBody card to map your composition.</p>
      </section>
    )
  }

  const pct = (m?: number) => (m != null && weight ? (m / weight) * 100 : 0)
  // Prefer the skeletal share when it was measured: "78% muscle" is true of lean
  // MASS and reads as a superhuman claim next to a 40–50% norm.
  const skeletalPct = mass.skeletal != null ? pct(mass.skeletal) : null
  const musclePct = num(r?.muscle_percent) ?? pct(mass.muscle)
  const bodyFatPct = num(r?.body_fat_pct) ?? pct(mass.fat)
  // Bottom-up strata: water, protein, mineral, fat, then neutral residual.
  const H = 210
  const strata = [
    { color: WATER, f: pct(mass.water) / 100 },
    { color: PROTEIN, f: pct(mass.protein) / 100 },
    { color: MINERAL, f: pct(mass.mineral) / 100 },
    { color: FAT, f: pct(mass.fat) / 100 },
  ]
  let acc = 0
  const bands = strata.map((s) => {
    const h = Math.max(0, Math.min(1, s.f)) * H
    const y = H - acc - h
    acc += h
    return { ...s, y, h }
  })

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 space-y-3" style={{ borderColor: `${MUSCLE}26` }}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading font-semibold text-fluid-sm text-text">Body Composition</h3>
        <div className="flex items-baseline gap-2.5 helix-num text-[11px]">
          <span style={{ color: MUSCLE }}>
            {(skeletalPct ?? musclePct).toFixed(1)}%
            <span className="text-muted text-[9px]">{skeletalPct != null ? ' skeletal' : ' lean mass'}</span>
          </span>
          <span style={{ color: FAT }}>{bodyFatPct.toFixed(1)}%<span className="text-muted text-[9px]"> fat</span></span>
          <span className="text-muted">{weight.toFixed(1)} kg</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[112px_1fr] items-center">
        {/* ── Athletic silhouette filled by composition (V-taper: broad shoulders,
              bigger arms + head). A smart scale reports WHOLE-body, not per-limb. ── */}
        <div className="mx-auto" style={{ width: 112 }}>
          <svg viewBox="0 0 100 214" width="112" height="222" role="img" aria-label="Body composition figure">
            <defs>
              <clipPath id={clip}>
                <path d={SILHOUETTE} />
              </clipPath>
            </defs>

            {/* base (residual / unaccounted) + composition strata, clipped to the figure */}
            <g clipPath={`url(#${clip})`}>
              <rect x="0" y="0" width="100" height={H + 4} fill="rgba(255,255,255,0.04)" />
              {bands.map((b, i) => (
                <rect key={i} x="0" y={b.y} width="100" height={b.h + 0.5} fill={b.color} fillOpacity="0.62" />
              ))}
              {/* muscle contours — read the figure as an anatomical model */}
              <g fill="none" stroke={MUSCLE} strokeOpacity="0.22" strokeWidth="1" strokeLinecap="round">
                {CONTOURS.map((d, i) => <path key={i} d={d} />)}
              </g>
            </g>

            {/* silhouette outline glow (muscle rose) */}
            <path d={SILHOUETTE} fill="none" stroke={MUSCLE} strokeOpacity="0.6" strokeWidth="1.5"
              strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 5px ${MUSCLE}55)` }} />
          </svg>
        </div>

        {/* ── InBody-printout bars vs normal bands ── */}
        <div className="space-y-2">
          {BARS.map((b) => {
            const m = mass[b.key as keyof typeof mass]
            // Skeletal muscle is the one row with nothing to fall back on, so it
            // is omitted entirely rather than drawn as a dash.
            if (b.key === 'skeletal' && m == null) return null
            const p = pct(m)
            const scaleMax = 90 // % of weight — full bar width
            const clampPct = (x: number) => `${Math.max(0, Math.min(100, (x / scaleMax) * 100))}%`
            return (
              <div key={b.key}>
                <div className="flex items-baseline justify-between text-[10px]">
                  <span className="text-muted">{b.label}</span>
                  <span className="helix-num text-text">
                    {m != null ? <>{m.toFixed(1)}<span className="text-muted"> kg · {p.toFixed(0)}%</span></> : '—'}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-white/[0.05] overflow-hidden mt-0.5">
                  {/* normal-range band */}
                  <span className="absolute inset-y-0 rounded-full"
                    style={{ left: clampPct(b.lo), width: `calc(${clampPct(b.hi)} - ${clampPct(b.lo)})`, background: 'rgba(255,255,255,0.10)' }} aria-hidden="true" />
                  {/* value fill */}
                  {m != null && (
                    <span className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: clampPct(p), background: b.color, boxShadow: `0 0 8px ${b.color}66` }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
