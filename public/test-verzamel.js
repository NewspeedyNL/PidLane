// ══════════════════════════════════════════════════════════════════
// test-verzamel.js — het verzamelscherm vóór een AI-rapport (07-10-2026)
// ──────────────────────────────────────────────────────────────────
// Draait de échte pidlane-verzamel.js met de échte PID-definities en
// PID_LET_OP uit pidlane-data.js en de échte assessPidQuality uit
// pidlane-kwaliteit.js. Geen eigen grenzen: een koelwater van 112 °C is hier
// afwijkend omdat ALL_PID_DEFS['0105'].dH op 110 staat, niet omdat deze test
// dat vindt.
//
//   A. het oordeel per sensor over het hele venster, niet over de laatste waarde
//   B. de volgorde: wat opvalt bovenaan
//   C. wat de AI krijgt (promptBlok)
//   D. wanneer het scherm klaar is (fase) — de poort blijft die van §16
//   E. runQuickAI: geen AI zonder "ja", en de AI krijgt de samenvatting
//
// Draaien vanuit public/:  node test-verzamel.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
const dir = __dirname;

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

// ── de app, zo echt als het zonder DOM kan ────────────────────────
const s = { console: { warn() {}, error() {}, log() {} } };
s.window = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync(dir + '/pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
if (!s.ALL_PID_DEFS || !s.ALL_PID_DEFS['0105']) { console.log('  FOUT  ALL_PID_DEFS niet geladen'); process.exit(1); }
s.pidHist = {};
s.getPidDef = (pid) => s.ALL_PID_DEFS[pid] || null;
const kw = fs.readFileSync(dir + '/pidlane-kwaliteit.js', 'utf8');
const van = kw.indexOf('function assessPidQuality');
const tot = kw.indexOf('\n}', van) + 2;
if (van < 0) { console.log('  FOUT  assessPidQuality niet gevonden in pidlane-kwaliteit.js'); process.exit(1); }
vm.runInContext('function fv(x){ return String(Math.round(x*10)/10); }\n' + kw.slice(van, tot), s, { filename: 'pidlane-kwaliteit.js' });
vm.runInContext(fs.readFileSync(dir + '/pidlane-verzamel.js', 'utf8'), s, { filename: 'pidlane-verzamel.js' });
const V = s.PLVerzamel;
if (!V || typeof V.samenvatting !== 'function') { console.log('  FOUT  PLVerzamel niet geladen'); process.exit(1); }

const reeks = (vals) => vals.map((v, i) => ({ t: 1000 * i, v }));
const zet = (h) => { Object.keys(s.pidHist).forEach(k => delete s.pidHist[k]); Object.assign(s.pidHist, h); };
const een = (pid, vals) => { zet({ [pid]: reeks(vals) }); return V.samenvatting([pid]).rijen[0]; };
const rond = (lo, hi, k) => Array.from({ length: k || 20 }, (_, i) => lo + (hi - lo) * (i % 5) / 4);

console.log('A. Het oordeel per sensor, over het hele venster');
{
  const r = een('0105', rond(85, 95));
  toets('koelwater 85–95 °C: binnen het gebruikelijke bereik', r.oordeel === 'ok', JSON.stringify(r));
  toets('met min, max en gemiddelde', r.min === 85 && r.max === 95 && Math.abs(r.gem - 90) < 0.01 && r.n === 20, JSON.stringify(r));
}
{
  // De kern van dit scherm: de laatste waarde is gewoon, maar onderweg kwam
  // hij boven de alarmgrens. Een momentopname had dit gemist.
  const v = rond(85, 95); v[7] = 112;
  const r = een('0105', v);
  toets('koelwater even 112 °C, laatste 95: afwijkend (alarmgrens dH 110)', r.oordeel === 'afwijkend', JSON.stringify(r));
  toets('en hij telt hoe vaak: 1 van 20', r.buiten === 1 && /alarmgrens/.test(r.reden), JSON.stringify(r));
}
{
  const r = een('0105', rond(90, 104));
  toets('koelwater tot 104 °C: let op (waarschuwingsgrens wH 100)', r.oordeel === 'let', JSON.stringify(r));
}
{
  const r = een('0142', rond(10.2, 12.4));
  toets('accu tot 10,2 V: afwijkend (dL 10,5)', r.oordeel === 'afwijkend' && /laagste/.test(r.reden), JSON.stringify(r));
  const r2 = een('0142', rond(11.2, 12.4));
  toets('accu tot 11,2 V: let op (wL 11,5)', r2.oordeel === 'let', JSON.stringify(r2));
}
{
  // Geen wH/wL in de definitie, wel in PID_LET_OP: de reden komt daaruit.
  const r = een('010E', rond(5, 58));
  toets('ontsteking tot 58°: let op uit PID_LET_OP, met de reden van daar', r.oordeel === 'let' && r.reden === s.PID_LET_OP['010E'].waarom, JSON.stringify(r));
}
{
  const v = rond(85, 95); v[3] = 300;
  const r = een('0105', v);
  toets('koelwater 300 °C is een meetfout, geen afwijking', r.oordeel === 'meetfout', JSON.stringify(r));
}
{
  const r = een('010C', Array(12).fill(800));
  toets('toerental dat exact vaststaat: twijfel over de meting', r.oordeel === 'twijfel' && /vast/.test(r.reden), JSON.stringify(r));
  zet({});
  const r2 = V.samenvatting(['0105']).rijen[0];
  toets('geen monsters: geen data', r2.oordeel === 'nodata' && r2.n === 0, JSON.stringify(r2));
}

console.log('\nB. Wat opvalt staat bovenaan');
let sam;
{
  const hoog = rond(85, 95); hoog[7] = 112;
  zet({ '010C': reeks(rond(750, 2400)), '0105': reeks(hoog), '0142': reeks(rond(11.2, 14.2)), '0106': reeks(rond(-3, 3)) });
  sam = V.samenvatting(['010C', '0106', '0142', '0105', '0110']);
  const volg = sam.rijen.map(r => r.pid + ':' + r.oordeel);
  toets('afwijkend, dan let op, dan gewoon, dan geen data', volg.join(' ') === '0105:afwijkend 0142:let 0106:ok 010C:ok 0110:nodata' ||
       (volg[0] === '0105:afwijkend' && volg[1] === '0142:let' && volg[volg.length - 1] === '0110:nodata'), volg.join(' '));
  toets('opvallend telt afwijkend + let op', sam.opvallend === 2 && sam.tel.nodata === 1, JSON.stringify(sam.tel));
}

console.log('\nC. Wat de AI krijgt');
{
  const p = V.promptBlok(sam, { sec: 75, rijSec: 0 });
  const opv = p.slice(p.indexOf('OPVALLEND'), p.indexOf('BINNEN HET GEBRUIKELIJKE'));
  toets('een kop met de duur van het venster', /GEMETEN OVER HET MEETVENSTER \(75 s/.test(p), p.slice(0, 160));
  toets('koelwater staat onder OPVALLEND, met min–max en aantal buiten de grens', /Koelwater temp: 85–112 °C/.test(opv) && /1 daarvan buiten de grens/.test(opv), opv);
  toets('het toerental staat onder binnen het bereik, niet onder opvallend', !/Motortoerental/.test(opv) && /BINNEN[\s\S]*Motortoerental/.test(p), p);
  toets('sensoren zonder data worden genoemd, met de regel erbij', /GEEN DATA ONTVANGEN: [^\n]*\. Doe geen uitspraken/.test(p), p);
  toets('de AI hoort dat "opvallend" een vlag is en geen diagnose', /nog geen diagnose/.test(p) && /toestand van de motor/.test(p));
  toets('lege samenvatting: geen blok', V.promptBlok({ rijen: [] }) === '' && V.promptBlok(null) === '');
}

console.log('\nD. Wanneer het scherm klaar is');
{
  const t = (o) => V.fase(Object.assign({ verbonden: true, ok: true, kernCompleet: null, verstreken: 20000, minMs: 10000, maxMs: 105000 }, o));
  toets('poort gehaald, minimumtijd voorbij: klaar', t({}) === 'klaar');
  toets('poort gehaald maar net begonnen: nog meten (de klant ziet de data binnenkomen)', t({ verstreken: 3000 }) === 'meten');
  toets('kernsensoren nog niet compleet: nog meten', t({ kernCompleet: false }) === 'meten');
  toets('kernsensoren compleet: klaar', t({ kernCompleet: true }) === 'klaar');
  toets('poort niet gehaald, tijd nog niet om: meten', t({ ok: false }) === 'meten');
  toets('poort niet gehaald en de tijd is om: tijd (met beperking)', t({ ok: false, verstreken: 105000 }) === 'tijd');
  toets('verbinding weg: los, ook tijdens de minimumtijd', t({ verbonden: false, verstreken: 1000 }) === 'los');
}

(async () => {
console.log('\nE. runQuickAI: eerst het scherm, dan pas de AI');
{
  const fuel = fs.readFileSync(dir + '/pidlane-fuel.js', 'utf8');
  const a = fuel.indexOf('async function runQuickAI(opts){');
  const b = fuel.indexOf('\n}\n', a) + 3;   // het eind van de functie
  if (a < 0 || b < 3) { console.log('  FOUT  runQuickAI() niet gevonden in pidlane-fuel.js — deze test toetst niets meer'); process.exit(1); }
  const RUN = fuel.slice(a, b);
  const maak = (uit) => {
    const c = { console: { warn() {} }, verstuurd: [], gevraagd: [], pane: 0,
      PLVerzamel: { meet: (o) => { c.gevraagd.push(o); return Promise.resolve(uit); }, promptBlok: V.promptBlok },
      activateAIPane() { c.pane++; }, getVehicle: () => ({ merk: 'Mazda', model: 'CX-5', year: 2018 }),
      plMeetPromptBlok: () => '', correlationLines: () => [], _qualityBlokFor: () => '', formatDtcCodes: () => 'geen',
      dtcCodes: [], activePIDs: new Set(['0105']), isReportableSensor: () => true,
      pidVals: { '0105': 90 }, getPidDef: () => ({ name: 'Koelwater temp', unit: '°C' }), fv: String,
      document: { getElementById: () => ({ disabled: false }) } };
    c.callAI = (p, el, aan) => { c.verstuurd.push({ p, aan }); return Promise.resolve(); };
    vm.createContext(c); vm.runInContext(RUN, c); return c;
  };
  const nee = maak({ door: false, ai: false });
  await nee.runQuickAI();
  toets('"Sluiten zonder AI": er gaat niets naar de AI', nee.verstuurd.length === 0 && nee.pane === 0, 'verstuurd=' + nee.verstuurd.length);
  toets('het scherm meet met de basisset', nee.gevraagd[0] && nee.gevraagd[0].profiel === 'basis');
  const verder = maak({ door: true, ai: false, sam });
  await verder.runQuickAI();
  toets('ook "door" zonder ja op de AI-vraag verstuurt niets', verder.verstuurd.length === 0);
  const ja = maak({ door: true, ai: true, sam, sec: 75, rijSec: 0 });
  await ja.runQuickAI({ klacht: 'temperatuurmeter loopt op in de file' });
  const p = (ja.verstuurd[0] || {}).p || '';
  toets('TEGENPROEF: na "Laat de AI dit onderzoeken" gaat het rapport wel', ja.verstuurd.length === 1, 'verstuurd=' + ja.verstuurd.length);
  toets('de AI krijgt de samenvatting over het venster, niet de laatste waarde', /Koelwater temp: 85–112 °C/.test(p) && !/Koelwater temp: 90 °C/.test(p), p.slice(0, 600));
  toets('de klacht van de AI-monteur staat in de prompt en is de vraag van de aanlevering',
    /Klacht van de gebruiker: temperatuurmeter loopt op/.test(p) && ja.verstuurd[0].aan.vraag === 'temperatuurmeter loopt op in de file', p.slice(0, 300));
  toets('het scherm noemt dan de AI-monteur', ja.gevraagd[0].watVoor === 'de AI-monteur');
  const knop = maak({ door: true, ai: true, sam });
  await knop.runQuickAI({ type: 'click' });   // een onclick kan een event meegeven
  toets('een klik-event is geen klacht', knop.verstuurd.length === 1 && !/Klacht van de gebruiker/.test(knop.verstuurd[0].p));
}

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
process.exit(fout ? 1 : 0);
})();
