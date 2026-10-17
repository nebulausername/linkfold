// Renders a bio page. Used by the server (real page) and by the editor (phone preview),
// so what you see while editing is exactly what a scan shows.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FONT = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};
const RADIUS = { pill: '999px', soft: '14px', square: '4px' };

function initials(title) {
  const w = String(title || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
  return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
}
function hostOf(u) {
  try { const x = new URL(u); return x.protocol.startsWith('http') ? x.hostname.replace(/^www\./, '') : x.protocol.replace(':', ''); } catch { return ''; }
}

export function renderBio(data, { slug = '', live = false } = {}) {
  const b = data.bio;
  const t = b.theme;
  const vars = `--bg:${t.bg};--card:${t.card};--text:${t.text};--accent:${t.accent};--radius:${RADIUS[t.shape]};--font:${FONT[t.font]}`;
  const avatar = b.showLogo
    ? (data.style.logo
      ? `<img class="lf-avatar" src="${esc(data.style.logo)}" alt="">`
      : `<div class="lf-avatar lf-avatar-txt" aria-hidden="true">${esc(initials(b.title))}</div>`)
    : '';
  const links = b.links.filter((l) => l.on).map((l) =>
    `<li><a class="lf-link" href="${esc(l.url)}" data-link="${esc(l.id)}" rel="noopener nofollow"${live ? '' : ' tabindex="-1"'}>`
    + `<span class="lf-link-label">${esc(l.label)}</span><span class="lf-link-host">${esc(hostOf(l.url))}</span></a></li>`).join('');
  return `<div class="lf-bio" style="${vars}" data-slug="${esc(slug)}">
  <main class="lf-bio-inner">
    ${avatar}
    <h1 class="lf-title">${esc(b.title || 'Your title')}</h1>
    ${b.tagline ? `<p class="lf-tagline">${esc(b.tagline)}</p>` : ''}
    <ul class="lf-links">${links || '<li class="lf-empty">No links yet</li>'}</ul>
    <p class="lf-foot">Made with Linkfold · demo</p>
  </main>
</div>`;
}
