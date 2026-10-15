// ══════════════════════════════════════════════════════════════════
// test-demorit.js — de demo-rit hangt aan één rijtoestand (16-10-2026)
// ──────────────────────────────────────────────────────────────────
// Op de echte demoRit() uit pidlane-auth.js (geknipt op zijn ankers) en de
// echte tabellen uit pidlane-data.js. Over drie volle rijcycli, elke 100 ms:
//   1. een atmosferische motor: inlaatdruk nooit boven de buitenlucht
//   2. toerental hoort bij snelheid en een versnelling
//   3. luchtmassa, verbruik en belasting volgen elkaar; gas los = (bijna) niets
//   4. alles binnen de harde grenzen en het gebruikelijke bereik van de app
//   5. de demo levert geen voorste smalbandsonde (0114) meer
//
// Draaien vanuit public/:  node test-demorit.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, v, uitleg) {
  if (v) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const bron = fs.readFileSync(__dirname + '/pidlane-auth.js', 'utf8');
const van = bron.indexOf('const DEMO_RIT='), tot = bron.indexOf('\nlet _scenario=');
if (van < 0 || tot < van) { console.error('FOUT: demoRit() niet gevonden in pidlane-auth.js (anker weg?)'); process.exit(1); }
const c = { window: {} };
vm.createContext(c);
vm.runInContext(bron.slice(van, tot) + '\nthis.demoRit=demoRit; this.DEMO_RIT=DEMO_RIT;', c);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-data.js', 'utf8'), Object.assign(c, { window: c }), { filename: 'pidlane-data.js' });
const HARD = c.PID_HARD_LIMITS || {}, LET = c.PID_LET_OP || {};
if (!Object.keys(HARD).length) { console.error('FOUT: PID_HARD_LIMITS niet geladen'); process.exit(1); }

const rit = [];
for (let t = 0; t < 3 * 2 * Math.PI * 8000; t += 100) rit.push(c.demoRit(t));
const elk = (f) => rit.every(f), som = (f) => rit.filter(f).length;

console.log('\n1. Atmosferisch');
const boven = rit.filter((w) => w['010B'] >= w['0133']);
waar('inlaatdruk nooit boven de buitenlucht', !boven.length, boven.length ? JSON.stringify(boven[0]) : '');
waar('en bij optrekken wel dichterbij (> 70 kPa)', rit.some((w) => w['010B'] > 70));
waar('stationair/uitrollen: diep vacuüm (< 40 kPa)', rit.some((w) => w['010B'] < 40));

console.log('\n2. Toerental bij snelheid');
const km = c.DEMO_RIT.km1000;
const losse = rit.filter((w) => w['010D'] > 12 && !km.some((r) => Math.abs(w['010D'] / r * 1000 - w['010C']) < 1));
waar('boven 12 km/u past het toerental bij één versnelling', !losse.length, losse.length ? JSON.stringify(losse[0]) : '');
waar('nooit onder stationair', elk((w) => w['010C'] >= c.DEMO_RIT.stat - 20));
waar('er wordt geschakeld (meer dan drie versnellingen gebruikt)', new Set(rit.filter((w) => w['010D'] > 12).map((w) => km.findIndex((r) => Math.abs(w['010D'] / r * 1000 - w['010C']) < 1))).size > 3);

console.log('\n3. Lucht, belasting, verbruik');
waar('luchtmassa = 2,0 l × toeren × belasting (binnen 1 %)', elk((w) => Math.abs(w['0110'] - 2.4 * w['010C'] / 120 * w['0104'] / 100) <= 0.01 * w['0110'] + 0.02));
const nietLos = rit.filter((w) => w['0104'] > 10);
waar('verbruik = luchtmassa ÷ (14,7 × λ) in liters per uur', nietLos.every((w) => Math.abs(w['015E'] - w['0110'] * 3600 / (14.7 * w['0124'] * 745)) <= 0.02 * w['015E'] + 0.01));
const l100 = rit.filter((w) => w['010D'] > 40 && w['0104'] > 10).map((w) => w['015E'] / w['010D'] * 100);
waar('boven 40 km/u tussen 2 en 25 l/100 km (uitrollen weinig, optrekken veel)', l100.every((x) => x > 2 && x < 25) && l100.some((x) => x < 8), Math.min(...l100).toFixed(1) + '…' + Math.max(...l100).toFixed(1));
const gasLos = rit.filter((w) => w['0104'] < 10);
waar('gas los komt voor: pedaal in rust, (bijna) geen verbruik, de dynamo laadt', gasLos.length > 0 && gasLos.every((w) => w['0149'] === 14.9 && w['015E'] < 0.5 && w['0142'] > 14.3));
waar('pedaal → gasklep → belasting lopen samen op', elk((w) => (w['0111'] - 6) / 0.85 >= 0 && Math.abs((w['0149'] - 14.9) / 0.75 - (w['0111'] - 6) / 0.85) < 0.05));
waar('trims klein: kort binnen ±5 %, lang 2–3 %', elk((w) => Math.abs(w['0106']) <= 5 && w['0107'] >= 1.9 && w['0107'] <= 2.9));
waar('dynamo slim: laden bij uitrollen (> 14,3 V), minder bij optrekken (< 13,2 V)', rit.some((w) => w['0142'] > 14.3) && rit.some((w) => w['0142'] < 13.2) && elk((w) => w['0142'] > 12.4));

console.log('\n4. Binnen de grenzen van de app');
const buiten = [];
rit.forEach((w) => Object.keys(w).forEach((p) => {
  const h = HARD[p], l = LET[p];
  if (h && (w[p] < h.min || w[p] > h.max)) buiten.push('hard ' + p + '=' + w[p]);
  if (l && (w[p] < l.min || w[p] > l.max)) buiten.push('let op ' + p + '=' + w[p]);
}));
waar('geen waarde buiten PID_HARD_LIMITS of PID_LET_OP', !buiten.length, [...new Set(buiten)].slice(0, 5).join(', '));

console.log('\n5. De sondes');
waar('demoRit levert geen 0114 (de CX-5 heeft vóór een breedbandsonde)', elk((w) => !('0114' in w) && '0124' in w && '0115' in w));
const demo = fs.readFileSync(__dirname + '/pidlane-demo.js', 'utf8');
const lijst = (demo.match(/const benzine=\[([\s\S]*?)\]/) || [])[1] || '';
waar('de benzine-demo biedt 0114 niet aan, wel 0124 en 0115', lijst && lijst.indexOf("'0114'") < 0 && lijst.indexOf("'0124'") > -1 && lijst.indexOf("'0115'") > -1, lijst);

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
