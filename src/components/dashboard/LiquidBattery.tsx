'use client'

interface LiquidBatteryProps {
  /** 0–100, or null = awaiting score. */
  value: number | null
  color: string
  caption?: string
  captionColor?: string
  testId?: string
}

/**
 * Daily Battery as a vertical glass capsule with an animated liquid fill that
 * rises to the level, a wobbling neon surface, and a glow. Pure SVG/CSS — no 3D.
 */
export function LiquidBattery({ value, color, caption, captionColor, testId }: LiquidBatteryProps) {
  const hasData = value !== null && value !== undefined
  const pct = hasData ? Math.max(0, Math.min(100, value)) : 0
  const critical = hasData && pct < 25   // low-battery heartbeat state

  return (
    <div className="flex flex-col items-center gap-3">
      <div data-testid={testId} className="relative" style={{ width: 92, height: 168 }}>
        {/* Capsule shell */}
        <div
          className="absolute inset-0 rounded-[2.75rem] overflow-hidden border border-white/15"
          style={{ background: 'rgba(255,255,255,0.03)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 8px rgba(0,0,0,0.3)' }}
        >
          {/* Liquid */}
          <div
            className={`absolute left-0 right-0 bottom-0 transition-[height] duration-700 ease-out ${critical ? 'battery-critical' : ''}`}
            style={{
              height: `${hasData ? pct : 6}%`,
              background: hasData ? `linear-gradient(180deg, ${color}dd, ${color}55)` : 'rgba(120,140,170,0.25)',
              boxShadow: hasData ? `0 0 28px ${color}99` : 'none',
            }}
          >
            {/* Wobbling surface */}
            <div
              className="liquid-wave absolute -top-2 left-[-10%] right-[-10%] h-4 rounded-[50%]"
              style={{ background: hasData ? color : 'rgba(120,140,170,0.4)', opacity: 0.55 }}
            />
            {/* Rising bubbles */}
            {hasData && pct > 10 && (
              <>
                <span className="battery-bubble" style={{ left: '22%', animationDelay: '0s', width: 5, height: 5 }} />
                <span className="battery-bubble" style={{ left: '48%', animationDelay: '1.2s', width: 4, height: 4 }} />
                <span className="battery-bubble" style={{ left: '68%', animationDelay: '2.1s', width: 6, height: 6 }} />
                <span className="battery-bubble" style={{ left: '35%', animationDelay: '3.0s', width: 3, height: 3 }} />
              </>
            )}
          </div>
          {/* Vertical glass sheen + moving specular glint */}
          <div className="absolute inset-y-0 left-2 w-3 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22), transparent)' }} />
          <div className="battery-glint" aria-hidden="true" />
        </div>

        {/* Centered figure */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="vital-number text-fluid-2xl font-bold text-white" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
            {hasData ? pct : '—'}
            {hasData && <span className="text-fluid-base">%</span>}
          </span>
        </div>
      </div>

      {caption && (
        <p className="text-fluid-sm font-medium text-center" style={{ color: captionColor ?? 'var(--color-muted-vital)' }}>{caption}</p>
      )}
    </div>
  )
}
