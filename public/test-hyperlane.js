// ══════════════════════════════════════════════════════════════════
// test-hyperlane.js — Hyperlane, de blikvanger van Slim visueel (27-10-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-hyperlane.js en pidlane-visprofiel.js in een vm en
// toetst wat zonder scherm te toetsen is:
//   • de kleur loopt van ijsblauw naar rood en springt nergens buiten de stops;
//   • de stemming: rustig = 0, een lege plek maakt het scherm niet rood,
//     toeren telt zwaarder dan gas;
//   • de schakellampjes beginnen op 70% van de rode streep, de begrenzer knippert;
//   • 0–100 meet alleen vanuit stilstand met gas, en stilstaan zet hem terug;
//   • het profiel kiest de juiste PIDs en een diesel krijgt 6000 rpm;
//   • elke klasse die de tekening gebruikt heeft regels in pidlane.css.
// Wat in de echte app gebeurt (WebGL, de lus, het volle scherm): bproef-hyperlane.js.
//
// Draaien vanuit public/:  node test-hyperlane.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const lees = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
const CSS = lees('pidlane.css');
function laad() {
  const opslag = {};
  const c = { console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: k => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); } } };
  c.window = c;
  vm.createContext(c);
  ['pidlane-toon.js', 'pidlane-hyperlane.js', 'pidlane-visprofiel.js'].forEach(f => vm.runInContext(lees(f), c, { filename: f }));
  return c;
}
const C = laad(), H = C.PLHyperlane, P = C.PLVisProfiel;

console.log('\n1. Kleur volgt het rijgedrag');
const gelijk = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.5);
waar('rustig is ijsblauw, de begrenzer rood', gelijk(H.kleur(0), [90, 200, 255]) && gelijk(H.kleur(1), [255, 40, 70]), JSON.stringify([H.kleur(0), H.kleur(1)]));
waar('buiten 0–1 en onzin: begrensd, geen NaN', gelijk(H.kleur(-3), H.kleur(0)) && gelijk(H.kleur(9), H.kleur(1)) && H.kleur('x').every(isFinite));
const zonderSprong = (() => { for (let m = 0; m < 1; m += 0.01) { const a = H.kleur(m), b = H.kleur(m + 0.01); if (a.some((v, i) => Math.abs(v - b[i]) > 20)) return m.toFixed(2); } return null; })();
waar('het verloop springt nergens (stap van 1% < 20 per kanaal)', zonderSprong === null, 'sprong bij ' + zonderSprong);

console.log('\n2. Stemming');
waar('stationair zonder gas is rustig (< 0,1)', H.stemming(800, 6800, 0) < 0.1, H.stemming(800, 6800, 0));
waar('op de rode streep met vol gas: 1', H.stemming(6800, 6800, 100) === 1);
waar('een lege plek maakt het scherm niet rood', H.stemming(null, 6800, null) === 0 && H.stemming(undefined, 6800, 'x') === 0);
waar('toeren telt zwaarder dan gas', H.stemming(6800, 6800, 0) > H.stemming(0, 6800, 100));
waar('modus loopt ECO → CRUISE → SPORT → MAX', [0, 0.4, 0.7, 0.9].map(H.modus).join(',') === 'ECO,CRUISE,SPORT,MAX');

console.log('\n3. Schakellampjes');
waar('onder 70% van de rode streep: niets', H.leds(4000, 6800).aan === 0, JSON.stringify(H.leds(4000, 6800)));
waar('halverwege 70%–100%: de helft', H.leds(6800 * 0.85, 6800).aan === 5, JSON.stringify(H.leds(6800 * 0.85, 6800)));
waar('op de begrenzer: alle tien en knipperen', H.leds(6800, 6800).aan === 10 && H.leds(6800, 6800).max === true);
waar('geen toerental: niets, geen knipper', H.leds(null, 6800).aan === 0 && !H.leds(null, 6800).max);

console.log('\n4. 0–100 vanuit stilstand');
function rit(stappen) { let st = { start: null }, tijd = null; stappen.forEach(s => { const r = H.nul100(st, s[0], s[1], s[2]); st = r.st; if (r.tijd !== null) tijd = r.tijd; }); return tijd; }
waar('stilstand, vol gas, 100 na 7,2 s', Math.abs(rit([[0, 0, 0], [0, 90, 1], [40, 100, 3], [100, 100, 8.2]]) - 7.2) < 1e-9);
waar('al rijdend gas geven telt niet', rit([[30, 90, 0], [100, 100, 6]]) === null);
waar('stilstaan zonder gas zet hem terug', rit([[0, 90, 0], [0, 0, 5], [60, 30, 10], [100, 30, 20]]) === null);
waar('een ontbrekende snelheid start niets', rit([[null, 90, 0], [100, 90, 4]]) === null);

console.log('\n5. Het profiel');
const ind = P.indeling('hyperlane', q => ['010C', '010D', '0105', '0149'].indexOf(q) >= 0);
waar('toeren, snelheid, koelwater en gaspedaal uit de eigen keten', ind && ind.plekken.toeren === '010C' && ind.plekken.snel === '010D' && ind.plekken.koel === '0105' && ind.plekken.gas === '0149', JSON.stringify(ind && ind.plekken));
const dz = P.voor('hyperlane', 'diesel').plekken.filter(x => x.rol === 'toeren')[0];
waar('een diesel krijgt 6000 rpm, net als de basismeter (#393)', dz && dz.hi === 6000, dz && dz.hi);
waar('elke plek is soort hyper: bij() tekent niets zelf', P.zoek('hyperlane').plekken.every(x => x.soort === 'hyper'));
const h = P.html('hyperlane', ind);
waar('het vak is de Hyperlane-tekening', h.indexOf('vpf-hyper') >= 0 && h.indexOf('class="vhl-bg"') >= 0 && (h.match(/class="vhl-ring"/g) || []).length === 2);

console.log('\n6. bij() geeft de waarde door aan de lus');
let gezet = [];
C.PLHyperlane = Object.assign({}, H, { zet: (r, v) => gezet.push(r + '=' + v) });
C.document = { getElementById: () => null };
P.bij('hyperlane', ind, '010C', 3200, 'ok');
P.bij('hyperlane', ind, '010D', 88, 'ok');
waar('toeren en snelheid komen bij PLHyperlane.zet aan', gezet.join(',') === 'toeren=3200,snel=88', gezet.join(','));

console.log('\n7. Elke klasse heeft CSS');
const klassen = [...new Set([...h.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(k => /^vhl-/.test(k)))];
const mist = klassen.filter(k => CSS.indexOf('.' + k) < 0);
waar('alle vhl-klassen uit html() staan in pidlane.css', mist.length === 0, mist.join(', '));
waar('het volle scherm vult het scherm met de tunnel', /body\.pl-vis-vol \.vpf-hyper \{[^}]*position:fixed/.test(CSS));

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + (ok + fout) : 'ok: ' + ok + ' van ' + ok));
process.exit(fout ? 1 : 0);
