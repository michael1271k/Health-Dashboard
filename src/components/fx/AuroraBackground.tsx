'use client'

import { EMBER, SAPPHIRE, EMERALD, GOLD } from '@/lib/theme/palette'

/**
 * ObsidianMesh — the global backdrop. A slow LIVING gradient mesh in jewel tones
 * over obsidian: a molten-ember light source, a deep-sapphire counter-pole, and
 * whispers of emerald and antique gold. Each layer breathes on its own long
 * cycle (34–58s) and slightly out of phase, so the wash never repeats visibly
 * and the glass panels pick up shifting warm/cool refraction instead of a flat
 * tint.
 *
 * Only `opacity` animates — no blur, no transform, no hue rotation — so the
 * whole thing stays on one cheap compositor layer. Alphas are deliberately low:
 * this is atmosphere behind glass, not decoration competing with content.
 * Reduce-motion and the hidden-tab guard both freeze it (see globals.css).
 */
export function AuroraBackground() {
  const layers = [
    // molten ember — the primary light source, upper right
    { c: EMBER, pos: '88% -6%', size: '78vw 62vh', a: '2e', a2: '10', anim: 'meshBreatheA 34s' },
    // deep sapphire — the cool counter-pole, lower left
    { c: SAPPHIRE, pos: '4% 88%', size: '76vw 64vh', a: '2b', a2: '0e', anim: 'meshBreatheB 46s' },
    // muted emerald — a low mid-right whisper that keeps the middle alive
    { c: EMERALD, pos: '96% 62%', size: '58vw 52vh', a: '1c', a2: '08', anim: 'meshBreatheC 58s' },
    // antique gold — a faint high rim so the top edge is never dead flat
    { c: GOLD, pos: '38% -14%', size: '92vw 38vh', a: '14', a2: '06', anim: 'meshBreatheD 41s' },
  ]

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 -z-10 pointer-events-none" style={{ backgroundColor: 'var(--color-bg)' }}>
        {layers.map((l) => (
          <div
            key={l.c + l.pos}
            className="mesh-layer absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(${l.size} at ${l.pos}, ${l.c}${l.a} 0%, ${l.c}${l.a2} 38%, transparent 68%)`,
              animation: `${l.anim} ease-in-out infinite`,
            }}
          />
        ))}
        {/* Deep floor + vignette — sinks the page edges into obsidian and pulls
            focus to the centre column. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(100vw 70vh at 50% 118%, rgba(5,6,8,0.62) 0%, transparent 62%),' +
              'radial-gradient(ellipse 115% 85% at 50% 8%, transparent 42%, rgba(0,0,0,0.58) 100%)',
          }}
        />
      </div>
      <div className="axis-wireframe" aria-hidden="true" />
      <div className="grain-overlay" aria-hidden="true" />
    </>
  )
}
