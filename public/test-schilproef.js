// ══════════════════════════════════════════════════════════════════
// test-schilproef.js — waarschuwt blok 5 vóór de rit? (#18)
// ──────────────────────────────────────────────────────────────────
// WAAR DIT OVER GAAT. Op 11-09-2026 stond twee keer op één dag de vraag of een
// meting op de nieuwe schil of op de oude draaide. Beide keren pas achteraf, en
// beide keren omdat het testrunverslag het niet zei. `PLSchil` leest het nu
// uit, maar een getal in de kop is niet genoeg: je leest een kop pas als de rit
// al gereden is. Daarom zegt blok 5 het ook, en die draait vóóraf.
//
// WAT HIER ECHT IS. Allebei de modules: pidlane-schil.js en pidlane-testrun.js
// worden in dezelfde sandbox geladen. Alleen de Capacitor-bridge en plFetch
// zijn nagemaakt — dezelfde grens als bij de meetdienst, namelijk het laagste
// punt waar de app met buiten praat. De proef zelf komt uit de echte
// PROEVEN_B5-lijst en wordt op naam gezocht, niet op index.
//
// DE ONDERSCHEIDENDE VRAAG: welke fout zou hier rood worden? Een proef die
// altijd "in orde" zegt haalt alle vier de gevallen hieronder groen. Daarom
// staat er van elk geval één, met de ECHTE builds van 11-09 erin: 437 (de
// schil zonder wake lock) tegen 438 (die met).
//
// Draaien vanuit public/:  node test-schilproef.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (ok) console.log('  ok    ' + naam);
  else {
    fout++;
    console.log('  FOUT  ' + naam +
      '\n        kreeg    ' + JSON.stringify(gemeten) +
      '\n        verwacht ' + JSON.stringify(verwacht));
  }
}
function bevat(naam, tekst, stuk) {
  n++;
  if (String(tekst).indexOf(stuk) !== -1) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + '\n        "' + stuk + '" staat niet in: ' + tekst); }
}

// ── de sandbox ────────────────────────────────────────────────────
// Dezelfde vorm als test-achtergrondproef.js, plus de bridge en plFetch.
function bouw(o) {
  o = o || {};
  const s = {};
  s.window = s; s.globalThis = s;
  s.connected = true; s.demoMode = false;
  s.pidVals = {}; s._pidLastUpd = {}; s.activePIDs = new Set();
  s.console = { warn() { }, error() { }, log() { } };
  s.log = function () { }; s.btDiag = function () { };
  s.localStorage = { getItem() { return null; }, setItem() { }, key() { return null; }, length: 0 };
  s.document = {
    addEventListener() { }, visibilityState: 'visible',
    getElementById() { return null; },
    createElement() { return { style: {}, classList: { add() { }, remove() { } } }; },
    querySelectorAll() { return []; }, body: { appendChild() { } }
  };
  s.navigator = { userAgent: 'node' };
  s.setInterval = function () { return 0; };
  s.clearInterval = function () { };
  s.setTimeout = function (fn) { return setTimeout(fn, 0); };
  s.Promise = Promise;

  if (o.schil !== false) {
    s.Capacitor = {
      isNativePlatform() { return true; },
      Plugins: { App: { getInfo() { return Promise.resolve({ build: String(o.bouw === undefined ? 438 : o.bouw), version: '3.0.0' }); } } }
    };
  }
  s.plFetch = function () {
    if (o.fetchStuk) return Promise.reject(new Error('geen netwerk'));
    if (o.rmt === null) return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve({ ok: true, status: 200, json() { return Promise.resolve({ versionCode: (o.rmt === undefined ? 438 : o.rmt), builtAt: '2026-09-11T09:53:12Z' }); } });
  };
  vm.createContext(s);
  // `zonderSchil` laadt de module NIET. Hem achteraf van het window halen werkt
  // niet betrouwbaar in een vm-context, en dit bootst bovendien het echte geval
  // na: een index.html waar de scripttag ontbreekt.
  if (!o.zonderSchil)
    vm.runInContext(fs.readFileSync(__dirname + '/pidlane-schil.js', 'utf8'), s, { filename: 'pidlane-schil.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8'), s, { filename: 'pidlane-testrun.js' });
  if (!s.PLBlok5) { console.error('FOUT: PLBlok5 niet geladen'); process.exit(1); }
  return s;
}

// Op naam, niet op index en niet op issue: er staan drie proeven onder #18.
function proefVan(s, naamDeel) {
  const p = s.PLBlok5.proeven().filter(function (x) { return x.naam.indexOf(naamDeel) !== -1; });
  if (p.length !== 1) { console.error('FOUT: ' + p.length + ' proeven met "' + naamDeel + '"'); process.exit(1); }
  return p[0].proef;
}
async function draai(s) {
  const r = await proefVan(s, 'De schil is de nieuwste')();
  return (typeof r === 'string') ? { staat: 'ok', detail: r } : r;
}
const rust = () => new Promise(function (r) { setTimeout(r, 0); });

async function main() {

  console.log('\n── schil en R2 zijn gelijk: geen bevinding ──');
  {
    const s = bouw({ bouw: 438, rmt: 438 });
    await rust();
    const r = await draai(s);
    toets('geen LET OP', r.staat, 'ok');
    bevat('met beide getallen erin', r.detail, 'schil build 438, nieuwste in R2 438');
    bevat('en de conclusie erbij', r.detail, 'wat er gemeten wordt is wat er gebouwd is');
  }

  console.log('\n── de schil loopt achter: dít is de waarschuwing ──');
  {
    // De echte situatie van 11-09: build 437 heeft de meetdienst maar niet de
    // wake lock. Wie daarop meet, meet de oude native code.
    const s = bouw({ bouw: 437, rmt: 438 });
    await rust();
    const r = await draai(s);
    toets('LET OP', r.staat, 'LET OP');
    bevat('met het aantal builds', r.detail, 'loopt 1 build(s) achter');
    bevat('en wat dat betekent', r.detail, 'zitten NIET in deze meting');
    bevat('plus wat je eraan doet', r.detail, 'Installeer de nieuwe APK');
  }

  console.log('\n── vooruitlopen is geen fout, wel het vermelden waard ──');
  {
    const s = bouw({ bouw: 440, rmt: 438 });
    await rust();
    const r = await draai(s);
    toets('LET OP', r.staat, 'LET OP');
    bevat('met de richting erbij', r.detail, 'VOOR op wat er in R2 ligt');
    bevat('en waarom dat uitmaakt', r.detail, 'staat dan bij niemand anders');
  }

  console.log('\n── niet te vergelijken is geen "je bent bij" ──');
  {
    // DE GEVAARLIJKSTE UITKOMST. Een achterstand van 0 omdat er niets
    // opgehaald kon worden, leest als "in orde".
    const s = bouw({ bouw: 438, fetchStuk: true });
    await rust();
    const r = await draai(s);
    toets('LET OP en geen ok', r.staat, 'LET OP');
    bevat('met de reden', r.detail, 'niet te vergelijken');
    bevat('en het eigen getal blijft staan', r.detail, 'build 438');
  }
  {
    const s = bouw({ bouw: 438, rmt: null });
    await rust();
    const r = await draai(s);
    toets('een 404 levert ook LET OP', r.staat, 'LET OP');
    bevat('met de status erbij', r.detail, '404');
  }

  console.log('\n── in een browser zegt de proef dat er niets te meten valt ──');
  {
    const s = bouw({ schil: false });
    await rust();
    const r = await draai(s);
    toets('LET OP, geen FOUT', r.staat, 'LET OP');
    bevat('met de reden', r.detail, 'geen Capacitor-schil');
  }

  console.log('\n── zonder PLSchil is het een echte fout ──');
  {
    const s = bouw({ zonderSchil: true });
    await rust();
    const r = await draai(s);
    toets('FOUT', r.staat, 'FOUT');
    bevat('want dan staat de build nergens', r.detail, 'welke schil deze meting opleverde');
  }

  console.log('\n' + n + ' toetsen, ' + (fout ? fout + ' FOUT' : 'alles goed'));
  process.exit(fout ? 1 : 0);
}

main().catch(function (e) { console.error('FOUT: de test zelf klapte —', e); process.exit(1); });
