'use client'

import { useId } from 'react'
import { deriveBodyComp } from '@/lib/body/composition'
import type { DayVaultData } from '@/lib/hooks/useDayVault'

// Composition colour code (per the physiology): water = blue, muscle = red/pink,
// bone/mineral = white, fat = yellow. Protein keeps a green accent.
const SAPPHIRE = '#3D7AB8'  // water = blue
const ROSE = '#E0567A'      // muscle = red/pink
const BONE = '#E6EAF0'      // bone/mineral = white
const GOLD = '#D4AF37'      // fat = yellow
const EMERALD = '#3E9E7A'   // protein = green

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

// A connected, athletic male silhouette (viewBox 0 0 100 214). Points trace the
// RIGHT half head-top → clockwise down the arm/torso/outer leg → up the inner leg
// to the crotch apex; the left half is the mirror, reversed, so the whole figure is
// ONE closed path — head joined to neck, arms flaring off the torso, legs split by a
// real gap (no stick-figure limbs).
const RIGHT: [number, number][] = [
  [50, 4], [58, 5], [64, 11], [65, 19], [63, 27], [58, 32], [55, 35], [55, 40],
  [63, 40], [74, 44], [83, 52], [86, 59], [87, 74], [84, 92], [81, 108], [79, 114],
  [75, 113], [72, 97], [69, 79], [67, 63], [64, 57], [66, 73], [63, 91], [58, 106],
  [56, 110], [61, 114], [63, 120], [62, 127], [60, 152], [58, 180], [56, 204],
  [54, 209], [52, 206], [51, 180], [50.5, 150], [50, 124], [50, 116],
]
const SILHOUETTE = (() => {
  const fmt = ([x, y]: [number, number]) => `${x} ${y}`
  const right = RIGHT.map(fmt)
  const left = [...RIGHT].reverse().map(([x, y]) => fmt([100 - x, y]))
  return `M ${right[0]} ${right.slice(1).map((p) => `L ${p}`).join(' ')} ${left.map((p) => `L ${p}`).join(' ')} Z`
})()

// Low-opacity muscle contours (pecs, sternum + ab ticks, delt caps) layered inside
// the silhouette to read as a real anatomical model rather than a flat cut-out.
const CONTOURS = [
  'M 34 50 Q 43 63 50 59', 'M 66 50 Q 57 63 50 59', // pecs
  'M 50 58 L 50 104',                                 // sternum → linea alba
  'M 44 72 L 56 72', 'M 44 83 L 56 83', 'M 44 94 L 56 94', // ab ticks
  'M 18 53 Q 25 46 32 51', 'M 82 53 Q 75 46 68 51', // deltoid caps
]

/** Standard BIA reference bands (% of body weight) — light guidance, not a diagnosis. */
const BARS = [
  { key: 'muscle', label: 'Skeletal Muscle', color: ROSE,     lo: 40, hi: 50 },
  { key: 'water',  label: 'Body Water',      color: SAPPHIRE, lo: 50, hi: 65 },
  { key: 'protein',label: 'Protein',         color: EMERALD,  lo: 16, hi: 20 },
  { key: 'mineral',label: 'Bone Mineral',    color: BONE,     lo: 3.5, hi: 6 },
  { key: 'fat',    label: 'Body Fat',        color: GOLD,     lo: 10, hi: 20 },
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
    muscle: num(r?.muscle_mass_kg) ?? d.muscle_mass_kg,
    water: num(r?.water_mass_kg) ?? d.water_mass_kg,
    protein: num(r?.protein_mass_kg) ?? d.protein_mass_kg,
    mineral: num(r?.bone_mineral_kg) ?? d.bone_mineral_kg,
    fat: num(r?.fat_mass_kg) ?? d.fat_mass_kg,
  }

  if (!weight || Object.values(mass).every((v) => v == null)) {
    return (
      <section className="helix-card">
        <h3 className="font-heading font-semibold text-fluid-sm text-text">Body Composition</h3>
        <p className="text-[11px] text-muted mt-1">Log weight + body-fat / muscle % in the InBody card to map your composition.</p>
      </section>
    )
  }

  const pct = (m?: number) => (m != null && weight ? (m / weight) * 100 : 0)
  const musclePct = num(r?.muscle_percent) ?? pct(mass.muscle)
  const bodyFatPct = num(r?.body_fat_pct) ?? pct(mass.fat)
  // Bottom-up strata: water, protein, mineral, fat, then neutral residual.
  const H = 210
  const strata = [
    { color: SAPPHIRE, f: pct(mass.water) / 100 },
    { color: EMERALD, f: pct(mass.protein) / 100 },
    { color: BONE, f: pct(mass.mineral) / 100 },
    { color: GOLD, f: pct(mass.fat) / 100 },
  ]
  let acc = 0
  const bands = strata.map((s) => {
    const h = Math.max(0, Math.min(1, s.f)) * H
    const y = H - acc - h
    acc += h
    return { ...s, y, h }
  })

  return (
    <section className="helix-card space-y-3" style={{ borderColor: `${ROSE}26` }}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading font-semibold text-fluid-sm text-text">Body Composition</h3>
        <div className="flex items-baseline gap-2.5 helix-num text-[11px]">
          <span style={{ color: ROSE }}>{musclePct.toFixed(1)}%<span className="text-muted text-[9px]"> muscle</span></span>
          <span style={{ color: GOLD }}>{bodyFatPct.toFixed(1)}%<span className="text-muted text-[9px]"> fat</span></span>
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
              <g fill="none" stroke={ROSE} strokeOpacity="0.22" strokeWidth="1" strokeLinecap="round">
                {CONTOURS.map((d, i) => <path key={i} d={d} />)}
              </g>
            </g>

            {/* silhouette outline glow (muscle rose) */}
            <path d={SILHOUETTE} fill="none" stroke={ROSE} strokeOpacity="0.6" strokeWidth="1.5"
              strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 5px ${ROSE}55)` }} />
          </svg>
        </div>

        {/* ── InBody-printout bars vs normal bands ── */}
        <div className="space-y-2">
          {BARS.map((b) => {
            const m = mass[b.key as keyof typeof mass]
            const p = pct(m)
            const scaleMax = 70 // % of weight — full bar width
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
