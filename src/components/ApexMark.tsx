/**
 * ApexMark — APEX glass summit logo
 *
 * Design: a faceted glass prism summit — two translucent triangular planes
 * meeting at a peak, with a gradient stroke (primary blue → energy violet)
 * and a subtle highlight that simulates a glass edge catching light.
 * Reads as elevation, precision, and refraction — fitting the Glass Command
 * Center aesthetic.
 *
 * The gradient IDs are suffixed with the instance className hash to avoid
 * SVG gradient ID collisions when the logo is rendered at multiple sizes.
 */

let _instanceCounter = 0

export function ApexMark({ className = 'w-6 h-6' }: { className?: string }) {
  // SSR-safe stable ID (incremented once per component tree mount)
  const id = `apexG${++_instanceCounter}`

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <defs>
        {/* Elevation gradient: primary blue at the base, energy violet at the peak */}
        <linearGradient id={`${id}s`} x1="12" y1="22" x2="12" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#3D7DFF" />
          <stop offset="100%" stopColor="#7C5CFF" />
        </linearGradient>
        {/* Highlight gradient for the inner glow at the apex */}
        <linearGradient id={`${id}h`} x1="12" y1="6" x2="12" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.35)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {/* ── Left glass pane (bottom-left → peak region) */}
      <polygon
        points="3,21 12,3 8.5,13.5"
        fill={`url(#${id}s)`}
        fillOpacity="0.12"
      />

      {/* ── Right glass pane (peak region → bottom-right) */}
      <polygon
        points="21,21 12,3 15.5,13.5"
        fill={`url(#${id}s)`}
        fillOpacity="0.07"
      />

      {/* ── Left edge stroke */}
      <path
        d="M3 21 L12 3"
        stroke={`url(#${id}s)`}
        strokeWidth="2"
      />

      {/* ── Right edge stroke */}
      <path
        d="M12 3 L21 21"
        stroke={`url(#${id}s)`}
        strokeWidth="2"
      />

      {/* ── Crossbar */}
      <path
        d="M7.5 14 L16.5 14"
        stroke={`url(#${id}s)`}
        strokeWidth="1.6"
      />

      {/* ── Apex highlight — glass catching light at the peak */}
      <path
        d="M12 3 L10 7.5"
        stroke={`url(#${id}h)`}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
