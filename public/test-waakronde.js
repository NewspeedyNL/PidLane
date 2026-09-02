// ══════════════════════════════════════════════════════════════════
// test-waakronde.js — oordeelvorming en kandidaatselectie, op de échte module
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST OPNIEUW GESCHREVEN IS (02-09-2026)
//
// Tot vandaag stond hier een rooktest die geen enkele regel uit
// `pidlane-waakronde.js` laadde. `antwoordHerkend()`, `beoordeel()`,
// `kandidaten()` en de gezien/negeer-boekhouding waren allemaal in de test
// zelf overgeschreven. Zo'n test kan per definitie niet rood worden: hij
// toetst de kopie, niet de code. Bewezen op 02-09: de `NO DATA`-poort in
// `antwoordHerkend()` (regel 172) is vervangen door `if(false)` en deze
// test bleef groen.
//
// Erger was wat de kopie stilhield. Zij rekende met een verzonnen tabel
// `HARD={'0105':{min:-20,max:130}}`, en concludeerde daaruit dat koelwater
// van 215 °C een bevinding is. In de app staat `PID_HARD_LIMITS['0105']` op
// -40…215, dus 215 °C is daar een doodnormale meting — en méér dan 215 kan
// er uit één byte niet komen. De kernbewering van de oude test ("een sensor
// die 215 °C meldt is een BEVINDING, geen stilte") werd dus bevestigd door
// een geval dat in de werkelijkheid niet bestaat, terwijl de gevallen die
// wél voorkomen — inlaatdruk onder de 2 kPa, boordspanning onder de 4 V —
// nooit langs een test kwamen.
//
// HOE ER NU GETOETST WORDT
// De hele keten eronder is echt: `pidlane-data.js` levert de tabellen,
// pidlane-datalog.js laag 1 t/m 3, pidlane-diagbundel.js de parser, en
// daar bovenop draait `pidlane-waakronde.js` zelf. `PLWaak._beoordeel` en
// `PLWaak._kandidaten` staan niet voor niets in de export: dat zijn de
// haken die deze module aanbiedt. Alleen de DOM en de log zijn nep.
//
// De baseline-logica ("leren van normaal") die hier vroeger in kopie stond
// hoort niet bij deze module maar bij `pidlane-pids.js`, en wordt sinds
// 02-09 getoetst in test-baseline.js — daar op de echte functie.
//
// Draaien vanuit public/:  node test-waakronde.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function t(naam, gemeten, verwacht) {
  if (String(gemeten) === String(verwacht)) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + gemeten + ', wilde ' + verwacht); }
}

function lees(f) { return fs.readFileSync(__dirname + '/' + f, 'utf8'); }
function knip(bron, van, tot, naam) {
  const a = bron.indexOf(van), b = tot ? bron.indexOf(tot) : bron.length;
  if (a < 0 || b < a) { console.error('FOUT: knipbereik "' + naam + '" niet gevonden'); process.exit(1); }
  return bron.slice(a, b);
}

// ── de sandbox: alles echt behalve scherm en log ──────────────────
function bouw() {
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  s.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
  const el = () => ({
    style: {}, classList: { add() { }, remove() { }, contains: () => false, toggle() { } },
    dataset: {}, textContent: '', children: [], innerHTML: '',
    appendChild() { }, removeChild() { }, remove() { },
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() { }, setAttribute() { }, getAttribute: () => null,
    insertAdjacentHTML() { }
  });
  s.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: el, addEventListener() { }, body: el()
  };
  s.addEventListener = () => { }; s.removeEventListener = () => { };
  s.navigator = {};
  s.setTimeout = () => 0; s.setInterval = () => 0;
  s.clearInterval = () => { }; s.clearTimeout = () => { };
  vm.createContext(s);

  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });
  vm.runInContext(`
    var pidVals={}, pidHist={}, pidSmooth={}, stabilityCount={}, dataStable=false;
    var activePIDs=new Set(), supportedPIDs=new Set(), discoveredPIDDefs=[], _logs=[];
    function log(m,niveau){ _logs.push({m:String(m), niveau:niveau||'info'}); }
    function logToSheets(){}
    function fv(v){ return String(v); }
    function getPidDef(pid){ return (discoveredPIDDefs.find(d=>d.pid===pid))||ALL_PID_DEFS[pid]||null; }
    function pidByteLen(x){ var k=String(x).toUpperCase(); return PID_BYTE_LEN[k]||1; }
    // De twee zeven die kandidaten() raadpleegt. Hier expres eenvoudig: wat
    // getoetst wordt is dát waakronde ze gebruikt, niet wat ze zelf beslissen
    // (die hebben hun eigen tests: test-pidgate.js en test-piddefs.js).
    function pidIsTekst(p){ return p==='0151'; }
    function pidGate(p, trede){ return p!=='0146'; }
  `, s, { filename: 'sandbox-omgeving' });

  vm.runInContext(knip(lees('pidlane-datalog.js'), 'let outlierCount={};', 'function startDatalog', 'meetketen'),
    s, { filename: 'pidlane-datalog.js (knip)' });
  vm.runInContext(knip(lees('pidlane-diagbundel.js'), 'function splitBatchResponse', 'window.plMeetPidLengte', 'parser'),
    s, { filename: 'pidlane-diagbundel.js (knip)' });
  vm.runInContext(lees('pidlane-waakronde.js'), s, { filename: 'pidlane-waakronde.js' });

  if (!s.PLWaak || !s.PLWaak._beoordeel || !s.PLWaak._kandidaten) {
    console.error('FOUT: PLWaak._beoordeel/_kandidaten ontbreken — is de export gewijzigd?');
    process.exit(1);
  }
  return s;
}

// ══════════════════════════════════════════════════════════════════
console.log('\n— heeft de ECU geantwoord —');
{
  const s = bouw(), B = s.PLWaak._beoordeel;
  // antwoordHerkend() zit niet in de export; hij is zichtbaar doordat een
  // niet-herkend antwoord 'stil' oplevert en een herkend antwoord nooit.
  t('mode 01 header herkend', B('0105', '41 05 5A').staat !== 'stil', true);
  t('mode 21 header herkend', B('2101', '61 01 7B').staat !== 'stil', true);
  t('NO DATA is stil', B('0105', 'NO DATA').staat, 'stil');
  t('BUS ERROR is stil', B('0105', 'BUS ERROR').staat, 'stil');
  t('SEARCHING is stil', B('0105', 'SEARCHING...').staat, 'stil');
  t('leeg antwoord is stil', B('0105', '').staat, 'stil');
  t('vraagteken is stil', B('0105', '?').staat, 'stil');
  t('antwoord van een ánder PID is stil', B('0105', '410C1AF8').staat, 'stil');
  t('reden bij stilte benoemd', B('0105', 'NO DATA').reden, 'geen antwoord');

  // DE GEVALLEN DIE DE POORT ECHT NODIG MAKEN.
  // "NO DATA" alleen bewijst niets: daar zit toch al geen geldige header in,
  // dus de header-controle eronder zou hem óók afkeuren. Pas als er een
  // foutwoord én iets dat op data lijkt in dezelfde regel staan, is zichtbaar
  // of de tekstpoort werkelijk iets doet. Zo antwoordt een ELM327 ook echt:
  // hij begint met SEARCHING en breekt af met STOPPED als de bus wegvalt.
  t('SEARCHING met data erachter is stil', B('0105', 'SEARCHING...41055A').staat, 'stil');
  t('data met STOPPED erachter is stil', B('0105', '41055A STOPPED').staat, 'stil');
  t('data met BUS ERROR erachter is stil', B('0105', '41055A\rBUS ERROR').staat, 'stil');
}

console.log('\n— oordeel over een meting die er wél is —');
{
  const s = bouw(), B = s.PLWaak._beoordeel;
  t('koelwater 90 °C is ok', B('0105', '410582').staat, 'ok');
  t('en de waarde klopt', B('0105', '410582').v, 90);
  t('toerental 678 rpm is ok', B('010C', '410C0A98').staat, 'ok');
  t('inlaatdruk 50 kPa is ok', B('010B', '410B32').staat, 'ok');
  t('boordspanning 14.4 V is ok', B('0142', '41423840').v, 14.4);

  // De marge van 2 %: de grenzen in ALL_PID_DEFS zijn weergavebereiken, geen
  // alarmdrempels. Toerental-def loopt tot 8000, marge is dus 160 rpm.
  t('8004 rpm valt binnen de marge', B('010C', '410C7D10').staat, 'ok');
  t('8200 rpm valt erbuiten', B('010C', '410C8020').staat, 'let');
  t('en heet dan boven verwacht bereik', B('010C', '410C8020').reden, 'boven verwacht bereik');
}

console.log('\n— fysiek onmogelijk is een BEVINDING, geen stilte —');
{
  // Dit is de kern van de module, en nu op gevallen die écht kunnen optreden.
  // PID_HARD_LIMITS['010B'] = 2..255: een MAP-sensor die 0 kPa meldt is stuk
  // of losgekoppeld, en dat moet je zien.
  const s = bouw(), B = s.PLWaak._beoordeel;
  t('inlaatdruk 0 kPa is een bevinding', B('010B', '410B00').staat, 'let');
  t('en de reden is benoemd', B('010B', '410B00').reden, 'buiten fysiek bereik');
  t('inlaatdruk 1 kPa ook', B('010B', '410B01').staat, 'let');
  t('boordspanning 0 V is een bevinding', B('0142', '414200').staat, 'let');
  t('ontsteking -64° is een bevinding', B('010E', '410E00').staat, 'let');

  t('een bevinding is iets anders dan stilte',
    B('010B', '410B00').staat !== B('010B', 'NO DATA').staat, true);
  t('een bevinding houdt geen waarde vast', B('010B', '410B00').v, undefined);
}

console.log('\n— de grens van de tabel is de grens van het oordeel —');
{
  // Wat de oude kopie niet kon zien: 0105 kan uit één byte nooit boven zijn
  // harde limiet komen (0xFF - 40 = 215 = precies max). Dat vast te leggen is
  // waardevoller dan het te verzinnen — verandert de tabel, dan valt het op.
  const s = bouw(), B = s.PLWaak._beoordeel;
  t('koelwater 215 °C haalt de harde limiet net', B('0105', '4105FF').staat, 'ok');
  t('en wordt dus als waarde gemeld', B('0105', '4105FF').v, 215);
  const logs = s.lezen ? '' : vm.runInContext('_logs.map(function(x){return x.m;}).join(" | ")', s);
  t('maar laag 1b meldt hem wel als opvallend',
    /buiten het gebruikelijke bereik/.test(logs), true);
}

console.log('\n— kandidaatselectie: alleen wat je NIET al volgt —');
{
  const s = bouw();
  vm.runInContext(`
    supportedPIDs = new Set(['010C','0105','015C','0151','0146','01ZZ']);
    activePIDs    = new Set(['010C']);
  `, s);
  const k = s.PLWaak._kandidaten();
  t('een PID die al in beeld staat valt af', k.includes('010C'), false);
  t('een tekst-PID valt af', k.includes('0151'), false);
  t('een PID die de gate weigert valt af', k.includes('0146'), false);
  t('een PID zonder definitie valt af', k.includes('01ZZ'), false);
  t('de rest blijft over', k.join(','), '0105,015C');
}

console.log('\n— gezien, negeer en herstel —');
{
  const s = bouw(), W = s.PLWaak;
  t('schoon begin', W.genegeerd().length, 0);

  W.gezien('0105');
  t('gezien komt niet in de negeerlijst', W.genegeerd().length, 0);

  W.negeer('0142');
  t('negeer komt er wel in', W.genegeerd().join(','), '0142');
  const logs = vm.runInContext('_logs.map(function(x){return x.m;}).join(" | ")', s);
  t('negeren wordt gemeld in de log', /genegeerd voor deze sessie/.test(logs), true);

  W.negeer('010B');
  t('twee genegeerd', W.genegeerd().sort().join(','), '010B,0142');

  W.herstel('0142');
  t('herstel haalt er één terug', W.genegeerd().join(','), '010B');

  W.herstel();
  t('herstel zonder pid maakt alles leeg', W.genegeerd().length, 0);
}

console.log('\n— de statusregel noemt de juiste reden —');
{
  // Deze teksten zitten in teken(), midden in de HTML-opbouw, en zijn zonder
  // een volledige DOM niet aan te roepen. Daarom hier op de bron — mét de
  // reden erbij, zoals de werkregel vraagt. Wat het bewaakt is het
  // onderscheid dat één keer fout is gegaan: een rustreden mag niet naar de
  // bus wijzen als de bus er niets mee te maken heeft.
  const bron = lees('pidlane-waakronde.js');
  const van = bron.indexOf('demo:');
  const tot = bron.indexOf('}', van);
  if (van < 0 || tot < 0) { console.error('FOUT: rustreden-tabel niet gevonden'); process.exit(1); }
  const tabel = bron.slice(van, tot);
  t('demo noemt demomodus', /demo:\s*'niet beschikbaar in demomodus'/.test(tabel), true);
  t('druk noemt de bus', /druk:\s*'bus is druk/.test(tabel), true);
  t('bezet noemt het busslot', /bezet:\s*'wacht op het busslot/.test(tabel), true);
  t('demo noemt de bus NIET', /demo:\s*'[^']*bus/.test(tabel), false);
  t('losgekoppeld noemt de bus NIET', /losgekoppeld:\s*'[^']*bus/.test(tabel), false);
}

console.log('\n─────────────────────────────────────────');
console.log(ok + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
