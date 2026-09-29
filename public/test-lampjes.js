// ══════════════════════════════════════════════════════════════════
// test-lampjes.js — de lampjesgids zegt nooit "doorrijden" bij rood
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (29-09-2026)
// De gids beantwoordt één vraag: mag ik doorrijden. Een fout daar is geen
// tikfout maar een kapotte motor of erger. Wat vast moet staan:
//   • een rood lampje is nooit "je kunt doorrijden";
//   • de lampjes die een motor in minuten slopen (olie, koelwater, remmen)
//     zeggen "niet doorrijden";
//   • het motorlampje legt het verschil tussen branden en knipperen uit;
//   • elke regel is compleet, met een bekende kleur, doorrijstand en OBD-
//     verwijzing, en een PID die bestaat in pidlane-data.js;
//   • zoeken vindt op naam, op de vorm van het pictogram en op zoekwoord.
//
// Laadt de echte pidlane-lampjes.js en pidlane-data.js. Draaien vanuit
// public/:  node test-lampjes.js   (exit 0 = goed)
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

const ctx = { console: { log() {}, warn() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-lampjes.js'), 'utf8'), ctx, { filename: 'pidlane-lampjes.js' });
if (!ctx.PLLampjes || !ctx.PLLampjes._kern) { console.log('FOUT PLLampjes hangt zijn kern niet meer naar buiten'); process.exit(1); }
const K = ctx.PLLampjes._kern, L = K.LAMPJES;

const d = { console: { log() {}, warn() {} } };
d.window = d;
vm.createContext(d);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-data.js'), 'utf8'), d, { filename: 'pidlane-data.js' });
const PIDS = new Set(Object.keys(vm.runInContext('window.ALL_PID_DEFS', d) || {}));
if (!PIDS.size) { console.log('FOUT ALL_PID_DEFS niet geladen uit pidlane-data.js'); process.exit(1); }

console.log('1. Elke regel is compleet');
toets('er staan lampjes in de gids, van alle drie de kleuren', L.length >= 20 && ['rood', 'oranje', 'info'].every((k) => L.some((l) => l.kleur === k)), String(L.length));
toets('elk id is uniek', new Set(L.map((l) => l.id)).size === L.length);
const velden = ['id', 'naam', 'kleur', 'ico', 'vorm', 'betekent', 'doen', 'doorrijden'];
const onvolledig = L.filter((l) => velden.some((v) => !String(l[v] || '').trim()));
toets('elke regel heeft naam, pictogram, vorm, betekenis, advies en doorrijstand', onvolledig.length === 0, onvolledig.map((l) => l.id).join(', '));
toets('elke kleur is een bekende kleur', L.every((l) => K.KLEUR[l.kleur]), L.filter((l) => !K.KLEUR[l.kleur]).map((l) => l.id).join(', '));
toets('elke doorrijstand heeft een tekst', L.every((l) => K.DOOR[l.doorrijden]), L.filter((l) => !K.DOOR[l.doorrijden]).map((l) => l.id).join(', '));
const slechteObd = L.filter((l) => l.obd != null && l.obd !== 'check' && l.obd !== 'geen' && !PIDS.has(l.obd));
toets('elke OBD-verwijzing is check, geen, of een PID die in pidlane-data.js bestaat', slechteObd.length === 0, slechteObd.map((l) => l.id + '→' + l.obd).join(', '));

console.log('\n2. Het advies');
const roodJa = L.filter((l) => l.kleur === 'rood' && l.doorrijden === 'ja');
toets('een rood lampje zegt nooit "je kunt doorrijden"', roodJa.length === 0, roodJa.map((l) => l.id).join(', '));
for (const id of ['olie', 'koelwater', 'rem']) {
  const l = L.find((x) => x.id === id);
  toets(id + ': niet doorrijden', l && l.doorrijden === 'nee', l ? l.doorrijden : 'ontbreekt');
}
const motor = L.find((l) => l.id === 'motor');
toets('het motorlampje legt branden en knipperen apart uit', motor && /knippert/i.test(motor.betekent) && /knippert/i.test(motor.doen) && motor.obd === 'check');
const koel = L.find((l) => l.id === 'koelwater');
toets('koelwater: het expansievat niet heet openen', koel && /níét|niet/.test(koel.doen) && /heet/.test(koel.doen));
toets('airbag en ABS zeggen dat een gewone uitlezing ze meestal niet ziet', ['airbag', 'abs'].every((id) => (L.find((l) => l.id === id) || {}).obd === 'geen'));

console.log('\n3. Zoeken');
const ids = (lijst) => lijst.map((l) => l.id);
toets('op naam: "olie" vindt de oliedruk', ids(K.zoek(L, 'olie')).indexOf('olie') >= 0);
toets('op de vorm van het pictogram: "schildpad"', ids(K.zoek(L, 'schildpad')).join() === 'vermogen');
toets('op zoekwoord: "check engine" vindt het motorlampje', ids(K.zoek(L, 'check engine')).indexOf('motor') >= 0);
toets('hoofdletters maken niet uit', ids(K.zoek(L, 'ABS')).indexOf('abs') >= 0);
toets('kleurfilter: alleen rood', K.zoek(L, '', 'rood').every((l) => l.kleur === 'rood') && K.zoek(L, '', 'rood').length > 0);
toets('onzin vindt niets', K.zoek(L, 'xyzzy').length === 0);

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
