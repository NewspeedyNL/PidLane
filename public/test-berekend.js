// ══════════════════════════════════════════════════════════════════
// test-berekend.js — de rekenregels van pidlane-berekend.js (27-09-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de ECHTE module in een vm-context en toetst bereken() en bronset().
// De bedrading (keuzelijst, pollus, sendCmd) toetst bproef-berekend.js.
//
// Wat hier rood hoort te worden:
//   • een verbruik uit de luchtmassa op een diesel (die loopt arm, λ≠1);
//   • liters per 100 km bij stilstand (delen door bijna nul);
//   • een ontbrekende bron die als 0 doorrekent in plaats van null;
//   • een laaddruk die de gemeten omgevingsdruk negeert;
//   • een versnelling "neutraal" die als "weet niet" leest.
//
// Draaien vanuit public/:  node test-berekend.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0, n = 0;
function ok(v, wat, extra){ n++; if (v) console.log('  ok  ' + wat); else { fouten++; console.log('  FOUT  ' + wat + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } }

const ctx = { console: { log(){}, warn(){} }, Math, JSON, Object, Array, String, Number, Set, Date, isFinite,
  ALL_PID_DEFS: { '010C': { name: 'Toerental' } } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-berekend.js'), 'utf8'), ctx, { filename: 'pidlane-berekend.js' });
const B = ctx.PLBerekend;
if (!B) throw new Error('PLBerekend niet gezet — anker weg?');

console.log('\n— versnelling (CA01) —');
ok(B.bereken('CA01', {}, { gear: 4 }) === 4, 'de 4e is 4');
ok(B.bereken('CA01', {}, { gear: 0 }) === 0, 'neutraal is 0 en niet null');
ok(B.bereken('CA01', {}, { gear: null }) === null, 'geen cijfer is null');

console.log('\n— brandstof (CA02, CA03) —');
ok(B.bereken('CA02', { '015E': 6.4 }, {}) === 6.4, '015E gaat direct door');
const maf = B.bereken('CA02', { '0110': 10 }, {});
ok(Math.abs(maf - 10 * 3600 / (14.7 * 745)) < 0.01, 'luchtmassa bij λ=1 op benzine', maf);
ok(B.bereken('CA02', { '0110': 10 }, { diesel: true }) === null, 'diesel: niet uit de luchtmassa');
ok(B.bereken('CA02', { '015E': 3 }, { diesel: true }) === 3, 'diesel mét 015E: wel');
ok(B.bereken('CA03', { '015E': 6, '010D': 100 }, {}) === 6, '6 l/u bij 100 km/u is 6 l/100 km');
ok(B.bereken('CA03', { '015E': 1, '010D': 3 }, {}) === null, 'onder 5 km/u geen l/100 km');
ok(B.bereken('CA03', { '010D': 100 }, {}) === null, 'zonder brandstofbron null, niet 0');

console.log('\n— laaddruk (CA04), trim (CA05), vermogen (CA06) —');
ok(B.bereken('CA04', { '010B': 181.3 }, {}) === 0.8, 'zonder 0133: tegen 101,3 kPa');
ok(B.bereken('CA04', { '010B': 181.3, '0133': 85 }, {}) === 0.96, 'met 0133 (hoogte): die telt');
ok(B.bereken('CA04', { '010B': 30 }, { baro: 100 }) === -0.7, 'onderdruk is negatief');
ok(B.bereken('CA05', { '0106': 3.1, '0107': -1.6 }, {}) === 1.5, 'kort + lang');
ok(B.bereken('CA05', { '0106': 3.1 }, {}) === null, 'één trim is geen totaal');
const kw = B.bereken('CA06', { '0162': 50, '0163': 300, '010C': 3000 }, {});
ok(Math.abs(kw - 47.1) < 0.05, '50% van 300 Nm bij 3000 tpm ≈ 47,1 kW', kw);
ok(B.bereken('CA06', { '0162': -10, '0163': 300, '010C': 3000 }, {}) === 0, 'motorremmen is 0 kW, niet negatief');

console.log('\n— bronset: wat kan op deze auto —');
const heeft = s => p => s.indexOf(p) >= 0;
ok(JSON.stringify(B.bronset('CA03', heeft(['0110', '010D']), false)) === '["0110","010D"]', 'benzine zonder 015E: via de luchtmassa');
ok(B.bronset('CA03', heeft(['0110', '010D']), true) === null, 'diesel zonder 015E: niet');
ok(JSON.stringify(B.bronset('CA03', heeft(['015E', '0110', '010D']), true)) === '["015E","010D"]', 'diesel met 015E: wel');
ok(B.bronset('CA06', heeft(['0162', '010C']), false) === null, 'vermogen zonder referentiekoppel: niet');
ok(B.isBerekend('ca01') && !B.isBerekend('010C') && !B.isBerekend('2101'), 'isBerekend kent alleen CA..');
ok(ctx.ALL_PID_DEFS.CA01 && ctx.ALL_PID_DEFS.CA01.berekend === true && ctx.ALL_PID_DEFS['010C'].name === 'Toerental', 'geregistreerd in ALL_PID_DEFS zonder iets te overschrijven');
ok(Object.keys(B.DEFS).every(p => /^CA[0-9A-F]{2}$/.test(p) && B.DEFS[p].unit !== 'raw' && !/^PID\s/.test(B.DEFS[p].name)),
  'elke naam is CA+hex en duidbaar (de PID-gate laat hem door, pid_selectie op de server ook)');

console.log(fouten ? `\n${fouten} van ${n} FOUT` : `\nAlle ${n} goed`);
process.exit(fouten ? 1 : 0);
