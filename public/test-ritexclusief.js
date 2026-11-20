// ══════════════════════════════════════════════════════════════════
// test-ritexclusief.js — rit-monitor en caravanrit nooit tegelijk (20-11-2026)
// ──────────────────────────────────────────────────────────────────
// Knipt toggleRitMonitor() en ritMonitorUitVoorCaravan() uit
// pidlane-monitor.js en draait ze met een nep-PLMon. Rood hoort te worden:
// de rit-monitor die tijdens een caravanrit tóch aangaat, uitzetten dat
// tijdens een caravanrit geweigerd wordt, en een caravanstart die de
// rit-monitor laat lopen. Dat laatste stuk zit in startCaravan() (async,
// met preAnalysisCheck); dat het daar aangeroepen wordt toetst
// bproef-volscherm.js blok 5 in de echte app.
//
// Draaien vanuit public/:  node test-ritexclusief.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0;
function ok(v, wat, extra){ if (v) console.log('  ok  ' + wat); else { fouten++; console.log('  FOUT  ' + wat + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } }
const src = fs.readFileSync(path.join(__dirname, 'pidlane-monitor.js'), 'utf8');
function knip(kop){
  const a = src.indexOf(kop);
  if (a < 0) { console.log('  FOUT  "' + kop + '" niet gevonden — deze test toetst niets meer'); process.exit(1); }
  return src.slice(a, src.indexOf('\n};\n', a) + 4);
}
const code = knip('window.toggleRitMonitor = function(){') + knip('window.ritMonitorUitVoorCaravan = function(){');

function omgeving(o){
  const c = { console, toasts: [], gestart: 0, gestopt: 0 };
  c.window = c;
  c.PLMon = { userAan: !!o.monitor, active: !!o.monitor,
    start: function(){ c.gestart++; this.active = true; }, stop: function(){ c.gestopt++; this.active = false; } };
  c.connected = true; c.demoMode = false;
  c.showToast = function(t){ c.toasts.push(t); };
  c.log = function(){};
  c.updateMonitorBtn = function(){};
  vm.createContext(c);
  // caravanActive is in de app een `let` op het hoogste niveau van pidlane-caravan.js
  vm.runInContext('let caravanActive = ' + (!!o.caravan) + ';\n' + code, c, { filename: 'monitor-knip.js' });
  return c;
}

console.log('\n— de rit-monitor aanzetten —');
let c = omgeving({ caravan: false });
c.toggleRitMonitor();
ok(c.PLMon.userAan && c.gestart === 1, 'zonder caravanrit: hij gaat aan en start');
c = omgeving({ caravan: true });
c.toggleRitMonitor();
ok(!c.PLMon.userAan && c.gestart === 0, 'tijdens een caravanrit: hij blijft uit', { userAan: c.PLMon.userAan, gestart: c.gestart });
ok(c.toasts.length === 1 && /caravanrit/i.test(c.toasts[0]) && /nooit tegelijk/.test(c.toasts[0]), '…en zegt waarom', c.toasts);

console.log('\n— uitzetten mag altijd —');
c = omgeving({ monitor: true, caravan: true });
c.toggleRitMonitor();
ok(!c.PLMon.userAan && c.gestopt === 1, 'een lopende rit-monitor gaat uit, ook als er (toch) een caravanrit loopt');

console.log('\n— de caravanrit start: de rit-monitor gaat uit —');
c = omgeving({ monitor: true });
ok(c.ritMonitorUitVoorCaravan() === true && !c.PLMon.userAan && c.gestopt === 1, 'een lopende rit-monitor stopt', { userAan: c.PLMon.userAan, gestopt: c.gestopt });
ok(c.toasts.length === 1 && /caravanrit/.test(c.toasts[0]), '…met één melding', c.toasts);
c = omgeving({ monitor: false });
ok(c.ritMonitorUitVoorCaravan() === false && c.toasts.length === 0 && c.gestopt === 0, 'stond hij al uit: niets, geen melding (de wachter tikt elke 2 s)');

console.log('\n— de caravanrit roept dat ook echt aan —');
const car = fs.readFileSync(path.join(__dirname, 'pidlane-caravan.js'), 'utf8');
const sc = car.slice(car.indexOf('async function startCaravan('), car.indexOf('\n}\n', car.indexOf('async function startCaravan(')));
// Broncode lezen: startCaravan is async en leunt op de hele app; het gedrag zelf meet bproef-volscherm.js blok 5.
ok(/ritMonitorUitVoorCaravan\(\)/.test(sc) && sc.indexOf('ritMonitorUitVoorCaravan') > sc.indexOf('preAnalysisCheck'),
   'startCaravan zet de rit-monitor uit, ná de controle die de start nog kan afblazen');

console.log('\n' + (fouten ? 'test-ritexclusief: ' + fouten + ' FOUT' : 'test-ritexclusief: alles goed'));
process.exit(fouten ? 1 : 0);
