// ══════════════════════════════════════════════════════════════════
// test-hyperlanedeur.js — intro, inloggen en verbinden in de Hyperlane-look (29-10-2026)
// ──────────────────────────────────────────────────────────────────
// WAAROM
// De tunnel achter het inlog- en verbindscherm beweegt. Het lint dat hij
// vervangt stond met opzet stil: "dit scherm kan uren aan blijven staan".
// Die zorg blijft, dus elke beweging in het blok HYPERLANE-DEUR loopt een
// vast aantal keer en staat daarna stil, en minder beweging zet hem meteen
// stil. Een `infinite` die erin sluipt ziet niemand — tot de accu leeg is.
//
// Leest de echte pidlane.css en index.html; geen eigen kopie.
// TEGENPROEF: plmutate.sh zet de vloer op infinite en haalt de tunnel uit
// #lgWaveBg; beide maken deze test rood.
//
// Draaien vanuit public/:  node test-hyperlanedeur.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const CSS = fs.readFileSync(path.join(__dirname, 'pidlane.css'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const start = CSS.indexOf('/* ══ HYPERLANE-DEUR');
if (start < 0) { console.log('  FOUT blok HYPERLANE-DEUR niet gevonden in pidlane.css'); process.exit(1); }
const BLOK = CSS.slice(start);

// 1. De tunnel staat in de golflaag, dus onder inloggen én verbinden.
const laag = /<div id="lgWaveBg"[^]*?<div class="hlg"[^]*?<\/div><\/div>\s*$/m.exec(HTML.split('\n').find(r => r.startsWith('<div id="lgWaveBg"')) || '');
toets('de tunnel (.hlg) staat in #lgWaveBg', !!laag);
for (const deel of ['hlg-vloer', 'hlg-plafond', 'hlg-horizon', 'hlg-strepen'])
  toets('tunnel heeft ' + deel, !!laag && laag[0].includes(deel));

// 2. Elke animatie in het blok is eindig, en samen hooguit twee minuten.
const anims = [];
const re = /animation:\s*([^;}]+)/g;
let m;
while ((m = re.exec(BLOK))) {
  const w = m[1].trim();
  if (/^none/.test(w)) continue;
  anims.push(w);
}
toets('het blok heeft bewegingen', anims.length >= 6, anims.length + ' gevonden');
for (const w of anims) {
  const duur = parseFloat((/([\d.]+)s/.exec(w) || [])[1]);
  const delen = w.replace(/!important/, '').trim().split(/\s+/);
  const keer = parseFloat(delen[delen.length - 1]);
  const eindig = !/infinite/.test(w) && Number.isFinite(keer) && keer >= 1;
  toets('eindig: ' + delen[0], eindig, w);
  if (eindig) toets('stopt binnen 2 min: ' + delen[0], duur * keer <= 120, (duur * keer).toFixed(0) + ' s');
}

// 3. Minder beweging zet alles stil wat beweegt.
const rm = /@media \(prefers-reduced-motion:reduce\)\{([^]*?)\n\}/.exec(BLOK);
toets('er is een regel voor minder beweging', !!rm);
for (const sel of ['.hlg-vlak i', '.hlg-horizon', '.hlg-strepen b', '.ov#loginOv .modal::before', '.ov#loginOv .mbtn.p::after'])
  toets('minder beweging dekt ' + sel, !!rm && rm[1].includes(sel));

// 4. Het verbindscherm laat de app er niet doorheen als de tunnel uit staat:
//    de doorschijnende achtergrond geldt alleen zolang #lgWaveBg aan is.
toets('doorschijnend alleen boven de tunnel',
  /body:has\(#lgWaveBg:not\(\.off\)\) \.ov#connOv\{ background:rgba\(2,3,10,\.30\)/.test(BLOK));
const eigen = /\.ov#connOv\{ --bl[^}]*background:([^;]+);/.exec(BLOK);
toets('zonder tunnel is het verbindscherm dekkend', !!eigen && /rgba\(2,3,10,\.9\d\)/.test(eigen[1]), eigen && eigen[1]);

console.log(fouten ? '\n' + fouten + ' FOUT' : '\nAlles goed');
process.exit(fouten ? 1 : 0);
