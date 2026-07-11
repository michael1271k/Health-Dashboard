/**
 * Rasterize the HELIX icon to static PNGs so iOS uses the real icon on the
 * Home Screen (dynamic ImageResponse routes render flat + cache badly).
 *   node scripts/generate-icons.mjs
 */
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// HELIX v3 — "Obsidian Strand" (Phase 16). A free-floating double helix, NO orb:
// dark liquid-metal strands with neon rim-light (teal left / cyan right), violet
// base-pair rungs fading with depth, one specular caustic, bottom vignette.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="30%" r="100%">
      <stop offset="0%" stop-color="#071019"/><stop offset="60%" stop-color="#030509"/><stop offset="100%" stop-color="#010204"/>
    </radialGradient>
    <!-- Neon strand gradients (the rim); a dark core stroke overlays the center -->
    <linearGradient id="neonA" x1="186" y1="88" x2="326" y2="424" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#16F5C3"/><stop offset="100%" stop-color="#5BFF9D"/>
    </linearGradient>
    <linearGradient id="neonB" x1="326" y1="88" x2="186" y2="424" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3EE0FF"/><stop offset="100%" stop-color="#8B7CFF"/>
    </linearGradient>
    <linearGradient id="rung" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8B7CFF" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#8B7CFF" stop-opacity="0.55"/>
    </linearGradient>
    <radialGradient id="floor" cx="50%" cy="88%" r="45%">
      <stop offset="0%" stop-color="#16F5C3" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#16F5C3" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <!-- Grounding pool so the strand "stands" in the frame -->
  <ellipse cx="256" cy="448" rx="150" ry="30" fill="url(#floor)"/>

  <!-- True antiphase helix: A left→right→left, B right→left→right,
       crossing at y≈190 and y≈322. Rungs live in the open eyes. -->

  <!-- Depth shadows -->
  <g stroke-linecap="round" fill="none" opacity="0.5" filter="url(#soft)">
    <path d="M186 88 C186 150, 326 192, 326 256 C326 320, 186 362, 186 424" stroke="#000" stroke-width="40" transform="translate(9,8)"/>
    <path d="M326 88 C326 150, 186 192, 186 256 C186 320, 326 362, 326 424" stroke="#000" stroke-width="40" transform="translate(9,8)"/>
  </g>

  <!-- Base-pair rungs in the three open eyes: violet neon with a hot core -->
  <g stroke-linecap="round">
    <g filter="url(#glow)" stroke="#8B7CFF">
      <path d="M212 122 L300 122" stroke-width="16"/>
      <path d="M204 256 L308 256" stroke-width="19"/>
      <path d="M212 390 L300 390" stroke-width="16"/>
    </g>
    <path d="M212 122 L300 122" stroke="#D9D2FF" stroke-width="6" opacity="0.9"/>
    <path d="M204 256 L308 256" stroke="#D9D2FF" stroke-width="7" opacity="0.95"/>
    <path d="M212 390 L300 390" stroke="#D9D2FF" stroke-width="6" opacity="0.9"/>
  </g>

  <!-- Strand B (back at first crossing): neon rim + dark obsidian core -->
  <g fill="none" stroke-linecap="round">
    <path d="M326 88 C326 150, 186 192, 186 256 C186 320, 326 362, 326 424" stroke="url(#neonB)" stroke-width="36" filter="url(#glow)"/>
    <path d="M326 88 C326 150, 186 192, 186 256 C186 320, 326 362, 326 424" stroke="#0a1420" stroke-width="20" opacity="0.92"/>
  </g>
  <!-- Strand A (front) -->
  <g fill="none" stroke-linecap="round">
    <path d="M186 88 C186 150, 326 192, 326 256 C326 320, 186 362, 186 424" stroke="url(#neonA)" stroke-width="36" filter="url(#glow)"/>
    <path d="M186 88 C186 150, 326 192, 326 256 C326 320, 186 362, 186 424" stroke="#0a1a17" stroke-width="20" opacity="0.92"/>
  </g>
  <!-- Alternate the weave: B passes OVER A at the second crossing. The patch is
       the exact de Casteljau sub-segment (t 0.25–0.75) of B's lower bezier, so
       it overlays B's own tube invisibly and only changes the stacking order. -->
  <g fill="none" stroke-linecap="round">
    <path d="M207.9 300.5 C234.1 328.3, 277.9 353.3, 304.2 380.6" stroke="url(#neonB)" stroke-width="36"/>
    <path d="M207.9 300.5 C234.1 328.3, 277.9 353.3, 304.2 380.6" stroke="#0a1420" stroke-width="20" opacity="0.92"/>
  </g>

  <!-- Specular caustic on the front strand crest -->
  <ellipse cx="189" cy="122" rx="20" ry="7" fill="rgba(255,255,255,0.75)" transform="rotate(84 189 122)" filter="url(#soft)"/>
</svg>`

function render(size, file) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(resolve('public', file), png)
  console.log('  ✓', file.padEnd(24), size + 'px')
}

render(180, 'apple-touch-icon.png')
render(192, 'icon-192.png')
render(512, 'icon-512.png')
render(32, 'favicon-32.png')
console.log('✓ icons generated')
