// ══════════════════════════════════════════════════════════════════
// test-identiteit.js — PLIdentiteit: het kenteken hangt aan de VIN
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-identiteit.js in een vm. De fout die dit moet
// vangen (08-11-2026): een nieuwe auto kreeg stil het kenteken van de
// vorige, en dat kwam blijvend in het profiel van zijn VIN.
//
// Draaien vanuit public/:  node test-identiteit.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bron = fs.readFileSync(path.join(__dirname, 'pidlane-identiteit.js'), 'utf8');
let n = 0, fout = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? ' — ' + uitleg : '')); }
}
function laad(opslag, o) {
  o = o || {};
  opslag = opslag || {};
  const s = {
    console: { warn() {}, log() {} }, JSON, Date, String,
    localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } },
    demoMode: !!o.demo, btDiag() {}
  };
  s.window = s; s.opslag = opslag;
  vm.createContext(s);
  vm.runInContext(bron, s);
  return s;
}
const MAZDA = 'JMZZZZZZZJX000001', VW = 'WVWZZZ1KZ6W000001';

console.log('\n1. De pure kern');
const K = laad().PLIdentiteit._kern;
toets('norm: hoofdletters zonder streepjes', K.norm('r-054-xd') === 'R054XD');
toets('normVin: alleen een geldige VIN', K.normVin(MAZDA.toLowerCase()) === MAZDA && K.normVin('kort') === '' && K.normVin('JMZZZZZZZJX00000I') === '');
toets('begin zonder hervatting: leeg', K.begin({ vin: MAZDA, kenteken: 'AB12CD', bron: 'klant' }, false).kenteken === '');
toets('begin met hervatting: hetzelfde', K.begin({ vin: MAZDA, kenteken: 'AB12CD', bron: 'klant' }, true).kenteken === 'AB12CD');
toets('metVin: kenteken uit het profiel van deze VIN', K.metVin({ vin: '', kenteken: '', bron: '' }, MAZDA, 'r-054-xd').kenteken === 'R054XD');
toets('metVin: een andere VIN wist het kenteken', K.metVin({ vin: VW, kenteken: 'OUD123', bron: 'klant' }, MAZDA, '').kenteken === '');
toets('metVin: kenteken vóór de VIN gaat naar deze VIN', (function () { const r = K.metVin({ vin: '', kenteken: 'AB12CD', bron: 'klant' }, MAZDA, 'R054XD'); return r.kenteken === 'AB12CD' && r.vin === MAZDA; })());
toets('metVin: te kort profielkenteken telt niet', K.metVin({ vin: '', kenteken: '', bron: '' }, MAZDA, 'AB').kenteken === '');
toets('bevestig: te kort verandert niets', K.bevestig({ vin: '', kenteken: '', bron: '' }, 'AB').kenteken === '');
toets('kentekenVoor: alleen bij dezelfde VIN', K.kentekenVoor({ vin: MAZDA, kenteken: 'AB12CD' }, MAZDA) === 'AB12CD' && K.kentekenVoor({ vin: VW, kenteken: 'AB12CD' }, MAZDA) === '');
toets('kentekenVoor: bevestigd vóór de VIN mag', K.kentekenVoor({ vin: '', kenteken: 'AB12CD' }, MAZDA) === 'AB12CD');

console.log('\n2. De nagebouwde fout: een nieuwe auto na een andere');
{
  // Gisteren de VW met OUD123, profiel bewaard. Vandaag een Mazda zonder profiel.
  const s = laad({ pl_kenteken: 'OUD123', ['pl_vinprof_' + VW]: JSON.stringify({ vin: VW, kenteken: 'OUD123' }),
    pl_id_nu: JSON.stringify({ vin: VW, kenteken: 'OUD123', bron: 'klant' }) });
  const I = s.PLIdentiteit;
  toets('vóór de verbinding: de laatst verbonden auto', I.kenteken() === 'OUD123');
  I.begin(false);
  toets('nieuwe verbinding: onbekend', I.kenteken() === '' && !I.bekend());
  toets('maar OUD123 blijft als suggestie', I.laatst() === 'OUD123');
  toets('VIN zonder profiel: nog steeds onbekend  <- de fout van 08-11', I.naVin(MAZDA) === '' && !I.bekend());
  toets('het profiel van de Mazda krijgt géén kenteken', I.kentekenVoor(MAZDA) === '');
  I.bevestig('xx-12-yz');
  toets('de klant bevestigt: bekend, en het profiel mag het', I.bekend() && I.kentekenVoor(MAZDA) === 'XX12YZ');
  toets('en het laatst bevestigde volgt', s.opslag.pl_kenteken === 'XX12YZ');
}
{
  const s = laad({ ['pl_vinprof_' + VW]: JSON.stringify({ vin: VW, kenteken: 'oud-12-3' }) });
  const I = s.PLIdentiteit;
  I.begin(false);
  toets('bekende VIN: het kenteken uit zijn profiel, zonder vraag', I.naVin(VW) === 'OUD123' && I.bekend() && I.staat().bron === 'profiel');
}

console.log('\n3. Hervatten en herladen');
{
  const opslag = {};
  let I = laad(opslag).PLIdentiteit;
  I.begin(false); I.naVin(MAZDA); I.bevestig('AB12CD');
  I = laad(opslag).PLIdentiteit;   // herlaad: nieuwe vm, zelfde opslag
  toets('na een herlaad weet hij het nog', I.kenteken() === 'AB12CD');
  I.begin(true);
  toets('een hervatting houdt het kenteken', I.bekend() && I.kenteken() === 'AB12CD');
  I.begin(false);
  toets('TEGENPROEF: een opstart of de knop wist het', !I.bekend());
}

console.log('\n4. De demo raakt niets');
{
  const s = laad({ pl_kenteken: 'EIGEN1' }, { demo: true });
  s.PLIdentiteit.begin(false); s.PLIdentiteit.bevestig('DEMO12');
  toets('demo: pl_kenteken en pl_id_nu blijven zoals ze waren', s.opslag.pl_kenteken === 'EIGEN1' && !('pl_id_nu' in s.opslag));
}

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
process.exit(fout ? 1 : 0);
