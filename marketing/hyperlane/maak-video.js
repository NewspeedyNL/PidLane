// maak-video.js — van de opname (opname.js) naar de beelden voor de website
//
//   node marketing/hyperlane/maak-video.js [--toestel telefoon] [--breed 1280]
//
// Leest marketing/hyperlane/opname/<toestel>/, schrijft marketing/hyperlane/uit/:
//   hyperlane-scenes.mp4   alle scènes achter elkaar (de doorloop op de site)
//   hyperlane.mp4          de korte lus bovenaan: KORT hieronder
//   <scène>.webp           een stilstaand beeld per scène, uit het midden
//   hyperlane-poster.webp  het eerste beeld van hyperlane.mp4
//   standen|vormen|midden/<naam>.webp   de losse keuzes
// Elk beeld staat even lang in beeld als het in de opname duurde
// (tijden.json), dus de video loopt op echte snelheid, ook als de browser
// minder beelden haalde dan gevraagd. Op de site: 1280×546 (≈ 2,34:1).
// Overzetten naar PidLane-Pitch/img/hl/ doe je met de hand, na het kijken.
'use strict';
const path = require('path'), fs = require('fs'), { spawnSync } = require('child_process');
const arg = (n, std) => { const i = process.argv.indexOf('--' + n); return i < 0 ? std : (process.argv[i + 1] || std); };
const TOESTEL = arg('toestel', 'telefoon'), BREED = Number(arg('breed', 1280)), HOOG = Math.round(BREED * 546 / 1280 / 2) * 2;
const IN = path.join(__dirname, 'opname', TOESTEL), UIT = path.join(__dirname, 'uit');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
// De volgorde van de doorloop, en de scènes van de korte lus bovenaan.
const ALLE = ['opstart', 'koud', 'stil', 'launch', 'max', 'remmen', 'cruise', 'zen', 'bocht', 'sport', 'hitte'];
const KORT = ['opstart', 'launch', 'remmen', 'bocht', 'sport', 'cruise'];

if (!fs.existsSync(IN)) { console.log('Geen opname in ' + IN + ' — draai eerst opname.js'); process.exit(1); }
fs.mkdirSync(UIT, { recursive: true });
const kader = `scale=${BREED}:-2:flags=lanczos,crop=${BREED}:${HOOG}`;   // liggend bijsnijden tot de verhouding van de site

function ff(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.error) { console.log('ffmpeg niet gevonden (' + r.error.message + ') — zet FFMPEG=/pad/naar/ffmpeg'); process.exit(1); }
  if (r.status !== 0) { console.log('ffmpeg stopte met code ' + r.status); process.exit(1); }
}
function beelden(scene) {
  const map = path.join(IN, scene);
  if (!fs.existsSync(path.join(map, 'tijden.json'))) return null;
  const t = JSON.parse(fs.readFileSync(path.join(map, 'tijden.json'), 'utf8'));
  const ms = Array.isArray(t) ? t : t.ms;
  const png = fs.readdirSync(map).filter(f => /^\d+\.(png|jpg)$/.test(f)).sort();
  // een beeld staat in beeld tot het volgende; het laatste zo lang als het vorige (of 50 ms)
  return png.map((f, i) => ({ pad: path.join(map, f),
    duur: Math.max(.01, (i + 1 < ms.length ? ms[i + 1] - ms[i] : (i ? ms[i] - ms[i - 1] : 50)) / 1000) }));
}
function video(scenes, naam) {
  const lijst = [];
  for (const s of scenes) { const b = beelden(s); if (b) lijst.push(...b); else console.log('  LET OP  ' + s + ' ontbreekt in de opname'); }
  if (!lijst.length) { console.log('  ' + naam + ': niets om te maken'); return; }
  const cat = path.join(UIT, naam + '.ffconcat');
  fs.writeFileSync(cat, 'ffconcat version 1.0\n' + lijst.map(b => `file '${b.pad}'\nduration ${b.duur.toFixed(3)}`).join('\n') + `\nfile '${lijst[lijst.length - 1].pad}'\n`);
  ff(['-f', 'concat', '-safe', '0', '-i', cat, '-vf', kader + ',fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', '-an', path.join(UIT, naam + '.mp4')]);
  fs.rmSync(cat);
  console.log('  ' + naam + '.mp4 — ' + lijst.reduce((s, b) => s + b.duur, 0).toFixed(1) + ' s');
}
function stil(bron, doel) { ff(['-i', bron, '-vf', kader, '-q:v', '80', doel]); }

console.log(TOESTEL + ' → ' + UIT + ' (' + BREED + '×' + HOOG + ')');
video(ALLE, 'hyperlane-scenes');
video(KORT, 'hyperlane');
for (const s of ALLE) { const b = beelden(s); if (b) { stil(b[Math.floor(b.length * .6)].pad, path.join(UIT, s + '.webp')); console.log('  ' + s + '.webp'); } }
const eerste = beelden(KORT[0]); if (eerste) stil(eerste[0].pad, path.join(UIT, 'hyperlane-poster.webp'));
for (const groep of ['standen', 'vormen', 'midden']) {
  const map = path.join(IN, groep); if (!fs.existsSync(map)) continue;
  fs.mkdirSync(path.join(UIT, groep), { recursive: true });
  for (const f of fs.readdirSync(map).filter(f => f.endsWith('.png'))) stil(path.join(map, f), path.join(UIT, groep, f.replace('.png', '.webp')));
  console.log('  ' + groep + '/');
}
