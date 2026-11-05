// ══════════════════════════════════════════════════════════════════
// test-inrichten.js — de setup-wizard (PLInrichten, 04-11-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-inrichten.js en toetst de pure kern:
//  1. de sleutel per voertuig (VIN, anders kenteken; nooit de VIN kwijt)
//  2. vanzelf vragen alleen bij de eerste keer, niet in demo of hervatting
//  3. de volgorde (meten eerst) en welke stap geldt zonder akkoord of bus
//  4. later verder: markeren, voortgang, een kapotte opslag
//  5. km-stand uit de ECU, de laatste beurt, de volgende beurt
//  6. de leerrit: alleen rijtijd telt, gaten niet
// Draaien vanuit public/:  node test-inrichten.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
const ctx = { console: { log() {}, warn() {}, error() {} }, setInterval() { return 0; }, clearInterval() {},
  document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-inrichten.js'), 'utf8'), ctx, { filename: 'pidlane-inrichten.js' });
if (!ctx.PLInrichten || !ctx.PLInrichten._kern) { console.log('FOUT PLInrichten hangt zijn kern niet meer naar buiten'); process.exit(1); }
const K = ctx.PLInrichten._kern;
const IDS = K.STAPPEN.map((s) => s.id);
const ALLES = { platform: true, akkoord: true, verbonden: true };

console.log('1. De sleutel per voertuig');
const VIN = 'JMZBL14Z201234567';
toets('VIN wint van kenteken', K.sleutelVan({ vin: VIN, kenteken: 'AB-123-C' }) === 'pl_inricht_v' + VIN);
toets('VIN in kleine letters en met spaties: dezelfde sleutel', K.sleutelVan({ vin: ' jmzbl14z2 01234567 ' }) === K.sleutelVan({ vin: VIN }));
toets('geen of een kapotte VIN: het kenteken', K.sleutelVan({ vin: '???', kenteken: 'ab-123-c' }) === 'pl_inricht_kAB123C');
toets('niets bekend: één gedeelde sleutel', K.sleutelVan({}) === 'pl_inricht_onbekend');
toets('twee auto\'s: twee sleutels', K.sleutelVan({ vin: VIN }) !== K.sleutelVan({ vin: 'WVWZZZ1KZ6W000001' }));

console.log('\n2. Vanzelf vragen');
toets('nog niets gekozen: vragen', K.moetVragen(null, {}) === true);
toets('"Meteen rijden" gekozen: niet meer vanzelf', K.moetVragen({ keuze: 'rijden' }, {}) === false);
toets('halverwege gesloten: niet vanzelf (verder via het menu)', K.moetVragen({ keuze: 'wizard', stap: 'adapter' }, {}) === false);
toets('afgerond: niet meer vanzelf', K.moetVragen({ keuze: 'klaar' }, {}) === false);
toets('demo: nooit', K.moetVragen(null, { demo: true }) === false);
toets('hervatting na een herlaad: nooit', K.moetVragen(null, { hervat: true }) === false);
toets('een onbekende keuze uit de opslag telt als niets gekozen', K.moetVragen({ keuze: 'zomaar' }, {}) === true);

console.log('\n3. Volgorde en voorwaarden');
toets('meten eerst: toestemming, auto, adapter, sensoren vóór weergave, bijhouden, foto, klaar',
  IDS.join(',') === 'toestemming,auto,adapter,sensoren,weergave,bijhouden,foto,klaar', IDS.join(','));
toets('zonder akkoord begint hij bij de toestemming', K.volgende(null, { platform: true, akkoord: false, verbonden: true }) === 'toestemming');
toets('met akkoord: geen toestemmingsstap', K.volgende(null, ALLES) === 'auto');
toets('geen klantaccount: geen toestemming en geen bijhouden', !K.toepasbaar('toestemming', { platform: false }) && !K.toepasbaar('bijhouden', { platform: false, akkoord: true }));
toets('niet verbonden: adapter en sensoren slaat hij over', K.volgende({ stappen: { auto: 'klaar' } }, { platform: true, akkoord: true, verbonden: false }) === 'weergave');
toets('bijhouden zonder akkoord geldt niet (de server weigert dan)', !K.toepasbaar('bijhouden', { platform: true, akkoord: false }));
toets('een onbekende stap geldt nooit', !K.toepasbaar('raket', ALLES));

console.log('\n4. Later verder');
let st = K.nieuweStaat();
st = K.markeer(st, 'auto', 'klaar', ALLES, 1);
toets('na Leer de auto: de adapter', st.stap === 'adapter' && st.keuze === 'wizard', JSON.stringify(st));
st = K.markeer(st, 'adapter', 'over', ALLES, 2);
toets('overslaan telt als gedaan, met "over" erbij', st.stappen.adapter === 'over' && st.stap === 'sensoren');
const vg = K.voortgang(st, ALLES);
toets('voortgang: 2 van 6 (zonder toestemming en klaar), adapter overgeslagen', vg.gedaan === 2 && vg.totaal === 6 && vg.over.join() === 'adapter', JSON.stringify(vg));
const terug = K.normaliseer(JSON.parse(JSON.stringify(st)));
toets('door JSON heen blijft de stand gelijk', terug.stap === 'sensoren' && terug.stappen.auto === 'klaar');
toets('kapotte opslag: een verse stand, geen fout', K.normaliseer('{kapot').keuze === null && K.normaliseer({ stappen: { auto: 'misschien' } }).stappen.auto === undefined);
const zonderBus = K.markeer(K.nieuweStaat(), 'auto', 'klaar', { platform: true, akkoord: true, verbonden: false }, 3);
toets('niet verbonden: adapter niet als "over" gemarkeerd, zodat hij later alsnog komt',
  !zonderBus.stappen.adapter && K.volgende(zonderBus, ALLES) === 'adapter');
let alles = K.nieuweStaat();
['auto', 'adapter', 'sensoren', 'weergave', 'bijhouden', 'foto'].forEach((id) => { alles = K.markeer(alles, id, 'klaar', ALLES, 4); });
toets('alles gedaan: klaar', alles.stap === 'klaar' && K.volgende(alles, ALLES) === 'klaar');
toets('pas "klaar" zelf maakt de keuze klaar', alles.keuze === 'wizard' && K.markeer(alles, 'klaar', 'klaar', ALLES, 5).keuze === 'klaar');

console.log('\n5. Km-stand en onderhoud');
toets('01A6 uit pidVals', K.kmUitEcu({ '01A6': 123456.7 }) === 123457);
toets('0 km is "niet ondersteund", geen nieuwe auto', K.kmUitEcu({ '01A6': 0 }) === null);
toets('onmogelijk hoog: niet gebruiken', K.kmUitEcu({ '01A6': 5e6 }) === null);
toets('geen waarde: null', K.kmUitEcu({}) === null && K.kmUitEcu(null) === null);
toets('laatste beurt als tekst', K.beurtTekst('2026-03-12', 110000) === '12-03-2026 bij 110.000 km', K.beurtTekst('2026-03-12', 110000));
toets('alleen een datum', K.beurtTekst('2026-03-12', null) === '12-03-2026');
toets('niets: null (geen leeg veld bewaren)', K.beurtTekst('', null) === null);
const vb = K.volgendeBeurt({ datum: '2026-03-12', km: 110000 }, { km: 15000, mnd: 12 });
toets('volgende beurt: km en datum uit het interval', vb.onderhoud_km === 125000 && vb.onderhoud_datum === '2027-03-12', JSON.stringify(vb));
toets('zonder interval: geen gok', Object.keys(K.volgendeBeurt({ datum: '2026-03-12', km: 110000 }, {})).length === 0);

console.log('\n6. De leerrit');
let l = { rijMs: 0, tLaatst: 0 }, r;
for (let t = 0; t <= 5 * 60000; t += 5000) { r = K.leerTik(l, { kmh: 50 }, 1e6 + t); l = r.st; }
toets('vijf minuten rijden: klaar', r.klaar === true, JSON.stringify(l));
l = { rijMs: 0, tLaatst: 0 };
for (let t = 0; t <= 10 * 60000; t += 5000) { r = K.leerTik(l, { kmh: 0 }, 1e6 + t); l = r.st; }
toets('tien minuten stilstaan: niet klaar', r.klaar === false && l.rijMs === 0);
l = { rijMs: 0, tLaatst: 0 };
r = K.leerTik(l, { kmh: 60 }, 1000); r = K.leerTik(r.st, { kmh: 60 }, 1000 + 10 * 60000);
toets('een gat van tien minuten (app op de achtergrond) telt niet', r.klaar === false && r.st.rijMs === 0);

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alles goed — ' + n + ' toetsen'));
process.exit(fout ? 1 : 0);
