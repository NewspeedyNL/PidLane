// ══════════════════════════════════════════════════════════════════
// test-adapterpaneel.js — het verbindingspaneel en de regeling eronder
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Er is op 16-09-2026 een schuifje bij gekomen waarmee een mens het
// pollbudget kan overnemen, en een advies dat zegt waar dat schuifje zou
// moeten staan. Allebei zijn het dingen die er goed uit kunnen zien zonder
// iets te doen: een knop die de multiplier niet verzet, of een advies dat
// altijd hetzelfde zegt. Dat is hier al vaker misgegaan — test-healthgate.js
// stond maanden groen op een functie met twee parameters die de app niet had.
//
// WAT HIER GETOETST WORDT
//
//   1. PLAdapter.advies() — het oordeel. Vier situaties, vier andere
//      uitkomsten. Vooral: herhaalt de adapter frames, dan MAG er geen
//      tempo-advies uitkomen. Harder pollen maakt een echo vaker.
//   2. PLLoad.handmatig() — neemt mult() de handmatige stand over, en laat
//      tick() de regeling dan echt met rust?
//   3. Het actielogboek — staat er bij elke stap een reden, en loopt de ring
//      niet vol?
//   4. De echo-krimp (#211) — verkleint de groep op herhaalde antwoorden, en
//      stopt hij bij 2 in plaats van door te zakken naar 1?
//   5. Een vastgezette groep — houdt die de automaat buiten de deur?
//   6. pidPollInterval() — komt de handmatige multiplier daar werkelijk
//      aan, en laat overnemen het tempo staan waar het stond? (17-09-2026)
//
// WAT HIER NIET TE TOETSEN VALT: of het paneel er goed uitziet en of de
// grafiek klopt. Dat is de DOM, en die kant staat in bproef-adapterpaneel.js.
//
// Draaien vanuit public/:  node test-adapterpaneel.js    (exit 0 = goed)
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
function waar(naam, uitspraak, uitleg) {
  n++;
  if (uitspraak) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}

function lees(b) { return fs.readFileSync(__dirname + '/' + b, 'utf8'); }

// ── de sandbox ────────────────────────────────────────────────────
// Dezelfde opzet als test-blok5lijst.js: de modules hangen zichzelf aan
// window en hebben voor het laden geen DOM en geen verbinding nodig. Alleen
// wat ze bij het láden aanraken staat hier.
function bouw() {
  const s = {};
  s.window = s; s.globalThis = s;
  s.connected = true; s.demoMode = false;
  s.console = { log() { }, warn() { }, error() { } };
  s.localStorage = { getItem: () => null, setItem() { }, removeItem() { }, key: () => null, length: 0 };
  s.sessionStorage = s.localStorage;
  s.document = {
    readyState: 'complete',
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() { }, remove() { } }, appendChild() { }, addEventListener() { } }),
    addEventListener() { }, body: { appendChild() { } }
  };
  s.navigator = { userAgent: 'node' };
  s.setTimeout = (f) => 0; s.clearTimeout = () => { };
  s.setInterval = () => 0; s.clearInterval = () => { };
  s.performance = { now: () => Date.now() };
  vm.createContext(s);

  // 1. de echte tabellen + PLBus
  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });

  // 2. wat PLLoad en PLAdapter bij het laden van de rest van de app verwachten
  vm.runInContext(`
    var _btLog=[];
    var _focusPIDs=new Set(), _pollMult=1.0, _evModeActive=false;
    var activePIDs=new Set(['010C','010D','0104']), supportedPIDs=new Set(['010C','010D','0104']);
    var discoveredPIDDefs=[], pidVals={};
    var _btDiags=[];
    function btDiag(m,t){ _btDiags.push({m:String(m),t:t||'info'}); }
    function log(){} function logToSheets(){} function showToast(){}
    function detectEngineType(){ return 'benzine'; }
    function actiefPollProfiel(){ return 'basis'; }
    function isMode01(p){ return /^01/i.test(String(p)); }
  `, s, { filename: 'sandbox-omgeving' });

  // 3. de regelkring en het paneel, allebei uit de bron
  vm.runInContext(lees('pidlane-plload.js'), s, { filename: 'pidlane-plload.js' });
  vm.runInContext(lees('pidlane-adapter.js'), s, { filename: 'pidlane-adapter.js' });

  if (!s.PLLoad) { console.error('FOUT: PLLoad is niet geladen — is pidlane-plload.js hernoemd?'); process.exit(1); }
  if (!s.PLAdapter) { console.error('FOUT: PLAdapter is niet geladen — is pidlane-adapter.js hernoemd?'); process.exit(1); }
  return s;
}

// ══════════════════════════════════════════════════════════════════
console.log('\n── het advies: vier situaties, vier uitkomsten ──');
{
  const s = bouw();
  const A = s.PLAdapter.advies;

  // 1. De adapter herhaalt op ÉLKE trap frames. Dan gaat het advies over de
  //    groep en niet over het tempo — dit is het geval van 16-09.
  const echo = A([
    { naam: 'rustig', n: 14, perSec: 1.4, medMs: 180, soloMisPct: 0, batchOnvolPct: 30, echo: 4 },
    { naam: 'vol gas', n: 50, perSec: 5.0, medMs: 190, soloMisPct: 0, batchOnvolPct: 35, echo: 9 }
  ], { perSec: 3, tempoPct: 60 });
  toets('bij echo op elke trap: geen tempo-advies', echo.tempoPct, null);
  toets('bij echo op elke trap: wél een groepsadvies', echo.groep, 2);
  waar('de reden noemt het aantal herhalingen', /13 herhaalde/.test(echo.reden), echo.reden);

  // 2. Echo op ÉÉN trap is iets anders dan een adapter die het altijd doet:
  //    dan blijft de schone trap gewoon bruikbaar als bovengrens.
  const deels = A([
    { naam: 'rustig', n: 14, perSec: 1.4, medMs: 180, soloMisPct: 0, batchOnvolPct: 0, echo: 0 },
    { naam: 'vol gas', n: 50, perSec: 5.0, medMs: 190, soloMisPct: 0, batchOnvolPct: 35, echo: 9 }
  ], { perSec: 3, tempoPct: 60 });
  toets('echo op één trap: de schone trap is de bovengrens', deels.veiligPerSec, 1.4);

  // 3. Schoon: het tempo-advies is rekenwerk. 60% op 3/s, schoon tot 6/s →
  //    60 x 6/3 = 120, afgekapt op 100.
  const schoon = [
    { naam: 'rustig', n: 14, perSec: 1.4, medMs: 180, soloMisPct: 0, batchOnvolPct: 0, echo: 0 },
    { naam: 'vol gas', n: 60, perSec: 6.0, medMs: 200, soloMisPct: 0, batchOnvolPct: 0, echo: 0 }
  ];
  toets('schoon tot 6/s bij 3/s op 60% → 100%', A(schoon, { perSec: 3, tempoPct: 60 }).tempoPct, 100);
  // En hetzelfde rekenwerk de andere kant op: haalt de app 6/s terwijl er maar
  // 3 schoon doorheen komen, dan moet het tempo omláág. Een advies dat alleen
  // "meer" kan zeggen is geen advies.
  const omlaag = A([
    { naam: 'rustig', n: 30, perSec: 3.0, medMs: 180, soloMisPct: 0, batchOnvolPct: 0, echo: 0 },
    { naam: 'vol gas', n: 60, perSec: 6.0, medMs: 900, soloMisPct: 20, batchOnvolPct: 0, echo: 0 }
  ], { perSec: 6, tempoPct: 80 });
  toets('schoon tot 3/s terwijl de app 6/s doet op 80% → 40%', omlaag.tempoPct, 40);

  // 4. Geen enkele schone trap, en geen meting. Allebei horen ze een eigen
  //    antwoord te geven in plaats van stil een getal te verzinnen.
  const vies = A([
    { naam: 'rustig', n: 14, perSec: 1.4, medMs: 800, soloMisPct: 20, batchOnvolPct: 40, echo: 0 }
  ], { perSec: 3, tempoPct: 60 });
  toets('geen schone trap: geen tempo-advies', vies.tempoPct, null);
  toets('geen trappen: eigen antwoord', A([], { perSec: 3, tempoPct: 60 }).kop, 'Geen meting');
  toets('lege trappen tellen niet mee', A([{ naam: 'x', n: 0 }], { perSec: 3, tempoPct: 60 }).kop, 'Geen meting');

  // 5. Zonder ijkpunt kan het rekenwerk niet, en dan hoort het advies dat te
  //    zeggen in plaats van een tempo te noemen dat nergens uit volgt.
  const zonder = A(schoon, { perSec: 0, tempoPct: 0 });
  toets('zonder ijkpunt: geen tempo', zonder.tempoPct, null);
  toets('zonder ijkpunt: wel de haalbare snelheid', zonder.veiligPerSec, 6);
}

console.log('\n── de handmatige stand ──');
{
  const s = bouw();
  const L = s.PLLoad;

  toets('begint op automaat', L.isHandmatig(), false);
  toets('mult() geeft de automaat-multiplier', L.mult(), 1.0);

  // Overnemen neemt de STAND over die er was, niet 1.0. Anders springt het
  // tempo op het moment van omzetten en meet je daarna iets anders.
  L._mult = 2.5;
  L.handmatig(true, 'proef');
  toets('overnemen begint op de stand die er stond', L.mult(), 2.5);
  toets('de automaat-multiplier blijft leesbaar', L.staat().automaatMult, 2.5);
  toets('staat() meldt de handmatige stand', L.staat().handmatig, true);

  toets('50% tempo → multiplier 2', L.zetTempo(50), 50);
  toets('en mult() volgt mee', L.mult(), 2);
  toets('boven 100% kan niet', L.zetTempo(400), 100);
  toets('en onder de MAX ook niet', L.zetTempo(1), Math.round(100 / L.MAX));

  // Dit is de kern: in de handmatige stand mag tick() de multiplier niet meer
  // aanraken, hoe druk de bus ook is.
  s.PLBus.stats = () => ({ perSec: 5, foutPct: 90, belasting: 100, venGemMs: 900, gemMs: 900,
                           onvolPct: 0, echoTot: 0, echoSinds: 0, echoPct: 0, reqTot: 10, reqOnvol: 0 });
  const voor = L.mult();
  L._laatstTick = 0; L.tick();
  L._laatstTick = 0; L.tick();
  toets('tick() laat de handmatige stand met rust', L.mult(), voor);
  waar('maar hij blijft wél meten', L.staat().code === 'dood',
       'staat is "' + L.staat().code + '" — de automaat hoort door te meten terwijl hij niet ingrijpt');

  /* EN DAT IS MEER DAN ALLEEN DE MULTIPLIER.
     De eerste versie hierboven keek alleen naar mult(), en die geeft in de
     handmatige stand toch al `_handMult` — dus hij bleef groen ook als tick()
     gewoon doorregelde. Dat kwam uit plmutate op 16-09-2026: de mutatie die de
     handmatige poort weghaalde ontsnapte.

     Wat er dan werkelijk misgaat is dit: de automaat verkleint de groep en
     schrijft stappen in het logboek terwijl het paneel "handmatig" toont. Een
     logboek dat handelingen claimt die niemand koos is erger dan geen
     logboek — dus dat is waar deze toets nu op kijkt. */
  L.wisActies();
  const groepVoor = s.PLBus.batchGroep();
  let echoLoopt = 0;
  s.PLBus.stats = () => ({ perSec: 3, foutPct: 90, belasting: 100, venGemMs: 900, gemMs: 900,
                           onvolPct: 40, echoTot: (echoLoopt += 6), echoSinds: 1, echoPct: 40,
                           reqTot: 100, reqOnvol: 40 });
  for (let i = 0; i < 4; i++) { L._laatstTick = 0; L.tick(); }
  toets('de automaat boekt geen stappen in de handmatige stand', L.acties().length, 0);
  toets('en hij verkleint de groep niet achter je rug om', s.PLBus.batchGroep(), groepVoor);

  // Teruggeven levert de automaat zijn eigen stand terug.
  L.handmatig(false, 'proef terug');
  toets('teruggeven aan de automaat neemt de handmatige stand over', L.mult(), voor);
}

console.log('\n── het schuifje komt aan in pidPollInterval() ──');
/* WAT HIER IS MISGEGAAN, 17-09-2026. Blok 5 meldde FOUT: "op 50% tempo bleef
   het interval van 010C op 308 ms staan (was 280 ms) — de handmatige
   multiplier komt niet in pidPollInterval() aan". De app deed niets verkeerd.
   Die proef las het ijkpunt vóór het overnemen, en de automaat stond op dat
   moment op 55% (mult 1.82, profiel caravan, strategie "snel"). Van 55% naar
   50% is 10% verschil, en de proef eiste er meer dan 50% bij.

   Deze sectie legt beide kanten vast met de getallen van die run: het interval
   volgt de handmatige multiplier, en overnemen laat het tempo met opzet staan
   waar het stond — dáárom hoort het ijkpunt in de handmatige stand te liggen.
   Zie §11. */
{
  const s = bouw();
  // De stand van 17-09 nagebouwd: profiel caravan, strategie "snel".
  vm.runInContext('actiefPollProfiel = function(){ return "caravan"; }; _pollMult = 0.7;', s);
  const L = s.PLLoad;
  waar('pidPollInterval() is uit de bron geladen', typeof s.pidPollInterval === 'function',
    'kreeg ' + typeof s.pidPollInterval + ' — is de functie hernoemd of naar een andere module verhuisd?');

  L._mult = 1.82;
  toets('de automaat op 55% geeft het interval van 17-09', s.pidPollInterval('010C'), 280);

  L.handmatig(true, 'proef');
  L.zetTempo(100);
  const vol = s.pidPollInterval('010C');
  L.zetTempo(50);
  const half = s.pidPollInterval('010C');
  toets('100% tempo geeft het onverkorte interval', vol, 154);
  toets('en 50% tempo verdubbelt dat', half, 308);
  waar('het schuifje komt dus wél aan', Math.abs(half - vol * 2) <= 2,
    vol + ' ms → ' + half + ' ms, verwacht ' + (vol * 2) + ' ms');
}
{
  // En dit is waaróm het ijkpunt in de handmatige stand hoort: overnemen laat
  // het tempo staan waar het stond. Het interval mag op het moment van
  // omzetten niet springen — wie hier vóór het overnemen meet, meet de
  // automaat en niet het schuifje.
  const s = bouw();
  vm.runInContext('actiefPollProfiel = function(){ return "caravan"; }; _pollMult = 0.7;', s);
  s.PLLoad._mult = 1.82;
  const voorOmzetten = s.pidPollInterval('010C');
  s.PLLoad.handmatig(true, 'proef');
  toets('overnemen laat het interval staan waar het stond', s.pidPollInterval('010C'), voorOmzetten);
}

console.log('\n── het actielogboek ──');
{
  const s = bouw();
  const L = s.PLLoad;
  L.wisActies();
  L.handmatig(true, 'omdat het kan');
  const a = L.acties();
  toets('een standwissel komt in het logboek', a.length, 1);
  toets('met de reden erbij', a[0].reden, 'omdat het kan');
  toets('en met wat er veranderde', a[0].wat, 'handmatig');

  // De automaat boekt zijn eigen stappen met de zone als reden.
  L.handmatig(false, 'terug');
  L.wisActies();
  s.PLBus.stats = () => ({ perSec: 5, foutPct: 40, belasting: 100, venGemMs: 900, gemMs: 900,
                           onvolPct: 0, echoTot: 0, echoSinds: 0, echoPct: 0, reqTot: 10, reqOnvol: 0 });
  L._laatstTick = 0; L._mult = 1.0; L.tick();
  const b = L.acties();
  waar('de automaat boekt zijn verlaging', b.length >= 1, 'niets geboekt bij foutgraad 40%');
  waar('met de foutgraad als reden', b.length > 0 && /foutgraad 40%/.test(b[b.length - 1].reden),
       b.length ? b[b.length - 1].reden : '(geen actie)');
  waar('en met de cijfers van dat moment erbij', b.length > 0 && b[b.length - 1].bezet === 100,
       'bezet is ' + (b.length ? b[b.length - 1].bezet : '—'));

  // De ring mag niet oneindig groeien: dit draait een hele rit mee.
  for (let i = 0; i < 200; i++) L.boekActie('tempo', 100, 50, 'vulling');
  waar('de ring loopt niet vol', L.acties().length <= 60, L.acties().length + ' entries');
}

console.log('\n── de echo-krimp (#211) ──');
{
  const s = bouw();
  const L = s.PLLoad, B = s.PLBus;
  let echo = 0;
  s.PLBus.stats = () => ({ perSec: 3, foutPct: 0, belasting: 60, venGemMs: 200, gemMs: 200,
                           onvolPct: 35, echoTot: echo, echoSinds: 1, echoPct: 35, reqTot: 100, reqOnvol: 35 });
  B.batchReset();
  toets('begint op groep 3', B.batchGroep(), 3);

  // Eerste tik zet alleen het ijkpunt: de teller is cumulatief, dus zonder
  // vorige stand is er geen "erbij".
  L._laatstTick = 0; L.tick();
  toets('de eerste tik verandert niets', B.batchGroep(), 3);

  echo += 5;
  L._laatstTick = 0; L.tick();
  toets('vijf herhalingen in één tik verkleinen de groep', B.batchGroep(), 2);

  // En hij zakt NIET door naar 1: dat verdrievoudigt het aantal verzoeken en
  // die afweging hoort bij een mens, niet bij een regelkring.
  echo += 9;
  L._laatstTick = 0; L.tick();
  echo += 9;
  L._laatstTick = 0; L.tick();
  toets('maar hij zakt niet door naar 1', B.batchGroep(), 2);

  const acties = L.acties().filter(a => a.wat === 'groep');
  waar('de krimp staat in het logboek met een reden', acties.length === 1 && /herhaalde/.test(acties[0].reden),
       JSON.stringify(acties));

  // Eén herhaling per tik is geen reden om te krimpen — anders krimpt hij op
  // ruis en is de groep binnen een minuut altijd 2.
  const s2 = bouw();
  let e2 = 0;
  s2.PLBus.stats = () => ({ perSec: 3, foutPct: 0, belasting: 60, venGemMs: 200, gemMs: 200,
                            onvolPct: 5, echoTot: e2, echoSinds: 1, echoPct: 5, reqTot: 100, reqOnvol: 5 });
  s2.PLLoad._laatstTick = 0; s2.PLLoad.tick();
  for (let i = 0; i < 6; i++) { e2 += 1; s2.PLLoad._laatstTick = 0; s2.PLLoad.tick(); }
  toets('één herhaling per tik krimpt niet', s2.PLBus.batchGroep(), 3);
}

console.log('\n── een vastgezette groep ──');
{
  const s = bouw();
  const B = s.PLBus;
  B.batchReset();
  toets('vastzetten geeft de gezette waarde terug', B.batchZet(2, true), 2);
  toets('en hij staat vast', B.batchVast(), true);
  toets('de automaat mag hem niet verkleinen', B.batchKleiner(), false);
  toets('en niet vergroten', B.batchGroter(), false);
  B.batchReset();
  toets('batchReset() laat hem ook staan', B.batchGroep(), 2);
  B.batchZet(3, false);
  toets('losmaken geeft de automaat hem terug', B.batchVast(), false);
  toets('en dan mag verkleinen weer', B.batchKleiner(), true);

  // Grenzen: buiten 1..3 bestaat er geen groep.
  toets('groep 9 wordt 3', B.batchZet(9, false), 3);
  toets('groep 0 wordt 1', B.batchZet(0, false), 1);
}

console.log('\n── de geschiedenis van het paneel ──');
{
  const s = bouw();
  s.PLBus.stats = () => ({ perSec: 2.5, foutPct: 0, belasting: 40, venGemMs: 210, gemMs: 210,
                           onvolPct: 0, echoTot: 7, echoSinds: 1, echoPct: 7, reqTot: 100, reqOnvol: 0 });
  const m = s.PLAdapter.monster();
  toets('een monster draagt de verzoeken per seconde', m.perSec, 2.5);
  toets('en de echoteller', m.echo, 7);
  toets('de geschiedenis groeit mee', s.PLAdapter.historie().length, 1);
  // Twaalf minuten is genoeg; daarna hoort hij te rollen in plaats van te groeien.
  for (let i = 0; i < 400; i++) s.PLAdapter.monster();
  waar('de geschiedenis loopt niet vol', s.PLAdapter.historie().length <= 240,
       s.PLAdapter.historie().length + ' monsters');
}

console.log('\n── de aanwijzing "opnieuw verbinden" (26-09-2026) ──');
{
  // Het verloop van de rit van 26-09: begint rond 150 ms, loopt op naar 270.
  const s = bouw();
  const m = (ms) => ({ perSec: 1000 / ms, venMs: ms });
  const oplopend = [];
  for (let i = 0; i < 20; i++) oplopend.push(m(150));
  for (let i = 0; i < 20; i++) oplopend.push(m(220));
  for (let i = 0; i < 10; i++) oplopend.push(m(272));
  const d = s.PLAdapter.drift(oplopend);
  waar('een verdubbelde responstijd geeft de aanwijzing', !!d && d.van === 150 && d.naar === 272, JSON.stringify(d));
  // Tegenproef 1: een rustig verloop geeft niets.
  const rustig = [];
  for (let i = 0; i < 40; i++) rustig.push(m(80 + (i % 5)));
  waar('een rustige verbinding geeft geen aanwijzing', s.PLAdapter.drift(rustig) === null);
  // Tegenproef 2: verdubbeld maar nog snel (60 → 130 ms) is geen winst.
  const snel = [];
  for (let i = 0; i < 20; i++) snel.push(m(60));
  for (let i = 0; i < 10; i++) snel.push(m(130));
  waar('onder 150 ms geen aanwijzing, ook niet bij een verdubbeling', s.PLAdapter.drift(snel) === null);
  // Tegenproef 3: te weinig monsters om iets te zeggen.
  waar('met minder dan tien monsters geen oordeel', s.PLAdapter.drift(oplopend.slice(-5)) === null);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n── het sessiebewijs van #302: oploopt, waardoor, en wat herstelt ──');
{
  const s = bouw();
  const P = s.PLAdapter;
  const t0 = 1e12, m = (i, ms, extra) => Object.assign({ t: t0 + i * 30000, nr: 1, ms: ms, rps: 5, bezet: 90, pids: 26, weergave: 'slim', modules: [], koel: 90 }, extra || {});
  // 40 minuten: 150 ms, en vanaf minuut 20 (monster 40) 270 ms, precies bij het wisselen naar Slim visueel.
  const reeks = [];
  for (let i = 0; i < 80; i++) reeks.push(m(i, i < 40 ? 150 : 270, i >= 40 ? { weergave: 'visueel' } : {}));
  // opnieuw verbonden: 80 ms
  for (let i = 82; i < 90; i++) reeks.push(m(i, 80, { nr: 2 }));
  const a = P.driftAnalyse(reeks, [{ t: t0 + 81 * 30000, soort: 'herverbind-knop' }]);
  const g = a.groepen[0];
  toets('begin en eind van de verbinding', [g.begin, g.eind, g.factor], [150, 270, 1.8]);
  toets('één stap, rond minuut 20, bij het wisselen van weergave', [g.stappen.length, g.stappen[0].minuut, g.stappen[0].wat[0]], [1, 20, 'weergave slim → visueel']);
  toets('de nieuwe verbinding zet hem terug, via de knop', [Math.round(a.herstel[0].van), Math.round(a.herstel[0].naar), a.herstel[0].knop], [270, 80, true]);
  const o = P.driftOordeel(a, 25);
  toets('het oordeel: FOUT met het patroon en het herstel erin', [o.staat, o.drift, /stapsgewijs/.test(o.detail), /weergave slim → visueel/.test(o.detail), /270 → 80/.test(o.detail)], ['FOUT', true, true, true, true]);
  // geleidelijk: 150 → 260 in kleine stapjes
  const glad = [];
  for (let i = 0; i < 70; i++) glad.push(m(i, Math.round(150 + i * 1.6)));
  const og = P.driftOordeel(P.driftAnalyse(glad, []), 25);
  toets('geleidelijk oplopen heet ook zo, zonder verzonnen stap', [og.staat, /geleidelijk/.test(og.detail), P.driftAnalyse(glad, []).groepen[0].stappen.length], ['FOUT', true, 0]);
  const vlak = [];
  for (let i = 0; i < 70; i++) vlak.push(m(i, 150 + (i % 3) * 5));
  toets('vlak over 35 min: ok, "trad niet op"', [P.driftOordeel(P.driftAnalyse(vlak, []), 25).staat], ['ok']);
  toets('korter dan 25 min verbonden: LET OP met wat nodig is', [P.driftOordeel(P.driftAnalyse(vlak.slice(0, 30), []), 25).staat], ['LET OP']);
  // één uitschieter is geen stap
  const piek = vlak.map((x, i) => i === 30 ? Object.assign({}, x, { ms: 600 }) : x);
  toets('één uitschieter van 600 ms is geen stap', [P.driftAnalyse(piek, []).groepen[0].stappen.length], [0]);

  /* De SPP-proef (#352): dezelfde stap van 150 naar 270 ms, maar nu op het
     moment dat de proef de verbinding aantastte. Dat is de proef en niet
     #302 — het oordeel mag geen FOUT geven, en de stap noemt de oorzaak. De
     tegenproef is de reeks hierboven: zonder markering blijft het FOUT. */
  const geproefd = [];
  for (let i = 0; i < 80; i++) geproefd.push(m(i, i < 40 ? 150 : 270, i >= 40 ? { proef: true } : {}));
  const ap = P.driftAnalyse(geproefd, []);
  toets('de stap noemt de SPP-proef als oorzaak', [ap.groepen[0].stappen.length, ap.groepen[0].stappen[0].wat.indexOf('SPP-proef (#352)') > -1], [1, true]);
  const op = P.driftOordeel(ap, 25);
  toets('een door de proef aangetaste verbinding: LET OP, geen drift', [op.staat, op.drift, /SPP-proef/.test(op.detail)], ['LET OP', false, true]);
  toets('zonder markering is dezelfde reeks FOUT', [P.driftOordeel(P.driftAnalyse(reeks, []), 25).staat], ['FOUT']);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n── de SPP-proef boekt een gebeurtenis (#352) ──');
{
  const s = bouw();
  waar('PLAdapter.noteer bestaat en boekt een gebeurtenis',
    typeof s.PLAdapter.noteer === 'function' && (s.PLAdapter.noteer('spp-proef'), s.PLAdapter.gebeurtenissen().some((e) => e.soort === 'spp-proef')));
}

// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
console.log('\n── de app-maten van de meetrit (#302, #333; 01-10-2026) ──');
{
  const s = bouw();
  const P = s.PLAdapter;
  // A koud en stil, B warm en stil, C rijdend; daartussen geen uitspraak.
  toets('de omstandigheid van een groepsproef',
    [P.gpSituatie(0, 20), P.gpSituatie(0, 90), P.gpSituatie(80, 90), P.gpSituatie(80, 20), P.gpSituatie(0, 60), P.gpSituatie(20, 90), P.gpSituatie(null, 90), P.gpSituatie(0, null)],
    ['a', 'b', 'c', 'c', null, null, null, null]);

  // Een proef zoals die van 01-10 13:01: groep 6 haalt 79% meer dan groep 3.
  const pps = { 1: 15.5, 2: 25, 3: 42.5, 4: 56, 5: 66, 6: 75.9 };
  function stappen(terugMs6) {
    const uit = [];
    ['heen', 'terug'].forEach(function (rit) {
      [1, 2, 3, 4, 5, 6].forEach(function (g) {
        uit.push({ groep: g, rit: rit, n: 100, sec: 8, gekregen: Math.round(pps[g] * 8), onvol: 0, leeg: 0, echo: 0,
                   medMs: (rit === 'terug' && g === 6 && terugMs6) ? terugMs6 : 70 });
      });
    });
    return uit;
  }
  const proef = (sit, extra) => Object.assign({ t: 1, adapter: 'OBDLink MX+', protocol: 'CAN', ijk: { bewezen: ['010C', '010D'], kandidaten: 2 },
                                                afgebroken: null, situatie: sit, stappen: stappen() }, extra || {});
  toets('vóór een proef: niets gemeten (null), geen 0', [P.maat('groep-b-advies'), P.maat('groep-b-winst'), P.maat('groep-b-drift')], [null, null, null]);
  P._gpKlaar(proef('b'));
  toets('proef B: advies 6, 79% winst, geen drift', [P.maat('groep-b-advies'), P.maat('groep-b-winst'), P.maat('groep-b-drift')], [6, 79]
    .concat([0]));
  toets('en A en C zijn daarmee niet gemeten', [P.maat('groep-a-advies'), P.maat('groep-c-advies')], [null, null]);
  P._gpKlaar(proef('c', { afgebroken: 'de verbinding viel weg bij stap 4' }));
  toets('een afgebroken proef C telt niet', [P.maat('groep-c-advies')], [null]);
  P._gpKlaar(proef(null));
  toets('een proef zonder omstandigheid (lauw, of 20 km/u) overschrijft B niet', [P.maat('groep-b-advies')], [6]);
  P._gpKlaar(proef('a', { stappen: stappen(110) }));
  toets('TEGENPROEF: groep 6 heen 70 ms, terug 110 ms is drift in A', [P.maat('groep-a-drift')], [1]);
  // Geen schone groep: gemeten, en slecht — 0, geen null.
  const vies = stappen().map(x => Object.assign({}, x, { leeg: 10 }));
  P._gpKlaar(proef('c', { stappen: vies }));
  toets('geen enkele schone groep in C: advies 0 en winst 0, gemeten', [P.maat('groep-c-advies'), P.maat('groep-c-winst')], [0, 0]);

  // #302: dezelfde reeksen als driftOordeel().
  const t0 = 1e12, m = (i, ms, extra) => Object.assign({ t: t0 + i * 30000, nr: 1, ms: ms, rps: 5, bezet: 90, pids: 26, weergave: 'slim', modules: [], koel: 90 }, extra || {});
  const reeks = [];
  for (let i = 0; i < 80; i++) reeks.push(m(i, i < 40 ? 150 : 270, i >= 40 ? { weergave: 'visueel' } : {}));
  for (let i = 82; i < 90; i++) reeks.push(m(i, 80, { nr: 2 }));
  toets('#302 op een oplopende verbinding: 40 min, ×1,8, half in Slim visueel, geen proef',
    ['adapter-sessie-min', 'adapter-drift-pct', 'adapter-visueel-pct', 'adapter-proef'].map(k => P.sessieMaat(k, reeks, [])), [40, 180, 50, 0]);
  const vlak = [];
  for (let i = 0; i < 70; i++) vlak.push(m(i, 150 + (i % 3) * 5, { weergave: 'visueel' }));
  const vl = ['adapter-sessie-min', 'adapter-drift-pct', 'adapter-visueel-pct'].map(k => P.sessieMaat(k, vlak, []));
  toets('TEGENPROEF: een vlakke verbinding van 35 min in Slim visueel: onder de 130%',
    [vl[0], vl[1] < 130, vl[2]], [35, true, 100]);
  toets('een door de SPP-proef aangetaste verbinding zegt dat (adapter-proef 1)',
    [P.sessieMaat('adapter-proef', reeks.map(x => Object.assign({}, x, { proef: true })), [])], [1]);
  toets('zonder sessie: null', [P.sessieMaat('adapter-drift-pct', [], []), P.maat('adapter-sessie-min')], [null, null]);
}

console.log('\n─────────────────────────────────────────');
console.log(n + ' controles, ' + fout + ' fout');
if (fout) { console.log('test-adapterpaneel: FOUT\n'); process.exit(1); }
console.log('test-adapterpaneel: goed\n');
process.exit(0);
