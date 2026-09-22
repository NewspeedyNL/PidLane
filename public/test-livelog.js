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
  // De drie helpers die logToSheets sinds #256 gebruikt staan erboven en horen
  // er dus bij: zonder hen draait de functie niet, en met een stub zou deze
  // test groen staan op iets anders dan de app werkelijk doet.
  const hulp = bron.match(/let _plAppSessie=null;[\s\S]*?\nfunction _plLogAdapter\(\)\{[\s\S]*?\n\}/);
  if (!kolommen) { console.error('FOUT: AT_KOLOMMEN niet gevonden in pidlane-auth.js'); process.exit(1); }
  if (!fn) { console.error('FOUT: logToSheets() niet gevonden in pidlane-auth.js'); process.exit(1); }
  if (!hulp) { console.error('FOUT: de logveld-helpers (#256) niet gevonden in pidlane-auth.js'); process.exit(1); }

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
  vm.runInContext(kolommen[0] + '\n' + hulp[0] + '\n' + fn[0], s, { filename: 'logToSheets' });

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

  deel3();
}

// ══════════════════════════════════════════════════════════════════
async function deel3() {
  console.log('\n3. flushAirtable() zegt wat er van de verzending terechtkwam');
  // ══════════════════════════════════════════════════════════════════
// NAGEMETEN OP 17-09-2026, en dat is waarom dit stuk bestaat. De logtabel
// telde 722 regels en nul daarvan kwam van een testrun, terwijl gewone
// regels er diezelfde avond nog in kwamen. Dat verschil was van binnenuit
// niet te zien: een mislukte batch ging alleen naar console.warn op een
// telefoon tijdens een rit, en de aanroeper kreeg niets terug.
//
// Blok 5 van de testrun rust nu op plLiveLogStatus(). Faalt dit stuk, dan
// is die proef een proef die niets meer kan onderscheiden.
  const bron = fs.readFileSync(__dirname + '/pidlane-auth.js', 'utf8');
  const noteer = bron.match(/let _atLaatste=null;[\s\S]*?function plLiveLogStatus\(\)\{[^\n]*\n/);
  const flush = bron.match(/async function flushAirtable\(\)\{[\s\S]*?\n\}/);
  if (!noteer) { console.error('FOUT: _atLaatste/_atNoteer/plLiveLogStatus niet gevonden in pidlane-auth.js'); process.exit(1); }
  if (!flush) { console.error('FOUT: flushAirtable() niet gevonden in pidlane-auth.js'); process.exit(1); }

  const s = { console: { warn() { } } };
  s.window = s;
  s.AIRTABLE_URL = 'https://voorbeeld/airtable/log';
  s._atBuffer = [];
  s._atTimer = null;
  s.setTimeout = function () { return 0; };
  s.clearTimeout = function () { };
  s.Object = Object;
  vm.createContext(s);
  vm.runInContext(noteer[0] + '\n' + flush[0], s, { filename: 'flushAirtable' });

  const vul = function (aantal) {
    s._atBuffer.length = 0;
    for (let i = 0; i < aantal; i++) s._atBuffer.push({ fields: { Message: 'regel ' + i } });
  };

  toets('zonder poging is er geen uitslag — geen verzonnen groen',
    s.plLiveLogStatus() === null,
    'een proef die op null groen wordt, staat groen vóór er iets verstuurd is');

  // 1. HET GAAT GOED.
  // Het antwoord draagt sinds #262 het aantal weggeschreven regels. Een lege
  // body is geen geslaagde verzending meer — zie de tegenproef verderop.
  s.plFetch = async function () { return { ok: true, status: 200, json: async () => ({ ok: true, geschreven: 2 }) }; };
  vul(2);
  await s.flushAirtable();
  let u = s.plLiveLogStatus();
  toets('een geslaagde verzending wordt vastgelegd met status en aantal',
    u && u.ok === true && u.status === 200 && u.aantal === 2 && u.geschreven === 2 && u.fout === '',
    'gaf: ' + JSON.stringify(u));
  toets('... en de buffer is dan leeg', s._atBuffer.length === 0,
    'gaf: ' + s._atBuffer.length + ' regel(s) — dan wordt dezelfde batch straks opnieuw gestuurd');

  // 1b. DE WORKER NEEMT AAN MAAR SCHRIJFT NIETS WEG. Dit is de toestand van
  //     20-09-2026 17:12 tot 22-09: HTTP 200 met {ok:true} en een lege tabel.
  //     Zonder deze toets is "aangenomen" weer hetzelfde als "weggeschreven".
  s.plFetch = async function () { return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  vul(2);
  await s.flushAirtable();
  u = s.plLiveLogStatus();
  toets('ok zonder `geschreven` telt niet als geslaagd',
    u && u.ok === false && /niet weggeschreven/.test(u.fout),
    'gaf: ' + JSON.stringify(u));
  toets('... en de batch blijft in de buffer staan voor een nieuwe poging',
    s._atBuffer.length === 2,
    'gaf: ' + s._atBuffer.length + ' regel(s) — die twee zijn dan weg zonder dat iemand het ziet');
  s._atBuffer.length = 0;

  // 2. AIRTABLE WEIGERT. Dit is het geval dat de hele log plat kan leggen:
  //    één onbekende veldnaam geeft een 422 en de batch komt terug.
  s.plFetch = async function () {
    return { ok: false, status: 422, json: async () => ({ error: { message: 'Unknown field name: "Zeur"' } }) };
  };
  vul(3);
  await s.flushAirtable();
  u = s.plLiveLogStatus();
  toets('een geweigerde batch wordt vastgelegd als mislukt, mét de reden van Airtable',
    u && u.ok === false && u.status === 422 && /Unknown field name/.test(u.fout),
    'gaf: ' + JSON.stringify(u));
  toets('... en de geweigerde regels staan terug in de buffer',
    s._atBuffer.length === 3,
    'gaf: ' + s._atBuffer.length + ' — anders is de meting van die batch weg zonder dat iemand het ziet');

  // 3. HET NETWERK IS WEG. Geen status, wel een reden.
  s.plFetch = async function () { throw new Error('netwerk weg'); };
  vul(1);
  await s.flushAirtable();
  u = s.plLiveLogStatus();
  toets('een netwerkfout wordt vastgelegd zonder status, mét de melding',
    u && u.ok === false && u.status === null && /netwerk weg/.test(u.fout),
    'gaf: ' + JSON.stringify(u));

  // 4. DE UITSLAG IS VAN DE LOG, NIET VAN DE BELLER. Blok 5 leest hem; een
  //    proef die hem kan verzetten kan zichzelf groen maken.
  const kopie = s.plLiveLogStatus();
  kopie.ok = true; kopie.status = 200;
  toets('plLiveLogStatus geeft een kopie terug, geen greep op de toestand',
    s.plLiveLogStatus().ok === false && s.plLiveLogStatus().status === null,
    'gaf: ' + JSON.stringify(s.plLiveLogStatus()));

  // 5. ELKE POGING IS EEN NIEUW MOMENT. Blok 5 vergelijkt `tijd` om een oude
  //    geslaagde verzending niet voor de zijne aan te zien.
  const voor = s.plLiveLogStatus().tijd;
  s.plFetch = async function () { return { ok: true, status: 200, json: async () => ({ ok: true, geschreven: 1 }) }; };
  vul(1);
  await new Promise(r => setTimeout(r, 2));
  await s.flushAirtable();
  toets('een volgende poging draagt een nieuwer tijdstip',
    s.plLiveLogStatus().tijd > voor,
    'zonder dat kan blok 5 een uitslag van tien minuten geleden voor de zijne aanzien');

  // 6. TEGENPROEF OP DE POORT ZELF. Een lege buffer is geen verzending, dus
  //    hij hoort de vorige uitslag niet te overschrijven met groen.
  //    Vergelijken op de héle uitslag en niet op het tijdstip alleen: twee
  //    pogingen binnen dezelfde milliseconde dragen hetzelfde tijdstip, en dan
  //    stond deze tegenproef groen op een toeval van de klok.
  const laatste = JSON.stringify(s.plLiveLogStatus());
  s._atBuffer.length = 0;
  await new Promise(r => setTimeout(r, 2));
  await s.flushAirtable();
  toets('TEGENPROEF: een lege buffer levert geen nieuwe uitslag op',
    JSON.stringify(s.plLiveLogStatus()) === laatste,
    'anders leest "er stond niets klaar" als "het is aangekomen" — gaf: ' + s.plLiveLogStatus());

  await deel4();
}

// ══════════════════════════════════════════════════════════════════
async function deel4() {
  console.log('\n4. de blok 5-proef onderscheidt aangekomen van niet-aangekomen');
  // ══════════════════════════════════════════════════════════════════
  // Hierboven is getoetst dat de log vastlegt wat er gebeurde. Dit is de
  // andere helft: doet de proef er het goede mee? Dat is de helft die tijdens
  // een rit een vals alarm kan geven, en een proef die om de zoveel run
  // onterecht rood staat wordt genegeerd (CLAUDE.md).
  //
  // De echte entry wordt uit de lijst gehaald en uitgevoerd — geen nagebouwde
  // kopie. Verdwijnt hij, dan stopt deze test hier.
  const s = {};
  s.window = s;
  s.connected = false;
  s.demoMode = false;
  s.pidVals = {}; s._pidLastUpd = {}; s.activePIDs = new Set(); s.pidHist = {};
  s.console = { warn() { }, error() { }, log() { } };
  s.localStorage = { getItem() { return null; }, setItem() { }, key() { return null; }, length: 0 };
  s.document = { getElementById() { return null; }, querySelectorAll() { return []; },
                 createElement() { return { style: {}, classList: { add() { }, remove() { } } }; },
                 addEventListener() { }, body: { appendChild() { } } };
  s.navigator = { userAgent: 'node' };
  s.setInterval = function () { return 0; }; s.clearInterval = function () { };
  // LET OP — hier géén setTimeout die niets doet. De proef wacht op de
  // verzending met _wacht(), en met een setTimeout die zijn callback nooit
  // aanroept blijft die belofte voor eeuwig open staan: de test hangt dan in
  // plaats van te falen.
  s.setTimeout = function (fn) { setImmediate(fn); return 0; };
  s.clearTimeout = function () { };
  s.PLBus = { stats() { return { belasting: 0, perSec: 0, venGemMs: 0, foutPct: 0 }; } };
  s.PLLoad = { staat() { return { mult: 1, tempoPct: 100 }; }, cfg: {} };
  s.logToSheets = function () { };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8'), s,
    { filename: 'pidlane-testrun.js' });

  if (!s.PLBlok5 || typeof s.PLBlok5.proeven !== 'function') {
    console.error('FOUT: PLBlok5 hangt niet meer naar buiten — de lijst is niet te bereiken');
    process.exit(1);
  }
  const entry = s.PLBlok5.proeven().filter(p => p.issue === '#235')[0];
  if (!entry || typeof entry.proef !== 'function') {
    console.error('FOUT: de proef van #235 staat niet meer in PROEVEN_B5');
    process.exit(1);
  }

  // Eén opstelling waarin alles goed gaat; per geval wordt er één ding aan
  // veranderd. Dat is wat de gevallen vergelijkbaar maakt.
  let klok = 1000;
  function opstelling(uitslag) {
    s.AIRTABLE_URL = 'https://voorbeeld/airtable/log';
    s.logToSheets = function () { };
    s.flushAirtable = async function () { if (uitslag) uitslag.tijd = ++klok; };
    s.plLiveLogStatus = function () { return uitslag ? Object.assign({}, uitslag) : null; };
  }

  opstelling({ tijd: klok, ok: true, status: 200, aantal: 3, geschreven: 3, fout: '' });
  let r = await entry.proef();
  toets('aangekomen → ok, met het aantal regels erbij',
    r.staat === 'ok' && /3 regel/.test(r.detail) && /200/.test(r.detail),
    'gaf: ' + JSON.stringify(r));
  // Bij Airtable kon deze proef niet verder komen dan "de lijn is er": een
  // onbekende veldnaam werd dáár pas geweigerd. Een INSERT in D1 slaagt of
  // klapt, dus het aantal weggeschreven regels is nu wél bewijs.
  toets('... en hij noemt het aantal weggeschreven regels als bewijs',
    /schreef 3 van 3/.test(r.detail),
    'zonder dat getal is HTTP 200 alleen "aangenomen" en niet "weggeschreven"');

  // DE ONDERSCHEIDENDE VOOR #262. Dit is letterlijk de vorm die van 20-09
  // 17:12 tot 22-09 live stond: HTTP 200, ok, en niets in de tabel. Een proef
  // die hier groen blijft is de proef die dat drie dagen niet zag.
  opstelling({ tijd: klok, ok: true, status: 200, aantal: 3, fout: '' });
  r = await entry.proef();
  toets('ok zonder aantal weggeschreven regels → FOUT, niet groen',
    r.staat === 'FOUT' && /geen bewijs/.test(r.detail),
    'gaf: ' + JSON.stringify(r));

  opstelling({ tijd: klok, ok: false, status: 422, aantal: 3, fout: 'Unknown field name: "Zeur"' });
  r = await entry.proef();
  toets('geweigerd door Airtable → FOUT, met status en reden',
    r.staat === 'FOUT' && /422/.test(r.detail) && /Unknown field name/.test(r.detail),
    'gaf: ' + JSON.stringify(r));

  opstelling({ tijd: klok, ok: false, status: null, aantal: 1, fout: 'netwerk weg' });
  r = await entry.proef();
  toets('netwerk weg → FOUT, en hij noemt het netwerk',
    r.staat === 'FOUT' && /netwerkfout/.test(r.detail),
    'gaf: ' + JSON.stringify(r));

  // 401/403 is iets anders dan een kapot kanaal: dan ontbreekt een
  // voorwaarde, en dat hoort LET OP te zijn. Zo staat het in CLAUDE.md, en
  // zonder dat onderscheid staat deze proef rood op elke run zonder login.
  opstelling({ tijd: klok, ok: false, status: 401, aantal: 1, fout: 'unauthorized' });
  r = await entry.proef();
  toets('niet ingelogd (401) → LET OP en geen FOUT',
    r.staat === 'LET OP' && /401/.test(r.detail),
    'gaf: ' + JSON.stringify(r));

  opstelling({ tijd: klok, ok: true, status: 200, aantal: 1, geschreven: 1, fout: '' });
  s.AIRTABLE_URL = '';
  r = await entry.proef();
  toets('geen logadres ingesteld → LET OP, want de voorwaarde ontbreekt',
    r.staat === 'LET OP' && /AIRTABLE_URL/.test(r.detail),
    'gaf: ' + JSON.stringify(r));

  // DE ONDERSCHEIDENDE: er wordt niets verstuurd. Een proef die alleen naar
  // de laatste uitslag kijkt zou hier groen blijven op de geslaagde
  // verzending van daarvóór — precies de fout die deze proef moet vangen.
  opstelling({ tijd: klok, ok: true, status: 200, aantal: 5, geschreven: 5, fout: '' });
  s.flushAirtable = async function () { /* stuurt niets: de uitslag blijft staan */ };
  r = await entry.proef();
  toets('er wordt niets verstuurd → FOUT, ondanks een geslaagde poging van daarvóór',
    r.staat === 'FOUT' && /geen enkele uitslag/.test(r.detail),
    'gaf: ' + JSON.stringify(r));

  // EN DE ANDERE KANT VAN DAT WACHTEN: de uitslag komt wél, maar pas na een
  // paar tikken. Wie hier niet wacht keurt een werkende verbinding af, en een
  // proef die om de zoveel rit onterecht rood staat wordt genegeerd.
  opstelling({ tijd: klok, ok: true, status: 200, aantal: 2, geschreven: 2, fout: '' });
  const oud = { tijd: klok, ok: true, status: 200, aantal: 2, geschreven: 2, fout: '' };
  let beurten = 0;
  s.flushAirtable = async function () { /* verstuurt wel, maar traag */ };
  s.plLiveLogStatus = function () {
    beurten++;
    return beurten > 3 ? { tijd: klok + 5, ok: true, status: 200, aantal: 2, geschreven: 2, fout: '' }
                       : Object.assign({}, oud);
  };
  r = await entry.proef();
  toets('een trage verzending wordt afgewacht in plaats van te vroeg afgekeurd',
    r.staat === 'ok', 'gaf: ' + JSON.stringify(r) + ' — na ' + beurten + ' keer kijken');

  opstelling({ tijd: klok, ok: true, status: 200, aantal: 1, geschreven: 1, fout: '' });
  s.plLiveLogStatus = undefined;
  r = await entry.proef();
  toets('zonder plLiveLogStatus → FOUT en niet stilletjes groen',
    r.staat === 'FOUT' && /plLiveLogStatus/.test(r.detail),
    'gaf: ' + JSON.stringify(r));

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van de ' + n + ' controles'
                            : 'goed: alle ' + n + ' controles') + '\n');
  process.exit(fout ? 1 : 0);
}
