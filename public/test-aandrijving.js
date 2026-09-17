// ══════════════════════════════════════════════════════════════════
// test-aandrijving.js — de aandrijfstatus, op de échte functies
// ──────────────────────────────────────────────────────────────────
// Twee onderwerpen, want ze horen bij elkaar:
//
//   1. `PLAandrijving.bepaal()` uit pidlane-aandrijving.js — de
//      toestandsmachine achter de balk bovenin de Live-weergave.
//   2. `pidPollInterval()` uit pidlane-plload.js — omdat die balk niet kan
//      kloppen als toerental wegvalt uit de pollronde. De EV-modus klemde
//      daarop vast (zie §11), en die klem is hier nagebouwd in plmutate.sh.
//
// Beide worden uit de bron GELADEN, niet overgeschreven. De knipankers laten
// de test stoppen als de functie verhuist of verdwijnt — een test met een
// eigen kopie van de logica kan per definitie niet rood worden.
//
// WAT HIER MOET ONDERSCHEIDEN WORDEN
// Niet "geeft bepaal() een toestand terug" — dat doet hij altijd. De vraag is
// of hij de twee gevallen scheidt die op één momentopname identiek zijn:
//
//      contact aan, motor nog niet gestart   RPM 0, 0 km/h, ECU antwoordt
//      start/stop heeft de motor afgezet     RPM 0, 0 km/h, ECU antwoordt
//
// Precies dezelfde invoer, twee antwoorden, en het verschil zit uitsluitend
// in de voorgeschiedenis. Die proef staat hieronder als "HET ONDERSCHEID".
//
// Draaien vanuit public/:  node test-aandrijving.js     (exit 0 = goed)
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

function lees(f) { return fs.readFileSync(__dirname + '/' + f, 'utf8'); }
function knip(bron, van, tot, naam) {
  const a = bron.indexOf(van), b = tot ? bron.indexOf(tot) : bron.length;
  if (a < 0 || b < a) { console.error('FOUT: knipbereik "' + naam + '" niet gevonden'); process.exit(1); }
  return bron.slice(a, b);
}

// ══════════════════════════════════════════════════════════════════
// DEEL 1 — de toestandsmachine
// ══════════════════════════════════════════════════════════════════
const s = { console: { log() { }, warn() { }, error() { } } };
s.window = s; s.globalThis = s;
vm.createContext(s);
vm.runInContext(lees('pidlane-aandrijving.js'), s, { filename: 'pidlane-aandrijving.js' });

if (!s.PLAandrijving || typeof s.PLAandrijving.bepaal !== 'function') {
  console.error('FOUT: PLAandrijving.bepaal() niet gevonden — de module exporteert niets meer');
  process.exit(1);
}
const A = s.PLAandrijving, D = A.drempels;

// Eén monster. `t` loopt op zodat de stabilisatie echt meedoet.
function m(o) {
  return {
    rpm: o.rpm, snelheid: o.v, looptijd: o.lt, fuelRate: o.fuel,
    spanning: o.volt, ecuLeeft: o.dood ? false : true,
    ouderdomMs: o.oud === undefined ? null : o.oud,
    t: o.t
  };
}
// Voert een reeks monsters af en geeft de laatste uitkomst terug. Zo wordt de
// stabilisatie getoetst zoals hij in de app loopt: monster na monster.
function reeks(monsters, start) {
  let r = start || null;
  for (const x of monsters) r = A.bepaal(m(x), r);
  return r;
}
// Genoeg monsters van dezelfde soort om de stabilisatie voorbij te zijn.
function vast(o, vanaf, n) {
  const uit = [];
  const stap = 250;
  for (let i = 0; i < (n || 6); i++) uit.push(Object.assign({}, o, { t: vanaf + i * stap }));
  return uit;
}

console.log('\n── de vier gewone toestanden ──');

t('rijdend met draaiende motor = DRAAIT_RIJDT',
  reeks(vast({ rpm: 2100, v: 72 }, 0)).toestand, 'DRAAIT_RIJDT');

t('stilstaand met draaiende motor = DRAAIT_STIL',
  reeks(vast({ rpm: 780, v: 0 }, 0)).toestand, 'DRAAIT_STIL');

t('rijdend met stille motor = ACCU_RIJDT',
  reeks(vast({ rpm: 0, v: 41 }, 0)).toestand, 'ACCU_RIJDT');

t('koud aangesloten, motor nooit gedraaid = UIT_VOOR_START',
  reeks(vast({ rpm: 0, v: 0, lt: 0 }, 0)).toestand, 'UIT_VOOR_START');

console.log('\n── HET ONDERSCHEID: dezelfde momentopname, twee antwoorden ──');
// Dit is de reden dat deze module een geheugen heeft. De invoer van de twee
// aanroepen hieronder is BYTE VOOR BYTE gelijk; alleen `vorige` verschilt.
const stilstaand = { rpm: 0, v: 0, lt: null, t: 9000 };

const naRijden = reeks(vast({ rpm: 0, v: 0, lt: null }, 9000),
  reeks(vast({ rpm: 1900, v: 60 }, 0)));
const koud = reeks(vast({ rpm: 0, v: 0, lt: null }, 9000), null);

t('na gereden te hebben is stilstand met stille motor STARTSTOP', naRijden.toestand, 'STARTSTOP');
t('zonder voorgeschiedenis is exact dezelfde meting UIT_VOOR_START', koud.toestand, 'UIT_VOOR_START');
waar('en het verschil zit alléén in de voorgeschiedenis',
  naRijden.toestand !== koud.toestand && naRijden.heeftGedraaid === true && koud.heeftGedraaid === false,
  'gedraaid: ' + naRijden.heeftGedraaid + ' / ' + koud.heeftGedraaid);
t('de bron van dat oordeel is de eigen waarneming', naRijden.bronGedraaid, 'waarneming');

console.log('\n── de drie bronnen voor "heeft gedraaid" ──');

// Bron B. Dit is het geval waarin de eigen waarneming faalt: je koppelt aan
// terwijl de auto al voor het stoplicht staat met een afgezette motor.
const bijStoplicht = reeks(vast({ rpm: 0, v: 0, lt: 412 }, 0), null);
t('011F > 0 bij koud koppelen levert alsnog STARTSTOP', bijStoplicht.toestand, 'STARTSTOP');
t('en de bron is de motorlooptijd', bijStoplicht.bronGedraaid, 'looptijd');

// Bron C. De teller viel terug: dat kan alleen door een reset, en een reset
// hoort bij een start.
const naReset = reeks(vast({ rpm: 0, v: 0, lt: 3 }, 4000),
  reeks(vast({ rpm: 0, v: 0, lt: 0 }, 0), null));
waar('een teruggevallen looptijdteller bewijst dat er gestart is', naReset.heeftGedraaid === true,
  'toestand ' + naReset.toestand + ', bron ' + naReset.bronGedraaid);

// DE ASYMMETRIE. `> 0` mag de vlag zetten, `= 0` mag hem niet wissen: een nul
// kan ook een net gereset tellertje zijn.
const nulNaRijden = reeks(vast({ rpm: 0, v: 0, lt: 0 }, 9000),
  reeks(vast({ rpm: 1900, v: 60, lt: 800 }, 0)));
t('011F = 0 wist de vlag NIET (asymmetrisch bewijs)', nulNaRijden.toestand, 'STARTSTOP');

console.log('\n── zekerheid: de balk zegt hoe hard hij het weet ──');
t('met 011F op 0 is "motor uit" middelmatig zeker',
  reeks(vast({ rpm: 0, v: 0, lt: 0 }, 0)).zekerheid, 'midden');
t('zonder 011F is "motor uit" zwak',
  reeks(vast({ rpm: 0, v: 0, lt: null }, 0)).zekerheid, 'laag');
t('start/stop is hard', naRijden.zekerheid, 'hoog');
t('en dan vraagt de app 011F niet meer op', A.looptijdGewenst(naRijden), 'false');
t('bij een onbekende voorgeschiedenis vraagt hij hem wél op',
  A.looptijdGewenst(reeks(vast({ rpm: 0, v: 0, lt: null }, 0))), 'true');

console.log('\n── stilte is geen motor-uit ──');
const busWeg = reeks(vast({ rpm: null, v: null, dood: true }, 9000, 8),
  reeks(vast({ rpm: 1900, v: 60 }, 0)));
t('een dode bus geeft ONBEKEND en niet "motor uit"', busWeg.toestand, 'ONBEKEND');
t('en ONBEKEND heeft geen zekerheid', busWeg.zekerheid, 'geen');
waar('de voorgeschiedenis overleeft de stilte', busWeg.heeftGedraaid === true);

const oud = reeks(vast({ rpm: 0, v: 0, lt: 10, oud: D.versMs + 500 }, 0, 8), null);
t('een te oude meting geeft ONBEKEND', oud.toestand, 'ONBEKEND');

console.log('\n── hysterese en stabilisatie: geen knipperende balk ──');
const zakt = A.bepaal(m({ rpm: 200, v: 0, t: 5000 }), reeks(vast({ rpm: 900, v: 0 }, 0)));
waar('200 tpm ná stationair blijft "motor draait" (lage drempel)', zakt.motorDraait === true);
const komt = A.bepaal(m({ rpm: 200, v: 0, t: 5000 }), reeks(vast({ rpm: 0, v: 0, lt: 0 }, 0)));
waar('200 tpm vanuit stilstand is nog géén draaiende motor (hoge drempel)', komt.motorDraait === false);

const eenMisser = A.bepaal(m({ rpm: 0, v: 0, t: 5250 }), reeks(vast({ rpm: 1900, v: 60 }, 0)));
t('één afwijkend monster verandert de getoonde toestand niet', eenMisser.toestand, 'DRAAIT_RIJDT');
waar('maar het wordt wel als kandidaat vastgehouden', eenMisser.kandidaat === 'STARTSTOP',
  'kandidaat: ' + eenMisser.kandidaat);
// TEGENPROEF op de stabilisatie: houdt het aan, dan moet hij wél omslaan.
waar('houdt het aan, dan slaat hij om',
  reeks(vast({ rpm: 0, v: 0 }, 5250), reeks(vast({ rpm: 1900, v: 60 }, 0))).toestand === 'STARTSTOP');

console.log('\n── de herstart ──');
const herstart = A.bepaal(m({ rpm: 900, v: 0, t: 12000 }), naRijden);
t('van stille naar draaiende motor = START', herstart.toestand, 'START');
t('en die blijft even staan',
  A.bepaal(m({ rpm: 850, v: 0, t: 12250 }), herstart).toestand, 'START');
t('daarna gaat hij over in stationair',
  A.bepaal(m({ rpm: 850, v: 0, t: 12000 + D.startMs + 300 }), herstart).toestand, 'DRAAIT_STIL');

console.log('\n── wat de balk toont ──');
const evRit = reeks(vast({ rpm: 0, v: 41, fuel: 0 }, 0));
waar('rijden op accu bewijst dat deze auto hybride is', evRit.bewijstHybride === true);
t('en de balk noemt het brandstofdebiet erbij', A.balkTekst(evRit).indexOf('0,0 L/u') > 0, 'true');
waar('het hybride-bewijs blijft staan als de motor daarna aanslaat',
  reeks(vast({ rpm: 2000, v: 60 }, 9000), evRit).bewijstHybride === true);
waar('een zwakke zekerheid staat in de balktekst',
  A.balkTekst(reeks(vast({ rpm: 0, v: 0, lt: null }, 0))).indexOf('(laag)') > 0);
waar('een harde zekerheid niet', A.balkTekst(naRijden).indexOf('(') < 0,
  'kreeg: ' + A.balkTekst(naRijden));

console.log('\n── de waarneming die het meetcontextvenster leest (#64) ──');
/* Dezelfde asymmetrie als bij `heeftGedraaid`, en om dezelfde reden: gezien is
   bewijs, niet-gezien is niets. Het venster vóór de analyse vult de
   start/stop-vraag hiermee voor, dus een vlag die te makkelijk aan of weer uit
   gaat vertelt de AI iets dat niemand gemeten heeft. */
waar('zonder waarneming staat de vlag uit', koud.startStopGezien === false,
  'toestand ' + koud.toestand);
waar('een start/stop-stop zet hem aan', naRijden.startStopGezien === true,
  'toestand ' + naRijden.toestand);
waar('en met het moment erbij', typeof naRijden.startStopSinds === 'number',
  'startStopSinds: ' + naRijden.startStopSinds);
// DE KERN: hij blijft staan als de motor weer aanslaat. Anders zou het venster
// alleen "ja" voorstellen als je toevallig bij een stoplicht staat op het
// moment dat je op Analyseer drukt.
// Ruim langer dan startMs, anders staat hij nog op START en toetst deze
// proef de overgang en niet de vlag.
const naHerstart = reeks(vast({ rpm: 1900, v: 60 }, 20000, 16), naRijden);
waar('en hij blijft staan als de motor weer aanslaat',
  naHerstart.startStopGezien === true && naHerstart.toestand === 'DRAAIT_RIJDT',
  'toestand ' + naHerstart.toestand + ', gezien ' + naHerstart.startStopGezien);
waar('het moment van de eerste stop blijft ook staan',
  naHerstart.startStopSinds === naRijden.startStopSinds,
  naHerstart.startStopSinds + ' tegen ' + naRijden.startStopSinds);
// TEGENPROEF op het onderscheid: "motor uit vóór de eerste start" is géén
// start/stop, hoe lang je er ook naar kijkt. Zou deze vlag aan UIT_VOOR_START
// hangen, dan stelde het venster "ja" voor op een auto met contact aan.
waar('"motor uit vóór de eerste start" zet hem NIET aan',
  reeks(vast({ rpm: 0, v: 0, lt: 0 }, 9000), null).startStopGezien === false);

console.log('\n── uitPidVals leest de echte sleutels ──');
const nu = A.uitPidVals({ '010C': 1850, '010D': 63, '011F': 900, '015E': 7.4, '0142': 14.1 }, { t: 1 });
t('toerental uit 010C', nu.rpm, 1850);
t('snelheid uit 010D', nu.snelheid, 63);
t('looptijd uit 011F', nu.looptijd, 900);
t('brandstofdebiet uit 015E', nu.fuelRate, 7.4);

// ══════════════════════════════════════════════════════════════════
// DEEL 2 — het anker in de pollronde
// ──────────────────────────────────────────────────────────────────
// De balk hangt aan 010C. Valt die weg, dan bevriest `pidVals['010C']` op zijn
// laatste waarde en klemt de EV-modus vast: alleen een snelheid onder 2 km/h
// kan hem dan nog openen. Deze proef laadt de échte pidPollInterval() en de
// échte twee Sets, en toetst dat het EV-filter de ankers overslaat.
// ══════════════════════════════════════════════════════════════════
console.log('\n── de EV-modus pauzeert de ankers niet ──');

const p = { console: { log() { }, warn() { }, error() { } } };
p.window = p; p.globalThis = p;
vm.createContext(p);
// De tabellen komen uit de app zelf — PID_POLL_CLASS en POLL_PROFIELEN worden
// hier niet nagebouwd. Alleen de twee keuzefuncties eromheen zijn nep.
vm.runInContext(lees('pidlane-data.js'), p, { filename: 'pidlane-data.js' });
p._focusPIDs = new Set();
p._pollMult = 1;
p.actiefPollProfiel = () => 'monitor';
p.detectEngineType = () => 'hybride';
p.PLLoad = { mult: () => 1, cfg: {} };

// De twee knips gaan in ÉÉN runInContext. Een top-level `const` leeft in de
// scriptscope en niet op het globale object, dus een tweede losse aanroep zou
// `ICE_PIDS_SUFFIX` niet meer zien — in de browser zien klassieke scripts
// elkaars scope wél, en dat verschil moet de sandbox nabootsen. De laatste
// regel haalt de échte objecten naar buiten; er wordt niets nagebouwd.
const bronMotor = lees('pidlane-motortype.js');
const bronLoad = lees('pidlane-plload.js');
vm.runInContext([
  knip(bronMotor, 'const ICE_PIDS_SUFFIX', 'function detectEngineType', 'de twee PID-verzamelingen'),
  knip(bronLoad, 'function pidPollInterval(pid){', '// Welke PIDs zijn NU "due"', 'pidPollInterval'),
  'window.pidPollInterval = pidPollInterval;',
  'window.ICE_PIDS_SUFFIX = ICE_PIDS_SUFFIX;',
  'window.EV_ANKER_SUFFIX = (typeof EV_ANKER_SUFFIX !== "undefined") ? EV_ANKER_SUFFIX : undefined;',
  // `_evModeActive` is in de bron een script-scoped `let`, net als in de
  // browser. Een property op het globale object raakt die binding niet — de
  // eerste versie van deze proef zette hem dus nooit aan, en alleen de
  // tegenproef eronder ("MAF wordt wél gepauzeerd") kon dat laten zien.
  'window.__zetEV = function (v) { _evModeActive = v; };'
].join('\n'), p, { filename: 'pollronde-knip.js' });

if (typeof p.pidPollInterval !== 'function') {
  console.error('FOUT: pidPollInterval() niet geladen — het knipanker klopt niet meer');
  process.exit(1);
}
// Geen `instanceof Set`: die Set komt uit de vm-context en is dus geen
// instantie van de Set van dit proces.
waar('de ankerlijst bestaat in de bron',
  !!p.EV_ANKER_SUFFIX && typeof p.EV_ANKER_SUFFIX.has === 'function',
  'EV_ANKER_SUFFIX is ' + typeof p.EV_ANKER_SUFFIX);
waar('toerental staat in de ICE-lijst (anders bewijst deze proef niets)',
  p.ICE_PIDS_SUFFIX.has('0C'));

p.__zetEV(false);
const rpmUit = p.pidPollInterval('010C');
const mafUit = p.pidPollInterval('0110');
p.__zetEV(true);
const rpmAan = p.pidPollInterval('010C');
const spdAan = p.pidPollInterval('010D');
const mafAan = p.pidPollInterval('0110');

waar('zonder EV-modus wordt toerental gewoon gepolld', rpmUit < 5000, 'kreeg ' + rpmUit);
waar('zonder EV-modus wordt MAF gewoon gepolld', mafUit < 20000, 'kreeg ' + mafUit);
// DIT is de regel die rood wordt als het anker uit het filter verdwijnt.
waar('MET EV-modus blijft toerental gepolld', rpmAan < 5000,
  'kreeg ' + rpmAan + ' ms — de EV-modus kan zichzelf dan niet meer opheffen');
waar('MET EV-modus blijft snelheid gepolld', spdAan < 5000, 'kreeg ' + spdAan);
// TEGENPROEF: de EV-modus moet wél nog iets uitzetten, anders toetst de regel
// hierboven niets meer.
waar('MET EV-modus wordt MAF wél gepauzeerd', mafAan >= 999999, 'kreeg ' + mafAan);

console.log('\n' + (fout ? 'FOUT: ' : 'goed: ') + ok + ' ok, ' + fout + ' fout\n');
process.exit(fout ? 1 : 0);
