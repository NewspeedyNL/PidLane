// ══════════════════════════════════════════════════════════════════
// test-werkgebied.js — PLWerkgebied: last × toeren, trim per gebied en de
// lambdasonde voor het profiel Klassiek (22-11-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-werkgebied.js in een vm en toetst:
//   • het raster: het juiste vak, ook bij een waarde buiten de schaal;
//   • tijd telt alleen tussen metingen, hooguit DT_MAX per stap, en na een
//     lange pauze begint een nieuwe rit;
//   • de trim telt alleen met een warme motor (closed loop);
//   • het oordeel onderscheidt valse lucht (arm bij stationair) van de
//     toevoer (arm bij zware last) en van "overal arm";
//   • de sonde: schakelen, hangen, traag, koud;
//   • voed(): last en trims moeten vers zijn om bij een toerental te horen.
// Elke controle met een tegenproef: de fout die hij hoort te vangen.
//
// Draaien vanuit public/:  node test-werkgebied.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const BRON = fs.readFileSync(__dirname + '/pidlane-werkgebied.js', 'utf8');
function laad(bron) {
  const c = { console: { log() {}, warn() {}, error() {} } };
  c.window = c; vm.createContext(c);
  vm.runInContext(bron, c, { filename: 'pidlane-werkgebied.js' });
  return c.PLWerkgebied;
}
function vervang(oud, nieuw) {
  if (BRON.indexOf(oud) < 0) throw new Error('anker verdwenen: ' + oud);
  return BRON.replace(oud, nieuw);
}
const W = laad(BRON);

console.log('\n1. Het raster');
waar('0 tpm, 0% = linksonder (vak 0)', W.cel(0, 0, 8000) === 0);
waar('4000 tpm, 50% = kolom 6, rij 4', W.cel(4000, 50, 8000) === 4 * W.NX + 6, String(W.cel(4000, 50, 8000)));
waar('boven de schaal blijft in het laatste vak', W.cel(9500, 140, 8000) === W.NX * W.NY - 1);
waar('geen toerental = geen vak', W.cel(null, 40, 8000) === null && W.cel('', 40, 8000) === null);
waar('tegenproef: zonder begrenzing valt 9500 tpm buiten het raster',
  laad(vervang('Math.min(NX-1, Math.max(0, Math.floor(r/rpmMax*NX)))', 'Math.floor(r/rpmMax*NX)')).cel(9500, 140, 8000) !== W.NX * W.NY - 1);

console.log('\n2. Tijd en pauze');
{
  let m = W.voeg(null, { rpm: 2000, last: 30, rpmMax: 8000 }, 1000);
  waar('de eerste meting telt nog geen tijd', m.totaal === 0);
  m = W.voeg(m, { rpm: 2000, last: 30, rpmMax: 8000 }, 1500);
  waar('500 ms later: 500 ms in het vak', m.totaal === 500 && m.ms[W.cel(2000, 30, 8000)] === 500);
  m = W.voeg(m, { rpm: 2000, last: 30, rpmMax: 8000 }, 61500);
  waar('een gat van een minuut telt hooguit DT_MAX', m.totaal === 500 + W.DT_MAX, String(m.totaal));
  const oud = m;
  m = W.voeg(m, { rpm: 2000, last: 30, rpmMax: 8000 }, 61500 + W.PAUZE_MS + 1);
  waar('na een lange pauze een nieuwe rit', m.totaal === 0 && oud.totaal === 500 + W.DT_MAX);
  const T = laad(vervang('const dt=Math.min(DT_MAX, t-m.t);', 'const dt=t-m.t;'));
  let n = T.voeg(null, { rpm: 2000, last: 30, rpmMax: 8000 }, 0); n = T.voeg(n, { rpm: 2000, last: 30, rpmMax: 8000 }, 60000);
  waar('tegenproef: zonder DT_MAX telt een gat van een minuut als rijtijd', n.totaal === 60000);
}

console.log('\n3. Trim alleen met een warme motor');
{
  const rij = (Wx, koel) => { let m = Wx.voeg(null, { rpm: 800, last: 20, trim: 12, koel: koel, rpmMax: 8000 }, 0);
    for (let t = 1000; t <= 20000; t += 1000) m = Wx.voeg(m, { rpm: 800, last: 20, trim: 12, koel: koel, rpmMax: 8000 }, t);
    return Wx.trimPerGebied(m); };
  waar('warm (90 °C): 20 s stationair geeft +12%', Math.abs(rij(W, 90).stationair - 12) < 1e-9);
  waar('koud (40 °C): geen trim — open loop', rij(W, 40).stationair === null);
  waar('tegenproef: zonder de warmtegrens telt de koude motor mee',
    laad(vervang('k!==null && k>=WARM &&', '')).trimPerGebied !== undefined && rij(laad(vervang('k!==null && k>=WARM &&', '')), 40).stationair !== null);
  waar('minder dan 10 s in een gebied = nog geen oordeel', (() => { let m = W.voeg(null, { rpm: 800, last: 20, trim: 5, koel: 90, rpmMax: 8000 }, 0);
    for (let t = 1000; t <= 5000; t += 1000) m = W.voeg(m, { rpm: 800, last: 20, trim: 5, koel: 90, rpmMax: 8000 }, t); return W.trimPerGebied(m).stationair === null; })());
  waar('gebieden: 800/20 stationair, 2500/40 deellast, 3000/75 zwaar',
    W.gebied(800, 20) === 'stationair' && W.gebied(2500, 40) === 'deellast' && W.gebied(3000, 75) === 'zwaar');
}

console.log('\n4. Het oordeel over de trims');
const O = (s, d, z) => W.trimOordeel({ stationair: s, deellast: d, zwaar: z });
waar('alles binnen ±10% = in orde', O(3, 4, 6).st === 'ok');
waar('arm bij stationair, normaal bij deellast = valse lucht', O(14, 3, 2).tekst === 'arm bij stationair' && /valse lucht/.test(O(14, 3, 2).uitleg));
waar('arm bij zware last, normaal bij deellast = toevoer', O(2, 3, 14).tekst === 'arm bij zware last' && /toevoer/.test(O(2, 3, 14).uitleg));
waar('overal even arm = meting, geen lek', O(12, 12, 13).tekst === 'overal wat arm');
waar('20% of meer = slecht, ook als het maar één gebied is', O(3, 22, null).st === 'slecht');
waar('rijk heet rijk', O(-12, -11, null).tekst === 'overal wat rijk' && O(-22, null, null).tekst === 'erg rijk');
waar('niets gemeten = meet nog', O(null, null, null).st === 'meet');
waar('tegenproef: zonder het verschil met deellast heet "overal arm" ook valse lucht',
  laad(vervang('s>=10 && s-d>=8', 's>=10')).trimOordeel({ stationair: 12, deellast: 12, zwaar: 13 }).tekst === 'arm bij stationair');

console.log('\n5. De lambdasonde');
const golf = (vs) => vs.map((v, i) => ({ t: 10000 + i * 500, v: v }));
const nu = 10000 + 19 * 500;
waar('heen en weer tussen 0,1 en 0,8 V = schakelt', W.o2Oordeel(golf([.1, .8, .2, .75, .15, .8, .1, .7, .2, .8]), nu, true).tekst === 'schakelt');
waar('onder 0,45 V = hangt arm (geel, niet rood)', (() => { const o = W.o2Oordeel(golf([.1, .12, .2, .15, .1, .2, .18]), nu, true); return o.tekst === 'hangt arm' && o.st === 'let'; })());
waar('boven 0,45 V = hangt rijk', W.o2Oordeel(golf([.7, .8, .75, .72, .78, .8]), nu, true).tekst === 'hangt rijk');
waar('0,35–0,55 V = traag', W.o2Oordeel(golf([.35, .5, .4, .55, .38, .52]), nu, true).tekst === 'traag');
waar('koude motor: geen oordeel', W.o2Oordeel(golf([.1, .12, .2, .15, .1, .2]), nu, false).st === 'meet');
waar('metingen ouder dan het venster tellen niet', W.o2Oordeel([{ t: 0, v: .1 }, { t: 1, v: .9 }, { t: 2, v: .1 }, { t: 3, v: .9 }, { t: 4, v: .1 }, { t: 5, v: .9 }], 60000, true).st === 'meet');
waar('tegenproef: zonder de koudegrens hangt een koude motor arm',
  laad(vervang("if(warm===false) return", "if(false) return")).o2Oordeel(golf([.1, .12, .2, .15, .1, .2]), nu, false).tekst === 'hangt arm');

console.log('\n6. voed(): wat bij een toerental hoort');
{
  const V = laad(BRON);
  V.voed('koel', 90, 0); V.voed('last', 30, 0); V.voed('kort', 2, 0); V.voed('lang', 5, 0);
  V.voed('toeren', 2000, 100, 8000); V.voed('toeren', 2000, 1100, 8000);
  let L = V.live(1100);
  waar('verse last: de tijd telt', L.model.totaal === 1000, String(L.model.totaal));
  waar('trim = kort + lang', L.model.trim.deellast.som === 7 * 1000, String(L.model.trim.deellast.som));
  V.voed('toeren', 2000, 6000, 8000);   // last is nu 6 s oud
  L = V.live(6000);
  waar('oude last (6 s): het toerental telt niet', L.model.totaal === 1000, String(L.model.totaal));
  waar('warm volgt het koelwater', L.warm === true);
  const T = laad(vervang('const last=vers(\'last\', nu, VERS_MS);', 'const last=vers(\'last\', nu, 1e12);'));
  T.voed('last', 30, 0); T.voed('toeren', 2000, 100, 8000); T.voed('toeren', 2000, 6000, 8000);
  waar('tegenproef: zonder versheidsgrens telt een last van 6 s oud mee', T.live(6000).model.totaal > 0);
  V.voed('o2', .2, 7000); V.voed('o2', .8, 40000);
  waar('de sonde bewaart alleen de laatste 30 s', V.live(40000).o2.length === 1);
}

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + (ok + fout) : 'goed: ' + ok + ' ok, 0 fout'));
process.exit(fout ? 1 : 0);
