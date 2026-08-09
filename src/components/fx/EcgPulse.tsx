'use client'

/**
 * ECG pulse line — a neon electrocardiogram sweep under the Daily Score.
 * Beat speed maps to battery level (≥70% fast · ≤30% slow). Pure SVG/CSS.
 */
export function EcgPulse({ level, color = '#3E9E7A' }: { level: number | null; color?: string }) {
  const pct = level ?? 50
  const duration = pct >= 70 ? 1.6 : pct >= 40 ? 2.4 : 3.6 // seconds per beat sweep

  return (
    <svg viewBox="0 0 200 24" className="w-full h-6" preserveAspectRatio="none" aria-hidden="true">
      {/* Faint track */}
      <path d="M0 12 H62 L70 12 74 4 80 20 86 8 90 12 H200" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
      {/* Neon sweep, drawn twice.
          The glow used to be `filter: drop-shadow(...)` on this path — a blur
          re-rasterised on EVERY frame of an infinite stroke-dashoffset
          animation, for as long as the dashboard was open. A second, wider,
          translucent copy carrying the same dash animation puts the halo in
          the same place for the cost of one more stroke, painted, not
          filtered. */}
      <path
        className="ecg-sweep"
        d="M0 12 H62 L70 12 74 4 80 20 86 8 90 12 H200"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeOpacity="0.22"
        strokeLinecap="round"
        style={{ animationDuration: `${duration}s` }}
      />
      <path
        className="ecg-sweep"
        d="M0 12 H62 L70 12 74 4 80 20 86 8 90 12 H200"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        style={{ animationDuration: `${duration}s` }}
      />
    </svg>
  )
}
