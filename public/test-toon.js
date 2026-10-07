// ══════════════════════════════════════════════════════════════════
// test-toon.js — wat een weergave van een sensor laat zien (PLToon)
// ──────────────────────────────────────────────────────────────────
// Aanleiding, 07-10-2026 in een Mazda CX-5: het gaspedaal "stond vast op
// 20" en het tankniveau was in het ene scherm 6 % en in het andere 8 %.
// Getoetst op de echte pidlane-toon.js, met de situaties van die rit:
//   1. een losgelaten absoluut pedaal (0149 op zijn rust van ~20 %) toont 0,
//      en ingetrapt het deel vanaf die rust
//   2. de rust komt uit wat er al gemeten is, en hoort bij déze auto
//   3. een klotsende tankwaarde (6, 8, 6, 8 …) toont één gedempt getal
//   4. elke andere sensor, en de ruwe waarde, blijven zoals ze zijn
//   5. de weergaven (Overzicht, Slim, Visueel en zijn profielen) rekenen via PLToon
//
// Draaien vanuit public/:  node test-toon.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const c = { console: { warn() {}, log() {} }, pidHist: {}, vehicleInfo: { vin: 'AUTO-1' } };
c.window = c;
vm.createContext(c);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-toon.js', 'utf8'), c, { filename: 'pidlane-toon.js' });
const T = c.PLToon;
if (!T || typeof T.waarde !== 'function') { console.log('  FOUT  PLToon.waarde niet geladen'); process.exit(1); }
const reeks = (vals) => vals.map((v, i) => ({ t: i * 1000, v }));
const r = (x) => Math.round(x * 10) / 10;

console.log('1. Het absolute pedaal: losgelaten is 0, niet "vast op 20"');
{
  T._wis();
  c.pidHist['0149'] = reeks([20, 20.4, 20, 19.6, 20]);
  toets('0149 op zijn rust (19,6–20,4 %) toont 0 of vrijwel 0', T.waarde('0149', 20) <= 1, String(T.waarde('0149', 20)));
  toets('ingetrapt tot 50 %: (50 − 19,6) / 60 = 50,7 %', r(T.waarde('0149', 50)) === 50.7, String(T.waarde('0149', 50)));
  toets('vol (80 %): 100 %', T.waarde('0149', 80) === 100, String(T.waarde('0149', 80)));
  toets('het bereik is dat van de vermogensnaald (60), niet een eigen getal', T.PEDAAL_BEREIK === 60);
  c.pidHist['015A'] = reeks([0, 0, 0]);
  toets('015A (relatief) gaat door dezelfde regel en staat in rust ook op 0', T.waarde('015A', 0) === 0 && r(T.waarde('015A', 30)) === 50, String(T.waarde('015A', 30)));
}

console.log('\n2. De rust komt uit de meting, en hoort bij deze auto');
{
  T._wis();
  c.pidHist['0149'] = reeks([18, 25, 40, 18]);
  toets('de eerste aanroep kent de rust al uit de historie: 18 % toont 0', T.waarde('0149', 18) === 0, String(T.waarde('0149', 18)));
  T._wis();
  c.pidHist['0149'] = [];
  toets('TEGENPROEF: zonder historie is de eerste waarde de rust (0), niet de ruwe 18', T.waarde('0149', 18) === 0);
  // Een HOGERE rust dan de vorige auto: zonder opnieuw leren bleef de oude
  // rust (18) staan en las een losgelaten pedaal hier als 12 %.
  c.vehicleInfo = { vin: 'AUTO-2' };
  c.pidHist['0149'] = reeks([25, 25]);
  toets('een andere auto leert opnieuw: 25 % is zijn rust, en toont 0', T.waarde('0149', 25) === 0, String(T.waarde('0149', 25)));
  c.vehicleInfo = { vin: 'AUTO-1' };
  T._wis();
  c.pidHist['0149'] = reeks([0, 20, 20.2, 19.8]);
  toets('een verminkte 0 in de historie telt niet als rust: 20 % blijft ≈ 0', T.waarde('0149', 20) <= 1, String(T.waarde('0149', 20)));
  toets('een verminkte 0 die binnenkomt toont 0 en verpest het geleerde niet', T.waarde('0149', 0) === 0 && T.waarde('0149', 20) <= 1, String(T.waarde('0149', 20)));
  c.pidHist['015A'] = reeks([0, 0]); T._wis();
  toets('TEGENPROEF: bij 015A (relatief) is 0 gewoon de rust', T.waarde('015A', 0) === 0 && r(T.waarde('015A', 30)) === 50, String(T.waarde('015A', 30)));
}

console.log('\n3. Het tankniveau: één gedempt getal, ook als de ruwe waarde klotst');
{
  c.pidHist['012F'] = reeks([8.2, 6.3, 7.8]);
  toets('6, 8, 6 … : de mediaan van de laatste drie (7,8)', T.waarde('012F', 7.8) === 7.8, String(T.waarde('012F', 7.8)));
  c.pidHist['012F'] = reeks([7.8, 8.2, 6.1]);
  toets('een uitschieter naar 6,1 na optrekken verandert het getal niet naar 6,1', T.waarde('012F', 6.1) === 7.8, String(T.waarde('012F', 6.1)));
  c.pidHist['012F'] = reeks([8.2, 6.1]);
  toets('minder dan drie metingen: gewoon de laatste', T.waarde('012F', 6.1) === 6.1);
  toets('het tempo waarop dat werkt: drie metingen', T.TANK_N === 3);
}

console.log('\n3b. Overal hele procenten voor pedaal en tank');
{
  toets('7,8 % tank wordt "8", niet "7.80"', T.tekst('012F', 7.8) === '8');
  toets('0,67 % pedaal wordt "1", niet "0.67"', T.tekst('0149', 0.67) === '1');
  toets('TEGENPROEF: een trim houdt zijn eigen opmaak (null = de gewone fv)', T.tekst('0106', 1.6) === null && T.tekst('0105', 92) === null);
  toets('geen getal: null', T.tekst('012F', null) === null);
}

console.log('\n4. De rest blijft zoals hij is');
{
  toets('koelwater, toerental: ongewijzigd', T.waarde('0105', 92) === 92 && T.waarde('010C', 2000) === 2000);
  toets('geen getal: ongewijzigd (een weergave toont dan "—")', T.waarde('0149', null) === null && T.waarde('012F', undefined) === undefined);
  c.pidHist['0149'] = reeks([20, 20]); T._wis();
  const ruw = c.pidHist['0149'].map((m) => m.v).join(',');
  T.waarde('0149', 50);
  toets('de historie zelf wordt niet aangeraakt (de AI en de analyses krijgen de ruwe waarde)', c.pidHist['0149'].map((m) => m.v).join(',') === ruw);
}

console.log('\n5. Alle drie de weergaven rekenen via PLToon');
{
  // Bron lezen mag hier: de vraag is of de drie tekenpaden dezelfde regel
  // gebruiken, en dat zie je aan de aanroep. Het gedrag zelf staat hierboven
  // en in bproef-toon.js (de echte schermen).
  const lees = (f) => fs.readFileSync(__dirname + '/' + f, 'utf8');
  toets('Overzicht (applyG, de tegel)', /const card=document\.getElementById\('gc-'\+pid\); if\(!card\) return;[\s\S]{0,300}val=PLToon\.waarde\(pid,val\);/.test(lees('pidlane-pids.js')));
  toets('Slim (PLDash.bij)', /function bij\(pid, val\)\{[\s\S]{0,300}val=PLToon\.waarde\(pid, val\);/.test(lees('pidlane-dashboard.js')));
  toets('Visueel (de rijen onder de snelheid)', /function plekBij\(rol, val\)\{[\s\S]{0,300}val=PLToon\.waarde\(pid, val\);/.test(lees('pidlane-visueel.js')));
  toets('Visueel-profielen (Verbruik, Emissie, …: ook een pedaal- en tankplek)', /function bij\(id, ind, pid, val, st\)\{[\s\S]{0,400}val=PLToon\.waarde\(pid, val\);/.test(lees('pidlane-visprofiel.js')));
  toets('Overzicht en Slim tonen pedaal en tank in hele procenten', /PLToon\.tekst\(pid,val\)/.test(lees('pidlane-pids.js')) && /PLToon\.tekst\(pid, val\)/.test(lees('pidlane-dashboard.js')));
}

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
process.exit(fout ? 1 : 0);
