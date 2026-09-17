// ══════════════════════════════════════════════════════════════════
// test-waarneming.js — het register van waarnemingen per auto (#225)
// ──────────────────────────────────────────────────────────────────
// WAT HIER ONDERSCHEIDEN MOET WORDEN
//
// Niet "onthoudt het register iets" — dat doet elke localStorage-wikkel. De
// vragen die er werkelijk toe doen zijn de vier waar een fout géén foutmelding
// geeft maar een prompt die iets beweert dat niemand gemeten heeft:
//
//   1. Wordt "niets gezien" ooit "nee"? Dat mag nooit. `meld()` kan het niet
//      eens zeggen, en `lees()` van iets onbekends geeft `onbekend`.
//   2. Wie wint als een mens en een meting elkaar tegenspreken? Het moment
//      beslist: een waarneming van vóór de weerlegging is juist wat er
//      weerlegd is; een van erná is nieuw bewijs.
//   3. Blijft het EERSTE moment staan? Dat getal is het bewijs; overschrijven
//      met "nu" maakt er een momentopname van en dan is een valse positief
//      achteraf niet meer te herkennen.
//   4. Lekt de ene auto naar de andere? In een werkplaats koppel je achter
//      elkaar aan, en dat is precies waar PLPidLen en PLPidVorm hun eigen
//      sleutel voor hebben.
//
// En als vijfde de koppeling die stil kan breken: promoveert PLAandrijving.tik()
// een waargenomen start/stop-stop werkelijk naar het register, met het moment
// van de STOP en niet van de tik? Beide modules draaien hier echt, uit de
// bron, in één sandbox — een test met een eigen kopie van die logica kan per
// definitie niet rood worden.
//
// Draaien vanuit public/:  node test-waarneming.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function t(naam, gemeten, verwacht) {
  if (String(gemeten) === String(verwacht)) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + gemeten + ', wilde ' + verwacht); }
}
function waar(naam, v, uitleg) {
  if (v) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}

const BRON = fs.readFileSync(__dirname + '/pidlane-waarneming.js', 'utf8');
const BRON_AANDRIJVING = fs.readFileSync(__dirname + '/pidlane-aandrijving.js', 'utf8');

// Een opslag die zich als localStorage gedraagt, en die desgevraagd gooit —
// vol of geblokkeerd is geen randgeval maar een gewone toestand op een
// telefoon, en het antwoord daarop mag nooit "nee" zijn.
function nepOpslag(bak, gooit) {
  return {
    _bak: bak,
    getItem: function (k) { if (gooit) throw new Error('opslag geblokkeerd'); return Object.prototype.hasOwnProperty.call(bak, k) ? bak[k] : null; },
    setItem: function (k, v) { if (gooit) throw new Error('opslag vol'); bak[k] = String(v); },
    removeItem: function (k) { if (gooit) throw new Error('opslag geblokkeerd'); delete bak[k]; }
  };
}

function maak(opties) {
  const o = opties || {};
  const s = { console: { log() { }, warn() { }, error() { } } };
  s.window = s; s.globalThis = s;
  s.localStorage = nepOpslag(o.bak || {}, !!o.gooit);
  if (o.auto !== undefined) s.vehicleInfo = o.auto;
  vm.createContext(s);
  vm.runInContext(BRON, s, { filename: 'pidlane-waarneming.js' });
  if (o.metAandrijving) vm.runInContext(BRON_AANDRIJVING, s, { filename: 'pidlane-aandrijving.js' });
  if (!s.PLWaarneming || typeof s.PLWaarneming.meld !== 'function') {
    console.error('FOUT: PLWaarneming.meld() niet gevonden — de module exporteert niets meer');
    process.exit(1);
  }
  return s;
}

const AUTO = { vin: 'WDD1234567890ABCD', merk: 'Mazda', model: 'CX-5', year: 2019 };
const ANDERE = { vin: 'ZZZ9999999999ZZZZ', merk: 'Volvo', model: 'V60', year: 2021 };

console.log('\nHet register van waarnemingen per auto (#225)\n');

// ══════════════════════════════════════════════════════════════════
// 1 — NIETS GEZIEN IS GEEN NEE
// ══════════════════════════════════════════════════════════════════
console.log('— niets gezien is geen nee —');
{
  const s = maak({ auto: AUTO });
  const w = s.PLWaarneming.lees('startstop');
  t('een leeg register geeft "onbekend"', w.status, 'onbekend');
  waar('en zeker geen weerlegging', w.status !== 'weerlegd' && w.wanneer === null);

  // De asymmetrie zit in de API: er IS geen manier om "gemeten dat het er
  // niet is" op te schrijven. Zou meld() een status aannemen, dan zou deze
  // aanroep 'weerlegd' of 'nee' kunnen opleveren.
  s.PLWaarneming.meld('startstop', { wanneer: 100 });
  t('meld() legt uitsluitend "gezien" vast', s.PLWaarneming.lees('startstop').status, 'gezien');
  t('en noemt de meting als bron', s.PLWaarneming.lees('startstop').bron, 'meting');
}

// ══════════════════════════════════════════════════════════════════
// 2 — HET MOMENT BESLIST BIJ TEGENSPRAAK
// ══════════════════════════════════════════════════════════════════
console.log('\n— het moment beslist —');
{
  const s = maak({ auto: AUTO });
  s.PLWaarneming.meld('startstop', { wanneer: 100, bewijs: { rpm: 0, snelheid: 0 } });
  s.PLWaarneming.weerleg('startstop', { wanneer: 1000 });
  t('een mens weerlegt wat er lag', s.PLWaarneming.lees('startstop').status, 'weerlegd');
  t('en de bron is de mens', s.PLWaarneming.lees('startstop').bron, 'mens');
  waar('het weerlegde bewijs blijft bewaard',
    !!(s.PLWaarneming.lees('startstop').gecorrigeerd || {}).wanneer,
    'de vergissing is leerzamer dan de correctie — zonder dit bewijs is niet te zien waar de app naar keek');

  // DE KERN, KANT A. Een waarneming van vóór de weerlegging is precies wat er
  // weerlegd is. Zou die de weerlegging heropenen, dan kan de gebruiker de app
  // niet corrigeren: elke volgende tik zet het antwoord terug.
  s.PLWaarneming.meld('startstop', { wanneer: 500 });
  t('een OUDERE waarneming heropent de weerlegging niet', s.PLWaarneming.lees('startstop').status, 'weerlegd');

  // DE KERN, KANT B. Nieuw bewijs ná de correctie wint wél: het verschijnsel
  // is dan alsnog gezien, en bewijs gaat vóór een bewering. Zonder deze kant
  // kan de app zich nooit herstellen van een foute correctie.
  s.PLWaarneming.meld('startstop', { wanneer: 2000 });
  const na = s.PLWaarneming.lees('startstop');
  t('een NIEUWERE waarneming wint wel', na.status, 'gezien');
  t('en draagt zijn eigen moment', na.wanneer, 2000);
  waar('de weerlegging blijft in het dossier staan', na.weerlegdOp === 1000);
}

// ══════════════════════════════════════════════════════════════════
// 3 — HET EERSTE MOMENT BLIJFT STAAN
// ══════════════════════════════════════════════════════════════════
console.log('\n— het eerste moment blijft staan —');
{
  const s = maak({ auto: AUTO });
  s.PLWaarneming.meld('startstop', { wanneer: 100 });
  s.PLWaarneming.meld('startstop', { wanneer: 900 });
  t('een tweede waarneming schuift het moment niet op', s.PLWaarneming.lees('startstop').wanneer, 100);
}

// ══════════════════════════════════════════════════════════════════
// 4 — EEN ONBEKEND VERSCHIJNSEL WORDT GEWEIGERD
// ══════════════════════════════════════════════════════════════════
console.log('\n— onbekende namen worden geweigerd —');
{
  const s = maak({ auto: AUTO });
  s.PLWaarneming.meld('startstpo', { wanneer: 100 });   // typefout
  t('een typefout levert geen tweede, lege waarneming op', s.PLWaarneming.alles().length, s.PLWaarneming.kent().length);
  t('en de naam zelf staat er niet in', s.PLWaarneming.lees('startstpo').status, 'onbekend');
}

// ══════════════════════════════════════════════════════════════════
// 5 — GEEN SLEUTEL, GEEN OPSLAG — EN GEEN LEK NAAR DE VOLGENDE AUTO
// ══════════════════════════════════════════════════════════════════
console.log('\n— de auto waar het bij hoort —');
{
  const bak = {};
  const s = maak({ bak: bak });                       // geen vehicleInfo
  s.PLWaarneming.meld('startstop', { wanneer: 100 });
  t('zonder sleutel blijft het bij deze sessie', s.PLWaarneming.lees('startstop').reikwijdte, 'sessie');
  t('en er wordt niets weggeschreven', Object.keys(bak).length, 0);

  // De VIN komt pas ná de ELM-init. Wat we vóór dat moment zagen, zagen we aan
  // DEZE auto — alleen wisten we zijn naam nog niet.
  s.vehicleInfo = AUTO;
  const na = s.PLWaarneming.lees('startstop');
  t('een sleutel die later komt neemt de waarneming over', na.status, 'gezien');
  t('en vanaf dan geldt hij voor de auto', na.reikwijdte, 'auto');
  waar('nu staat hij ook in de opslag', Object.keys(bak).length === 1, 'bak: ' + JSON.stringify(bak));

  // En de andere kant: een ANDERE auto begint nooit met andermans waarneming.
  s.vehicleInfo = ANDERE;
  t('een andere auto begint schoon', s.PLWaarneming.lees('startstop').status, 'onbekend');
  s.vehicleInfo = AUTO;
  t('en de eerste auto is zijn waarneming niet kwijt', s.PLWaarneming.lees('startstop').status, 'gezien');
}

// ══════════════════════════════════════════════════════════════════
// 6 — DE WAARNEMING OVERLEEFT DE SESSIE
// ══════════════════════════════════════════════════════════════════
console.log('\n— over ritten heen —');
{
  const bak = {};
  const eerste = maak({ auto: AUTO, bak: bak });
  eerste.PLWaarneming.meld('startstop', { wanneer: 1234, bewijs: { rpm: 0, looptijd: 1165 } });

  // Nieuwe sandbox = nieuwe sessie: de module wordt opnieuw geladen en heeft
  // niets in het geheugen. Dit is het hele punt van #225.
  const tweede = maak({ auto: AUTO, bak: bak });
  const w = tweede.PLWaarneming.lees('startstop');
  t('een volgende sessie leest de waarneming terug', w.status, 'gezien');
  t('met het moment van toen', w.wanneer, 1234);
  t('en het bewijs eronder', (w.bewijs || {}).looptijd, 1165);
}

// ══════════════════════════════════════════════════════════════════
// 7 — EEN OPSLAG DIE GOOIT MAAKT ER GEEN "NEE" VAN
// ══════════════════════════════════════════════════════════════════
console.log('\n— vol of geblokkeerd —');
{
  const s = maak({ auto: AUTO, gooit: true });
  let stuk = null;
  try { s.PLWaarneming.meld('startstop', { wanneer: 100 }); } catch (e) { stuk = e; }
  waar('een gooiende opslag laat de app niet omvallen', stuk === null, stuk && stuk.message);
  t('de waarneming geldt dan alleen deze sessie', s.PLWaarneming.lees('startstop').reikwijdte, 'sessie');
  t('maar hij is er wel', s.PLWaarneming.lees('startstop').status, 'gezien');
}

// ══════════════════════════════════════════════════════════════════
// 8 — DE KOPPELING: PLAandrijving.tik() PROMOVEERT
// ══════════════════════════════════════════════════════════════════
// Dit is de stille breuk. Verdwijnt deze aanroep, dan blijft alles hierboven
// groen, blijft de balk kloppen, en komt de vraag volgende rit gewoon terug
// zonder dat iets dat meldt.
console.log('\n— van sessie naar auto —');
{
  const s = maak({ auto: AUTO, metAandrijving: true });
  const A = s.PLAandrijving;
  const p = function (rpm, v, lt) { return { '010C': rpm, '010D': v, '011F': lt }; };

  A.tik(p(900, 0, 1100), { t: 0 });        // motor draait, stilstaand
  t('nog niets te promoveren', s.PLWaarneming.lees('startstop').status, 'onbekend');

  A.tik(p(0, 0, 1165), { t: 1000 });       // motor uit — kandidaat
  A.tik(p(0, 0, 1165), { t: 2000 });       // en nu vastgesteld: STARTSTOP
  const stand = A.laatste();
  t('de sessielaag ziet de stop', stand.toestand, 'STARTSTOP');

  const w = s.PLWaarneming.lees('startstop');
  t('en hij landt in het register', w.status, 'gezien');
  // HET MOMENT VAN DE STOP, NIET VAN DE TIK. Zonder dit onderscheid is
  // achteraf niet te zeggen of een waarneming vóór of ná een adaptertrek viel,
  // en dan is een valse positief niet meer te herkennen.
  t('met het moment van de stop', w.wanneer, stand.startStopSinds);
  waar('en met het bewijs eronder', (w.bewijs || {}).looptijd === 1165, JSON.stringify(w.bewijs));

  // Rijden weer verder: de waarneming blijft staan en verschuift niet.
  A.tik(p(1400, 30, 1200), { t: 3000 });
  A.tik(p(1400, 30, 1300), { t: 4000 });
  const na = s.PLWaarneming.lees('startstop');
  t('de waarneming blijft staan als de motor weer draait', na.status, 'gezien');
  t('en het moment schuift niet mee', na.wanneer, w.wanneer);
}

// ══════════════════════════════════════════════════════════════════
// 9 — EEN NIEUWE VERBINDING WIST DE SESSIE, NIET DE AUTO
// ══════════════════════════════════════════════════════════════════
console.log('\n— reset() raakt de sessie, niet het profiel —');
{
  const bak = {};
  const s = maak({ auto: AUTO, bak: bak, metAandrijving: true });
  const A = s.PLAandrijving;
  const p = function (rpm, v, lt) { return { '010C': rpm, '010D': v, '011F': lt }; };
  A.tik(p(900, 0, 1100), { t: 0 });
  A.tik(p(0, 0, 1165), { t: 1000 });
  A.tik(p(0, 0, 1165), { t: 2000 });
  waar('eerst gezien', s.PLWaarneming.lees('startstop').status === 'gezien');

  A.reset();
  t('de sessiestand is weg', A.laatste(), 'null');
  t('maar de auto weet het nog', s.PLWaarneming.lees('startstop').status, 'gezien');
}

console.log('\n─────────────────────────────────────────');
console.log(ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
