// Linkfold — dynamic QR codes + bio-link pages. One small Node server, no framework.
//   node server.mjs            (PORT=3188, BASE=/qr, DB=./data/linkfold.db)
// The QR code always encodes <origin><BASE>/s/<slug>; what that address does (bio page or
// redirect, which links) lives in the database and can change at any time.
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBio } from './public/bio-render.js';
import { validateData, sampleData } from './public/model.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3188);
const HOST = process.env.HOST || '127.0.0.1';
const BASE = (process.env.BASE ?? '/qr').replace(/\/$/, '');
const ORIGIN = process.env.ORIGIN || 'https://kaufmeinewebsite.de';
const DB_PATH = process.env.DB || join(HERE, 'data', 'linkfold.db');
const DEMO_DAYS = 30; // visitor codes are deleted 30 days after their last edit
const SEED_SLUG = 'fennel';

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS codes (
    slug TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    showcase INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    slug TEXT NOT NULL,
    day TEXT NOT NULL,
    kind TEXT NOT NULL,      -- scan | view | click
    ref TEXT NOT NULL DEFAULT '',
    n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (slug, day, kind, ref)
  );
`);

const sha = (s) => createHash('sha256').update(s).digest('hex');
const now = () => Date.now();
const today = () => new Date().toISOString().slice(0, 10);

// Showcase code: nobody holds a token for it, so it can only be copied, never edited.
if (!db.prepare('SELECT 1 FROM codes WHERE slug = ?').get(SEED_SLUG)) {
  db.prepare('INSERT INTO codes VALUES (?, ?, 1, ?, ?, ?)')
    .run(SEED_SLUG, sha(randomBytes(32).toString('hex')), JSON.stringify(sampleData()), now(), now());
}

const q = {
  get: db.prepare('SELECT * FROM codes WHERE slug = ?'),
  insert: db.prepare('INSERT INTO codes VALUES (?, ?, 0, ?, ?, ?)'),
  update: db.prepare('UPDATE codes SET data = ?, updated_at = ? WHERE slug = ?'),
  count: db.prepare(`INSERT INTO events (slug, day, kind, ref, n) VALUES (?, ?, ?, ?, 1)
                     ON CONFLICT (slug, day, kind, ref) DO UPDATE SET n = n + 1`),
  stats: db.prepare('SELECT day, kind, ref, n FROM events WHERE slug = ? ORDER BY day'),
  purgeCodes: db.prepare('DELETE FROM codes WHERE showcase = 0 AND updated_at < ?'),
  purgeEvents: db.prepare('DELETE FROM events WHERE slug NOT IN (SELECT slug FROM codes)'),
};

function purge() {
  q.purgeCodes.run(now() - DEMO_DAYS * 864e5);
  q.purgeEvents.run();
}
purge();
setInterval(purge, 3600e3).unref();

// ---------- tiny per-IP rate limiter ----------
const buckets = new Map();
function limited(ip, key, max, windowMs) {
  const k = key + '|' + ip;
  const t = now();
  const b = buckets.get(k);
  if (!b || t - b.start > windowMs) { buckets.set(k, { start: t, n: 1 }); return false; }
  b.n += 1;
  return b.n > max;
}
setInterval(() => { const t = now(); for (const [k, b] of buckets) if (t - b.start > 3600e3) buckets.delete(k); }, 600e3).unref();

// ---------- static files (cache-busted by content hash) ----------
const PUB = join(HERE, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const STATIC = ['app.js', 'bio-render.js', 'model.js', 'bio.js', 'styles.css', 'bio.css', 'favicon.svg', 'vendor/qr-code-styling.js'];
const files = new Map();
for (const f of STATIC) {
  const p = f === 'vendor/qr-code-styling.js' ? join(HERE, 'node_modules/qr-code-styling/lib/qr-code-styling.js') : join(PUB, f);
  const body = readFileSync(p);
  files.set('/' + f, { body, type: TYPES[extname(f)], v: sha(body).slice(0, 10) });
}
// Version token over ALL assets: changing any file changes every URL, so a CSS-only deploy can never be served stale.
const V = sha([...files.values()].map((f) => f.v).join('')).slice(0, 10);
const indexHtml = readFileSync(join(PUB, 'index.html'), 'utf8')
  .replaceAll('{{BASE}}', BASE).replaceAll('{{V}}', V).replaceAll('{{ORIGIN}}', ORIGIN);

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
function headers(res, type, cache = 'no-cache') {
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', cache);
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  // nosniff / X-Frame-Options / Referrer-Policy / HSTS come from the nginx server block
  // (no add_header in our location, so they're inherited) — sending them here would duplicate them.
  if (process.env.SECURITY_HEADERS !== 'nginx') {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  }
}
function send(res, status, type, body, cache) { headers(res, type, cache); res.statusCode = status; res.end(body); }
const json = (res, status, obj) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(obj), 'no-store');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(title, body, extraHead = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cut">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)}</title>
<link rel="icon" href="${BASE}/favicon.svg?v=${V}"><link rel="stylesheet" href="${BASE}/bio.css?v=${V}">${extraHead}</head>
<body class="lf-bio-page">${body}</body></html>`;
}
function bioPage(row, data) {
  return page(data.bio.title || 'Links', renderBio(data, { slug: row.slug, base: BASE, live: true })
    + `<script src="${BASE}/bio.js?v=${V}" defer></script>`);
}
function notFound(res) {
  send(res, 404, TYPES['.html'], page('Not found', `<main class="lf-msg"><h1>This code doesn't exist (anymore).</h1><p>Demo codes are removed ${DEMO_DAYS} days after their last edit.</p><a href="${BASE}/">Create your own dynamic QR code</a></main>`));
}
function redirectNotice(res, url) {
  // Visitor codes on a shared demo domain: show where the scan goes instead of a silent 302,
  // so the demo can't be used to disguise links. Showcase codes redirect instantly.
  const host = new URL(url).host;
  send(res, 200, TYPES['.html'], page('Redirecting…',
    `<main class="lf-msg"><p class="lf-msg-k">Redirecting to</p><h1>${esc(host)}</h1>
<p><a class="lf-msg-btn" href="${esc(url)}" rel="noopener nofollow">Continue →</a></p>
<p class="lf-msg-s">Demo safeguard: in production this is an instant 302 redirect.</p></main>`,
    `<meta http-equiv="refresh" content="2;url=${esc(url)}">`));
}

async function body(req, limit = 400_000) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('too large'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}
function authorized(req, row) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!tok || row.showcase) return false;
  const a = Buffer.from(sha(tok), 'hex'); const b = Buffer.from(row.token_hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
const ALPH = 'abcdefghijkmnpqrstuvwxyz23456789';
const newSlug = () => Array.from(randomBytes(7), (x) => ALPH[x % ALPH.length]).join('');

function stats(slug) {
  const rows = q.stats.all(slug);
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(new Date(now() - i * 864e5).toISOString().slice(0, 10));
  const scansByDay = Object.fromEntries(days.map((d) => [d, 0]));
  let scans = 0, views = 0; const clicks = {};
  for (const r of rows) {
    if (r.kind === 'scan') { scans += r.n; if (r.day in scansByDay) scansByDay[r.day] += r.n; }
    else if (r.kind === 'view') views += r.n;
    else if (r.kind === 'click') clicks[r.ref] = (clicks[r.ref] || 0) + r.n;
  }
  return { scans, views, clicks, days: days.map((d) => ({ day: d, scans: scansByDay[d] })) };
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  let p = url.pathname;
  if (BASE && p === BASE) { res.statusCode = 301; res.setHeader('Location', BASE + '/'); return res.end(); }
  if (BASE) { if (!p.startsWith(BASE + '/')) return notFound(res); p = p.slice(BASE.length); }
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || '';
  const m = req.method;

  if ((m === 'GET' || m === 'HEAD') && (p === '/' || /^\/e\/[a-z0-9]{3,16}$/.test(p))) {
    return send(res, 200, TYPES['.html'], indexHtml);
  }
  if ((m === 'GET' || m === 'HEAD') && files.has(p)) {
    const f = files.get(p);
    const cache = url.searchParams.get('v') ? 'public, max-age=31536000, immutable' : 'no-cache';
    return send(res, 200, f.type, f.body, cache);
  }
  if (m === 'GET' && p === '/healthz') return json(res, 200, { ok: true });

  // ---- the address printed in every QR code ----
  let mm;
  if ((m === 'GET' || m === 'HEAD') && (mm = p.match(/^\/s\/([a-z0-9]{3,16})$/))) {
    const row = q.get.get(mm[1]);
    if (!row) return notFound(res);
    const data = JSON.parse(row.data);
    if (m === 'GET') q.count.run(row.slug, today(), 'scan', '');
    if (data.mode === 'redirect' && data.target) {
      if (row.showcase) { res.statusCode = 302; res.setHeader('Location', data.target); res.setHeader('Cache-Control', 'no-store'); return res.end(); }
      return redirectNotice(res, data.target);
    }
    return send(res, 200, TYPES['.html'], bioPage(row, data), 'no-store');
  }
  // bio page opened from the editor ("view live page") — counted as a view, not a scan
  if ((m === 'GET' || m === 'HEAD') && (mm = p.match(/^\/b\/([a-z0-9]{3,16})$/))) {
    const row = q.get.get(mm[1]);
    if (!row) return notFound(res);
    if (m === 'GET') q.count.run(row.slug, today(), 'view', '');
    return send(res, 200, TYPES['.html'], bioPage(row, JSON.parse(row.data)), 'no-store');
  }

  // ---- API ----
  if (m === 'POST' && p === '/api/codes') {
    if (limited(ip, 'create', 15, 3600e3)) return json(res, 429, { error: 'Too many new codes from your network — try again in an hour.' });
    const v = validateData((await body(req)).data);
    if (v.error) return json(res, 400, { error: v.error });
    let slug = newSlug();
    while (q.get.get(slug)) slug = newSlug();
    const token = randomBytes(24).toString('base64url');
    q.insert.run(slug, sha(token), JSON.stringify(v.data), now(), now());
    return json(res, 201, { slug, token, scanUrl: `${ORIGIN}${BASE}/s/${slug}` });
  }
  if ((mm = p.match(/^\/api\/codes\/([a-z0-9]{3,16})(\/stats)?$/))) {
    const row = q.get.get(mm[1]);
    if (!row) return json(res, 404, { error: 'Not found' });
    if (m === 'GET' && !mm[2]) {
      return json(res, 200, { slug: row.slug, showcase: !!row.showcase, editable: authorized(req, row), data: JSON.parse(row.data), updatedAt: row.updated_at, scanUrl: `${ORIGIN}${BASE}/s/${row.slug}` });
    }
    if (m === 'GET' && mm[2]) {
      if (!authorized(req, row) && !row.showcase) return json(res, 403, { error: 'Edit link required' });
      return json(res, 200, stats(row.slug));
    }
    if (m === 'PUT' && !mm[2]) {
      if (!authorized(req, row)) return json(res, 403, { error: row.showcase ? 'The showcase code is read-only — save your own copy.' : 'Edit link required' });
      if (limited(ip, 'update', 300, 3600e3)) return json(res, 429, { error: 'Too many updates — slow down a little.' });
      const v = validateData((await body(req)).data);
      if (v.error) return json(res, 400, { error: v.error });
      q.update.run(JSON.stringify(v.data), now(), row.slug);
      return json(res, 200, { ok: true, updatedAt: now() });
    }
  }
  if (m === 'POST' && p === '/api/click') {
    const b = await body(req, 2000).catch(() => ({}));
    if (typeof b.slug === 'string' && typeof b.link === 'string' && !limited(ip, 'click', 600, 3600e3)) {
      const row = q.get.get(b.slug);
      if (row && JSON.parse(row.data).bio.links.some((l) => l.id === b.link)) q.count.run(row.slug, today(), 'click', b.link);
    }
    res.statusCode = 204; return res.end();
  }
  return notFound(res);
}

createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
    if (!e.status) console.error(e);
  });
}).listen(PORT, HOST, () => console.log(`linkfold on http://${HOST}:${PORT}${BASE}/`));
