// Store links check (added 2026-11-24). Run from the site folder:
//   node checks/store-links.mjs                           serves this folder itself and checks the pages in headless Chrome
//   node checks/store-links.mjs https://fieldstripapp.com  the same checks against the live address
// Proves: (a) the home page has one App Store button and one Google Play button, Apple's first, fully on the first
// screen at phone, tablet and desktop size; (b) the home page head carries Apple's App Store strip tag; (c) the two
// retired phrases are in no page and the two new sentences are there; (d) where fieldstripapp.com/get sends each kind
// of browser; (e) /get asks nothing of any outside host but the fonts and the one store hop, and stores nothing;
// (f) the hop uses location.replace.
// Nothing goes to either store: inside the check every request to a host other than the site itself and the two font
// hosts is refused before it leaves the PC, and the check only reads the address that was asked for.
// When it serves the folder itself, /get is answered from get.html, the way the live host does.
// No dependencies: Node 22+ and the installed Chrome.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, mkdtempSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';

const APPLE = 'https://apps.apple.com/app/id6823353340';
const GOOGLE = 'https://play.google.com/store/apps/details?id=com.fieldstripllc.fieldstrip';
const APP_ID = '6823353340';
const STORE_HOSTS = ['apps.apple.com', 'play.google.com'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const PAGES = ['/', '/get', '/privacy.html', '/support.html', '/terms.html'];
const HOME_TITLE = 'Fieldstrip — A record of your safe that never leaves your safe';
const DESC = 'Fieldstrip is a firearm maintenance and record-keeping app with no cloud and no accounts: step-by-step guides, ammunition tracking, and a complete logbook for every firearm you own. Lake Havasu City, Arizona.';
const CARD_TITLE = 'Fieldstrip: firearm maintenance guides';
const CARD_PICTURE = 'https://fieldstripapp.com/assets/fieldstrip-home-poster.jpg';
const LEAD_BOLD = 'Your records never leave your phone. No subscription.';
const LEAD = LEAD_BOLD + ' The guides and the core logbook are free, with no account and no trial clock. Pro is for the growing collection and the deeper work: more firearms, the detail-level clean, and the records a serious owner keeps. Pro is a one-time purchase. Everything you log stays on your device whether you upgrade or not.';
const COMPANY = 'Fieldstrip is available for iPhone and iPad on the App Store and for Android on Google Play. For product questions, partnership inquiries, or press, reach us any time at contact@fieldstripllc.com.';
const TRADEMARKS = 'iPhone and iPad are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of Apple Inc. Android and Google Play are trademarks of Google LLC.';

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => existsSync(p));
const root = resolve('.');
let failed = 0;
const ok = (cond, what, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${what}${detail ? '  (' + detail + ')' : ''}`);
  if (!cond) failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hostOf = u => { try { return new URL(u).hostname; } catch { return ''; } };

// 1. Serve this folder (or use the given address). /get is answered from get.html with no extra hop, as the live host does.
let base = process.argv[2];
let server;
if (!base) {
  const types = { '.html': 'text/html', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.png': 'image/png', '.ico': 'image/x-icon', '.css': 'text/css', '.js': 'text/javascript' };
  const files = new Map();
  server = createServer((req, res) => {
    let p = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!extname(p) && !existsSync(p) && existsSync(p + '.html')) p += '.html';
    if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    if (!files.has(p)) files.set(p, readFileSync(p));
    const data = files.get(p);
    const size = data.length;
    const type = types[extname(p)] || 'application/octet-stream';
    const range = req.headers.range && req.headers.range.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const s = +range[1] || 0, e = range[2] ? Math.min(+range[2], size - 1) : size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
      return res.end(data.subarray(s, e + 1));
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
    res.end(data);
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const here = readdirSync(root).filter(f => f.endsWith('.html')).sort().join(', ');
  ok(here === 'get.html, index.html, privacy.html, support.html, terms.html', 'every page in the folder is on this check\'s list', here);
}
base = base.replace(/\/$/, '');
const baseHost = hostOf(base);
console.log(`Checking ${base}`);

// 2. The pages as they are served: what is written in them.
const src = {};
for (const path of PAGES) {
  const r = await fetch(base + path, { redirect: 'manual' }).catch(e => ({ status: String(e) }));
  const type = r.headers ? (r.headers.get('content-type') || '') : '';
  src[path] = r.status === 200 ? await r.text() : '';
  ok(r.status === 200 && type.startsWith('text/html'), path === '/get' ? '/get answers as typed (no ".html", no slash on the end), with no extra hop' : `${path} is served`, `HTTP ${r.status}`);
}
const home = src['/'], get = src['/get'];
const metas = html => Object.fromEntries([...html.matchAll(/<meta\s+(?:name|property)="([^"]+)"\s+content="([^"]*)"\s*>/g)].map(m => [m[1], m[2]]));
const words = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

// b. Apple's own App Store strip: in the head of the home page only.
const strip = [...home.matchAll(/<meta\s+name="apple-itunes-app"\s+content="([^"]*)"\s*>/g)];
ok(strip.length === 1 && strip[0][1] === `app-id=${APP_ID}` && strip[0].index < home.indexOf('</head>'), `b. home page head carries the App Store strip tag with app-id=${APP_ID}`, strip.map(m => m[1]).join(' , ') || 'no tag');
ok(PAGES.slice(1).every(p => !/apple-itunes-app/i.test(src[p])), 'b. no other page carries the strip tag');

// c. The retired phrases are in no page (any letter case, comments and all); the parked Play comment is gone, the other parked block is not.
for (const phrase of ['free to start', 'native Android build']) {
  const re = new RegExp(phrase.replace(/ /g, '\\s+'), 'i');
  const hits = PAGES.filter(p => re.test(src[p]) || re.test(src[p].replace(/<[^>]*>/g, ' ')));
  ok(!hits.length, `c. "${phrase}" appears in no page`, hits.length ? 'found in ' + hits.join(', ') : `${PAGES.length} pages searched, any letter case`);
}
ok(!/PLAY_LISTING_URL|PARKED until the Play listing/i.test(home), 'c. the parked Play listing comment is gone from the home page');
ok(home.includes('<!-- PARKED until app.fieldstripapp.com answers: uncomment to go live.'), 'c. the other parked block (app.fieldstripapp.com) is still there');

// The two store addresses are spelled exactly, everywhere they are written; no app-only addresses.
for (const path of PAGES) {
  const found = src[path].match(/(?:https?:)?\/\/[a-z0-9.-]*(?:apple\.com|play\.google\.com)[^"'\s<)]*/gi) || [];
  const wrong = found.filter(u => u !== APPLE && u !== GOOGLE);
  if (found.length || path === '/' || path === '/get') ok(!wrong.length && (found.length > 0 || path.endsWith('.html')), `${path}: every store address is one of the two, spelled exactly`, wrong.length ? 'wrong: ' + wrong.join(' , ') : `${found.length} written`);
  ok(!/market:\/\/|intent:\/\//i.test(src[path]), `${path}: no market:// or intent:// address`);
  ok(!/\$\s?\d|coming soon/i.test(words(src[path])), `${path}: no price and no "coming soon"`);
}

// The link preview tags, on the home page and on /get. The home page keeps its own title and description.
for (const [path, html, url] of [['/', home, 'https://fieldstripapp.com/'], ['/get', get, 'https://fieldstripapp.com/get']]) {
  const m = metas(html);
  ok(m['og:title'] === CARD_TITLE && m['twitter:title'] === CARD_TITLE, `${path}: link preview title is "${CARD_TITLE}"`, String(m['og:title']));
  ok(m['og:description'] === DESC && m['twitter:description'] === DESC && m.description === DESC, `${path}: link preview line is the home page's description, word for word`);
  ok(m['og:image'] === CARD_PICTURE && m['twitter:image'] === CARD_PICTURE && m['twitter:card'] === 'summary_large_image', `${path}: link preview picture is the closed safe door`, String(m['og:image']));
  ok(m['og:url'] === url, `${path}: og:url is ${url}`, String(m['og:url']));
}
ok((home.match(/<title>([^<]*)<\/title>/) || [])[1] === HOME_TITLE, 'home page title is unchanged');
ok(/(^|,)\s*noindex\s*(,|$)/.test(metas(get).robots || ''), '/get asks search engines not to list it', `robots: ${metas(get).robots}`);
{
  const r = await fetch(`${base}/assets/fieldstrip-home-poster.jpg`).catch(e => ({ status: String(e) }));
  const b = r.status === 200 ? Buffer.from(await r.arrayBuffer()) : Buffer.alloc(0);
  let size = null;
  for (let i = 2; i + 9 < b.length && b[i] === 0xFF;) { const k = b[i + 1]; if (k >= 0xC0 && k <= 0xCF && k !== 0xC4 && k !== 0xC8 && k !== 0xCC) { size = `${b.readUInt16BE(i + 7)}x${b.readUInt16BE(i + 5)}`; break; } i += 2 + b.readUInt16BE(i + 2); }
  ok(size === '1280x720', 'the link preview picture is in the site at 1280 by 720', `HTTP ${r.status}, ${size}`);
}

// /get as written: the deciding script is first in the head, it is the only script, and it leaves by location.replace.
{
  const head = get.slice(0, Math.max(0, get.indexOf('</head>')));
  const at = head.indexOf('<script>');
  const ahead = at < 0 ? '?' : head.slice(0, at).replace(/<!DOCTYPE html>|<html[^>]*>|<head>|<meta charset="utf-8">|\s/gi, '');
  ok(at > 0 && ahead === '', 'the deciding script sits in the head before the fonts and everything else (only the charset line is ahead of it)', ahead ? 'ahead of it: ' + ahead.slice(0, 80) : '');
  ok((get.match(/<script/g) || []).length === 1 && !/<script[^>]+src=/i.test(get), '/get has one small script of its own and no outside script');
  const code = ((get.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/location\.replace\(to\)/.test(code) && !/location\.href\s*=|location\s*=[^=]|location\.assign|window\.open|\.click\(|history\./.test(code) && !/http-equiv/i.test(get),
    'f. the hop is written as location.replace, and the page has no other way of leaving by itself');
  ok(!/document\.cookie|localStorage|sessionStorage|indexedDB|caches\.|serviceWorker|sendBeacon|fetch\(|XMLHttpRequest|new Image|WebSocket/.test(get), 'e. /get has no code that sets a cookie, writes to storage or sends anything');
  const named = [...new Set((get.match(/https?:\/\/[^/"'\s<)]+/g) || []).map(hostOf))];
  ok(named.every(h => h === 'fieldstripapp.com' || FONT_HOSTS.includes(h) || STORE_HOSTS.includes(h)), 'e. /get names no host but the site itself, the font hosts and the two stores', named.join(', '));
}

// 3. Headless Chrome. Runs in the page: the store buttons, the footer, and whether anything scrolls sideways.
async function lookAtPage() {
  await document.fonts.ready;
  const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const look = (el, keys) => { const cs = getComputedStyle(el); return keys.map(k => cs[k]).join(' | '); };
  const links = [...document.querySelectorAll('a[href]')].filter(a => /apple\.com|play\.google|^market:|^intent:/i.test(a.getAttribute('href')));
  const buttons = links.map(a => {
    const r = box(a);
    const onScreen = scrollY === 0 && r.t >= 0 && r.l >= 0 && r.b <= innerHeight && r.r <= innerWidth;
    const crossing = [...document.body.querySelectorAll('*')].filter(el => !el.contains(a) && !a.contains(el)).filter(el => {
      const q = el.getBoundingClientRect();
      return q.width > 0 && q.height > 0 && q.left < r.r - .5 && q.right > r.l + .5 && q.top < r.b - .5 && q.bottom > r.t + .5;
    }).map(el => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''));
    const onTop = onScreen ? [[.5, .5], [.06, .15], [.94, .15], [.06, .85], [.94, .85]].every(([x, y]) => { const el = document.elementFromPoint(r.l + r.w * x, r.t + r.h * y); return !!el && a.contains(el); }) : null;
    const line = el => {
      if (!el) return null;
      const g = document.createRange(); g.selectNodeContents(el);
      const t = box(g), cs = getComputedStyle(el), size = parseFloat(cs.fontSize);
      return { text: el.textContent, drawn: el.innerText, transform: cs.textTransform, caps: cs.fontVariantCaps, size,
        whole: t.w > 0 && t.l >= r.l + 1 && t.r <= r.r - 1 && t.t >= r.t + 1 && t.b <= r.b - 1 && t.h <= size * 1.7 && el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1 };
    };
    const name = a.querySelector('.storename'), sub = a.querySelector('.storefor');
    return { href: a.getAttribute('href'), label: a.getAttribute('aria-label'), target: a.getAttribute('target'), box: r, onScreen, crossing, onTop,
      shown: r.w > 0 && r.h > 0 && getComputedStyle(a).visibility === 'visible' && +getComputedStyle(a).opacity > 0,
      whole: a.scrollWidth <= a.clientWidth + 1 && a.scrollHeight <= a.clientHeight + 1, name: line(name), sub: line(sub),
      look: [look(a, ['backgroundColor', 'color', 'fontFamily', 'borderTopColor', 'borderTopWidth', 'borderRadius', 'paddingTop', 'paddingLeft', 'minHeight', 'textAlign', 'textDecorationLine']),
        name ? look(name, ['fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'textTransform']) : '', sub ? look(sub, ['fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'textTransform']) : '', Math.round(r.w) + 'x' + Math.round(r.h)].join(' || ') };
  });
  const row = document.querySelector('footer .footrow'), tm = document.querySelector('footer .tmline');
  return { buttons, sideways: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    footer: { row: row ? row.textContent : null, tm: tm ? tm.textContent : null, below: !!(row && tm) && box(tm).t >= box(row).b,
      quiet: !!(row && tm) && parseFloat(getComputedStyle(tm).fontSize) < parseFloat(getComputedStyle(row).fontSize) && getComputedStyle(tm).color === getComputedStyle(row).color } };
}
// Runs in the home page: where the row sits, that the video box does not move for it, the strip tag and the two sentences.
function lookAtHome() {
  const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, b: r.bottom }; };
  const row = document.querySelector('.stores'), reel = document.querySelector('.reel'), video = document.querySelector('.reel video'), h1 = document.querySelector('.hero h1');
  const out = { row: !!(row && reel && video && h1) };
  if (out.row) {
    out.afterVideo = row.previousElementSibling === reel;
    out.beforeHeadline = row.nextElementSibling === h1.closest('.hero') && /^A record of your safe/i.test(h1.textContent);
    out.gap = box(row).t - box(reel).b;
    const cs = getComputedStyle(row);
    out.room = box(row).h + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    const v1 = box(video), y1 = box(h1).t;
    row.style.display = 'none';
    const v0 = box(video), y0 = box(h1).t;
    row.style.display = '';
    out.video = [v1.l, v1.t, v1.w, v1.h].map(n => Math.round(n * 10) / 10).join(' ');
    out.videoWithoutRow = [v0.l, v0.t, v0.w, v0.h].map(n => Math.round(n * 10) / 10).join(' ');
    out.shift = y1 - y0;
  }
  out.strip = [...document.head.querySelectorAll('meta[name="apple-itunes-app"]')].map(m => m.getAttribute('content'));
  const lead = document.querySelector('#pricing .tierlead'), bold = lead && lead.querySelector('strong');
  out.lead = lead ? lead.textContent : null;
  out.leadBold = bold ? bold.textContent : null;
  out.company = [...document.querySelectorAll('#company p')].map(p => p.textContent);
  return out;
}
// Runs in /get: what the page shows when it does not hop.
function lookAtGet() {
  const isHome = a => { const u = new URL(a.href); return u.origin === location.origin && (u.pathname === '/' || u.pathname === '/index.html') && !u.search && !u.hash; };
  const mark = document.querySelector('header .wordmark'), h1 = document.querySelectorAll('h1');
  const about = [...document.querySelectorAll('main a')].filter(a => a.textContent.trim() === 'About Fieldstrip');
  return { path: location.pathname + location.search, ua: navigator.userAgent, touch: navigator.maxTouchPoints,
    wordmark: !!mark && mark.tagName === 'A' && isHome(mark) && mark.textContent.trim() === 'FIELDSTRIP',
    h1: [...h1].map(h => h.textContent).join(' / '),
    about: about.length === 1 && isHome(about[0]),
    media: document.querySelectorAll('video, audio, img, picture, iframe, object, embed, canvas').length,
    text: document.body.innerText, cookie: document.cookie, local: localStorage.length, session: sessionStorage.length };
}

if (!CHROME) {
  console.log('SKIP  no Chrome found for the render check');
  failed++;
} else {
  const profile = mkdtempSync(join(tmpdir(), 'fs-check-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    `--host-resolver-rules=${STORE_HOSTS.map(h => `MAP ${h} ~NOTFOUND`).join(', ')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  process.on('exit', () => { try { chrome.kill(); } catch {} });   // only the one Chrome this check started
  const port = await new Promise((res, rej) => {
    let b = '';
    chrome.stderr.on('data', d => { b += d; const m = b.match(/127\.0\.0\.1:(\d+)/); if (m) res(+m[1]); });
    setTimeout(() => rej(new Error('Chrome did not start')), 20000);
  });
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let id = 0;
  const pending = new Map();
  const waiters = new Set();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { const cb = pending.get(m.id); pending.delete(m.id); if (cb) cb(m); } else waiters.forEach(w => w(m));
  };
  const send = (method, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  const event = (name, ms = 20000) => new Promise(res => {
    const w = m => { if (m.method === name) { clearTimeout(t); waiters.delete(w); res(m); } };
    const t = setTimeout(() => { waiters.delete(w); res(null); }, ms);
    waiters.add(w);
  });

  // Every request is looked at before it leaves. The site itself and the two font hosts go through; everything else is refused here.
  let asked = [];
  let refused = 0;
  waiters.add(m => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { url, headers } = m.params.request;
    const host = hostOf(url);
    if (/^https?:/.test(url)) asked.push({ url, host, ua: headers['User-Agent'] });
    if (!/^https?:/.test(url) || host === baseHost || FONT_HOSTS.includes(host)) send('Fetch.continueRequest', { requestId: m.params.requestId });
    else { refused++; send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }); }
  });
  await send('Page.enable');
  await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  const PLAIN = (await evaluate('navigator.userAgent')).replace('HeadlessChrome', 'Chrome');
  const SIZES = { phone: [390, 844, true], sideways: [844, 390, true], tablet: [820, 1180, true], computer: [1440, 900, false] };
  const visit = async (url, o = {}) => {
    const [w, h, mobile] = Array.isArray(o.size) ? o.size : SIZES[o.size || 'computer'];
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await send('Emulation.setUserAgentOverride', { userAgent: o.ua || PLAIN, platform: o.platform || 'Win32' });
    await send('Emulation.setTouchEmulationEnabled', o.touch ? { enabled: true, maxTouchPoints: o.touch } : { enabled: false });
    await send('Emulation.setScriptExecutionDisabled', { value: !!o.scriptsOff });
    asked = [];
    const loaded = event('Page.loadEventFired');
    await send('Page.navigate', { url });
    await loaded;
    await sleep(300);
    return asked.slice();
  };
  const exact = b => b.length === 2 && b[0].href === APPLE && b[1].href === GOOGLE;
  const drawn = (b, i) => { const [n, s] = i ? ['Google Play', 'Android'] : ['App Store', 'iPhone and iPad']; return !!b && !!b.name && !!b.sub && b.name.text === n && b.name.drawn === n && b.name.transform === 'none' && b.name.caps === 'normal' && b.sub.text === s && b.sub.drawn === s; };
  const looks = {};

  // a. The home page, at the three ordered sizes: the two buttons are fully on the first screen.
  for (const [name, size] of [['phone upright 390x844', 'phone'], ['tablet upright 820x1180', 'tablet'], ['desktop 1440x900', 'computer']]) {
    const reqs = await visit(`${base}/?check=${Date.now()}`, { size });
    const p = await evaluate(`(async () => ({ page: await (${lookAtPage})(), home: (${lookAtHome})() }))()`);
    if (!p) { ok(false, `a. ${name}: the home page could be read`); continue; }
    const b = p.page.buttons, h = p.home, vh = SIZES[size][1];
    looks[size] = b.map(x => x.look).join(' ## ');
    ok(exact(b), `a. ${name}: exactly one link to the Apple address and one to the Google address, spelled exactly, Apple's first`, b.map(x => x.href).join(' , ') || 'no store link');
    if (b.length !== 2) continue;
    const side = Math.abs(b[0].box.t - b[1].box.t) < 1 && b[0].box.r <= b[1].box.l, stacked = b[0].box.b <= b[1].box.t && Math.abs(b[0].box.l - b[1].box.l) < 1;
    ok(b.every(x => x.shown && x.onScreen), `a. ${name}: both buttons are fully on the first screen`, `buttons end at ${Math.round(Math.max(b[0].box.b, b[1].box.b))}px of ${vh}px, ${side ? 'side by side' : stacked ? 'stacked' : 'NOT in a row'}`);
    ok(b.every(x => x.box.h >= 44), `a. ${name}: each button is at least 44 px tall`, b.map(x => `${Math.round(x.box.w)}x${Math.round(x.box.h)}`).join(' and '));
    ok((side || stacked) && b.every(x => !x.crossing.length && x.onTop), `a. ${name}: the buttons overlap neither each other nor anything else`, b.flatMap(x => x.crossing).join(', '));
    ok(b.every(x => x.whole && x.name && x.name.whole && x.sub && x.sub.whole), `a. ${name}: no text is cut off`);
    ok(p.page.sideways <= 0, `a. ${name}: nothing scrolls sideways`);
    ok(drawn(b[0], 0) && drawn(b[1], 1), `a. ${name}: the names are drawn "App Store" and "Google Play", not in capitals`, b.map(x => x.name ? `"${x.name.drawn}"` : 'no name').join(' and '));
    ok(b[0].label === 'Fieldstrip on the App Store' && b[1].label === 'Fieldstrip on Google Play' && b.every(x => x.target === null), `a. ${name}: each link has its spoken name and opens in the same tab`);
    ok(h.row && h.afterVideo && h.beforeHeadline && h.gap >= 0 && h.gap <= 40, `a. ${name}: the row sits directly under the video and above the headline`, `${Math.round(h.gap)}px under the video`);
    ok(h.row && h.video === h.videoWithoutRow && Math.abs(h.shift - h.room) < 0.5, `a. ${name}: the video box keeps its place and size; the headline moves down only by the row's own room`, `video box ${h.video}; headline down ${Math.round(h.shift)}px`);
    ok(reqs.every(r => r.host === baseHost || FONT_HOSTS.includes(r.host)), `a. ${name}: the home page asks neither store for anything`, [...new Set(reqs.map(r => r.host))].join(', '));
    if (size === 'computer') {
      ok(h.strip.length === 1 && h.strip[0] === `app-id=${APP_ID}`, 'b. the strip tag is in the head as the browser reads it', h.strip.join(' , '));
      ok(h.lead === LEAD && h.leadBold === LEAD_BOLD, 'c. Free & Pro: the bold opening reads "Your records never leave your phone. No subscription." and the rest of the paragraph is as it was');
      ok(h.company[1] === COMPANY, 'c. The company: "Fieldstrip is available for iPhone and iPad on the App Store and for Android on Google Play." and the rest of the paragraph is as it was');
      ok(p.page.footer.tm === TRADEMARKS && p.page.footer.below && p.page.footer.quiet && /©/.test(p.page.footer.row || ''), 'home page footer: the trademark line, small and quiet, under the row with the copyright line');
    }
  }
  // Phone sideways: directly under the video (they need not be on the first screen). Two narrower phones, not ordered, checked anyway.
  for (const [name, size] of [['phone sideways 844x390', 'sideways'], ['narrower phone 360x740', [360, 740, true]], ['narrowest phone 320x568', [320, 568, true]]]) {
    await visit(`${base}/?check=${Date.now()}`, { size });
    const p = await evaluate(`(async () => ({ page: await (${lookAtPage})(), home: (${lookAtHome})() }))()`);
    const b = p ? p.page.buttons : [], h = p ? p.home : {};
    ok(exact(b) && h.afterVideo && h.beforeHeadline && h.gap >= 0 && h.gap <= 40 && b.every(x => x.box.h >= 44 && !x.crossing.length && x.whole && x.name && x.name.whole && x.sub && x.sub.whole) && p.page.sideways <= 0 && drawn(b[0], 0) && drawn(b[1], 1),
      `a. ${name}: the buttons sit directly under the video, 44 px or taller, nothing overlapping, cut off or scrolling sideways`, b.length === 2 ? `${b.map(x => `${Math.round(x.box.w)}x${Math.round(x.box.h)}`).join(' and ')}, ${Math.abs(b[0].box.t - b[1].box.t) < 1 ? 'side by side' : 'stacked'}` : 'buttons missing');
  }

  // d. fieldstripapp.com/get: where each kind of browser is sent. First, what the page shows when it stays.
  const getAsked = [];
  let stays = 0, hops = 0, clean = true;
  const showsBoth = async () => {
    const p = await evaluate(`(async () => ({ page: await (${lookAtPage})(), get: (${lookAtGet})() }))()`);
    if (p) clean = clean && p.get.cookie === '' && p.get.local === 0 && p.get.session === 0;
    return p && { ...p, both: exact(p.page.buttons) && p.page.buttons.every(x => x.shown && x.onScreen && x.onTop && x.box.h >= 44) };
  };
  for (const [name, size] of [['as a computer sees it', 'computer'], ['as a phone sees it with ?stay=1', 'phone']]) {
    const phone = size === 'phone';
    getAsked.push(...await visit(`${base}/get${phone ? '?stay=1' : ''}`, phone ? { size, touch: 5, platform: 'iPhone', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' } : { size }));
    const p = await showsBoth();
    if (!p) { ok(false, `/get ${name}: the page could be read`); continue; }
    stays++;
    const b = p.page.buttons, g = p.get, f = p.page.footer;
    looks['get-' + size] = b.map(x => x.look).join(' ## ');
    ok(g.wordmark, `/get ${name}: the FIELDSTRIP header, with the wordmark linking to the home page`);
    ok(g.h1 === 'Get Fieldstrip', `/get ${name}: the heading is "Get Fieldstrip"`, g.h1);
    ok(p.both && b.every(x => !x.crossing.length && x.whole && x.name && x.name.whole && x.sub && x.sub.whole) && p.page.sideways <= 0, `/get ${name}: both store buttons, on the first screen, 44 px or taller, nothing overlapping, cut off or scrolling sideways`, b.map(x => `${Math.round(x.box.w)}x${Math.round(x.box.h)}`).join(' and '));
    ok(drawn(b[0], 0) && drawn(b[1], 1) && b.length === 2 && b[0].label === 'Fieldstrip on the App Store' && b[1].label === 'Fieldstrip on Google Play' && b.every(x => x.target === null), `/get ${name}: the names are drawn "App Store" and "Google Play", each link has its spoken name and opens in the same tab`);
    ok(looks['get-' + size] === looks[size], `/get ${name}: the buttons look the same as on the home page`, looks['get-' + size] === looks[size] ? '' : `home ${looks[size]} ; get ${looks['get-' + size]}`);
    ok(g.about, `/get ${name}: a link "About Fieldstrip" to the home page`);
    ok(f.tm === TRADEMARKS && f.below && f.quiet && /©/.test(f.row || ''), `/get ${name}: the footer, with the trademark line under the row with the copyright line`);
    ok(g.media === 0 && !/\$|coming soon|\b\d{1,2}\/\d{1,2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d/i.test(g.text) && !/\d/.test(g.text.replace(/© 2026/g, '')), `/get ${name}: no video, no picture, no price, no dates, no "coming soon"`);
  }

  // f. Come from another page of the site, open /get as an iPhone, and look at the browser's history after the hop.
  await visit(`${base}/support.html`);
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
  getAsked.push(...await visit(`${base}/get`, { size: 'phone', touch: 5, platform: 'iPhone', ua: `${IPHONE} Version/18.5 Mobile/15E148 Safari/604.1` }));
  const hist = ((await send('Page.getNavigationHistory')).result || { entries: [] });
  const urls = hist.entries.map(e => e.url);
  ok(hist.currentIndex === urls.length - 1 && urls[hist.currentIndex] === APPLE && urls[hist.currentIndex - 1] === `${base}/support.html`,
    'f. after the hop the history holds no /get entry: Back goes to where the visitor came from', urls.slice(-2).join(' -> '));

  const ANDROID = 'AppleWebKit/537.36 (KHTML, like Gecko)';
  const CASES = [
    // what it is, how the browser describes itself, touch points, navigator.platform, size, where it must go, address, scripts off
    ['iPhone Safari', `${IPHONE} Version/18.5 Mobile/15E148 Safari/604.1`, 5, 'iPhone', 'phone', APPLE],
    ['iPhone inside the Facebook app', `${IPHONE} Mobile/22F76 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBBV/745581204;FBDV/iPhone16,2;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5;FBRV/748304466;IABMV/1]`, 5, 'iPhone', 'phone', APPLE],
    ['iPhone inside the Instagram app', `${IPHONE} Mobile/22F76 Instagram 385.0.0.27.94 (iPhone16,2; iOS 18_5; en_US; en; scale=3.00; 1290x2796; 748582229)`, 5, 'iPhone', 'phone', APPLE],
    ['iPod touch', 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1', 5, 'iPod', 'phone', APPLE],
    ['an iPad that says iPad', 'Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1', 5, 'iPad', 'tablet', APPLE],
    ['an iPad that says Macintosh, with touch', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15', 5, 'MacIntel', 'tablet', APPLE],
    ['Android phone Chrome', `Mozilla/5.0 (Linux; Android 10; K) ${ANDROID} Chrome/141.0.0.0 Mobile Safari/537.36`, 5, 'Linux armv81', 'phone', GOOGLE],
    ['Android tablet Chrome', `Mozilla/5.0 (Linux; Android 10; K) ${ANDROID} Chrome/141.0.0.0 Safari/537.36`, 5, 'Linux armv81', 'tablet', GOOGLE],
    ['Android inside the Facebook app', `Mozilla/5.0 (Linux; Android 15; SM-S928U Build/AP3A.240905.015.A2; wv) ${ANDROID} Version/4.0 Chrome/141.0.7390.43 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/520.0.0.56.73;IABMV/1;]`, 5, 'Linux armv81', 'phone', GOOGLE],
    ['Samsung Internet', `Mozilla/5.0 (Linux; Android 10; K) ${ANDROID} SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36`, 5, 'Linux armv81', 'phone', GOOGLE],
    ['Windows Chrome', `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${ANDROID} Chrome/141.0.0.0 Safari/537.36`, 0, 'Win32', 'computer', 'stay'],
    ['Mac Safari with no touch', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15', 0, 'MacIntel', 'computer', 'stay'],
    ['Windows Firefox', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0', 0, 'Win32', 'computer', 'stay'],
    ['Facebook\'s link reader (facebookexternalhit)', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 0, '', 'computer', 'stay'],
    ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 0, '', 'computer', 'stay'],
    ['Googlebot reading as an Android phone', `Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) ${ANDROID} Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)`, 5, 'Linux armv81', 'phone', 'stay'],
    ['a link reader on an iPhone that says Macintosh, with touch (the Messages preview)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0', 5, 'MacIntel', 'phone', 'stay'],
    ['an iPhone with ?stay=1', `${IPHONE} Version/18.5 Mobile/15E148 Safari/604.1`, 5, 'iPhone', 'phone', 'stay', '/get?stay=1'],
    ['an Android phone with ?stay=1', `Mozilla/5.0 (Linux; Android 10; K) ${ANDROID} Chrome/141.0.0.0 Mobile Safari/537.36`, 5, 'Linux armv81', 'phone', 'stay', '/get?stay=1'],
    ['scripts switched off, on an iPhone', `${IPHONE} Version/18.5 Mobile/15E148 Safari/604.1`, 5, 'iPhone', 'phone', 'stay', '/get', true],
    ['scripts switched off, on an Android phone', `Mozilla/5.0 (Linux; Android 10; K) ${ANDROID} Chrome/141.0.0.0 Mobile Safari/537.36`, 5, 'Linux armv81', 'phone', 'stay', '/get', true],
  ];
  for (const [name, ua, touch, platform, size, goes, path = '/get', scriptsOff = false] of CASES) {
    const reqs = await visit(base + path, { ua, touch, platform, size, scriptsOff });
    getAsked.push(...reqs);
    const store = reqs.filter(r => STORE_HOSTS.includes(r.host)).map(r => r.url);
    const saidSo = reqs.some(r => r.url === base + path && r.ua === ua);   // the browser really described itself this way
    if (goes === 'stay') {
      const p = await showsBoth();
      stays++;
      ok(saidSo && store.length === 0 && !!p && p.get.path === path && p.both && (scriptsOff || (p.get.ua === ua && p.get.touch === touch)), `d. ${name}: stays, with both buttons ${scriptsOff ? 'there' : 'showing'}`,
        store.length ? 'tried to go to ' + store.join(' , ') : !saidSo ? 'the browser did not describe itself as asked' : p && !p.both ? 'the two buttons are not both showing' : '');
    } else {
      hops++;
      ok(saidSo && store.length === 1 && store[0] === goes, `d. ${name}: goes to the ${goes === APPLE ? 'Apple' : 'Google'} address, exactly`, store.length ? store.join(' , ') : 'stayed on the page');
    }
  }

  // e. Across every visit to /get above: which hosts were asked, and what the browser holds for the site afterwards.
  const hosts = [...new Set(getAsked.map(r => r.host))];
  const toStores = getAsked.filter(r => STORE_HOSTS.includes(r.host)).length;
  ok(hosts.every(h => h === baseHost || FONT_HOSTS.includes(h) || STORE_HOSTS.includes(h)) && toStores === hops + 1,
    'e. /get asks for nothing from any host but the site itself, the font hosts and the one store hop', `${hosts.join(', ')}; ${hops + 1} hops, one store request each; ${stays} visits that stayed, none`);
  await visit(`${base}/get?stay=1`);
  const kept = await evaluate(`(async () => ({ cookie: document.cookie, local: localStorage.length, session: sessionStorage.length,
    idb: self.indexedDB && indexedDB.databases ? (await indexedDB.databases()).length : 0, caches: self.caches ? (await caches.keys()).length : 0,
    workers: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0 }))()`) || {};
  const cookies = ((await send('Network.getCookies', { urls: [`${base}/get`, `${base}/`] })).result || { cookies: [{}] }).cookies;
  const usage = ((await send('Storage.getUsageAndQuota', { origin: base })).result || { usage: -1 }).usage;
  ok(clean && cookies.length === 0 && kept.cookie === '' && kept.local === 0 && kept.session === 0 && kept.idb === 0 && kept.caches === 0 && kept.workers === 0 && usage === 0,
    'e. /get sets no cookie and writes nothing to storage', `after all ${stays + hops + 2} visits the browser holds ${cookies.length} cookies and ${usage} bytes for the site`);
  console.log(`      (${refused} request${refused === 1 ? '' : 's'} to a store were asked for and refused inside this check; none left the PC)`);

  ws.close();
  chrome.kill();
  await new Promise(r => { chrome.once('exit', r); setTimeout(r, 5000); });
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}
if (server) server.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll store link checks passed');
process.exit(failed ? 1 : 0);
