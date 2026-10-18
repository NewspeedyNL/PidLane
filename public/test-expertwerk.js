// ═══════════════════════════════════════════════════════════════════
// test-expertwerk.js — de werkplek van de expert op een laptop (18-10-2026)
// ───────────────────────────────────────────────────────────────────
// Laadt de échte PLOnderzoek, DTC_PLAN, AUTO_KENNIS en PLVoorkennis, en toetst
// PLExpertWerk:
//  - de meting: een laptop is een laptop, een telefoon, tablet of de APK niet;
//    een eigen keuze wint in beide richtingen;
//  - procedures zijn van DÉZE auto: een 1.4 TSI van 2010 krijgt de
//    kettingprocedure, dezelfde VW als 2.0 TDI niet;
//  - een procedure komt uit de bestaande tabellen: meetstappen uit
//    PLOnderzoek.STAPPEN die de hypothese toetsen, de werkplaatsactie uit
//    VERDENKINGEN, en het controleplan uit dtcPlan();
//  - wat nu afwijkt: foutcodes, mode 06 en zieke sensoren — en niets bij
//    een gezonde auto;
//  - markup van de peer bereikt de HTML van de expert niet.
// Wat in de echte app gebeurt (venster, garagemodus): bproef-expertwerk.js.
//
// Draaien vanuit public/:  node test-expertwerk.js   (exit 0 = goed)
// ═══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); return; }
  fouten++; console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : ''));
}

const s = {};
s.window = s; s.globalThis = s;
s.console = { log() { }, warn() { }, error() { }, info() { } };
s.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, addEventListener() { } }), addEventListener() { }, head: { appendChild() { } }, body: { appendChild() { } } };
s.addEventListener = () => { };
s.navigator = {};
s.setTimeout = (fn) => { fn(); return 0; };
s.setInterval = () => 0; s.clearTimeout = () => { }; s.clearInterval = () => { };
vm.createContext(s);
['pidlane-data.js', 'pidlane-foutcodes.js', 'pidlane-mode06.js', 'pidlane-onderzoek.js', 'pidlane-voorkennis.js', 'pidlane-expertwerk.js'].forEach((f) =>
  vm.runInContext(fs.readFileSync(__dirname + '/' + f, 'utf8'), s, { filename: f }));
const mt = fs.readFileSync(__dirname + '/pidlane-motortype.js', 'utf8');
const ki = mt.indexOf('function autoKennisVoorMerk(merk, brandstof, auto){'), kj = mt.indexOf('\n}\n', ki);
if (ki < 0 || kj < 0) { console.log('FOUT autoKennisVoorMerk() staat niet meer in pidlane-motortype.js'); process.exit(1); }
vm.runInContext(mt.slice(ki, kj + 2), s, { filename: 'autoKennisVoorMerk' });

const EW = s.PLExpertWerk, VK = s.PLVoorkennis, O = s.PLOnderzoek, plan = s.dtcPlan;
if (!EW || !VK || !O || typeof plan !== 'function') { console.log('FOUT een module ontbreekt'); process.exit(1); }
const vk = (extra) => VK.bouw(Object.assign({ onderzoek: O, dtcInfo: (c) => ({ desc: 'omschrijving ' + c }) }, extra));

console.log('\n1. Is dit een laptop?');
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
{
  const lap = EW.isLaptop({ ua: CHROME, breed: 1440, fijn: true, hover: true });
  toets('Chrome op een laptop: laptop, en de browser heet Chrome', lap.laptop && lap.browser === 'Chrome', JSON.stringify(lap));
  toets('Edge telt ook, met zijn eigen naam', EW.isLaptop({ ua: CHROME + ' Edg/141.0', breed: 1440, fijn: true, hover: true }).browser === 'Edge');
  toets('een telefoon in Chrome niet', !EW.isLaptop({ ua: ANDROID, breed: 412, fijn: false, hover: false }).laptop);
  toets('een telefoon die zich als desktop voordoet ook niet (geen muis)', !EW.isLaptop({ ua: CHROME, breed: 1100, fijn: false, hover: false }).laptop);
  toets('een iPad met muis niet', !EW.isLaptop({ ua: IPAD, breed: 1180, fijn: true, hover: true }).laptop);
  toets('de APK op een groot scherm niet', !EW.isLaptop({ ua: CHROME, breed: 1440, fijn: true, hover: true, capacitor: true }).laptop);
  const smal = EW.isLaptop({ ua: CHROME, breed: 800, fijn: true, hover: true });
  toets('een smal browservenster niet, met de reden erbij', !smal.laptop && smal.redenen.some((r) => /smaller/.test(r)), JSON.stringify(smal));
  toets('grens: precies ' + EW.LAPTOP_BREED + ' px is een laptop', EW.isLaptop({ ua: CHROME, breed: EW.LAPTOP_BREED, fijn: true, hover: true }).laptop);
}

console.log('\n2. De eigen keuze wint');
{
  const lap = EW.isLaptop({ ua: CHROME, breed: 1440, fijn: true, hover: true });
  const tel = EW.isLaptop({ ua: ANDROID, breed: 412 });
  toets('automatisch volgt de meting', EW.actiefVoor('auto', lap) === true && EW.actiefVoor('auto', tel) === false);
  toets('aan wint van een telefoon', EW.actiefVoor('aan', tel) === true);
  toets('uit wint van een laptop', EW.actiefVoor('uit', lap) === false);
  toets('een onbekende stand is automatisch', EW.actiefVoor('roze', lap) === true && EW.actiefVoor(null, tel) === false);
  toets('wisselen loopt rond: auto → aan → uit → auto', EW.volgendeStand('auto') === 'aan' && EW.volgendeStand('aan') === 'uit' && EW.volgendeStand('uit') === 'auto');
  toets('de knoptekst zegt wat er gemeten is', /laptop gemeten \(Chrome\)/.test(EW.standTekst('auto', lap)) && /geen laptop/.test(EW.standTekst('auto', tel)));
}

console.log('\n3. Procedures voor déze auto');
{
  const tsi = s.autoKennisVoorMerk('Volkswagen', 'Benzine', { cc: 1390, jaar: 2010 });
  const tdi = s.autoKennisVoorMerk('Volkswagen', 'Diesel', { cc: 1968, jaar: 2016 });
  const pTsi = EW.procedures(vk({ kennis: tsi }), O, plan);
  const pTdi = EW.procedures(vk({ kennis: tdi }), O, plan);
  const ketting = (l) => l.find((p) => /ketting/i.test(p.titel));
  toets('een 1.4 TSI van 2010 krijgt de kettingprocedure', !!ketting(pTsi), pTsi.map((p) => p.titel).join(' | '));
  toets('een 2.0 TDI van 2016 niet', !ketting(pTdi), pTdi.map((p) => p.titel).join(' | '));
  toets('de TDI krijgt wel zijn EGR-procedure', pTdi.some((p) => /EGR/.test(p.titel)), pTdi.map((p) => p.titel).join(' | '));
  const k = ketting(pTsi) || { stappen: [] };
  const metingen = k.stappen.filter((x) => x.soort === 'meten');
  const stapIds = O.STAPPEN.filter((st) => !st.altijdEerst && st.test && (st.test.distributie || 0) >= 1.5).map((st) => st.id);
  toets('de meetstappen komen uit PLOnderzoek.STAPPEN en toetsen de ketting', metingen.length > 0 && metingen.every((m) => stapIds.indexOf(m.id) >= 0),
    JSON.stringify(metingen.map((m) => m.id)) + ' vs ' + JSON.stringify(stapIds));
  toets('de zwaarste toets van de ketting staat eerst', metingen[0] && O.STAPPEN.find((st) => st.id === metingen[0].id).test.distributie ===
    Math.max.apply(null, stapIds.map((id) => O.STAPPEN.find((st) => st.id === id).test.distributie)));
  toets('en de werkplaatsactie is die van VERDENKINGEN', k.stappen.some((x) => x.soort === 'werkplaats' && x.tekst === O.VERDENKINGEN.distributie.vervolg));
  toets('de snelle scan staat in geen enkele procedure (geldt voor elke klacht)', pTsi.concat(pTdi).every((p) => p.stappen.every((x) => x.id !== 'codes')));
  toets('hoogstens drie meetstappen per procedure', pTsi.every((p) => p.stappen.filter((x) => x.soort === 'meten').length <= 3));

  const metCode = EW.procedures(vk({ codes: ['P0128'], kennis: { merk: 'kia', zwak: [] } }), O, plan);
  const c = metCode.find((p) => p.bron === 'code');
  toets('een foutcode krijgt zijn controleplan uit DTC_PLAN', c && /^P0128/.test(c.titel) && c.stappen.map((x) => x.tekst).join('|') === plan('P0128').stappen.join('|'),
    JSON.stringify(c));
  toets('…met de kosten erbij', c && /€120–400/.test(c.waarom), c && c.waarom);
  toets('de code maakt ook een verdenking met bewijs (thermostaat)', metCode.some((p) => p.bron === 'kans' && /Thermostaat/.test(p.titel)), metCode.map((p) => p.titel).join(' | '));
  toets('zonder dtcPlan: geen codeprocedure, de rest blijft', EW.procedures(vk({ codes: ['P0128'] }), O, null).every((p) => p.bron !== 'code'));
  toets('zonder kennis en codes: geen procedures', EW.procedures(vk({}), O, plan).length === 0);
}

console.log('\n4. Wat nu afwijkt');
{
  const gezond = EW.afwijkingen({ voorkennis: vk({}), health: {}, dtc: [] });
  toets('een gezonde auto: niets', gezond.length === 0, JSON.stringify(gezond));
  const ziek = EW.afwijkingen({ voorkennis: vk({ codes: ['P0301'] }), health: { '0110': 'nodata', '0105': 'onzin' }, dtc: ['P0301'] });
  toets('een foutcode van nu staat rood, één keer', ziek.filter((a) => /^P0301/.test(a.tekst)).length === 1 && ziek.find((a) => /^P0301/.test(a.tekst)).ernst === 'rood', JSON.stringify(ziek));
  toets('zieke sensoren staan erbij, in gewone taal', ziek.some((a) => /0110: geeft geen antwoord/.test(a.tekst)) && ziek.some((a) => /0105: onwaarschijnlijke/.test(a.tekst)), JSON.stringify(ziek));
}

console.log('\n5. Markup van de peer');
{
  const vs = { veh: { merk: '<img src=x onerror=alert(1)>', model: 'Golf' }, pids: ['010C'], active: [], health: { '<b>': 'nodata' }, dtc: [],
    voorkennis: { merk: 'vw', kansen: [], bekend: [], zelf: [], foutcodes: [{ code: 'P0016', nu: true, desc: '<script>x</script>' }],
      rapporten: [{ id: "sr1_2');alert(1);('", title: '<i>rapport</i>' }], waargenomen: [] } };
  const h = EW.html(vs, { owner: '<u>klant</u>' }, O, plan);
  toets('geen ruwe tags van de peer', !/<img|<script|Sensor <b>|<i>rapport|<u>/.test(h) && /Sensor &lt;b&gt;/.test(h), h.slice(0, 200));
  toets('gewone inhoud blijft staan (P0016, Golf)', /P0016/.test(h) && /Golf/.test(h));
  toets('een rapport-id dat geen id is krijgt geen knop', !/reqRapport\('sr1_2'\)/.test(h) && !/alert\(1\);\('/.test(h));
  toets('zonder vstate: de uitleg om te verbinden', /meekijk-code/.test(EW.html(null, null, O, plan)));
}

console.log(fouten ? '\n' + fouten + ' FOUT(en)' : '\nalles goed');
process.exit(fouten ? 1 : 0);
