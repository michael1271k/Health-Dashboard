/**
 * Rasterize the premium 3D-glass "A" monogram to static PNGs so iOS uses the real
 * icon on the Home Screen (dynamic ImageResponse routes render flat + cache badly).
 *   node scripts/generate-icons.mjs
 */
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="35%" cy="28%" r="85%">
      <stop offset="0%" stop-color="#103237"/><stop offset="62%" stop-color="#070a15"/><stop offset="100%" stop-color="#04060d"/>
    </radialGradient>
    <linearGradient id="stroke" x1="110" y1="450" x2="410" y2="90" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#19E3B1"/><stop offset="55%" stop-color="#38E1FF"/><stop offset="100%" stop-color="#5BFF9D"/>
    </linearGradient>
    <linearGradient id="lf" x1="110" y1="446" x2="256" y2="86" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38E1FF" stop-opacity="0.12"/><stop offset="100%" stop-color="#EAFBFF" stop-opacity="0.34"/>
    </linearGradient>
    <linearGradient id="rf" x1="256" y1="86" x2="402" y2="446" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#19E3B1" stop-opacity="0.18"/><stop offset="100%" stop-color="#0A1A22" stop-opacity="0.32"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <g filter="url(#glow)" stroke-linejoin="round" stroke-linecap="round">
    <polygon points="270,100 122,452 418,452" fill="rgba(0,0,0,0.40)"/>
    <polygon points="256,86 112,446 256,446" fill="url(#lf)"/>
    <polygon points="256,86 400,446 256,446" fill="url(#rf)"/>
    <path d="M112 446 L256 86 L400 446" fill="none" stroke="url(#stroke)" stroke-width="30"/>
    <path d="M182 300 L330 300" fill="none" stroke="url(#stroke)" stroke-width="26"/>
    <path d="M152 398 L244 152" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="9"/>
    <circle cx="256" cy="96" r="15" fill="#EAFBFF"/>
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
