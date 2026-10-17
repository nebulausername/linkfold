// Browser walk-through: draft → create → live edit → scan page follows. Screenshots to argv[3].
//   node scripts/browser-check.mjs http://127.0.0.1:3188/qr /path/out
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://127.0.0.1:3188/qr';
const out = process.argv[3] || '.';
const fail = [];
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fail.push(m); };
const b = await chromium.launch();
for (const [name, vp, scheme] of [['desktop', { width: 1280, height: 900 }, 'light'], ['mobile', { width: 390, height: 844 }, 'dark']]) {
  const ctx = await b.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.waitForSelector('#qrBox canvas');
  ok(await p.locator('#phone .lf-title').innerText() === 'Fennel & Co.', `${name}: phone preview renders sample`);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(ov <= 0, `${name}: no horizontal overflow (${ov})`);
  await p.screenshot({ path: `${out}/${name}-1-start.png`, fullPage: true, caret: 'initial' });
  if (name === 'desktop') {
    await p.click('#tab-bio');
    await p.fill('[data-bind="bio.title"]', 'Testbrand');
    ok(await p.waitForFunction(() => document.querySelector('#phone .lf-title')?.textContent === 'Testbrand', null, { timeout: 3000 }).then(() => true, () => false), 'live preview follows title');
    await p.click('#saveBtn');
    await p.waitForSelector('#createdDlg[open]');
    const editUrl = await p.locator('#editLink').innerText();
    ok(/\/e\/[a-z0-9]+#t=/.test(editUrl), 'edit link shown: ' + editUrl.replace(/#t=.*/, '#t=…'));
    await p.screenshot({ path: `${out}/${name}-2-created.png`, caret: 'initial' });
    await p.click('#createdDlg form button');
    const slug = editUrl.match(/\/e\/([a-z0-9]+)/)[1];
    await p.fill('[data-bind="bio.title"]', 'Changed live');
    let scan = '';
    for (let i = 0; i < 25 && !scan.includes('Changed live'); i++) { await p.waitForTimeout(200); scan = await (await ctx.request.get(`${base}/b/${slug}`)).text(); }
    ok(scan.includes('Changed live'), 'live page shows the autosaved change (no save click)');
    await (await ctx.request.get(`${base}/s/${slug}`)).text();
    await p.click('#tab-qr');
    await p.screenshot({ path: `${out}/${name}-3-qr-tab.png`, caret: 'initial' });
    await p.click('#tab-stats');
    await p.waitForSelector('.stats-k');
    ok((await p.locator('.stats-k b').first().innerText()) === '1', 'stats count the scan');
    await p.screenshot({ path: `${out}/${name}-4-stats.png`, caret: 'initial' });
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dlPng')]);
    ok(/\.png$/.test(dl.suggestedFilename()), 'PNG download ' + dl.suggestedFilename());
    // reload via "my codes" → still editable
    await p.goto(`${base}/e/${slug}`, { waitUntil: 'networkidle' });
    ok((await p.locator('#saveBtn').innerText()).includes('live'), 'reopen without hash uses stored token');
    const sp = await ctx.newPage();
    await sp.goto(`${base}/s/${slug}`);
    await sp.screenshot({ path: `${out}/${name}-5-scan.png`, caret: 'initial' });
  }
  ok(errs.length === 0, `${name}: no console errors ${errs.join(' | ')}`);
  await ctx.close();
}
await b.close();
process.exit(fail.length ? 1 : 0);
