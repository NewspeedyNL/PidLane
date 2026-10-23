// test-dtcsae.js — de 212 algemene P0/P2-codes in DTC_OMSCHRIJVING (23-10-2026)
//
// De bronlijst (mytrile/obd-trouble-codes) staat op veel plaatsen een of meer
// codes verschoven. Deze test rekent bij elke code die zijn betekenis in het
// nummer draagt (SAE J2012) na of de tekst dat ook zegt: cilinder, bank,
// sensor. Laadt de echte pidlane-data.js en de echte dtcInfo().
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
const s = { console }; s.window = s; vm.createContext(s);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
const bt = fs.readFileSync(__dirname + '/pidlane-bt.js', 'utf8');
const a = bt.indexOf('function _dtcBron(code){'), b = bt.indexOf('function formatDtcCodes(arr){', a);
if (a < 0 || b < 0) { console.log('  FOUT  dtcInfo niet gevonden — anker verdwenen'); process.exit(1); }
vm.runInContext(bt.slice(a, b).replace(/^const /gm, 'var '), s);
s._implausibleMisfire = () => false; s.vehicleCylinderCount = () => 12; s.vehicleInfo = { merk: 'Volkswagen' };
const O = s.DTC_OMSCHRIJVING;

// Wat het codenummer volgens SAE J2012 zelf zegt.
function verwacht(code) {
  const d = parseInt(code.slice(2), 10);
  if (/^P020\d|^P021[0-2]/.test(code)) return { cil: d - 200 };
  if (/^P02[6-9]\d$/.test(code) && d >= 261 && d <= 296) return { cil: Math.floor((d - 261) / 3) + 1 };
  if (/^P030\d|^P031[0-2]/.test(code) && d > 300) return { cil: d - 300 };
  if (code[1] !== '0') return {};
  if (d >= 130 && d <= 167) { const r = d < 150 ? d - 130 : d - 150; return { bank: d < 150 ? 1 : 2, sensor: Math.floor(r / 6) + 1 }; }
  if (d >= 420 && d <= 434) return { bank: d < 430 ? 1 : 2 };
  return {};
}
function controle(code, desc) {
  const v = verwacht(code), f = [];
  const bs = desc.match(/B(\d)S(\d)/) || [];
  const cil = (desc.match(/cilinder (\d+)/i) || [])[1], bank = (desc.match(/bank (\d)/) || [])[1] || bs[1], sen = (desc.match(/sensor (\d)\)/) || [])[1] || bs[2];
  if (v.cil && +cil !== v.cil) f.push('cilinder ' + cil + ' ≠ ' + v.cil);
  if (v.bank && +bank !== v.bank) f.push('bank ' + bank + ' ≠ ' + v.bank);
  if (v.sensor && sen && +sen !== v.sensor) f.push('sensor ' + sen + ' ≠ ' + v.sensor);
  return f;
}

console.log('\n1. De aanvulling staat erin');
const codes = Object.keys(O).filter((c) => /^P[02]/.test(c));
toets('minstens 300 algemene P0/P2-codes', codes.length >= 300, codes.length + '');
const engels = codes.filter((c) => /\b(Sensor|Circuit|Malfunction|Valve|Signal|Input|Detected|Performance)\b/.test(O[c].desc));
toets('geen Engelse tekst blijven staan', engels.length === 0, engels.slice(0, 5).map((c) => c + ' ' + O[c].desc).join('; '));

console.log('\n2. Het nummer en de tekst zeggen hetzelfde');
const mis = codes.map((c) => [c, controle(c, O[c].desc)]).filter((x) => x[1].length);
toets('cilinder, bank en sensor kloppen bij elke code', mis.length === 0, mis.slice(0, 5).map((x) => x[0] + ' ' + x[1].join()).join('; '));
[['P0600', /Seriële communicatie/], ['P0605', /ROM/], ['P0311', /cilinder 11/], ['P0271', /cilinder 4/], ['P0284', /Cilinder 8/],
 ['P0154', /bank 2, sensor 1/], ['P0422', /bank 1/]].forEach(([c, re]) => toets(c + ' → ' + (O[c] && O[c].desc), O[c] && re.test(O[c].desc)));
toets('dtcInfo geeft de tekst, niet "Onbekende code"', /Seriële/.test(s.dtcInfo('P0600').desc), s.dtcInfo('P0600').desc);
toets('misfire is ernstig', O.P0311.sev === 'high');

console.log('\n3. TEGENPROEF — de bronlijst zoals hij is: tekst één code verschoven');
const sor = codes.slice().sort();
const verschoven = sor.slice(1).map((c, i) => [c, controle(c, O[sor[i]].desc)]).filter((x) => x[1].length);
toets('dan vangt de controle tientallen fouten', verschoven.length >= 20, verschoven.length + '');

console.log('\n' + (fout ? fout + ' van ' + n + ' fout' : 'Alles goed (' + n + ')'));
process.exit(fout ? 1 : 0);
