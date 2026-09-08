// ══════════════════════════════════════════════════════════════════
// test-logboeksort.js — het logboek staat op tijd, niet op tekst (#140)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Gemeld op 05-09-2026: "items van 22:00 staan onderaan en nieuwe regels komen
// na middernacht daarboven". Het logboek sorteerde op de tijdstring die de
// bronnen voor het SCHERM maken — "HH:MM:SS", zonder datum. Als string is
// "00:15:03" kleiner dan "22:14:07", dus alles van na twaalven schoof naar
// boven. Binnen één dag valt dat niet op; over middernacht keert het de hele
// tijdlijn om, en juist dan lees je een log terug.
//
// Het pijnlijke was dat de tijd er wél was. log() en btDiag() zetten sinds #75
// `t: Date.now()` naast de kloktijd, precies omdat "HH:MM:SS" niet te
// vergelijken is (PIDLANE-CONTRACT.md §6). pidlane-logboek.js pakte de andere
// helft. De kop van dat bestand schreef dat ook zo op — "geen enkele bewaart een
// echte timestamp" — en die zin was al onwaar toen hij er stond.
//
// WAT HIER GETOETST WORDT
//   1. de echte _uitBtLog/_uitAppLog geven het epoch door dat de bron levert
//   2. verzamel() zet de regels op tijdvolgorde, ook als de kloktijd terugloopt
//   3. een bron zonder epoch (de tekstspiegel) krijgt er een afgeleid, met de
//      dagsprong erin — anders is de fout alleen verplaatst
//   4. de kloktijd die op het scherm komt verandert NIET mee: dat is de string
//      waar de gebruiker en de export op zoeken
//   5. tegenproef — de oude sortering op `t` faalt op ditzelfde materiaal
//
// De functies komen uit pidlane-logboek.js zelf; er staat hier niets nagebouwd.
// Het bestand is een IIFE die zichzelf aan window hangt, dus we draaien hem in
// een sandbox met de vier bronnen als nepglobals en pakken window.PLLogboek.
//
// Draaien vanuit public/:  node test-logboeksort.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
process.env.TZ = 'Europe/Amsterdam';

const fs = require('fs');
const vm = require('vm');

let fout = 0;
function eis(naam, waar, uitleg) {
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

// ── de echte module laden ────────────────────────────────────────
// Alleen wat pidlane-logboek.js aanraakt: de vier bronnen, een lege DOM en
// localStorage. Niets ervan stuurt de sortering — dat doet de module zelf.
function laad(bronnen) {
  const s = {};
  s.window = s;
  s.console = { warn: function () {}, log: function () {}, error: function () {} };
  s.document = {
    getElementById: function () { return null; },
    createElement: function () { return { style: {}, classList: { add: function () {}, remove: function () {} } }; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    body: { appendChild: function () {} }
  };
  s.localStorage = {
    getItem: function (k) { return bronnen.spiegel && k === 'pl_livelog_mirror' ? bronnen.spiegel : null; },
    setItem: function () {}
  };
  s.sessionStorage = { getItem: function () { return null; }, setItem: function () {} };
  s._btLog = bronnen.bt || [];
  s.plLokaalLog = function () { return bronnen.app || []; };
  s.plDiagGevallen = function () { return bronnen.diag || []; };
  s.plDatumLokaal = function (ms) {
    const d = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-logboek.js', 'utf8'), s, { filename: 'pidlane-logboek.js' });
  if (!s.PLLogboek || typeof s.PLLogboek.verzamel !== 'function')
    throw new Error('PLLogboek.verzamel() niet gevonden — hernoemd of niet meer naar buiten gehangen?');
  return s;
}

// Het geval uit de melding: een sessie die om 22:00 begint en na middernacht
// doorloopt. De epochs kloppen; de kloktijden lopen terug.
const D1 = new Date(2026, 8, 5, 22, 0, 5).getTime();   // 5 sep 22:00:05
const D2 = new Date(2026, 8, 5, 23, 58, 41).getTime();
const D3 = new Date(2026, 8, 6, 0, 3, 12).getTime();   // ná middernacht
const D4 = new Date(2026, 8, 6, 0, 15, 3).getTime();
const klok = function (ms) { return new Date(ms).toTimeString().slice(0, 8); };

console.log('\n1. Het epoch van de bron komt door tot in het logboek');
{
  const s = laad({
    bt: [{ ts: klok(D1), t: D1, msg: 'socket open', type: 'ok' },
         { ts: klok(D3), t: D3, msg: 'socket dood', type: 'err' }],
    app: [{ ts: klok(D2), t: D2, msg: 'rapport klaar', type: 'info' }]
  });
  const rijen = s.PLLogboek.verzamel();
  eis('alle drie de regels komen binnen', rijen.length === 3, 'kreeg er ' + rijen.length);
  eis('elke regel draagt een epoch', rijen.every(function (r) { return typeof r.ms === 'number'; }),
      JSON.stringify(rijen.map(function (r) { return r.ms; })));
  eis('het epoch is dat van de bron, niet een afleiding',
      rijen.map(function (r) { return r.ms; }).sort().join() === [D1, D2, D3].sort().join(),
      'kreeg ' + JSON.stringify(rijen.map(function (r) { return r.ms; })));
}

console.log('\n2. De volgorde klopt, ook als de klok over middernacht terugloopt');
{
  const s = laad({
    bt: [{ ts: klok(D1), t: D1, msg: 'oudste', type: 'info' },
         { ts: klok(D4), t: D4, msg: 'jongste', type: 'info' }],
    app: [{ ts: klok(D2), t: D2, msg: 'tweede', type: 'info' },
          { ts: klok(D3), t: D3, msg: 'derde', type: 'info' }]
  });
  const rijen = s.PLLogboek.verzamel();
  const volgorde = rijen.map(function (r) { return r.msg; }).join(' → ');
  eis('oud naar nieuw, over de nacht heen', volgorde === 'oudste → tweede → derde → jongste', volgorde);

  // Tegenproef: precies dit materiaal, gesorteerd zoals het tot #140 ging.
  // Blijft die ook goed staan, dan bewijst de toets hierboven niets.
  const opTekst = rijen.slice().sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; })
                       .map(function (r) { return r.msg; }).join(' → ');
  eis('sorteren op de kloktijd gaat hier wél mis (tegenproef)',
      opTekst !== 'oudste → tweede → derde → jongste',
      'de oude sortering geeft dezelfde volgorde (' + opTekst + ') — dan is er niets te meten');
}

console.log('\n3. Een bron zonder epoch krijgt er een afgeleid, mét de dagsprong');
{
  // De tekstspiegel draagt alleen een kloktijd; het epoch is bij het schrijven
  // al weg. Wat er wél is, is de volgorde waarin de regels zijn opgeschreven.
  // Minder dan 40 regels uit de andere bronnen, anders wordt de spiegel niet
  // eens gelezen — dat is de bestaande regel in verzamel().
  const spiegel = [
    '[BT][' + klok(D1) + '] [INFO] eerste',
    '[BT][' + klok(D2) + '] [INFO] tweede',
    '[BT][' + klok(D3) + '] [INFO] derde',
    '[BT][' + klok(D4) + '] [INFO] vierde'
  ].join('\n');
  const s = laad({ spiegel: spiegel });
  const rijen = s.PLLogboek.verzamel();
  eis('de spiegel wordt gelezen', rijen.length === 4, 'kreeg er ' + rijen.length);
  eis('elke spiegelregel krijgt een epoch', rijen.every(function (r) { return typeof r.ms === 'number'; }));
  const volgorde = rijen.map(function (r) { return r.msg; }).join(' → ');
  eis('de opschrijfvolgorde blijft staan', volgorde === 'eerste → tweede → derde → vierde', volgorde);

  const dagen = {};
  rijen.forEach(function (r) { dagen[s.plDatumLokaal(r.ms)] = 1; });
  eis('de nacht wordt herkend als een dagsprong', Object.keys(dagen).length === 2,
      'gevonden dagen: ' + Object.keys(dagen).join(', ') + ' — zonder sprong staan 22:00 en 00:03 op dezelfde dag');
}

console.log('\n4. De kloktijd op het scherm verandert niet mee');
{
  const s = laad({
    bt: [{ ts: '22:00:05', t: D1, msg: 'regel', type: 'info' },
         { ts: klok(D3), t: D3, msg: 'na middernacht', type: 'info' }]
  });
  const r = s.PLLogboek.verzamel()[0];
  eis('`t` blijft de string die de bron maakte', r.t === '22:00:05', 'kreeg "' + r.t + '"');
  eis('en het epoch staat er los naast', r.ms === D1, 'kreeg ' + r.ms);
  // De export zoekt op deze string (zoekveld) en drukt hem af; verandert die
  // vorm, dan verandert het logboek op het scherm mee zonder dat iemand daarom
  // vroeg. ververs() vult de regels die de export afdrukt — zonder die stap
  // toetst tekst() een leeg logboek en zegt dit blok niets.
  s.PLLogboek.ververs();
  const tekst = s.PLLogboek.tekst();
  eis('de export toont de kloktijd van de bron', tekst.indexOf('[22:00:05]') >= 0);
  eis('de export zet er een dagscheiding boven', /──── \d{4}-\d{2}-\d{2} ────/.test(tekst),
      'zonder die regel is in een log van twee dagen niet te zien waar de nacht zit');
}

console.log('\n5. Regels zonder bruikbare tijd blijven achteraan staan');
{
  const s = laad({
    bt: [{ ts: klok(D1), t: D1, msg: 'met tijd', type: 'info' },
         { ts: '', msg: 'zonder tijd', type: 'info' }]
  });
  const rijen = s.PLLogboek.verzamel();
  eis('de regel zonder tijd staat onderaan',
      rijen[rijen.length - 1].msg === 'zonder tijd',
      rijen.map(function (r) { return r.msg; }).join(' → '));
}

console.log(fout === 0 ? '\nalle tests geslaagd' : '\n' + fout + ' test(s) gefaald');
process.exit(fout === 0 ? 0 : 1);
