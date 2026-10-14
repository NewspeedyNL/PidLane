// ══════════════════════════════════════════════════════════════════
// test-autokennis.js — bekende kwalen per motor en bouwjaar (#491)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (14-10-2026)
// AUTO_KENNIS gaf per merk alle zwakke punten van die brandstof: een Golf
// 1.4 TSI van 2016 kreeg de kettingspanner van de EA111 tot 2013, een
// motor die hij niet heeft. Een zwak punt kan nu een cilinderinhoud en
// bouwjaren dragen. Dit toetst het filter op de echte tabel uit
// pidlane-data.js en de echte functie uit pidlane-motortype.js — en de
// vorm van elke regel, want die vult de AI en kijkt een mens na.
//
//   node test-autokennis.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
const lees = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ctx = { console: { log() {}, warn() {}, error() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(lees('pidlane-data.js'), ctx, { filename: 'pidlane-data.js' });
const mt = lees('pidlane-motortype.js');
const ki = mt.indexOf('function autoKennisVoorMerk(merk, brandstof, auto){'), kj = mt.indexOf('\n}\n', ki);
if (ki < 0 || kj < 0) { console.log('FOUT autoKennisVoorMerk(merk, brandstof, auto) staat niet meer in pidlane-motortype.js'); process.exit(1); }
vm.runInContext(mt.slice(ki, kj + 2), ctx, { filename: 'autoKennisVoorMerk' });
const AK = vm.runInContext('AUTO_KENNIS', ctx), f = ctx.autoKennisVoorMerk;
const heeft = (r, re) => !!r && r.zwak.some((t) => re.test(t));

console.log('1. De vorm van elke regel');
const fouten = [];
Object.keys(AK).forEach((m) => AK[m].zwak.forEach((z, i) => {
  if (Array.isArray(z)) { if (typeof z[0] !== 'string' || !z[0].trim()) fouten.push(m + '#' + i + ' lege tekst'); return; }
  if (!z || typeof z.t !== 'string' || !z.t.trim()) { fouten.push(m + '#' + i + ' zonder t'); return; }
  if (z.bs != null && ['diesel', 'benzine', 'hybride'].indexOf(z.bs) < 0) fouten.push(m + '#' + i + ' brandstof ' + z.bs);
  if (z.cc && !(z.cc.length === 2 && z.cc[0] >= 500 && z.cc[1] <= 7000 && z.cc[0] < z.cc[1])) fouten.push(m + '#' + i + ' cc ' + JSON.stringify(z.cc));
  if (z.jaar && !(z.jaar.length === 2 && z.jaar[0] >= 1990 && z.jaar[0] <= 2030 && (z.jaar[1] == null || z.jaar[1] >= z.jaar[0]))) fouten.push(m + '#' + i + ' jaar ' + JSON.stringify(z.jaar));
  if (!z.cc && !z.jaar) fouten.push(m + '#' + i + ' object zonder cc of jaar (gebruik dan de korte vorm)');
}));
toets('elk zwak punt heeft een tekst, een geldige brandstof en geldige grenzen', fouten.length === 0, fouten.join('; '));
toets('er staan zwakke punten met een motorcode en bouwjaren in', Object.keys(AK).some((m) => AK[m].zwak.some((z) => !Array.isArray(z) && z.jaar)));

console.log('\n2. Het filter');
const vwOud = f('VOLKSWAGEN', 'Benzine', { cc: 1390, jaar: 2011 });
toets('Golf 1.4 TSI 2011: de EA111-kettingspanner, zonder voorbehoud', heeft(vwOud, /EA111\)$/), JSON.stringify(vwOud && vwOud.zwak));
toets('… maar niet de EA888 (2.0)', !heeft(vwOud, /EA888/));
const vwNieuw = f('VOLKSWAGEN', 'Benzine', { cc: 1395, jaar: 2016 });
toets('Golf 1.4 TSI 2016: geen EA111-kettingspanner meer', !heeft(vwNieuw, /EA111/), JSON.stringify(vwNieuw.zwak));
toets('… en de waterpomp (geen grenzen) blijft staan', heeft(vwNieuw, /waterpomp/));
const vwOnb = f('Volkswagen', 'benzine');
toets('cc en jaar onbekend: het punt blijft, met "bij sommige motoren"', heeft(vwOnb, /EA111\) \(bij sommige motoren\)/), JSON.stringify(vwOnb.zwak));
toets('… en een punt zonder grenzen krijgt dat voorbehoud niet', vwOnb.zwak.filter((t) => /waterpomp/.test(t)).every((t) => !/sommige/.test(t)));
const vwJaar = f('Volkswagen', 'benzine', { jaar: 2011 });
toets('alleen het jaar bekend: binnen het jaar, maar voorbehoud voor de onbekende cc', heeft(vwJaar, /EA111\) \(bij sommige motoren\)/));
toets('de grens zelf telt mee (2013 is nog binnen 2006–2013)', heeft(f('volkswagen', 'benzine', { cc: 1390, jaar: 2013 }), /EA111\)$/));
toets('diesel: geen TSI-punten', !heeft(f('Volkswagen', 'Diesel', { cc: 1968, jaar: 2011 }), /TSI/));
const bmw = f('BMW', 'Diesel', { cc: 1995, jaar: 2009 });
toets('BMW 2.0 diesel 2009: de N47-ketting', heeft(bmw, /N47/));
toets('BMW 2.0 diesel 2016: geen N47 meer', !heeft(f('BMW', 'Diesel', { cc: 1995, jaar: 2016 }), /N47/));
toets('Peugeot 1.2 PureTech: een riem in olie, geen ketting', heeft(f('Peugeot', 'Benzine', { cc: 1199, jaar: 2017 }), /riem in olie/) && !heeft(f('Peugeot', 'Benzine', { cc: 1199, jaar: 2017 }), /PureTech.*ketting|ketting.*PureTech/));
const bs = f('AdBlue-test-niet', 'diesel');
toets('onbekend merk: null', bs === null && f('', 'diesel') === null);
toets('de uitkomst is altijd een lijst teksten (zoals PLWeten en PLOnderzoek verwachten)', [vwOud, vwNieuw, vwOnb, bmw].every((r) => r.zwak.every((t) => typeof t === 'string')));
const mazda = f('MAZDA', 'Diesel');
toets('de korte vorm [tekst, brandstof] werkt nog', heeft(mazda, /DPF kortritten/) && !heeft(mazda, /^undefined/));

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
