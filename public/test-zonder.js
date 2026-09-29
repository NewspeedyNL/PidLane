// ══════════════════════════════════════════════════════════════════
// test-zonder.js — de app zonder adapter (PLZonder)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (29-09-2026)
// De kenteken-check zegt dingen waar iemand op handelt: "APK verlopen",
// "niet verzekerd", "tellerstand onlogisch", "terugroepactie open". Die
// moeten kloppen, en een veld dat het RDW niet geeft mag nooit als "?" of
// "undefined" in beeld komen. Dit toetst de pure kern met echte RDW-rijen
// (veldnamen zoals opendata.rdw.nl ze levert) en de foutcode-uitleg tegen
// de echte tabellen uit pidlane-data.js — niet tegen een verzonnen kopie.
//
// Laadt de echte pidlane-zonder.js. Draaien vanuit public/:
//   node test-zonder.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const ctx = { console: { log() {}, warn() {}, error() {} }, document: { readyState: 'loading', addEventListener() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-zonder.js'), 'utf8'), ctx, { filename: 'pidlane-zonder.js' });
if (!ctx.PLZonder || !ctx.PLZonder._kern) { console.log('FOUT PLZonder hangt zijn kern niet meer naar buiten'); process.exit(1); }
const K = ctx.PLZonder._kern;

const NU = new Date('2026-09-29T10:00:00').getTime();

console.log('1. Invoer schoonmaken');
toets('kenteken: streepjes, spaties en kleine letters weg', K.normKent(' 12-abc-3 ') === '12ABC3');
toets('foutcode: p0301 → P0301', K.normCode('p0301') === 'P0301');
toets('foutcode: een kale 0301 is een motorcode', K.normCode('0301') === 'P0301');
toets('foutcode: U0100 en C1234 zijn geldig', K.normCode('U0100') === 'U0100' && K.normCode('c1234') === 'C1234');
toets('foutcode: onzin wordt niets', K.normCode('X1234') === null && K.normCode('P9301') === null && K.normCode('P03') === null && K.normCode('') === null);

console.log('\n2. Dagen tot een RDW-datum');
toets('morgen is 1', K.dagenTot('20260930', NU) === 1);
toets('gisteren is -1', K.dagenTot('20260928', NU) === -1);
toets('ISO-vorm uit vervaldatum_apk_dt werkt ook', K.dagenTot('2026-10-29T00:00:00.000', NU) === 30);
toets('geen datum is null, geen 0', K.dagenTot('', NU) === null && K.dagenTot('onzin', NU) === null);

console.log('\n3. Het overzicht van een gezonde auto');
const gezond = {
  kenteken: 'AB123C', merk: 'MAZDA', handelsbenaming: 'CX-5', vervaldatum_apk: '20270512', datum_tenaamstelling: '20210301',
  datum_eerste_toelating: '20180315', datum_eerste_tenaamstelling_in_nederland: '20180315', wam_verzekerd: 'Ja',
  tellerstandoordeel: 'Logisch', jaar_laatste_registratie_tellerstand: '2025', openstaande_terugroepactie_indicator: 'Nee',
  export_indicator: 'Nee', wacht_op_keuren: 'Geen verstrekking in Open Data', maximum_trekken_massa_geremd: '1800',
  maximum_massa_trekken_ongeremd: '750', massa_rijklaar: '1545', cilinderinhoud: '1998', aantal_cilinders: '4',
  eerste_kleur: 'GRIJS', catalogusprijs: '32990'
};
const bsGezond = [{ brandstof_omschrijving: 'Benzine', brandstofverbruik_gecombineerd: '6.6', co2_uitstoot_gecombineerd: '152', emissiecode_omschrijving: '6' }];
const o = K.rdwOverzicht(gezond, bsGezond, NU);
const regel = (label) => o.regels.find((r) => r.label === label);
toets('naam uit merk, model en jaar', o.naam === 'MAZDA CX-5 (2018)', o.naam);
toets('APK ver weg is groen, met datum en dagen', regel('APK geldig tot') && regel('APK geldig tot').ernst === 'groen' && /12-05-2027/.test(regel('APK geldig tot').waarde) && o.keuring.dagen > 200);
toets('verzekerd, NAP logisch en geen terugroepactie zijn groen',
  regel('WAM-verzekerd').ernst === 'groen' && regel('Tellerstand (NAP)').ernst === 'groen' && regel('Terugroepactie').ernst === 'groen');
toets('niets dat aandacht vraagt', o.aandacht === 0, JSON.stringify(o.regels.filter((r) => r.ernst === 'rood' || r.ernst === 'oranje')));
toets('trekgewicht geremd en ongeremd', /1\.800 kg geremd/.test(regel('Trekgewicht').waarde) && /750 kg ongeremd/.test(regel('Trekgewicht').waarde), regel('Trekgewicht') && regel('Trekgewicht').waarde);
toets('verbruik met komma, en de kanttekening dat het de typekeuring is', /6,6 l\/100 km/.test(regel('Verbruik volgens de typekeuring').waarde) && /praktijk/.test(regel('Verbruik volgens de typekeuring').waarde));
toets('emissiecode 6 wordt Euro 6', regel('Emissieklasse').waarde === 'Euro 6');
toets('geen import-regel als eerste toelating en eerste NL in hetzelfde jaar vallen', !regel('In Nederland sinds'));
toets('"Geen verstrekking" bij wacht_op_keuren is geen keuringsblokkade', !regel('Wacht op keuren'));
toets('geen enkele waarde is ?, null of undefined', o.regels.every((r) => !/^\?$|null|undefined|NaN/.test(r.waarde)), JSON.stringify(o.regels.map((r) => r.waarde)));

console.log('\n4. Wat aandacht vraagt');
const slecht = Object.assign({}, gezond, {
  vervaldatum_apk: '20260920', wam_verzekerd: 'Nee', tellerstandoordeel: 'Onlogisch', openstaande_terugroepactie_indicator: 'Ja',
  datum_eerste_tenaamstelling_in_nederland: '20210601', wacht_op_keuren: 'Ja', export_indicator: 'Ja'
});
const s = K.rdwOverzicht(slecht, bsGezond, NU);
const sr = (label) => s.regels.find((r) => r.label === label);
toets('APK verlopen is rood, met hoe lang al', sr('APK geldig tot').ernst === 'rood' && /verlopen sinds 20-09-2026 \(9 dagen\)/.test(sr('APK geldig tot').waarde), sr('APK geldig tot').waarde);
toets('niet verzekerd is rood', sr('WAM-verzekerd').ernst === 'rood');
toets('tellerstand onlogisch is rood (en "Onlogisch" wordt niet als "logisch" gelezen)', sr('Tellerstand (NAP)').ernst === 'rood');
toets('openstaande terugroepactie is rood', sr('Terugroepactie').ernst === 'rood');
toets('wacht op keuren is rood', sr('Wacht op keuren') && sr('Wacht op keuren').ernst === 'rood');
toets('import wordt gezien (eerste NL-registratie in een later jaar)', sr('In Nederland sinds') && /geïmporteerd/.test(sr('In Nederland sinds').waarde));
toets('de telling klopt: vijf rode punten plus export (import is informatie, geen probleem)', s.aandacht === 6, String(s.aandacht));
const bijna = K.rdwOverzicht(Object.assign({}, gezond, { vervaldatum_apk: '20261015' }), [], NU);
toets('APK binnen 30 dagen is oranje', bijna.regels.find((r) => r.label === 'APK geldig tot').ernst === 'oranje');

console.log('\n5. Wat het RDW niet geeft, komt er niet in');
const kaal = K.rdwOverzicht({ merk: 'FIAT', handelsbenaming: 'PANDA' }, [], NU);
toets('een kale rij geeft alleen een naam, geen lege regels', kaal.naam === 'FIAT PANDA' && kaal.regels.length === 0 && kaal.keuring === null, JSON.stringify(kaal.regels));
const val = K.rdwOverzicht({ merk: 'x', handelsbenaming: '???' }, [], NU, { velden: { merk: 'Fiat', model: 'Panda', year: '2012' } });
toets('de validatie van de koopcheck wint van de ruwe velden', val.naam === 'Fiat Panda (2012)', val.naam);

console.log('\n6. De kaart op het startscherm');
const kk = (st) => JSON.stringify(K.kaartKnoppen(st));
toets('verbonden: geen kaart', kk({ verbonden: true, klant: true, demoMag: true }) === '[]');
toets('demo: alleen stoppen', kk({ demo: true, klant: true, demoMag: true }) === '["demoStop"]');
toets('niet verbonden, klant: kenteken, foutcode, simuleer, garage', kk({ klant: true, demoMag: true }) === '["kenteken","foutcode","simuleer","garage"]');
toets('demo uitgezet door beheer: geen simuleerknop', kk({ klant: false, demoMag: false }) === '["kenteken","foutcode"]');

console.log('\n7. Foutcodes tegen de echte tabellen');
{
  const d = { console: { log() {}, warn() {} } };
  d.window = d;
  vm.createContext(d);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-data.js'), 'utf8'), d, { filename: 'pidlane-data.js' });
  const DB = vm.runInContext('typeof DTCDB!=="undefined"?DTCDB:window.DTCDB', d);
  const MERK = vm.runInContext('typeof DTC_MERK!=="undefined"?DTC_MERK:window.DTC_MERK', d);
  if (!DB) { console.log('FOUT DTCDB niet geladen uit pidlane-data.js'); process.exit(1); }
  const sevs = new Set();
  Object.values(DB).forEach((r) => sevs.add(r.sev));
  if (MERK) Object.values(MERK).forEach((g) => Object.values(g).forEach((r) => sevs.add(r.sev)));
  const onbekend = [...sevs].filter((x) => !K.ERNST[x]);
  toets('elke ernst uit DTCDB en DTC_MERK krijgt een oordeel', onbekend.length === 0, 'geen oordeel voor: ' + onbekend.join(', '));
  const codes = Object.keys(DB);
  const nietTeTypen = codes.filter((c) => K.normCode(c) !== c);
  toets('elke code uit DTCDB is in te typen (normCode keurt hem niet af)', nietTeTypen.length === 0, nietTeTypen.slice(0, 5).join(', '));
  const eenHoge = codes.find((c) => DB[c].sev === 'high');
  const oo = K.codeOordeel(eenHoge, DB[eenHoge]);
  toets('een ernstige code is rood, met advies', oo.ernst === 'rood' && /nakijken/.test(oo.ernstTekst) && !oo.onbekend);
  const on = K.codeOordeel('P3999', { desc: 'Onbekende code', body: 'Raadpleeg fabrikantdocumentatie.', sev: 'med' });
  toets('een onbekende code krijgt geen ernst (dtcInfo geeft dan "med", maar dat is een standaard, geen oordeel)', on.onbekend && on.ernst === null);
  toets('P0 is algemeen, P1 per fabrikant, U is communicatie',
    /algemene/.test(K.codeOordeel('P0301', {}).soort) && /fabrikant/.test(K.codeOordeel('P1301', {}).soort) && /communicatie/.test(K.codeOordeel('U0100', {}).groep));
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
