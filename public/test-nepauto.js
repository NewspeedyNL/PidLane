// ═══════════════════════════════════════════════════════════════════
// test-nepauto.js — de virtuele ELM327 zelf (#541)
// ───────────────────────────────────────────────────────────────────
// bproef-merken.js laat de app tegen zestien nagebouwde auto's verbinden.
// Dat zegt alleen iets als de nepauto antwoordt zoals een echte ELM327 met
// een echte auto erachter. Hier wordt dat getoetst, op twee manieren:
//   • tegen de ELM327-datasheet: ISO-TP met en zonder headers, 29-bit
//     koppen, KWP-kop met checksum, drie codes per mode-03-bericht op
//     niet-CAN, SEARCHING..., BUS INIT, de foutmelding bij een verkeerd
//     protocol, het antwoordcijfer achteraan.
//   • tegen de échte Auris-opname: de bitmap die PLNepAuto uit de PID-lijst
//     berekent moet de opgenomen 0100 van de auto zelf opleveren.
// Met tegenproeven: een kapotte bitmap en een vergeten opvulbyte worden rood.
//
// Draaien vanuit public/:  node test-nepauto.js
// ═══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const BRON = fs.readFileSync(__dirname + '/nepauto.js', 'utf8');
function laad(bron) {
  const c = { console };
  c.window = c; vm.createContext(c);
  vm.runInContext(bron, c, { filename: 'nepauto.js' });
  return c.PLNepAuto;
}
const N = laad(BRON);
const P = require('./nepauto-profielen.js');
const prof = (id) => P.find((p) => p.id === id);
const lijn = (a, c) => a.stuur(c).tekst;
function klaar(id, extra) {
  const a = N.maak(prof(id));
  ['ATE0', 'ATS1', 'ATH0', 'ATSP0'].concat(extra || []).forEach((c) => a.stuur(c));
  return a;
}

console.log('\n1. Elk profiel bouwt, met een bron en een bestaand protocol');
P.forEach(function (p) {
  let a = null, e = '';
  try { a = N.maak(p); } catch (x) { e = x.message; }
  // Een EV biedt er weinig: de Niro EV heeft er in OBDb vijf (01 21 30 31 5B).
  waar(p.id + ': bouwt (' + (a ? a.pids().length : 0) + ' PIDs)', a && a.pids().length >= (p.brandstof === 'elektrisch' ? 4 : 15), e);
  waar(p.id + ': bron en protocol', /\S/.test(p.bron) && !!N.PROTO_NAAM[p.proto], p.bron + ' / ' + p.proto);
});
waar('minstens twintig auto\'s, vier protocolsoorten, elke brandstof', P.length >= 20 && new Set(P.map((p) => p.proto)).size === 4 && ['benzine', 'diesel', 'hybride', 'elektrisch'].every((b) => P.some((p) => p.brandstof === b)));

console.log('\n2. De bitmap tegen de échte Auris-opname');
// Opgenomen van de auto (ELM327-emulator, scenario car): 41 00 BE 3F A8 13.
const auris = klaar('auris');
waar('0100 = de opgenomen BE 3F A8 13', lijn(auris, '0100').split('\r')[1] === '41 00 BE 3F A8 13', JSON.stringify(lijn(auris, '0100')));
waar('de opgenomen waarde komt terug: 010C = 41 0C 14 5F', lijn(auris, '010C') === '41 0C 14 5F', lijn(auris, '010C'));
waar('0601 is de opgenomen meerframe (19 bytes)', /^013\r0: 46 01 8E 0B 02 27/.test(lijn(auris, '0601')), JSON.stringify(lijn(auris, '0601')));
// TEGENPROEF: een bitmap die bij 1 begint te tellen in plaats van bij 0.
const scheef = laad(BRON.replace('const p = hx(basis + i);', 'const p = hx(basis + i - 1);'));
const sa = scheef.maak(prof('auris')); ['ATE0', 'ATH0', 'ATSP0'].forEach((c) => sa.stuur(c));
waar('TEGENPROEF: een verschoven bitmap wijkt af van de opname', sa.stuur('0100').tekst.split('\r')[1] !== '41 00 BE 3F A8 13');

console.log('\n3. CAN 11-bit: meerdere ECU\'s, ISO-TP, headers');
const golf = klaar('golf16');
const eerste = lijn(golf, '0100');
waar('eerste vraag na ATSP0: SEARCHING...', /^SEARCHING\.\.\.\r41 00/.test(eerste), JSON.stringify(eerste));
waar('daarna niet meer', !/SEARCHING/.test(lijn(golf, '0100')));
waar('motor én bak antwoorden op 0100', lijn(golf, '0100').split('\r').length === 2);
waar('ATDPN na het zoeken: A6', lijn(golf, 'ATDPN') === 'A6');
const vin = lijn(golf, '0902').split('\r');
waar('VIN zonder headers: 014, 0:, 1:, 2:', vin[0] === '014' && /^0: 49 02 01 57 56 57$/.test(vin[1]) && vin.length === 4, JSON.stringify(vin));
const groep = lijn(golf, '010C0D05').split('\r');
waar('groepsvraag van 3 PIDs: 8 bytes = twee frames, opvulling AA', groep[0] === '008' && /^1: 05 82 AA AA AA AA AA$/.test(groep[2]), JSON.stringify(groep));
// TEGENPROEF: zonder opvulling is het laatste frame korter dan 7 bytes.
const kaal = laad(BRON.replace('while (f.length < 7) f.push(pad);', '')).maak(prof('golf16'));
['ATE0', 'ATH0', 'ATSP0', '0100'].forEach((c) => kaal.stuur(c));
waar('TEGENPROEF: zonder opvulbyte ziet het frame er anders uit', kaal.stuur('010C0D05').tekst.split('\r')[2] !== groep[2]);
waar('antwoordcijfer achteraan: 010C1 = 010C', lijn(golf, '010C1') === lijn(golf, '010C'));
lijn(golf, 'ATH1');
const h1 = lijn(golf, '0902').split('\r');
waar('VIN mét headers: 7E8 10 14, dan 21 en 22', /^7E8 10 14 49 02 01/.test(h1[0]) && /^7E8 21 /.test(h1[1]) && /^7E8 22 /.test(h1[2]), JSON.stringify(h1));
waar('enkel frame mét headers: 7E8 04 41 0C', /^7E8 04 41 0C 0C 30$/.test(lijn(golf, '010C').split('\r')[0]));
lijn(golf, 'ATSH7E1');
waar('ATSH7E1: alleen de bak (7E9) antwoordt', /^7E9 /.test(lijn(golf, '0100')) && lijn(golf, '0100').split('\r').length === 1);
lijn(golf, 'ATSH7DF'); lijn(golf, 'ATCRA7E8');
waar('ATCRA7E8: alleen de motor komt door', lijn(golf, '0100').split('\r').length === 1 && /^7E8/.test(lijn(golf, '0100')));

console.log('\n4. CAN 29-bit');
const fiat = klaar('fiat500', ['0100', 'ATH1']);
waar('kop 18 DA F1 10', /^18 DA F1 10 06 41 00 /.test(lijn(fiat, '0100')), lijn(fiat, '0100'));
waar('ATDPN: A7', lijn(fiat, 'ATDPN') === 'A7');
lijn(fiat, 'ATS0');
waar('zonder spaties: 18DAF1100641', /^18DAF1100641/.test(lijn(fiat, '0100')));

console.log('\n5. KWP2000 en ISO 9141 (niet-CAN)');
const merc = klaar('merc00');
waar('ATSP0 op KWP: SEARCHING... en daarna A5', /^SEARCHING/.test(lijn(merc, '0100')) && lijn(merc, 'ATDPN') === 'A5');
waar('geen groepsvraag op KWP', lijn(merc, '010C0D') === 'NO DATA');
waar('mode 03: drie codes per bericht, geen telling', lijn(merc, '03') === '43 01 70 15 70 00 00', lijn(merc, '03'));
lijn(merc, 'ATH1');
const kwp = lijn(merc, '010C');
const kb = kwp.split(' ');
const som = kb.slice(0, -1).reduce((s, x) => (s + parseInt(x, 16)) & 255, 0);
waar('KWP-kop 84 F1 10 met kloppende checksum', /^84 F1 10 41 0C/.test(kwp) && som === parseInt(kb[kb.length - 1], 16), kwp);
const bmw = klaar('bmw00', ['0100', 'ATH1']);
waar('ISO 9141-kop 48 6B 10', /^48 6B 10 41 0C/.test(lijn(bmw, '010C')), lijn(bmw, '010C'));
waar('geen VIN op een BMW uit 2000', lijn(bmw, '0902') === 'NO DATA');
const kwpVast = N.maak(prof('merc00'));
['ATE0', 'ATSP5'].forEach((c) => kwpVast.stuur(c));
waar('ATSP5 vast: BUS INIT: ...OK vóór het eerste antwoord', /^BUS INIT: \.\.\.OK\r41 00/.test(kwpVast.stuur('0100').tekst));

console.log('\n6. Verkeerd protocol');
const mis = N.maak(prof('merc00')); mis.stuur('ATE0'); mis.stuur('ATSP6');
waar('CAN gekozen, KWP-auto: CAN ERROR', mis.stuur('0100').tekst === 'CAN ERROR');
const mis2 = N.maak(prof('golf16')); mis2.stuur('ATE0'); mis2.stuur('ATSP3');
waar('ISO 9141 gekozen, CAN-auto: UNABLE TO CONNECT', mis2.stuur('0100').tekst === 'UNABLE TO CONNECT');
const mis3 = N.maak(prof('fiat500')); mis3.stuur('ATE0'); mis3.stuur('ATSP6');
waar('11-bit gekozen, 29-bit-auto: NO DATA', mis3.stuur('0100').tekst === 'NO DATA');

console.log('\n7. Echo, readiness, onbekende commando\'s');
const e1 = N.maak(prof('p208'));
waar('na een reset staat de echo aan', /^ATI\rELM327/.test(e1.stuur('ATI').tekst));
e1.stuur('ATE0'); e1.stuur('ATSP0'); e1.stuur('0100');
waar('0101 met MIL aan en één code', e1.stuur('0101').tekst === '41 01 81 07 65 00', e1.stuur('0101').tekst);
waar('kloon: STI geeft ?', e1.stuur('STI').tekst === '?');
waar('een PID die de auto niet heeft: NO DATA', e1.stuur('015C').tekst === 'NO DATA');
const diesel = klaar('mercdiesel', ['0100']);
waar('diesel: readiness met het compressiebit', (parseInt(diesel.stuur('0101').tekst.split(' ')[3], 16) & 8) === 8);
waar('diesel: geen O2 en geen ontsteking', diesel.stuur('0113').tekst === 'NO DATA' && diesel.stuur('010E').tekst === 'NO DATA');

console.log('\n8. Ander antwoordadres (VAG 713>77D): ontvangstfilter en flow control');
const vag = klaar('golf16', ['0100', 'ATSH713']);
waar('zonder ATCRA komt 77D niet door: NO DATA', lijn(vag, '2218211') === 'NO DATA', lijn(vag, '2218211'));
lijn(vag, 'ATCRA77D');
waar('met ATCRA, zonder flow control: alleen het eerste frame', lijn(vag, '2218211') === '008\r0: 62 18 21 00 00 01', JSON.stringify(lijn(vag, '2218211')));
['ATFCSH713', 'ATFCSD300000', 'ATFCSM1'].forEach((c) => lijn(vag, c));
waar('met flow control naar 713: het hele antwoord', /\r1: E2 40 AA/.test(lijn(vag, '2218211')), JSON.stringify(lijn(vag, '2218211')));
waar('een code die de ECU niet kent: 7F 22 31', lijn(vag, '22FFFF1') === '7F 22 31');
const fcVerkeerd = klaar('golf16', ['0100', 'ATSH713', 'ATCRA77D', 'ATFCSH7E0', 'ATFCSD300000', 'ATFCSM1']);
waar('flow control naar het verkeerde adres: afgebroken', !/\r1:/.test(lijn(fcVerkeerd, '2218211')));
const fcHalf = klaar('golf16', ['0100']);
waar('ATFCSM1 zonder FCSH/FCSD: ?', lijn(fcHalf, 'ATFCSM1') === '?');
const psa = klaar('p208', ['0100', 'ATSH6A2', 'ATCRA682']);
waar('PSA 6A2>682: km-stand 01 E2 40', lijn(psa, '22D49C1') === '62 D4 9C 01 E2 40', lijn(psa, '22D49C1'));

console.log('\n' + (fout ? 'test-nepauto: ' + fout + ' fout(en), ' + ok + ' goed' : 'test-nepauto: alles goed (' + ok + ')'));
process.exit(fout ? 1 : 0);
