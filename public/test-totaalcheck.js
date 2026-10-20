// ══════════════════════════════════════════════════════════════════
// test-totaalcheck.js — de totaalcheck in twee delen (20-10-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de échte kern (PLTotaal, tussen de ankers in pidlane-totalcheck.js),
// de échte PID-definities uit pidlane-data.js, de échte samenvatting van
// PLVerzamel en assessPidQuality. Geen eigen grenzen: 112 °C koelwater is
// afwijkend omdat ALL_PID_DEFS['0105'].dH op 110 staat.
//
//   A. deelHist: stilstand en rijden gesplitst op de snelheid van dat moment
//   B. categorieen: alleen een categorie met een afwijking gaat open
//   C. focusPlan: rijdend als de afwijking alleen rijdend zat
//   D. de prompt: een niet gemeten deel heet niet gemeten, nooit goed
//   E. de knoppen: meten zonder AI-knop en zonder rijtest, AI pas na een meting
//
// Draaien vanuit public/:  node test-totaalcheck.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
const dir = __dirname;

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
function knipTussen(src, a, b, wat) {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) { console.log('  FOUT  anker voor ' + wat + ' niet gevonden — deze test toetst niets meer'); process.exit(1); }
  return src.slice(i, j);
}
function knipFn(src, kop) { return knipTussen(src, kop, '\n}\n', kop) + '\n}\n'; }

const s = { console: { warn() {}, error() {}, log() {} } };
s.window = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync(dir + '/pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
if (!s.ALL_PID_DEFS || !s.ALL_PID_DEFS['0105']) { console.log('  FOUT  ALL_PID_DEFS niet geladen'); process.exit(1); }
s.getPidDef = (pid) => s.ALL_PID_DEFS[pid] || null;
s.pidHist = {};
const kw = fs.readFileSync(dir + '/pidlane-kwaliteit.js', 'utf8');
vm.runInContext(knipFn(kw, 'function assessPidQuality'), s);
vm.runInContext(fs.readFileSync(dir + '/pidlane-verzamel.js', 'utf8'), s, { filename: 'pidlane-verzamel.js' });
const bron = fs.readFileSync(dir + '/pidlane-totalcheck.js', 'utf8');
vm.runInContext(knipTussen(bron, '// ── PLTotaal kern begin ──', '// ── PLTotaal kern eind ──', 'PLTotaal'), s, { filename: 'pidlane-totalcheck.js' });
const T = s.PLTotaal, V = s.PLVerzamel;
// De grenzen van de meetpoort, uit pidlane-fuel.js zelf.
const fuel = fs.readFileSync(dir + '/pidlane-fuel.js', 'utf8');
const KMH = +(/const MEET_RIJ_KMH = (\d+)/.exec(fuel) || [])[1], GAT = +(/const MEET_RIJ_GAT_MS = (\d+)/.exec(fuel) || [])[1];
if (!KMH || !GAT) { console.log('  FOUT  MEET_RIJ_KMH of MEET_RIJ_GAT_MS niet gevonden in pidlane-fuel.js'); process.exit(1); }

// Een rit: 60 s stil (monster per seconde), een gat zonder snelheid van 20 s,
// dan 90 s rijden op 60 km/h. Koelwater 90 °C stil, rijdend oplopend naar 112.
const H = { '010D': [], '0105': [], '0142': [] };
for (let t = 0; t < 60; t++) { H['010D'].push({ t: t * 1000, v: 0 }); H['0105'].push({ t: t * 1000, v: 90 }); H['0142'].push({ t: t * 1000, v: 14.1 }); }
H['0105'].push({ t: 70000, v: 150 });   // midden in het gat: geen snelheid binnen GAT, telt nergens
for (let t = 80; t < 170; t++) { H['010D'].push({ t: t * 1000, v: 60 }); H['0105'].push({ t: t * 1000, v: t < 160 ? 95 : 112 }); H['0142'].push({ t: t * 1000, v: 14.0 }); }

console.log('\nA. deelHist');
const dStil = T.deelHist(H, 'stil', KMH, GAT), dRij = T.deelHist(H, 'rij', KMH, GAT);
toets('stil krijgt alleen de monsters met het voertuig stil', dStil.hist['0105'].length === 60 && dStil.hist['0105'].every(m => m.v === 90), JSON.stringify(dStil.hist['0105'].slice(-2)));
toets('rijden krijgt alleen de monsters boven de rijgrens', dRij.hist['0105'].length === 90 && dRij.hist['0105'].every(m => m.t >= 80000));
toets('een monster zonder snelheid binnen het gat telt in geen van beide', !dStil.hist['0105'].some(m => m.v === 150) && !dRij.hist['0105'].some(m => m.v === 150));
const zonder = T.deelHist({ '0105': H['0105'] }, 'rij', KMH, GAT);
toets('zonder snelheid: niets gesplitst, het deel krijgt alles en zegt dat', zonder.zonderSnelheid === true && zonder.hist['0105'].length === H['0105'].length);

const samVan = (hist) => V.samenvatting(Object.keys(hist), { hist, def: s.getPidDef, letOp: s.PID_LET_OP || {}, kwal: s.assessPidQuality });
const stil = samVan(dStil.hist), rij = samVan(dRij.hist);
const kw0105 = (sam) => sam.rijen.find(r => r.pid === '0105');
toets('de echte samenvatting: koelwater stil ok, rijdend afwijkend', kw0105(stil).oordeel === 'ok' && kw0105(rij).oordeel === 'afwijkend', kw0105(stil).oordeel + '/' + kw0105(rij).oordeel);

console.log('\nB. categorieen');
const catVan = (pid) => (s.getPidDef(pid) || {}).cat;
const cats = T.categorieen({ stil, rij }, { licht: { kleur: 'groen', kop: 'Alles in orde', tekst: '' } }, catVan, s.CHK_CAT_ORDER);
const c = (k) => cats.find(x => x.cat === k);
toets('Temp gaat open met focus (koelwater rijdend afwijkend)', c('Temp') && c('Temp').focus && c('Temp').open && c('Temp').oordeel === 'afwijkend');
toets('Electrisch blijft dicht: accu klopt stil en rijdend', c('Electrisch') && !c('Electrisch').open && !c('Electrisch').focus);
toets('een open categorie staat bovenaan', cats[0].open && cats[0].cat === 'Temp', cats.map(x => x.cat).join(','));
const pk = c('Temp').pids[0];
toets('per sensor beide delen naast elkaar', pk.stil && pk.rij && pk.stil.max === 90 && pk.rij.max === 112);
const rood = T.categorieen({ stil, rij: null }, { licht: { kleur: 'rood', kop: '1 storing gevonden' } }, catVan, s.CHK_CAT_ORDER);
const fc = rood.find(x => x.cat === 'Foutcodes');
toets('een bevestigde code: Foutcodes open en afwijkend, maar geen focusmeting', fc && fc.open && fc.oordeel === 'afwijkend' && !fc.focus);
const grijs = T.categorieen({ stil }, { licht: { kleur: 'grijs', kop: 'Nog niet uitgelezen' } }, catVan, s.CHK_CAT_ORDER).find(x => x.cat === 'Foutcodes');
toets('niet uitgelezen is nooit goed', grijs && grijs.oordeel !== 'ok' && grijs.open);

console.log('\nC. focusPlan');
const fp = T.focusPlan(c('Temp'));
toets('afwijking alleen rijdend: de focus meet rijdend', fp.rijden === true && fp.pids[0] === '0105', JSON.stringify(fp));
const accuStil = samVan({ '0142': Array.from({ length: 20 }, (_, i) => ({ t: i * 1000, v: 11.2 })) });
const accuRij = samVan({ '0142': Array.from({ length: 20 }, (_, i) => ({ t: i * 1000, v: 14.0 })) });
const ce = T.categorieen({ stil: accuStil, rij: accuRij }, null, catVan, s.CHK_CAT_ORDER).find(x => x.cat === 'Electrisch');
toets('accu laag stilstaand: focus, en die meet stilstaand', ce && ce.focus && T.focusPlan(ce).rijden === false, JSON.stringify(ce && ce.oordeel));
const veel = { pids: Array.from({ length: 12 }, (_, i) => ({ pid: 'P' + i, oordeel: i === 11 ? 'let' : 'ok', stil: { oordeel: i === 11 ? 'let' : 'ok' } })) };
const fv = T.focusPlan(veel);
toets('hoogstens acht sensoren, de afwijkende eerst', fv.pids.length === 8 && fv.pids[0] === 'P11');

console.log('\nD. stand en prompt');
toets('niets gemeten: geen AI', T.stand({}).aiMag === false && T.stand({}).volgende === 'stil');
toets('alleen stil: AI mag, rijden is de volgende stap', T.stand({ stil: { sam: stil } }).aiMag && T.stand({ stil: { sam: stil } }).volgende === 'rij');
const pb = T.promptBlok({ stil: { sam: stil, sec: 60, rijSec: 0 } }, cats, V.promptBlok);
toets('het rijdeel heet niet gemeten', /DEEL 2[^\n]*NIET GEMETEN/.test(pb) && /onder belasting/.test(pb));
toets('het stildeel draagt de samenvatting van het scherm', /DEEL 1[^\n]*\n*[\s\S]*GEMETEN OVER HET MEETVENSTER/.test(pb));
toets('de afwijkende categorie staat er met naam in', /CATEGORIEËN MET EEN AFWIJKING: Temp \(Koelwater temp\)/.test(pb), (pb.match(/CATEGORIEËN[^\n]*/) || [''])[0]);
toets('foutcodes niet uitgelezen staat er zo in', /FOUTCODES EN ZELFTESTS: niet uitgelezen/.test(pb));

console.log('\nE. de knoppen');
const gevraagd = [], verstuurd = [];
const w = {
  PLTotaal: T, PLVerzamel: { meet: (o) => { gevraagd.push(o); return Promise.resolve({ door: false }); }, promptBlok: V.promptBlok },
  PLFoutcodes: { leesStil: () => { throw new Error('mag niet: de klant sloot het scherm'); } },
  callAI: (p) => { verstuurd.push(p); return Promise.resolve(); }, preAnalysisCheck: async () => true,
  activateAIPane() {}, document: { getElementById: () => ({ disabled: false }) }, getVehicle: () => ({}),
  buildQualityReport: () => ({ promptBlok: '' }), _scenario: { enabled: false }, vehicleFuelType: () => 'benzine',
  formatDtcCodes: () => 'geen', dtcCodes: [], RAPPORT_DISCLAIMER: 'Let op.', getPidDef: s.getPidDef, CHK_CAT_ORDER: s.CHK_CAT_ORDER,
  pidVals: {}, log() {}, console: s.console, window: {}, tcTeken() {}, _tcBezig: '', _tc: { stil: null, rij: null, dtc: null, focus: {} }
};
const fn = (kop, naam) => new Function('w', 'with (w) { ' + knipFn(bron, kop) + knipFn(bron, 'function _tcCats(){') + '\n return ' + naam + '; }')(w);
(async () => {
  await fn('async function runTotalCheck(){', 'runTotalCheck')();
  await fn('async function runTotalCheckRij(){', 'runTotalCheckRij')();
  const [o1, o2] = gevraagd;
  toets('stilstand: verzamelscherm zonder AI-knop, zonder rijtest, zonder de rit van zojuist', o1 && o1.ai === false && o1.rijtest === false && o1.ritBron === false && o1.niveau === 'normaal', JSON.stringify(o1));
  toets('rijden: niveau rit, geen rijtest-knop, en tijd om weg te rijden', o2 && o2.niveau === 'rit' && o2.rijtest === false && o2.ai === false && o2.maxMs >= 5 * 60 * 1000, JSON.stringify(o2));
  toets('scherm gesloten: geen deel vastgelegd', w._tc.stil === null && w._tc.rij === null);
  const ai = fn('async function runCheckAI(){', 'runCheckAI');
  await ai();
  toets('AI-rapport zonder meting: er gaat niets naar de AI', verstuurd.length === 0);
  w._tc.stil = { sam: stil, sec: 60, rijSec: 0, ts: 1 };
  await ai();
  toets('AI-rapport na de stilstand: één vraag, met beide delen benoemd', verstuurd.length === 1 && /DEEL 1/.test(verstuurd[0]) && verstuurd[0].indexOf('GEMETEN OVER HET MEETVENSTER') >= 0 && /DEEL 2[^\n]*NIET GEMETEN/.test(verstuurd[0]), (verstuurd[0] || '').slice(0, 80));
  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
  process.exit(fout ? 1 : 0);
})();
