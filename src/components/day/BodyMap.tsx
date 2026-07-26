'use client'

import { useId } from 'react'
import { deriveBodyComp } from '@/lib/body/composition'
import type { DayVaultData } from '@/lib/hooks/useDayVault'

const SAPPHIRE = '#3D7AB8'  // water
const EMERALD = '#3E9E7A'   // protein
const PLATINUM = '#8E9AAC'  // mineral
const GOLD = '#D4AF37'      // fat
const EMBER = '#E0703C'     // muscle accent

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

/** Standard BIA reference bands (% of body weight) — light guidance, not a diagnosis. */
const BARS = [
  { key: 'muscle', label: 'Skeletal Muscle', color: EMBER,   lo: 40, hi: 50 },
  { key: 'water',  label: 'Body Water',      color: SAPPHIRE, lo: 50, hi: 65 },
  { key: 'protein',label: 'Protein',         color: EMERALD, lo: 16, hi: 20 },
  { key: 'mineral',label: 'Mineral',         color: PLATINUM, lo: 3.5, hi: 6 },
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
  // Bottom-up strata: water, protein, mineral, fat, then neutral residual.
  const H = 210
  const strata = [
    { color: SAPPHIRE, f: pct(mass.water) / 100 },
    { color: EMERALD, f: pct(mass.protein) / 100 },
    { color: PLATINUM, f: pct(mass.mineral) / 100 },
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
    <section className="helix-card space-y-3" style={{ borderColor: `${EMBER}26` }}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-heading font-semibold text-fluid-sm text-text">Body Composition</h3>
        <span className="helix-num text-fluid-xs text-muted">{weight.toFixed(1)} kg</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-[104px_1fr] items-center">
        {/* ── Silhouette filled by composition ── */}
        <div className="mx-auto" style={{ width: 104 }}>
          <svg viewBox="0 0 100 214" width="104" height="222" role="img" aria-label="Body composition figure">
            <defs>
              <clipPath id={clip}>
                <circle cx="50" cy="22" r="15" />
                <rect x="34" y="40" width="32" height="72" rx="14" />
                <rect x="19" y="44" width="12" height="62" rx="6" />
                <rect x="69" y="44" width="12" height="62" rx="6" />
                <rect x="36" y="106" width="13" height="98" rx="6" />
                <rect x="51" y="106" width="13" height="98" rx="6" />
              </clipPath>
            </defs>

            {/* base (residual / unaccounted) */}
            <g clipPath={`url(#${clip})`}>
              <rect x="0" y="0" width="100" height={H + 4} fill="rgba(255,255,255,0.04)" />
              {bands.map((b, i) => (
                <rect key={i} x="0" y={b.y} width="100" height={b.h + 0.5} fill={b.color} fillOpacity="0.62" />
              ))}
            </g>

            {/* silhouette outline glow */}
            <g fill="none" stroke={EMBER} strokeOpacity="0.5" strokeWidth="1.2"
               style={{ filter: `drop-shadow(0 0 5px ${EMBER}55)` }}>
              <circle cx="50" cy="22" r="15" />
              <rect x="34" y="40" width="32" height="72" rx="14" />
              <rect x="19" y="44" width="12" height="62" rx="6" />
              <rect x="69" y="44" width="12" height="62" rx="6" />
              <rect x="36" y="106" width="13" height="98" rx="6" />
              <rect x="51" y="106" width="13" height="98" rx="6" />
            </g>
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
