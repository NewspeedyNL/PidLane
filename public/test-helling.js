// ══════════════════════════════════════════════════════════════════
// test-helling.js — de helling van de telefoon in caravanrit en ritanalyse (09-10-2026)
// ──────────────────────────────────────────────────────────────────
// Knipt de ECHTE functies uit pidlane-caravan.js en pidlane-rit.js (met een
// anker dat de test laat stoppen als het verdwijnt) en toetst:
//   • caravanTerrein(): de helling beslist over klim/afdaling/vlak, en de
//     motorregel alleen als er geen bruikbare helling is;
//   • dat zware belasting op vlakke weg met helling GEEN klim is — het hele
//     punt van deze wijziging;
//   • dat de helling bij optrekken of remmen niet meetelt;
//   • de bronregel in het rapport (gemeten of geschat);
//   • de terreinzin per fase van de ritanalyse.
//
// Wat hier rood hoort te worden: de terugval die wegvalt, een omgekeerd teken,
// de trendpoort die verdwijnt, een rapport dat "gemeten" zegt zonder helling.
//
// Draaien vanuit public/:  node test-helling.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0, n = 0;
function ok(v, wat, extra){ n++; if (v) console.log('  ok  ' + wat); else { fouten++; console.log('  FOUT  ' + wat + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } }

function knip(bestand, kop, eind){
  const src = fs.readFileSync(path.join(__dirname, bestand), 'utf8');
  const a = src.indexOf(kop);
  if (a < 0) { console.log('  FOUT  "' + kop + '" niet gevonden in ' + bestand + ' — deze test toetst niets meer'); process.exit(1); }
  const b = src.indexOf(eind || '\n}\n', a);
  return src.slice(a, b + (eind ? eind.length : 3));
}

// ── caravan ──
const car = { console: { warn(){} }, Math, Number };
vm.createContext(car);
vm.runInContext([
  knip('pidlane-caravan.js', 'const CARAVAN_HELLING', '\n'),
  knip('pidlane-caravan.js', 'function caravanDetectClimb('),
  knip('pidlane-caravan.js', 'function caravanTerrein('),
  knip('pidlane-caravan.js', 'function caravanTerreinBronTekst('),
  'this.CARAVAN_HELLING = CARAVAN_HELLING;'
].join('\n'), car, { filename: 'caravan-knip.js' });
const T = car.caravanTerrein;

console.log('\n— caravan: de helling beslist —');
ok(T(40, 80, 30, 0, 4).climb === 'klim' && T(40, 80, 30, 0, 4).bron === 'helling', '+4° bij constante snelheid: klim, gemeten', T(40, 80, 30, 0, 4));
ok(T(10, 80, 2, 0, -4).climb === 'afdaling', '−4°: afdaling');
ok(T(85, 80, 60, 0, 0.5).climb === 'vlak' && T(85, 80, 60, 0, 0.5).bron === 'helling',
  'zware belasting (85%) op vlakke weg — tegenwind, volle caravan: vlak, géén klim', T(85, 80, 60, 0, 0.5));
ok(car.caravanDetectClimb(85, 80, 60, 0) === 'klim', '…terwijl de motorregel alleen hier "klim" van maakt (de reden voor deze wijziging)');
const d = car.CARAVAN_HELLING.drempel;
ok(T(40, 80, 30, 0, d).climb === 'klim' && T(40, 80, 30, 0, d - 0.1).climb === 'vlak', 'drempel ' + d + '°: precies erop is klim, net eronder vlak');
ok(T(40, 80, 30, null, 4).bron === 'helling', 'trend nog onbekend (eerste 5 s): de helling telt al');

console.log('\n— caravan: terugval op de motorregel —');
ok(T(85, 80, 60, 0, null).climb === 'klim' && T(85, 80, 60, 0, null).bron === 'obd', 'geen helling (telefoon los): de motorregel, en dat staat erbij');
ok(T(40, 80, 30, 2.5, 4).bron === 'obd', 'optrekken (2,5 km/u per s): de hoek is dan versnelling, niet helling — motorregel', T(40, 80, 30, 2.5, 4));
ok(T(40, 80, 30, -2.5, -4).bron === 'obd', 'remmen: idem');
ok(T(85, 80, 60, 0, NaN).bron === 'obd', 'een kapotte hoek (NaN) is geen "vlak, gemeten": motorregel');

console.log('\n— caravan: wat het rapport over de bron zegt —');
const B = car.caravanTerreinBronTekst;
ok(/geen helling/.test(B({ helling: 0, obd: 600 })), 'alleen motorregel: "geen helling gemeten"', B({ helling: 0, obd: 600 }));
ok(/^gemeten met de helling/.test(B({ helling: 600, obd: 0 })), 'alles gemeten: "gemeten met de helling"');
ok(/^75% gemeten/.test(B({ helling: 450, obd: 150 })), 'deels: het aandeel staat erbij', B({ helling: 450, obd: 150 }));
ok(/geen helling/.test(B({ helling: 0, obd: 0 })), 'nog niets gereden: geen bewering over meten');

// ── rit ──
const rit = { console: { warn(){} }, Math, Number, Object };
vm.createContext(rit);
vm.runInContext([
  knip('pidlane-rit.js', 'const RIT_HELLING_DREMPEL', '\n'),
  knip('pidlane-rit.js', 'function _faseTerrein('),
].join('\n'), rit, { filename: 'rit-knip.js' });
const F = rit._faseTerrein;

console.log('\n— ritanalyse: terrein per fase —');
ok(/bergop/.test(F({ avg: 4, min: 2, max: 6, count: 100 })), 'gemiddeld +4°: bergop, met de uitleg over belasting', F({ avg: 4, min: 2, max: 6, count: 100 }));
ok(/bergaf/.test(F({ avg: -4, min: -6, max: -2, count: 100 })), 'gemiddeld −4°: bergaf');
ok(/Heuvelachtig/.test(F({ avg: 0, min: -4, max: 4, count: 100 })), 'op en neer: heuvelachtig');
ok(F({ avg: 0.5, min: -1, max: 1, count: 100 }) === '', 'vlak: niets erbij — geen ruis in de duiding');
ok(F(undefined) === '' && F({ avg: 5, min: 5, max: 5, count: 3 }) === '', 'geen helling, of te weinig metingen: niets');

// De duiding zelf: de helling hoort niet in "liep op".
const rit2 = { console: { warn(){} }, Math, Number, Object, fv: v => String(v), getPidDef: () => null };
vm.createContext(rit2);
vm.runInContext([
  knip('pidlane-rit.js', 'const RIT_HELLING_DREMPEL', '\n'),
  knip('pidlane-rit.js', 'function _faseTerrein('),
  knip('pidlane-rit.js', 'function _faseLokaleDuiding('),
].join('\n'), rit2, { filename: 'rit-knip2.js' });
const dd = rit2._faseLokaleDuiding({ TL01: { name: 'Helling (telefoon)', avg: 4, min: 1, max: 6, trend: 300, ok: true, count: 100 },
  '0104': { name: 'Belasting', avg: 70, min: 50, max: 90, trend: 2, ok: true, count: 100 } }, {});
ok(/bergop/.test(dd) && !/Helling \(telefoon\) liep op/.test(dd), 'de faseduiding noemt het terrein, en de helling niet als "liep op"', dd);

console.log('\n' + (fouten ? 'test-helling: ' + fouten + ' van ' + n + ' FOUT' : 'test-helling: ' + n + ' ok'));
process.exit(fouten ? 1 : 0);
