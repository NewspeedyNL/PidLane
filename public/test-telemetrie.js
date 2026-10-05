// ══════════════════════════════════════════════════════════════════
// test-telemetrie.js — helling en kanteling uit pidlane-telemetrie.js (05-10-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de ECHTE module in een vm-context, stuurt deviceorientation-events
// in en toetst de hoeken, de nulstand en de keuzelijst-poort.
// De bedrading (keuzelijst, pollus, sendCmd) toetst bproef-telemetrie.js.
//
// Wat hier rood hoort te worden:
//   • helling en kanteling die van plek wisselen, of een omgekeerd teken;
//   • een kompasdraai (alpha, een bocht) die als kanteling leest;
//   • Nulstellen dat de scheve houder niet wegrekent;
//   • de categorie in de keuzelijst op een toestel zonder sensor;
//   • een waarde op de tegel terwijl de sensor al seconden zweeg.
//
// Draaien vanuit public/:  node test-telemetrie.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0, n = 0;
function ok(v, wat, extra){ n++; if (v) console.log('  ok  ' + wat); else { fouten++; console.log('  FOUT  ' + wat + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } }

let klok = 1000000;
const luisteraars = {}, opslag = {}, updates = [];
const ctx = { console: { log(){}, warn(){} }, Math, JSON, Object, Array, String, Number, Set, isFinite, Error,
  Date: { now: () => klok },
  ALL_PID_DEFS: { '010C': { name: 'Toerental' } },
  addEventListener: (t, f) => { luisteraars[t] = f; },
  localStorage: { getItem: k => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); } },
  activePIDs: new Set(['TL01', 'TL02']),
  updPID: (pid, v) => updates.push([pid, v]) };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-telemetrie.js'), 'utf8'), ctx, { filename: 'pidlane-telemetrie.js' });
const T = ctx.PLTelemetrie;
if (!T) throw new Error('PLTelemetrie niet gezet — anker weg?');
const ev = luisteraars.deviceorientation;
if (typeof ev !== 'function') throw new Error('geen deviceorientation-luisteraar — anker weg?');
// Een stilstaande stand: lang genoeg herhalen dat het filter hem bereikt.
function stand(beta, gamma, alpha){ for (let i = 0; i < 100; i++){ klok += 50; ev({ alpha: alpha || 0, beta, gamma }); } }
const bijna = (a, b) => Math.abs(a - b) <= 0.3;

console.log('\n— zonder sensor —');
ok(T.defs().length === 0, 'geen event: geen Telemetrie in de keuzelijst');
ev({ alpha: null, beta: null, gamma: null });
ok(T.defs().length === 0, 'een event zónder beta/gamma telt niet (desktop-Chrome stuurt zo een leeg event)');
T.tik();
ok(updates.length === 0, 'geen meting: geen tegelwaarde (geen 0°)');

console.log('\n— de keuzelijst —');
stand(90, 0);
const d = T.defs();
ok(d.length === 2 && d.every(x => x.cat === 'Telemetrie'), 'met sensor: TL01 en TL02 onder Telemetrie', d.map(x => x.pid + ':' + x.cat));
ok(ctx.ALL_PID_DEFS.TL01 && ctx.ALL_PID_DEFS.TL01.unit === '°', 'TL01 staat in ALL_PID_DEFS (getPidDef, rapport)');
ok(ctx.plIsTelemetrie('tl02') && !ctx.plIsTelemetrie('CA01') && !ctx.plIsTelemetrie('010C'), 'plIsTelemetrie kent alleen TL..');

console.log('\n— rechtop in de houder, scherm naar de bestuurder —');
let h = T.nu();
ok(h && bijna(h.helling, 0) && bijna(h.kanteling, 0), 'recht: 0° en 0°', h);
stand(100, 0);                     // bovenkant naar de bestuurder = neus omhoog
h = T.nu();
ok(bijna(h.helling, 10) && bijna(h.kanteling, 0), 'neus 10° omhoog: helling +10, kanteling 0', h);
stand(90, 0);
stand(90, 0, 90);                  // een bocht van 90°: alleen het kompas draait
h = T.nu();
ok(bijna(h.helling, 0) && bijna(h.kanteling, 0), 'een bocht (alpha) is geen kanteling', h);

console.log('\n— plat op de console, bovenkant vooruit —');
stand(0, 10);                      // rechterkant van het toestel omlaag
h = T.nu();
ok(bijna(h.kanteling, 10) && bijna(h.helling, 0), 'rechts 10° omlaag: kanteling +10, helling 0', h);
stand(10, 0);                      // bovenkant omhoog = neus omhoog
h = T.nu();
ok(bijna(h.helling, 10) && bijna(h.kanteling, 0), 'plat, neus 10° omhoog: helling +10', h);

console.log('\n— nulstellen: een scheve houder —');
stand(70, 5);                      // houder staat 20° achterover en 5° scheef
h = T.nu();
ok(!bijna(h.helling, 0), 'vóór nulstellen: de scheve houder is zichtbaar', h);
ok(T.nulstellen() === true && T.genuld(), 'nulstellen lukt met een verse meting');
ok(opslag.pl_telemetrie_nul && JSON.parse(opslag.pl_telemetrie_nul).length === 3, 'de nulstand is bewaard');
h = T.nu();
ok(bijna(h.helling, 0) && bijna(h.kanteling, 0), 'na nulstellen: 0° en 0°', h);
stand(80, 5);
h = T.nu();
ok(Math.abs(h.helling - 10) < 0.5 && Math.abs(h.kanteling) < 1, 'daarna 10° naar de bestuurder: helling ≈ +10', h);

console.log('\n— de tik —');
updates.length = 0;
T.tik();
ok(updates.length === 2 && updates[0][0] === 'TL01' && updates[1][0] === 'TL02', 'een gekozen TL01 en TL02 krijgen elk een waarde', updates);
updates.length = 0;
klok += 5000;
T.tik();
ok(updates.length === 0 && T.nu() === null, 'sensor 5 s stil: geen waarde meer (de tegel wordt oud, niet fout)', updates);
ok(T.nulstellen() === false, 'nulstellen zonder verse meting weigert');

console.log('\n— trillingen —');
stand(90, 0);
T.nulstellen();
for (let i = 0; i < 40; i++){ klok += 50; ev({ alpha: 0, beta: 90 + (i % 2 ? 6 : -6), gamma: 0 }); }
h = T.nu();
ok(Math.abs(h.helling) < 2, 'een trilling van ±6° middelt uit tot onder 2°', h);

console.log('\n' + (fouten ? 'test-telemetrie: ' + fouten + ' van ' + n + ' FOUT' : 'test-telemetrie: ' + n + ' ok'));
process.exit(fouten ? 1 : 0);
