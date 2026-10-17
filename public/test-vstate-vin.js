// ═══════════════════════════════════════════════════════════════════
// test-vstate-vin.js — de VIN gaat niet ruw naar de expert (17-10-2026)
// ───────────────────────────────────────────────────────────────────
// buildVState() in pidlane-remote.js stuurde `veh.vin` onbewerkt naar de
// Worker; die bewaarde hem in de Durable Object-opslag en gaf hem aan elke
// expert door. Twee deuren dicht, en deze test toetst ze allebei:
//  1. de app: _vinVoorExpert() geeft WMI + pseudoniem (het échte
//     _vlVinPseudoniem uit pidlane-veldlab.js), nooit de VIN;
//  2. de Worker: vstateZonderVin() haalt een `veh.vin` van een oude
//     app-versie eruit, en laat de rest staan.
//
// Draaien vanuit public/:  node test-vstate-vin.js   (exit 0 = goed)
// ═══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); return; }
  fouten++; console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : ''));
}
function knip(bron, van, tot, wat) {
  const a = bron.indexOf(van);
  if (a < 0) { console.log('FOUT anker voor ' + wat + ' niet gevonden: ' + van); process.exit(1); }
  const b = bron.indexOf(tot, a);
  if (b < 0) { console.log('FOUT eindanker voor ' + wat + ' niet gevonden: ' + tot); process.exit(1); }
  return bron.slice(a, b);
}
const lees = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const VIN = 'WVWZZZ3CZHE000000';   // zelfde verzonnen VIN als test-vin-anoniem.js

(async () => {
  console.log('\n1. De app stuurt WMI + pseudoniem');
  const veldlab = lees('pidlane-veldlab.js');
  const ps = knip(veldlab, "const VL_VIN_ZOUT", "\n/* ── Een e-mailadres", '_vlVinPseudoniem');
  const remote = lees('pidlane-remote.js');
  const fn = knip(remote, 'let _vinPs={vin:\'\',ps:null};', '  let _vstT=null;', '_vinVoorExpert');
  let opnieuw = 0;
  const maak = new Function('sendVStateSoon', ps + '\n' + fn + '\nreturn { v: _vinVoorExpert, p: _vlVinPseudoniem };');
  const { v, p } = maak(() => { opnieuw++; });

  const eerst = v(VIN);
  toets('eerste aanroep: alleen de WMI, nog geen pseudoniem', eerst.wmi === 'WVW' && eerst.vin_pseudo === null, JSON.stringify(eerst));
  toets('en geen VIN', JSON.stringify(eerst).indexOf(VIN) < 0 && !('vin' in eerst));
  await new Promise((r) => setTimeout(r, 20));
  toets('na het berekenen volgt een nieuwe vstate', opnieuw === 1, opnieuw + '×');
  const daarna = v(VIN);
  const verwacht = await p(VIN);
  toets('dan met het pseudoniem van _vlVinPseudoniem()', daarna.vin_pseudo === verwacht && /^[0-9a-f]{16}$/.test(verwacht), JSON.stringify(daarna));
  toets('nog steeds geen VIN', JSON.stringify(daarna).indexOf(VIN) < 0);
  v(VIN);
  await new Promise((r) => setTimeout(r, 20));
  toets('zelfde VIN → niet opnieuw berekend', opnieuw === 1, opnieuw + '×');
  toets('geen VIN → leeg, geen fout', v('').wmi === '' && v('').vin_pseudo === null);

  console.log('\n2. De vstate zelf gebruikt die functie');
  const bv = knip(remote, 'function buildVState(){', '  let _vinPs=', 'buildVState');
  toets('veh krijgt _vinVoorExpert(v.vin)', /_vinVoorExpert\(v\.vin\)/.test(bv));
  toets('en geen eigen vin-veld', !/\bvin\s*:\s*v\.vin/.test(bv), bv.slice(0, 300));

  console.log('\n3. De Worker laat geen ruwe VIN door');
  const worker = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
  const wz = knip(worker, 'function vstateZonderVin(d) {', '__name(vstateZonderVin', 'vstateZonderVin');
  const zonder = new Function(wz + '\nreturn vstateZonderVin;')();
  const oud = { t: 1, veh: { merk: 'Volkswagen', vin: VIN }, pids: ['010C'] };
  const schoon = zonder(oud);
  toets('veh.vin verdwijnt', JSON.stringify(schoon).indexOf(VIN) < 0 && !('vin' in schoon.veh), JSON.stringify(schoon));
  toets('WMI blijft, de rest ook', schoon.veh.wmi === 'WVW' && schoon.veh.merk === 'Volkswagen' && schoon.pids[0] === '010C');
  toets('het origineel wordt niet aangeraakt', oud.veh.vin === VIN);
  const nieuw = { veh: { merk: 'Mazda', wmi: 'JMZ', vin_pseudo: 'abcdef0123456789' } };
  toets('een nieuwe vstate blijft gelijk', zonder(nieuw) === nieuw);
  toets('null en tekst vallen niet om', zonder(null) === null && zonder('x') === 'x');
  toets('opslaan én inladen lopen erdoor', /vstateZonderVin\(await this\.ctx\.storage\.get\("vstate"\)/.test(worker) && /d = vstateZonderVin\(d\);\s*this\.vstate = d;/.test(worker));

  console.log('\n' + (fouten ? fouten + ' FOUT' : 'Alles goed'));
  process.exit(fouten ? 1 : 0);
})();
