// Déclinaisons du logo GPDV à partir des deux originaux de docs/brand/.
//   node scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (name) => path.join(root, 'docs', 'brand', name);
const pub = (name) => path.join(root, 'public', name);
const ICON = source('gpdv-icon-source.png');
const BANNER = source('gpdv-banner-source.png');
const CLEAR = { r: 255, g: 255, b: 255, alpha: 0 };

const raw = async (input) => {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};
const gray = (buffer, w, h) => sharp(buffer, { raw: { width: w, height: h, channels: 1 } });

const run = async () => {
  mkdirSync(pub('brand'), { recursive: true });

  // Logo détouré : sans fond, en deux versions (thème clair / sombre) et
  // deux formats (horizontal, vertical pour le téléphone). Sur fond clair, le blanc du
  // logo devient bleu nuit ; l'or ne change pas.
  const INK = [8, 37, 84];
  const cutLogo = async (input, area, qr, skip, isGold = () => false) => {
    const { data: px, w: iw } = await raw(input);
    // Un reflet blanc sur l'or reste de l'or : on regarde la couleur dominante autour.
    const tone = { gold: Buffer.alloc(area.width * area.height), white: Buffer.alloc(area.width * area.height) };
    for (let y = 0; y < area.height; y += 1) for (let x = 0; x < area.width; x += 1) {
      const p = ((y + area.top) * iw + x + area.left) * 3;
      if (px[p] < 110) continue;
      const sat = (px[p] - px[p + 2]) / px[p];
      tone[sat > 0.3 ? 'gold' : 'white'][y * area.width + x] = 255;
    }
    const spread = (buffer) => gray(buffer, area.width, area.height).blur(9).extractChannel(0).raw().toBuffer();
    const [goldNear, whiteNear] = [await spread(tone.gold), await spread(tone.white)];
    const out = { light: Buffer.alloc(area.width * area.height * 4), dark: Buffer.alloc(area.width * area.height * 4) };
    for (let y = 0; y < area.height; y += 1) for (let x = 0; x < area.width; x += 1) {
      const gx = x + area.left;
      const gy = y + area.top;
      const p = (gy * iw + gx) * 3;
      const o = (y * area.width + x) * 4;
      const rgb = [px[p], px[p + 1], px[p + 2]];
      const inQr = gx >= qr.x0 && gx <= qr.x1 && gy >= qr.y0 && gy <= qr.y1;
      for (const theme of ['light', 'dark']) {
        const from = theme === 'light' ? 78 : 40;
        let a = skip(gx, gy) ? 0 : Math.max(0, Math.min(1, (rgb[0] - from) / 110));
        // Couleur réelle du trait, sans le bleu du fond mélangé sur les bords.
        let color = rgb.map((v, c) => (a > 0 ? Math.max(0, Math.min(255, (v - (1 - a) * [1, 25, 50][c]) / a)) : 0));
        const saturation = color[0] > 0 ? (color[0] - color[2]) / color[0] : 0;
        const near = y * area.width + x;
        const share = whiteNear[near] / Math.max(1, whiteNear[near] + goldNear[near]);
        const whiteness = isGold(gx, gy) ? 0 : (1 - Math.max(0, Math.min(1, (saturation - 0.12) / 0.2))) * Math.max(0, Math.min(1, (share - 0.42) / 0.16));
        if (theme === 'light') color = color.map((v, c) => v * (1 - whiteness) + INK[c] * whiteness);
        // Reflet d'or presque blanc : invisible sur fond clair, on le ramène à l'or.
        if (theme === 'light' && whiteness < 0.5 && saturation < 0.45) color = [color[0], Math.min(color[1], color[0] * 0.8), Math.min(color[2], color[0] * 0.35)];
        if (inQr && !skip(gx, gy)) { a = 1; color = rgb; }
        out[theme][o] = Math.round(color[0]); out[theme][o + 1] = Math.round(color[1]); out[theme][o + 2] = Math.round(color[2]); out[theme][o + 3] = Math.round(a * 255);
      }
    }
    return Object.fromEntries(Object.entries(out).map(([theme, buffer]) => [theme, sharp(buffer, { raw: { width: area.width, height: area.height, channels: 4 } })]));
  };
  const wide = await cutLogo(BANNER, { left: 288, top: 130, width: 1762, height: 490 }, { x0: 672, x1: 752, y0: 344, y1: 418 },
    // Sans le trait lumineux central, qui n'a de sens que sur fond sombre.
    (x, y) => y < 530 && Math.abs(x - (1113 - (y - 210) * 0.203)) < 20);
  const tall = await cutLogo(ICON, { left: 130, top: 190, width: 994, height: 840 }, { x0: 668, x1: 772, y0: 448, y1: 534 }, (x, y) => (x < 395 && y < 215) || (x < 340 && y < 260),
    (x, y) => x > 640 && x < 815 && y > 255 && y < 335);
  for (const theme of ['light', 'dark']) {
    await wide[theme].clone().resize(1200).webp({ quality: 90, alphaQuality: 95 }).toFile(pub(`brand/gpdv-home-wide-${theme}.webp`));
    await tall[theme].clone().resize(720).webp({ quality: 90, alphaQuality: 95 }).toFile(pub(`brand/gpdv-home-tall-${theme}.webp`));
  }

  // Icônes : le logo détouré sur fond blanc. Sans le slogan, illisible à ces tailles.
  const tallPng = await tall.light.clone().png().toBuffer();
  const mark = await sharp(await sharp(tallPng).extract({ left: 0, top: 0, width: 994, height: 785 }).png().toBuffer()).trim({ threshold: 10 }).png().toBuffer();
  const horse = await sharp(await sharp(tallPng).extract({ left: 0, top: 0, width: 994, height: 545 }).png().toBuffer()).trim({ threshold: 10 }).png().toBuffer();
  const onWhite = async (art, size, scale, { radius = 0, border = false } = {}) => {
    const inner = Math.round(size * scale);
    const layer = await sharp(art).resize(inner, inner, { fit: 'contain', background: CLEAR }).png().toBuffer();
    // Fin liseré gris : la tuile blanche reste visible sur un fond clair.
    const line = border ? Math.max(1, size / 128) : 0;
    const tile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect x="${line / 2}" y="${line / 2}" width="${size - line}" height="${size - line}" rx="${radius}" fill="#fff"${border ? ` stroke="#dbe3ee" stroke-width="${line}"` : ''}/></svg>`);
    return sharp(await sharp(tile).composite([{ input: layer, gravity: 'center' }]).png().toBuffer());
  };
  const png = { compressionLevel: 9 };
  for (const [name, size] of [['brand/gpdv-icon-192.png', 192], ['brand/gpdv-icon-512.png', 512], ['pwa-192x192.png', 192]]) {
    await (await onWhite(mark, size, 0.8, { radius: size * 0.23, border: true })).png(png).toFile(pub(name));
  }
  await (await onWhite(mark, 160, 0.84, { radius: 36, border: true })).webp({ quality: 92 }).toFile(pub('brand/gpdv-logo.webp'));
  // Plein cadre : iOS arrondit lui-même ; Android rogne jusqu'à un cercle de 80 %.
  await (await onWhite(mark, 180, 0.78)).removeAlpha().png(png).toFile(pub('apple-touch-icon.png'));
  await (await onWhite(mark, 512, 0.6)).removeAlpha().png(png).toFile(pub('brand/gpdv-maskable-512.png'));
  // Onglet du navigateur : le cheval seul, sinon illisible à 16-32 px.
  for (const size of [32, 64]) {
    const big = await (await onWhite(horse, 512, 0.94, { radius: 110 })).png().toBuffer();
    await sharp(big).resize(size, size).sharpen({ sigma: 0.6 }).png(png).toFile(pub(`brand/gpdv-favicon-${size}.png`));
  }
  // Pastille de notification Android : silhouette blanche sur fond transparent.
  const { data: ink, info } = await sharp(horse).extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
  const qrHoles = await sharp(horse).removeAlpha().raw().toBuffer();
  // Le QR code (bleu nuit sur or) reste en creux dans le ticket.
  for (let p = 0; p < ink.length; p += 1) {
    const x = p % info.width;
    const y = (p - x) / info.width;
    if (x > 400 && x < 560 && y > 235 && y < 345 && qrHoles[p * 3] < 110) ink[p] = 0;
  }
  const mono = await sharp({ create: { width: info.width, height: info.height, channels: 3, background: '#fff' } })
    .joinChannel(ink, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
  await sharp(mono).resize(88, 88, { fit: 'contain', background: CLEAR })
    .extend({ top: 4, bottom: 4, left: 4, right: 4, background: CLEAR }).png().toFile(pub('brand/gpdv-badge-96.png'));
  console.log('Déclinaisons GPDV générées dans public/.');
};

run().catch((e) => { console.error(e); process.exit(1); });
