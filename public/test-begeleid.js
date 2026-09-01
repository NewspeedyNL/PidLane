// ══════════════════════════════════════════════════════════════════
// test-begeleid.js — de begeleide run slaat niets stilzwijgend over
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// De begeleide run bestaat omdat een meetrit voorwaarden heeft die je vóóraf
// moet regelen en die tot 5.9 pas achteraf werden gemeld: "staat hij in de
// actieve selectie?", "niet uitgevoerd deze run". De rit van 01-09 verloor
// daardoor drie vragen tegelijk — er werd vijf minuten gereden waar er tien
// nodig waren, er is niet genulsteld, en 0123/0159 stonden niet in de
// pollronde terwijl de hoofdvraag over die twee ging.
//
// De reparatie is een stappenmachine. Die machine mag dus zelf nooit een stap
// kwijtraken, en een overgeslagen stap moet als overgeslagen in het verslag
// komen — niet als niets. Dat is precies wat hier getoetst wordt, en het is
// zonder auto en zonder browser te toetsen: de stappen zijn data en de
// overgangsregel is een functie.
//
// Wat hier NIET te toetsen valt: of de knoppen op een telefoon te raken zijn
// en of de teksten kloppen met wat de app doet. Dat is blok 5 en een rit.
//
// Draaien vanuit public/:  node test-begeleid.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

// Dezelfde soort sandbox als test-rit.js: precies wat de begeleide run aanraakt.
// De controles draaien hier tegen een LEGE app — geen verbinding, geen PIDs.
// Dat is met opzet: een controle hoort dan netjes {ok:false} te melden en niet
// te klappen, want in de auto is "nog niet klaar" de normale beginstand.
function laad() {
  const s = {};
  s.window = s;
  s.connected = false;
  s.demoMode = false;
  s.pidVals = {};
  s._pidLastUpd = {};
  s.activePIDs = new Set();
  s.console = { warn: function () { }, error: function () { }, log: function () { } };
  s.localStorage = { getItem: function () { return null; }, setItem: function () { }, key: function () { return null; }, length: 0 };
  s.document = {
    getElementById: function () { return null; },
    createElement: function () { return { style: {}, classList: { add: function () { }, remove: function () { } } }; },
    querySelectorAll: function () { return []; },
    body: { appendChild: function () { } }
  };
  s.navigator = { userAgent: 'node' };
  s.setInterval = function () { return 0; };
  s.clearInterval = function () { };
  s.setTimeout = function () { return 0; };
  s.PLBus = { stats: function () { return { belasting: 70, perSec: 5, venGemMs: 120, foutPct: 0 }; } };
  s.PLLoad = { staat: function () { return { mult: 1, tempoPct: 100 }; }, cfg: {} };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-testrun.js', 'utf8'), s, { filename: 'pidlane-testrun.js' });
  if (!s.PLBegeleid) throw new Error('PLBegeleid niet gevonden in pidlane-testrun.js');
  return s;
}

// ── de controles ─────────────────────────────────────────────────

// Elke stap moet de gebruiker vier dingen vertellen: wat het is, waarom het
// moet, wat híj doet, en wat er in het log komt. Ontbreekt er één, dan staat
// er straks een knop zonder uitleg — en dan wordt hij overgeslagen.
function keurStappenCompleet(stappen) {
  const uit = [];
  const velden = ['id', 'titel', 'waarom', 'wat', 'knop', 'markering'];
  const gezien = {};
  stappen.forEach(function (s, i) {
    velden.forEach(function (v) {
      if (!s[v] || typeof s[v] !== 'string' || !s[v].trim())
        uit.push('stap ' + (i + 1) + ' (' + (s.id || '?') + ') mist "' + v + '"');
    });
    if (gezien[s.id]) uit.push('twee stappen delen de id "' + s.id + '" — dan is het verslag niet te lezen');
    gezien[s.id] = true;
    if (s.controle && typeof s.controle !== 'function') uit.push('stap ' + s.id + ': controle is geen functie');
    if (s.actie && typeof s.actie.fn !== 'function') uit.push('stap ' + s.id + ': actie zonder fn');
    if (s.actie && !s.actie.label) uit.push('stap ' + s.id + ': actieknop zonder opschrift');
  });
  return uit;
}

// De volgorde draagt de meting. Nulstellen ná het rijden meet de verkeerde
// periode; meten vóór het rijden meet stilstand; PIDs kiezen ná de rit is te
// laat. Dat zijn precies de drie fouten van 01-09.
function keurVolgorde(stappen) {
  const uit = [];
  const idx = {};
  stappen.forEach(function (s, i) { idx[s.id] = i; });
  const eis = [
    ['verbinding', 'pids', 'de PID-selectie heeft een verbinding nodig'],
    ['pids', 'nulmeting', 'de selectie moet staan vóór de nulmeting, anders meet je een halve rit'],
    ['nulmeting', 'rijden', 'zonder nulstellen gaat het ritbeeld over alles sinds het opstarten (fout van 01-09)'],
    ['rijden', 'meten', 'de sweep belast de bus zelf en hoort niet in het ritbeeld'],
    ['meten', 'afronden', 'afronden vóór het meten levert een verslag zonder metingen']
  ];
  eis.forEach(function (e) {
    if (idx[e[0]] === undefined) { uit.push('stap "' + e[0] + '" ontbreekt'); return; }
    if (idx[e[1]] === undefined) { uit.push('stap "' + e[1] + '" ontbreekt'); return; }
    if (idx[e[0]] >= idx[e[1]]) uit.push('"' + e[0] + '" staat niet vóór "' + e[1] + '" — ' + e[2]);
  });
  if (stappen.length && stappen[stappen.length - 1].id !== 'afronden')
    uit.push('de laatste stap is niet "afronden" — dan wordt het verslag nooit weggeschreven');
  return uit;
}

// Een controle die klapt neemt het hele stappenpaneel mee. In de auto is de
// beginstand "nog niets klaar", dus juist dán moet hij het overleven.
function keurControlesOverlevenEenLegeApp(stappen) {
  const uit = [];
  stappen.forEach(function (s) {
    if (!s.controle) return;
    let r;
    try { r = s.controle(); }
    catch (e) { uit.push('controle van "' + s.id + '" klapt op een lege app: ' + ((e && e.message) || e)); return; }
    if (!r || typeof r.ok !== 'boolean') uit.push('controle van "' + s.id + '" geeft geen {ok,tekst} terug');
    else if (!r.tekst) uit.push('controle van "' + s.id + '" geeft geen uitleg mee — dan zegt een kruisje niets');
  });
  return uit;
}

// De kern: wanneer heet een stap gedaan, en wanneer overgeslagen. Het verschil
// tussen "overgeslagen" en "gedaan-met-bezwaar" is dat de eerste een keuze van
// de gebruiker is en de tweede een waarschuwing die hij naast zich neerlegde.
// Allebei komen ze in het verslag; geen van beide verdwijnt.
function keurUitkomst(u) {
  const uit = [];
  const geval = [
    [{ ok: true }, false, 'gedaan'],
    [{ ok: true }, true, 'gedaan'],
    [{ ok: false }, false, 'gedaan-met-bezwaar'],
    [{ ok: false }, true, 'overgeslagen'],
    [null, false, 'gedaan'],
    [null, true, 'overgeslagen']
  ];
  geval.forEach(function (g) {
    const r = u(g[0], g[1]);
    if (r !== g[2])
      uit.push('controle=' + JSON.stringify(g[0]) + ' gedwongen=' + g[1] + ' gaf "' + r + '", verwacht "' + g[2] + '"');
  });
  return uit;
}

// Wat er NIET gehaald is, moet in het verslag staan. Dit is de hele reden dat
// de begeleide run bestaat: een lege plek in de meting moet zichtbaar zijn.
function keurVerslagNoemtOpenStappen(s) {
  const uit = [];
  s.begeleidStart();
  s.begeleidVolgende();            // stap 1 af
  s.begeleidAfronden('test');      // en dan vroegtijdig stoppen
  const r = s.PLBegeleid._verslag().join('\n');
  if (!/NIET MEER AAN TOEGEKOMEN/.test(r))
    uit.push('het verslag noemt de niet-gehaalde stappen niet — dan lijkt een halve run een hele');
  if (!/Rijden/i.test(r)) uit.push('de rijstap staat niet bij de niet-gehaalde stappen');
  if (!/MARKERINGEN/.test(r)) uit.push('het verslag heeft geen markeringenblok');
  if (!/BEGELEIDE RUN AFGEROND/.test(r)) uit.push('de afrondmarkering ontbreekt in het verslag');
  return uit;
}

// Een markering zonder tijdstip of zonder opmerking is achteraf waardeloos.
function keurMarkeringHeeftTijdEnOpmerking(s) {
  const uit = [];
  const m = s.plMarkeer('proef', 'met een opmerking erbij');
  if (!m || !m.t || !/^\d\d:\d\d:\d\d$/.test(m.t)) uit.push('markering zonder kloktijd: ' + JSON.stringify(m && m.t));
  if (!m || m.tekst !== 'proef') uit.push('de tekst van de markering is niet bewaard');
  if (!m || m.opm !== 'met een opmerking erbij') uit.push('de opmerking bij de markering is niet bewaard');
  if (s.PLBegeleid.markeringen().indexOf(m) === -1 &&
      !s.PLBegeleid.markeringen().some(function (x) { return x.ms === m.ms && x.tekst === m.tekst; }))
    uit.push('de markering staat niet in de lijst');
  return uit;
}

// Pauzeren mag de stappen niet verschuiven: je staat stil, je gaat niet terug.
function keurPauzeVerplaatstNiets(s) {
  const uit = [];
  s.begeleidStart();
  s.begeleidVolgende();
  const voor = s.PLBegeleid.stand();
  s.begeleidPauze();
  const tijdens = s.PLBegeleid.stand();
  s.begeleidPauze();
  const na = s.PLBegeleid.stand();
  if (!tijdens.gepauzeerd) uit.push('pauze zette de run niet stil');
  if (na.gepauzeerd) uit.push('de tweede druk hervatte de run niet');
  if (tijdens.i !== voor.i || na.i !== voor.i) uit.push('pauzeren verschoof de stap: ' + voor.i + ' → ' + tijdens.i + ' → ' + na.i);
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
console.log('Begeleide run — slaat niets stilzwijgend over\n');

const S = laad();
const STAPPEN = S.PLBegeleid.stappen();

toetsSchoon('er zijn stappen', STAPPEN.length >= 5 ? [] : [STAPPEN.length + ' stappen — te weinig voor een meetrit']);
toetsSchoon('elke stap vertelt wat, waarom en wat jij doet', keurStappenCompleet(STAPPEN));
toetsSchoon('de volgorde draagt de meting', keurVolgorde(STAPPEN));
toetsSchoon('geen enkele controle klapt op een lege app', keurControlesOverlevenEenLegeApp(STAPPEN));
toetsSchoon('gedaan, met bezwaar of overgeslagen — alle vier de gevallen', keurUitkomst(S.PLBegeleid._uitkomst));
toetsSchoon('een markering draagt tijd én opmerking', keurMarkeringHeeftTijdEnOpmerking(S));
toetsSchoon('pauzeren verschuift geen stap', keurPauzeVerplaatstNiets(S));
toetsSchoon('het verslag noemt wat er niet gehaald is', keurVerslagNoemtOpenStappen(S));

// ── tegenproef ───────────────────────────────────────────────────
// Elke controle hierboven moet rood kunnen worden, anders toetst hij niets.

toetsSchoon('een stap zonder uitleg wordt gezien',
  keurStappenCompleet([{ id: 'x', titel: 'Iets', wat: 'doe iets', knop: 'ok', markering: 'm' }]).length
    ? [] : ['keurStappenCompleet liet een stap zonder "waarom" door']);

toetsSchoon('twee stappen met dezelfde id worden gezien',
  keurStappenCompleet([
    { id: 'x', titel: 'a', waarom: 'a', wat: 'a', knop: 'a', markering: 'a' },
    { id: 'x', titel: 'b', waarom: 'b', wat: 'b', knop: 'b', markering: 'b' }
  ]).some(function (r) { return /dezelfde id|delen de id/.test(r); })
    ? [] : ['een dubbele id kwam er ongezien doorheen']);

toetsSchoon('nulstellen ná het rijden wordt gezien',
  (function () {
    const omgedraaid = [
      { id: 'verbinding' }, { id: 'pids' }, { id: 'rijden' }, { id: 'nulmeting' },
      { id: 'meten' }, { id: 'afronden' }
    ];
    const r = keurVolgorde(omgedraaid);
    return r.some(function (x) { return x.indexOf('nulmeting') > -1; }) ? []
      : ['keurVolgorde accepteerde nulstellen ná het rijden: ' + (r.join(' | ') || '(niets)')];
  })());

toetsSchoon('een verslag zonder open stappen wordt gezien',
  keurVerslagNoemtOpenStappen({
    begeleidStart: function () { }, begeleidVolgende: function () { }, begeleidAfronden: function () { },
    PLBegeleid: { _verslag: function () { return ['niets bijzonders']; } }
  }).length ? [] : ['keurVerslagNoemtOpenStappen bleef stil bij een verslag zonder open stappen']);

toetsSchoon('een klappende controle wordt gezien',
  keurControlesOverlevenEenLegeApp([{ id: 'stuk', controle: function () { throw new Error('boem'); } }]).length
    ? [] : ['een controle die klapt kwam er ongezien doorheen']);

toetsSchoon('een uitkomstregel die overslaan als gedaan boekt, wordt gezien',
  keurUitkomst(function () { return 'gedaan'; }).length
    ? [] : ['keurUitkomst accepteerde een regel die alles "gedaan" noemt']);

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
