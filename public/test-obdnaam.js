// ══════════════════════════════════════════════════════════════════
// test-obdnaam.js — een Bose-speaker is geen OBD2-adapter (19-10-2026)
// ──────────────────────────────────────────────────────────────────
// Het logboek van 19-10-2026 19:04 meldt "OBD2 adapter: LE-Bose Revolve
// SoundLink" en connectSPP() verbond daar eerst mee: de SPP-keuze had een
// eigen naamlijst met een kale 'link' en 'scan'. Mislukt, tweede ronde, 25 s.
//
// Deze test draait de échte isObdNaam() en connectSPP() uit pidlane-bt.js,
// met de 21 namen uit dat logboek in dezelfde volgorde.
//
// Draaien vanuit public/:  node test-obdnaam.js   (exit 0 = goed)
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

const bron = fs.readFileSync('pidlane-bt.js', 'utf8');
function knip(kop, staart) {
  const van = bron.indexOf(kop), tot = bron.indexOf(staart, van);
  if (van < 0 || tot < van) {
    console.log('  FOUT  ' + kop + ' niet gevonden in pidlane-bt.js — het anker is weg, deze test toetst niets meer');
    process.exit(1);
  }
  return bron.slice(van, tot);
}
const naamBron = knip('const OBD_NAME_RX', '\n// ── Omgevingsdump');
const uitBron = knip('const BT_UIT_RX', '\nasync function btAanVoorKeten(');
const sppBron = knip('async function connectSPP(spp){', '\nasync function sppOudeSluiten(');

// De scan van 19-10-2026 19:04:42, in de volgorde van het logboek.
const SCAN = ['?', '�', '?', 'KPN DIW7022', '?', 'Nuki_45AB520F', '?', '?', '?', '?',
  'LE-Bose Revolve SoundLink', 'Leapmotor_DigitalKey', '?', '[TV] Samsung 8 Series (65)', 'GPN003095',
  'Aquarium licht', '?', '?', '?', 'OBDLink MX+ 90011', 'ET-8550 Series'];

(async () => {
  console.log('\n1. isObdNaam() op de scan van 19-10');
  const c = {};
  vm.createContext(c);
  vm.runInContext(naamBron + '\nthis.isObdNaam = isObdNaam;', c);
  const ja = SCAN.filter(x => c.isObdNaam(x));
  toets('alleen de OBDLink telt als adapter', ja.length === 1 && ja[0] === 'OBDLink MX+ 90011', JSON.stringify(ja));
  toets('een SoundLink-speaker is geen adapter', !c.isObdNaam('LE-Bose Revolve SoundLink'));
  for (const echt of ['OBDLink MX+', 'vLinker MC+', 'V-LINK', 'Android-Vlink', 'OBDII', 'KONNWEI KW902', 'Vgate iCar Pro', 'ELM327 v1.5'])
    toets('herkend als adapter: ' + echt, c.isObdNaam(echt));
  toets('leeg of ontbrekend is geen adapter', !c.isObdNaam('') && !c.isObdNaam(undefined));

  console.log('\n2. connectSPP() kiest uit diezelfde scan de OBDLink');
  {
    const s = { diag: [], gekozen: null, localStorage: { getItem: () => null }, btDiag(m) { s.diag.push(m); }, btDiagDevice() {},
      doSPPConnect: (spp, adres, naam) => { s.gekozen = naam; return Promise.resolve(); }, console: { warn() {} } };
    s.window = s;
    vm.createContext(s);
    vm.runInContext(uitBron + '\n' + naamBron + '\n' + sppBron, s);
    const spp = { requestPermissions: async () => ({}), scan: async () => ({ devices: SCAN.map((name, i) => ({ name, address: 'AA:' + i })) }) };
    await s.connectSPP(spp);
    toets('eerste verbindpoging gaat naar de OBDLink', s.gekozen === 'OBDLink MX+ 90011', 'gekozen: ' + s.gekozen);

    s.gekozen = null;
    const zonder = { requestPermissions: async () => ({}), scan: async () => ({ devices: SCAN.filter(x => !/OBDLink/.test(x)).map((name, i) => ({ name, address: 'BB:' + i })) }) };
    let e = null;
    try { await s.connectSPP(zonder); } catch (x) { e = x; }
    toets('TEGENPROEF: zonder adapter in de scan wordt met niets verbonden', s.gekozen === null && e && /Geen SPP OBD2-adapter/.test(e.message), 'gekozen: ' + s.gekozen);
  }

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' toetsen ok'));
  process.exit(fout ? 1 : 0);
})();
