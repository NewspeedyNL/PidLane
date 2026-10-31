// ══════════════════════════════════════════════════════════════════
// test-rr.js — RR, eigen meetopdrachten (PLRR, 31-10-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-rr.js met vm, en de echte kpRrOpdracht() uit
// worker.js. De scherpste vragen:
//  - meet hij alléén binnen het venster (voorwaarden, klok, max duur)?
//  - is een sensor zonder waarde een lege cel en geen nul?
//  - houdt hij zich aan het tempo, ook als de lus elke seconde tikt?
//  - rekent hij de eenheid om, en blijven de voorwaarden in de eenheid
//    van de auto?
//  - keuren app en Worker hetzelfde goed en af?
//
// Draaien vanuit public/:  node test-rr.js   (exit 0 = goed)
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

const ctx = { console: { log() {}, warn() {}, error() {} }, Date, Math, JSON, String, Number, Object, Array, isFinite, setInterval: () => 1, clearInterval() {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-rr.js'), 'utf8'), ctx, { filename: 'pidlane-rr.js' });
const R = ctx.PLRR;
if (!R || !R._kern) { console.log('FOUT PLRR hangt zijn kern niet naar buiten'); process.exit(1); }
const K = R._kern;

const worker = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const wKnip = worker.match(/var KP_RR = [^\n]*\n/);
const wFn = worker.match(/function kpRrOpdracht\(o\) \{[\s\S]*?\n\}\n/);
if (!wKnip || !wFn) { console.log('FOUT kpRrOpdracht of KP_RR niet gevonden in worker.js'); process.exit(1); }
const kpRr = new Function(wKnip[0] + wFn[0] + 'return kpRrOpdracht;')();

const basis = { naam: 'Trekhaak', doel: 'koelwater met aanhanger', sensoren: [{ pid: '0105' }, { pid: '010D', eenheid: 'mph' }], tempo: 2,
  venster: { start: 'knop', voorwaarden: [{ pid: '0105', op: '>', waarde: '80' }] }, opbouw: 'beide', export: 'csv' };

console.log('\n1. Normaliseren — app en Worker');
{
  const a = R.normaliseer(basis);
  toets('een complete RR is goed, de voorwaarde wordt een getal', a.ok && a.rr.venster.voorwaarden[0].waarde === 80 && a.rr.sensoren[1].eenheid === 'mph', JSON.stringify(a));
  toets('zonder naam: fout', !!R.normaliseer(Object.assign({}, basis, { naam: ' ' })).fout);
  toets('zonder sensoren: fout', !!R.normaliseer(Object.assign({}, basis, { sensoren: [] })).fout);
  toets('een tempo buiten de lijst (3 s): fout', !!R.normaliseer(Object.assign({}, basis, { tempo: 3 })).fout);
  toets('een tijdvak met alleen een begin: fout', !!R.normaliseer(Object.assign({}, basis, { venster: { van: '08:00' } })).fout);
  toets('een voorwaarde zonder getal: fout', !!R.normaliseer(Object.assign({}, basis, { venster: { voorwaarden: [{ pid: '0105', op: '>', waarde: '' }] } })).fout);
  toets('dezelfde sensor twee keer telt één keer', R.normaliseer(Object.assign({}, basis, { sensoren: [{ pid: '0105' }, { pid: '0105' }] })).rr.sensoren.length === 1);
  toets('dertien sensoren: fout', !!R.normaliseer(Object.assign({}, basis, { sensoren: Array.from({ length: 13 }, (x, i) => ({ pid: '01' + (10 + i) })) })).fout);
  // Wat de app goedkeurt, moet de Worker ook goedkeuren — anders bewaar je iets dat niet terugkomt.
  const w = kpRr(a.rr);
  toets('de Worker neemt een RR van de app ongewijzigd over', !w.fout && JSON.stringify(w.rr) === JSON.stringify(a.rr), JSON.stringify(w) + '\n        ' + JSON.stringify(a.rr));
  const slecht = [Object.assign({}, a.rr, { tempo: 3 }), Object.assign({}, a.rr, { naam: '' }), Object.assign({}, a.rr, { sensoren: [{ pid: '<script>' }] }),
    Object.assign({}, a.rr, { venster: { voorwaarden: [{ pid: '0105', op: '==', waarde: 1 }] } }), Object.assign({}, a.rr, { venster: { maxMin: 5000 } })];
  toets('wat de app afkeurt, keurt de Worker ook af', slecht.every((x) => !!kpRr(x).fout && !!R.normaliseer(x).fout), slecht.map((x) => !!kpRr(x).fout + '/' + !!R.normaliseer(x).fout).join(' '));
}

console.log('\n2. Eenheden');
{
  toets('°C → °F', K.omreken(100, '°C', '°F') === 212);
  toets('km/h → mph', Math.abs(K.omreken(100, 'km/h', 'mph') - 62.137) < 0.01);
  toets('kPa → bar', K.omreken(250, 'kPa', 'bar') === 2.5);
  toets('l/100 km → km/l, en 0 l/100 km is geen getal', K.omreken(5, 'L/100km', 'km/l') === 20 && K.omreken(0, 'L/100km', 'km/l') === null);
  toets('een eenheid die niet bestaat: de waarde blijft', K.omreken(7, 'V', 'mV') === 7);
  toets('geen waarde blijft geen waarde', K.omreken(undefined, '°C', '°F') === null && K.omreken(NaN, '°C', '°F') === null);
  toets('de keuze voor km/h noemt km/h eerst', K.eenheden('km/h')[0] === 'km/h' && K.eenheden('km/h').indexOf('mph') > 0);
}

console.log('\n3. Het venster');
{
  const rr = R.normaliseer(basis).rr;
  toets('koelwater 70 < 80: dicht, met de reden', (() => { const v = K.vensterOpen(rr, { '0105': 70 }, Date.now()); return !v.open && /0105/.test(v.reden); })());
  toets('koelwater 85: open', K.vensterOpen(rr, { '0105': 85 }, Date.now()).open);
  toets('koelwater zonder waarde: dicht, niet open', !K.vensterOpen(rr, {}, Date.now()).open);
  const nacht = R.normaliseer(Object.assign({}, basis, { venster: { van: '22:00', tot: '06:00' } })).rr;
  toets('tijdvak over middernacht: 23:30 binnen, 12:00 buiten', K.vensterOpen(nacht, {}, new Date(2026, 9, 31, 23, 30).getTime()).open && !K.vensterOpen(nacht, {}, new Date(2026, 9, 31, 12, 0).getTime()).open);
  const kort = R.normaliseer(Object.assign({}, basis, { venster: { maxMin: 1 } })).rr;
  const t0 = 1e9;
  toets('na de maximale duur: klaar', K.vensterOpen(kort, {}, t0 + 61e3, { start: t0 }).klaar === true);
}

console.log('\n4. De meting');
{
  const rr = K.basisVan(R.normaliseer(basis).rr);
  rr.sensoren[0].basis = '°C'; rr.sensoren[1].basis = 'km/h';
  let st = K.nieuw(1e9);
  const tikken = [[70, 50], [85, 100], [86, 100], [88, null], [90, 100], [75, 100], [91, 100]];
  tikken.forEach(([k, s], i) => { const w = { '0105': k }; if (s !== null) w['010D'] = s; st = K.tik(st, rr, w, 1e9 + i * 1000); });
  // tempo 2 s, lus elke 1 s: tik 1 (85), tik 3 (88), tik 6 (91); 70 en 75 vallen buiten het venster.
  toets('alleen binnen het venster en op het tempo: drie rijen', st.rijen.length === 3, JSON.stringify(st.rijen));
  toets('twee vensters (dicht bij 75 ertussen)', st.vensters === 2, String(st.vensters));
  toets('omgerekend naar mph', Math.abs(st.rijen[0][2] - 62.137) < 0.01, JSON.stringify(st.rijen[0]));
  toets('een sensor zonder waarde is leeg, geen nul', st.rijen[1][2] === null, JSON.stringify(st.rijen[1]));
  const sam = R.samenvatting(rr, st, { '0105': { name: 'Koelwater', unit: '°C' } });
  toets('samenvatting: min, gemiddeld en max van koelwater', sam[0].n === 3 && sam[0].min === 85 && sam[0].max === 91 && Math.abs(sam[0].gem - 88) < 1e-9, JSON.stringify(sam[0]));
  toets('samenvatting telt de lege cel niet mee, ook niet in het gemiddelde', sam[1].n === 2 && Math.abs(sam[1].gem - 62.137) < 0.01, JSON.stringify(sam[1]));

  const csv = R.csv(rr, st, { '0105': { name: 'Koelwater', unit: '°C' }, '010D': { name: 'Snelheid', unit: 'km/h' } }, false);
  const r = csv.split('\n');
  toets('CSV: doel en venster als commentaar bovenaan', /^# RR: Trekhaak/.test(r[0]) && /doel: koelwater/.test(r[1]) && /0105 > 80/.test(r[2]), r.slice(0, 3).join(' | '));
  toets('CSV: kop met naam en gekozen eenheid', r[3] === 'tijd;sec;Koelwater (°C);Snelheid (mph)', r[3]);
  toets('CSV (NL): komma als decimaal, lege cel bij geen waarde', /;62,14$/.test(r[4]) && /;88;$/.test(r[5]), r[4] + ' | ' + r[5]);
  toets('CSV (beide): de samenvatting staat eronder', csv.indexOf('sensor;eenheid;metingen;min;gemiddeld;max') > 0);
  toets('CSV internationaal: komma als scheiding, punt als decimaal', /,62\.14$/.test(R.csv(rr, st, {}, true).split('\n')[4]));
  const j = JSON.parse(R.json(rr, st, {}));
  toets('JSON: metingen per sensor-code en een samenvatting', j.metingen.length === 3 && j.metingen[0]['0105'] === 85 && j.samenvatting.length === 2, JSON.stringify(j).slice(0, 200));

  const alleen = K.basisVan(R.normaliseer(Object.assign({}, basis, { opbouw: 'samenvatting', venster: {} })).rr);
  let s2 = K.nieuw(0);
  for (let i = 0; i < 5; i++) s2 = K.tik(s2, alleen, { '0105': 80 + i }, i * 2000);
  toets('opbouw samenvatting: geen tijdreeks, wel de telling', s2.rijen.length === 0 && s2.sam['0105'].n === 5);
  toets('rapporttekst noemt doel, metingen en de samenvatting', (() => { const t = R.rapportTekst(rr, st, {}, 1e9 + 7000); return /Doel: koelwater/.test(t) && /3 metingen in 2 vensters/.test(t) && /min 85/.test(t) && /Tijdreeks \(CSV\)/.test(t); })());
}

console.log('\n5. Het formulier');
{
  const lijst = [{ pid: '0105', name: 'Koelwater', unit: '°C' }, { pid: '010D', name: 'Snelheid', unit: 'km/h' }];
  const h = R.formHtml(R.normaliseer(basis).rr, lijst);
  toets('het formulier vinkt de gekozen sensoren aan en kiest de eenheid', /id="rr_s0" data-pid="0105" data-basis="°C" checked/.test(h) && /<option value="mph" selected>/.test(h), h.slice(0, 300));
  const els = { rr_naam: 'X', rr_doel: '', rr_tempo: '5', rr_start: 'verbinden', rr_van: '', rr_tot: '', rr_max: '30', rr_wp0: '0105', rr_wo0: '>=', rr_ww0: '60',
    rr_opbouw: 'tijdreeks', rr_export: 'json' };
  const vink = { rr_s1: { checked: true, getAttribute: (a) => (a === 'data-pid' ? '010D' : 'km/h') }, rr_e1: { value: 'km/h' }, rr_rapport: { checked: true } };
  const doc = { getElementById: (id) => vink[id] || (id in els ? { value: els[id] } : null) };
  const n2 = R.normaliseer(R.uitFormulier(doc, 2));
  toets('terug uit het formulier: sensor, tempo, venster, export en rapport', n2.ok && n2.rr.sensoren.length === 1 && n2.rr.sensoren[0].pid === '010D' && !n2.rr.sensoren[0].eenheid &&
    n2.rr.tempo === 5 && n2.rr.venster.start === 'verbinden' && n2.rr.venster.maxMin === 30 && n2.rr.venster.voorwaarden[0].op === '>=' && n2.rr.export === 'json' && n2.rr.rapport === true, JSON.stringify(n2));
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
process.exit(fout ? 1 : 0);
