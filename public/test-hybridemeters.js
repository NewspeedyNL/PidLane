// ══════════════════════════════════════════════════════════════════
// test-hybridemeters.js — de meters volgen de aandrijving (07-11-2026)
// ──────────────────────────────────────────────────────────────────
// Wat hier moet onderscheiden:
//   • Hyperlane op een hybride: de grote ring is de vermogensvraag (CA18),
//     op een benzineauto het toerental
//   • Temperatuur op een hybride: de HV-accu als de auto hem geeft (echte
//     OBDb-namen), anders de inlaatlucht; nooit de 12V-accusensor
//   • Emissie op een diesel-hybride: roetfilter, niet lambda
//   • Verbruik op de accu: "EV" in plaats van 0,0
//   • Hyperlane: geen "MOTOR KOUD" terwijl een hybride op de accu rijdt
//   • CA18: het pedaal wint van laden; laden is negatief
// Alles uit de bron (vm); de app-delen die er niet bij horen zijn stubs.
//
// Draaien vanuit public/:  node test-hybridemeters.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function t(naam, gemeten, verwacht) {
  if (String(gemeten) === String(verwacht)) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + gemeten + ', wilde ' + verwacht); }
}
const lees = (f) => fs.readFileSync(__dirname + '/' + f, 'utf8');

function vis(profiel, aandrijving) {
  const c = { console: { log() { }, warn() { }, error() { } }, localStorage: { getItem() { return null; }, setItem() { } } };
  c.window = c; vm.createContext(c);
  if (profiel) c.aandrijfProfielLive = () => profiel;
  if (aandrijving) c.PLAandrijving = { laatste: () => aandrijving };
  vm.runInContext(lees('pidlane-toon.js'), c, { filename: 'pidlane-toon.js' });
  vm.runInContext(lees('pidlane-visprofiel.js'), c, { filename: 'pidlane-visprofiel.js' });
  return c;
}
const alles = () => true;
const BH = { verbranding: 'benzine', vorm: 'vol', elektrisch: true }, DH = { verbranding: 'diesel', vorm: 'vol', elektrisch: true };

console.log('\n1. Hyperlane: de grote ring');
t('hybride: de ring is de vermogensvraag (CA18)', vis(BH).PLVisProfiel.indeling('hyperlane', alles, 'hybride').plekken.toeren, 'CA18');
t('… met een eigen schaal (eigenRing), niet het toerental', vis(BH).PLVisProfiel.voor('hyperlane', 'hybride', 'auto').plekken.filter((x) => x.rol === 'toeren')[0].eigenRing, true);
t('TEGENPROEF benzine: toerental', vis(null).PLVisProfiel.indeling('hyperlane', alles, 'benzine').plekken.toeren, '010C');
t('hybride zonder pedaal (geen CA18): terug naar het toerental', vis(BH).PLVisProfiel.indeling('hyperlane', (p) => p !== 'CA18', 'hybride').plekken.toeren, '010C');

console.log('\n2. Temperatuur: de aandrijfaccu');
const defs = (naam) => ({ defs: [{ pid: 'E1', name: naam, unit: '°C', min: -40, max: 100 }, { pid: 'E2', name: 'Battery temperature, battery sensor', unit: '°C' }] });
const Ptemp = (motor, naam) => vis(BH).PLVisProfiel.indeling('temp', alles, motor, defs(naam)).plekken;
t('Kia "HV battery temperature, maximum" → op de HV-plek', Ptemp('hybride', 'HV battery temperature, maximum').hvtemp, 'E1');
t('Toyota "Battery temperature TB1" → op de HV-plek', Ptemp('hybride', 'Battery temperature TB1').hvtemp, 'E1');
t('alleen de 12V-accusensor → niet die, maar de inlaatlucht', Ptemp('hybride', 'Engine oil temperature').hvtemp, '010F');
// Nagebouwd: een naam met "hybrid" én 12V. De uitsluiting moet dan winnen.
t('"Hybrid system 12V battery temperature" is de 12V-accu, niet de HV-accu', Ptemp('hybride', 'Hybrid system 12V battery temperature').hvtemp, '010F');
t('TEGENPROEF benzine: de inlaatlucht, geen HV-plek', 'inlaat' in Ptemp('benzine', 'HV battery temperature, maximum') && !('hvtemp' in Ptemp('benzine', 'HV battery temperature, maximum')), true);

console.log('\n3. Emissie op een diesel-hybride');
t('diesel-hybride: roetfilter op de lambdaplek', 'dpf' in vis(DH).PLVisProfiel.indeling('emissie', alles, 'hybride').plekken, true);
t('TEGENPROEF benzine-hybride: lambda', vis(BH).PLVisProfiel.indeling('emissie', alles, 'hybride').plekken.lambda, '0124');

console.log('\n4. Verbruik op de accu');
function verbruikTekst(toestand) {
  const els = {};
  const c = vis(BH, { toestand: toestand, motorDraait: toestand !== 'ACCU_RIJDT' });
  c.document = { getElementById: (id) => els[id] || (els[id] = { textContent: '', style: {}, classList: { add() { }, remove() { }, toggle() { } }, setAttribute() { }, getAttribute() { return null; } }) };
  vm.runInContext('document = this.document;', c);
  const P = c.PLVisProfiel, ind = P.indeling('verbruik', alles, 'hybride');
  P.bij('verbruik', ind, ind.plekken.nu, 0, 'ok');
  return els['vpf-w-nu'] ? els['vpf-w-nu'].textContent : '(geen element)';
}
t('hybride op de accu: "EV"', verbruikTekst('ACCU_RIJDT'), 'EV');
t('TEGENPROEF motor draait: het getal', verbruikTekst('DRAAIT_RIJDT') !== 'EV', true);

console.log('\n5. Hyperlane-scène');
const h = { console: { log() { }, warn() { }, error() { } } }; h.window = h; vm.createContext(h);
const HL = lees('pidlane-hyperlane.js'), a = HL.indexOf('const KOUD_C'), b = HL.indexOf('/* ── De rit ──', a);
if (a < 0 || b < 0) { console.log('FOUT: scene() niet te knippen'); process.exit(1); }
vm.runInContext(HL.slice(a, b) + '\n;this.scene=scene;', h);
t('koud koelwater, motor stil op een hybride: geen "MOTOR KOUD"', h.scene({ koel: 20, snel: 50, motorStil: true }), 'rijden');
t('TEGENPROEF zelfde koelwater, motor draait: "koud"', h.scene({ koel: 20, snel: 50, motorStil: false }), 'koud');

console.log('\n6. CA18, de vermogensvraag');
const c = { console: { log() { }, warn() { }, error() { } }, setInterval: () => 0 }; c.window = c; vm.createContext(c);
vm.runInContext(lees('pidlane-berekend.js'), c, { filename: 'pidlane-berekend.js' });
const V = c.PLBerekend.vermogensvraag;
t('pedaal 40% → +40', V(40, null), 40);
t('pedaal los, vertragen 50% → −50 (laden)', V(1, 50), -50);
t('pedaal én vertraging: het pedaal wint', V(20, 50), 20);
t('niets bekend → null', V(null, null), null);
t('CA18 alleen op een auto die elektrisch rijdt', c.PLBerekend.bronset('CA18', () => true, false, { elektrisch: false }), null);
t('… en daar wel', JSON.stringify(c.PLBerekend.bronset('CA18', () => true, false, { elektrisch: true })), JSON.stringify(['015A', '010D']));

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
