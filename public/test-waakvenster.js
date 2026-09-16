// ══════════════════════════════════════════════════════════════════
// test-waakvenster.js — de bereikmeter, de export en de privacygrens
// ──────────────────────────────────────────────────────────────────
// WAT HIER GETOETST WORDT EN WAAROM JUIST DIT
//
// Het waakvenster tekent vooral; tekenen toets je in de browser. Maar er
// zitten drie stukken echte beslissing in, en die horen hier:
//
//   1. DE BEREIKMETER. Dat is het enige eigen rekenwerk van de module:
//      waar valt deze waarde tussen de min en max van de definitie. Een
//      off-by-one of een omgedraaide clamp zet de marker stilletjes op de
//      verkeerde plek — zichtbaar verkeerd voor niemand, want een balkje
//      van 40% ziet er net zo geloofwaardig uit als een van 60%.
//
//   2. DE EXPORT. Een CSV met een verschoven kolom is erger dan geen CSV,
//      want je merkt het pas als je verderop conclusies trekt.
//
//   3. DE PRIVACYGRENS. Een VIN is via het RDW herleidbaar tot een
//      persoon en gaat nooit ruw de telefoon uit (§7 van PIDLANE.md).
//      Deze export is een nieuw uitgaand pad en moet die regel dus
//      aantoonbaar volgen. Dat is geen stijlvraag maar de enige regel in
//      dit project die niet buigt, en dus hoort er een poort omheen die
//      rood wordt als iemand `vin` aan de bundel toevoegt.
//
// De module wordt geladen, niet overgeschreven: `PLWaakUI._bereikMeter`,
// `._bundel` en `._csv` staan in de export omdat dit de haken zijn die
// getoetst horen te worden. Verdwijnt er een, dan stopt deze test met een
// duidelijke melding in plaats van stilletjes minder te dekken.
//
// Draaien vanuit public/:  node test-waakvenster.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function t(naam, gemeten, verwacht) {
  if (String(gemeten) === String(verwacht)) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + gemeten + ', wilde ' + verwacht); }
}
function lees(f) { return fs.readFileSync(__dirname + '/' + f, 'utf8'); }

// ── sandbox: echte definities, nep scherm ─────────────────────────
function bouw(waak, veh) {
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() {}, warn() {}, error() {} };
  const el = () => ({
    style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    dataset: {}, textContent: '', children: [], innerHTML: '',
    appendChild() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, setAttribute() {}, getAttribute: () => null
  });
  s.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: el, addEventListener() {}, body: el(), head: el()
  };
  s.setTimeout = () => 0; s.setInterval = () => 0;
  s.clearInterval = () => {}; s.clearTimeout = () => {};
  s.navigator = {};
  vm.createContext(s);

  // De echte PID-tabellen: zo rekent de meter met -40…215 voor koelwater en
  // niet met een in deze test verzonnen bereik. Precies de fout die
  // test-waakronde.js in zijn voorganger vond.
  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });
  vm.runInContext(`
    var APP_VERSION='test';
    var vehicleInfo=${JSON.stringify(veh || null)};
    function getPidDef(pid){ return ALL_PID_DEFS[pid]||null; }
    function fv(v){ return String(v); }
    function showToast(){}
  `, s, { filename: 'sandbox-omgeving' });
  s.PLWaak = waak;

  vm.runInContext(lees('pidlane-waakvenster.js'), s, { filename: 'pidlane-waakvenster.js' });

  if (!s.PLWaakUI || !s.PLWaakUI._bereikMeter || !s.PLWaakUI._bundel || !s.PLWaakUI._csv) {
    console.error('FOUT: PLWaakUI._bereikMeter/_bundel/_csv ontbreken — is de export gewijzigd?');
    process.exit(1);
  }
  return s;
}

function nepWaak(hist) {
  return {
    actief: () => true, historie: () => hist, ronde: () => 3, sinds: () => 1000,
    lijst: () => [], genegeerd: () => [], schakel() {}, herstel() {}
  };
}

// Percentage uit het style-attribuut van de marker halen.
function pos(html) {
  const m = /left:([\d.]+)%/.exec(html);
  return m ? Number(m[1]) : null;
}

// ══════════════════════════════════════════════════════════════════
console.log('\n— de bereikmeter —');
{
  const s = bouw(nepWaak([]));
  const M = s.PLWaakUI._bereikMeter;
  const d = s.ALL_PID_DEFS['0105'];

  // Het bereik komt uit de échte tabel; klopt dat niet, dan slaan de
  // getallen hieronder nergens op en zegt deze test dat meteen.
  t('koelwater heeft het verwachte bereik', d.min + '/' + d.max, '-40/215');

  const midden = d.min + (d.max - d.min) / 2;
  t('midden van het bereik staat op 50%', pos(M('0105', midden, 'ok')), 50);
  t('de ondergrens staat op 0%',          pos(M('0105', d.min, 'ok')), 0);
  t('de bovengrens staat op 100%',        pos(M('0105', d.max, 'ok')), 100);

  // Een kwart erin: dit is de toets die een omgedraaide of geschaalde
  // berekening rood maakt. 50% zou ook uit v/max komen, 0 en 100 ook uit
  // een clamp zonder rekenwerk — een kwart komt alleen uit de juiste som.
  const kwart = d.min + (d.max - d.min) * 0.25;
  t('een kwart erin staat op 25%', pos(M('0105', kwart, 'ok')), 25);

  // Buiten het bereik: klemmen én oranje. Zonder de clamp schuift de
  // marker het balkje uit en staat hij onzichtbaar naast de baan.
  t('ver boven het bereik klemt op 100%', pos(M('0105', 5000, 'let')), 100);
  t('ver onder het bereik klemt op 0%',   pos(M('0105', -5000, 'let')), 0);
  t('buiten het bereik kleurt oranje', /background:#e0972f/.test(M('0105', 5000, 'let')), true);
  t('binnen het bereik kleurt groen',  /background:#4f9c5a/.test(M('0105', midden, 'ok')), true);

  t('zonder meting geen marker', /niet gemeten/.test(M('0105', undefined, 'leeg')), true);
  t('onbekende pid geeft geen bereik', /geen bereik bekend/.test(M('FFFF', 10, 'ok')), true);
}

console.log('\n— de export —');
{
  const hist = [
    { pid: '0105', n: 9, ok: 7, let: 2, stil: 0, eerst: 100, laatst: 900,
      staat: 'let', waarde: 233, reden: 'boven verwacht bereik', min: 80, max: 233, rondes: 3 },
    { pid: '010C', n: 4, ok: 4, let: 0, stil: 0, eerst: 200, laatst: 800,
      staat: 'ok', waarde: 1500, reden: '', min: 900, max: 2100, rondes: 3 }
  ];
  const s = bouw(nepWaak(hist));
  const b = s.PLWaakUI._bundel();

  t('bundel draagt beide sensoren', b.sensoren.length, 2);
  t('bundel draagt het type', b.type, 'pidlane-waakronde');
  t('tellingen komen ongewijzigd mee', b.sensoren[0].buiten, 2);
  t('de reden komt mee', b.sensoren[0].reden, 'boven verwacht bereik');
  t('het gemeten bereik komt mee', b.sensoren[1].min + '/' + b.sensoren[1].max, '900/2100');

  const c = s.PLWaakUI._csv().split('\n');
  const kop = c[0].split(';');
  t('csv heeft één kopregel plus twee rijen', c.length, 3);
  t('elke rij heeft evenveel velden als de kop',
    c.slice(1).every(r => r.split(';').length === kop.length), true);
  t('kolom "reden" staat waar de kop hem belooft',
    c[1].split(';')[kop.indexOf('reden')], '"boven verwacht bereik"');
  t('kolom "laatste_waarde" draagt het getal',
    c[1].split(';')[kop.indexOf('laatste_waarde')], '233');
}

console.log('\n— de privacygrens —');
{
  // Een volledig voertuigdossier mét VIN erin. Komt de VIN toch in de
  // bundel, dan is er een uitgaand pad bijgekomen dat §7 overtreedt.
  const veh = { merk: 'Mazda', model: 'CX-5', year: 2019, brandstof: 'benzine',
                vin: 'JMZKE2W7A00123456' };
  const s = bouw(nepWaak([{ pid: '0105', n: 1, ok: 1, let: 0, stil: 0, eerst: 1, laatst: 2,
                            staat: 'ok', waarde: 90, reden: '', min: 90, max: 90, rondes: 1 }]), veh);
  const json = JSON.stringify(s.PLWaakUI._bundel());

  t('het merk komt wél mee', /Mazda/.test(json), true);
  t('de VIN staat NIET in de export', /JMZKE2W7A00123456/.test(json), false);
  t('ook het veld vin ontbreekt', /"vin"/.test(json), false);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n' + (fout ? '✖ ' + fout + ' fout' : '✔ alles goed') + ' — ' + ok + ' geslaagd\n');
process.exit(fout ? 1 : 0);
