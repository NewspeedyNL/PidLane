// ══════════════════════════════════════════════════════════════════
// test-dashboard.js — Slim als eigen dashboard: de pure kern (#439)
// ──────────────────────────────────────────────────────────────────
// Wat hier getoetst wordt, op de echte pidlane-dashboard.js:
//   1. de standaard per motorsoort: alleen wat de auto heeft, een duo valt
//      terug op een balk als de tweede sensor ontbreekt
//   2. bewerken: verschuiven, weghalen, toevoegen (geen dubbele sensor, een
//      maximum), soort, breedte, duo maken en weer opheffen — en nooit de
//      lijst zelf aanpassen (de bewerkstand kan dan niet terug)
//   3. laden: een kapotte of oude opslag geeft null of alleen wat klopt
//   4. de sleutel per auto, de meter, het oordeel van een duo
// Het scherm zelf zit in bproef-dashboard.js.
//
// Draaien vanuit public/:  node test-dashboard.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, v, uitleg) {
  if (v) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const c = { console: { warn() {}, log() {} } };
c.window = c;
vm.createContext(c);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-dashboard.js', 'utf8'), c, { filename: 'pidlane-dashboard.js' });
const D = c.PLDash;
if (!D || typeof D.maakStandaard !== 'function') { console.error('FOUT: PLDash niet geladen'); process.exit(1); }
const vorm = (l) => l.map((t) => t.soort + ':' + t.pids.join('+') + (t.breed ? ':breed' : '')).join(' ');
const alles = () => true, uit = (lijst) => (p) => lijst.indexOf(p) > -1;

console.log('\n1. De standaard per motorsoort');
let s = D.maakStandaard('benzine', alles);
waar('benzine: snelheid, toerental als meter, verbruik breed, koelwater, trims als duo, accu',
  vorm(s) === 'getal:010D meter:010C grafiek:CA03:breed balk:0105 duo:0106+0107 balk:0142', vorm(s));
s = D.maakStandaard('benzine', uit(['010D', '010C', '015E', '0105', '0106', '0142']));
waar('zonder CA03 het verbruik uit 015E; zonder lange trim wordt de duo een balk', vorm(s) === 'getal:010D meter:010C grafiek:015E:breed balk:0105 balk:0106 balk:0142', vorm(s));
s = D.maakStandaard('hybride', alles);
waar('hybride: de aandrijfaccu als tweede tegel', s[1].pids[0] === '015B' && s[1].soort === 'balk', vorm(s));
s = D.maakStandaard('diesel', alles);
waar('diesel: koelwater + olie als duo, laaddruk als meter', /duo:0105\+015C/.test(vorm(s)) && /meter:CA04/.test(vorm(s)), vorm(s));
s = D.maakStandaard('ev', uit(['010D', '015B', '0142']));
waar('EV: alleen wat er is, geen lege tegels', vorm(s) === 'getal:010D balk:015B balk:0142', vorm(s));
waar('onbekende motorsoort: de benzinestandaard', vorm(D.maakStandaard('waterstof', alles)) === vorm(D.maakStandaard('benzine', alles)));
waar('elke tegel een eigen id', new Set(D.maakStandaard('benzine', alles).map((t) => t.id)).size === 6);
waar('een auto zonder sensoren: een lege lijst', D.maakStandaard('benzine', () => false).length === 0);

console.log('\n2. Bewerken');
const l = D.maakStandaard('benzine', alles), id = (i) => l[i].id;
const voor = JSON.stringify(l);
let n = D.schuifIn(l, id(1), -1);
waar('▲ ruilt met de vorige', n[0].pids[0] === '010C' && n[1].pids[0] === '010D');
waar('▲ op de eerste doet niets', vorm(D.schuifIn(l, id(0), -1)) === vorm(l));
waar('▼ op de laatste doet niets', vorm(D.schuifIn(l, id(5), 1)) === vorm(l));
n = D.verwijder(l, id(2));
waar('✕ haalt precies die tegel weg', n.length === 5 && !n.some((t) => t.pids[0] === 'CA03'));
n = D.voegToe(l, '0111', 'balk');
waar('+ voegt achteraan toe, met de gekozen soort', n.length === 7 && n[6].pids[0] === '0111' && n[6].soort === 'balk');
waar('+ een sensor die er al staat: niets', D.voegToe(l, '0107', 'getal').length === 6);
waar('+ een onbekende soort wordt getal', D.voegToe(l, '0111', 'taart')[6].soort === 'getal');
let vol = []; for (let i = 0; i < 20; i++) vol = D.voegToe(vol, 'P' + String(i).padStart(3, '0'), 'getal');
waar('hoogstens ' + D.MAX_TEGELS + ' tegels', vol.length === D.MAX_TEGELS);
n = D.zetSoort(l, id(4), 'grafiek');
waar('een duo een soort geven maakt er één sensor van', n[4].soort === 'grafiek' && n[4].pids.join() === '0106');
waar('een onbekende soort zetten doet niets', vorm(D.zetSoort(l, id(0), 'taart')) === vorm(l));
n = D.zetTweede(l, id(3), '015C');
waar('een tweede sensor maakt een duo', n[3].soort === 'duo' && n[3].pids.join() === '0105,015C');
n = D.zetTweede(n, id(3), '');
waar('de tweede weghalen maakt weer een balk', n[3].soort === 'balk' && n[3].pids.join() === '0105');
waar('zichzelf als tweede kan niet', D.zetTweede(l, id(3), '0105')[3].pids.length === 1);
waar('breedte zetten', D.zetBreed(l, id(0), true)[0].breed === true);
waar('de lijst zelf wordt nooit aangepast', JSON.stringify(l) === voor);

console.log('\n3. Laden');
waar('niets opgeslagen: null', D.normaliseer(null) === null);
waar('een andere versie: null', D.normaliseer({ versie: 99, tegels: [] }) === null);
const ruw = { versie: D.VERSIE, tegels: [
  { id: 'a', soort: 'meter', pids: ['010C'] },
  { id: 'a', soort: 'getal', pids: ['010D'] },
  { soort: 'taart', pids: ['0105'] },
  { soort: 'getal', pids: ['<script>'] },
  { soort: 'getal' },
  { soort: 'balk', pids: ['0106', '0107', '0108'] }
] };
const r = D.normaliseer(ruw);
waar('wat klopt komt erdoor, rommel niet', r.length === 4, JSON.stringify(r));
waar('een dubbel id krijgt een nieuw id', r[0].id === 'a' && r[1].id !== 'a');
waar('een onbekende soort wordt getal', r[2].soort === 'getal');
waar('twee sensoren is een duo, meer dan twee wordt ingekort', r[3].soort === 'duo' && r[3].pids.length === 2);

console.log('\n4. Sleutel, meter, oordeel');
waar('per auto: de VIN in hoofdletters', D.sleutel('jm3kfbcl8j0123456') === 'pl_dash_JM3KFBCL8J0123456');
waar('zonder VIN: één gedeelde sleutel', D.sleutel('') === 'pl_dash_onbekend' && D.sleutel(null) === 'pl_dash_onbekend');
waar('rommel in de VIN gaat er niet in', D.sleutel('JM3 KF/BCL8J0123456') === 'pl_dash_JM3KFBCL8J0123456');
waar('meter: 4000 van 0–8000 is 50', D.meterDeel({ min: 0, max: 8000 }, 4000) === 50);
waar('meter: begrensd', D.meterDeel({ min: 0, max: 8000 }, 99999) === 100 && D.meterDeel({ min: 0, max: 8000 }, -5) === 0);
waar('meter: geen waarde is 0', D.meterDeel({ min: 0, max: 100 }, null) === 0 && D.meterDeel(null, 5) === 0);
waar('duo: de slechtste telt', D.tegelOordeel(['ok', 'warn']) === 'warn' && D.tegelOordeel(['warn', 'danger']) === 'danger' && D.tegelOordeel(['ok', 'ok']) === 'ok');

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + (ok + fout) : 'goed: ' + ok + ' ok, 0 fout'));
process.exit(fout ? 1 : 0);
