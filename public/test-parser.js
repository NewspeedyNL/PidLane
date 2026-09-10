// ══════════════════════════════════════════════════════════════════
// test-parser.js — de meetketen, van ruwe ELM-bytes tot meetwaarde
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// §20 noemt `splitBatchResponse()`, `parsePID()` en `applyParsedBytes()`
// "de parser waar de hele app op draait", en `validateAndSmooth()`,
// `markOutlier()` en `checkStability()` "laag 1 t/m 3 van de meetketen".
// Tot vandaag stond er geen enkele test op. Dat is meetbaar: op 02-09-2026
// zijn er vier fouten in geplant — een off-by-one in de header-echo van
// parsePID, de harde limiet van validateAndSmooth uitgezet, en twee
// varianten daarop — en de volledige reeks van 65 tests bleef groen met
// "Alles goed — veilig om te committen". Elke push naar main is deployen,
// dus dat is de gate die er niet was.
//
// Een fout hier is bovendien de duurste soort: hij levert geen crash op maar
// een plausibel getal. §11 staat vol met precies dat patroon — "0107
// gesnoeid terwijl de ECU 0x82 teruggaf" kwam pas na drie rondes boven
// water, en "0111 las 0x10 i.p.v. 0x0F" was een geldige waarde die alleen
// niet de gemeten waarde was.
//
// HOE ER GETOETST WORDT
// Er wordt geen logica overgeschreven. `pidlane-data.js` wordt in zijn
// geheel in een sandbox geladen — dus met de échte PID_BYTE_LEN,
// ALL_PID_DEFS, PID_HARD_LIMITS en PID_LET_OP — en daar bovenop de échte
// functies uit pidlane-diagbundel.js en pidlane-datalog.js. Verandert een
// bytelengte of een limiet in de tabel, dan verandert deze test mee.
// Alleen de DOM, de log en de twee leerlussen (PLPidLen, PLPidVorm) zijn
// vervangen — die raken het scherm, niet de rekenkunde.
//
// Draaien vanuit public/:  node test-parser.js       (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, letop = 0, n = 0;

function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (ok) console.log('  ok    ' + naam);
  else {
    fout++;
    console.log('  FOUT  ' + naam +
      '\n        kreeg    ' + JSON.stringify(gemeten) +
      '\n        verwacht ' + JSON.stringify(verwacht));
  }
}

function waarschuw(naam, waarom) {
  letop++;
  console.log('  LET OP ' + naam + '\n         ' + waarom);
}

// ── de sandbox ────────────────────────────────────────────────────
// Alles wat de meetketen aanraakt en niet zelf is, staat hier. Blijft die
// lijst groeien, dan is dat op zichzelf een signaal: de parser hoort niet
// aan het scherm te hangen.
function lees(bestand) {
  return fs.readFileSync(__dirname + '/' + bestand, 'utf8');
}

// Knippen op een anker dat verdwijnen kan. Verdwijnt hij, dan stopt de test
// met exit 1 — een test die zijn onderwerp kwijt is mag niet groen melden.
function knip(bron, van, tot, naam) {
  const a = bron.indexOf(van);
  const b = tot ? bron.indexOf(tot) : bron.length;
  if (a < 0 || b < a) {
    console.error('FOUT: knipbereik "' + naam + '" niet gevonden — is de functie hernoemd?');
    process.exit(1);
  }
  return bron.slice(a, b);
}

function bouw() {
  const s = {};
  s.window = s;
  s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  s.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
  // De meetketen raakt de DOM alleen in markOutlier() (een badge op de tegel)
  // en checkStability() (de statustekst). Beide mogen niets teruggeven; dat
  // legt meteen vast dat de rekenkunde niet van het scherm afhangt.
  s.document = {
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({
      style: {}, classList: { add() { }, remove() { } },
      appendChild() { }, querySelector: () => null
    }),
    addEventListener() { }, body: {}
  };
  s.navigator = {};
  s.setTimeout = () => 0; s.setInterval = () => 0; s.clearInterval = () => { };
  vm.createContext(s);

  // 1. de echte tabellen
  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });

  // 2. wat de meetketen uit de rest van de app verwacht
  vm.runInContext(`
    var pidVals={}, pidHist={}, pidSmooth={}, stabilityCount={}, activePIDs=new Set();
    var dataStable=false, discoveredPIDDefs=[];
    var _logs=[];
    function log(m,niveau){ _logs.push({m:String(m), niveau:niveau||'info'}); }
    function logToSheets(){}
    function fv(v){ return String(v); }
    function getPidDef(pid){
      return (discoveredPIDDefs.find(d=>d.pid===pid)) || ALL_PID_DEFS[pid] || null;
    }
    // Uit pidlane-rijsituatie.js; hier meegegeven omdat die module de halve
    // app aan het scherm hangt en splitBatchResponse er alleen dit van nodig heeft.
    function pidByteLen(sfx){
      var t=String(sfx).toUpperCase();
      try{ var g=window.PLPidLen && window.PLPidLen.lengte(t); if(g) return g; }
      catch(e){ /* stil: PLPidLen is in deze test een teller, geen bron */ }
      return PID_BYTE_LEN[t]||1;
    }
  `, s, { filename: 'sandbox-omgeving' });

  // 3. laag 1 t/m 3 — de echte code uit pidlane-datalog.js
  vm.runInContext(
    knip(lees('pidlane-datalog.js'), 'let outlierCount={};', 'function startDatalog', 'meetketen'),
    s, { filename: 'pidlane-datalog.js (knip)' });

  // 4. de parser — de echte code uit pidlane-diagbundel.js
  vm.runInContext(
    knip(lees('pidlane-diagbundel.js'), 'function splitBatchResponse', 'window.plMeetPidLengte', 'parser'),
    s, { filename: 'pidlane-diagbundel.js (knip)' });

  s.lees = expr => vm.runInContext(expr, s);
  return s;
}

// ══════════════════════════════════════════════════════════════════
console.log('\n── splitBatchResponse: formaat A (elk PID herhaalt 41) ──');
{
  const s = bouw();
  // De i20 antwoordt zo: los blok per PID.
  toets('drie PIDs uit één batch',
    s.splitBatchResponse('410C0A98 410D00 410584', ['010C', '010D', '0105']),
    { '010C': [0x0A, 0x98], '010D': [0x00], '0105': [0x84] });

  // Zonder verwachtingslijst valt hij terug op route 2 (tabelwaardes).
  toets('route 2 zonder verwachtingslijst',
    s.splitBatchResponse('410C0A98410D00410584'),
    { '010C': [0x0A, 0x98], '010D': [0x00], '0105': [0x84] });
}

console.log('\n── splitBatchResponse: de ECU zegt nee ──');
{
  const s = bouw();
  ['NO DATA', 'UNABLE TO CONNECT', 'BUS ERROR', 'STOPPED'].forEach(r =>
    toets('"' + r + '" levert niets op', s.splitBatchResponse(r, ['010C']), {}));
  toets('leeg antwoord levert niets op', s.splitBatchResponse('', ['010C']), {});
  toets('antwoord zonder 41 levert niets op', s.splitBatchResponse('7F0112', ['010C']), {});
}

console.log('\n── splitBatchResponse: CAN-headers eraf ──');
{
  const s = bouw();
  toets('11-bit header 7E8 wordt weggeknipt',
    s.splitBatchResponse('7E8 03 41 0C 0A 98', ['010C']), { '010C': [0x0A, 0x98] });
  toets('29-bit header 18DAF110 wordt weggeknipt',
    s.splitBatchResponse('18DAF110 03 41 0C 0A 98', ['010C']), { '010C': [0x0A, 0x98] });
}

console.log('\n── splitBatchResponse: de multiframe-regel uit §11 ──');
{
  // Het geval uit het commentaar: één regel met framemarkers erin, waar de
  // oude parser alleen naar het BEGIN van de regel keek. Gevolg was dat 0107
  // wegviel terwijl de ECU 0x82 gaf. Dít is de regressie die hier vastligt.
  const s = bouw();
  const uit = s.splitBatchResponse('008 0:41430034067F 1:07820000000000', ['0143', '0107']);
  toets('0107 valt niet meer weg', Object.prototype.hasOwnProperty.call(uit, '0107'), true);
  toets('0107 houdt de byte die de ECU gaf (0x82)', uit['0107'], [0x82]);
  toets('0143 komt er ook uit', Object.prototype.hasOwnProperty.call(uit, '0143'), true);

  // Losse lengteregel op een eigen regel — mag de respons niet afkappen.
  const uit2 = s.splitBatchResponse('00E\n410C0A98410D00410584', ['010C', '010D', '0105']);
  toets('losse First-Frame lengteregel kapt niet af', Object.keys(uit2).sort(), ['0105', '010C', '010D']);
}

console.log('\n── splitBatchResponse: de Mazda-lengtes (55/56 zijn 1 byte) ──');
{
  // De tabel zegt 2 bytes, de SkyActiv geeft er 1. De backtracking-parser
  // hoort de segmentatie te kiezen die alle gevraagde PIDs verklaart.
  const s = bouw();
  toets('tabel zegt 2 bytes voor 55', s.pidByteLen('55'), 2);
  toets('0155/0156 worden tóch als 1 byte gelezen',
    s.splitBatchResponse('4155805680', ['0155', '0156']),
    { '0155': [0x80], '0156': [0x80] });

  // DE ANDERE HELFT VAN #40. De ruwe bytes uit het issue, solo, met de
  // gevraagde uitkomst erbij: 0x80 is de rauwe nul van een trimwaarde, dus
  // (128-128) x 100/128 = 0%. Dat de wáárde klopt is precies waarom dit
  // nergens opviel — 0155 leest goed terwijl de tabel er twee bytes
  // verwacht. Zonder deze toets bewijst het blok hierboven alleen dat de
  // segmentatie werkt, niet dat er de goede meetwaarde uitkomt.
  //
  // Nagemeten in de rit van 02-09 22:15: tien metingen op allebei, via batch,
  // zonder tegenspraak. De tabel blijft op 2 staan — dat is de J1979-norm,
  // waar de tweede byte de andere bank draagt — en de lerende laag wint op
  // deze auto. Dat is de keuze die het issue openliet.
  toets('en 0155 levert dan 0% op (de ruwe bytes uit #40)',
    s.parsePID('0155', '415580'), 0);
  toets('0156 net zo', s.parsePID('0156', '415680'), 0);
}

console.log('\n── splitBatchResponse: terugkoppeling naar PLPidLen ──');
{
  // Alleen leren van een parse die álles verklaart én exact op de opgegeven
  // lengte eindigt — anders bevestigt de parser zijn eigen ruis.
  const s = bouw();
  const gemeld = [];
  s.PLPidLen = { lengte: () => 0, melden: (p, len, bron) => gemeld.push(p + ':' + len + ':' + bron) };
  s.splitBatchResponse('00A 0:410C0A98410D 1:00410584000000', ['010C', '010D', '0105']);
  toets('een sluitende batch wordt gemeld', gemeld, ['0C:2:batch', '0D:1:batch', '05:1:batch']);

  const gemeld2 = [];
  s.PLPidLen = { lengte: () => 0, melden: (p, len, bron) => gemeld2.push(p + ':' + len + ':' + bron) };
  s.splitBatchResponse('410C0A98', ['010C', '010D', '0105']);   // twee PIDs missen
  toets('een onvolledige batch leert niets', gemeld2, []);
}

console.log('\n── parsePID: de header-echo overslaan ──');
{
  const s = bouw();
  // 0x5A = 90, min 40 = 50 °C. Eén nibble verschuiving geeft hier een geldig
  // maar verkeerd getal — precies waarom dit met een gewoon log niet te zien is.
  toets('koelwater 41055A wordt 50 °C', s.parsePID('0105', '41 05 5A'), 50);
  toets('toerental 410C0A98 wordt 678 rpm', s.parsePID('010C', '410C0A98'), 678);
  toets('snelheid 410D50 wordt 80 km/h', s.parsePID('010D', '410D50'), 80);
  // Met echo-ruis ervoor moet hij nog steeds op de juiste header aanhaken.
  toets('header wordt gezocht, niet geteld', s.parsePID('0105', '0105\r41055A'), 50);
}

console.log('\n── parsePID: wat er geen waarde is ──');
{
  const s = bouw();
  ['NO DATA', 'BUS ERROR', 'UNABLE TO CONNECT', '?', ''].forEach(r =>
    toets('"' + r + '" geeft null', s.parsePID('0105', r), null));
  toets('te kort geeft null', s.parsePID('0105', '41'), null);
}

console.log('\n── applyParsedBytes: dezelfde waarde uit losse bytes ──');
{
  const s = bouw();
  toets('toerental uit bytes', s.applyParsedBytes('010C', [0x0A, 0x98]), 678);
  toets('koelwater uit bytes', s.applyParsedBytes('0105', [0x5A]), 50);
  toets('lege bytes geven null', s.applyParsedBytes('010C', []), null);
  toets('geen bytes geeft null', s.applyParsedBytes('010C', null), null);

  // De structuurdetector moet de RUWE bytes zien, vóór het parsen.
  const gezien = [];
  s.PLPidVorm = { zie: (pid, b) => gezien.push(pid + ':' + b.join(',')) };
  s.applyParsedBytes('016D', [0x01, 0x02, 0x03]);
  toets('PLPidVorm krijgt de ruwe bytes', gezien, ['016D:1,2,3']);
}

console.log('\n── laag 1: harde fysieke limieten ──');
{
  const s = bouw();
  // PID_HARD_LIMITS['0105'] = -40..215
  toets('koelwater 300 °C wordt geweigerd', s.validateAndSmooth('0105', 300), null);
  toets('koelwater -60 °C wordt geweigerd', s.validateAndSmooth('0105', -60), null);
  toets('koelwater 90 °C mag door', s.validateAndSmooth('0105', 90), 90);
  // Verse instantie, en dat is sinds #158 nodig: 0105 loopt nu ook door laag 3,
  // dus een tweede waarde in dezelfde reeks komt er GEMIDDELD uit (90 en 215
  // geven 152,5). Dat is precies het gedrag dat #158 aanzette; het maakt deze
  // laag-1-grens alleen onmeetbaar in dezelfde reeks. Los meten dus.
  toets('koelwater precies op 215 mag door', bouw().validateAndSmooth('0105', 215), 215);
  toets('boordspanning 2V wordt geweigerd', s.validateAndSmooth('0142', 2), null);
  toets('boordspanning 14.2V mag door', s.validateAndSmooth('0142', 14.2), 14.2);
  toets('null blijft null', s.validateAndSmooth('0105', null), null);
  toets('NaN blijft null', s.validateAndSmooth('0105', NaN), null);

  // Een geweigerde waarde hoort geteld te worden, niet stil te verdwijnen.
  const t = s.lees('outlierCount["0105"]||0');
  toets('een geweigerde waarde is geteld', t > 0, true);
}

console.log('\n── laag 1b: opvallend maar echt (melden, niet weggooien) ──');
{
  const s = bouw();
  // PID_LET_OP['0105'] = -15..110, hard = -40..215. 120 valt ertussen.
  const v = s.validateAndSmooth('0105', 120);
  toets('koelwater 120 °C blijft staan', v, 120);
  const logs = s.lees('_logs.map(function(x){return x.m;}).join(" | ")');
  toets('en wordt gemeld', /buiten het gebruikelijke bereik/.test(logs), true);
  toets('de melding is geen waarschuwing maar info',
    s.lees('_logs.filter(function(x){return /gebruikelijke bereik/.test(x.m);})[0].niveau'), 'info');
  toets('laag 1b telt hem niet als uitschieter', s.lees('outlierCount["0105"]||0'), 0);
}

console.log('\n── na laag 1b houdt de keten op: geen filter, geen middeling ──');
{
  /* HIER STONDEN TWEE BLOKKEN OVER LAAG 2+3, EN DIE LAGEN ZIJN WEG (10-09-2026).

     De korte geschiedenis, want die verklaart waarom deze toets omgekeerd is
     komen te staan. FILTERED_PIDS droeg suffixen ('05') terwijl
     `FILTERED_PIDS.has(pid)` de volledige pid kreeg, vanaf de eerste commit in
     deze repo: laag 2 en 3 hebben nooit gedraaid. Op 09-09 is die sleutelvorm
     gelijkgetrokken (#158) en stonden ze één dag aan. Wat toen gemeten is staat
     in §11 van PIDLANE.md; de kern is dat de meetlus een gefilterde waarde als
     NO DATA van de ECU boekt, en dat laag 3 waarden opsloeg die de sensor niet
     kan produceren.

     Wat deze toets nu bewaakt is dus het tegenovergestelde: tussen laag 1b en
     de return staat níéts meer. Komt daar ooit weer een filter, dan wordt dit
     rood. */
  const s = bouw();
  s.pidVals['010C'] = 800;
  toets('een springend snel signaal komt er ongefilterd door',
    s.validateAndSmooth('010C', 6000), 6000);

  // Het geval waar laag 2 op vuurde: een traag signaal dat 150 °C springt.
  // Dat is nu gewoon de meting, want laag 1 laat 200 door (−40…215) en laag 1b
  // meldt hem alleen. Wie hier weer null krijgt, heeft het spike-filter terug.
  const s2 = bouw();
  s2.pidVals['0105'] = 50;
  toets('een sprong op een traag signaal wordt niet meer tegengehouden',
    s2.validateAndSmooth('0105', 200), 200);

  /* En de toets die laag 3 zou vangen. Twee metingen achter elkaar op hetzelfde
     trage signaal: met de oude middeling over twee monsters gaf de tweede
     (50+200)/2 = 125 terug. Nu hoort er tweemaal de gemeten waarde uit te komen.
     Dit is het onderscheid dat de vorige opzet niet maakte — die keek alleen
     naar null of niet-null, en had een teruggekeerde smoothing niet gezien. */
  const s3 = bouw();
  toets('de eerste meting komt onveranderd terug', s3.validateAndSmooth('0105', 50), 50);
  toets('en de tweede ook — er wordt niet gemiddeld', s3.validateAndSmooth('0105', 200), 200);

  // Meetgetrouwheid op een sensor met hele graden: koelwater komt als A−40 van
  // de ECU en kan dus geen halve graden geven. Met laag 3 sloeg de app 89,5 op.
  const s4 = bouw();
  s4.validateAndSmooth('0105', 89);
  toets('een sensor met hele graden levert geen halve graad op',
    Number.isInteger(s4.validateAndSmooth('0105', 90)), true);

  // Tegenproef op de tegenproef: laag 1 moet nog wél tegenhouden, anders zegt
  // "alles komt er ongefilterd door" niets over de keten die eronder hoort.
  const s5 = bouw();
  toets('laag 1 houdt fysiek onmogelijk koelwater nog steeds tegen',
    s5.validateAndSmooth('0105', 300), null);
}

console.log('\n── de hele keten: ruwe regel in, meetwaarde uit ──');
{
  // Wat de pollus doet: batch splitsen, dan per PID de bytes toepassen.
  const s = bouw();
  const bytes = s.splitBatchResponse('7E8 0:410C0A98410D 1:50410584000000',
    ['010C', '010D', '0105']);
  const waarden = {};
  Object.keys(bytes).forEach(p => { waarden[p] = s.applyParsedBytes(p, bytes[p]); });
  toets('toerental', waarden['010C'], 678);
  toets('snelheid', waarden['010D'], 80);
  toets('koelwater', waarden['0105'], 92);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n─────────────────────────────────────────');
console.log(n + ' controles, ' + fout + ' fout, ' + letop + ' let op');
if (fout) { console.log('test-parser: FOUT\n'); process.exit(1); }
console.log('test-parser: goed\n');
process.exit(0);
