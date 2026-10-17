import { renderBio } from './bio-render.js';
import { sampleData, validateData, normalizeUrl, isSafeUrl, DOT_STYLES, MAX_LINKS } from './model.js';

const BASE = document.body.dataset.base;
const ORIGIN = document.body.dataset.origin;
const SHOWCASE = 'fennel';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ---------- state ----------
const st = { slug: null, token: null, data: sampleData(), savedJson: '', saving: false, timer: null };
const scanUrl = () => `${ORIGIN}${BASE}/s/${st.slug || SHOWCASE}`;
const editable = () => !!(st.slug && st.token);

// ---------- local "my codes" (per browser; storage may be unavailable) ----------
function mine() { try { return JSON.parse(localStorage.getItem('linkfold.codes') || '[]'); } catch { return []; } }
function remember(entry) {
  const list = mine().filter((c) => c.slug !== entry.slug);
  list.unshift(entry);
  try { localStorage.setItem('linkfold.codes', JSON.stringify(list.slice(0, 30))); } catch {}
  renderMine();
}
function renderMine() {
  const list = mine();
  $('#mineCount').textContent = list.length;
  const pop = $('#mineList');
  pop.replaceChildren();
  if (!list.length) { pop.innerHTML = '<p>No codes yet. Codes you create show up here (this browser only).</p>'; return; }
  for (const c of list) {
    const a = document.createElement('a');
    a.href = `${BASE}/e/${c.slug}#t=${c.token}`;
    a.innerHTML = '<span></span><small></small>';
    a.firstChild.textContent = c.name || c.slug;
    a.lastChild.textContent = c.slug;
    pop.append(a);
  }
}
$('#mineBtn').addEventListener('click', (e) => {
  const pop = $('#mineList'); pop.hidden = !pop.hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!pop.hidden));
});
document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) { $('#mineList').hidden = true; $('#mineBtn').setAttribute('aria-expanded', 'false'); } });
window.addEventListener('hashchange', () => location.reload());
$('#newBtn').addEventListener('click', () => { location.href = `${BASE}/`; });

// ---------- path helpers for data-bind ----------
const getP = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
function setP(o, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; }

function fillForm() {
  for (const el of $$('[data-bind]')) {
    const v = getP(st.data, el.dataset.bind);
    if (el.type === 'radio') el.checked = el.value === v;
    else if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
  }
  renderChips(); renderLinks(); renderLogo();
}
for (const el of $$('[data-bind]')) {
  const ev = el.type === 'radio' || el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
  el.addEventListener(ev, () => {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.num !== undefined) v = Number(v);
    setP(st.data, el.dataset.bind, v);
    changed();
  });
  if (el.dataset.url !== undefined) el.addEventListener('blur', () => {
    const n = normalizeUrl(el.value); if (n !== el.value) { el.value = n; setP(st.data, el.dataset.bind, n); changed(); }
    el.classList.toggle('bad', !!n && !isSafeUrl(n));
  });
}

// ---------- tabs ----------
const tabs = $$('[role="tab"]');
function selectTab(t) {
  for (const x of tabs) {
    const on = x === t;
    x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
    document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
  }
  if (t.id === 'tab-stats') loadStats();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (d) { const n = tabs[(i + d + tabs.length) % tabs.length]; selectTab(n); n.focus(); }
  });
});

// ---------- dot-style chips with tiny previews ----------
const CHIP_SVG = {
  square: '<rect x="2" y="2" width="10" height="10"/><rect x="14" y="2" width="10" height="10"/><rect x="2" y="14" width="10" height="10"/>',
  dots: '<circle cx="7" cy="7" r="5"/><circle cx="19" cy="7" r="5"/><circle cx="7" cy="19" r="5"/>',
  rounded: '<rect x="2" y="2" width="22" height="10" rx="5"/><rect x="2" y="14" width="10" height="10" rx="5"/>',
  'extra-rounded': '<rect x="2" y="2" width="22" height="10" rx="5"/><path d="M2 14h10v5a5 5 0 0 1-10 0z"/>',
  classy: '<path d="M2 2h10v10H7a5 5 0 0 1-5-5z"/><path d="M14 2h10v5a5 5 0 0 1-5 5h-5z"/><rect x="2" y="14" width="10" height="10"/>',
  'classy-rounded': '<path d="M2 7a5 5 0 0 1 5-5h5v10H7a5 5 0 0 1-5-5z"/><path d="M14 2h5a5 5 0 0 1 5 5v5H14z"/><rect x="2" y="14" width="10" height="10" rx="3"/>',
};
const CHIP_NAME = { square: 'Square', dots: 'Dots', rounded: 'Rounded', 'extra-rounded': 'Smooth', classy: 'Classy', 'classy-rounded': 'Classy soft' };
function renderChips() {
  const box = $('[data-chips="style.dots"]');
  box.replaceChildren();
  for (const k of DOT_STYLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(st.data.style.dots === k));
    b.innerHTML = `<svg viewBox="0 0 26 26" fill="currentColor" aria-hidden="true">${CHIP_SVG[k]}</svg>${CHIP_NAME[k]}`;
    b.addEventListener('click', () => { st.data.style.dots = k; renderChips(); changed(); });
    box.append(b);
  }
}

// ---------- links editor ----------
const newId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
function renderLinks() {
  const ul = $('#linksEd');
  const links = st.data.bio.links;
  ul.replaceChildren();
  links.forEach((l, i) => {
    const li = document.createElement('li');
    li.className = l.on ? '' : 'off';
    li.innerHTML = `
      <div class="ord"><button type="button" class="icon" data-a="up" aria-label="Move up">↑</button><button type="button" class="icon" data-a="down" aria-label="Move down">↓</button></div>
      <div class="inputs"><input data-f="label" maxlength="60" placeholder="Label" aria-label="Link label"><input data-f="url" inputmode="url" placeholder="https://…" aria-label="Link URL"></div>
      <div class="tools"><input type="checkbox" class="switch" data-f="on" aria-label="Show this link"><button type="button" class="icon" data-a="del" aria-label="Remove link">✕</button></div>`;
    const [lab, url] = li.querySelectorAll('.inputs input');
    lab.value = l.label; url.value = l.url;
    const sw = li.querySelector('.switch'); sw.checked = l.on;
    li.querySelector('[data-a="up"]').disabled = i === 0;
    li.querySelector('[data-a="down"]').disabled = i === links.length - 1;
    lab.addEventListener('input', () => { l.label = lab.value; changed(); });
    url.addEventListener('input', () => { l.url = url.value; changed(); });
    url.addEventListener('blur', () => { l.url = normalizeUrl(url.value); url.value = l.url; url.classList.toggle('bad', !!l.url && !isSafeUrl(l.url)); changed(); });
    sw.addEventListener('change', () => { l.on = sw.checked; li.className = l.on ? '' : 'off'; changed(); });
    li.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'del') links.splice(i, 1);
      if (a === 'up' && i > 0) [links[i - 1], links[i]] = [links[i], links[i - 1]];
      if (a === 'down' && i < links.length - 1) [links[i + 1], links[i]] = [links[i], links[i + 1]];
      renderLinks(); changed();
      const again = $('#linksEd').children[a === 'up' ? i - 1 : a === 'down' ? i + 1 : i];
      again?.querySelector(`[data-a="${a}"]:not(:disabled)`)?.focus();
    });
    ul.append(li);
  });
  $('#addLink').disabled = links.length >= MAX_LINKS;
}
$('#addLink').addEventListener('click', () => {
  st.data.bio.links.push({ id: newId(), label: '', url: '', on: true });
  renderLinks();
  $('#linksEd').lastElementChild.querySelector('input').focus();
});
$('#syncFromQr').addEventListener('click', () => {
  const t = st.data.bio.theme; t.accent = st.data.style.fg; t.text = st.data.style.fg === '#ffffff' ? '#111111' : t.text;
  fillForm(); changed();
});

// ---------- logo ----------
function renderLogo() {
  const l = st.data.style.logo;
  $('#logoPrev').style.backgroundImage = l ? `url("${l}")` : 'none';
  $('#logoRemove').disabled = !l;
}
$('#logoFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const url = URL.createObjectURL(f);
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const max = 320; const s = Math.min(1, max / Math.max(img.naturalWidth || max, img.naturalHeight || max));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((img.naturalWidth || max) * s)); c.height = Math.max(1, Math.round((img.naturalHeight || max) * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    let d = c.toDataURL('image/png');
    if (d.length > 240_000) d = c.toDataURL('image/webp', 0.85);
    if (d.length > 240_000) throw new Error('too big');
    st.data.style.logo = d; renderLogo(); changed();
  } catch { banner('That image could not be used — try a PNG or JPG under 2 MB.', 'err'); }
});
$('#logoRemove').addEventListener('click', () => { st.data.style.logo = null; renderLogo(); changed(); });

// ---------- QR ----------
function qrOptions(size) {
  const s = st.data.style;
  return {
    width: size, height: size, type: 'canvas', data: scanUrl(), margin: Math.round(size * 0.045),
    // Round dots + logos lose module area → highest error correction keeps them readable
    qrOptions: { errorCorrectionLevel: s.logo || s.dots === 'dots' ? 'H' : 'Q' },
    dotsOptions: { color: s.fg, type: s.dots },
    backgroundOptions: { color: s.bg },
    cornersSquareOptions: { color: s.eye, type: s.eyeStyle },
    cornersDotOptions: { color: s.eye, type: s.eyeDot },
    image: s.logo || undefined,
    imageOptions: { imageSize: s.logoSize, margin: Math.round(size / 80), hideBackgroundDots: true },
  };
}
let qr = null;
function drawQr() {
  if (!window.QRCodeStyling) return;
  const o = qrOptions(600);
  if (!qr) { qr = new window.QRCodeStyling(o); qr.append($('#qrBox')); }
  else qr.update(o);
  $('#qrBox').setAttribute('aria-label', `QR code pointing to ${scanUrl()}`);
}
async function download(ext) {
  const o = qrOptions(2048);
  if (ext === 'svg') o.type = 'svg';
  const q = new window.QRCodeStyling(o);
  const name = (st.data.name || 'linkfold').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'linkfold';
  await q.download({ name: `${name}-qr`, extension: ext });
}
$('#dlPng').addEventListener('click', () => download('png'));
$('#dlSvg').addEventListener('click', () => download('svg'));

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function checkContrast() {
  const s = st.data.style; const w = $('#contrastWarn');
  const a = lum(s.fg), b = lum(s.bg), e = lum(s.eye);
  const ratio = (x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  let msg = '';
  if (a > b) msg = 'Light dots on a dark background (inverted) don’t scan on some older phones. Use darker dots than background for print.';
  else if (ratio(a, b) < 4 || ratio(e, b) < 3) msg = `Low contrast (${ratio(a, b).toFixed(1)}:1). Scanners need clear contrast — aim for 4:1 or more.`;
  w.hidden = !msg; w.textContent = msg;
}

// ---------- previews ----------
function drawPhone() {
  const ph = $('#phone');
  if (st.data.mode === 'redirect') {
    let host = '…';
    try { host = new URL(normalizeUrl(st.data.target)).host || '…'; } catch {}
    ph.innerHTML = '<div class="redirect-card"><span>A scan opens</span><b></b><span>directly (HTTP redirect).</span></div>';
    ph.querySelector('b').textContent = host;
  } else {
    ph.innerHTML = renderBio(st.data, {});
  }
  $('#targetField').hidden = st.data.mode !== 'redirect';
  $('#tab-bio').textContent = st.data.mode === 'redirect' ? 'Bio page (off)' : 'Bio page';
}
function drawMeta() {
  $('#scanUrl').textContent = scanUrl().replace(/^https?:\/\//, '');
  $('#scanUrlNote').textContent = scanUrl().replace(/^https?:\/\//, '');
  $('#openLive').href = `${BASE}/${st.data.mode === 'redirect' ? 's' : 'b'}/${st.slug || SHOWCASE}`;
  $('#saveBtn').textContent = editable() ? (st.saving ? 'Saving…' : dirty() ? 'Publish changes' : 'All changes live ✓') : 'Create dynamic QR code';
}
const dirty = () => JSON.stringify(st.data) !== st.savedJson;

let raf = 0;
function changed() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => { drawQr(); drawPhone(); drawMeta(); checkContrast(); });
  if (editable()) { clearTimeout(st.timer); st.timer = setTimeout(save, 900); }
}

// ---------- banner ----------
function banner(text, kind = '', action) {
  const b = $('#banner'); b.className = 'banner ' + kind; b.replaceChildren();
  if (!text) return;
  const s = document.createElement('span'); s.textContent = text; b.append(s);
  if (action) { const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn ghost sm'; btn.textContent = action.label; btn.onclick = action.run; b.append(btn); }
}
function defaultBanner() {
  if (editable()) banner('Editing your live code — changes are published automatically about a second after you stop typing.', 'ok');
  else banner('You’re designing a draft based on a sample brand. The preview QR already works — scan it with your phone. Create it to get your own dynamic code.');
}

// ---------- API ----------
async function api(path, opts = {}) {
  const r = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(st.token ? { Authorization: `Bearer ${st.token}` } : {}), ...opts.headers },
  });
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}
async function save() {
  clearTimeout(st.timer);
  const v = validateData(st.data);
  if (v.error) { banner(v.error, 'err'); return; }
  if (editable() && !dirty()) return;
  st.saving = true; $('#saveBtn').disabled = true; drawMeta();
  try {
    if (editable()) {
      await api(`/codes/${st.slug}`, { method: 'PUT', body: JSON.stringify({ data: st.data }) });
      st.savedJson = JSON.stringify(st.data);
      remember({ slug: st.slug, token: st.token, name: st.data.name });
      banner(`Live ✓ — every scan of ${st.slug} now follows this version (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}).`, 'ok');
    } else {
      const r = await api('/codes', { method: 'POST', body: JSON.stringify({ data: st.data }) });
      st.slug = r.slug; st.token = r.token; st.savedJson = JSON.stringify(st.data);
      history.replaceState(null, '', `${BASE}/e/${r.slug}#t=${r.token}`);
      remember({ slug: r.slug, token: r.token, name: st.data.name });
      $('#editLink').textContent = location.href;
      $('#createdDlg').showModal();
      defaultBanner(); startStats();
    }
  } catch (e) { banner(e.message, 'err'); }
  finally { st.saving = false; $('#saveBtn').disabled = false; drawMeta(); drawQr(); }
}
$('#saveBtn').addEventListener('click', save);
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } });
window.addEventListener('beforeunload', (e) => { if (editable() && dirty()) e.preventDefault(); });

async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = o), 1400); }
  catch { banner('Copy failed — select the text and copy it manually.', 'err'); }
}
$('#copyScan').addEventListener('click', (e) => copy(scanUrl(), e.currentTarget));
$('#copyEdit').addEventListener('click', (e) => copy($('#editLink').textContent, e.currentTarget));

// ---------- stats ----------
let statsTimer = 0;
async function loadStats() {
  const box = $('#statsBody');
  const slug = st.slug || SHOWCASE;
  try {
    const s = await api(`/codes/${slug}/stats`);
    const max = Math.max(1, ...s.days.map((d) => d.scans));
    const labels = Object.fromEntries(st.data.bio.links.map((l) => [l.id, l.label]));
    box.innerHTML = `
      <p class="hint"><span class="live-dot"></span>${st.slug ? 'Live counts for your code' : 'Live counts for the sample code'} · refreshes every 10 s</p>
      <div class="stats-k"><div><b>${s.scans}</b><span>Scans</span></div><div><b>${s.views}</b><span>Page views</span></div><div><b>${Object.values(s.clicks).reduce((a, b) => a + b, 0)}</b><span>Link clicks</span></div></div>
      <div><div class="bars" role="img" aria-label="Scans over the last 14 days"></div><div class="bars-x"><span>${s.days[0].day.slice(5)}</span><span>today</span></div></div>
      <table class="clicks"><tbody></tbody></table>`;
    const bars = box.querySelector('.bars');
    for (const d of s.days) { const b = document.createElement('div'); b.style.height = `${(d.scans / max) * 100}%`; b.title = `${d.day}: ${d.scans} scans`; bars.append(b); }
    const tb = box.querySelector('tbody');
    for (const l of st.data.bio.links) {
      const tr = document.createElement('tr'); tr.innerHTML = '<td></td><td></td>';
      tr.firstChild.textContent = labels[l.id] || l.id; tr.lastChild.textContent = s.clicks[l.id] || 0; tb.append(tr);
    }
  } catch (e) { box.innerHTML = '<p class="hint"></p>'; box.firstChild.textContent = e.message; }
}
function startStats() {
  clearInterval(statsTimer);
  statsTimer = setInterval(() => { if (!document.hidden && !$('#panel-stats').hidden) loadStats(); }, 10_000);
}

// ---------- boot ----------
async function boot() {
  renderMine();
  const m = location.pathname.match(/\/e\/([a-z0-9]{3,16})$/);
  if (m) {
    const tok = new URLSearchParams(location.hash.slice(1)).get('t') || mine().find((c) => c.slug === m[1])?.token;
    st.slug = m[1]; st.token = tok || null;
    try {
      const r = await api(`/codes/${st.slug}`);
      st.data = r.data;
      if (!r.editable) {
        // No valid edit link: start a copy instead of pretending to edit
        st.slug = null; st.token = null;
        history.replaceState(null, '', `${BASE}/`);
        banner('That edit link isn’t valid for this code — you’re now editing a copy of it.', 'err');
      }
    } catch (e) {
      st.slug = null; st.token = null;
      history.replaceState(null, '', `${BASE}/`);
      banner(`${e.message} — starting a new code instead.`, 'err');
    }
  }
  st.savedJson = st.slug ? JSON.stringify(st.data) : '';
  fillForm(); drawPhone(); drawMeta(); checkContrast();
  if (!$('#banner').textContent) defaultBanner();
  startStats();
  const tryQr = () => (window.QRCodeStyling ? drawQr() : setTimeout(tryQr, 30));
  tryQr();
}
boot();
