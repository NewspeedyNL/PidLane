// ══════════════════════════════════════════════════════════════════
// test-terugknop.js — de Android-terugknop schakelt de app niet weg
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// De klacht "de terugknop sluit de app" is twee reparaties lang blijven
// staan, en beide keren om dezelfde reden: er hingen TWEE luisteraars aan
// 'backButton'. Eén in pidlane-archief.js (die netjes overlays sloot) en
// één in pidlane-theme.js (die minimizeApp() deed zodra zijn eigen,
// kortere lijst niets herkende). Capacitor roept elke luisteraar aan — de
// een onderdrukt de ander niet. Op het welkomstscherm herkende de tweede
// lijst per definitie niets, dus schakelde één tik de app weg, dwars door
// de "tik nogmaals"-melding van de eerste heen.
//
// Wie alleen naar archief.js keek, zag een handler die precies deed wat
// hij moest doen. De fout stond ernaast. Daarom toetst deze test twee
// dingen die je los van elkaar niet ziet:
//
//   1. GEDRAG — de echte ketting uit pidlane-archief.js loopt hier, met
//      een nagebouwde DOM. In geen enkele toestand mag exitApp() of
//      minimizeApp() vallen.
//   2. AANTAL — er mag in de hele app precies één luisteraar op
//      'backButton' staan. Dat is geen bronregel-smaak maar noodzaak: een
//      tweede luisteraar is voor een gedragstest van de eerste onzichtbaar,
//      en dát was de bug.
//
// Draaien vanuit public/:  node test-terugknop.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');

let fout = 0;
function toets(naam, ok, detail) {
  if (ok) { console.log('  ok    ' + naam); return true; }
  console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
  fout++;
  return false;
}

// ── de echte ketting uit de module halen ──────────────────────────
const BRON = fs.readFileSync(__dirname + '/pidlane-archief.js', 'utf8');
const VAN = BRON.indexOf('function _plZichtbaar(el){');
const TOT = BRON.indexOf("document.addEventListener('DOMContentLoaded', setupBackButton);");
if (VAN < 0 || TOT < 0) {
  console.log('  FOUT  het terugknop-blok is niet te vinden in pidlane-archief.js');
  console.log('        gezocht op _plZichtbaar() en de DOMContentLoaded-regel eronder');
  process.exit(1);
}
const KETTING = BRON.slice(VAN, TOT);

// ── nagebouwde DOM ────────────────────────────────────────────────
const IDS = ['srCtxAsk', 'srTextSheet', 'aiReportSheet', 'pdfReadyModal', 'needsUpdateModal',
  'reportsOverviewSheet', 'optResultModal', 'scenarioModal', 'btLogModal', 'ritFocusModal',
  'apiDialog', 'hudPicker', 'bandenInfoModal', 'proefritKeuzeModal', 'logCenter', 'vehOverview',
  'demoCarModal', 'onderhoudDash', 'evDash', 'langeRitDash', 'ritDash', 'caravanDash',
  'neonDash', 'climateDash', 'kebabMenu', 'connOv', 'welcomeScreen'];

function maakEl(id) {
  const klassen = [];
  return {
    id: id,
    style: { display: 'none' },
    classList: {
      contains: function (k) { return klassen.indexOf(k) > -1; },
      add: function (k) { if (klassen.indexOf(k) < 0) klassen.push(k); },
      remove: function (k) { const i = klassen.indexOf(k); if (i > -1) klassen.splice(i, 1); }
    }
  };
}

// Bouwt een verse wereld: DOM, vlaggen, en een nagebootste Capacitor-App.
// Vers per scenario, want de handler onthoudt dingen op window.
function maakWereld(opzet) {
  opzet = opzet || {};
  const els = {};
  IDS.forEach(function (id) { els[id] = maakEl(id); });
  els.welcomeScreen.style.display = 'block';          // startscherm staat aan
  const picker = maakEl('picker');
  const deuren = [];
  const gedaan = [];                                   // wat er is aangeroepen

  const app = {
    luisteraars: [],
    addListener: function (naam, cb) { app.luisteraars.push({ naam: naam, cb: cb }); },
    exitApp: function () { gedaan.push('exitApp'); },
    minimizeApp: function () { gedaan.push('minimizeApp'); }
  };

  const win = { Capacitor: { Plugins: { App: app } }, addEventListener: function () {} };

  const document = {
    getElementById: function (id) { return els[id] || null; },
    querySelector: function (sel) {
      if (sel.indexOf('pick-overlay') > -1) return picker.style.display === 'none' ? null : picker;
      return null;
    },
    querySelectorAll: function (sel) { return sel.indexOf('wm-door-panel') > -1 ? deuren : []; },
    addEventListener: function () {}
  };

  const noem = function (naam) { return function () { gedaan.push(naam); }; };

  const omgeving = {
    window: win,
    document: document,
    console: { warn: function () {}, log: function () {} },
    getComputedStyle: function (el) { return { display: el && el.style ? el.style.display : 'none' }; },
    setTimeout: function (fn, ms) { return { fn: fn, ms: ms }; },
    history: { pushState: function () {} },
    showToast: function () { gedaan.push('toast'); },
    ladeOpen: function () { return !!opzet.lade; },
    closeLades: noem('closeLades'),
    goHome: noem('goHome'),
    backToDoors: noem('backToDoors'),
    minimizeRitAnalyse: noem('minimizeRitAnalyse'),
    closeRitAnalyse: noem('closeRitAnalyse'),
    minimizeCaravanDash: noem('minimizeCaravanDash'),
    closeCaravanDash: noem('closeCaravanDash'),
    closeNeonDashboard: noem('closeNeonDashboard'),
    closeClimateCheck: noem('closeClimateCheck'),
    closeKebab: noem('closeKebab'),
    closeConnOv: noem('closeConnOv'),
    ritActive: !!opzet.ritActive,
    caravanActive: !!opzet.caravanActive,
    connected: !!opzet.connected,
    demoMode: !!opzet.demoMode
  };

  const namen = Object.keys(omgeving);
  const fabriek = new Function(namen.join(','), KETTING +
    '\nreturn {appBack:appBack,_plBackHandler:_plBackHandler,setupBackButton:setupBackButton};');
  const api = fabriek.apply(null, namen.map(function (n) { return omgeving[n]; }));

  return { els: els, picker: picker, deuren: deuren, app: app, win: win, gedaan: gedaan, api: api };
}

// Eén tik op de hardware-terugknop, via de luisteraar die de app zelf registreerde.
function tik(w) {
  w.api.setupBackButton();
  const l = w.app.luisteraars.filter(function (x) { return x.naam === 'backButton'; });
  if (!l.length) throw new Error('geen backButton-luisteraar geregistreerd');
  l.forEach(function (x) { x.cb({ canGoBack: false }); });
}

console.log('Android-terugknop\n');

// ── 1. de app wordt nooit weggeschakeld ───────────────────────────
console.log('  — de app blijft open —');
[
  ['startscherm, niets open', {}],
  ['startscherm, tweede tik binnen 2 s', {}],
  ['verbind-overlay open, nog niets verbonden', { toon: ['connOv'] }],
  ['in een mode, niet verbonden', { welkomWeg: true }],
  ['in een mode, wel verbonden', { welkomWeg: true, connected: true }]
].forEach(function (geval) {
  const naam = geval[0], opzet = geval[1];
  const w = maakWereld(opzet);
  if (opzet.welkomWeg) { w.els.welcomeScreen.classList.add('hidden'); w.els.welcomeScreen.style.display = 'none'; }
  (opzet.toon || []).forEach(function (id) { w.els[id].style.display = 'flex'; });
  tik(w);
  if (naam.indexOf('tweede tik') > -1) tik(w);
  toets(naam + ' → app blijft open',
    w.gedaan.indexOf('exitApp') < 0 && w.gedaan.indexOf('minimizeApp') < 0,
    'aangeroepen: ' + (w.gedaan.join(', ') || 'niets'));
});

// ── 2. de ketting sluit wat er openstaat ──────────────────────────
console.log('\n  — back sluit de bovenste laag —');
function sluit(naam, opzet, toon, verwacht) {
  const w = maakWereld(opzet || {});
  w.els.welcomeScreen.classList.add('hidden');
  w.els.welcomeScreen.style.display = 'none';
  toon.forEach(function (id) { w.els[id].style.display = 'flex'; });
  tik(w);
  verwacht(w, naam);
}

sluit('lade open', { lade: true }, [], function (w, n) {
  toets(n + ' → closeLades()', w.gedaan.indexOf('closeLades') > -1, 'gedaan: ' + w.gedaan.join(', '));
});
sluit('modal open', {}, ['pdfReadyModal'], function (w, n) {
  toets(n + ' → modal dicht', w.els.pdfReadyModal.style.display === 'none');
});
sluit('needsUpdateModal (kwam uit de tweede handler)', {}, ['needsUpdateModal'], function (w, n) {
  toets(n + ' → dicht', w.els.needsUpdateModal.style.display === 'none',
    'deze id stond alleen in closeTopOverlay en zou bij de verhuizing zijn zoekgeraakt');
});
sluit('lopende rit-analyse', { ritActive: true }, ['ritDash'], function (w, n) {
  toets(n + ' → minimaliseren, niet stoppen',
    w.gedaan.indexOf('minimizeRitAnalyse') > -1 && w.gedaan.indexOf('closeRitAnalyse') < 0,
    'gedaan: ' + w.gedaan.join(', '));
});
sluit('afgeronde rit-analyse', { ritActive: false }, ['ritDash'], function (w, n) {
  toets(n + ' → sluiten', w.gedaan.indexOf('closeRitAnalyse') > -1, 'gedaan: ' + w.gedaan.join(', '));
});
sluit('lopende caravan-dash', { caravanActive: true }, ['caravanDash'], function (w, n) {
  toets(n + ' → minimaliseren', w.gedaan.indexOf('minimizeCaravanDash') > -1, 'gedaan: ' + w.gedaan.join(', '));
});
sluit('neon-dashboard (kwam uit de tweede handler)', {}, ['neonDash'], function (w, n) {
  toets(n + ' → closeNeonDashboard()', w.gedaan.indexOf('closeNeonDashboard') > -1, 'gedaan: ' + w.gedaan.join(', '));
});
sluit('airco/wintercheck (kwam uit de tweede handler)', {}, ['climateDash'], function (w, n) {
  toets(n + ' → closeClimateCheck()', w.gedaan.indexOf('closeClimateCheck') > -1, 'gedaan: ' + w.gedaan.join(', '));
});
sluit('onderhoud-dashboard', {}, ['onderhoudDash'], function (w, n) {
  toets(n + ' → dicht en terug naar home',
    w.els.onderhoudDash.style.display === 'none' && w.gedaan.indexOf('goHome') > -1);
});
sluit('verbind-overlay terwijl er verbinding is', { connected: true }, ['connOv'], function (w, n) {
  toets(n + ' → closeConnOv()', w.gedaan.indexOf('closeConnOv') > -1, 'gedaan: ' + w.gedaan.join(', '));
});
sluit('in een mode, niets open', { connected: true }, [], function (w, n) {
  toets(n + ' → goHome()', w.gedaan.indexOf('goHome') > -1, 'gedaan: ' + w.gedaan.join(', '));
});

(function () {
  const w = maakWereld({});
  w.els.welcomeScreen.classList.add('hidden');
  w.els.welcomeScreen.style.display = 'none';
  w.els.kebabMenu.classList.add('open');
  tik(w);
  toets('kebabmenu open (kwam uit de tweede handler) → closeKebab()',
    w.gedaan.indexOf('closeKebab') > -1, 'gedaan: ' + w.gedaan.join(', '));
})();

(function () {
  const w = maakWereld({});
  w.els.welcomeScreen.classList.add('hidden');
  w.els.welcomeScreen.style.display = 'none';
  w.picker.style.display = 'flex';
  tik(w);
  toets('onderdelen-picker (kwam uit de tweede handler) → dicht',
    w.picker.style.display === 'none');
})();

(function () {
  const w = maakWereld({});
  w.deuren.push({ style: { display: 'flex' } });
  tik(w);
  toets('deur-paneel open op het startscherm → terug naar de 4 keuzes',
    w.gedaan.indexOf('backToDoors') > -1, 'gedaan: ' + w.gedaan.join(', '));
})();

// Een venster dat met .hidden dicht staat is niet "de bovenste laag". Zonder
// die toets sluit back iets wat allang dicht is en doet de knop niets.
(function () {
  const w = maakWereld({ connected: true });
  w.els.welcomeScreen.classList.add('hidden');
  w.els.welcomeScreen.style.display = 'none';
  w.els.pdfReadyModal.style.display = 'flex';
  w.els.pdfReadyModal.classList.add('hidden');
  tik(w);
  toets('venster met .hidden telt niet als open', w.gedaan.indexOf('goHome') > -1,
    'gedaan: ' + w.gedaan.join(', '));
})();

// ── 3. precies één luisteraar in de hele app ──────────────────────
console.log('\n  — één luisteraar, niet twee —');
(function () {
  const w = maakWereld({});
  w.api.setupBackButton();
  w.api.setupBackButton();                            // tweede aanroep mag niets toevoegen
  toets('setupBackButton registreert één luisteraar, ook bij twee aanroepen',
    w.app.luisteraars.filter(function (x) { return x.naam === 'backButton'; }).length === 1,
    'geteld: ' + w.app.luisteraars.length);
})();

// Bronregel-toets, en met reden: een luisteraar in een ándere module is voor
// de gedragstest hierboven onzichtbaar — de handler die daar getoetst wordt
// draait gewoon door. Precies dat maakte de bug twee ronden lang onvindbaar.
(function () {
  function zonderCommentaar(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  }
  const modules = fs.readdirSync(__dirname).filter(function (f) { return /^pidlane-.*\.js$/.test(f); });
  const met = [];
  modules.forEach(function (f) {
    const treffers = zonderCommentaar(fs.readFileSync(__dirname + '/' + f, 'utf8'))
      .match(/addListener\s*\(\s*['"]backButton['"]/g);
    if (treffers) met.push(f + ' (' + treffers.length + 'x)');
  });
  toets('precies één module registreert een backButton-luisteraar',
    met.length === 1 && met[0] === 'pidlane-archief.js (1x)',
    'gevonden: ' + (met.join(', ') || 'geen enkele'));

  // Geen enkele module mag de app wegschakelen vanaf de terugknop.
  const wegschakelaars = [];
  modules.forEach(function (f) {
    const src = zonderCommentaar(fs.readFileSync(__dirname + '/' + f, 'utf8'));
    // Aanroep op de App-plugin (App.exitApp(), AppPlugin.minimizeApp?.()), dus met
    // punt ervoor. Zonder die eis slaat de toets ook aan op de naam in een
    // campagnetekst of op een verklikker die de functie juist ONDERSCHEPT.
    if (/\.\s*(minimizeApp|exitApp)\s*(\?\.)?\(/.test(src)) wegschakelaars.push(f);
  });
  toets('geen module roept exitApp() of minimizeApp() aan',
    wegschakelaars.length === 0, 'gevonden in: ' + wegschakelaars.join(', '));
})();

// ── 4. tegenproef ─────────────────────────────────────────────────
// Een controle zonder tegenproef zegt alleen dat hij groen kán staan. Hier
// wordt het oude gedrag nagebouwd — beide varianten die er echt stonden — en
// de toetsen hierboven moeten daar rood op gaan.
console.log('\n  — tegenproef: het oude gedrag moet rood geven —');
(function () {
  const w = maakWereld({});                            // startscherm, niets open
  // oude pidlane-theme.js: sluit niets herkenbaars → app naar de achtergrond
  w.app.minimizeApp();
  const betrapt = w.gedaan.indexOf('minimizeApp') > -1;
  toets('de toets ziet de oude theme-handler (minimizeApp op het startscherm)', betrapt,
    'de meting kijkt dan naar de verkeerde plek en is waardeloos');

  const v = maakWereld({});
  // oude pidlane-archief.js: tweede tik binnen 2 s sloot de app écht af
  v.win._plExitArmed = true;
  if (v.win._plExitArmed) v.app.exitApp();
  toets('de toets ziet de oude archief-handler (exitApp bij de tweede tik)',
    v.gedaan.indexOf('exitApp') > -1);

  // en de bronregel-toets moet een tweede luisteraar zien
  const nep = "AppPlugin.addListener('backButton',function(){});";
  toets('de bronregel-toets ziet een tweede luisteraar',
    (nep.match(/addListener\s*\(\s*['"]backButton['"]/g) || []).length === 1);
})();

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
