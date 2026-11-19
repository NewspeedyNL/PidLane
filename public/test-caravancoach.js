// ══════════════════════════════════════════════════════════════════
// test-caravancoach.js — de coachregels van de caravanrit (#743, 19-11-2026)
// ──────────────────────────────────────────────────────────────────
// Knipt caravanCheckRules() en zijn hulpfuncties uit pidlane-caravan.js en
// laadt de echte pidlane-kenmerk.js (de koelwatergrens per motor). Wat hier
// rood hoort te worden: een afdaling die op een diesel niet herkend wordt
// omdat de gasklep openstaat, een waarschuwing bij 105 °C op een motor die
// zo warm hoort te lopen, een richtverbruik dat de caravanritten zelf
// meetelt, en teksten die weer een alinea worden.
//
// Draaien vanuit public/:  node test-caravancoach.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0, n = 0;
function ok(v, wat, extra){ n++; if (v) console.log('  ok  ' + wat); else { fouten++; console.log('  FOUT  ' + wat + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } }
function knip(kop, eind){
  const src = fs.readFileSync(path.join(__dirname, 'pidlane-caravan.js'), 'utf8');
  const a = src.indexOf(kop);
  if (a < 0) { console.log('  FOUT  "' + kop + '" niet gevonden in pidlane-caravan.js — deze test toetst niets meer'); process.exit(1); }
  return src.slice(a, src.indexOf(eind || '\n}\n', a) + (eind ? eind.length : 3));
}

const c = { console: { warn(){}, log(){} }, Math, Number, String, Object, Array, Date, JSON, isFinite, localStorage: { getItem(){ return null; } } };
c.window = c;
vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-kenmerk.js'), 'utf8'), c, { filename: 'pidlane-kenmerk.js' });
vm.runInContext([
  'let caravanHist = {}; let caravanCooldown = {}; const meldingen = [];',
  'function _carAlert(key, msg, level){ meldingen.push({ key, msg, level }); }',
  knip('function _carAgo('),
  knip('function _carLaad('),
  knip('const CARAVAN_KOEL', '\n'), knip('const CARAVAN_ATF', '\n'),
  knip('function caravanCheckRules('),
  knip('function caravanKoelOordeel('),
  knip('function caravanPedaal('),
  knip('function caravanRichtverbruik(', '\n'),
  knip('const CARAVAN_FACTOR', '\n'), knip('const CARAVAN_LABEL', '\n'),
  knip('function caravanRichtBepaal('),
  'this.meldingen = meldingen; this.hist = function(h){ caravanHist = h; caravanCooldown = {}; meldingen.length = 0; };'
].join('\n'), c, { filename: 'caravan-knip.js' });
if (!c.PLKenmerk || !c.PLKenmerk.koelLive) { console.log('  FOUT  PLKenmerk.koelLive niet geladen'); process.exit(1); }

const NU = Date.now();
const reeks = (pid, waarden, stap) => ({ [pid]: waarden.map((v, i) => ({ t: NU - (waarden.length - 1 - i) * (stap || 1000), v })) });
function regels(ctx, hist){
  c.hist(hist || {});
  c.caravanCheckRules(Object.assign({ speed: 80, rpm: 2200, load: 50, coolant: 90, gas: 30, volt: 14, lkm: 14, climb: 'vlak', trend: 0,
    cruiseTarget: 95, limit: 100, richt: 14, atf: null, schakel: null, schakelStabiel: false }, ctx));
  return c.meldingen.slice();
}
const sleutels = m => m.map(x => x.key).join(',');

console.log('\n— het pedaal in plaats van de gasklep —');
const pv = { '0149': 18, '0111': 85 };
const g = p => pv[p];
c.PLToon = { waarde: (p, v) => Math.max(0, (v - 16) / 64 * 100) };
ok(Math.round(c.caravanPedaal(g, true)) === 3, 'diesel: het pedaal vanaf zijn rust (18 → 3%), niet de gasklep die op 85 staat');
ok(c.caravanPedaal(p => ({ '0111': 85 })[p], true) === null, 'diesel zonder pedaal: geen gas (de gasklep zegt daar niets)');
ok(c.caravanPedaal(p => ({ '0111': 4 })[p], false) === 4, 'benzine zonder pedaal: de gasklep als terugval');
delete c.PLToon;
let m = regels({ climb: 'afdaling', gas: 2, speed: 70 });
ok(/afdaling/.test(sleutels(m)), 'afdaling met de voet los: uitroltip', m);
m = regels({ gas: 70 }, reeks('GAS', [20, 22, 25]));
ok(/gas/.test(sleutels(m)), 'pedaal springt 50 punten in 2 s: rustiger gas', m);

console.log('\n— koelwater per motor —');
ok(c.caravanKoelOordeel(104, 103) === null, '104 °C en stabiel: geen melding (was: alles boven 100 en stijgend)');
ok(/te heet/.test(c.caravanKoelOordeel(114, 114) || ''), 'boven de harde grens (112): te heet, ook zonder stijging');
ok(/stijgt snel/.test(c.caravanKoelOordeel(98, 94) || ''), '94 → 98 in een minuut: stijgt snel');
ok(c.caravanKoelOordeel(88, 80) === null, 'opwarmen onder 95 °C: geen melding');
m = regels({ coolant: 114 }, reeks('0105', Array(61).fill(114)));
ok(m.some(x => x.key === 'koel' && x.level === 'warn'), 'de regel geeft een waarschuwing (trilling)', m);

console.log('\n— bakolie —');
ok(!regels({ atf: 95 }).some(x => x.key === 'atf'), '95 °C bakolie: normaal');
m = regels({ atf: 114 });
ok(m.some(x => x.key === 'atf' && /rustiger/.test(x.msg)), '114 °C: rustiger aan', m);
ok(/laat afkoelen/.test(regels({ atf: 123 }).filter(x => x.key === 'atf')[0].msg), '123 °C: stoppen');

console.log('\n— richtverbruik uit je eigen ritten —');
const R = [{ km: 40, verbruik_l100: 6.5 }, { km: 30, verbruik_l100: 7.5 }, { km: 120, verbruik_l100: 13, label: 'Caravan' }];
let r = c.caravanRichtBepaal(R, null, 'benzine');
ok(r.bron === 'ritten' && r.l100 === 9.7, '70 km solo à 6,93 × 1,4 = 9,7 — de caravanrit telt niet mee', r);
r = c.caravanRichtBepaal(R.slice(0, 1), 7, 'benzine');
ok(r.bron === 'opgegeven' && r.l100 === 9.8, 'te weinig ritten: het opgegeven verbruik × 1,4', r);
r = c.caravanRichtBepaal(null, null, 'diesel');
ok(r.bron === 'vast' && r.l100 === 11, 'niets bekend: de vaste waarde', r);
ok(!regels({ lkm: 20, richt: 14 }).some(x => x.key === 'verbruik') && regels({ lkm: 23, richt: 14 }).some(x => x.key === 'verbruik'), 'verbruik piekt pas boven 1,6 × het richtverbruik');

console.log('\n— korte teksten —');
const alle = [].concat(
  regels({ schakel: { advies: 'terug', doel: 4 }, schakelStabiel: true }),
  regels({ schakel: { advies: 'op', doel: 6 }, schakelStabiel: true, speed: 80 }),
  regels({ speed: 110, trend: 0 }), regels({ climb: 'afdaling', gas: 1 }), regels({ lkm: 30 }),
  regels({ coolant: 114 }), regels({ atf: 125 }), regels({ volt: 12.1, rpm: 2000 }), regels({ speed: 112 }),
  regels({}, { '0104': Array.from({ length: 40 }, (_, i) => ({ t: NU - i * 5000, v: 92 })) }));
const sl = new Set(alle.map(x => x.key));
ok(['terug', 'op', 'cruise', 'afdaling', 'verbruik', 'koel', 'atf', 'volt', 'limiet', 'duur'].every(k => sl.has(k)), 'elke regel is geraakt', [...sl]);
const lang = alle.filter(x => x.msg.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).length > 8);
ok(!lang.length, 'geen melding langer dan acht woorden', lang.map(x => x.msg));

console.log('\n' + (fouten ? fouten + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
process.exit(fouten ? 1 : 0);
