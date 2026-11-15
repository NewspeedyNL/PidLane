// filmpje.js — gedeeld door de opnamescripts in marketing/ (15-11-2026)
//
//   neem(app, map, sec, fps, elkBeeld)  schermafdrukken → map/NNNN.png + tijden.json
//   beelden(map)                        [{pad, duur}] uit een opgenomen map
//   video(mappen, uitvoer, filter)      ffmpeg: de mappen achter elkaar, op echte snelheid
//   naastElkaar(links, rechts, uitvoer) twee mappen beeld voor beeld naast elkaar
//
// Echte snelheid: elk beeld staat even lang in beeld als het in de opname
// duurde (tijden.json). Haalt de browser minder beelden dan gevraagd, dan
// wordt de video niet sneller, alleen schokkeriger.
'use strict';
const path = require('path'), fs = require('fs'), { spawnSync } = require('child_process');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const z = ms => new Promise(r => setTimeout(r, ms));

async function neem(a, map, sec, fps, elkBeeld) {
  fs.mkdirSync(map, { recursive: true });
  const n = Math.max(1, Math.round(sec * fps)), t0 = Date.now(), ms = [];
  for (let i = 0; i < n; i++) {
    if (elkBeeld) await elkBeeld((Date.now() - t0) / 1000);
    await a.schermafdruk(path.join(map, String(i).padStart(4, '0') + '.png'));
    ms.push(Date.now() - t0);
    const rest = (i + 1) * 1000 / fps - (Date.now() - t0);
    if (rest > 0) await z(rest);
  }
  fs.writeFileSync(path.join(map, 'tijden.json'), JSON.stringify({ ms }));
  return ms;
}

function beelden(map) {
  const f = path.join(map, 'tijden.json');
  if (!fs.existsSync(f)) return null;
  const t = JSON.parse(fs.readFileSync(f, 'utf8')), ms = Array.isArray(t) ? t : t.ms;
  const png = fs.readdirSync(map).filter(x => /^\d+\.(png|jpg)$/.test(x)).sort();
  // een beeld staat in beeld tot het volgende; het laatste zo lang als het vorige (of 50 ms)
  return png.map((x, i) => ({ pad: path.resolve(map, x),
    duur: Math.max(.01, (i + 1 < ms.length ? ms[i + 1] - ms[i] : (i ? ms[i] - ms[i - 1] : 50)) / 1000) }));
}

function ff(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.error) throw new Error('ffmpeg niet gevonden (' + r.error.message + ') — zet FFMPEG=/pad/naar/ffmpeg');
  if (r.status !== 0) throw new Error('ffmpeg stopte met code ' + r.status);
}
function concat(lijst, doel) {
  fs.writeFileSync(doel, 'ffconcat version 1.0\n' + lijst.map(b => `file '${b.pad}'\nduration ${b.duur.toFixed(3)}`).join('\n') +
    `\nfile '${lijst[lijst.length - 1].pad}'\n`);
  return doel;
}
const X264 = ['-c:v', 'libx264', '-crf', '23', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an'];

function video(mappen, uitvoer, filter) {
  const lijst = [];
  for (const m of mappen) { const b = beelden(m); if (b) lijst.push(...b); else console.log('  LET OP  ' + m + ' heeft geen opname'); }
  if (!lijst.length) return console.log('  ' + path.basename(uitvoer) + ': niets om te maken');
  fs.mkdirSync(path.dirname(uitvoer), { recursive: true });
  const cat = concat(lijst, uitvoer + '.ffconcat');
  ff(['-f', 'concat', '-safe', '0', '-i', cat, '-vf', (filter ? filter + ',' : '') + 'fps=30', ...X264, uitvoer]);
  fs.rmSync(cat);
  console.log('  ' + path.basename(uitvoer) + ' — ' + lijst.reduce((s, b) => s + b.duur, 0).toFixed(1) + ' s');
}

/* Twee opnames die tegelijk liepen (zelfde aantal beelden, zelfde tijden)
   naast elkaar, met een kop boven elke helft. kop = {links, rechts}. */
function naastElkaar(links, rechts, uitvoer, kop, hoogte) {
  const L = [], R = [];
  for (const m of [].concat(links)) L.push(...(beelden(m) || []));
  for (const m of [].concat(rechts)) R.push(...(beelden(m) || []));
  if (!L.length || L.length !== R.length) throw new Error('naastElkaar: ' + L.length + ' tegen ' + R.length + ' beelden — moeten tegelijk opgenomen zijn');
  fs.mkdirSync(path.dirname(uitvoer), { recursive: true });
  const h = hoogte || 1600, font = ['/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'].find(f => fs.existsSync(f));
  const tekst = (t, x) => font && t ? `,drawtext=fontfile=${font}:text='${t.replace(/'/g, '')}':fontcolor=white:fontsize=${Math.round(h / 32)}:x=${x}:y=${Math.round(h / 40)}` : '';
  const kopH = kop ? Math.round(h / 12) : 0;
  const cl = concat(L, uitvoer + '.l.ffconcat'), cr = concat(R, uitvoer + '.r.ffconcat');
  ff(['-f', 'concat', '-safe', '0', '-i', cl, '-f', 'concat', '-safe', '0', '-i', cr, '-filter_complex',
    `[0:v]scale=-2:${h}[l];[1:v]scale=-2:${h}[r];[l][r]hstack=inputs=2:shortest=1,pad=iw+0:ih+${kopH}:0:${kopH}:color=0x0a0e17` +
    (kop ? tekst(kop.links, `w/4-text_w/2`) + tekst(kop.rechts, `3*w/4-text_w/2`) : '') + `,fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
    ...X264, uitvoer]);
  fs.rmSync(cl); fs.rmSync(cr);
  console.log('  ' + path.basename(uitvoer) + ' — ' + L.reduce((s, b) => s + b.duur, 0).toFixed(1) + ' s');
}

module.exports = { neem, beelden, video, naastElkaar, ff };
