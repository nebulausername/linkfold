// Downloads the 2048 px PNG (with a logo + low-contrast-free brand colors) and decodes it.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const jsQR = (await import('jsqr')).default;
const { PNG } = await import('pngjs');
const base = process.argv[2] || 'http://127.0.0.1:3188/qr';
const logo = process.argv[3];
const b = await chromium.launch();
const p = await (await b.newContext({ acceptDownloads: true })).newPage();
await p.goto(base + '/', { waitUntil: 'networkidle' });
await p.waitForSelector('#qrBox canvas');
if (logo) { await p.click('#tab-qr'); await p.setInputFiles('#logoFile', logo); await p.waitForTimeout(500); }
for (const style of ['rounded', 'dots', 'classy-rounded']) {
  await p.evaluate(() => 0);
  await p.click('#tab-qr'); await p.locator('[data-chips="style.dots"] button', { hasText: { rounded: 'Rounded', dots: 'Dots', 'classy-rounded': 'Classy soft' }[style] }).first().click();
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dlPng')]);
  const png = PNG.sync.read(readFileSync(await dl.path()));
  let r = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (!r) { // camera-like: scale down to 400 px (box filter) and retry
    const n = 400, f = png.width / n, out = new Uint8ClampedArray(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let c = 0; c < 4; c++) {
      let sum = 0, k = 0;
      for (let yy = Math.floor(y * f); yy < Math.floor((y + 1) * f); yy++) for (let xx = Math.floor(x * f); xx < Math.floor((x + 1) * f); xx++) { sum += png.data[(yy * png.width + xx) * 4 + c]; k++; }
      out[(y * n + x) * 4 + c] = sum / k;
    }
    r = jsQR(out, n, n); if (r) r.data += ' (at 400 px)';
  }
  console.log(`${style}${logo ? ' +logo' : ''}: ${png.width}x${png.height} → ${r ? r.data : 'NOT DECODED'}`);
}
await b.close();
