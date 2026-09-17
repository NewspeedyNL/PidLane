// ══════════════════════════════════════════════════════════════════
// test-livelog.js — komt de testrun tijdens de rit naar buiten? (17-09-2026)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
//
// Een testrun leverde tot vandaag één ding op: een tekstverslag ná afloop,
// met de hand geplakt. Wie onderweg wilde weten of blok 7 al goed was, moest
// stoppen en lezen. Het kanaal om dat live te doen lag er al — `logToSheets()`
// stuurt elke vijftien seconden een batch naar Airtable en deed dat elke rit
// al voor uitschieters — maar `pidlane-testrun.js` riep hem nul keer aan.
//
// Twee dingen worden hier getoetst, en allebei zijn ze stil als ze stukgaan:
//
// 1. HET DERDE ARGUMENT VAN logToSheets. De handtekening is
//    `logToSheets(type, message, extra)` en `extra` werd nergens gebruikt.
//    Vijf aanroepers gaven er iets in mee (de PID en de reden bij een
//    uitschieter, het adapteradres bij een verbinding) en dat verdween
//    zonder één foutmelding. Dat mag niet terugkomen, want het live-pad rust
//    er nu op.
//
//    En de andere kant: een onbekende veldnaam mag NIET als veld meegaan.
//    Airtable weigert die met een 422, de batch van tien komt terug in de
//    buffer, en die probeert het elke vijftien seconden opnieuw. Eén
//    verkeerde sleutel legt dan niet één regel plat maar de hele log.
//
// 2. WAT DE TESTRUN WEGSCHRIJFT. Niet alles: een volle run doet vijftig
//    stappen en de tabel stond op 17-09 al op 719 regels. Wel: de start, elke
//    FOUT en LET OP zodra hij valt, en één regel per blok met de telling.
//    Schrijft hij te weinig, dan kun je onderweg niets afvinken; schrijft hij
//    alles, dan is het kanaal binnen een paar ritten vol met "ok".
//
// Beide bestanden worden ECHT geladen (vm) — geen nagebouwde kopie.
//
// Draaien vanuit public/:  node test-livelog.js        (exit 0 = goed)
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

// ══════════════════════════════════════════════════════════════════
console.log('\n1. logToSheets() laat het derde argument niet meer vallen');
// ══════════════════════════════════════════════════════════════════
{
  // pidlane-auth.js in zijn geheel laden is niet te doen (het trekt de halve
  // app mee). De functie wordt daarom uit de bron geknipt met een anker dat
  // deze test laat stoppen zodra hij verplaatst of hernoemd wordt — dat is
  // het verschil met een overgetypte kopie.
  const bron = fs.readFileSync(__dirname + '/pidlane-auth.js', 'utf8');
  const kolommen = bron.match(/const AT_KOLOMMEN = new Set\(\[[\s\S]*?\]\);/);
  const fn = bron.match(/async function logToSheets\(type, message, extra=\{\}\)\{[\s\S]*?\n\}/);
  if (!kolommen) { console.error('FOUT: AT_KOLOMMEN niet gevonden in pidlane-auth.js'); process.exit(1); }
  if (!fn) { console.error('FOUT: logToSheets() niet gevonden in pidlane-auth.js'); process.exit(1); }

  const s = { console: { warn() { } } };
  s.window = s;
  s.AIRTABLE_URL = 'https://voorbeeld/log';
  s.vehicleInfo = { merk: 'Mazda', year: '2018', vin: 'JM3KFBCL8J0123456' };
  s.selectedNetwork = { name: 'CAN 11/500' };
  s.activePIDs = new Set(['010C']);
  s.APP_VERSION = '3.0.0';
  s.currentUser = { name: 'proef', role: 'admin' };
  s._atBuffer = [];
  s._atTimer = null;
  s.setTimeout = function () { return 0; };
  s.clearTimeout = function () { };
  s._plVinVoorLog = async function () { return 'JM3-pseudoniem'; };
  vm.createContext(s);
  vm.runInContext(kolommen[0] + '\n' + fn[0], s, { filename: 'logToSheets' });

  const velden = async function (type, msg, extra) {
    s._atBuffer.length = 0;
    await vm.runInContext('logToSheets', s)(type, msg, extra);
    return s._atBuffer.length ? s._atBuffer[0].fields : null;
  };

  (async function () {
    // Een sleutel die WEL een kolom is, hoort als veld mee te gaan.
    let f = await velden('info', 'proef', { SessionId: '2026-09-18-0830', Demo: true });
    toets('een bekende kolom gaat als veld mee',
      f && f.SessionId === '2026-09-18-0830' && f.Demo === true,
      'velden: ' + JSON.stringify(f));

    // TEGENPROEF: een sleutel die GEEN kolom is mag nooit als veld mee —
    // Airtable weigert de hele batch dan met een 422.
    f = await velden('outlier', 'te hoog', { pid: '0105', value: 215, reason: 'hard_limit' });
    toets('een onbekende sleutel wordt géén veld',
      f && !('pid' in f) && !('value' in f) && !('reason' in f),
      'velden: ' + JSON.stringify(f) + ' — dit legt de hele log plat, niet alleen deze regel');
    toets('... maar verdwijnt ook niet: hij staat achter het bericht',
      f && /pid=0105/.test(f.Message) && /value=215/.test(f.Message) && /reason=hard_limit/.test(f.Message),
      'bericht: ' + (f && f.Message) + ' — dit is precies wat er tot vandaag stilletjes wegviel');

    // Zonder extra hoort er niets te veranderen aan wat er al stond.
    f = await velden('info', 'kaal');
    toets('zonder derde argument blijft het bericht kaal', f && f.Message === 'kaal');
    toets('en de vaste velden staan er nog',
      f && f.Merk === 'Mazda' && f.VIN === 'JM3-pseudoniem' && f.AppVersion === '3.0.0',
      'velden: ' + JSON.stringify(f));

    // Het bericht blijft afgekapt op 500 tekens, ook mét staart: een lange
    // extra mag de grens niet omzeilen.
    f = await velden('info', 'x'.repeat(480), { pid: 'y'.repeat(200) });
    toets('bericht plus staart blijft op 500 tekens afgekapt',
      f && f.Message.length === 500, 'lengte: ' + (f && f.Message.length));

    deel2();
  })();
}

// ══════════════════════════════════════════════════════════════════
function deel2() {
  console.log('\n2. De testrun schrijft mee, en schrijft niet álles mee');
  // ══════════════════════════════════════════════════════════════════
  const s = {};
  s.window = s;
  s.console = { warn() { }, error() { }, log() { } };
  s.regels = [];
  s.demoMode = false;
  s.logToSheets = function (type, bericht, extra) {
    s.regels.push({ type: type, bericht: bericht, extra: extra || {} });
  };
  s.localStorage = { getItem() { return null; }, setItem() { }, removeItem() { } };
  s.document = { getElementById() { return null; }, querySelectorAll() { return []; },
                 createElement() { return { style: {}, classList: { add() { }, remove() { } } }; },
                 addEventListener() { }, body: { appendChild() { } } };
  s.navigator = { userAgent: 'node' };
  s.setInterval = function () { return 0; }; s.clearInterval = function () { };
  s.setTimeout = function () { return 0; }; s.clearTimeout = function () { };
  s.pidVals = {}; s._pidLastUpd = {}; s.activePIDs = new Set(); s.pidHist = {};
  s.PLBus = { stats() { return { belasting: 0, perSec: 0, venGemMs: 0, foutPct: 0 }; } };
  s.PLLoad = { staat() { return { mult: 1, tempoPct: 100 }; }, cfg: {} };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8'), s,
    { filename: 'pidlane-testrun.js' });

  // pidlane-testrun.js is één grote IIFE: wat daar niet uit geëxporteerd
  // wordt, bestaat buiten niet. PLTestrunLive is die uitgang, en meteen het
  // anker van deze test — verdwijnt hij, dan stopt de test hier in plaats van
  // stilletjes iets anders te toetsen.
  const L = s.PLTestrunLive;
  if (!L || typeof L.tik !== 'function' || typeof L.einde !== 'function') {
    console.error('FOUT: PLTestrunLive ontbreekt — de testrun schrijft niet meer mee');
    process.exit(1);
  }
  const tik = L.tik;

  // Een blok met alleen goede stappen schrijft tijdens dat blok NIETS weg.
  s.regels.length = 0;
  tik(7, 'stap a', 'ok', '');
  tik(7, 'stap b', 'ok', '');
  toets('een blok dat goed gaat levert onderweg geen enkele regel op',
    s.regels.length === 0,
    'gaf: ' + JSON.stringify(s.regels) + ' — vijftig stappen per run vult de tabel in een paar ritten');

  // Maar zodra het volgende blok begint, komt de telling van het vorige eruit.
  tik(8, 'stap a', 'ok', '');
  toets('bij de blokwissel komt de telling van het vorige blok wél',
    s.regels.length === 1 && /blok 7 klaar/.test(s.regels[0].bericht) && /2 ok/.test(s.regels[0].bericht),
    'gaf: ' + JSON.stringify(s.regels.map(r => r.bericht)));

  // Een FOUT gaat meteen mee — daar wil je tijdens de rit op bijsturen.
  s.regels.length = 0;
  tik(8, 'stap b', 'FOUT', 'raildruk mist');
  toets('een FOUT gaat meteen naar buiten, zonder op de blokwissel te wachten',
    s.regels.length === 1 && s.regels[0].type === 'error' &&
    /blok 8 FOUT/.test(s.regels[0].bericht) && /raildruk mist/.test(s.regels[0].bericht),
    'gaf: ' + JSON.stringify(s.regels.map(r => r.bericht)));

  s.regels.length = 0;
  tik(8, 'stap c', 'LET OP', 'twee van de twintig gemist');
  toets('een LET OP ook, maar met een ander type',
    s.regels.length === 1 && s.regels[0].type === 'opvallend' && /LET OP/.test(s.regels[0].bericht));

  // Elke regel draagt het ritnummer en de schema-versie, anders is er later
  // niet terug te vinden bij welke rit hij hoorde.
  const e = s.regels[0].extra;
  toets('elke regel draagt ritnummer, soort en schema-versie',
    e.RecordType === 'testrun' && typeof e.SessionId === 'string' &&
    /^\d{4}-\d{2}-\d{2}-\d{4}$/.test(e.SessionId) && e.SchemaVersion === 1,
    'extra: ' + JSON.stringify(e));
  toets('en of het een demo was',
    e.Demo === false, 'een demo-run in de tabel leest later als een echte meting');

  // TEGENPROEF op die demo-vlag: in demomodus hoort hij aan te staan.
  s.demoMode = true;
  s.regels.length = 0;
  tik(9, 'stap a', 'FOUT', 'x');
  toets('TEGENPROEF: in demomodus staat de demo-vlag aan',
    s.regels.length >= 1 && s.regels[s.regels.length - 1].extra.Demo === true);
  s.demoMode = false;

  // Het slot: het laatste blok wordt afgesloten en er komt een slotregel.
  s.regels.length = 0;
  L.einde('klaar');
  toets('aan het eind wordt het laatste blok afgesloten én de rit',
    s.regels.length === 2 && /blok 9 klaar/.test(s.regels[0].bericht) &&
    /testrun klaar/.test(s.regels[1].bericht),
    'gaf: ' + JSON.stringify(s.regels.map(r => r.bericht)));

  // Een afgebroken run hoort herkenbaar te zijn.
  s.regels.length = 0;
  tik(3, 'stap a', 'ok', '');
  L.einde('afgebroken');
  toets('een afgebroken run zegt dat ook',
    s.regels.some(r => /testrun afgebroken/.test(r.bericht)),
    'anders eindigt de tak in de tabel zonder dat iemand ziet of hij klaar was');

  // De run mag nooit omvallen omdat de log niet werkt.
  s.logToSheets = function () { throw new Error('netwerk weg'); };
  let omgevallen = false;
  try { tik(4, 'stap a', 'FOUT', 'x'); } catch (e) { omgevallen = true; }
  toets('een kapotte log laat de testrun niet omvallen', !omgevallen,
    'een run die stukloopt op zijn eigen verslaglegging is erger dan een run zonder');

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van de ' + n + ' controles'
                            : 'goed: alle ' + n + ' controles') + '\n');
  process.exit(fout ? 1 : 0);
}
