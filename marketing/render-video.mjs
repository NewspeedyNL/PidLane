// Neemt marketing/tiktok.html frame voor frame op en maakt er een MP4 van.
// gebruik: [PAGINA=andere.html] FFMPEG=/pad/naar/ffmpeg node marketing/render-video.mjs [uitvoer.mp4] [fps]
// Vereist een Chromium (headless_shell van Playwright of chromium in PATH) en een
// ffmpeg met libx264. Geen npm-pakketten: node praat zelf met het debugprotocol.
import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const uit = path.resolve(process.argv[2] || path.join(dir, 'pidlane-tiktok.mp4'));
const FPS = +(process.argv[3] || 30);
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
// Welke animatie: standaard tiktok.html, of PAGINA=pad/naar/film.html.
const pagina = path.resolve(process.env.PAGINA || path.join(dir, 'tiktok.html'));

function chromium() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = '/opt/pw-browsers/';
  if (existsSync(base)) {
    const d = readdirSync(base).find(x => x.startsWith('chromium_headless_shell'));
    if (d) { const sub = readdirSync(base + d).find(x => x.startsWith('chrome')); return base + d + '/' + sub + '/headless_shell'; }
  }
  return 'chromium';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 400);
const bin = chromium();
const extra = bin.endsWith('headless_shell') ? [] : ['--headless'];
const br = spawn(bin, [...extra, '--no-sandbox', '--hide-scrollbars', '--remote-debugging-port=' + port, 'about:blank'], { stdio: 'ignore' });

let tgt;
for (let i = 0; i < 60 && !tgt; i++) {
  try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { /* browser start nog op */ }
  if (!tgt) await sleep(200);
}
if (!tgt) { console.error('Chromium start niet (' + bin + ')'); br.kill(); process.exit(1); }

const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const wacht = {};
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wacht[m.id]) { wacht[m.id](m); delete wacht[m.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; wacht[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const js = async expr => { const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };

await cmd('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
await cmd('Page.enable');
await cmd('Page.navigate', { url: 'file://' + pagina + '?opname' });
await sleep(800);
const fonts = await js('document.fonts.ready.then(()=>[...document.fonts].filter(f=>f.status==="loaded").map(f=>f.family).join(", "))');
console.log('lettertypes:', fonts);
const duur = await js('DUUR');
const n = Math.round(duur * FPS);

const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', uit], { stdio: ['pipe', 'inherit', 'inherit'] });

for (let f = 0; f < n; f++) {
  await js(`render(${f / FPS})`);
  const r = await cmd('Page.captureScreenshot', { format: 'jpeg', quality: 95, clip: { x: 0, y: 0, width: 1080, height: 1920, scale: 1 } });
  const buf = Buffer.from(r.result.data, 'base64');
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (f % 60 === 0) process.stdout.write(`frame ${f}/${n}\n`);
}
ff.stdin.end();
const code = await new Promise(r => ff.on('close', r));
ws.close(); br.kill();
if (code !== 0) { console.error('ffmpeg stopte met code ' + code); process.exit(1); }
console.log('klaar:', uit, `(${n} frames, ${FPS} fps, ${duur} s)`);
