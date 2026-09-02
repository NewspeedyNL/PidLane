// ══════════════════════════════════════════════════════════════════
// test-healthherziening.js — een geslaagde meting herziet het oordeel
// ──────────────────────────────────────────────────────────────────
// DE FOUT (#78). `_pidHealth` werd op precies twee momenten gevuld — de
// gezondheidscheck bij het verbinden, of een bewaard voertuigprofiel — en
// daarna schreef niets het oordeel ooit nog bij. initialHealthScan() doet één
// uitvraag per PID met een timeout van 1500 ms; komt daar niets uit, dan staat
// 'nodata' er voor de rest van de sessie.
//
// Dat is niet vrijblijvend. autoSelectHealthyKern() en de PID-gate draaien op
// dit oordeel, dus een sensor die één keer te traag was blijft een sessie lang
// uitgegrijsd — én het oordeel gaat mee het voertuigprofiel in, waarmee een
// toevallig misgelopen uitvraag een blijvend feit over dit voertuig wordt.
//
// Het bewijs uit de run van 01-09: blok 11 meldde "4 NIET-OK maar wél in de
// actieve selectie: 0101, 0121, 012E, 016D", terwijl blok 3 diezelfde vier in
// dezelfde run gewoon uitlas (016D is een meerframe-antwoord — de meest
// waarschijnlijke kandidaat om in 1500 ms te sneuvelen).
//
// ER ZATEN TWEE VERSCHILLENDE FOUTEN ONDER, en dat kwam pas bij het repareren
// boven water:
//
//   1. GEEN HERZIENING. 012E en 016D werden gemist door een te trage uitvraag.
//      Daarvoor is plHealthHerzien(): een geslaagde meting spreekt een
//      'nodata'/'onzin'-oordeel tegen.
//   2. EEN REGEL DIE NUL VERKEERD LAS. 0101 en 0121 zijn niet gemist — de
//      dummy-detectie in assessPidQuality zette ze actief op 'nodata'. Die
//      regel zegt: een waarde exact op het definitie-minimum in categorie
//      Temp/Emissie betekent waarschijnlijk "sensor niet aanwezig". Voor de
//      MIL-familie is nul juist het GEZONDE antwoord. Blok 14 van de testrun
//      wist dat al (MAG_STIL); de gezondheidscheck wist het tegenovergestelde.
//      Twee plekken met een tegenstrijdig oordeel over dezelfde PID — nu één
//      lijst: PID_NUL_NORMAAL in pidlane-data.js.
//
// Draaien vanuit public/:  node test-healthherziening.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const dir = __dirname;
const knip = function (bestand, start, eind) {
  const bron = fs.readFileSync(dir + '/' + bestand, 'utf8');
  const van = bron.indexOf(start);
  if (van < 0) { console.error('FOUT: "' + start + '" niet gevonden in ' + bestand); process.exit(1); }
  const tot = bron.indexOf(eind, van);
  return bron.slice(van, tot < 0 ? bron.length : tot + eind.length);
};

// ── De echte definities en de echte kwaliteitsregel ───────────────
// assessPidQuality knippen we niet los maar draaien we met de echte PID-defs
// erachter: de dummy-detectie leunt op d.min en d.cat, dus een nagemaakte def
// zou precies de vraag wegnemen die deze test stelt.
const vm = require('vm');
const win = {};
win.window = win;
win.console = { warn() {}, error() {}, log() {} };
vm.createContext(win);
// In een vm-context, niet met new Function: pidlane-data.js vult ALL_PID_DEFS
// verderop nog aan via een kale `Object.assign(ALL_PID_DEFS, …)`, en die
// verwijzing bestaat alleen als de globals ook echt globaal staan.
vm.runInContext(fs.readFileSync(dir + '/pidlane-data.js', 'utf8'), win, { filename: 'pidlane-data.js' });
const DEFS = win.ALL_PID_DEFS;
if (!DEFS || !DEFS['0101']) { console.error('FOUT: ALL_PID_DEFS niet geladen uit pidlane-data.js'); process.exit(1); }

const kwaliteitBron = fs.readFileSync(dir + '/pidlane-kwaliteit.js', 'utf8');
function maakAssess(pidHist) {
  const omg = {
    window: win,
    getPidDef: (pid) => DEFS[pid],
    PID_HARD_LIMITS: win.PID_HARD_LIMITS || {},
    PID_LET_OP: win.PID_LET_OP || {},
    pidHist: pidHist || {},
    console: { warn() {}, error() {} }
  };
  const van = kwaliteitBron.indexOf('function assessPidQuality');
  const tot = kwaliteitBron.indexOf('\n}', van) + 2;
  const maak = new Function(...Object.keys(omg),
    'function fv(x){return x;}\n' + kwaliteitBron.slice(van, tot) + '\nreturn assessPidQuality;');
  return maak(...Object.values(omg));
}

console.log('1. Nul is bij de MIL-familie het GEZONDE antwoord, geen ontbrekende sensor');
{
  const assess = maakAssess();
  ['0101', '0121', '014D'].forEach(function (pid) {
    const q = assess(pid, 0, true);
    toets(pid + ' (' + DEFS[pid].name + ') met waarde 0 is ok', q.status === 'ok',
          'oordeel: ' + q.status + ' — ' + q.reden);
  });
  toets('en de lijst staat op één plek (PID_NUL_NORMAAL)', !!(win.PID_NUL_NORMAAL && win.PID_NUL_NORMAAL['0101']),
        'PID_NUL_NORMAAL ontbreekt in pidlane-data.js');
}

console.log('\n2. TEGENPROEF — de dummy-detectie blijft wél werken');
{
  // Zonder deze helft zou "zet de hele regel uit" ook groen geven. Een
  // turbotemperatuur van -40 °C of een AdBlue-niveau van 0 hoort nog steeds
  // als niet-aanwezig gelezen te worden.
  const assess = maakAssess();
  const kandidaten = Object.keys(DEFS).filter(function (p) {
    const d = DEFS[p];
    return d && ['Temp', 'Emissie'].includes(d.cat) && [ -40, 0 ].includes(d.min) &&
           !(win.PID_NUL_NORMAAL || {})[p] && !d.bitmap;
  });
  toets('er zijn nog PIDs waarop de dummy-regel slaat', kandidaten.length > 0,
        'geen enkele kandidaat meer — dan toetst deze tegenproef niets');
  const raak = kandidaten.filter(function (p) { return assess(p, DEFS[p].min, true).status === 'nodata'; });
  toets('en die worden nog steeds als "nodata" gelezen', raak.length > 0,
        'van ' + kandidaten.length + ' kandidaten werd er geen enkele nog nodata — de regel is uitgezet in plaats van verfijnd');
}

console.log('\n3. Een geslaagde meting spreekt "nodata" tegen');
{
  const health = { '012E': 'nodata', '016D': 'nodata', '0105': 'ok', '015C': 'onzin' };
  const gelogd = [];
  const omg = {
    _pidHealth: health,
    assessPidQuality: maakAssess(),
    window: win,
    log: (m) => gelogd.push(m),
    btDiag: () => {},
    buildDiscoveredPIDList: () => {},
    refreshLegeTegels: () => {},
    setTimeout: () => 1,
    console: { warn() {} }
  };
  const src = knip('pidlane-rijsituatie.js', 'let _healthHerzienT=null;', 'window.plHealthHerzien=plHealthHerzien;');
  const herzien = new Function(...Object.keys(omg), src + '\nreturn plHealthHerzien;')(...Object.values(omg));

  toets('012E met een geldige waarde wordt ok', herzien('012E', 32.55) === 'ok' && health['012E'] === 'ok',
        'oordeel is nu: ' + health['012E']);
  toets('016D ook', herzien('016D', 7.99) === 'ok' && health['016D'] === 'ok',
        'oordeel is nu: ' + health['016D']);
  toets('en 015C ("onzin") ook, want de waarde klopt', herzien('015C', 90) === 'ok' && health['015C'] === 'ok',
        'oordeel is nu: ' + health['015C']);
  toets('het staat in het logboek', gelogd.length === 3 && /vervalt/.test(gelogd[0]),
        gelogd.length + ' regels gelogd: ' + gelogd.join(' | '));
}

console.log('\n4. Alleen naar boven, en alleen op een waarde die overtuigt');
{
  const health = { '0105': 'ok', '010C': 'twijfel', '0104': 'nodata' };
  const omg = {
    _pidHealth: health,
    assessPidQuality: maakAssess(),
    window: win,
    log: () => {}, btDiag: () => {},
    buildDiscoveredPIDList: () => {}, refreshLegeTegels: () => {},
    setTimeout: () => 1, console: { warn() {} }
  };
  const src = knip('pidlane-rijsituatie.js', 'let _healthHerzienT=null;', 'window.plHealthHerzien=plHealthHerzien;');
  const herzien = new Function(...Object.keys(omg), src + '\nreturn plHealthHerzien;')(...Object.values(omg));

  // Een 'ok' mag hier nooit slechter worden: dat oordeel hoort bij de scan en
  // bij assessPidQuality mét history, niet bij één losse meting.
  herzien('0105', 90);
  toets('een "ok" blijft ok', health['0105'] === 'ok', 'werd: ' + health['0105']);
  herzien('010C', 800);
  toets('een "twijfel" wordt niet stilletjes ok', health['010C'] === 'twijfel', 'werd: ' + health['010C']);

  // En een waarde die de meetlat niet haalt, herziet niets. 0104 is de
  // motorbelasting in procenten; 900% is fysiek onmogelijk.
  const uit = herzien('0104', 900);
  toets('een onmogelijke waarde herziet niets', uit === null && health['0104'] === 'nodata',
        'uitkomst ' + uit + ', oordeel ' + health['0104']);
  // De tegenhanger, anders zou "herzie nooit" deze toets ook halen.
  herzien('0104', 42);
  toets('een geldige waarde daarna wél', health['0104'] === 'ok', 'oordeel ' + health['0104']);
}

console.log('\n5. De aanleiding hangt aan updPID (broncontrole, met reden)');
{
  // updPID() zit in pidlane-pids.js tussen honderden globals en raakt de DOM
  // aan (applyG, drawGraph); losdraaien zou een nagebouwde app opleveren en
  // daarmee de vraag ontwijken. Wat hier telt is dat de haak er staat en op de
  // juiste plek: ná _pidLastUpd, dus op het punt waar vaststaat dat er een
  // geldige waarde binnenkwam.
  const pids = fs.readFileSync(dir + '/pidlane-pids.js', 'utf8');
  const van = pids.indexOf('function updPID(pid,val){');
  const body = pids.slice(van, pids.indexOf('\n}', van));
  toets('updPID roept plHealthHerzien aan', /plHealthHerzien\(pid,val\)/.test(body),
        'de haak ontbreekt — dan wordt er nooit iets herzien');
  toets('en doet dat ná het versheidsstempel',
        body.indexOf('_pidLastUpd[pid]') < body.indexOf('plHealthHerzien'),
        'de aanroep staat vóór het stempel');
}

console.log('\n6. De gezondheidscheck stempelt pas als het oordeel er is');
{
  // DE TWEEDE VONDST BIJ #78, gemeten in de run van 02-09 om 12:05. Blok 5
  // meldde FOUT: "019D staat als niet-ok terwijl hij meet". Dat las als een
  // herziening die niet vuurde, maar de oorzaak zat een regel eerder:
  // initialHealthScan() riep updPID() aan VOOR assessPidQuality(). updPID zet
  // `_pidLastUpd[pid]` — de versheidsbron — dus een sensor die de scan
  // vervolgens afkeurde droeg tóch het stempel "heeft in deze sessie gemeten".
  //
  // 019D (Turbo temp inlaat B) is het geval waarop dat zichtbaar werd: een
  // atmosferische motor antwoordt met 0x00, en b[0]-40 maakt daar -40 °C van
  // — exact het definitie-minimum, waar de dummy-detectie 'nodata' van maakt.
  //
  // Er wordt hier niets nagebouwd behalve het scherm: pidlane-data.js levert
  // de defs, pidlane-diagbundel.js de parser, pidlane-datalog.js laag 1 en
  // pidlane-kwaliteit.js het oordeel. Alleen updPID() is een spion — die zit
  // in pidlane-pids.js tussen de DOM (applyG, drawGraph), en wat hier telt is
  // WANNEER hij geroepen wordt, niet wat hij daarna doet. Dat hij het
  // versheidsstempel zet, toetst stap 5 hierboven op de echte bron.
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() {}, warn() {}, error() {} };
  s.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  s.document = {
    getElementById: () => null, querySelector: () => null,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, querySelector: () => null }),
    addEventListener() {}, body: {}
  };
  s.navigator = {};
  s.setTimeout = (f) => 0; s.setInterval = () => 0; s.clearInterval = () => {};
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(dir + '/pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });

  // Wat de meetketen en de scan uit de rest van de app verwachten.
  const gestempeld = {};     // pid → waarde, gevuld door de updPID-spion
  const volgorde = [];       // 'updPID:0105' / 'oordeel:0105', op volgorde
  s._spionUpd = function (pid, val) { gestempeld[pid] = val; volgorde.push('updPID:' + pid); };
  s._spionOordeel = function (pid) { volgorde.push('oordeel:' + pid); };
  s._antwoorden = {
    '0105': '410585',        // 93 °C — een gewone, geldige koelwatermeting
    '019D': '419D00',        // 0x00 → -40 °C, precies het definitie-minimum
    '0110': 'NO DATA'        // helemaal geen antwoord
  };
  vm.runInContext(`
    var pidVals={}, pidHist={}, pidSmooth={}, stabilityCount={}, activePIDs=new Set();
    var dataStable=false, discoveredPIDDefs=[];
    var demoMode=false, connected=true, supportedPIDs=new Set(['0105','019D','0110']);
    var _pidHealth={}, _healthAbort=false;
    function log(){} function logToSheets(){} function btDiag(){}
    function fv(v){ return String(v); }
    function getPidDef(pid){ return ALL_PID_DEFS[pid] || null; }
    function pidByteLen(sfx){ return PID_BYTE_LEN[String(sfx).toUpperCase()]||1; }
    function pidCmd(pid){ return '01'+pid.slice(2)+'1'; }
    async function sendCmd(cmd){
      var sfx=String(cmd).slice(2,4).toUpperCase();
      return _antwoorden['01'+sfx] || 'NO DATA';
    }
    async function withBus(naam, fn){ return await fn(); }
    function updPID(pid,val){ _spionUpd(pid,val); }
    function autoSelectHealthyKern(){} function buildDiscoveredPIDList(){} function refreshLegeTegels(){}
  `, s, { filename: 'sandbox-omgeving' });

  const lees2 = (b) => fs.readFileSync(dir + '/' + b, 'utf8');
  // meeEind=true neemt het sluitanker mee (de afsluitende accolade van een
  // functie); anders is het anker het begin van het volgende blok.
  const knip2 = function (bestand, van, tot, meeEind) {
    const bron = lees2(bestand);
    const a = bron.indexOf(van), b = bron.indexOf(tot, a);
    if (a < 0 || b < a) {
      console.error('FOUT: knipbereik "' + van + '" niet gevonden in ' + bestand + ' — is er hernoemd?');
      process.exit(1);
    }
    return bron.slice(a, meeEind ? b + tot.length : b);
  };
  vm.runInContext(knip2('pidlane-datalog.js', 'let outlierCount={};', 'function startDatalog'), s, { filename: 'pidlane-datalog.js (knip)' });
  vm.runInContext(knip2('pidlane-diagbundel.js', 'function splitBatchResponse', 'window.plMeetPidLengte'), s, { filename: 'pidlane-diagbundel.js (knip)' });
  vm.runInContext(knip2('pidlane-kwaliteit.js', 'function assessPidQuality', '\n// Bouwt een betrouwbaarheidsrapport'), s, { filename: 'pidlane-kwaliteit.js (knip)' });
  // De volgorde is de kern van deze toets, dus die wordt gemeten en niet
  // gelezen: een schil om assessPidQuality noteert wanneer het oordeel valt.
  vm.runInContext(`
    var _echteAssess = assessPidQuality;
    assessPidQuality = function(pid,val,scan){ _spionOordeel(pid); return _echteAssess(pid,val,scan); };
  `, s, { filename: 'oordeel-spion' });
  vm.runInContext(knip2('pidlane-rijsituatie.js', 'async function initialHealthScan(){', '\n}', true), s, { filename: 'pidlane-rijsituatie.js (knip)' });

  // Eerst de meetketen zelf: keurt de parser 019D goed en het oordeel af?
  // Zonder deze twee zou "de scan doet niets" ook groen geven.
  const val9D = vm.runInContext(`parsePID('019D','419D00')`, s);
  toets('019D parseert netjes tot -40 °C', val9D === -40, 'parsePID gaf ' + val9D);
  const oordeel9D = vm.runInContext(`_echteAssess('019D',-40,true).status`, s);
  toets('en de dummy-detectie keurt die -40 af', oordeel9D === 'nodata', 'oordeel: ' + oordeel9D);

  vm.runInContext(`_klaar = initialHealthScan();`, s);
  s._klaar.then(function () {
    const health = vm.runInContext('_pidHealth', s);
    toets('0105 wordt ok', health['0105'] === 'ok', 'oordeel: ' + health['0105']);
    toets('019D wordt nodata', health['019D'] === 'nodata', 'oordeel: ' + health['019D']);
    toets('0110 (NO DATA) wordt nodata', health['0110'] === 'nodata', 'oordeel: ' + health['0110']);

    toets('een goedgekeurde meting krijgt het versheidsstempel', gestempeld['0105'] === 93,
          'updPID kreeg voor 0105: ' + gestempeld['0105']);
    toets('een AFGEKEURDE meting krijgt het NIET', !('019D' in gestempeld),
          '019D staat gestempeld op ' + gestempeld['019D'] + ' terwijl het oordeel "' + health['019D'] +
          '" is — dan meldt blok 5 "staat niet-ok terwijl hij meet"');
    toets('en een NO DATA al helemaal niet', !('0110' in gestempeld),
          '0110 staat gestempeld op ' + gestempeld['0110']);

    // En de volgorde zelf, want dát is de regel: eerst oordelen, dan stempelen.
    toets('het oordeel valt vóór het stempel', volgorde.indexOf('oordeel:0105') < volgorde.indexOf('updPID:0105'),
          'volgorde: ' + volgorde.join(' → '));

    console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
    process.exit(fouten ? 1 : 0);
  }).catch(function (e) {
    console.log('  FOUT initialHealthScan klapte — ' + (e && e.message));
    process.exit(1);
  });
}

