// ══════════════════════════════════════════════════════════════════
// test-verbindprofiel.js — de koude poort meet, het geheugen verhoogt alleen,
// en naar de kennisbank gaat geen VIN (#388)
// ──────────────────────────────────────────────────────────────────
// WAAROM
// ATST stond voor elke auto op 400 ms. De koude poort (PLVerbind in
// pidlane-bt.js) meet nu per verbinding wat nodig is. Deze test laadt de
// echte functies uit de bron en toetst wat er níét mag gebeuren:
//   - één Bluetooth-haper mag een snelle auto geen seconde per misser kosten;
//   - een trage gateway moet boven de oude 400 ms uitkomen — dát is de T6;
//   - het geheugen mag ATST nooit verlagen, en niet over een andere adapter
//     of een andere bus heen;
//   - de groepsproef zet een plafond, en de automaat klimt er niet boven;
//   - een terugrol gaat naar de gemeten ATST, niet naar 64;
//   - de Worker laat geen ruwe VIN en geen e-mailadres door naar D1.
// Ontwerp: PIDLANE-VERBINDPROFIEL.md.
//
// Draaien vanuit public/:  node test-verbindprofiel.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, ok, detail) {
  n++;
  if (ok) { console.log('  ok    ' + naam); return; }
  console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
  fout++;
}
function lees(rel) { return fs.readFileSync(path.join(__dirname, rel), 'utf8'); }
function knip(bron, van, tot, wat) {
  const i = bron.indexOf(van), j = bron.indexOf(tot, i + 1);
  if (i < 0 || j < 0) { console.error('FOUT: anker voor ' + wat + ' niet gevonden — is de bron verbouwd?'); process.exit(1); }
  return bron.slice(i, j);
}

// ── 1. de pure functies uit pidlane-bt.js ──
const BT = lees('pidlane-bt.js');
const s = { window: {}, Date };
vm.createContext(s);
vm.runInContext(knip(BT, 'const ST_BODEM_MS=', '// De PIDs waarmee de groepsproef werkt', 'de verbindprofielfuncties') +
  '\nthis.plStUitMetingen=plStUitMetingen; this.plProtocolBits=plProtocolBits; this.plSoloAntwoord=plSoloAntwoord;' +
  '\nthis.plGroepCompleet=plGroepCompleet; this.plStUitGeheugen=plStUitGeheugen; this.plAdressen=plAdressen; this.plHandSchoon=plHandSchoon;', s, { filename: 'pidlane-bt.js' });

console.log('\nATST uit de metingen\n');
toets('te weinig metingen: niets zetten', s.plStUitMetingen([40, 41]) === null);
const mazda = s.plStUitMetingen([38, 40, 41, 39, 42, 44, 40, 43]);
toets('snelle auto (CX-5-achtig): ATST ruim onder de oude 0x64',
  mazda && parseInt(mazda.hex, 16) < 0x64 && mazda.ms === 88, JSON.stringify(mazda));
const haper = s.plStUitMetingen([40, 40, 41, 39, 42, 40, 40, 600]);
toets('één Bluetooth-haper van 600 ms trekt het plafond niet naar een seconde',
  haper && haper.ms < 200 && haper.traagstMs === 600, JSON.stringify(haper));
const gateway = s.plStUitMetingen([300, 320, 310, 290, 330, 305, 315, 325]);
toets('trage gateway (VAG-achtig): ATST boven de oude 400 ms — anders blijft het antwoord weg',
  gateway && gateway.ms > 400 && gateway.hex === 'A3', JSON.stringify(gateway));
toets('bodem: nooit onder 48 ms (0x0C)', s.plStUitMetingen([5, 6, 5, 6, 5]).hex === '0C');
toets('top: nooit boven 1020 ms (0xFF)', s.plStUitMetingen([900, 950, 990, 1000, 980]).hex === 'FF');
toets('onzin telt niet mee', s.plStUitMetingen([40, NaN, -3, 'x', 41, 42, null]).n === 3);
toets('drie of vier metingen: de traagste telt', s.plStUitMetingen([40, 41, 90]).refMs === 90);

console.log('\nProtocol en antwoorden\n');
[['6', 11], ['A6', 11], ['8', 11], ['7', 29], ['A9', 29], ['A', 29], ['3', 0], ['5', 0], ['0', 0], ['', 0]]
  .forEach(([id, bits]) => toets('protocol "' + id + '" → ' + bits, s.plProtocolBits(id) === bits, 'kreeg ' + s.plProtocolBits(id)));
toets('11-bit: motor-ECU op 7E0 (mode 22 straks)', s.plAdressen(11).motor === '7E0' && s.plAdressen(11).functioneel === '7DF');
toets('29-bit: motor-ECU op 18DA10F1', s.plAdressen(29).motor === '18DA10F1');
toets('geen CAN: geen adressen', s.plAdressen(0) === null);
toets('410C1AF8 is een antwoord op 010C', s.plSoloAntwoord('410C1AF8', '010C') === true);
toets('41 0C 1A F8 (met spaties) ook', s.plSoloAntwoord('41 0C 1A F8', '010C') === true);
toets('NO DATA is geen antwoord', s.plSoloAntwoord('NO DATA', '010C') === false);
toets('SEARCHING...410C1AF8 telt niet: het protocol zocht nog', s.plSoloAntwoord('SEARCHING...410C1AF8', '010C') === false);
toets('410D32 is geen antwoord op 010C', s.plSoloAntwoord('410D32', '010C') === false);
toets('een weigering (7F 01 12) is geen antwoord', s.plSoloAntwoord('7F0112', '010C') === false);
toets('groep compleet', s.plGroepCompleet({ '010C': [1], '010D': [2] }, ['010C', '010D']) === true);
toets('groep met een gat is niet compleet', s.plGroepCompleet({ '010C': [1] }, ['010C', '010D']) === false);
toets('lege groep is niet compleet', s.plGroepCompleet({}, []) === false);

console.log('\nVerbinding met de hand: wat er door de keuring komt\n');
toets('geldige keuze blijft heel', JSON.stringify(s.plHandSchoon({ st: '19', at: 2, proto: '6' })) === JSON.stringify({ st: '19', at: '2', proto: '6' }));
toets('ATST onder de bodem van 48 ms (0x0C) wordt geweigerd', !('st' in s.plHandSchoon({ st: '05' })));
toets('ATST zonder hex wordt geweigerd', !('st' in s.plHandSchoon({ st: 'ZZ' })) && !('st' in s.plHandSchoon({ st: '123' })));
toets('ATAT alleen 0, 1 of 2', !('at' in s.plHandSchoon({ at: '3' })) && s.plHandSchoon({ at: 0 }).at === '0');
toets('protocol alleen 0…C', !('proto' in s.plHandSchoon({ proto: 'D' })) && s.plHandSchoon({ proto: 'a' }).proto === 'A');
toets('headers, echo en onbekende velden komen er niet door', Object.keys(s.plHandSchoon({ st: '19', ath: '1', ate: '1', cmd: 'ATZ' })).join() === 'st');
toets('rommel geeft een leeg object', JSON.stringify(s.plHandSchoon(null)) === '{}' && JSON.stringify(s.plHandSchoon('ATZ')) === '{}');

console.log('\nGeheugen: alleen omhoog, alleen op dezelfde bus en adapter\n');
const NU = 1759500000000;
const bewaard = { st: { hex: 'A3', ms: 652, bron: 'gemeten' }, protocol: { id: '6' }, adapter: 'spp', gemetenOp: NU - 86400000 };
const nuGemeten = { hex: '16', ms: 88, bron: 'gemeten' };
const g1 = s.plStUitGeheugen(nuGemeten, bewaard, 'A6', 'spp', NU);
toets('bewaard trager dan nu: ATST omhoog naar de vorige keer (A6 en 6 zijn dezelfde bus)', g1 && g1.hex === 'A3' && g1.bron === 'geheugen', JSON.stringify(g1));
toets('bewaard sneller dan nu: niet verlagen',
  s.plStUitGeheugen({ hex: 'A3', ms: 652, bron: 'gemeten' }, Object.assign({}, bewaard, { st: { hex: '16', ms: 88, bron: 'gemeten' } }), '6', 'spp', NU) === null);
toets('andere adapter: geheugen telt niet', s.plStUitGeheugen(nuGemeten, bewaard, '6', 'ble', NU) === null);
toets('ander protocol: geheugen telt niet', s.plStUitGeheugen(nuGemeten, bewaard, '7', 'spp', NU) === null);
toets('ouder dan een half jaar: geheugen telt niet',
  s.plStUitGeheugen(nuGemeten, Object.assign({}, bewaard, { gemetenOp: NU - 200 * 86400000 }), '6', 'spp', NU) === null);
toets('nu niet gemeten (standaard): het bewaarde gemeten profiel geldt, ook als het lager is',
  (s.plStUitGeheugen({ hex: '64', bron: 'standaard' }, Object.assign({}, bewaard, { st: { hex: '16', ms: 88, bron: 'gemeten' } }), '6', 'spp', NU) || {}).hex === '16');
toets('een bewaard standaardprofiel is geen meting', s.plStUitGeheugen(nuGemeten, Object.assign({}, bewaard, { st: { hex: 'FF', ms: 1020, bron: 'standaard' } }), '6', 'spp', NU) === null);

// ── 2. PLBus en de terugrol, uit de echte pidlane-data.js ──
console.log('\nGroepsplafond en terugrol (pidlane-data.js)\n');
const d = {};
d.window = d; d.globalThis = d;
d.console = { log() { }, warn() { }, error() { } };
d.localStorage = { getItem: () => null, setItem() { }, removeItem() { }, key: () => null, length: 0 };
d.sessionStorage = d.localStorage;
d.document = { readyState: 'complete', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { add() { }, remove() { } }, appendChild() { }, addEventListener() { } }),
  addEventListener() { }, body: { appendChild() { } } };
d.navigator = { userAgent: 'node' };
d.setTimeout = () => 0; d.clearTimeout = () => { }; d.setInterval = () => 0; d.clearInterval = () => { };
d.performance = { now: () => Date.now() };
vm.createContext(d);
vm.runInContext(lees('pidlane-data.js'), d, { filename: 'pidlane-data.js' });
const B = d.PLBus;
toets('zonder meting: plafond is GROEP_AUTO_MAX (3) — de CX-5 blijft op 3', B.batchPlafond() === 3);
B.batchStart(2, 2);
toets('groepsproef 2 (3 faalde): start op 2', B.batchGroep() === 2);
for (let i = 0; i < 60; i++) B.batchGroter();
toets('en klimt na 60 schone rondes niet boven het plafond 2', B.batchGroep() === 2, 'groep ' + B.batchGroep());
B.batchReset();
toets('batchReset (herstel na batch-uit) gaat naar het plafond, niet naar 3', B.batchGroep() === 2);
B.batchStart(2, null);
for (let i = 0; i < 30; i++) B.batchGroter();
toets('plafond niet getoetst (te weinig PIDs): mag klimmen tot 3', B.batchGroep() === 3, 'groep ' + B.batchGroep());
B.batchStart(3, 1); B.batchPlafondWis();
toets('batchPlafondWis (nieuwe verbinding): plafond terug op 3', B.batchPlafond() === 3);
B.batchZet(5, true); B.batchStart(1, 1);
toets('een met de hand vastgezette groep blijft staan', B.batchGroep() === 5);
B.batchZet(3, false);

toets('terugrol zonder meting: ATST64 zoals altijd', d.plElmBaseline().indexOf('ATST64') !== -1);
d.plStHex = () => 'A3';
toets('terugrol na meting: de gemeten ATST, niet 64', d.plElmBaseline().indexOf('ATSTA3') !== -1 && d.plElmBaseline().indexOf('ATST64') === -1,
  d.plElmBaseline().join(' '));
d.plAtStand = () => '2';
toets('terugrol volgt ook de met de hand gekozen ATAT', d.plElmBaseline().indexOf('ATAT2') !== -1 && d.plElmBaseline().indexOf('ATAT1') === -1, d.plElmBaseline().join(' '));
toets('ELM_BASELINE zelf blijft het vertrekpunt', d.ELM_BASELINE.indexOf('ATST64') !== -1);

// ── 3. de Worker: wat er naar D1 mag ──
console.log('\nKennisbank (worker.js)\n');
const W = lees('../worker.js');
const w = {};
vm.createContext(w);
vm.runInContext('function __name(f){return f;}\n' + knip(W, 'function verbindRecordSchoon(', '__name(verbindRecordSchoon', 'verbindRecordSchoon') +
  '\nthis.schoon=verbindRecordSchoon;', w, { filename: 'worker.js' });
const goed = { vin_pseudo: '0123456789abcdef', wmi: 'JM3', merk: 'Mazda', model: 'CX-5', jaar: '2018', brandstof: 'benzine',
  adapter: 'spp', protocol: 'A6', bits: 11, st_hex: '16', st_ms: 88, traagst_ms: 44, st_bron: 'gemeten', groep: 3, groep_plafond: null,
  pids_ondersteund: 42, reads_per_sec: 31.7 };
const r1 = w.schoon(goed);
toets('een geldig profiel gaat door', r1 && r1.st_hex === '16' && r1.groep === 3 && r1.vin_pseudo === '0123456789abcdef');
toets('een ruwe VIN in vin_pseudo gaat er NIET door', w.schoon(Object.assign({}, goed, { vin_pseudo: 'JM3KFBCM1J0123456' })).vin_pseudo === null);
toets('een ruwe VIN als wmi gaat er niet door', w.schoon(Object.assign({}, goed, { wmi: 'JM3KFBCM1J0123456' })).wmi === null);
toets('een e-mailadres als merk gaat er niet door', w.schoon(Object.assign({}, goed, { merk: 'jan@voorbeeld.nl' })).merk === '');
toets('een onbekend veld (kenteken) komt niet in het record', !('kenteken' in w.schoon(Object.assign({}, goed, { kenteken: '12-ABC-3' }))));
toets('zonder protocol is het geen profiel', w.schoon(Object.assign({}, goed, { protocol: null })) === null);
toets('zonder ATST is het geen profiel', w.schoon(Object.assign({}, goed, { st_hex: 'XYZ' })) === null);
toets('onzin-getallen worden null', w.schoon(Object.assign({}, goed, { st_ms: 99999, groep: 2.5 })).st_ms === null);

const sqlW = (W.match(/var VERBIND_SCHEMA = "([^"]+)";/) || [])[1];
const sqlS = lees('../schema.sql').split('\n').filter(r => r.indexOf('CREATE TABLE IF NOT EXISTS verbindprofielen') === 0)[0];
toets('schema.sql en worker.js beschrijven dezelfde tabel', !!sqlW && sqlS === sqlW + ';', 'worker: ' + sqlW + '\nschema: ' + sqlS);
toets('de route staat achter de origin-slot (isRestrictedPath)', /pathname\.startsWith\("\/verbind\/"\)/.test(W));

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'alle ' + n + ' goed'));
process.exit(fout ? 1 : 0);
