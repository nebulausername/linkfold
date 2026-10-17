# Linkfold — dynamic QR codes & bio-link pages

**Live demo:** https://kaufmeinewebsite.de/qr/

Design a branded, high-resolution QR code, point it at a mobile bio-link page or any URL,
and change the destination at any time — the printed code never changes.

## What it does

- **Dynamic routing** – every QR code encodes a short, permanent address (`/qr/s/<code>`).
  The server resolves it on each scan, so you can switch between *bio page* and *direct redirect*,
  or swap any link, without reprinting.
- **Custom styling** – brand colors for dots, corners and background, six dot styles, corner shapes,
  logo upload (auto-resized), automatic error-correction level (H when a logo or round dots are used),
  contrast warning for codes that won't scan well.
- **High-res export** – PNG at 2048 × 2048 px and vector SVG.
- **Mobile bio-link page** – title, tagline, logo, up to 12 links (reorder, hide, edit), theme colors,
  button shape and font. The editor preview and the real page share one renderer.
- **Real-time updates** – changes autosave about a second after you stop typing and are live on the next scan.
- **Scan stats** – scans per day (14 days), page views, clicks per link (counted via `sendBeacon`,
  links point straight at their destination).
- **No accounts needed** – creating a code returns a private edit link (token, stored only as a SHA-256 hash).

## Stack

Plain Node.js 22 (no framework) · built-in `node:sqlite` · [`qr-code-styling`](https://github.com/kozakdenys/qr-code-styling)
in the browser · vanilla JS modules · CSS with light/dark mode. One process, one SQLite file, about 1,000 lines including CSS.

```bash
npm install
npm start                       # http://127.0.0.1:3188/qr/
BASE= PORT=8080 npm start       # serve at the root instead
```

Env: `PORT`, `HOST`, `BASE` (path prefix, default `/qr`), `ORIGIN` (public origin encoded in QR codes),
`DB` (SQLite path).

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /s/:slug` | The printed address: counts a scan, shows the bio page or redirects |
| `GET /b/:slug` | Bio page preview (counted as a view) |
| `POST /api/codes` | Create → `{ slug, token }` |
| `GET /api/codes/:slug` | Public data (`editable` if a valid `Authorization: Bearer <token>` is sent) |
| `PUT /api/codes/:slug` | Update (token required) |
| `GET /api/codes/:slug/stats` | Scan / view / click counts (token required) |
| `POST /api/click` | Click beacon |

## Demo safeguards

Because the demo runs on a shared domain, codes created by visitors show a short "Redirecting to …" notice
instead of an instant 302 (so the demo can't be used to disguise links), are rate-limited per IP and are
deleted 30 days after their last edit. In a production build for one brand these switch off.

## Checks

```bash
npx playwright install chromium   # once
node scripts/browser-check.mjs http://127.0.0.1:3188/qr ./shots   # create → live edit → scan follows
node scripts/scan-check.mjs http://127.0.0.1:3188/qr [logo.png]  # decodes the 2048 px PNG export
```

MIT License
