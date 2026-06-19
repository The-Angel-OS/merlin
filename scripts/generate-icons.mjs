/**
 * Generate Merlin's web + PWA icons from resources/source-crest.png.
 *
 *   node scripts/generate-icons.mjs
 *
 * Emits:
 *   public/icon-192.png, public/icon-512.png        — manifest "any" (transparent)
 *   public/icon-maskable-512.png                     — manifest "maskable" (crest on
 *                                                      brand bg, 80% safe zone)
 *   src/app/icon.png                                 — Next favicon (auto <link>)
 *   src/app/apple-icon.png                           — apple-touch-icon (opaque bg)
 *
 * Reproducible: re-run after swapping the source crest. Brand bg matches the
 * PWA manifest theme/background (#0a0a14).
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, 'resources/source-crest.png')
const BG = { r: 0x0a, g: 0x0a, b: 0x14, alpha: 1 }
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

const out = (p) => resolve(ROOT, p)
const ensure = (p) => mkdir(dirname(p), { recursive: true })

/** Square icon, crest scaled to fill, optional opaque/transparent background. */
async function icon(size, dest, { bg = TRANSPARENT, scale = 1 } = {}) {
  const inner = Math.round(size * scale)
  const crest = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer()
  const pad = Math.round((size - inner) / 2)
  await ensure(out(dest))
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: crest, top: pad, left: pad }])
    .png()
    .toFile(out(dest))
  console.log(`  ${dest} (${size}x${size})`)
}

console.log('Merlin icons from', SRC)
await icon(192, 'public/icon-192.png')
await icon(512, 'public/icon-512.png')
await icon(512, 'public/icon-maskable-512.png', { bg: BG, scale: 0.8 })
await icon(512, 'src/app/icon.png')
await icon(180, 'src/app/apple-icon.png', { bg: BG })
console.log('done.')
