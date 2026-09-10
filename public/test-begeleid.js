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
    ['meten', 'afronden', 'afronden vóór het meten levert een verslag zonder metingen'],
    // De twee stappen die een RIJDENDE auto nodig hebben en vóór het meten
    // moeten gebeuren, want blok 5 leest hun uitkomst uit.
    ['rijden', 'achtergrond', 'een gat in de meetlus (#18) is alleen een gat als de lus liep — dus na de rijstap'],
    ['achtergrond', 'meten', 'blok 5 leest de achtergrondmarkering uit; staat die er nog niet, dan zegt #18 niets'],
    ['rijden', 'adapterlos', 'een gat is alleen een gat als de meetlus liep — dus na de rijstap'],
    ['adapterlos', 'meten', 'blok 5 leest het gat uit; staat het er nog niet, dan komt #133 op "ok" zonder onder spanning te staan'],
    // Deze drie gelden binnen de toestelronde, om dezelfde reden: blok 5 leest
    // hun uitkomst uit, dus wat erna gebeurt komt niet meer in dít verslag.
    ['meetcontext', 'meten', 'blok 5 leest de meetcontext uit; is die nog niet beantwoord, dan zegt #64 niets'],
    ['slimweergave', 'meten', 'het oordeel over de weergave hoort in het verslag van déze ronde'],
    ['zones', 'meten', 'jouw oordeel over de onderrand hoort naast de meting van blok 5 te staan, niet erna']
  ];
  // De volgorde-eisen gelden alleen voor stappen die in DEZE lijst zitten.
  // Sinds #166 zijn er twee rondes, en een eis over 'adapterlos' zegt niets
  // over een toestelronde waar die stap niet in voorkomt. Dát een ritronde de
  // stappen bevat die hij moet bevatten, is een eigen controle hieronder —
  // anders zou deze functie stilzwijgend een halve rit goedkeuren.
  eis.forEach(function (e) {
    const a = idx[e[0]], b = idx[e[1]];
    if (a === undefined || b === undefined) return;
    if (a >= b) uit.push('"' + e[0] + '" staat niet vóór "' + e[1] + '" — ' + e[2]);
  });
  if (stappen.length && stappen[stappen.length - 1].id !== 'afronden')
    uit.push('de laatste stap is niet "afronden" — dan wordt het verslag nooit weggeschreven');
  return uit;
}

// ── #166 — DE RIT IS DE SCHAARSE GRONDSTOF ───────────────────────
// De ritronde mag alleen stappen bevatten die een rijdende auto nodig hebben,
// plus de voorbereiding die daar aan vast zit. Elf van de vijftien stappen
// hadden dat niet nodig en stonden er toch in; dat is wat #166 weghaalt, en
// zonder deze toets groeit het net zo hard weer terug.
function keurRondes(stappen, lijstVan) {
  const uit = [];
  const geldig = { rit: 1, toestel: 1, beide: 1 };
  stappen.forEach(function (s) {
    if (!geldig[s.ronde]) uit.push('stap "' + s.id + '" heeft ronde "' + s.ronde + '" — kies rit, toestel of beide');
    if (s.nodig !== 'rijden' && s.nodig !== 'stilstaand')
      uit.push('stap "' + s.id + '" zegt niet wat hij nodig heeft (nodig: rijden of stilstaand)');
    if (!Array.isArray(s.issues)) uit.push('stap "' + s.id + '" draagt geen issues-lijst — dan verjaart zijn reden ongemerkt');
  });

  // DE KERN. Een stap die een rijdende auto nodig heeft, hoort niet in een
  // ronde die je stilstaand draait.
  const toestel = lijstVan('toestel');
  toestel.forEach(function (s) {
    if (s.nodig === 'rijden')
      uit.push('stap "' + s.id + '" heeft een rijdende auto nodig maar staat in de toestelronde');
  });

  // EN ANDERSOM, en dit is waar de ritminuten weglekten: staat er iets in de
  // rit dat niets rijdends nodig heeft, dan moet dat te verantwoorden zijn —
  // als voorwaarde voor de rit, of met een open issue dat er baat bij heeft.
  const rit = lijstVan('rit');
  rit.forEach(function (s) {
    if (s.nodig === 'rijden') return;
    if (s.voorwaarde) return;
    if (s.issues && s.issues.length) return;
    uit.push('stap "' + s.id + '" kost ritminuten zonder een rijdende auto nodig te hebben, ' +
             'en is geen voorwaarde en dient geen issue — dat is precies wat #166 weghaalde');
  });

  if (!rit.length) uit.push('de ritronde is leeg');
  if (!toestel.length) uit.push('de toestelronde is leeg');
  [['rit', rit], ['toestel', toestel]].forEach(function (r) {
    if (r[1].length && r[1][r[1].length - 1].id !== 'afronden')
      uit.push('de ' + r[0] + '-ronde eindigt niet op "afronden" — dan wordt het verslag nooit weggeschreven');
  });
  return uit;
}

// Een stap die een ander VENSTER opent, moet dat zeggen. Het testrunscherm
// staat op z-index 9980 en de vensters die de run opent staan eronder (de
// meetcontextvragen op 9920, het logboek op 9975) — zonder `opent: 'venster'`
// gaat het scherm niet opzij en opent dat venster erachter. Precies zo mislukte
// de meetcontextproef van #64 op de rit van 10-09.
function keurVensterstappenGemarkeerd(stappen, bron) {
  const uit = [];
  const openers = [
    ['plVoorAnalyse', 'de meetcontextvragen (z-index 9920)'],
    ['openLogboek', 'het logboek (z-index 9975)']
  ];
  stappen.forEach(function (s) {
    if (!s.actie || typeof s.actie.fn !== 'function') return;
    const code = String(s.actie.fn);
    openers.forEach(function (o) {
      if (code.indexOf(o[0]) === -1) return;
      if (s.opent !== 'venster')
        uit.push('stap "' + s.id + '" opent ' + o[1] + ' maar draagt geen opent:\'venster\' — ' +
                 'dan blijft het testrunscherm erboven staan en zie je het niet');
    });
  });
  // En de andere kant: het scherm moet ook echt opzij gaan. Dat is niet uit de
  // stap te zien maar uit de runner, en van buiten de IIFE is die niet aan te
  // roepen — dus hier op de bron, met die reden erbij (§20 staat dat toe).
  if (bron) {
    if (!/opent === 'venster'[\s\S]{0,200}_bgWijk\(true\)/.test(bron))
      uit.push('begeleidActie() zet het scherm niet opzij bij een vensterstap — de fix van #166 is weg');
    if (!/_bgWijk\(false\)/.test(bron))
      uit.push('het scherm wordt nergens teruggezet in de ladder');
  }
  return uit;
}

// ── De oogstpoort (#166) ─────────────────────────────────────────
// De rijstap sluit niet meer op de klok maar op wat er geoogst is. De poort
// moet dus dicht zijn zolang er iets ontbreekt, en open zodra alles binnen is
// — en een punt dat op deze auto niet te halen valt, mag niet blokkeren.
function keurOogstpoort(s) {
  const uit = [];
  // De oogstpoort leest window.PLRit.per() en window.activePIDs. Allebei zijn
  // het INVOER voor de regel die hier getoetst wordt, geen kopie ervan: hoe die
  // ritstand ontstaat is de vraag van test-rit.js en wordt daar gemeten.
  const bewaard = s.PLRit;
  const zet = function (per, sel) {
    s.PLRit = { per: function () { return per; } };
    s.activePIDs = sel === null ? null : new Set(sel);
  };
  const RP = s.PLBegeleid.ritPids();
  const vol = {};
  RP.forEach(function (p) { vol[p] = { n: 5, min: 0, max: 0 }; });
  vol['010D'] = { n: 5, min: 0, max: 80 };
  vol['010B'] = { n: 5, min: 30, max: 140 };

  zet({}, RP);
  let o = s.PLBegeleid.oogst();
  if (o.klaar) uit.push('de poort staat open op een lege rit');

  zet(vol, RP);
  o = s.PLBegeleid.oogst();
  if (!o.klaar) uit.push('de poort blijft dicht op een volle oogst: ' +
    o.punten.filter(function (p) { return p.klaar === false; }).map(function (p) { return p.tekst; }).join('; '));

  // Gereden, maar nooit onder belasting: dat is wat de oude optrekstap vroeg,
  // en het is nu een punt van de poort.
  const plat = JSON.parse(JSON.stringify(vol));
  plat['010B'] = { n: 5, min: 99, max: 101 };
  zet(plat, RP);
  o = s.PLBegeleid.oogst();
  if (o.klaar) uit.push('de poort gaat open zonder dat er onder belasting gemeten is — dan is de optrekstap voor niets weggehaald');

  // Snelheid uit het geheugen (n < 2) telt niet als gereden.
  const stil = JSON.parse(JSON.stringify(vol));
  stil['010D'] = { n: 1, min: 0, max: 80 };
  zet(stil, RP);
  if (s.PLBegeleid.oogst().klaar) uit.push('één enkele snelheidswaarneming telt als "gereden"');

  // En het geval dat NIET mag blokkeren: de MAP staat niet in de selectie.
  const zonderMap = JSON.parse(JSON.stringify(vol));
  delete zonderMap['010B'];
  zet(zonderMap, RP.filter(function (p) { return p !== '010B'; }));
  o = s.PLBegeleid.oogst();
  if (!o.klaar) uit.push('de poort blokkeert op een MAP die niet in de selectie staat — dan is hij een muur op zo\'n auto');

  s.PLRit = bewaard;
  s.activePIDs = new Set();
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

// ── De meet-PIDs zijn een afspraak met de issues ──────────────────
// Een rit die de PID niet aanzet, beantwoordt de vraag niet — dat is letterlijk
// waarom #19 drie ritten lang openbleef. Die afspraak staat in RIT_PIDS, en een
// array zonder toets is een array die de volgende opruimactie niet overleeft.
{
  const RP = (S.PLBegeleid.ritPids ? S.PLBegeleid.ritPids() : []);
  const eis = [
    ['0123', '#19 — raildruk direct'],
    ['0159', '#19 — raildruk absoluut'],
    ['0155', '#40 — bytelengte, tabel zegt 2'],
    ['0156', '#40 — bytelengte, tabel zegt 2'],
    ['010D', 'zonder snelheid is er geen rit vast te stellen']
  ];
  toetsSchoon('de meet-PIDs dekken de issues die een rit nodig hebben',
    eis.filter(function (e) { return RP.indexOf(e[0]) < 0; })
       .map(function (e) { return e[0] + ' ontbreekt in RIT_PIDS (' + e[1] + ')'; }));
}
toetsSchoon('elke stap vertelt wat, waarom en wat jij doet', keurStappenCompleet(STAPPEN));
toetsSchoon('de volgorde draagt de meting (ritronde)', keurVolgorde(S.PLBegeleid.lijst('rit')));
toetsSchoon('de volgorde draagt de meting (toestelronde)', keurVolgorde(S.PLBegeleid.lijst('toestel')));
toetsSchoon('de ritronde kost geen minuten aan stilstaand werk (#166)', keurRondes(STAPPEN, S.PLBegeleid.lijst));
toetsSchoon('de ritronde bevat de stappen die een rit dragen',
  (function () {
    const heeft = {};
    S.PLBegeleid.lijst('rit').forEach(function (s) { heeft[s.id] = true; });
    return ['verbinding', 'pids', 'nulmeting', 'rijden', 'meten', 'afronden']
      .filter(function (id) { return !heeft[id]; })
      .map(function (id) { return 'de ritronde mist "' + id + '"'; });
  })());
toetsSchoon('een stap die een venster opent, zegt dat ook (#166)',
  keurVensterstappenGemarkeerd(STAPPEN, fs.readFileSync('pidlane-testrun.js', 'utf8')));
toetsSchoon('de rijstap sluit op de oogst en niet op de klok (#166)', keurOogstpoort(S));
toetsSchoon('de optrekstap is weg en komt niet terug (#166)',
  STAPPEN.some(function (s) { return s.id === 'optrekken'; })
    ? ['de optrekstap staat er weer in — blok 14 leidt de turbovraag af uit de min/max van PLRit en heeft geen markering nodig']
    : []);
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

// De twee stappen van 09-09 hebben hun eigen volgorde-eisen gekregen, en die
// zijn data in dezelfde functie. Twee tegenproeven, want het gaat om twee
// verschillende redenen: het gat moet ná het rijden ontstaan (anders is er
// geen lus om een gat in te maken) en vóór het meten (anders leest blok 5 het
// niet, en komt #133 op "ok" zonder onder spanning te staan).
toetsSchoon('een zelfgemaakt gat vóór de rijstap wordt gezien',
  (function () {
    const fout = [
      { id: 'verbinding' }, { id: 'pids' }, { id: 'nulmeting' }, { id: 'adapterlos' },
      { id: 'rijden' }, { id: 'slimweergave' }, { id: 'meetcontext' }, { id: 'meten' }, { id: 'afronden' }
    ];
    const r = keurVolgorde(fout);
    return r.some(function (x) { return x.indexOf('adapterlos') > -1; }) ? []
      : ['keurVolgorde accepteerde het adaptergat vóór de rijstap: ' + (r.join(' | ') || '(niets)')];
  })());

toetsSchoon('de meetcontext ná het meten wordt gezien',
  (function () {
    const fout = [
      { id: 'verbinding' }, { id: 'pids' }, { id: 'nulmeting' }, { id: 'rijden' },
      { id: 'slimweergave' }, { id: 'adapterlos' }, { id: 'meten' }, { id: 'meetcontext' }, { id: 'afronden' }
    ];
    const r = keurVolgorde(fout);
    return r.some(function (x) { return x.indexOf('meetcontext') > -1; }) ? []
      : ['keurVolgorde accepteerde de meetcontext ná het meten: ' + (r.join(' | ') || '(niets)')];
  })());

toetsSchoon('een verslag zonder open stappen wordt gezien',
  keurVerslagNoemtOpenStappen({
    begeleidStart: function () { }, begeleidVolgende: function () { }, begeleidAfronden: function () { },
    PLBegeleid: { _verslag: function () { return ['niets bijzonders']; } }
  }).length ? [] : ['keurVerslagNoemtOpenStappen bleef stil bij een verslag zonder open stappen']);

// ── tegenproeven bij #166 ────────────────────────────────────────
toetsSchoon('een rijdende stap in de toestelronde wordt gezien',
  (function () {
    const nep = [{ id: 'x', ronde: 'toestel', nodig: 'rijden', issues: [] },
                 { id: 'afronden', ronde: 'beide', nodig: 'stilstaand', issues: [], voorwaarde: true }];
    const r = keurRondes(nep, function (soort) { return nep.filter(function (s) { return s.ronde === soort || s.ronde === 'beide'; }); });
    return r.some(function (x) { return x.indexOf('rijdende auto nodig') > -1; }) ? []
      : ['keurRondes liet een rijdende stap in de toestelronde staan: ' + (r.join(' | ') || '(niets)')];
  })());

toetsSchoon('een stilstaande stap die ritminuten kost zonder reden, wordt gezien',
  (function () {
    const nep = [{ id: 'x', ronde: 'rit', nodig: 'stilstaand', issues: [] },
                 { id: 'afronden', ronde: 'beide', nodig: 'stilstaand', issues: [], voorwaarde: true }];
    const r = keurRondes(nep, function (soort) { return nep.filter(function (s) { return s.ronde === soort || s.ronde === 'beide'; }); });
    return r.some(function (x) { return x.indexOf('kost ritminuten') > -1; }) ? []
      : ['keurRondes accepteerde een stilstaande stap in de rit zonder voorwaarde of issue: ' + (r.join(' | ') || '(niets)')];
  })());

toetsSchoon('een vensterstap zonder opent-vlag wordt gezien',
  (function () {
    const nep = [{ id: 'x', actie: { label: 'q', fn: function () { plVoorAnalyse(false); } } }];
    const r = keurVensterstappenGemarkeerd(nep, null);
    return r.some(function (x) { return x.indexOf('opent') > -1; }) ? []
      : ['een stap die de meetcontextvragen opent zonder opent-vlag kwam er ongezien doorheen'];
  })());

toetsSchoon('een runner die het scherm niet opzij zet, wordt gezien',
  keurVensterstappenGemarkeerd([], 'function begeleidActie(){ /* geen wijk */ }').length
    ? [] : ['de broncontrole bleef stil bij een runner zonder _bgWijk']);

toetsSchoon('een klappende controle wordt gezien',
  keurControlesOverlevenEenLegeApp([{ id: 'stuk', controle: function () { throw new Error('boem'); } }]).length
    ? [] : ['een controle die klapt kwam er ongezien doorheen']);

toetsSchoon('een uitkomstregel die overslaan als gedaan boekt, wordt gezien',
  keurUitkomst(function () { return 'gedaan'; }).length
    ? [] : ['keurUitkomst accepteerde een regel die alles "gedaan" noemt']);

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
