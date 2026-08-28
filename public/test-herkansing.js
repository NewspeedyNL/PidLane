// ══════════════════════════════════════════════════════════════════
// test-herkansing.js — de terugweg voor opgeruimde sensoren (besluit #16)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// De opruimregel van 23-08-2026 haalt een sensor die vijf pogingen plus vijf
// herkansingen lang zweeg uit de selectie, en had bewust géén terugweg. De
// onderbouwing daarvan ging over de kósten van terugkomen: opnieuw de hele
// kwalificatiefase in, vijf minuten bandbreedte, per motorstart.
//
// Het besluit bij #16 splitst dat: één losse peiling is geen kwalificatiefase
// maar één commando. Het geval dat het oplost is een sensor die pas antwoordt
// als hij warm is — die wordt koud opgeruimd en kwam zonder terugweg nooit
// meer in beeld.
//
// Deze test bewaakt de drie plekken waar dat mis kan gaan:
//   1. de trap loopt op en vlakt af, zodat een dode sensor stil wordt;
//   2. een antwoord is pas een levensteken als het oordeel 'ok' is —
//      'onzin' is ONZE parse-fout en 'nodata' is een module die een
//      dummywaarde teruggeeft; allebei geen levende sensor;
//   3. terugzetten moet ECHT gebeuren, niet alleen gemeld worden: de gate
//      heeft twee grendels (_pidOpgeruimd en _pidHealth) en allebei moeten
//      ze open, anders zegt de log "terug in de selectie" terwijl er niets
//      veranderd is.
//
// De grens met test-stilopruim.js: die toetst de weg NAAR buiten (en dat de
// gewone pollronde geen terugweg is), deze de weg terug.
//
// Draaien vanuit public/:  node test-herkansing.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

const MIN = 60000;

// ── Echte code uit de module knippen ────────────────────────────────
// Zelfde knippad als test-herijking.js: alles tussen _engineWarmRunning en
// het einde van het gate-blok. Daar zitten pidGate, pidToevoegen, pidOpruimen
// en de herkansing in één stuk, dus we toetsen ze in hun echte samenhang in
// plaats van los nagebouwd.
const src = fs.readFileSync(__dirname + '/pidlane-pidgate.js', 'utf8');
const a = src.indexOf('function _engineWarmRunning');
const b = src.indexOf('// ── einde gate-blok');
if (a < 0 || b < 0) { console.log('FOUT: knippad niet gevonden in pidlane-pidgate.js'); process.exit(1); }
const GATE = src.slice(a, b);

// ── Een wereld waarin die code kan draaien ──────────────────────────
function maakWereld(opties) {
  const o = opties || {};
  const W = {
    NU: 1785600000000,
    gelogd: [],
    cmds: [],
    pidVals: {},
    _pidHealth: {},
    activePIDs: new Set(['010C']),
    manualPIDs: new Set(),
    supportedPIDs: new Set(),
    discoveredPIDDefs: [],
    vehicleInfo: { brandstof: 'benzine' },
    DIESEL_SCR_PIDS: new Set(),
    EV_AFWEZIGE_PIDS: new Set(),
    GEEN_SENSOR_PIDS: new Set(),
    _B1B2_PAIR: {},
    ALL_PID_DEFS: {
      '010C': { name: 'Toerental', unit: 'rpm', cat: 'Motor', min: 0, max: 8000 },
      '015C': { name: 'Olietemperatuur', unit: '°C', cat: 'Temp', min: -40, max: 210 },
      '0110': { name: 'Massaluchtstroom', unit: 'g/s', cat: 'Motor', min: 0, max: 655 }
    },
    console: { warn: function () {}, log: function () {} },
    renderGauges: function () {}, rebuildGSel: function () {},
    document: { getElementById: function () { return null; } },
    buildDiscoveredPIDList: function () {}
  };
  W.Date = { now: function () { return W.NU; } };
  W.vehicleFuelType = function () { return W.vehicleInfo.brandstof; };
  W.log = function (m) { W.gelogd.push(String(m)); };
  W.btDiag = function (m) { W.gelogd.push(String(m)); };
  W.pidCmd = function (pid, snel) { return snel ? pid + '1' : pid; };
  W.parsePID = function (pid, raw) { return (raw === null || raw === undefined) ? null : raw; };
  // De poort. Ook hier de echte vorm: pidHerkansRonde hoort er doorheen te
  // gaan (besluit #15), dus een test die hem zou overslaan meet het verkeerde.
  W.busGebruikt = [];
  W.withBus = function (naam, fn) { W.busGebruikt.push(naam); return Promise.resolve(fn()); };
  // Standaard antwoordt de sensor met een bruikbare waarde.
  //
  // LET OP bij het aanpassen: de gate-code krijgt `sendCmd` als PARAMETER
  // binnen, niet via het wereldobject. `W.sendCmd = ...` achteraf overschrijven
  // doet dus niets — de code houdt de functie vast die hij bij het bouwen
  // kreeg. Vandaar deze omweg: sendCmd staat vast en roept W._send aan, en
  // dát haakje mag een test wél verzetten. (Kostte een test die vrolijk groen
  // stond terwijl hij de vervanging nooit had aangeroepen.)
  W.antwoord = ('antwoord' in o) ? o.antwoord : 42;
  W._send = function () { return Promise.resolve(W.antwoord); };
  W.sendCmd = function (cmd) { W.cmds.push(cmd); return W._send(cmd); };
  W.oordeel = o.oordeel || 'ok';
  W.assessPidQuality = function (pid, val) { return { status: W.oordeel, name: pid, val: val }; };

  const namen = Object.keys(W);
  const fn = new Function(...namen, GATE +
    '\nreturn {pidGate,pidToevoegen,pidOpruimen,pidOpgeruimdLijst,plHerijkTick,' +
    'herkansIntervalMs,herkansDue,pidHerkansRonde};');
  Object.assign(W, fn(...namen.map(n => W[n])));
  return W;
}

// Een test die halverwege blijft hangen eindigt in node met exit 0 en een
// half rapport — precies de stille groene die hier niet mag bestaan. Deze
// wachthond maakt daar een harde fout van. (Nodig gebleken: deel 6 bleef in
// een eerdere versie staan op een peiling die nooit werd losgelaten.)
const WACHTHOND = setTimeout(function () {
  console.log('\n  FAAL  de test is halverwege blijven staan — zie hierboven waar hij stopte');
  process.exit(1);
}, 10000);

let fout = 0, n = 0;
function eis(wat, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + wat);
  else { fout++; console.log('  FAAL  ' + wat + (uitleg ? ' — ' + uitleg : '')); }
}

// ══════════════════════════════════════════════════════════════════
console.log('\n1. De trap loopt op en vlakt af');
{
  const W = maakWereld();
  const t = W.herkansIntervalMs;
  eis('eerste peiling na 5 minuten', t(0) === 5 * MIN, t(0) + ' ms');
  eis('daarna 10', t(1) === 10 * MIN);
  eis('daarna 20', t(2) === 20 * MIN);
  eis('daarna 40', t(3) === 40 * MIN);
  eis('en blijft 40 — een dode sensor wordt stil, niet eeuwig kloppend',
      t(4) === 40 * MIN && t(99) === 40 * MIN);
  eis('nooit korter dan de eerste trede', t(-3) === 5 * MIN && t(0) === 5 * MIN);
  let stijgt = true;
  for (let i = 1; i < 8; i++) if (t(i) < t(i - 1)) stijgt = false;
  eis('nooit dalend', stijgt);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n2. herkansDue kijkt naar de klok, niet naar de volgorde');
{
  const W = maakWereld();
  W.activePIDs.add('015C');
  eis('niets te doen zolang er niets opgeruimd is', W.herkansDue(W.NU).length === 0);

  W.pidOpruimen('015C', 'vijf pogingen zonder antwoord');
  eis('meteen na het opruimen nog niet aan de beurt', W.herkansDue(W.NU).length === 0);
  eis('een seconde vóór de trede ook niet', W.herkansDue(W.NU + 5 * MIN - 1000).length === 0);
  eis('op de trede wel', JSON.stringify(W.herkansDue(W.NU + 5 * MIN)) === '["015C"]');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n3. Een levensteken zet de sensor echt terug');
{
  const W = maakWereld();
  W.activePIDs.add('015C');
  W.pidOpruimen('015C', 'vijf pogingen zonder antwoord');
  eis('vooraf: uit de selectie', !W.activePIDs.has('015C'));
  eis('vooraf: de gate weigert hem', W.pidGate('015C', 'kiesbaar') === false);

  W.NU += 5 * MIN;
  return_check(W);
}
function return_check(W) {
  W.pidHerkansRonde().then(function (terug) {
    eis('één sensor terug', terug === 1, 'kreeg ' + terug);
    eis('één peiling, niet vijf minuten kwalificatie', W.cmds.length === 1, W.cmds.join(','));
    eis('de snelle vorm gebruikt (één frame verwacht)', W.cmds[0] === '015C1', W.cmds[0]);
    eis('door de bus-poort gegaan', W.busGebruikt.length === 1 &&
        /herkansing-015C/.test(W.busGebruikt[0]), W.busGebruikt.join(','));
    eis('terug in de selectie', W.activePIDs.has('015C'));
    eis('niet als handmatige keuze geboekt', !W.manualPIDs.has('015C'));
    eis('uit de opruimlijst', W.pidOpgeruimdLijst().length === 0);
    eis('de gate laat hem weer door', W.pidGate('015C', 'kiesbaar') === true);
    eis('gemeld in het log', W.gelogd.some(function (m) { return /terug in de selectie/.test(m); }));
    deel4();
  });
}

// ══════════════════════════════════════════════════════════════════
function deel4() {
  console.log('\n4. Een mislukte peiling kost alleen wachttijd');
  const W = maakWereld({ antwoord: null });          // NO DATA → parsePID geeft null
  W.activePIDs.add('015C');
  W.pidOpruimen('015C', 'vijf pogingen zonder antwoord');
  W.NU += 5 * MIN;
  W.pidHerkansRonde().then(function (terug) {
    eis('niemand terug', terug === 0);
    eis('er is wél gepeild', W.cmds.length === 1);
    eis('blijft opgeruimd', W.pidOpgeruimdLijst().length === 1);
    eis('en niet in de selectie', !W.activePIDs.has('015C'));
    eis('meteen daarna niet nog eens aan de beurt', W.herkansDue(W.NU).length === 0);
    eis('na 5 minuten nóg niet — de trap staat nu op 10',
        W.herkansDue(W.NU + 5 * MIN).length === 0);
    eis('na 10 minuten wel', W.herkansDue(W.NU + 10 * MIN).length === 1);
    deel5();
  });
}

// ══════════════════════════════════════════════════════════════════
function deel5() {
  console.log('\n5. Antwoorden is niet hetzelfde als leven');
  // Twee werelden die alleen in het kwaliteitsoordeel verschillen. Dat is
  // meteen de tegenproef bij dit deel: dezelfde peiling, hetzelfde antwoord,
  // en tóch een andere uitkomst — dus meet deze test het oordeel en niet
  // iets anders dat toevallig meeloopt.
  const proeven = [
    ['onzin  (fysiek onmogelijk = onze parse-/schaalfout)', 'onzin', false],
    ['nodata (dummywaarde van een module zonder die sensor)', 'nodata', false],
    ['ok     (een echt levensteken)', 'ok', true]
  ];
  let i = 0;
  (function volgende() {
    if (i >= proeven.length) return deel6();
    const [naam, oordeel, terugVerwacht] = proeven[i++];
    const W = maakWereld({ oordeel });
    W.activePIDs.add('015C');
    W.pidOpruimen('015C', 'vijf pogingen zonder antwoord');
    W.NU += 5 * MIN;
    W.pidHerkansRonde().then(function (terug) {
      eis(naam + ' → ' + (terugVerwacht ? 'terug' : 'blijft weg'),
          (terug === 1) === terugVerwacht && W.activePIDs.has('015C') === terugVerwacht,
          'terug=' + terug);
      volgende();
    });
  })();
}

// ══════════════════════════════════════════════════════════════════
function deel6() {
  console.log('\n6. Twee rondes tegelijk kan niet');
  // plHerijkTick() draait bij élke meting. Zonder grendel zou een peiling die
  // nog op de bus wacht bij de volgende meting gezelschap krijgen.
  //
  // LET OP hoe deze toets is opgezet — de eerste versie mat het verkeerde.
  // Met één opgeruimde sensor blijft een tweede ronde óók zonder grendel leeg,
  // want de eerste heeft de wachttijd van die ene sensor al vooruitgezet vóór
  // hij ging wachten. De toets stond groen op het verkeerde mechanisme; pas
  // een tegenproef met de grendel eruit liet dat zien.
  //
  // Twee sensoren die tegelijk aan de beurt zijn maken het verschil wél
  // zichtbaar: de eerste ronde hangt bij nummer één, en zonder grendel pakt
  // de tweede ronde nummer twee op. Eén commando op de bus of twee — dát is
  // waar de grendel over gaat.
  const W = maakWereld();
  W.activePIDs.add('015C'); W.activePIDs.add('0110');
  W.pidOpruimen('015C', 'vijf pogingen zonder antwoord');
  W.pidOpruimen('0110', 'vijf pogingen zonder antwoord');
  W.NU += 5 * MIN;
  eis('twee sensoren zijn tegelijk aan de beurt', W.herkansDue(W.NU).length === 2);

  const losmakers = [];
  let hangt = true;
  W._send = function () {
    if (!hangt) return Promise.resolve(42);
    return new Promise(function (r) { losmakers.push(r); });
  };
  const eerste = W.pidHerkansRonde();
  W.pidHerkansRonde().then(function (tweede) {
    eis('de tweede ronde doet niets zolang de eerste loopt', tweede === 0);
    eis('en er staat één commando op de bus, niet twee',
        W.cmds.length === 1, W.cmds.join(','));
    // Loslaten: de peiling die hangt afmaken én de volgende meteen laten
    // doorlopen. Alleen de eerste loslaten laat de ronde bij sensor twee
    // opnieuw hangen — en dan stopt de test halverwege zonder één FAAL.
    hangt = false;
    losmakers.forEach(function (r) { r(42); });
    eerste.then(function (terug) {
      eis('de eerste ronde werkt daarna beide sensoren af', terug === 2, 'terug=' + terug);
      deel7();
    });
  });
}

// ══════════════════════════════════════════════════════════════════
function deel7() {
  console.log('\n7. plHerijkTick belt niet zonder reden');
  const W = maakWereld();
  for (let i = 0; i < 20; i++) W.plHerijkTick();
  eis('geen opgeruimde sensoren → geen enkel commando', W.cmds.length === 0, W.cmds.join(','));

  W.activePIDs.add('015C');
  W.pidOpruimen('015C', 'vijf pogingen zonder antwoord');
  for (let i = 0; i < 20; i++) W.plHerijkTick();
  eis('wél opgeruimd maar nog niet aan de beurt → nog steeds niets',
      W.cmds.length === 0, W.cmds.join(','));

  W.NU += 5 * MIN;
  W.plHerijkTick();
  setTimeout(function () {
    eis('op de trede peilt de tick één keer', W.cmds.length === 1, W.cmds.join(','));
    tegenproef();
  }, 0);
}

// ══════════════════════════════════════════════════════════════════
function tegenproef() {
  console.log('\n8. TEGENPROEF — zou de oude situatie hier opvallen?');
  // Zonder dit weet je alleen dat het nu groen staat, niet dat de test de
  // toestand van vóór #16 rood zou maken.

  // (a) De oude toestand: opruimen, en verder niets. De gate hoort hem dan
  //     te blijven weigeren — dat is de grendel waar deel 3 doorheen moet.
  //     Blijft die weigering uit, dan bewijst deel 3 niets.
  {
    const W = maakWereld();
    W.activePIDs.add('015C');
    W.pidOpruimen('015C', 'vijf pogingen zonder antwoord');
    const r = W.pidToevoegen(['015C'], { handmatig: false });
    eis('zonder herkansing weigert de gate hem echt',
        r.ok.length === 0 && r.weg.length === 1, JSON.stringify(r));
  }

  // (b) De tweede grendel: _pidHealth uit de koude scan. Die blokkeert de
  //     terugweg net zo goed, en juist stil — de sensor antwoordt, de log
  //     zwijgt, en er verandert niets. Hier moet de herkansing hem opruimen.
  {
    const W = maakWereld();
    W.activePIDs.add('015C');
    W._pidHealth['015C'] = 'nodata';               // oordeel van bij het verbinden
    W.pidOpruimen('015C', 'vijf pogingen zonder antwoord');
    W.NU += 5 * MIN;
    W.pidHerkansRonde().then(function (terug) {
      eis('een oude nodata-stempel houdt de terugweg niet tegen',
          terug === 1 && W.activePIDs.has('015C'), 'terug=' + terug);
      eis('en de stempel is bijgewerkt, niet omzeild', W._pidHealth['015C'] === 'ok');

      // (c) De trap zelf: was hij plat geweest (elke keer 5 minuten), dan zou
      //     deel 4 het verschil tussen 5 en 10 minuten niet zien. Dit toont
      //     dat die toets echt op de trap steunt.
      const plat = function () { return 5 * MIN; };
      eis('een platte trap zou deel 4 rood maken',
          plat(1) !== W.herkansIntervalMs(1));

      klaar();
    });
  }
}

function klaar() {
  clearTimeout(WACHTHOND);
  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}
