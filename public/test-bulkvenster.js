// ══════════════════════════════════════════════════════════════════
// test-bulkvenster.js — het rekenwerk achter de bulk-analyse
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Dit venster vertelt de gebruiker in gewone zinnen wat er in een rit van
// tienduizenden regels staat. Dat is precies het soort code waar een fout
// niet opvalt: "ongeveer 41 km" ziet er even geloofwaardig uit als
// "ongeveer 14 km", en een klimvergelijking die de segmenten omdraait
// meldt doodleuk dat klimmen kóeler is dan rijden.
//
// De drie beweringen die getoetst worden:
//
//   1. ANALYSEER telt wat er staat. Segmenten, gaten (en het lángste gat,
//      wat iets anders is dan het totaal), min/max/som per sensor, en de
//      afstand als geïntegreerde snelheid.
//
//   2. DUN behoudt de pieken. Dit is de stilste van de drie. Elke n-de
//      meting nemen levert een grafiek op die er prima uitziet en precies
//      de koelwaterpiek weglaat waarvoor je kijkt. Er gaat hier dus een
//      spijker doorheen: één uitschieter in duizend regels moet de
//      uitdunning overleven.
//
//   3. CONCLUSIES noemen hun getal, en zwijgen als de grond ontbreekt.
//      De klimvergelijking mag niet verschijnen bij een handvol regels —
//      een verschil uit twintig metingen is toeval met een decimaal.
//
// De module wordt geladen, niet nagebouwd. `_analyseer`, `_conclusies` en
// `_dun` staan in de export omdat dit de haken zijn die getoetst horen te
// worden; verdwijnt er een, dan stopt deze test met een melding.
//
// Draaien vanuit public/:  node test-bulkvenster.js     (exit 0 = goed)
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

function bouw() {
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
  vm.createContext(s);

  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });
  vm.runInContext(`
    function getPidDef(pid){ return ALL_PID_DEFS[pid]||null; }
    function showToast(){}
  `, s, { filename: 'sandbox-omgeving' });

  vm.runInContext(lees('pidlane-bulkvenster.js'), s, { filename: 'pidlane-bulkvenster.js' });
  if (!s.PLBulkUI || !s.PLBulkUI._analyseer || !s.PLBulkUI._conclusies || !s.PLBulkUI._dun) {
    console.error('FOUT: PLBulkUI._analyseer/_conclusies/_dun ontbreken — is de export gewijzigd?');
    process.exit(1);
  }
  return s;
}

// Regelfabriek: t loopt per seconde, precies zoals de recorder op 1 Hz.
function rij(i, seg, v, extra) {
  const r = { t: 1000000 + i * 1000, seg: seg, n: Object.keys(v || {}).length, v: v || {} };
  if (extra) Object.assign(r, extra);
  return r;
}

const S = bouw();
const A = S.PLBulkUI._analyseer;

// ══════════════════════════════════════════════════════════════════
console.log('\n— tellen wat er staat —');
{
  const regels = [];
  for (let i = 0; i < 60; i++) regels.push(rij(i, 'rijden', { '010D': 100, '0105': 90 }));
  for (let i = 60; i < 90; i++) regels.push(rij(i, 'klim',   { '010D': 60,  '0105': 104 }));
  for (let i = 90; i < 100; i++) regels.push(rij(i, 'stil',  { '010D': 0,   '0105': 95 }));

  const a = A('s1', regels);
  t('alle regels geteld', a.regels, 100);
  t('rijden telt 60 seconden', a.segTel['rijden'], 60);
  t('klim telt 30 seconden',   a.segTel['klim'], 30);
  t('stil telt 10 seconden',   a.segTel['stil'], 10);
  t('drie aaneengesloten stukken in de tijdbalk', a.segRij.length, 3);

  // 60 s op 100 km/u = 1,667 km; 30 s op 60 = 0,5 km; stil voegt niets toe.
  t('afstand is geïntegreerde snelheid', a.afstandKm.toFixed(3), (100 * 60 / 3600 + 60 * 30 / 3600).toFixed(3));

  const kw = a.pids['0105'];
  t('koelwater 100 keer gemeten', kw.n, 100);
  t('koelwater min',  kw.min, 90);
  t('koelwater max',  kw.max, 104);
  t('koelwater gemiddelde', (kw.som / kw.n).toFixed(2), ((90 * 60 + 104 * 30 + 95 * 10) / 100).toFixed(2));
}

console.log('\n— gaten: totaal en langste zijn niet hetzelfde —');
{
  const regels = [];
  for (let i = 0; i < 10; i++) regels.push(rij(i, 'rijden', { '010D': 50 }));
  // Eén los gat, daarna een aaneengesloten reeks van vijf.
  regels.push(rij(10, 'rijden', {}, { gat: 1 }));
  for (let i = 11; i < 15; i++) regels.push(rij(i, 'rijden', { '010D': 50 }));
  for (let i = 15; i < 20; i++) regels.push(rij(i, 'rijden', {}, { gat: 1 }));
  for (let i = 20; i < 25; i++) regels.push(rij(i, 'rijden', { '010D': 50 }));

  const a = A('s2', regels);
  t('zes gatregels in totaal', a.gaten, 6);
  t('langste aaneengesloten gat is vijf', a.langsteGat, 5);

  // Oudere opnames dragen geen gat-vlag; n===0 is dezelfde toestand.
  const b = A('s3', [rij(0, 'rijden', {}), rij(1, 'rijden', { '010D': 10 })]);
  t('een regel zonder waardes telt ook zonder gat-vlag', b.gaten, 1);
}

console.log('\n— uitdunnen mag de piek niet opeten —');
{
  const D = S.PLBulkUI._dun;
  const reeks = [];
  for (let i = 0; i < 1000; i++) reeks.push({ t: i, v: 90 });
  reeks[500].v = 137;                       // de piek waar je naar zoekt
  reeks[700].v = 41;                        // en een dal

  const uit = D(reeks, 140);
  t('de reeks is echt uitgedund', uit.length < 1000, true);
  t('de piek overleeft de uitdunning', uit.some(p => p.v === 137), true);
  t('het dal overleeft ook',          uit.some(p => p.v === 41), true);
  t('de tijd loopt nog op', uit.every((p, i) => i === 0 || p.t >= uit[i - 1].t), true);

  // Een korte reeks blijft ongemoeid: uitdunnen wat al klein is, verliest
  // alleen maar.
  const kort = [{ t: 1, v: 1 }, { t: 2, v: 2 }];
  t('een korte reeks gaat ongewijzigd door', D(kort, 140).length, 2);
}

console.log('\n— conclusies noemen hun getal —');
{
  const C = S.PLBulkUI._conclusies;

  // Ruim boven de drempel aan beide kanten, met een echt verschil.
  const regels = [];
  for (let i = 0; i < 200; i++) regels.push(rij(i, 'rijden', { '010D': 90, '0105': 88 }));
  for (let i = 200; i < 400; i++) regels.push(rij(i, 'klim', { '010D': 70, '0105': 103 }));
  const bev = C(A('s4', regels));
  const klim = bev.filter(b => /Klimmen/.test(b.kop))[0];

  t('de klimvergelijking verschijnt', !!klim, true);
  t('en noemt beide gemiddelden', /88/.test(klim.tekst) && /103/.test(klim.tekst), true);
  t('een verschil van 15 °C is een aandachtspunt', klim.soort, 'let');
  t('de afstand staat erbij', bev.some(b => /afstand/i.test(b.kop)), true);

  // Onder de drempel: liever zwijgen dan een verschil melden dat toeval kan zijn.
  const kort = [];
  for (let i = 0; i < 200; i++) kort.push(rij(i, 'rijden', { '0105': 88 }));
  for (let i = 200; i < 220; i++) kort.push(rij(i, 'klim', { '0105': 103 }));
  const bev2 = C(A('s5', kort));
  const klim2 = bev2.filter(b => /Klimmen/.test(b.kop))[0];
  t('bij 20 klimregels geen vergelijking', /gemiddeld/.test(klim2.tekst), false);
  t('maar wel uitleg waaróm niet', /te weinig/.test(klim2.tekst), true);

  // Een koelwaterpiek boven 110 hoort een aandachtspunt te zijn, eronder niet.
  const heet = [];
  for (let i = 0; i < 100; i++) heet.push(rij(i, 'rijden', { '0105': i < 99 ? 95 : 118 }));
  const bevH = C(A('s6', heet)).filter(b => /Koelwater/.test(b.kop))[0];
  t('een piek van 118 °C valt op', bevH.soort, 'let');
  t('en de piek staat in de zin', /118/.test(bevH.tekst), true);

  const koel = [];
  for (let i = 0; i < 100; i++) koel.push(rij(i, 'rijden', { '0105': 92 }));
  t('92 °C is geen aandachtspunt', C(A('s7', koel)).filter(b => /Koelwater/.test(b.kop))[0].soort, 'ok');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n' + (fout ? '✖ ' + fout + ' fout' : '✔ alles goed') + ' — ' + ok + ' geslaagd\n');
process.exit(fout ? 1 : 0);
