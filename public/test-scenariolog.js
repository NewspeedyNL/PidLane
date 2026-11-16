// ══════════════════════════════════════════════════════════════════
// test-scenariolog.js — een log van buiten: basisoordeel en wat de AI ziet
// ──────────────────────────────────────────────────────────────────
// Laadt de échte keten: PLLogImport (kern tussen de ankers), PLVerzamel,
// PLTotaal, PLSamenhang, assessPidQuality en de PID-definities. Geen eigen
// grenzen: of 19 % langetermijntrim "let op" is, zegt pidlane-data.js.
//
//   A. lezen: kolomnamen van Torque en Car Scanner, eenheden, tijd, VIN
//   B. elke scenariolog in ../scenariolog: BASIS klopt, elk SIGNAAL staat
//      in de prompt, en de verwachting zelf (de kop) staat er NIET in
//   C. de toets onderscheidt: een ander oordeel of een gemist signaal is rood
//
// Draaien vanuit public/:  node test-scenariolog.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const dir = __dirname;
const SCEN = path.join(dir, '..', 'scenariolog');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
function knipTussen(src, a, b, wat) {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) { console.log('  FOUT  anker voor ' + wat + ' niet gevonden — deze test toetst niets meer'); process.exit(1); }
  return src.slice(i, j);
}
function knipFn(src, kop) { return knipTussen(src, kop, '\n}\n', kop) + '\n}\n'; }

const s = { console: { log() {}, warn() {}, error() {} } };
s.window = s; s.globalThis = s;
s.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, addEventListener() {} }), addEventListener() {}, head: { appendChild() {} }, body: { appendChild() {} } };
s.addEventListener = () => {}; s.navigator = {};
s.setTimeout = (fn) => { fn(); return 0; }; s.setInterval = () => 0; s.clearTimeout = () => {}; s.clearInterval = () => {};
vm.createContext(s);
['pidlane-data.js', 'pidlane-foutcodes.js', 'pidlane-onderzoek.js', 'pidlane-samenhang.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), s, { filename: f }));
if (!s.ALL_PID_DEFS || !s.PLSamenhang) { console.log('  FOUT  pidlane-data.js of PLSamenhang niet geladen'); process.exit(1); }
s.getPidDef = pid => s.ALL_PID_DEFS[pid] || null;
s.pidHist = {};
const kw = fs.readFileSync(path.join(dir, 'pidlane-kwaliteit.js'), 'utf8');
// fv() is de getalopmaak uit pidlane-pids.js (die hangt aan de hele app);
// zonder fv gooit de onzin-tak en leest PLVerzamel een meetfout als gewone
// afwijking. Zelfde vervanging als test-verzamel.js.
vm.runInContext('function fv(x){ return String(Math.round(x*10)/10); }', s);
vm.runInContext(knipFn(kw, 'function assessPidQuality'), s);
const DISCL = (/const RAPPORT_DISCLAIMER='([^']+)'/.exec(kw) || [])[1];
vm.runInContext(fs.readFileSync(path.join(dir, 'pidlane-verzamel.js'), 'utf8'), s, { filename: 'pidlane-verzamel.js' });
vm.runInContext(knipTussen(fs.readFileSync(path.join(dir, 'pidlane-totalcheck.js'), 'utf8'), '// ── PLTotaal kern begin ──', '// ── PLTotaal kern eind ──', 'PLTotaal'), s);
vm.runInContext(knipTussen(fs.readFileSync(path.join(dir, 'pidlane-logimport.js'), 'utf8'), '// ── PLLogImport kern begin ──', '// ── PLLogImport kern eind ──', 'PLLogImport'), s, { filename: 'pidlane-logimport.js' });
const L = s.PLLogImport, V = s.PLVerzamel, T = s.PLTotaal;
const fuel = fs.readFileSync(path.join(dir, 'pidlane-fuel.js'), 'utf8');
const KMH = +(/const MEET_RIJ_KMH = (\d+)/.exec(fuel) || [])[1], GAT = +(/const MEET_RIJ_GAT_MS = (\d+)/.exec(fuel) || [])[1];
s.MEET_RIJ_KMH = KMH; s.MEET_RIJ_GAT_MS = GAT;   // in de app: const in pidlane-fuel.js
if (!KMH || !GAT || !DISCL) { console.log('  FOUT  MEET_RIJ_KMH, MEET_RIJ_GAT_MS of RAPPORT_DISCLAIMER niet gevonden'); process.exit(1); }

// Dezelfde afhankelijkheden als appDeps() in de module, uit de geladen bron.
const deps = {
  V, T, def: s.getPidDef, letOp: s.PID_LET_OP || {}, toestandRegels: s.PID_TOESTAND || {}, kwal: s.assessPidQuality,
  catVan: pid => (s.getPidDef(pid) || {}).cat, volgorde: s.CHK_CAT_ORDER, kmh: KMH, gat: GAT, disclaimer: DISCL,
  samenhang: (hist, auto) => s.PLSamenhang.promptBlok(s.PLSamenhang.lees(hist, s.PLOnderzoek,
    { brandstof: /diesel/i.test(auto || '') ? 'diesel' : 'benzine', vorm: s.PLSamenhang.vormLive() }))
};
const kent = pid => !!s.getPidDef(pid);
const lees = tekst => L.lees(tekst, kent, s.getPidDef);

console.log('\nA. lezen');
const NAMEN = {
  'Engine RPM(rpm)': '010C', 'Speed (OBD)(km/h)': '010D', 'Speed (GPS)(km/h)': null, 'Engine Coolant Temperature(°C)': '0105',
  'Fuel Trim Bank 1 Short Term(%)': '0106', 'Fuel Trim Bank 1 Long Term(%)': '0107', 'Fuel Trim Bank 2 Long Term(%)': '0109',
  'Long term fuel trim - Bank 1': '0107', 'Intake Air Temperature(°C)': '010F', 'Ambient air temperature': '0146',
  'Voltage (Control Module)(V)': '0142', 'Intake Manifold Pressure(psi)': '010B', 'Mass Air Flow Rate(g/s)': '0110',
  'O2 Volts Bank 1 sensor 1(V)': '0114', 'O2 Volts Bank 1 sensor 2(V)': '0115', 'Calculated engine load value': '0104',
  'Throttle Position(Manifold)(%)': '0111', 'Engine Oil Temperature(°C)': '015C', '010C': '010C', '0x0D': '010D', 'Longitude': null
};
const mis = Object.keys(NAMEN).filter(k => { const c = L.kolom(k, kent); return (c ? c.pid : null) !== NAMEN[k]; });
toets('kolomnamen van Torque, Car Scanner en de eigen export → de juiste PID', !mis.length,
  mis.map(k => k + ' → ' + JSON.stringify(L.kolom(k, kent))).join('; '));
const us = lees('Device Time,Engine Coolant Temperature(°F),Speed (OBD)(mph),Intake Manifold Pressure(psi),Mass Air Flow Rate(lb/min)\n' +
  '12-Nov-2026 14:05:00.000,194,50,4.35,1\n12-Nov-2026 14:05:01.500,212,0,14.5,0');
const bijna = (a, b, tol) => Math.abs(a - b) <= (tol || 0.05);
toets('°F, mph, psi en lb/min worden °C, km/h, kPa en g/s',
  bijna(us.hist['0105'][0].v, 90) && bijna(us.hist['010D'][0].v, 80.467) && bijna(us.hist['010B'][1].v, 99.97, 0.1) && bijna(us.hist['0110'][0].v, 7.56),
  JSON.stringify(us.hist));
toets('de tijd van Torque (dd-Mon-jjjj hh:mm:ss.sss) is relatief, in ms', us.hist['0105'][0].t === 0 && us.hist['0105'][1].t === 1500, JSON.stringify(us.hist['0105']));
const cs = lees('"SECONDS";"PID";"VALUE";"UNITS"\n0,5;"Control module voltage";14,12;"V"\n1,5;"Control module voltage";13,98;"V"\n2;"Engine coolant temperature";88;"Kelvinachtig"');
toets('Car Scanner: lang formaat, komma als decimaalteken', cs.formaat === 'lang' && cs.hist['0142'].length === 2 && bijna(cs.hist['0142'][1].v, 13.98) && cs.hist['0142'][1].t === 1000, JSON.stringify(cs.hist));
toets('een onbekende eenheid laat de sensor weg, met een waarschuwing', !cs.hist['0105'] && cs.waarschuwingen.some(w => /kelvinachtig/i.test(w)), JSON.stringify(cs.waarschuwingen));
const vin = lees('# AUTO: Golf, VIN WVWZZZ1KZAW000009\nt_ms,VIN,010C\n0,WVWZZZ1KZAW000009,800\n1000,WVWZZZ1KZAW000009,810');
toets('een VIN-kolom wordt niet gelezen en de VIN gaat uit de kop', !JSON.stringify(vin).includes('WVWZZZ1KZAW000009') && vin.hist['010C'].length === 2, JSON.stringify(vin.kop));
const leeg = lees('Device Time,Horsepower(hp)\n12-Nov-2026 14:05:00,90');
toets('geen herkende sensor = geen pids, wel de onbekende kolom genoemd', leeg.pids.length === 0 && leeg.onbekend.indexOf('Horsepower(hp)') >= 0, JSON.stringify(leeg));
toets('zonder tijdkolom: niets, met de reden', lees('Engine RPM(rpm)\n800').waarschuwingen.some(w => /tijdkolom/.test(w)));

const vt = L.voertuig(L.kop(['# AUTO: Volkswagen Golf 1.4 TSI benzine 2010, VIN WVWZZZ1KZAW000002']).auto);
toets('het voertuig van de log komt uit de AUTO-regel, zonder VIN', vt.merk === 'Volkswagen' && vt.model === 'Golf 1.4 TSI' && vt.year === '2010' && vt.brandstof === 'benzine', JSON.stringify(vt));
toets('zonder AUTO-regel: een leeg voertuig, niet dat van de app', JSON.stringify(L.voertuig(null)) === '{}');

console.log('\nB. de scenariologs');
const bestanden = fs.readdirSync(SCEN).filter(f => f.endsWith('.csv')).sort();
toets('er staan scenariologs in scenariolog/', bestanden.length >= 6, bestanden.join(', '));
const uitslag = {};
bestanden.forEach(f => {
  const imp = lees(fs.readFileSync(path.join(SCEN, f), 'utf8'));
  const o = L.oordeel(imp.hist, deps);
  const p = L.prompt(imp, o, deps);
  uitslag[f] = { imp, o, p };
  const naam = imp.kop.scenario || f;
  toets(naam + ': de log is gelezen (' + imp.formaat + ', ' + imp.pids.length + ' sensoren, ' + imp.sec + ' s)', imp.pids.length >= 3 && imp.sec > 600, JSON.stringify(imp.waarschuwingen));
  const vg = L.vergelijk(o, imp.kop);
  toets(naam + ': basisoordeel van de app = "' + (imp.kop.basis && imp.kop.basis.ruw) + '"', vg && vg.klopt, vg ? 'kreeg: ' + vg.kreeg : 'de kop heeft geen BASIS');
  toets(naam + ': heeft minstens één SIGNAAL', imp.kop.signalen.length > 0);
  imp.kop.signalen.forEach(sg => { const r = L.signaal(sg, o, p); toets(naam + ': de AI ziet ' + r.uitleg, r.ok); });
  const lek = ['SCENARIO', 'AI MOET', 'AI MAG NIET', 'SIGNAAL', 'BASIS:', naam].filter(w => p.indexOf(w) >= 0);
  toets(naam + ': de verwachting uit de kop staat niet in de prompt', !lek.length, 'gevonden: ' + lek.join(', '));
  toets(naam + ': de prompt draagt het basisoordeel en de disclaimer', p.indexOf('BASISOORDEEL VAN DE APP') >= 0 && p.indexOf(o.regel) >= 0 && p.indexOf(DISCL) >= 0);
});

console.log('\nC. de toets onderscheidt');
const g = uitslag['gezond.csv'], a = uitslag['arm-mengsel.csv'];
if (!g || !a) { console.log('  FOUT  gezond.csv of arm-mengsel.csv ontbreekt'); process.exit(1); }
toets('een verkeerde BASIS in de kop is rood', L.vergelijk(g.o, L.kop(['# BASIS: let op / Brandstof'])).klopt === false);
toets('de juiste toestand, de verkeerde categorie is rood', L.vergelijk(a.o, L.kop(['# BASIS: let op / Temp'])).klopt === false);
toets('een signaal dat niet klopt is rood', L.signaal('stil:0107 min>=17', g.o, g.p).ok === false);
toets('een signaal over een sensor die er niet is, is rood', L.signaal('0114 max>0', uitslag['niet-gemeten.csv'].o, uitslag['niet-gemeten.csv'].p).ok === false);
toets('een signaal dat de AI niet te zien krijgt is rood', L.signaal('stil:0107 min>=17', a.o, a.p.replace(/Brandstoftrim lang B1:/g, 'x')).ok === false);
toets('een onleesbaar signaal is rood, niet stil groen', L.signaal('0107 ongeveer 5', a.o, a.p).ok === false);

if (process.env.PL_PROMPT) console.log(uitslag[process.env.PL_PROMPT].p);
console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
