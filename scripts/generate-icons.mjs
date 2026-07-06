/**
 * Rasterize the premium 3D-glass "A" monogram to static PNGs so iOS uses the real
 * icon on the Home Screen (dynamic ImageResponse routes render flat + cache badly).
 *   node scripts/generate-icons.mjs
 */
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// HELIX — two interleaved neon strands forming an "H" with base-pair rungs.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="35%" cy="28%" r="85%">
      <stop offset="0%" stop-color="#0c2a3a"/><stop offset="62%" stop-color="#070a15"/><stop offset="100%" stop-color="#04060d"/>
    </radialGradient>
    <linearGradient id="sa" x1="170" y1="450" x2="220" y2="60" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#19E3B1"/><stop offset="100%" stop-color="#5BFF9D"/>
    </linearGradient>
    <linearGradient id="sb" x1="300" y1="60" x2="350" y2="450" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38E1FF"/><stop offset="100%" stop-color="#4F9DFF"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <g filter="url(#glow)" stroke-linecap="round" fill="none">
    <path d="M186 78 C230 176, 142 218, 186 316 C208 366, 208 400, 186 446" stroke="rgba(0,0,0,0.42)" stroke-width="34" transform="translate(10,8)"/>
    <path d="M326 78 C282 176, 370 218, 326 316 C304 366, 304 400, 326 446" stroke="rgba(0,0,0,0.42)" stroke-width="34" transform="translate(10,8)"/>
    <path d="M186 78 C230 176, 142 218, 186 316 C208 366, 208 400, 186 446" stroke="url(#sa)" stroke-width="30"/>
    <path d="M326 78 C282 176, 370 218, 326 316 C304 366, 304 400, 326 446" stroke="url(#sb)" stroke-width="30"/>
    <path d="M206 166 L306 166" stroke="rgba(234,251,255,0.78)" stroke-width="20"/>
    <path d="M172 262 L340 262" stroke="rgba(234,251,255,0.95)" stroke-width="24"/>
    <path d="M206 358 L306 358" stroke="rgba(234,251,255,0.78)" stroke-width="20"/>
    <circle cx="326" cy="84" r="15" fill="#EAFBFF"/>
  </g>
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
