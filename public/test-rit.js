// ══════════════════════════════════════════════════════════════════
// test-rit.js — de ritwaarnemer telt wat hij hoort te tellen
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// PLRit (blok 14) beantwoordt vier vragen die bij stilstand onbeantwoordbaar
// zijn: beweegt de raildruk over een hele rit, welke sensoren bewogen niet,
// kwam de MAP boven de barometer, en liep de app door. Al die antwoorden komen
// uit één accumulator die tijdens het rijden meeloopt.
//
// Die accumulator draait op een interval van 5 seconden. Zonder deze test zou
// je hem alleen kunnen toetsen dóór te gaan rijden — en dan merk je een fout
// pas ná de rit, als de meting al verspild is. Precies het geval waarvoor de
// werkregel bestaat: een tegenproef die niet meedraait is geen tegenproef.
//
// Daarom heeft tik() een klok-parameter. Hieronder wordt een rit van een half
// uur in een paar milliseconden nagespeeld: een sensor die beweegt, een sensor
// die vastzit (de raildruk van 23-08), een gat waarin de app bevroor, en een
// herverbinding erna.
//
// Draaien vanuit public/:  node test-rit.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

// pidlane-testrun.js is een classic script vol globals. De sandbox levert
// precies wat PLRit aanraakt; alles wat het scherm nodig heeft blijft leeg,
// want PLRit raakt de DOM niet aan — en dát is meteen vastgelegd: gaat hij dat
// ooit wél doen, dan klapt deze test.
function laadPLRit() {
  const s = {};
  s.window = s;
  s.connected = true;
  s.demoMode = false;
  s._trBezig = false;
  s.pidVals = {};
  s.console = { warn: function () { }, error: function () { }, log: function () { } };
  s.localStorage = { getItem: function () { return null; }, setItem: function () { }, key: function () { return null; }, length: 0 };
  s.document = {
    getElementById: function () { return null; },
    createElement: function () { return { style: {}, classList: { add: function () { }, remove: function () { } } }; },
    querySelectorAll: function () { return []; }
  };
  s.setInterval = function () { return 0; };
  s.setTimeout = function () { return 0; };
  s.PLBus = { stats: function () { return { belasting: 70, perSec: 5, venGemMs: 120, foutPct: 0 }; } };
  s.PLLoad = { staat: function () { return { mult: 1, tempoPct: 100 }; }, cfg: {} };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-testrun.js', 'utf8'), s, { filename: 'pidlane-testrun.js' });
  if (!s.PLRit) throw new Error('PLRit niet gevonden in pidlane-testrun.js');
  if (typeof s.PLRit.tik !== 'function') throw new Error('PLRit.tik() ontbreekt — dan is de accumulator niet te toetsen');
  return s;
}

const T0 = 1700000000000;   // vast beginmoment, zodat de uitslag niet per run verschilt

// WAAROM `connected` en `demoMode` hier wél te sturen zijn en `_trBezig` niet.
// pidlane-testrun.js zit volledig in een IIFE. `_trBezig` is dus een
// closure-variabele van díé functie: van buitenaf is er geen enkele weg naartoe,
// ook niet via vm.runInContext — dat draait een los script en maakt hooguit een
// globale variabele met dezelfde naam, terwijl de closure zijn eigen blijft
// lezen. `connected` en `demoMode` worden in ándere modules gedeclareerd en
// zijn hier gewoon globals, dus die zijn wél te zetten.
//
// Dat is geen tekortkoming van PLRit maar van wat een test van buiten kan zien.
// De guard wordt daarom hieronder op de BRON getoetst, met deze reden erbij —
// dezelfde uitzondering die §20 toestaat waar een gedragstest onmogelijk is.

// Speelt een rit na. `plan` bepaalt per tik wat de sensoren doen.
function rijd(s, tikken, plan, opties) {
  const o = opties || {};
  const stap = o.stapMs || 5000;
  let t = T0;
  for (let i = 0; i < tikken; i++) {
    if (o.gatBij === i) t += (o.gatMs || 60000);   // de app lag stil
    else t += stap;
    plan(s, i, t);
    s.PLRit.tik(t);
  }
  return t;
}

// ── de controles ─────────────────────────────────────────────────

// Een sensor die beweegt moet als bewegend geteld worden, met de juiste
// uiterste waarden. Een sensor die vastzit moet op nul wijzigingen staan —
// dat is de raildruk-vraag van 23-08.
function keurBewegingTellen(s) {
  const uit = [];
  s.PLRit.wis();
  rijd(s, 20, function (sb, i) {
    sb.pidVals['010C'] = 800 + i * 10;   // toerental loopt op
    sb.pidVals['0123'] = 9900;           // raildruk staat vast (de bevinding)
    sb.pidVals['010D'] = i < 2 ? 0 : 50; // snelheid: eerst stil, dan rijden
  });
  const p = s.PLRit.per();
  if (!p['010C']) { uit.push('010C helemaal niet bemonsterd'); return uit; }
  if (p['010C'].veranderingen !== 19) uit.push('010C: ' + p['010C'].veranderingen + ' wijzigingen, verwacht 19');
  if (p['010C'].min !== 800) uit.push('010C min ' + p['010C'].min + ', verwacht 800');
  if (p['010C'].max !== 990) uit.push('010C max ' + p['010C'].max + ', verwacht 990');
  if (!p['0123']) { uit.push('0123 niet bemonsterd'); return uit; }
  if (p['0123'].veranderingen !== 0) uit.push('0123: ' + p['0123'].veranderingen + ' wijzigingen, verwacht 0 (vastgevroren)');
  if (p['0123'].min !== 9900 || p['0123'].max !== 9900) uit.push('0123 min/max ' + p['0123'].min + '/' + p['0123'].max + ', verwacht 9900/9900');
  if (p['010D'].max !== 50) uit.push('010D max ' + p['010D'].max + ', verwacht 50');
  return uit;
}

// Een gat betekent dat de meetlus zelf niet liep (Android bevriest de
// WebView-timers). Dat is de bevinding van 23-08 en moet geteld worden.
function keurGatenTellen(s) {
  const uit = [];
  s.PLRit.wis();
  rijd(s, 12, function (sb, i) { sb.pidVals['010C'] = 800 + i; }, { gatBij: 6, gatMs: 90000 });
  const g = s.PLRit.gaten();
  if (g.length !== 1) { uit.push(g.length + ' gaten gemeld, verwacht 1'); return uit; }
  if (g[0].s !== 90) uit.push('gat van ' + g[0].s + ' s gemeld, verwacht 90');
  return uit;
}

// Korte tussenpozen zijn GEEN gat. Zonder deze controle zou "gaten tellen" ook
// slagen met een versie die elke tik als gat boekt.
function keurNormaalGeenGat(s) {
  s.PLRit.wis();
  rijd(s, 30, function (sb, i) { sb.pidVals['010C'] = 800 + i; });
  const g = s.PLRit.gaten();
  return g.length === 0 ? [] : [g.length + ' gat(en) gemeld bij een ononderbroken rit'];
}

// Een herverbinding is verbonden=false gevolgd door verbonden=true.
function keurHerverbindingTellen(s) {
  const uit = [];
  s.PLRit.wis();
  let t = T0;
  const tik = function () { t += 5000; s.PLRit.tik(t); };
  s.pidVals['010C'] = 800;
  tik(); tik();
  s.connected = false; tik(); tik();          // verbinding weg
  s.connected = true; tik();                  // terug -> 1 herverbinding
  s.connected = false; tik();
  s.connected = true; tik();                  // terug -> 2
  if (s.PLRit.herverbindingen() !== 2)
    uit.push(s.PLRit.herverbindingen() + ' herverbindingen geteld, verwacht 2');
  return uit;
}

// Tijdens een testrun mag er NIET bemonsterd worden: de sweep vraagt 45 PIDs
// achter elkaar op en blok 6 pookt in dode PIDs. Die waarden horen niet in een
// beeld van wat de auto tijdens het rijden deed.
// `_trBezig` is onbereikbaar van buiten de IIFE (zie de uitleg bovenaan), dus
// dit is een broncontrole en geen gedragscontrole. Hij toetst twee dingen die
// samen de guard dragen: dat hij bestaat, en dat hij vóór het bemonsteren staat
// in plaats van erna. Een guard ná de Object.keys(pidVals)-lus zou de sweep
// alsnog in het ritbeeld laten lopen.
function keurNietTijdensRun(bron) {
  const uit = [];
  const m = bron.match(/const PLRit = \(function[\s\S]*?\n\}\)\(\);/);
  if (!m) return ['het PLRit-blok is niet in de bron te vinden — is het hernoemd?'];
  const blok = m[0];
  const iGuard = blok.indexOf('_trBezig');
  const iLus = blok.indexOf('Object.keys(pidVals)');
  if (iGuard === -1) uit.push('geen _trBezig-guard in PLRit — de sweep loopt dan in het ritbeeld mee');
  if (iLus === -1) uit.push('de bemonsteringslus (Object.keys(pidVals)) is niet gevonden');
  if (iGuard > -1 && iLus > -1 && iGuard > iLus)
    uit.push('de _trBezig-guard staat NA de bemonsteringslus — dan filtert hij niets meer');
  if (!/if\s*\([^)]*_trBezig\s*\)\s*return/.test(blok))
    uit.push('_trBezig komt voor maar niet als "if (... _trBezig) return" — controleer de vorm');
  return uit;
}

// Demo levert verzonnen waarden; die mogen nooit als rit tellen.
function keurNietInDemo(s) {
  const uit = [];
  s.PLRit.wis();
  s.demoMode = true;
  rijd(s, 10, function (sb, i) { sb.pidVals['010C'] = 800 + i * 100; });
  s.demoMode = false;
  if (Object.keys(s.PLRit.per()).length) uit.push('er is bemonsterd in demomodus');
  return uit;
}

// Niet-getallen (NO DATA, tekst-PIDs) mogen de min/max niet vergiftigen.
function keurRommelGenegeerd(s) {
  const uit = [];
  s.PLRit.wis();
  rijd(s, 10, function (sb, i) {
    sb.pidVals['010C'] = (i === 5) ? null : 800 + i;
    sb.pidVals['019D'] = 'NO DATA';
    sb.pidVals['019E'] = NaN;
  });
  const p = s.PLRit.per();
  if (p['019D']) uit.push('een tekstwaarde is als meting geteld (019D)');
  if (p['019E']) uit.push('NaN is als meting geteld (019E)');
  if (!p['010C']) { uit.push('010C helemaal weg door één null'); return uit; }
  if (p['010C'].min !== 800) uit.push('010C min ' + p['010C'].min + ' — null heeft de min vergiftigd');
  return uit;
}

// wis() moet echt alles leegmaken, anders loopt de vorige rit door in de
// volgende en klopt geen enkel getal in blok 14.
function keurWisIsSchoon(s) {
  const uit = [];
  s.PLRit.wis();
  rijd(s, 8, function (sb, i) { sb.pidVals['010C'] = 800 + i; }, { gatBij: 3, gatMs: 90000 });
  s.connected = false; s.PLRit.tik(T0 + 999000); s.connected = true; s.PLRit.tik(T0 + 1000000);
  s.PLRit.wis();
  if (Object.keys(s.PLRit.per()).length) uit.push('per() niet leeg na wis()');
  if (s.PLRit.gaten().length) uit.push('gaten niet leeg na wis()');
  if (s.PLRit.herverbindingen() !== 0) uit.push('herverbindingen niet op 0 na wis()');
  if (s.PLRit.duurS() !== 0) uit.push('duur niet op 0 na wis()');
  if (s.PLRit.monsters() !== 0) uit.push('monsters niet op 0 na wis()');
  return uit;
}

// ── toetshulpjes ─────────────────────────────────────────────────
let fout = 0;

function toetsSchoon(naam, gemeten) {
  if (gemeten.length === 0) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam);
  gemeten.forEach(function (r) { console.log('        ' + r); });
}

// ── draaien ──────────────────────────────────────────────────────
console.log('Ritwaarnemer — telt wat hij hoort te tellen\n');

const S = laadPLRit();

// Eerst vastpinnen dat er überhaupt bemonsterd wordt. Zonder dit slagen
// "niet tijdens een run" en "niet in demo" met een waarnemer die nooit iets doet.
toetsSchoon('er wordt bemonsterd onder normale omstandigheden',
  (function () {
    S.PLRit.wis();
    rijd(S, 5, function (sb, i) { sb.pidVals['010C'] = 800 + i; });
    return S.PLRit.monsters() === 5 ? [] : [S.PLRit.monsters() + ' monsters na 5 tikken'];
  })());

toetsSchoon('bewegende en vastgevroren sensoren worden onderscheiden', keurBewegingTellen(S));
toetsSchoon('een gat in de meetlus wordt geteld', keurGatenTellen(S));
toetsSchoon('een normale rit levert geen gaten op', keurNormaalGeenGat(S));
toetsSchoon('herverbindingen worden geteld', keurHerverbindingTellen(S));
toetsSchoon('de _trBezig-guard staat vóór de bemonstering (broncontrole, zie boven)',
  keurNietTijdensRun(fs.readFileSync('pidlane-testrun.js', 'utf8')));
toetsSchoon('er wordt niet bemonsterd in demomodus', keurNietInDemo(S));
toetsSchoon('niet-getallen vergiftigen de min/max niet', keurRommelGenegeerd(S));
toetsSchoon('wis() maakt alles leeg', keurWisIsSchoon(S));

// ── tegenproef ───────────────────────────────────────────────────
// De controles moeten rood kunnen worden. Elke tegenproef voert dezelfde
// controle uit op een nagebootste waarnemer die het FOUT doet.
//
// Zo'n nepwaarnemer moet dezelfde vorm hebben als de echte, tik() incluis —
// anders klapt de controle op een ontbrekende functie in plaats van netjes een
// bevinding te melden, en dan bewijst de tegenproef niets. (Dat gebeurde bij
// het schrijven: twee fakes zonder tik lieten de test crashen.)
function nepWaarnemer(over) {
  const basis = {
    tik: function () { },
    wis: function () { },
    per: function () { return {}; },
    gaten: function () { return []; },
    herverbindingen: function () { return 0; },
    monsters: function () { return 0; },
    duurS: function () { return 0; }
  };
  return Object.assign(basis, over || {});
}

// Een waarnemer die de raildruk als bewegend boekt terwijl hij vaststaat: dan
// zou blok 14 de bevinding van 23-08 wegpoetsen.
toetsSchoon('een vastzittende sensor die als bewegend geboekt wordt, wordt gezien',
  (function () {
    const nep = { PLRit: nepWaarnemer({
      per: function () { return { '010C': { n: 20, min: 800, max: 990, laatst: 990, veranderingen: 19 },
                                  '0123': { n: 20, min: 9900, max: 9900, laatst: 9900, veranderingen: 7 },
                                  '010D': { n: 20, min: 0, max: 50, laatst: 50, veranderingen: 1 } }; }
    }), pidVals: {} };
    const r = keurBewegingTellen(nep);
    return r.some(function (x) { return x.indexOf('0123') > -1; }) ? []
      : ['keurBewegingTellen bleef stil bij een vastzittende sensor met 7 wijzigingen: ' + (r.join(' | ') || '(niets)')];
  })());

toetsSchoon('de gaten-controle kan rood worden',
  keurNormaalGeenGat({ PLRit: nepWaarnemer({ gaten: function () { return [{ s: 90 }]; } }), pidVals: {} }).length
    ? [] : ['keurNormaalGeenGat bleef stil bij een gemeld gat']);

// De broncontrole moet de drie manieren vinden waarop de guard stuk kan gaan:
// weg, verkeerd van vorm, of ná de bemonsteringslus.
toetsSchoon('een PLRit zónder _trBezig-guard wordt gezien',
  keurNietTijdensRun('const PLRit = (function () {\n' +
    '  function tik(){ Object.keys(pidVals).forEach(function(p){}); }\n})();').length
    ? [] : ['de broncontrole bleef stil bij een ontbrekende guard']);

toetsSchoon('een guard NA de bemonsteringslus wordt gezien',
  (function () {
    const r = keurNietTijdensRun('const PLRit = (function () {\n' +
      '  function tik(){ Object.keys(pidVals).forEach(function(p){});\n' +
      '    if (_trBezig) return; }\n})();');
    return r.some(function (x) { return x.indexOf('NA de bemonsteringslus') > -1; }) ? []
      : ['de broncontrole zag een guard na de lus niet: ' + (r.join(' | ') || '(niets)')];
  })());

toetsSchoon('een guard met de verkeerde vorm wordt gezien',
  (function () {
    const r = keurNietTijdensRun('const PLRit = (function () {\n' +
      '  function tik(){ var x = _trBezig;\n' +
      '    Object.keys(pidVals).forEach(function(p){}); }\n})();');
    return r.some(function (x) { return x.indexOf('niet als') > -1; }) ? []
      : ['de broncontrole accepteerde een guard die niets afdwingt: ' + (r.join(' | ') || '(niets)')];
  })());

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
