import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const SRC = 'logo_simple.png';
const OUT = 'apps/web/public';
mkdirSync(OUT, { recursive: true });

const navy = { r: 7, g: 11, b: 20, alpha: 1 };
const mark = () => sharp(SRC).trim();

/** Mark centered on a square transparent canvas with padding (fraction of side). */
async function square(size: number, pad: number, bg?: typeof navy) {
  const inner = Math.round(size * (1 - pad * 2));
  const buf = await mark().resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: buf, gravity: 'center' }])
    .png();
}

await (await square(32, 0.04)).toFile(OUT + '/favicon-32.png');
await (await square(180, 0.14, navy)).toFile(OUT + '/apple-touch-icon.png');
await (await square(192, 0.1)).toFile(OUT + '/icon-192.png');
await (await square(512, 0.1)).toFile(OUT + '/icon-512.png');
await (await square(512, 0.22, navy)).toFile(OUT + '/icon-maskable-512.png');

await mark().resize({ width: 720 }).webp({ quality: 88, alphaQuality: 95 }).toFile(OUT + '/logo-mark.webp');
await mark().resize({ width: 720 }).avif({ quality: 60 }).toFile(OUT + '/logo-mark.avif');
await mark().resize({ width: 96 }).png().toFile(OUT + '/logo-mark-96.png');

// Open Graph card: mark on navy with a soft brand glow (no text; the wordmark is set in type on the site).
const glow = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><radialGradient id="g" cx="50%" cy="50%" r="55%">' +
    '<stop offset="0" stop-color="#2c95c8" stop-opacity=".45"/><stop offset=".6" stop-color="#7c5cf0" stop-opacity=".18"/><stop offset="1" stop-color="#070b14" stop-opacity="0"/>' +
    '</radialGradient></defs><rect width="1200" height="630" fill="#070b14"/><rect width="1200" height="630" fill="url(#g)"/></svg>',
);
const big = await mark().resize({ height: 400 }).png().toBuffer();
await sharp(glow).composite([{ input: big, gravity: 'center' }]).png().toFile(OUT + '/og.png');
console.log('brand assets written to ' + OUT);
