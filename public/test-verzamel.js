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

console.log('\nF. Rijtijd, momentopnames en een gegeven bron');
{
  const f = fs.readFileSync(dir + '/pidlane-fuel.js', 'utf8');
  const c = (naam) => Number((f.match(new RegExp('const ' + naam + ' *= *(\\d+);')) || [])[1]);
  s.MEET_RIJ_KMH = c('MEET_RIJ_KMH'); s.MEET_RIJ_GAT_MS = c('MEET_RIJ_GAT_MS');
  toets('de rijdrempels komen uit pidlane-fuel.js', s.MEET_RIJ_KMH > 0 && s.MEET_RIJ_GAT_MS > 0);
  const snel = [0, 20, 30, 40, 50, 10].map((v, i) => ({ t: i * 2000, v }));
  toets('rijtijd: alleen stukken waarin beide monsters boven de drempel liggen', V.rijSecUit(snel) === 6, String(V.rijSecUit(snel)));
  const gat = [{ t: 0, v: 50 }, { t: 2000, v: 50 }, { t: 60000, v: 50 }];
  toets('een gat langer dan MEET_RIJ_GAT_MS telt niet als rijden', V.rijSecUit(gat) === 2, String(V.rijSecUit(gat)));
  toets('geen snelheid: null, niet 0', V.rijSecUit([]) === null && V.rijSecUit(undefined) === null);
  const h = V.histUit([{ t: 0, coolant: 80, rpm: 800 }, { t: 2000, coolant: 82, rpm: null }], { coolant: '0105', rpm: '010C' });
  toets('momentopnames worden reeksen per PID, zonder lege waarden', h['0105'].length === 2 && h['010C'].length === 1 && h['0105'][1].v === 82, JSON.stringify(h));
  s.isReportableSensor = () => true;
  const v = rond(85, 95); v[7] = 112;
  const sb = V.vanBron({ hist: { '0105': reeks(v), '010C': [] } });
  toets('een gegeven bron krijgt hetzelfde oordeel als het scherm', sb.rijen[0].pid === '0105' && sb.rijen[0].oordeel === 'afwijkend' && sb.rijen.length === 1, JSON.stringify(sb.rijen.map(r => r.pid)));
}

console.log('\nG. Het scherm zelf: bron, de rit van zojuist, terugkeer na een rijtest, hergebruik, tellers');
{
  // Een DOM die alleen doet wat meet() vraagt: elementen op id, en een klik
  // die via ov.onclick binnenkomt zoals in de app.
  const el = {};
  const maak = (id) => (el[id] = el[id] || { id, style: {}, innerHTML: '', textContent: '' });
  s.document = { getElementById: (id) => el[id] || (['plVzOv'].indexOf(id) >= 0 ? null : maak(id)),
                 createElement: () => {
                   // Zoals de echte DOM: wie de kaart opnieuw vult, gooit de oude
                   // kop, tekst en knoppen weg.
                   let html = '';
                   return { style: {}, get innerHTML() { return html; },
                            set innerHTML(v) { html = v; Object.keys(el).forEach(k => { if (k !== 'plVzOv') delete el[k]; }); } };
                 },
                 body: { appendChild: (e) => { el[e.id] = e; } } };
  s.setInterval = () => 0; s.clearInterval = () => {}; s.setTimeout = (fn) => { s.__uitgesteld.push(fn); return 0; };
  s.__uitgesteld = [];
  s.logs = []; s.log = (m) => s.logs.push(String(m));
  s.MEET_EIS = { normaal: { sec: 60, n: 15, naam: 'stilstaande meting' }, rit: { sec: 180, n: 40, rij: 90, naam: 'meting onder belasting' }, kortrit: { sec: 90, rij: 30 } };
  s.plMeetNiveau = (x) => x; s.KERN_REEKS_MIN = 10; s.KERN_MAX_WACHT_MS = 45000; s.KERN_VERLENG_MS = 30000; s.MEET_BEVESTIGD_MS = 120000;
  s.plKernStatus = () => null; s.connected = true; s.demoMode = false; s.activePIDs = new Set(['0105']);
  s.tekort = { ok: true, tekort: [], st: { sec: 70, rijSec: 0 }, rijTekort: false };
  s.plMeetTekort = () => s.tekort;
  s.ritBron = null; s.plRitBron = () => s.ritBron;
  s.ritGestart = null; s.openRitAnalyse = (m) => { s.ritGestart = m; };
  const g = (id) => el[id] || { innerHTML: '', textContent: '' };   // wat er nu in beeld staat
  const klik = (a) => el.plVzOv.onclick({ target: { closest: () => ({ getAttribute: () => a }) } });
  const wacht = () => new Promise((r) => setImmediate(r));

  toets('vóór de eerste uitslag is elke maat null', ['verzamel-uitslagen', 'verzamel-afwijkend', 'verzamel-ai-pct', 'verzamel-hergebruik', 'verzamel-na-rit'].every(m => V.maat(m) === null));

  // 1. Een gegeven bron (de datalog): meteen de uitslag, geen poort.
  const piek = rond(85, 95); piek[7] = 112;
  let u = null;
  V.meet({ bron: { naam: 'de datalog', hist: { '0105': reeks(piek) }, sec: 20, rijSec: null }, watVoor: 'proef' }).then(x => { u = x; });
  await wacht();
  toets('gegeven bron: meteen "Data verzameld" met de AI-knop', /verzameld/.test(g('plVzKop').textContent) && /data-a="ai"/.test(g('plVzKnoppen').innerHTML), g('plVzKop').textContent);
  toets('en zonder "Langer meten": een datalog kun je niet verlengen', !/data-a="langer"/.test(g('plVzKnoppen').innerHTML));
  klik('ai'); await wacht();
  toets('ja op de AI: de uitkomst draagt de samenvatting en de duur van de bron', u && u.ai && u.sec === 20 && u.bron === 'de datalog' && u.sam.rijen[0].oordeel === 'afwijkend', JSON.stringify(u && { ai: u.ai, sec: u.sec, bron: u.bron }));
  toets('de uitslag staat in het log, met wat opviel', s.logs.some(m => /Verzamelscherm — proef: uitslag/.test(m) && /valt op: Koelwater temp 85–112/.test(m)), s.logs.slice(-1)[0]);
  toets('tellers: één uitslag, één rode vlag, koelwater één keer, AI 100%', V.maat('verzamel-uitslagen') === 1 && V.maat('verzamel-afwijkend') === 1 && V.maat('verzamel-koelwater') === 1 && V.maat('verzamel-ai-pct') === 100,
    ['uitslagen', 'afwijkend', 'koelwater', 'ai-pct'].map(m => V.maat('verzamel-' + m)).join(','));

  // 2. Net verzameld: de volgende analyse meet niet opnieuw.
  u = null;
  s.pidHist['0105'] = reeks(rond(85, 95));
  V.meet({ niveau: 'normaal', profiel: false, watVoor: 'tweede module' }).then(x => { u = x; });
  await wacht(); await wacht();
  toets('binnen de termijn: meteen de uitslag, zonder tien seconden te meten', /verzameld/.test(g('plVzKop').textContent) && /data-a="langer"/.test(g('plVzKnoppen').innerHTML), g('plVzKop').textContent);
  toets('en dat telt als hergebruik', V.maat('verzamel-hergebruik') === 1, String(V.maat('verzamel-hergebruik')));
  klik('annuleer'); await wacht();
  toets('sluiten zonder AI: door en ai allebei false, en de AI-score zakt naar 50%', u && u.door === false && u.ai === false && V.maat('verzamel-ai-pct') === 50, JSON.stringify(u) + ' ' + V.maat('verzamel-ai-pct'));

  // 3. Te oud: geen hergebruik. De poort staat open, dus het enige dat het
  // scherm nog laat meten is de minimumtijd — en die hoort hier te gelden.
  s._plVerzameld.ts = Date.now() - 10 * 60 * 1000;
  s.tekort = { ok: true, tekort: [], st: { sec: 70, rijSec: 0 }, rijTekort: false };
  u = null;
  V.meet({ niveau: 'normaal', profiel: false }).then(x => { u = x; });
  await wacht(); await wacht();
  toets('TEGENPROEF: een meting van tien minuten geleden telt niet, het scherm meet', /haal ik de sensoren binnen/.test(g('plVzSub').innerHTML) && !/verzameld/.test(g('plVzKop').textContent), g('plVzKop').textContent + ' | ' + g('plVzSub').innerHTML.slice(0, 80));
  klik('annuleer'); await wacht();

  // 4. De rit van zojuist is de meting, als hij vers is en genoeg rijtijd heeft.
  s.ritBron = { naam: 'de rit van zojuist', hist: { '0105': reeks(rond(80, 98)) }, rit: true, eind: Date.now() - 60000, sec: 600, rijSec: 400 };
  u = null;
  V.meet({ niveau: 'rit', profiel: false, watVoor: 'verbruik' }).then(x => { u = x; });
  await wacht();
  toets('na een rit: de uitslag komt uit die rit', /de rit van zojuist/.test(g('plVzSub').innerHTML) && /data-a="opnieuw"/.test(g('plVzKnoppen').innerHTML), g('plVzSub').innerHTML.slice(0, 120));
  klik('ai'); await wacht();
  toets('de uitkomst noemt de rit als bron, met zijn rijtijd', u && u.bron === 'de rit van zojuist' && u.rijSec === 400 && u.sec === 600, JSON.stringify(u && { bron: u.bron, rijSec: u.rijSec }));
  toets('en telt als uitslag uit een rit', V.maat('verzamel-na-rit') === 1);
  s.ritBron.rijSec = 30;
  V.meet({ niveau: 'rit', profiel: false }).then(x => { u = x; });
  await wacht(); await wacht();
  toets('TEGENPROEF: te weinig gereden voor dit niveau — de rit telt niet', !/de rit van zojuist/.test(g('plVzSub').innerHTML), g('plVzSub').innerHTML.slice(0, 120));
  klik('annuleer'); await wacht();
  s.ritBron.rijSec = 400; s.ritBron.eind = Date.now() - 20 * 60 * 1000;
  V.meet({ niveau: 'rit', profiel: false }).then(x => { u = x; });
  await wacht(); await wacht();
  toets('TEGENPROEF: een rit van twintig minuten geleden telt niet', !/de rit van zojuist/.test(g('plVzSub').innerHTML), g('plVzSub').innerHTML.slice(0, 120));
  klik('annuleer'); await wacht();
  s.ritBron = null;

  // 5. Rijtest vanuit het scherm: daarna komt de analyse terug.
  s.tekort = { ok: false, tekort: ['niet gereden'], st: { sec: 70, rijSec: 0 }, rijTekort: true };
  let terug = 0;
  u = null;
  V.meet({ niveau: 'rit', profiel: false, naRit: () => { terug++; } }).then(x => { u = x; });
  await wacht(); await wacht();
  toets('te weinig gereden: het scherm biedt een rijtest aan', /data-a="rit"/.test(g('plVzKnoppen').innerHTML), g('plVzKnoppen').innerHTML);
  klik('rit'); await wacht();
  toets('de rijtest start (10 minuten), het scherm sluit zonder AI', s.ritGestart === '10min' && u && u.rit === true && u.ai === false, s.ritGestart + ' ' + JSON.stringify(u));
  s.__uitgesteld.length = 0;
  toets('na de rit: naRit() zegt ja en start de analyse opnieuw', V.naRit() === true && s.__uitgesteld.length === 1);
  s.__uitgesteld.forEach(f => f());
  toets('precies één keer', terug === 1 && V.naRit() === false, 'terug=' + terug);
}

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
process.exit(fout ? 1 : 0);
})();
