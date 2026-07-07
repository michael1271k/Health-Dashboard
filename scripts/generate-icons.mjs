/**
 * Rasterize the premium 3D-glass "A" monogram to static PNGs so iOS uses the real
 * icon on the Home Screen (dynamic ImageResponse routes render flat + cache badly).
 *   node scripts/generate-icons.mjs
 */
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// HELIX v2 — the double strand suspended inside a bioluminescent liquid-glass orb.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="32%" r="95%">
      <stop offset="0%" stop-color="#081722"/><stop offset="58%" stop-color="#04070f"/><stop offset="100%" stop-color="#020409"/>
    </radialGradient>
    <radialGradient id="orb" cx="38%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#123b46" stop-opacity="0.95"/>
      <stop offset="55%" stop-color="#071522" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#03080f" stop-opacity="0.98"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="55%" stop-color="#16F5C3" stop-opacity="0"/>
      <stop offset="82%" stop-color="#16F5C3" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#3EE0FF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sa" x1="200" y1="380" x2="235" y2="130" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#16F5C3"/><stop offset="100%" stop-color="#5BFF9D"/>
    </linearGradient>
    <linearGradient id="sb" x1="277" y1="130" x2="312" y2="380" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3EE0FF"/><stop offset="100%" stop-color="#8B7CFF"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <!-- Volumetric halo behind the orb -->
  <circle cx="256" cy="256" r="235" fill="url(#halo)"/>
  <!-- Liquid-glass orb -->
  <circle cx="256" cy="256" r="182" fill="url(#orb)" stroke="rgba(150,235,255,0.28)" stroke-width="3"/>
  <!-- Helix suspended inside -->
  <g filter="url(#glow)" stroke-linecap="round" fill="none">
    <path d="M216 124 C250 196, 182 226, 216 298 C232 334, 232 358, 216 392" stroke="rgba(0,0,0,0.45)" stroke-width="27" transform="translate(7,6)"/>
    <path d="M296 124 C262 196, 330 226, 296 298 C280 334, 280 358, 296 392" stroke="rgba(0,0,0,0.45)" stroke-width="27" transform="translate(7,6)"/>
    <path d="M216 124 C250 196, 182 226, 216 298 C232 334, 232 358, 216 392" stroke="url(#sa)" stroke-width="24"/>
    <path d="M296 124 C262 196, 330 226, 296 298 C280 334, 280 358, 296 392" stroke="url(#sb)" stroke-width="24"/>
    <path d="M231 190 L281 190" stroke="rgba(234,251,255,0.8)" stroke-width="16"/>
    <path d="M205 258 L307 258" stroke="rgba(234,251,255,0.95)" stroke-width="19"/>
    <path d="M231 326 L281 326" stroke="rgba(234,251,255,0.8)" stroke-width="16"/>
    <circle cx="296" cy="128" r="12" fill="#EAFBFF"/>
  </g>
  <!-- Caustic highlight arc on the glass -->
  <path d="M136 158 A160 160 0 0 1 300 92" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="10" stroke-linecap="round" opacity="0.55"/>
  <ellipse cx="196" cy="150" rx="52" ry="26" fill="rgba(255,255,255,0.14)" transform="rotate(-28 196 150)"/>
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
