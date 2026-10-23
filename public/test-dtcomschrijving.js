// ════════════════════════════════════════════════════════════════
// test-dtcomschrijving.js — DTC_OMSCHRIJVING (pidlane-data.js) en de
// opbouwuitleg _dtcStructuur() in dtcInfo() (pidlane-bt.js), 15-10-2026.
// ────────────────────────────────────────────────────────────────
// Aanleiding: een Mazda CX-5 toonde P0421, P2096, P0524 en P2119 als
// "Onbekende code", en via UDS (pidlane-uds.js) komen er nu ook ABS-,
// airbag- en netwerkcodes binnen. De echte functies worden ingelezen uit
// pidlane-bt.js met een anker; verdwijnt dat, dan stopt de test.
// Draaien vanuit public/:  node test-dtcomschrijving.js     (exit 0 = goed)
// ════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fouten = 0, aantal = 0;
function eis(ok, naam, extra) {
  aantal++;
  if (ok) console.log('  ok   ' + naam);
  else { fouten++; console.log('  FOUT ' + naam + (extra ? '\n       ' + extra : '')); }
}

const s = { console };
s.window = s; s.globalThis = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });

const bt = fs.readFileSync(__dirname + '/pidlane-bt.js', 'utf8');
function knip(van, tot) {
  const a = bt.indexOf(van);
  if (a < 0) throw new Error('anker niet gevonden in pidlane-bt.js: ' + van);
  const b = bt.indexOf(tot, a);
  if (b < 0) throw new Error('eindanker niet gevonden in pidlane-bt.js: ' + tot);
  return bt.slice(a, b);
}
// _dtcBron t/m dtcInfo, zonder de rest van het bestand.
vm.runInContext(knip('function _dtcBron(code){', 'function formatDtcCodes(arr){')
  .replace(/^const /gm, 'var '), s, { filename: 'pidlane-bt.js (knip)' });
s._implausibleMisfire = () => false;
s.vehicleCylinderCount = () => 4;
s.vehicleInfo = { merk: 'Mazda' };

console.log('\n1. De tabel zelf');
const O = s.DTC_OMSCHRIJVING;
eis(O && Object.keys(O).length >= 90, 'DTC_OMSCHRIJVING bestaat en is gevuld', O ? Object.keys(O).length + ' codes' : 'ontbreekt');
const dubbel = Object.keys(O || {}).filter((c) => s.DTCDB[c]);
eis(dubbel.length === 0, 'geen code staat ook in DTCDB (daar zou hij nooit gelezen worden)', dubbel.join(', '));
const slecht = Object.keys(O || {}).filter((c) => !/^[PCBU][0-3][0-9A-F]{3}$/.test(c) || !O[c].desc || !O[c].body || ['low', 'med', 'high'].indexOf(O[c].sev) < 0);
eis(slecht.length === 0, 'elke code is geldig en heeft desc, body en ernst', slecht.join(', '));

console.log('\n2. De codes van de Mazda en van UDS hebben een tekst');
['P0421', 'P2096', 'P2097', 'P0524', 'P2119', 'P2101', 'P2107', 'P0461', 'C0035', 'U0121', 'U0151'].forEach((c) => {
  const i = s.dtcInfo(c);
  eis(!/^Onbekende code/.test(i.desc), c + ' → ' + i.desc);
});
eis(s.dtcInfo('P0524').sev === 'high', 'lage oliedruk is ernstig');
eis(s.dtcInfo('P0171').desc === s.DTCDB.P0171.desc, 'TEGENPROEF: een code uit DTCDB houdt zijn eigen tekst');

console.log('\n2b. Een fabrikantcode leent geen tekst van een ander merk (22-10-2026)');
const metMerk = (m, c) => { s.vehicleInfo = { merk: m }; const r = s.dtcInfo(c); s.vehicleInfo = { merk: 'Mazda' }; return r; };
eis(/krukas/i.test(metMerk('BMW', 'P1340').desc), 'BMW P1340: de BMW-tekst', metMerk('BMW', 'P1340').desc);
eis(/^Onbekende code — fabrikantspecifiek/.test(metMerk('Peugeot', 'P1340').desc), 'Peugeot P1340: geen BMW-uitleg, wel de opbouw', metMerk('Peugeot', 'P1340').desc);
eis(/^Onbekende code — fabrikantspecifiek/.test(metMerk('Renault', 'B1318').desc), 'Renault B1318: de Ford/Mazda-accucode geldt daar niet', metMerk('Renault', 'B1318').desc);
eis(/Accu spanning laag/.test(metMerk('Mazda', 'B1318').desc) && /Accu spanning laag/.test(metMerk('Ford', 'B1318').desc), 'Mazda en Ford B1318: accuspanning laag');
const p0016 = metMerk('Peugeot', 'P0016');
eis(!/^Onbekende/.test(p0016.desc), 'TEGENPROEF: een algemene code (P0016) mag wél lenen', p0016.desc);
// U2/B2/C2 zijn fabrikantcodes (SAE J2012); tot 23-10-2026 las _dtcBron ze als algemeen.
const merkGroepen = Object.keys(s.DTC_MERK), eerste = merkGroepen[0];
s.DTC_MERK[eerste].U2100 = { desc: 'netwerkcode van één merk', body: '', sev: 'med' };
s.DTC_MERK[eerste].U0398 = { desc: 'algemene netwerkcode', body: '', sev: 'med' };
eis(/^Onbekende code — fabrikantspecifiek/.test(metMerk('Onbekendmerk', 'U2100').desc), 'U2100 leent niet van een ander merk', metMerk('Onbekendmerk', 'U2100').desc);
eis(!/^Onbekende/.test(metMerk('Onbekendmerk', 'U0398').desc), 'TEGENPROEF: U0398 (algemeen) leent wél', metMerk('Onbekendmerk', 'U0398').desc);
delete s.DTC_MERK[eerste].U2100; delete s.DTC_MERK[eerste].U0398;

console.log('\n3. Wat de opbouw zegt als hij nergens staat');
let i = s.dtcInfo('P117A');
eis(/^Onbekende code — fabrikantspecifiek, aandrijving: brandstof en lucht$/.test(i.desc), 'P117A: fabrikantspecifiek, brandstof en lucht', i.desc);
eis(/verschilt per merk/.test(i.body), 'en de uitleg zegt dat de betekenis per merk verschilt', i.body);
eis(/^Onbekende code — generiek, aandrijving: ontsteking$/.test(s.dtcInfo('P0399').desc), 'P0399: generiek, ontsteking', s.dtcInfo('P0399').desc);
eis(/fabrikantspecifiek, onderstel$/.test(s.dtcInfo('C1999').desc), 'C1999: fabrikantspecifiek onderstel', s.dtcInfo('C1999').desc);
eis(/generiek, netwerk$/.test(s.dtcInfo('U0399').desc), 'U0399: generiek netwerk', s.dtcInfo('U0399').desc);
eis(/fabrikantspecifiek/.test(s.dtcInfo('P3099').desc) && /generiek/.test(s.dtcInfo('P3499').desc), 'P30–P33 fabrikant, P34–P39 generiek');
eis(s.dtcInfo('XYZ').desc === 'Onbekende code', 'TEGENPROEF: onzin krijgt geen verzonnen uitleg', s.dtcInfo('XYZ').desc);

console.log('\n' + (fouten ? fouten + ' van ' + aantal + ' FOUT' : 'Alle ' + aantal + ' goed'));
process.exit(fouten ? 1 : 0);
