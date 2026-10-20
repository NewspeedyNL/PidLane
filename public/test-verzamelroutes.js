// ══════════════════════════════════════════════════════════════════
// test-verzamelroutes.js — elke analyse via het verzamelscherm (#443)
// ──────────────────────────────────────────────────────────────────
// test-verzamel.js toetst het scherm zelf. Deze test toetst de AANROEPERS:
// de analyses die sinds #443 eerst PLVerzamel.meet() vragen. Per analyse
// twee vragen, en die zijn voor allemaal dezelfde:
//
//   1. zegt de klant nee (of sluit hij het scherm), gaat er dan echt niets
//      naar de AI? Dat is tegoed.
//   2. zegt hij ja, krijgt de AI dan de samenvatting van het scherm
//      ("GEMETEN OVER HET MEETVENSTER") in zijn prompt?
//
// En sinds 20-10-2026 drie over de AANLEVERING (de vijfde parameter van
// apiFetch, #188), omdat de routes daar uit elkaar liepen:
//
//   3. gaat er een vraag mee, en een kwaliteitsoordeel over precies de
//      sensoren die de prompt laat zien (`zichtbaar`)?
//   4. staat het DATAKWALITEIT-blok of de correlatielijst NIET nog een keer
//      in de prompt? De aanlevering zet ze er al bij; dubbel is dubbel betalen.
//   5. is het profiel van de aanlevering het profiel waarmee gemeten werd?
//      De oorzaakanalyse mat de selectie en beloofde een emissiedekking.
//
// HOE. Elke functie wordt uit zijn échte bronbestand geknipt, op zijn eigen
// kop, en draait in een omgeving waarin alles wat hij aanroept bestaat maar
// niets doet (een `with`-proxy). Alleen drie dingen zijn echt of gevangen:
// PLVerzamel (de echte promptBlok, een meet() die ja of nee zegt) en de twee
// wegen naar de AI, apiFetch en callAI. Zo hoeft deze test de schermen
// niet na te bouwen, en wordt hij rood op precies de twee vragen hierboven.
//
// Draaien vanuit public/:  node test-verzamelroutes.js   (exit 0 = goed)
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

// ── de echte samenvatting ─────────────────────────────────────────
const w = { console: { warn() {}, log() {} } };
w.window = w;
vm.createContext(w);
vm.runInContext(fs.readFileSync(dir + '/pidlane-verzamel.js', 'utf8'), w, { filename: 'pidlane-verzamel.js' });
const echt = w.PLVerzamel;
const SAM = { rijen: [{ pid: '0105', naam: 'Koelwater temp', eenheid: '°C', n: 20, min: 85, max: 112, gem: 90, laatste: 95, oordeel: 'afwijkend', reden: 'boven de alarmgrens 110', buiten: 1 }],
              tel: { afwijkend: 1, let: 0, meetfout: 0, twijfel: 0, ok: 0, nodata: 0 }, opvallend: 1 };
const MERK = 'GEMETEN OVER HET MEETVENSTER';
// Wat een aanroeper NIET meer zelf in de prompt hoort te zetten.
const DUBBEL_DK = '\n\nDATAKWALITEIT (verplicht meenemen vóór je een diagnose stelt):\n- dubbel';
const DUBBEL_CORR = '• CORRELATIE-DUBBEL';

// ── een wereld waarin alles bestaat en niets iets doet ────────────
// Iets dat je kunt aanroepen, uitlezen, beschrijven, doorlopen en in een
// tekst zetten. `then` bestaat niet, anders blijft elke await erop hangen.
function iets() {
  const f = function () { return iets(); };
  return new Proxy(f, {
    get(t, k) {
      if (k === 'then') return undefined;
      if (k === Symbol.toPrimitive) return (h) => (h === 'number' ? 0 : '');
      if (k === Symbol.iterator) return function* () {};
      if (k === 'length') return 0;
      if (k === 'value' || k === 'textContent' || k === 'innerHTML') return '';
      return iets();
    },
    set() { return true; },
    apply() { return iets(); }
  });
}
// Wat écht moet blijven: de taal zelf.
const ECHT = new Set(['Math', 'JSON', 'Object', 'Array', 'Promise', 'String', 'Number', 'Date', 'RegExp', 'Error', 'Set', 'Map',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Infinity', 'NaN', 'undefined', 'Symbol', 'Boolean', 'encodeURIComponent']);

function knip(bestand, kop) {
  const src = fs.readFileSync(dir + '/' + bestand, 'utf8');
  const a = src.indexOf(kop);
  if (a < 0) { console.log('  FOUT  "' + kop + '" niet gevonden in ' + bestand + ' — deze test toetst niets meer'); process.exit(1); }
  const b = src.indexOf('\n}\n', a);
  return src.slice(a, b + 3);
}

/* Draait één analyse. `antwoord` is wat het scherm teruggeeft. Geeft terug
   wat er gevraagd en verstuurd is. */
async function draai(r, antwoord) {
  const gevraagd = [], verstuurd = [], aan = [], gezet = [];
  const eigen = {
    // meet() geeft, zoals de echte, het profiel terug waarmee gemeten werd —
    // geen, als er uit een gegeven bron gemeten werd.
    PLVerzamel: { meet: (o) => { gevraagd.push(o);
                    return Promise.resolve(antwoord.door ? Object.assign({ profiel: o.bron || o.profiel === false ? null : (o.profiel || null),
                                                                         bron: o.bron ? o.bron.naam || 'bron' : null }, antwoord) : antwoord); },
                  promptBlok: echt.promptBlok, aanlevering: echt.aanlevering, vanBron: echt.vanBron, rijSecUit: echt.rijSecUit, histUit: echt.histUit },
    apiFetch: (p, t, s, m, a) => { verstuurd.push(String(p)); aan.push(a); return Promise.resolve('SAMENVATTING: goed.'); },
    callAI: (p, el, a) => { verstuurd.push(String(p)); aan.push(a); return Promise.resolve(); },
    ensurePIDsActive: (prof) => { gezet.push(prof); return Promise.resolve(); },
    pidHist: r.hist || {}, activePIDs: new Set(['0105']), isReportableSensor: () => true,
    _qualityBlokFor: () => DUBBEL_DK, buildQualityReport: () => ({ promptBlok: DUBBEL_DK }),
    correlationLines: () => [DUBBEL_CORR], analysisPidData: () => ({ pairs: [], quality: { promptBlok: DUBBEL_DK } }),
    // Wat een analyse vóór het scherm leest en wat er dan uit moet komen.
    vehicleFuelType: () => r.brandstof || 'benzine',
    probleem: 'trilt', datalogBuffer: r.datalog || {},
    getDatalogStats: () => (r.datalog ? { '0105': { name: 'Koelwater temp', unit: '°C', avg: 90, min: 85, max: 112, trend: '→', count: 20 } } : {}),
    _climateMode: 'airco', _climateData: { samples: [{ t: 1, coolant: 90 }] }, CLIMATE_PID: { coolant: '0105' },
    caravanHist: { '0105': [{ t: 0, v: 90 }] }, caravanKm: 10, caravanLiters: 1, caravanClimbSecs: { klim: 0, afdaling: 0, vlak: 0 }, caravanSpeedLimit: 90,
    tipCount: {}, RAPPORT_DISCLAIMER: 'Let op.',
    buildAircoPrompt: () => 'Beoordeel de airco.', buildWinterPrompt: () => 'Beoordeel het opwarmen.',
    aircoLocalVerdict: () => ({}), winterLocalVerdict: () => ({}),
    _deepPidOverview: () => ({ summary: 'geen', html: '', useLog: true }),
    _carStats: () => null,
    plDatalogBron: () => ({ naam: 'de datalog', hist: {}, sec: 20, rijSec: null }),
    window: r.window || {}, items: [], console: { warn() {}, log() {}, error() {} }
  };
  if (r.dd) eigen.document = { getElementById: (id) => (id === 'dd_probleem' ? { value: 'trilt' } : iets()), querySelectorAll: () => [] };
  const wereld = new Proxy(eigen, {
    has(t, k) { return typeof k === 'string' && !ECHT.has(k); },
    get(t, k) { if (k === Symbol.unscopables) return undefined; return (k in t) ? t[k] : iets(); },
    set(t, k, v) { t[k] = v; return true; }
  });
  // eslint-disable-next-line no-new-func
  const maak = new Function('wereld', 'with (wereld) { ' + r.bron + '\n return ' + r.naam + '; }');
  const fn = maak(wereld);
  await Promise.race([fn.apply(null, r.args || []), new Promise((res) => setTimeout(res, 500))]);
  await new Promise((res) => setImmediate(res));
  return { gevraagd, verstuurd, aan, gezet };
}

const ROUTES = [
  { naam: 'runQuickAI',        bestand: 'pidlane-fuel.js',       kop: 'async function runQuickAI(opts){' },
  { naam: 'runFuelAnalysis',   bestand: 'pidlane-fuel.js',       kop: 'async function runFuelAnalysis(){', rit: true },
  // runTotalCheck staat hier sinds 20-10-2026 niet meer: hij meet in twee
  // delen zonder AI-knop en de AI-vraag is een eigen knop over beide delen.
  // test-totaalcheck.js toetst dat die alleen kan na een meting.
  { naam: 'runDiagAI',         bestand: 'pidlane-diagnose.js',   kop: 'async function runDiagAI(causeName){', args: ['Bobine'] },
  { naam: 'runOnderhoud',      bestand: 'pidlane-koopcheck.js',  kop: 'async function runOnderhoud(){', nietNaMeten: true },
  { naam: 'runEVCheck',        bestand: 'pidlane-koopcheck.js',  kop: 'async function runEVCheck(){', nietNaMeten: true },
  { naam: 'runLangeRitTech',   bestand: 'pidlane-koopcheck.js',  kop: 'async function runLangeRitTech(){', nietNaMeten: true },
  { naam: 'runDatalogAI',      bestand: 'pidlane-datalog.js',    kop: 'async function runDatalogAI(){', datalog: { '0105': [{ t: 0, v: 90 }] }, bronMeting: true },
  { naam: 'runDeepDiag',       bestand: 'pidlane-koopcheck.js',  kop: 'async function runDeepDiag(){', dd: true },
  { naam: 'climateVerdict',    bestand: 'pidlane-koopcheck.js',  kop: 'async function climateVerdict(){', bronMeting: true },
  { naam: 'generateCaravanRapport', bestand: 'pidlane-caravan.js', kop: 'async function generateCaravanRapport(){', bronMeting: true }
];

(async () => {
  for (const r of ROUTES) {
    r.bron = knip(r.bestand, r.kop) + (r.extra || []).map((k) => knip(r.bestand, k)).join('');
    console.log('\n' + r.naam + ' (' + r.bestand + ')');
    const nee = await draai(r, { door: false, ai: false });
    toets('vraagt eerst het verzamelscherm', nee.gevraagd.length === 1, 'gevraagd=' + nee.gevraagd.length);
    toets('nee op de AI: er gaat niets naar de AI', nee.verstuurd.length === 0, nee.verstuurd.map((p) => p.slice(0, 60)).join(' | '));
    const ja = await draai(r, { door: true, ai: true, sam: SAM, sec: 75, rijSec: 0 });
    toets('ja op de AI: de prompt draagt de samenvatting van het scherm',
      ja.verstuurd.length >= 1 && ja.verstuurd.some((p) => p.indexOf(MERK) >= 0 && /Koelwater temp: 85–112/.test(p)),
      'verstuurd=' + ja.verstuurd.length + ' ' + (ja.verstuurd[0] || '').slice(0, 120));
    if (r.rit) toets('op het niveau van een rit, en met een weg terug na de rijtest', nee.gevraagd[0].niveau === 'rit' && typeof nee.gevraagd[0].naRit === 'function',
      JSON.stringify({ niveau: nee.gevraagd[0] && nee.gevraagd[0].niveau }));
    const a = ja.aan[0] || {};
    toets('de aanlevering draagt een vraag', typeof a.vraag === 'string' && a.vraag.length > 10, JSON.stringify(a));
    toets('en oordeelt over de sensoren die de prompt laat zien', Array.isArray(a.zichtbaar) && a.zichtbaar.indexOf('0105') >= 0, JSON.stringify(a));
    toets('geen tweede DATAKWALITEIT-blok of correlatielijst in de prompt',
      !ja.verstuurd.some((p) => p.indexOf('- dubbel') >= 0 || p.indexOf(DUBBEL_CORR) >= 0),
      (ja.verstuurd.find((p) => p.indexOf('- dubbel') >= 0 || p.indexOf(DUBBEL_CORR) >= 0) || '').slice(-300));
    const pv = ja.gevraagd[0] && ja.gevraagd[0].profiel;
    if (!(ja.gevraagd[0] && ja.gevraagd[0].bron))
      toets('het profiel van de aanlevering is het profiel van de meting',
        typeof pv === 'string' ? a.profiel === pv : !a.profiel, 'meting=' + JSON.stringify(pv) + ' aanlevering=' + JSON.stringify(a.profiel));
    if (r.nietNaMeten) toets('na de meetfase zet hij geen profiel meer aan (#565): er wordt daarna niets meer gemeten',
      ja.gezet.length === 0, 'ensurePIDsActive(' + ja.gezet.join(', ') + ')');
    if (r.bronMeting) toets('met de eigen meting als bron, niet een nieuwe', !!(nee.gevraagd[0] && nee.gevraagd[0].bron), JSON.stringify(Object.keys(nee.gevraagd[0] || {})));
  }
  /* Twee AI-paden zonder verzamelscherm (#565): de opname ís al een meting,
     en de AI-Automonteur is een vraag-en-antwoordvenster. Ook die krijgen
     sindsdien de samenvatting over het venster en een aanlevering uit die
     samenvatting — dezelfde drie vragen als hierboven. */
  const reeks = [85, 88, 90, 112, 95, 91, 89, 90].map((v, i) => ({ t: 1000 + i * 2000, v }));
  w.getPidDef = () => ({ name: 'Koelwater temp', unit: '°C' }); w.isReportableSensor = () => true;
  const ZONDER = [
    { naam: 'pidRecAiText', bestand: 'pidlane-koopcheck.js', kop: 'async function pidRecAiText(prob){', args: ['trilt'],
      window: { _recData: { pids: ['0105'], buffer: { '0105': reeks }, dur: 14 } } },
    { naam: 'autoExpertAsk', bestand: 'pidlane-motortype.js', kop: 'async function autoExpertAsk(mode){', args: ['livedata'],
      extra: ['function _aexMeting(){', 'function buildAutoExpertContext(meting){'], hist: { '0105': reeks } }
  ];
  for (const r of ZONDER) {
    r.bron = knip(r.bestand, r.kop) + (r.extra || []).map((k) => knip(r.bestand, k)).join('');
    console.log('\n' + r.naam + ' (' + r.bestand + ', zonder verzamelscherm)');
    const ja = await draai(r, null);
    const p = ja.verstuurd[0] || '', a = ja.aan[0] || {};
    toets('de prompt draagt de samenvatting over het venster', p.indexOf(MERK) >= 0 && /Koelwater temp: 85–112/.test(p), p.slice(0, 400));
    toets('de aanlevering draagt de vraag en de zichtbare sensoren',
      typeof a.vraag === 'string' && a.vraag.length > 10 && Array.isArray(a.zichtbaar) && a.zichtbaar.indexOf('0105') >= 0, JSON.stringify(a));
    toets('geen profiel: er is op geen profiel gemeten', !a.profiel, JSON.stringify(a.profiel));
    toets('geen tweede DATAKWALITEIT-blok in de prompt', p.indexOf('- dubbel') < 0 && p.indexOf(DUBBEL_CORR) < 0);
  }

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
  process.exit(fout ? 1 : 0);
})();
