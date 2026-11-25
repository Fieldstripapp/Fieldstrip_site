// Home page video check (added 2026-11-22). Run from the site folder:
//   node checks/home-video.mjs                           serves this folder itself and checks the page in headless Chrome
//   node checks/home-video.mjs https://fieldstripapp.com  the same checks against the live address
// Proves three things: the video box has area (a 16:9 box laid out before the file loads), the poster shows
// (the poster image loads at 1280x720), and the file loads (the video reports its own size and enough data to
// play). Also checks the attributes the page was ordered to carry and that nothing scrolls sideways.
// Changed 2026-11-24 (tidy-up): sideways is measured against the screen's own width as the page is laid out (clientWidth),
// not innerWidth, which Chrome stretches to a too-wide page's width when a phone screen is emulated; and the check
// removes its own scratch Chrome folder when it finishes, pass or fail.
// No dependencies: Node 22+ and the installed Chrome.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => existsSync(p));
const root = resolve('.');
const html = readFileSync(join(root, 'index.html'), 'utf8');
let failed = 0;
const ok = (cond, what, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${what}${detail ? '  (' + detail + ')' : ''}`);
  if (!cond) failed++;
};

// 1. The page carries the ordered video element, with the ordered attributes and no loop.
const tag = (html.match(/<video[^>]*>/) || [])[0] || '';
ok(tag, 'index.html has one video element', `${(html.match(/<video/g) || []).length} found`);
for (const a of ['autoplay', 'muted', 'playsinline', 'controls']) ok(new RegExp(`\\s${a}[\\s>]`).test(tag), `video has ${a}`);
ok(/preload="metadata"/.test(tag), 'video preloads metadata only');
ok(!/\sloop[\s>]/.test(tag), 'video does not loop');
const poster = (tag.match(/poster="([^"]+)"/) || [])[1];
const src = (tag.match(/src="([^"]+)"/) || [])[1];
ok(poster && existsSync(join(root, poster)), 'poster file is in the repository', poster);
ok(src && existsSync(join(root, src)), 'video file is in the repository', src && `${src}, ${(statSync(join(root, src)).size / 1e6).toFixed(1)} MB`);
ok(/\.reel video\{[^}]*aspect-ratio:16 \/ 9/.test(html), 'the box is a 16:9 box in CSS');

// 2. Serve this folder (or use the given address) and confirm both files load over HTTP.
let base = process.argv[2];
let server;
if (!base) {
  const types = { '.html': 'text/html', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.png': 'image/png', '.ico': 'image/x-icon', '.css': 'text/css', '.js': 'text/javascript' };
  server = createServer((req, res) => {
    const p = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    const data = readFileSync(p);
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
}
base = base.replace(/\/$/, '');
for (const [what, path, type] of [['poster', poster, 'image/'], ['video file', src, 'video/mp4']]) {
  const r = await fetch(`${base}/${path}`, { headers: { Range: 'bytes=0-1023' } }).catch(e => ({ status: String(e) }));
  const ctype = r.headers ? (r.headers.get('content-type') || '') : '';
  ok(r.status === 206 || r.status === 200, `${what} loads from ${base}`, `HTTP ${r.status}, ${ctype}`);
  if (r.headers) ok(ctype.startsWith(type), `${what} is served as ${type}`);
}

// 3. Render the page in headless Chrome at a phone size and a desktop size.
if (!CHROME) {
  console.log('SKIP  no Chrome found for the render check');
} else {
  const profile = mkdtempSync(join(tmpdir(), 'fs-check-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  // On every way out, pass or fail or stopped early: stop the one Chrome this check started, and remove its scratch folder.
  process.on('exit', () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {} });
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
  const waiters = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { const cb = pending.get(m.id); pending.delete(m.id); if (cb) cb(m); } else waiters.forEach(w => w(m));
  };
  const send = (method, params = {}) => new Promise(res => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  await send('Page.enable');
  for (const [name, w, h] of [['phone 390x844', 390, 844], ['desktop 1440x900', 1440, 900]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    const loaded = new Promise(r => waiters.push(m => { if (m.method === 'Page.loadEventFired') r(); }));
    await send('Page.navigate', { url: `${base}/index.html?check=${Date.now()}` });
    await loaded;
    const v = await evaluate(`(async () => {
      const v = document.querySelector('.reel video'); if (!v) return null;
      const r0 = v.getBoundingClientRect();
      const posterOk = await new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = v.poster; });
      for (let i = 0; i < 150 && v.readyState < 2; i++) await new Promise(r => setTimeout(r, 100));
      const r1 = v.getBoundingClientRect();
      return { box0: [Math.round(r0.width), Math.round(r0.height)], box1: [Math.round(r1.width), Math.round(r1.height)], posterOk,
        readyState: v.readyState, size: [v.videoWidth, v.videoHeight], paused: v.paused, muted: v.muted, error: v.error && v.error.code,
        sideways: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth, top: Math.round(r0.top) };
    })()`);
    ok(v, `${name}: video element rendered`);
    if (!v) continue;
    ok(v.box0[0] > 0 && v.box0[1] > 0 && Math.abs(v.box0[0] / v.box0[1] - 16 / 9) < 0.02, `${name}: the video box has area and is 16:9 before the file loads`, `${v.box0[0]}x${v.box0[1]}`);
    ok(v.box0[0] === v.box1[0] && v.box0[1] === v.box1[1], `${name}: the box keeps its size when the file loads`, `${v.box1[0]}x${v.box1[1]}`);
    ok(v.posterOk && v.posterOk[0] === 1280 && v.posterOk[1] === 720, `${name}: the poster shows (loads at 1280x720)`, String(v.posterOk));
    ok(v.readyState >= 2 && v.size[0] === 1280 && v.size[1] === 720 && !v.error, `${name}: the video file loads`, `readyState ${v.readyState}, ${v.size.join('x')}${v.error ? ', error ' + v.error : ''}`);
    ok(v.muted, `${name}: the sound is off`);
    ok(v.sideways <= 0, `${name}: nothing scrolls sideways`, v.sideways > 0 ? `${v.sideways}px wider than the screen` : '');
    ok(v.top < h, `${name}: the box starts on the first screen`, `top ${v.top}px of ${h}px`);
  }
  ws.close();
  chrome.kill();
  await new Promise(r => { chrome.once('exit', r); setTimeout(r, 5000); });
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}
if (server) server.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll home video checks passed');
process.exit(failed ? 1 : 0);
