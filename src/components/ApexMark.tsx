/**
 * ApexMark — custom SVG logo
 * A minimalist summit "A": two ascending strokes forming a peak,
 * rendered in --color-primary (vibrant blue #3D7DFF).
 */
export function ApexMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Left stroke: bottom-left → peak */}
      <path
        d="M3 20 L12 4"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      {/* Right stroke: peak → bottom-right */}
      <path
        d="M12 4 L21 20"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      {/* Cross-bar at mid-height */}
      <path
        d="M7 13 L17 13"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  )
}
