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
const velden = ['id', 'naam', 'kleur', 'vorm', 'betekent', 'doen', 'doorrijden'];
const onvolledig = L.filter((l) => velden.some((v) => !String(l[v] || '').trim()));
toets('elke regel heeft naam, pictogram, vorm, betekenis, advies en doorrijstand', onvolledig.length === 0, onvolledig.map((l) => l.id).join(', '));
toets('elke kleur is een bekende kleur', L.every((l) => K.KLEUR[l.kleur]), L.filter((l) => !K.KLEUR[l.kleur]).map((l) => l.id).join(', '));
toets('elke doorrijstand heeft een tekst', L.every((l) => K.DOOR[l.doorrijden]), L.filter((l) => !K.DOOR[l.doorrijden]).map((l) => l.id).join(', '));
const slechteObd = L.filter((l) => l.obd != null && l.obd !== 'check' && l.obd !== 'geen' && !PIDS.has(l.obd));
toets('elke OBD-verwijzing is check, geen, of een PID die in pidlane-data.js bestaat', slechteObd.length === 0, slechteObd.map((l) => l.id + '→' + l.obd).join(', '));

console.log('\n1b. De pictogrammen (#495)');
const P = K.PICTO || {};
const zonder = L.filter((l) => !P[l.id]);
toets('elk lampje heeft een eigen pictogram', zonder.length === 0, zonder.map((l) => l.id).join(', '));
const wees = Object.keys(P).filter((id) => !L.some((l) => l.id === id));
toets('geen pictogram zonder lampje', wees.length === 0, wees.join(', '));
toets('geen emoji meer als pictogram (het veld ico is weg)', L.every((l) => !('ico' in l)), L.filter((l) => 'ico' in l).map((l) => l.id).join(', '));
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const onveilig = Object.keys(P).filter((id) => /<script|<svg|\son[a-z]+=|href|url\(/i.test(P[id]) || EMOJI.test(P[id]));
toets('pictogrammen zijn alleen vormen: geen script, geen eigen <svg>, geen handlers, links of emoji', onveilig.length === 0, onveilig.join(', '));
const open = Object.keys(P).filter((id) => {
  const t = P[id].replace(/<(path|circle|rect)\b[^>]*\/>/g, '').replace(/<text\b[^>]*>[^<]*<\/text>/g, '').replace(/<\/?g\b[^>]*>/g, '').trim();
  return t !== '';
});
toets('alleen path, circle, rect, text en g, allemaal gesloten', open.length === 0, open.join(', '));
const dubbel = Object.keys(P).filter((id) => Object.keys(P).some((j) => j !== id && P[j] === P[id] && !((id === 'koud' && j === 'koelwater') || (id === 'koelwater' && j === 'koud'))));
toets('elk pictogram is anders (behalve koelwater en koud: dat is in de auto hetzelfde symbool in een andere kleur)', dubbel.length === 0, dubbel.join(', '));
toets('de handrem en de servicebeurt staan erin', ['handrem', 'service'].every((id) => L.some((l) => l.id === id)));
toets('de handrem lijkt niet op het remsysteem: een P, geen uitroepteken', P.handrem && P.rem && P.handrem !== P.rem && !/r="1\.8"/.test(P.handrem));
const s1 = K.svg(L.find((l) => l.id === 'olie'), 32);
toets('svg(): één <svg> met viewBox, in de kleur van het lampje', /^<svg [^>]*viewBox="0 0 48 48"/.test(s1) && (s1.match(/<svg/g) || []).length === 1 && /color:#ff3b30/.test(s1), s1.slice(0, 160));
toets('cruisecontrol en mistlicht zijn groen, zoals in de auto; grootlicht blauw', K.tint({ id: 'cruise', kleur: 'info' }) !== K.tint({ id: 'grootlicht', kleur: 'info' }) && K.tint({ id: 'mist', kleur: 'info' }) === K.tint({ id: 'cruise', kleur: 'info' }));

console.log('\n1c. Een foto laten herkennen (#492)');
const fp = K.fotoPrompt(L);
toets('de vraag noemt elk lampje met zijn id en vorm', L.every((l) => fp.indexOf(l.id + ': ' + l.naam + ' — ' + l.vorm) >= 0));
let lf = K.leesFoto('Ik zie dit:\n<lampjes>{"ids":["olie"],"zeker":"hoog"}</lampjes>', L);
toets('één lampje, zeker', lf.ids.join() === 'olie' && lf.zeker === 'hoog' && !lf.fout);
lf = K.leesFoto('<lampjes>{"ids":["turbo","olie","olie","motor","abs","banden"],"zeker":"hoog"}</lampjes>', L);
toets('een onbekend id valt weg, dubbel telt één keer, hoogstens drie', lf.ids.join() === 'olie,motor,abs', lf.ids.join());
lf = K.leesFoto('<lampjes>{"ids":["turbo"],"zeker":"hoog"}</lampjes>', L);
toets('alleen onbekend: niets, en dan ook niet "zeker"', lf.ids.length === 0 && lf.zeker === 'laag');
toets('kapotte JSON of geen blok: niets, met een reden', K.leesFoto('<lampjes>{"ids":[</lampjes>', L).ids.length === 0 && !!K.leesFoto('weet ik niet', L).fout);

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
