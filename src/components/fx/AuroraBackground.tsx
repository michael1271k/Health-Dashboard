'use client'

/**
 * ObsidianBackground — the global backdrop. Deep graphite with a SINGLE molten
 * ember bloom, so the glass panels refract warm depth against a serious, matte
 * base. Deliberately static: the old version drifted three saturated
 * green/blue/magenta blobs, which read as toy-like AND cost a permanent
 * compositor layer on iOS. Discipline here means restraint — one accent, one
 * light source, everything else graphite.
 *
 * Plain CSS radial-gradients painted on a fixed container render on EVERY engine
 * (including iOS WKWebView, which silently drops `filter: blur()` on huge
 * elements past its texture budget — that was the "gradient doesn't show on the
 * physical iPhone" bug). No blur, no animation, no hue rotation.
 */
export function AuroraBackground() {
  // One warm light source (upper-right) + a cool graphite counter-fill (lower-
  // left) + a floor shadow. Alphas are intentionally low: this is atmosphere,
  // not decoration.
  const EMBER = '#E2683A'
  const STEEL = '#7F8B9C'

  const backdrop = [
    // primary ember bloom — the single light source
    `radial-gradient(78vw 62vh at 88% -6%, ${EMBER}26 0%, ${EMBER}0d 34%, transparent 66%)`,
    // cool graphite counter-fill for depth on the opposite corner
    `radial-gradient(70vw 58vh at 6% 92%, ${STEEL}14 0%, ${STEEL}08 38%, transparent 68%)`,
    // faint warm rim high on the horizon so the top edge isn't dead flat
    `radial-gradient(120vw 40vh at 50% -12%, ${EMBER}14 0%, transparent 60%)`,
    // deep floor — sinks the bottom of the page into obsidian
    `radial-gradient(100vw 70vh at 50% 118%, rgba(5,6,8,0.6) 0%, transparent 62%)`,
  ].join(', ')

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ backgroundColor: 'var(--color-bg)', backgroundImage: backdrop }}
      >
        {/* Vignette — pulls focus to the centre column of content. */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 115% 85% at 50% 8%, transparent 42%, rgba(0,0,0,0.60) 100%)' }}
        />
      </div>
      <div className="axis-wireframe" aria-hidden="true" />
      <div className="grain-overlay" aria-hidden="true" />
    </>
  )
}
