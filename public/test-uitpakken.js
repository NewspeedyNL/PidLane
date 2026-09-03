// ══════════════════════════════════════════════════════════════════
// test-uitpakken.js — één plek pakt een mode-01-antwoord uit (#116)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// splitBatchResponse() is de plek waar een antwoord in stukken valt én waar
// de meetkwaliteit geteld wordt. Wie er zelf omheen gaat met een eigen
// indexOf('41…') meet niet mee — dat is letterlijk hoe één pad in
// pidlane-diagbundel.js maandenlang buiten de telling viel.
//
// Op 03-09-2026 deden acht plekken over vijf modules dat nog. Bij het naar de
// helper trekken bleken het er meer: pidlane-testrun.js en
// pidlane-voertuigdata.js stonden niet eens in de lijst die blok 11 aflíep.
//
// Wat hier getoetst wordt is niet "roept hij de helper aan" maar of de
// decoders na die verhuizing nog dezelfde getallen geven — en dan met
// antwoordvormen die de eigen indexOf-lussen NIET aankonden: een 29-bits
// CAN-header, framemarkers midden in de regel, ISO-TP-padding erachteraan.
// Precies daarvoor is de helper er.
//
// De bron wordt geladen, niet nagebouwd. Een test met een eigen kopie van de
// decoder kan per definitie niet rood worden.
//
// Draaien vanuit public/:  node test-uitpakken.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0;
function toets(naam, gemeten, verwacht) {
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (ok) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + ' — kreeg ' + JSON.stringify(gemeten) + ', verwacht ' + JSON.stringify(verwacht)); }
}

const lees = n => fs.readFileSync(__dirname + '/' + n, 'utf8');

// Knip een stuk uit een bronbestand met ankers die de test laten stoppen als
// ze verdwijnen. Zelfde afspraak als in test-parser.js: een anker dat niet
// meer past is een fout, geen reden om stilletjes minder te toetsen.
function knip(bron, van, tot, wat) {
  const a = bron.indexOf(van);
  if (a < 0) throw new Error('anker "' + van + '" niet gevonden (' + wat + ')');
  const b = bron.indexOf(tot, a);
  if (b < 0) throw new Error('eindanker "' + tot + '" niet gevonden (' + wat + ')');
  return bron.slice(a, b);
}

// ── de sandbox: de echte meetketen, en verder zo min mogelijk ──
function bouw() {
  const s = { console: { warn() {}, error() {}, log() {} }, JSON, Math, Object, Array, String, Number, Set, isNaN, isFinite, parseInt, parseFloat };
  s.window = s;
  vm.createContext(s);
  // De bytelengtetabel uit de app zelf. Een eigen tabelletje hier zou toetsen
  // dat de test klopt, niet dat de app klopt.
  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });
  // pidByteLen woont in pidlane-rijsituatie.js, en die module hangt de halve
  // app aan het scherm. Zelfde afweging (en zelfde regel) als in test-parser.js.
  vm.runInContext(`
    function pidByteLen(sfx){
      var t=String(sfx).toUpperCase();
      try{ var g=window.PLPidLen && window.PLPidLen.lengte(t); if(g) return g; }
      catch(e){ /* stil: PLPidLen is in deze test geen bron */ }
      return PID_BYTE_LEN[t]||1;
    }
  `, s, { filename: 'sandbox-omgeving' });
  vm.runInContext(knip(lees('pidlane-diagbundel.js'), 'function splitBatchResponse', 'function parsePID', 'parser'),
    s, { filename: 'pidlane-diagbundel.js (knip)' });
  return s;
}

console.log('PLBus-loze meetketen — wie pakt een 41-antwoord uit (#116)\n');

// ══════════════════════════════════════════════════════════════════
// 1. veldlab — _svReadiness() op een ruwe 0101
// ══════════════════════════════════════════════════════════════════
console.log('── _svReadiness (pidlane-veldlab.js) ──');
{
  const s = bouw();
  vm.runInContext(knip(lees('pidlane-veldlab.js'), 'function _svReadiness', 'const _SV_FUELTYPES', 'readiness'),
    s, { filename: 'pidlane-veldlab.js (knip)' });
  const lees01 = r => vm.runInContext('_svReadiness(' + JSON.stringify(r) + ')', s);

  // A=0x83 → MIL aan, 3 codes. B=0x07 → misfire/brandstof/componenten
  // aanwezig, alle drie gereed (de hoge nibble staat op 0).
  const kaal = lees01('41 01 83 07 E5 00');
  toets('MIL en telling uit byte A', [kaal.mil, kaal.dtcCount], [true, 3]);
  toets('drie continue monitors, alle gereed', kaal.monitors.slice(0, 3),
    [{ monitor: 'Misfire', gereed: true }, { monitor: 'Brandstofsysteem', gereed: true }, { monitor: 'Componenten', gereed: true }]);
  toets('vonkontsteking bij B-bit 3 uit', kaal.ontsteking, 'vonk (benzine)');

  // DEZELFDE bytes, maar in de vormen waar de eigen indexOf-lus op stukliep.
  // Dit is de reden dat dit door de helper hoort te lopen: 18DA-header en
  // framemarkers kende die lus niet.
  toets('zelfde uitkomst met 29-bits CAN-header',
    lees01('18DAF110 06 41 01 83 07 E5 00'), kaal);
  toets('zelfde uitkomst met framemarkers in de regel',
    lees01('006 0:410183 1:07E500'), kaal);
  toets('zelfde uitkomst met 11-bits header',
    lees01('7E8 06 41 01 83 07 E5 00'), kaal);

  toets('NO DATA geeft niets', lees01('NO DATA'), null);
  toets('half antwoord geeft niets', lees01('41 01 83'), null);

  // Diesel: B-bit 3 aan → compressieontsteking en de diesel-monitornamen.
  const d = lees01('41 01 00 0F 20 00');
  toets('B-bit 3 maakt het een diesel', d.ontsteking, 'compressie (diesel)');
  toets('en dan heten de monitors anders', d.monitors.map(m => m.monitor).indexOf('Roetfilter (DPF)') >= 0, true);
}

// ══════════════════════════════════════════════════════════════════
// 2. verify — _decode() op een focus-sample
// ══════════════════════════════════════════════════════════════════
console.log('\n── PLVerify._decode (pidlane-verify.js) ──');
{
  const s = bouw();
  // Alleen de decoder, als los object: de rest van de module praat met de bus.
  vm.runInContext('var V = { ' + knip(lees('pidlane-verify.js'), '  _decode(pid, r){', '  _log(msg,lvl)', 'decoder') + ' };',
    s, { filename: 'pidlane-verify.js (knip)' });
  const dec = (pid, r) => vm.runInContext('V._decode(' + JSON.stringify(pid) + ',' + JSON.stringify(r) + ')', s);

  toets('toerental uit twee bytes', dec('010C', '41 0C 0B 95'), 741);
  toets('snelheid uit één byte', dec('010D', '41 0D 3C'), 60);
  toets('koelwater met de -40 offset', dec('0105', '41 05 84'), 92);
  toets('gasklep in procenten', dec('0111', '41 11 40'), 25);

  // En weer: dezelfde bytes in de vormen die de eigen lus niet aankon.
  toets('toerental met CAN-header', dec('010C', '7E8 04 41 0C 0B 95'), 741);
  toets('toerental met framemarkers', dec('010C', '004 0:410C 1:0B95'), 741);
  // Padding achter het antwoord: de ECU zegt vier bytes, de rest is vulling.
  // Zonder de lengte-indicator zou 0x00 als tweede databyte gelezen kunnen
  // worden — met de helper niet.
  toets('padding erachter verandert niets', dec('010D', '7E8 03 41 0D 3C 00 00 00 00'), 60);

  toets('NO DATA geeft niets', dec('010C', 'NO DATA'), null);
  toets('een antwoord op een ánder PID geeft niets', dec('010C', '41 0D 3C'), null);
}

// ══════════════════════════════════════════════════════════════════
// 3. de bytelengte die eronder ligt
// ══════════════════════════════════════════════════════════════════
console.log('\n── de tabel eronder ──');
{
  const s = bouw();
  // A6 (odometer) stond niet in PID_BYTE_LEN. Zolang veldlab dat PID zelf
  // uitpakte viel dat niet op; door de helper is die ene byte het verschil
  // tussen 248.000 km en 24 km.
  toets('A6 is vier bytes lang', vm.runInContext('PID_BYTE_LEN["A6"]', s), 4);
  toets('en de helper geeft die vier ook terug',
    vm.runInContext('splitBatchResponse("41 A6 00 25 D7 90", ["01A6"])', s), { '01A6': [0x00, 0x25, 0xD7, 0x90] });
  toets('brandstoftype is één byte',
    vm.runInContext('splitBatchResponse("41 51 04", ["0151"])', s), { '0151': [4] });
}

// ══════════════════════════════════════════════════════════════════
// 4. en blijft het bij ÉÉN plek?
// ══════════════════════════════════════════════════════════════════
// Alles hierboven blijft groen als er morgen ergens een nieuwe eigen
// indexOf('41…') bijkomt: die toetst zichzelf niet. Dit is de enige toets die
// dat merkt. Blok 11 van de testrun telt hetzelfde in de draaiende app; hier
// staat het als poort vóór de commit.
console.log('\n── en blijft het bij één plek? ──');
{
  // De helper zelf telt niet mee: dát indexOf('41') IS het uitpakken.
  const helperBron = lees('pidlane-diagbundel.js');
  const a = helperBron.indexOf('function splitBatchResponse');
  const b = helperBron.indexOf('window.plMeetPidLengte', a);
  toets('de ankers om de parser heen bestaan nog', a >= 0 && b > a, true);

  const eigen = fs.readdirSync(__dirname)
    .filter(f => /^pidlane-.*\.js$/.test(f))
    .map(f => {
      let bron = lees(f);
      if (f === 'pidlane-diagbundel.js') bron = bron.slice(0, a) + bron.slice(b);
      // Regels die met // of * beginnen zijn commentaar: een zin ÓVER een
      // aanroep is de aanroep niet.
      const code = bron.split('\n').filter(r => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');
      const n = (code.match(/indexOf\(\s*['"]41/gi) || []).length;
      return n ? f.replace('pidlane-', '').replace('.js', '') + '(' + n + ')' : null;
    })
    .filter(Boolean);
  toets('geen enkele module pakt zelf een 41-header uit', eigen, []);
}

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
