/**
 * Render every icon HELIX ships from one source image.
 *
 *   npm run icons                 # uses resources/icon.png
 *   node scripts/generate-icons.mjs path/to/other.png
 *
 * WHY THIS REPLACED WHAT WAS HERE
 * The previous version took no input at all: it inlined a ~75-line SVG template
 * and rasterised that. So "changing the app icon" meant editing gradient stops
 * in a shell script, and the icon it drew was still on the neon palette
 * (#16F5C3 / #5BFF9D) the app abandoned. Dropping a new artwork into
 * resources/ did nothing, and running the script would quietly overwrite it.
 *
 * WHAT `npx cap sync ios` DOES NOT DO
 * It does not manage app icons. Capacitor copies `webDir` into the native web
 * bundle; it never reads apple-touch-icon.png and never writes into
 * Assets.xcassets. The icon on the Home Screen comes from AppIcon-512@2x.png
 * inside the appiconset, so this script writes that file directly. Run cap sync
 * AFTER this, not instead of it.
 */
import sharp from 'sharp'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const SOURCE = resolve(process.argv[2] ?? 'resources/icon.png')

/**
 * The flat behind the artwork.
 *
 * Apple REJECTS an app icon with an alpha channel, so transparency has to be
 * composited away rather than carried. Sampled from the source corners.
 */
const MATTE = '#000309'

const WIDGET_ICONS = 'ios/App/HelixWidgets/Assets.xcassets/AppIcon.appiconset'

const TARGETS = [
  // ── Web / PWA ──────────────────────────────────────────────────────────────
  // A 32px favicon from a full-bleed 1024 is a smudge: the ribbon is a thin
  // diagonal and almost all of it falls between pixels. Crop in first so the
  // mark fills the tile, then resize, then re-sharpen what the downsample ate.
  { file: 'public/favicon-32.png', size: 32, crop: 1.3, sharpen: 0.6 },
  { file: 'public/apple-touch-icon.png', size: 180 },
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },

  // ── Native ─────────────────────────────────────────────────────────────────
  // The app and watch appiconsets already declare exactly one universal 1024
  // entry with these filenames, so their Contents.json needs no edit — only the
  // bytes change.
  { file: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', size: 1024 },
  { file: 'ios/App/HelixWatch Watch App/Assets.xcassets/AppIcon.appiconset/AppIcon-watch-1024.png', size: 1024 },

  // ── Widget extension ───────────────────────────────────────────────────────
  // The widget's appiconset declared three 1024 entries — universal, dark and
  // tinted — and gave a filename for NONE of them, so the extension shipped
  // with no icon and rendered as a grey placeholder in the widget gallery. The
  // three appearances are iOS 18's icon set: light, dark, and a tinted variant
  // the OS recolours itself.
  //
  // Light and dark are the same bytes here on purpose. The artwork is already
  // a dark tile on near-black, which is what the dark appearance wants; a
  // separate light rendering would mean artwork that does not exist.
  { file: `${WIDGET_ICONS}/AppIcon-widget-1024.png`, size: 1024 },
  { file: `${WIDGET_ICONS}/AppIcon-widget-dark-1024.png`, size: 1024 },
  // Tinted must be GREYSCALE. iOS maps the luminance of this image through the
  // user's chosen tint, so shipping the colour version makes it muddy — the
  // ember ribbon and the silver one collapse to nearly the same value once a
  // hue is forced over both.
  { file: `${WIDGET_ICONS}/AppIcon-widget-tinted-1024.png`, size: 1024, greyscale: true },
]

/**
 * NO ROUNDED CORNERS, and no circular mask for the watch.
 *
 * iOS and watchOS apply their own superellipse / circle. Baking a radius in
 * (the old SVG had rx="112") shows as a double corner once the OS mask lands on
 * top. And the watch's inscribed circle is ±317px wide where the ribbon spans
 * ±150, so nothing needs insetting to survive the crop.
 */
async function render({ file, size, crop, sharpen, greyscale }) {
  const out = resolve(file)
  mkdirSync(dirname(out), { recursive: true })

  let img = sharp(SOURCE)
  if (crop) {
    const { width } = await img.metadata()
    const side = Math.round(width / crop)
    const off = Math.round((width - side) / 2)
    img = img.extract({ left: off, top: off, width: side, height: side })
  }
  img = img
    .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
    .flatten({ background: MATTE })
    .removeAlpha()
  if (greyscale) img = img.greyscale()
  if (sharpen) img = img.sharpen({ sigma: sharpen })

  await img.png({ compressionLevel: 9, palette: false }).toFile(out)
  return out
}

/**
 * The widget appiconset's three entries, each pointing at the file this script
 * now writes. Regenerated rather than hand-edited so the manifest and the
 * filenames can never drift — that drift is exactly what left it empty.
 */
const WIDGET_CONTENTS = {
  images: [
    { filename: 'AppIcon-widget-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
    {
      appearances: [{ appearance: 'luminosity', value: 'dark' }],
      filename: 'AppIcon-widget-dark-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024',
    },
    {
      appearances: [{ appearance: 'luminosity', value: 'tinted' }],
      filename: 'AppIcon-widget-tinted-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024',
    },
  ],
  info: { author: 'xcode', version: 1 },
}

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(`✗ no source image at ${SOURCE}`)
    console.error('  Put a square PNG of at least 1024×1024 at resources/icon.png,')
    console.error('  or pass one: node scripts/generate-icons.mjs path/to/icon.png')
    process.exit(1)
  }

  const { width, height, format } = await sharp(SOURCE).metadata()
  if (width !== height) {
    console.error(`✗ ${SOURCE} is ${width}×${height}. An app icon must be square.`)
    process.exit(1)
  }
  if (width < 1024) {
    console.error(`✗ ${SOURCE} is ${width}×${width}. iOS needs 1024×1024; upscaling would soften it.`)
    process.exit(1)
  }
  if (format !== 'png') {
    // Not fatal — sharp reads it fine — but a lossy source bakes its artefacts
    // into all six outputs, and around a specular highlight that shows.
    console.warn(`⚠ ${SOURCE} is ${format}, not png. Re-save it losslessly when you can.`)
  }

  for (const t of TARGETS) {
    const out = await render(t)
    const tag = t.greyscale ? ' (greyscale — iOS applies the tint)' : ''
    console.log(`  ${String(t.size).padStart(4)}px  ${out.replace(`${process.cwd()}/`, '')}${tag}`)
  }

  writeFileSync(resolve(WIDGET_ICONS, 'Contents.json'), `${JSON.stringify(WIDGET_CONTENTS, null, 2)}\n`)
  console.log(`        ${WIDGET_ICONS}/Contents.json`)

  console.log('\n✓ icons written. Now run: npx cap sync ios')
}

main().catch((err) => {
  console.error('✗ icon generation failed:', err.message)
  process.exit(1)
})
