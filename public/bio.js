// Counts link clicks without routing them through our domain: links point straight at their
// destination, the click is reported in the background.
const root = document.querySelector('.lf-bio');
const slug = root && root.dataset.slug;
const base = new URL('..', location.href).pathname.replace(/\/$/, '');
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || !slug) return;
  const body = JSON.stringify({ slug, link: a.dataset.link });
  try { navigator.sendBeacon(base + '/api/click', new Blob([body], { type: 'application/json' })); } catch {}
});
