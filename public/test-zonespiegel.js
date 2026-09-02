// ══════════════════════════════════════════════════════════════════
// test-zonespiegel.js — blok 7 leest dezelfde regel als PLLoad
// ──────────────────────────────────────────────────────────────────
// DE FOUT (#76). PLBudget.zone() in pidlane-testrun.js staat onder de kop
// "Welke tak zou PLLoad.tick() bij dit monster gekozen hebben?" en had daar een
// eigen KOPIE van die beoordeling staan:
//
//     const druk = m.bezet >= d.bezetOp || m.fout >= d.foutOp;
//
// Dat is precies de OF die op 23-08-2026 uit PLLoad is gehaald, met een lang
// blok commentaar erboven waarom bezetting alléén geen tegendruk is: PLLoad
// regelt zijn eigen pollronde, maar de waakronde, de bulk-recorder en de
// profielwissels vullen de bus ook. De spiegel in de testrun is niet
// meeverhuisd.
//
// Wat dat kostte: blok 7 meldde over de rit van 01-09 "Tijd per zone: druk 87%"
// naast "Tempoverloop: start 100% → nu 100%" en "geen enkele stap omlaag". Die
// drie zijn alleen te rijmen als de zoneverdeling iets anders meet dan wat
// PLLoad doet — en met de echte regel (foutPct ≤ 1%, venGemMs 193 tegen een
// traagMs van 400) was `druk` geen enkele keer waar. 0%, niet 87%. Het rapport
// las als een defecte regelkring die er niet was.
//
// WAT DEZE TEST DOET. Hij laadt pidlane-plload.js én pidlane-testrun.js in
// dezelfde sandbox en houdt de twee tegen elkaar: voor een reeks verzonnen
// monsters moet PLBudget.zone() hetzelfde zeggen als PLLoad.zoneVan(), en moet
// een 'druk'-oordeel samenvallen met een PLLoad die daadwerkelijk terugschroeft.
// Dat laatste is de eigenlijke vraag — of het verslag de regeling beschrijft.
//
// Draaien vanuit public/:  node test-zonespiegel.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── beide modules in één sandbox ──────────────────────────────────
// PLLoad staat in pidlane-plload.js, PLBudget in pidlane-testrun.js. Ze horen
// hier bij elkaar: de hele vraag is of die twee hetzelfde vinden.
function laad() {
  const s = {};
  s.window = s;
  s.connected = true;
  s.demoMode = false;
  s.console = { warn: function () {}, error: function () {}, log: function () {} };
  s.localStorage = { getItem: function () { return null; }, setItem: function () {}, key: function () { return null; }, length: 0 };
  s.document = {
    getElementById: function () { return null; },
    createElement: function () { return { style: {}, classList: { add: function () {}, remove: function () {} } }; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };
  s.setInterval = function () { return 0; };
  s.setTimeout = function () { return 0; };
  s.btDiag = function () {};
  s.log = function () {};
  s._btLog = [];
  s.pidVals = {};
  s._pidLastUpd = {};
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-plload.js', 'utf8'), s, { filename: 'pidlane-plload.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8'), s, { filename: 'pidlane-testrun.js' });
  if (!s.PLLoad || typeof s.PLLoad.zoneVan !== 'function') throw new Error('PLLoad.zoneVan() ontbreekt');
  if (!s.PLBudget || typeof s.PLBudget.zone !== 'function') throw new Error('PLBudget.zone() ontbreekt');
  return s;
}

const S = laad();

// Een monster zoals PLBudget het in zijn ring zet.
function monster(bezet, fout, ms, mult) {
  return { t: 0, mult: mult === undefined ? 1 : mult, tempo: 100, bezet: bezet, fout: fout, ms: ms, perSec: 5, run: false };
}

console.log('1. De rit van 01-09: hoge bezetting, snelle bus, geen fouten');
{
  // Dit zijn de cijfers uit die run. De oude spiegel zei "druk", PLLoad deed
  // niets. Dat verschil is het hele issue.
  const m = monster(90, 1, 193);
  const z = S.PLBudget.zone(m, 190);
  toets('de zone is niet "druk"', z !== 'druk',
        'zone() zegt "' + z + '" bij 90% bezet, 1% fout en 193 ms — dat is de OF-regel van vóór 23-08');
  toets('en PLLoad zou hier ook niets doen', S.PLLoad.zoneVan({ belasting: 90, foutPct: 1, venGemMs: 193 }, 190, 1) === z,
        'PLLoad zegt "' + S.PLLoad.zoneVan({ belasting: 90, foutPct: 1, venGemMs: 193 }, 190, 1) + '", zone() zegt "' + z + '"');
}

console.log('\n2. Wat PLLoad wél druk noemt, noemt blok 7 ook druk');
{
  const gevallen = [
    ['fouten boven de drempel', monster(40, 12, 100), null],
    ['bezet én traag',          monster(90, 0, 500), 480],
    ['bezet én oplopend',       monster(90, 0, 300), 200]
  ];
  gevallen.forEach(function (g) {
    const z = S.PLBudget.zone(g[1], g[2]);
    toets(g[0] + ' → druk', z === 'druk', 'zone() zegt "' + z + '"');
  });
}

console.log('\n3. Elke tak van PLLoad komt bij blok 7 hetzelfde uit');
{
  // Een raster over alle vier de takken. Zou zone() ergens een eigen mening
  // hebben, dan valt hij hier om — ook op takken die niemand handmatig bedacht.
  let mis = 0, n = 0, eerste = '';
  [0, 20, 40, 54, 55, 70, 84, 85, 95, 100].forEach(function (bezet) {
    [0, 3, 5, 9, 10, 40].forEach(function (fout) {
      [0, 100, 250, 399, 400, 700].forEach(function (ms) {
        [null, 90, 350].forEach(function (vorig) {
          [1, 2.5].forEach(function (mult) {
            n++;
            const m = monster(bezet, fout, ms, mult);
            const a = S.PLBudget.zone(m, vorig);
            const b = S.PLLoad.zoneVan({ belasting: bezet, foutPct: fout, venGemMs: ms }, vorig, mult);
            if (a !== b) { mis++; if (!eerste) eerste = bezet + '% / ' + fout + '% / ' + ms + 'ms / vorig ' + vorig + ' / mult ' + mult + ': zone=' + a + ' plload=' + b; }
          });
        });
      });
    });
  });
  toets(n + ' combinaties geven hetzelfde oordeel', mis === 0, mis + ' verschillen, eerste: ' + eerste);
}

console.log('\n4. "kalm" bestaat niet bij een tempo van 100%');
{
  // PLLoad tast alleen af als er iets te winnen valt (_mult > MIN). Stond het
  // tempo de hele rit op 100%, dan is de kalme zone onbereikbaar — en dat is
  // informatie, geen gebrek. De oude spiegel kende die voorwaarde niet en
  // meldde er 3%.
  const rustig = monster(70, 0, 100, 1);
  toets('bij mult 1,0 is het geen "kalm"', S.PLBudget.zone(rustig, 100) !== 'kalm',
        'zone() zegt "' + S.PLBudget.zone(rustig, 100) + '"');
  const zelfde = monster(70, 0, 100, 2.5);
  toets('bij mult 2,5 wel', S.PLBudget.zone(zelfde, 100) === 'kalm',
        'zone() zegt "' + S.PLBudget.zone(zelfde, 100) + '"');
}

console.log('\n5. Het oordeel valt samen met wat PLLoad daadwerkelijk doet');
{
  // De strengste toets: niet twee functies vergelijken maar zone() naast het
  // ECHTE gedrag van tick() leggen. Een 'druk'-oordeel hoort samen te vallen
  // met een multiplier die omhoog gaat (tempo omlaag).
  const meet = function (bezet, fout, ms, vorigMs) {
    const s = laad();
    s.PLBus = { stats: function () { return { belasting: bezet, foutPct: fout, venGemMs: ms, perSec: 5 }; } };
    // Eerste tick zet _vorigVenMs; die is nodig voor venStijgt.
    s.PLLoad._vorigVenMs = vorigMs;
    s.PLLoad._laatstTick = 0;
    const voor = s.PLLoad.mult();
    s.PLLoad.tick();
    return { zone: s.PLBudget.zone(monster(bezet, fout, ms, voor), vorigMs), omhoog: s.PLLoad.mult() > voor };
  };
  const a = meet(90, 1, 193, 190);       // de rit van 01-09
  toets('rustige bus: geen "druk" en geen terugschroeving', a.zone !== 'druk' && !a.omhoog,
        'zone=' + a.zone + ', tempo omlaag=' + a.omhoog);
  const b = meet(90, 0, 600, 400);       // bezet én traag
  toets('trage bus: "druk" én terugschroeving', b.zone === 'druk' && b.omhoog,
        'zone=' + b.zone + ', tempo omlaag=' + b.omhoog);
  const c = meet(40, 25, 100, 100);      // fouten
  toets('fouten: "druk" én terugschroeving', c.zone === 'druk' && c.omhoog,
        'zone=' + c.zone + ', tempo omlaag=' + c.omhoog);
}

console.log('\n6. Zonder PLLoad wordt er niets nagebouwd');
{
  // De terugval moet 'onbekend' zijn en géén eigen regel. Een nabouw is precies
  // hoe deze bug ontstond, en blok 7 meldt liever niets dan een verzonnen getal.
  const s = laad();
  // Weghalen moet BINNEN de sandbox gebeuren. `delete s.PLLoad` van buitenaf
  // haalt de eigenschap wel van het sandbox-object af, maar de code in de
  // context leest hem dan nog steeds — een val die deze test eerst zelf in
  // liep, en die een groene uitkomst gaf op een guard die nooit vuurde.
  vm.runInContext('window.PLLoad = undefined;', s);
  const z = s.PLBudget.zone(monster(90, 1, 193), 190);
  toets('zone() zegt "onbekend"', z === 'onbekend', 'zone() zegt "' + z + '"');
  const bron = fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8');
  const van = bron.indexOf('function zone(m, vorigMs)');
  const tot = bron.indexOf('\n  }', van);
  const body = van > -1 ? bron.slice(van, tot) : '';
  toets('en er staat geen eigen drempelvergelijking meer in zone()',
        van > -1 && !/bezetOp|foutOp|bezetAf/.test(body),
        'zone() rekent weer zelf met drempels: ' + body.replace(/\s+/g, ' ').slice(0, 160));
}

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
