// Builds the Gravity logo ("Infall": one tapered line spiralling into a heavy mass) and every icon from it.
//   apps/web/public/logo-mark.svg       colour mark (used in the app and as the favicon)
//   apps/web/public/logo-mark-mono.svg  one-colour mark in currentColor (print, stamps, single-ink use)
//   apps/web/public/*.png               favicon, home-screen and share images
// Run: node scripts/brand-icons.cjs
const fs = require('fs');
const sharp = require('sharp');

const f = (v) => v.toFixed(1);
const smooth = (t) => t * t * (3 - 2 * t);

// A line of varying width, drawn as a filled outline so it renders identically everywhere.
function ribbon(pts, ws) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const n = Math.hypot(tx, ty) || 1;
    tx /= n; ty /= n;
    const w = ws[i] / 2;
    L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]);
    R.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
  }
  return 'M' + [...L, ...R.reverse()].map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
}

// The spiral: starts as a soft, lopsided diamond and tightens as it slides toward the off-centre mass.
const M = [292, 282], ORB = 66;
function spiral() {
  const N = 700, turns = 2.4, pts = [], ws = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1); // 0 = outer tip, 1 = at the mass
    const th = -Math.PI / 2 - u * turns * 2 * Math.PI;
    const r = 98 + 124 * Math.pow(1 - u, 1.35); // loops bunch up near the mass
    const k = Math.pow(1 - u, 1.2);
    const lob = 1 + 0.13 * k * Math.cos(4 * th) + 0.05 * k * Math.cos(3 * th + 1);
    const c = [256 + (M[0] - 256) * smooth(u), 256 + (M[1] - 256) * smooth(u)];
    pts.push([c[0] + r * lob * Math.cos(th), c[1] + r * lob * 0.96 * Math.sin(th)]);
    // Heavy outside, thinning inward but never below a weight that survives one-colour and small sizes.
    const w = 8 + 16 * Math.pow(1 - u, 0.9);
    ws.push(w * smooth(Math.min(1, u / 0.06)) * (u > 0.95 ? 0.35 + 0.65 * smooth((1 - u) / 0.05) : 1));
  }
  return ribbon(pts, ws);
}
const D = spiral();

const colour = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>Gravity</title><defs>
<linearGradient id="g" x1="60" y1="40" x2="452" y2="472" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5ee3f8"/><stop offset=".5" stop-color="#5b80f4"/><stop offset="1" stop-color="#b06ff6"/></linearGradient>
<radialGradient id="ball" cx="${M[0]}" cy="${M[1]}" r="${ORB * 1.08}" fx="${M[0] - ORB * 0.38}" fy="${M[1] - ORB * 0.42}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f1e7ff"/><stop offset=".42" stop-color="#ab7ff8"/><stop offset="1" stop-color="#4f2bb8"/></radialGradient>
<radialGradient id="glow" cx="${M[0]}" cy="${M[1]}" r="${ORB * 1.6}" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="#9b6cf0" stop-opacity=".4"/><stop offset="1" stop-color="#9b6cf0" stop-opacity="0"/></radialGradient>
</defs><path fill="url(#g)" d="${D}"/><circle cx="${M[0]}" cy="${M[1]}" r="${ORB * 1.6}" fill="url(#glow)"/><circle cx="${M[0]}" cy="${M[1]}" r="${ORB}" fill="url(#ball)"/></svg>
`;
const mono = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><title>Gravity</title><path d="${D}"/><circle cx="${M[0]}" cy="${M[1]}" r="${ORB}"/></svg>
`;

const P = 'apps/web/public/';
fs.writeFileSync(P + 'logo-mark.svg', colour);
fs.writeFileSync(P + 'logo-mark-mono.svg', mono);

// ---- PNG icons rendered from the colour SVG ----
const BG = '#070a14';
const mark = (px) => sharp(Buffer.from(colour), { density: Math.ceil((px / 512) * 72 * 2) }).resize(px, px).png().toBuffer();
const onBg = async (w, h, px, bg) => sharp(bg ?? { create: { width: w, height: h, channels: 4, background: BG } })
  .composite([{ input: await mark(px), gravity: 'centre' }]).png();
const glow = (w, h) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="g" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#1e2350"/><stop offset=".6" stop-color="#14183a"/><stop offset="1" stop-color="${BG}"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
(async () => {
  await sharp(await mark(32)).toFile(P + 'favicon-32.png');
  await (await onBg(180, 180, 150)).toFile(P + 'apple-touch-icon.png');
  await (await onBg(192, 192, 168)).toFile(P + 'icon-192.png');
  await (await onBg(512, 512, 448)).toFile(P + 'icon-512.png');
  await (await onBg(512, 512, 320)).toFile(P + 'icon-maskable-512.png'); // inside the 80% safe zone
  await (await onBg(1200, 630, 440, glow(1200, 630))).toFile(P + 'og.png');
  console.log('logo and icons written');
})();
