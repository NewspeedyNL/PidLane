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

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
