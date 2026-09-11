// ══════════════════════════════════════════════════════════════════
// test-achtergrondproef.js — meet blok 5 het juiste verschil? (#18)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST ER OP 08-09-2026 BIJ KWAM
//
// De proef van #18 in blok 5 legt twee bronnen naast elkaar. Tot 7.3 waren dat
// de verkeerde twee: het GAT dat PLRit uit zijn eigen tikken afleidt, tegen de
// AFWEZIGHEID die PLAchtergrond van visibilitychange weet. Liepen die meer dan
// een kwart uiteen, dan zette de proef er LET OP op.
//
// Op de rit van 02-09 om 23:22 deed hij dat ook:
//
//     PLRit leidt 1 onderbreking(en) af, grootste 64 s
//     PLAchtergrond wéét er 1, grootste 120 s
//     — de twee bronnen verschillen meer dan een kwart
//
// En dat verschil was echt, maar geen meetfout. Het app-log van diezelfde rit
// laat zien dat de app na het verbergen nog ruim een halve minuut dóórliep: een
// volledige herverbinding met ELM-init, een sensoruitval, een verificatie,
// afgerond. Pas daarna heeft Android hem bevroren. De twee bronnen maten dus
// twee verschillende dingen, allebei goed — en de proef sloeg alarm op precies
// het getal dat hij hoorde te rapporteren.
//
// Sinds 08-09 meet PLAchtergrond met een hartslag hoe lang de meetlus wérkelijk
// stillag, en vergelijkt blok 5 dát met het gat van PLRit. De aanlooptijd is
// geen alarm meer maar een meetwaarde.
//
// WAT HIER GETOETST WORDT, EN WAAROM ZO
//
// Allebei de modules zijn echt: pidlane-achtergrond.js en pidlane-testrun.js
// worden in dezelfde sandbox geladen, op één gestuurde klok. PLRit krijgt zijn
// gaten via zijn eigen tik(nuOverride) — dat haakje bestaat al voor test-rit.js
// — en PLAchtergrond krijgt zijn stilte via de hartslag. Er wordt dus geen
// uitkomst nagebouwd; de rit van 02-09 wordt nagespeeld en de proef mag zelf
// zeggen wat hij ervan vindt.
//
// De onderscheidende toets is de eerste: dezelfde rit die op 02-09 LET OP
// opleverde, hoort nu groen te zijn — mét de aanlooptijd erbij. Wie de oude
// vergelijking terugzet, krijgt hem rood.
//
// Draaien vanuit public/:  node test-achtergrondproef.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

// ── de sandbox ────────────────────────────────────────────────────
// Dezelfde vorm als test-blok5lijst.js, met twee toevoegingen: een klok die
// ook `new Date()` stuurt (plMarkeer zet zijn stempel met getTime(), niet met
// Date.now()), en een timerpaar dat de hartslag stuurbaar maakt.
function bouw() {
  const s = {};
  s.window = s; s.globalThis = s;
  s.connected = true;
  s.demoMode = false;
  s.pidVals = { '0105': 80 };
  s._pidLastUpd = { '0105': 0 };
  s.activePIDs = new Set();
  s.console = { warn() { }, error() { }, log() { } };
  s.logs = [];
  s.log = function (m, niveau) { s.logs.push({ m: String(m), niveau: niveau || 'info' }); };
  s.btDiag = function () { };
  s.localStorage = { getItem() { return null; }, setItem() { }, key() { return null; }, length: 0 };
  s.document = {
    _luisteraars: {},
    addEventListener(naam, fn) { this._luisteraars[naam] = fn; },
    visibilityState: 'visible',
    getElementById() { return null; },
    createElement() { return { style: {}, classList: { add() { }, remove() { } } }; },
    querySelectorAll() { return []; },
    body: { appendChild() { } }
  };
  s.navigator = { userAgent: 'node' };
  s.timers = { fn: null, id: 0 };
  s.setInterval = function (fn) { s.timers.fn = fn; return ++s.timers.id; };
  s.clearInterval = function () { s.timers.fn = null; };
  s.setTimeout = function () { return 0; };
  s.PLBus = { stats() { return { belasting: 70, perSec: 5, venGemMs: 120, foutPct: 0 }; } };
  s.PLLoad = { staat() { return { mult: 1, tempoPct: 100 }; }, cfg: {} };
  vm.createContext(s);

  // De klok, vóór beide modules. `new Date()` moet mee: plMarkeer zet zijn
  // stempel met t.getTime(), en dat is het knippunt waarop de proef filtert.
  vm.runInContext(
    'window.__nu = 1788000000000;' +
    'var _EchteDate = Date;' +
    'Date = function (a) { return a === undefined ? new _EchteDate(window.__nu) : new _EchteDate(a); };' +
    'Date.now = function () { return window.__nu; };' +
    'Date.prototype = _EchteDate.prototype;', s);

  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-achtergrond.js', 'utf8'),
    s, { filename: 'pidlane-achtergrond.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8'),
    s, { filename: 'pidlane-testrun.js' });
  if (!s.PLBlok5) { console.error('FOUT: PLBlok5 niet gevonden'); process.exit(1); }
  if (!s.PLAchtergrond) { console.error('FOUT: PLAchtergrond niet geladen'); process.exit(1); }
  return s;
}

function verstrijk(s, ms) { vm.runInContext('window.__nu += ' + ms + ';', s); }
function nu(s) { return vm.runInContext('window.__nu', s); }

// PLRit laten tikken zoals het interval dat doet: elke vijf seconden één tik,
// met een verse stempel zodat er ook werkelijk iets gemeten wordt (#74).
function tikken(s, ms) {
  for (let i = 0; i < Math.floor(ms / 5000); i++) {
    verstrijk(s, 5000);
    vm.runInContext('_pidLastUpd["0105"] = window.__nu;', s);
    s.PLRit.tik(nu(s));
  }
}
// De hartslag van PLAchtergrond, één per seconde.
function hartslagen(s, ms) {
  for (let i = 0; i < Math.floor(ms / 1000); i++) { verstrijk(s, 1000); if (s.timers.fn) s.timers.fn(); }
}
// Bevroren: de klok loopt, geen van beide lussen doet iets.
function bevroren(s, ms) { verstrijk(s, ms); }

/* De proef uit de echte lijst halen. Niet op index, want dan verschuift deze
   test bij elke opruimactie in PROEVEN_B5 — en sinds 11-09-2026 ook niet meer
   op issue alleen: er staan drie proeven onder #18 (deze, de meetdienst en de
   schilcontrole), en dan pakt een filter op issue de eerste die toevallig
   bovenaan staat. Op naam is eenduidig, en test-blok5lijst.js bewaakt dat
   namen uniek zijn. */
function proefVan(s, naamDeel) {
  const p = s.PLBlok5.proeven().filter(function (x) { return x.naam.indexOf(naamDeel) !== -1; });
  if (p.length !== 1) {
    console.error('FOUT: ' + p.length + ' blok 5-proeven met "' + naamDeel + '" in de naam (moet 1 zijn)');
    process.exit(1);
  }
  return p[0].proef;
}
function draai(s) {
  const r = proefVan(s, 'weet de app dat hij weg was')();
  return (typeof r === 'string') ? { staat: 'ok', detail: r } : r;
}

/* De rit van 02-09 nagespeeld, in vier bewegingen:
   1. de markering van de achtergrondstap van de begeleide meetrit
   2. de app loopt, PLRit tikt
   3. de app gaat naar de achtergrond en loopt nog `door` ms dóór — allebei de
      lussen draaien, want dat is wat er die avond werkelijk gebeurde
   4. Android bevriest hem `stil` ms, en daarna komt hij terug           */
function speelRit(s, door, stil) {
  s.plMarkeer('achtergrond in', 'nagespeeld');
  tikken(s, 20000);
  s.PLAchtergrond._heen();
  for (let i = 0; i < Math.floor(door / 5000); i++) {
    hartslagen(s, 5000);
    vm.runInContext('_pidLastUpd["0105"] = window.__nu;', s);
    s.PLRit.tik(nu(s));
  }
  bevroren(s, stil);
  s.PLAchtergrond._terug();
  vm.runInContext('_pidLastUpd["0105"] = window.__nu;', s);
  s.PLRit.tik(nu(s));           // de eerste tik na de bevriezing: hier ziet PLRit het gat
}

console.log('\n── DE RIT VAN 02-09: de aanlooptijd is een meetwaarde, geen alarm ──');
{
  const s = bouw();
  speelRit(s, 36000, 84000);
  const bg = s.PLAchtergrond.laatste();
  const gat = s.PLRit.gaten().reduce(function (a, g) { return Math.max(a, g.s); }, 0);
  console.log('        gemeten: app ' + bg.s + ' s weg, ' + bg.door + ' s doorgelopen, ' +
              bg.stil + ' s stil; PLRit ziet een gat van ' + gat + ' s');

  // De opzet zelf moet kloppen, anders toetst de rest niets.
  toets('de app was ~120 s weg', bg.s >= 118 && bg.s <= 122, 'gemeten ' + bg.s);
  toets('de aanlooptijd is ~36 s', bg.door >= 34 && bg.door <= 38, 'gemeten ' + bg.door);
  toets('het gat van PLRit en de gemeten stilte liggen dicht bij elkaar',
    Math.abs(gat - bg.stil) <= 6, 'gat ' + gat + ' s, stilte ' + bg.stil + ' s');
  // EN DIT IS WAAR HET OM GAAT. De oude proef vergeleek 120 met 84 en zette er
  // LET OP op. Wie die vergelijking terugzet, maakt deze regel rood.
  const r = draai(s);
  toets('de proef staat niet meer op LET OP om de aanlooptijd',
    !/verschillen meer dan een kwart|lopen meer dan een kwart uiteen/.test(r.detail || ''), r.detail);
  toets('en hij is groen', r.staat === 'ok', r.staat + ': ' + r.detail);
  toets('de aanlooptijd staat in het verslag', /aanlooptijd tot de bevriezing/.test(r.detail || ''), r.detail);
  // Het verwachte getal komt uit de meting zelf. Een vast '36' zou hier op een
  // seconde speling in de opzet rood worden, en dan toetst deze regel de
  // hulpfunctie hierboven in plaats van het verslag.
  toets('met het gemeten getal erbij',
    new RegExp('aanlooptijd tot de bevriezing: ' + bg.door + ' s').test(r.detail || ''), r.detail);
}

console.log('\n── een gat dat PLAchtergrond niet kent, blijft FOUT ──');
{
  // De alarmhelft moet blijven werken: dit is de stille vorm waarvoor de module
  // gebouwd is — de lus lag stil en de app wist het niet.
  const s = bouw();
  s.plMarkeer('achtergrond in', 'nagespeeld');
  tikken(s, 20000);
  bevroren(s, 84000);            // wel een gat, geen visibilitychange
  vm.runInContext('_pidLastUpd["0105"] = window.__nu;', s);
  s.PLRit.tik(nu(s));
  const r = draai(s);
  toets('FOUT als PLRit een gat ziet dat PLAchtergrond niet kent', r.staat === 'FOUT', r.staat + ': ' + r.detail);
  toets('en de melding wijst naar de luisteraar', /visibilitychange/.test(r.detail || ''), r.detail);
}

console.log('\n── twee getallen die hetzelfde meten en tóch uiteenlopen: LET OP ──');
{
  /* Hier hoort het alarm wél te staan. De app was 120 s weg en de hartslag zag
     maar 4 s stilte, terwijl PLRit een gat van ruim een minuut afleidt. Dan
     telt een van beide iets anders mee, en dát is een bevinding.

     Zonder deze helft zou "nooit meer LET OP" ook groen geven, en dan is de
     vergelijking weggehaald in plaats van gerepareerd. */
  const s = bouw();
  s.plMarkeer('achtergrond in', 'nagespeeld');
  tikken(s, 20000);
  s.PLAchtergrond._heen();
  // De hartslag loopt 80 s gewoon door en valt dan 45 s stil. PLRit tikt in
  // die hele periode niet — zijn lus lag er dus veel langer uit dan de
  // hartslag meet, en dat is een echte tegenspraak.
  hartslagen(s, 80000);
  bevroren(s, 45000);
  s.PLAchtergrond._terug();
  vm.runInContext('_pidLastUpd["0105"] = window.__nu;', s);
  s.PLRit.tik(nu(s));
  const bg = s.PLAchtergrond.laatste();
  const gat = s.PLRit.gaten().reduce(function (a, g) { return Math.max(a, g.s); }, 0);
  console.log('        gemeten: ' + bg.s + ' s weg, ' + bg.stil + ' s stil; PLRit ziet ' + gat + ' s gat');
  const r = draai(s);
  toets('de opzet klopt: het gat is veel groter dan de gemeten stilte',
    gat > 100 && bg.stil >= 30 && bg.stil < 60, 'gat ' + gat + ', stil ' + bg.stil);
  toets('en het is geen afknijpgeval', bg.na === 0, 'na = ' + bg.na);
  toets('LET OP op twee bronnen die hetzelfde horen te meten', r.staat === 'LET OP', r.staat + ': ' + r.detail);
  toets('en de melding noemt beide getallen',
    /gat van PLRit/.test(r.detail || '') && /gemeten stilte/.test(r.detail || ''), r.detail);
}

console.log('\n── afgeknepen in plaats van bevroren wordt apart gemeld ──');
{
  /* Chromium knijpt een verborgen tab eerst af naar één tik per minuut vóórdat
     Android het proces stilzet. Dat vraagt om een andere oplossing dan een
     foreground service, dus het hoort niet als bevriezing in het verslag. */
  const s = bouw();
  s.plMarkeer('achtergrond in', 'nagespeeld');
  tikken(s, 20000);
  s.PLAchtergrond._heen();
  hartslagen(s, 10000);
  bevroren(s, 65000);
  hartslagen(s, 45000);          // de lus komt uit zichzelf terug
  s.PLAchtergrond._terug();
  vm.runInContext('_pidLastUpd["0105"] = window.__nu;', s);
  s.PLRit.tik(nu(s));
  const bg = s.PLAchtergrond.laatste();
  toets('de periode weet dat hij daarna zelf weer liep', bg.na >= 40, 'na = ' + bg.na);
  const r = draai(s);
  toets('de proef meldt afgeknepen en niet bevroren', /AFKNIJPT/.test(r.detail || ''), r.detail);
}

console.log('\n── zonder markering zegt de proef niets ──');
{
  // Blijft staan: de achtergrondstap van de meetrit is de enige plek waar dit
  // moment vandaan komt, en een proef zonder dat moment hoort dat te zeggen in
  // plaats van iets te concluderen.
  //
  // NIET MEER OP HET STAPNUMMER (10-09-2026, #170). Hier stond /stap 7/, en
  // daarmee legde de toets het nummer vast in plaats van de verwijzing. Toen de
  // achtergrondstap bij #166 van 7 naar 6 schoof, hield deze regel de foute
  // tekst overeind: de proef bleef naar stap 7 wijzen en de toets vond dat
  // goed. Een verwijzing hoort naar de STAP te wijzen, niet naar zijn plek in
  // een lijst die verandert.
  const s = bouw();
  const r = draai(s);
  toets('LET OP zonder achtergrondmarkering', r.staat === 'LET OP', r.staat + ': ' + r.detail);
  toets('en hij verwijst naar de achtergrondstap', /achtergrondstap/.test(r.detail || ''), r.detail);
  toets('en niet naar een hard stapnummer, dat met de lijst meeschuift (#170)',
    !/stap\s*\d/.test(r.detail || ''), r.detail);
}

console.log('\n' + n + ' toetsen, ' + (fout ? fout + ' FOUT' : 'alles goed'));
process.exit(fout ? 1 : 0);
