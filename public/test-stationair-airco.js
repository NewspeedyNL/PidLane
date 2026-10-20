// ══════════════════════════════════════════════════════════════════
// test-stationair-airco.js — de STAT_RPM-watcher en zijn verdachtenlijst
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Op de rit van 27-08 meldde deze watcher twee keer "ruw stationair" (65 en
// 193 rpm, 33% en 50% richtingswisselingen). Het was de airco die in- en
// uitschakelde: de compressor koppelt in, het toerental zakt, de
// stationairregeling compenseert. De meting klopte, de conclusie eronder niet
// — en die conclusie ("valse lucht, bobine/bougie of stationairregeling")
// komt in een klantrapport terecht. Zie issue #30.
//
// WAT HIER GETOETST WORDT
// De watcher blijft vuren: 193 rpm schommeling ís er. Wat verandert is wat
// erbij staat. Deze test bewaakt drie dingen tegelijk:
//   1. hij vuurt nog steeds bij echt oscillerend stationair;
//   2. hij zwijgt nog steeds bij een wegzakkend fast-idle (die tegenproef zat
//      al in de code en mocht niet sneuvelen);
//   3. de melding noemt de airco vóór de dure verdachten;
//   4. (#567) een toerental dat na een stop wegzakt MET RUIS erop blijft
//      stil — de richtingstoets vangt alleen een zuivere daling.
//
// Punt 3 is de eigenlijke fix, en punt 2 is waarom het geen "drempel omhoog"
// is geworden: dan zou 193 rpm verdwijnen, maar echt ruw lopen ook.
//
// Draaien vanuit public/:  node test-stationair-airco.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── de watcher uit zijn bestand knippen ───────────────────────────
const bron = fs.readFileSync(__dirname + '/pidlane-watchers.js', 'utf8');
const van = bron.indexOf("{ id:'STAT_RPM'");
const tot = bron.indexOf("{ id:'STAT_MAP'");
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: de STAT_RPM-watcher is niet gevonden in pidlane-watchers.js.');
  process.exit(1);
}
// Tot en met het laatste `} },` vóór STAT_MAP; de komma eraf voor een expressie.
let src = bron.slice(van, tot).trimEnd().replace(/,$/, '');
const W = new Function('return (' + src + ');')();

// Nagemaakte context: de watcher vraagt vensters op per PID.
function ctx(rpm, belasting) {
  return {
    win: pid => (pid === '010C' ? rpm : pid === '0104' ? (belasting || []) : []),
    val: () => 0
  };
}

console.log('\n1. De watcher meet nog steeds wat hij moet meten');

// Echt oscillerend stationair: heen en weer rond 800, ±100.
const ruw = [];
for (let i = 0; i < 20; i++) ruw.push(800 + (i % 2 ? 100 : -100));
const uitRuw = W.check(ctx(ruw, [18, 19, 18, 20, 19, 18]));
toets('oscillerend stationair geeft nog steeds een melding', !!uitRuw,
      'kreeg: ' + uitRuw);

// TEGENPROEF 1 — die al in de code zat en niet mocht sneuvelen.
// Een fast-idle dat na een koude start wegzakt (1050 → 660) geeft met een
// max-min-maat ~390 "schommeling", terwijl de motor rustig loopt. Monotone
// daling, dus vrijwel geen richtingswisselingen: dit hoort te zwijgen.
const fastIdle = [];
for (let i = 0; i < 20; i++) fastIdle.push(1050 - i * 20);
toets('een wegzakkend fast-idle blijft stil', W.check(ctx(fastIdle, [])) === null,
      'kreeg: ' + W.check(ctx(fastIdle, [])));

// TEGENPROEF 2 — een vlakke reeks met één parse-hik mag niet vuren.
const vlak = [800, 802, 799, 801, 800, 1180, 800, 799, 801, 800, 802, 798];
toets('één losse uitschieter vuurt niet (IQR, geen max-min)',
      W.check(ctx(vlak, [])) === null, 'kreeg: ' + W.check(ctx(vlak, [])));

// Te weinig monsters: geen oordeel.
toets('te korte reeks geeft geen oordeel', W.check(ctx([800, 810, 790], [])) === null);

console.log('\n2. De verdachtenlijst — dit is de fix uit #30');

// De echte reeks-vorm van 27-08: ~193 rpm spreiding, ~50% wisselingen.
const alsOp2708 = [];
for (let i = 0; i < 20; i++) alsOp2708.push(750 + (i % 2 ? 100 : -95) + (i % 4 === 0 ? 10 : 0));
const m = String(W.check(ctx(alsOp2708, [12, 30, 13, 31, 12, 29])) || '');

toets('er komt een melding (de meting klopt, die blijft)', m.length > 0);
toets('de airco wordt genoemd', /airco/i.test(m), 'melding: ' + m);
toets('de dure verdachten staan er nog steeds in',
      /valse lucht/i.test(m) && /bobine|bougie/i.test(m), 'melding: ' + m);
toets('maar de airco staat vóór de dure verdachten',
      m.toLowerCase().indexOf('airco') < m.toLowerCase().indexOf('valse lucht'),
      'volgorde klopt niet: ' + m);
toets('en er staat een handeling in die de gebruiker zelf kan doen',
      /uit\b|uitzet|eerst/i.test(m), 'melding: ' + m);

console.log('\n3. De belasting gaat mee, zodat #30 ooit te kalibreren is');
// Zonder deze cijfers blijft het onderscheid airco/valse lucht een gok. De
// watcher vraagt 0104 nu op en zet de spreiding in de melding.
toets('0104 staat in de opgevraagde PIDs', (W.pids || []).indexOf('0104') >= 0,
      'pids: ' + (W.pids || []).join(', '));
toets('de belastingspreiding staat in de melding', /motorbelasting varieert \d+%/.test(m),
      'melding: ' + m);
// Ontbreekt 0104 (auto levert hem niet), dan mag de melding niet stukgaan.
const zonder = String(W.check(ctx(alsOp2708, [])) || '');
toets('zonder 0104 komt er nog steeds een leesbare melding', zonder.length > 0 &&
      !/undefined|NaN/.test(zonder), 'melding: ' + zonder);

console.log('\n4. Wegzakken na een stop is geen ruwloop (#567, rit 20-10-2026 19:02)');
/* 238 rpm, 26% richtingswisselingen, 14 s na een stop. De richtingstoets liet
   hem door omdat de ruis op de daling genoeg wisselingen gaf, en de IQR mat
   het wegzakken zelf. Hier dezelfde vorm: 1100 → ~710 rpm, ±15 rpm ruis. */
const ruis = [0, 12, -8, 15, -14, 6, -10, 14, -5, 9, -15, 4, 11, -9, 13, -6, 8, -12, 10, -4];
const zakt = ruis.map((e, i) => Math.round(700 + 400 * Math.exp(-i / 6) + e));
// Eerst bewijzen dat deze reeks de OUDE maat haalde; anders onderscheidt
// de toets niets.
const d = zakt.slice(1).map((v, i) => v - zakt[i]);
const omk = d.slice(1).filter((x, i) => x * d[i] < 0).length / (d.length - 1);
const z = zakt.slice().sort((a, b) => a - b);
const ruweIqr = z[Math.floor(3 * z.length / 4)] - z[Math.floor(z.length / 4)];
toets('TEGENPROEF: de reeks haalt de oude poort (wisselingen ≥ 25%, ruwe IQR > 60)',
      omk >= 0.25 && ruweIqr > 60, 'omk=' + omk.toFixed(2) + ' iqr=' + ruweIqr);
toets('een wegzakkend toerental met ruis blijft stil', W.check(ctx(zakt, [20, 21, 20, 22])) === null,
      'kreeg: ' + W.check(ctx(zakt, [])));
// En de fix mag echte ruwloop niet verbergen, ook niet als die tijdens het
// wegzakken optreedt.
const ruwTijdensZakken = ruw.map((v, i) => v + Math.round(400 * Math.exp(-i / 6)));
toets('ruwloop tijdens het wegzakken geeft nog steeds een melding', !!W.check(ctx(ruwTijdensZakken, [])),
      'kreeg: ' + W.check(ctx(ruwTijdensZakken, [])));
// (Een trage pendel — twee golven in vijf seconden — haalt de richtingstoets
// niet, met of zonder deze fix: 22% wisselingen. Dat is een bestaand gat en
// geen onderwerp van #567.)
toets('de melding zegt dat de schommeling rond het verloop gemeten is', /rond zijn verloop/.test(String(W.check(ctx(ruw, [])))));

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
