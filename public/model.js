// Shared by server and browser: the shape of one code, its validation and the sample brand.

export const DOT_STYLES = ['square', 'dots', 'rounded', 'extra-rounded', 'classy', 'classy-rounded'];
export const EYE_STYLES = ['square', 'extra-rounded', 'dot'];
export const EYE_DOT_STYLES = ['square', 'dot'];
export const BUTTON_SHAPES = ['pill', 'soft', 'square'];
export const FONTS = ['sans', 'serif', 'mono'];
export const MAX_LINKS = 12;

const HEX = /^#[0-9a-f]{6}$/i;
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export function isSafeUrl(u) {
  if (typeof u !== 'string' || u.length > 2048) return false;
  try {
    const x = new URL(u);
    if (x.protocol === 'mailto:' || x.protocol === 'tel:') return u.length > 7;
    return (x.protocol === 'https:' || x.protocol === 'http:') && !!x.hostname && x.hostname.includes('.');
  } catch { return false; }
}

// Lenient for typing: "fennel.co" → "https://fennel.co"
export function normalizeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'mailto:' + s;
  return 'https://' + s;
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
const color = (v, dflt) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : dflt);

export function validateData(d) {
  if (!d || typeof d !== 'object') return { error: 'Missing data' };
  const mode = d.mode === 'redirect' ? 'redirect' : 'bio';
  const target = str(d.target, 2048);
  if (mode === 'redirect' && !isSafeUrl(target)) return { error: 'Please enter a valid destination URL (https://…).' };
  if (target && !isSafeUrl(target)) return { error: 'Destination URL is not valid.' };

  const s = d.style || {};
  const logo = typeof s.logo === 'string' && s.logo ? s.logo : null;
  if (logo && (!LOGO.test(logo) || logo.length > 250_000)) return { error: 'Logo must be a PNG/JPEG/WebP under ~180 KB.' };
  const style = {
    fg: color(s.fg, '#111111'),
    bg: color(s.bg, '#ffffff'),
    eye: color(s.eye, color(s.fg, '#111111')),
    dots: pick(s.dots, DOT_STYLES, 'rounded'),
    eyeStyle: pick(s.eyeStyle, EYE_STYLES, 'extra-rounded'),
    eyeDot: pick(s.eyeDot, EYE_DOT_STYLES, 'dot'),
    logo,
    logoSize: Math.min(0.5, Math.max(0.15, Number(s.logoSize) || 0.35)),
  };

  const b = d.bio || {};
  const t = b.theme || {};
  const links = [];
  for (const l of Array.isArray(b.links) ? b.links.slice(0, MAX_LINKS) : []) {
    const label = str(l && l.label, 60);
    const url = str(l && l.url, 2048);
    if (!label && !url) continue;
    if (!label) return { error: 'Every link needs a label.' };
    if (!isSafeUrl(url)) return { error: `Link “${label}” needs a valid URL.` };
    const id = typeof l.id === 'string' && /^[a-z0-9]{4,12}$/.test(l.id) ? l.id : Math.random().toString(36).slice(2, 10);
    links.push({ id, label, url, on: l.on !== false });
  }
  if (new Set(links.map((l) => l.id)).size !== links.length) return { error: 'Duplicate link ids.' };
  const bio = {
    title: str(b.title, 60),
    tagline: str(b.tagline, 160),
    showLogo: b.showLogo !== false,
    links,
    theme: {
      bg: color(t.bg, '#f6f3ee'),
      card: color(t.card, '#ffffff'),
      text: color(t.text, '#1d1b18'),
      accent: color(t.accent, '#2f5d50'),
      shape: pick(t.shape, BUTTON_SHAPES, 'pill'),
      font: pick(t.font, FONTS, 'sans'),
    },
  };
  if (mode === 'bio' && !bio.title) return { error: 'Give your bio page a title.' };
  return { data: { name: str(d.name, 60) || bio.title || 'Untitled', mode, target, style, bio } };
}

export function sampleData() {
  return {
    name: 'Fennel & Co. — table card',
    mode: 'bio',
    target: '',
    style: { fg: '#2f5d50', bg: '#ffffff', eye: '#c8643b', dots: 'rounded', eyeStyle: 'extra-rounded', eyeDot: 'dot', logo: null, logoSize: 0.35 },
    bio: {
      title: 'Fennel & Co.',
      tagline: 'Small-batch coffee roastery · Sample brand for this demo',
      showLogo: true,
      links: [
        { id: 'menu0001', label: 'Today’s menu', url: 'https://example.com/menu', on: true },
        { id: 'order001', label: 'Order beans online', url: 'https://example.com/shop', on: true },
        { id: 'insta001', label: 'Instagram', url: 'https://example.com/instagram', on: true },
        { id: 'event001', label: 'Cupping night — Thu 7 pm', url: 'https://example.com/events', on: true },
        { id: 'jobs0001', label: 'We’re hiring baristas', url: 'https://example.com/jobs', on: false },
      ],
      theme: { bg: '#f6f3ee', card: '#ffffff', text: '#1d1b18', accent: '#2f5d50', shape: 'pill', font: 'serif' },
    },
  };
}
