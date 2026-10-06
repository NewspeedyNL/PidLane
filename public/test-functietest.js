// ══════════════════════════════════════════════════════════════════
// test-functietest.js — het oordeel van de Full function test (05-10-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-data.js, pidlane-visprofiel.js en
// pidlane-functietest.js in een vm en toetst met nagebouwde survey-objecten:
//   • een gezonde benzine-CAN-auto krijgt een hoog cijfer;
//   • een diesel zonder 015E krijgt Verbruik en Emissie als ongeschikt, en
//     dezelfde PIDs op een benzine niet (de luchtmassa telt daar wél);
//   • een diesel MET roetfilter, NOx en AdBlue krijgt Emissie wél (#393):
//     het oordeel volgt de dieselplekken van PLVisProfiel.plekkenVan();
//   • één temperatuursensor maakt de weergave Temperatuur ongeschikt;
//   • transportfouten begrenzen het cijfer, wat het gemiddelde ook zegt;
//   • een waarde buiten PID_HARD_LIMITS is een afwijkend antwoord;
//   • de groepsvraag wordt tegen losse vragen afgezet;
//   • brandstof ECU ≠ opgegeven brandstof kost punten.
// Met tegenproeven: elke controle wordt rood op de fout die hij moet vangen.
//
// Draaien vanuit public/:  node test-functietest.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
function lees(f) { return fs.readFileSync(f, 'utf8'); }
const BRON = lees('pidlane-functietest.js');
const DATA = lees('pidlane-data.js'), VIS = lees('pidlane-visprofiel.js');

function laad(bron) {
  const c = { console: { log() {}, warn() {}, error() {} }, localStorage: { getItem() { return null; }, setItem() {} } };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(DATA, c, { filename: 'pidlane-data.js' });
  vm.runInContext(VIS, c, { filename: 'pidlane-visprofiel.js' });
  vm.runInContext(bron, c, { filename: 'pidlane-functietest.js' });
  return c.PLFunctieTest;
}

// Een survey zoals vlFullSurvey hem bouwt. `pids` = { pid: waarde }.
function survey(pids, extra) {
  const detail = Object.keys(pids).map((pid, i) => ({ pid, naam: pid, val: pids[pid], unit: '', ms: 55 + (i % 5), st: 'ok', q: 'ok' }));
  const sv = {
    adapter: { id: 'ELM327 v1.5', volt: '14.1V', protoNum: '6', sti: '?', stn: false },
    veh: { vin: 'WVWZZZ1KZ6W000001' }, calid: { ascii: 'CAL123' },
    readiness: { monitors: [], nietGereed: [] }, bitmaps: { '0100': '41 00 BE 3F A8 13' },
    pids: { total: detail.length, ok: detail.length, nodata: 0, invalid: 0, transport: 0, detail },
    batch: { ok: true, maxPids: 6, ladder: [{ n: 2, ok: true, ms: 70 }, { n: 4, ok: true, ms: 90 }, { n: 6, ok: true, ms: 120 }] },
    timing: { rpm5: [55, 56, 58, 54, 57], avgMs: 56 }
  };
  return Object.assign(sv, extra || {});
}
const BENZINE = { '010C': 820, '010D': 0, '0105': 88, '0104': 22, '0110': 3.1, '010F': 30, '0146': 15, '015C': 90,
  '0106': 1.5, '0107': -2.3, '0124': 1.0, '013C': 420, '0111': 14, '010B': 32, '010E': 8, '012F': 60, '0142': 14.1,
  '0115': 0.7, '012C': 0, '0149': 15, '011F': 120, '0121': 0, '0133': 101 };
const DIESEL = Object.assign({}, BENZINE); delete DIESEL['0124']; delete DIESEL['0106']; delete DIESEL['0107'];

function keur(F, sv, ctx) { return F.beoordeel(sv, Object.assign({ can: true, strategie: 'snel' }, ctx || {})); }
function wg(res, id) { return res.delen.weergaven.lijst.filter(r => r.id === id)[0] || {}; }

const F = laad(BRON);

console.log('\n1. Een gezonde benzine-auto');
const goed = keur(F, survey(BENZINE), { brandstofOpgegeven: 'benzine' });
waar('cijfer ≥ 8 (' + goed.cijfer + ')', goed.cijfer >= 8, JSON.stringify(F.compact(goed)));
waar('alle vijf weergaven goed', goed.delen.weergaven.lijst.every(r => r.oordeel === 'goed'),
  goed.delen.weergaven.lijst.map(r => r.id + ':' + r.oordeel + ' ' + r.reden).join('; '));
waar('PID-overzicht kent categorie en weergave', goed.pids.some(p => p.pid === '0105' && p.cat === 'Temperatuur' && p.visueel.indexOf('temp') > -1),
  JSON.stringify(goed.pids.filter(p => p.pid === '0105')));
waar('html bevat het cijfer', F.html(goed).indexOf(goed.cijfer.toFixed(1)) > -1);

console.log('\n2. Diesel zonder 015E — dezelfde PIDs, andere weergaven');
function keurDiesel(Fx) {
  const r = keur(Fx, survey(DIESEL), { brandstofOpgegeven: 'diesel' }), b = keur(Fx, survey(DIESEL), { brandstofOpgegeven: 'benzine' });
  return { dV: wg(r, 'verbruik').oordeel, dE: wg(r, 'emissie').oordeel, bV: wg(b, 'verbruik').oordeel };
}
const d2 = keurDiesel(F);
waar('diesel: Verbruik ongeschikt (luchtmassa telt niet)', d2.dV === 'ongeschikt', 'oordeel ' + d2.dV);
waar('diesel zonder roetfilter-PIDs: Emissie ongeschikt (lambda en trims tellen niet)', d2.dE === 'ongeschikt', 'oordeel ' + d2.dE);
waar('benzine met dezelfde PIDs: Verbruik wél bruikbaar', d2.bV === 'goed', 'oordeel ' + d2.bV);
waar('tegenproef: luchtmassa ook voor diesel → Verbruik niet meer ongeschikt',
  keurDiesel(laad(BRON.replace("(okSet.has('0110') && brandstof!=='diesel')", "okSet.has('0110')"))).dV !== 'ongeschikt');
// #393: een diesel met de sensoren van zijn eigen emissiescherm.
const DPF = Object.assign({}, DIESEL, { '017A': 4.2, '017C': 310, '0183': 120, '0185': 64, '018B': 12 });
function emDpf(Fx) { return wg(keur(Fx, survey(DPF), { brandstofOpgegeven: 'diesel' }), 'emissie'); }
const eD = emDpf(F);
waar('diesel met roetfilter, NOx en AdBlue: Emissie goed, met de dieselplekken (#393)',
  eD.oordeel === 'goed' && eD.indeling.dpf === '017A' && eD.indeling.nox === '0183' && !('lambda' in eD.indeling), JSON.stringify(eD));
waar('tegenproef: zonder de dieselplekken telt de benzinekaart en is Emissie weer ongeschikt',
  emDpf(laad(BRON.replace("const plekkenVan=ctx.plekkenVan || ", "const plekkenVan="))).oordeel !== 'goed');
const ecu = keur(F, survey(DIESEL, { ecuFuel: { code: 4 } }), {});
waar('zonder opgegeven brandstof beslist de ECU (0151=4 → diesel)', ecu.brandstof === 'diesel', ecu.brandstof);

console.log('\n3. Eén temperatuursensor');
const eenTemp = Object.assign({}, BENZINE); ['010F', '0146', '015C', '013C'].forEach(p => delete eenTemp[p]);
function tempOordeel(Fx) { return wg(keur(Fx, survey(eenTemp), { brandstofOpgegeven: 'benzine' }), 'temp').oordeel; }
waar('Temperatuur ongeschikt met alleen koelwater', tempOordeel(F) === 'ongeschikt', tempOordeel(F));
waar('tegenproef: "één sensor is genoeg" maakt hem goed',
  tempOordeel(laad(BRON.replace("r.oordeel = r.gevuld>=3 ? 'goed'", "r.oordeel = r.gevuld>=1 ? 'goed'"))) === 'goed');

console.log('\n4. Transportfouten begrenzen het cijfer');
function metTransport(Fx) {
  const sv = survey(BENZINE);
  sv.pids.detail.slice(0, 6).forEach(x => { x.st = 'transport'; x.val = null; });
  sv.pids.transport = 6;
  return keur(Fx, sv, { brandstofOpgegeven: 'benzine' }).cijfer;
}
waar('6 van 23 transport → cijfer ≤ 4 (' + metTransport(F) + ')', metTransport(F) <= 4);
waar('tegenproef: zonder het plafond komt hij erboven',
  metTransport(laad(BRON.replace("{ c=Math.min(c,4); plafond.push('meer dan 20% transportfouten'); }", "{}"))) > 4);

console.log('\n5. Afwijkend antwoord: buiten de harde grens');
function afw(Fx) {
  const sv = survey(BENZINE); sv.pids.detail.filter(x => x.pid === '0105')[0].val = 250;
  return keur(Fx, sv, { brandstofOpgegeven: 'benzine' }).delen.afwijkend.lijst.map(a => a.pid + ':' + a.soort);
}
waar('0105 = 250 °C staat als buiten grens', afw(F).indexOf('0105:buiten grens') > -1, afw(F).join(', '));
waar('tegenproef: zonder de grenscontrole niet', afw(laad(BRON.replace('(x.val<h.min || x.val>h.max)', 'false'))).indexOf('0105:buiten grens') < 0);
function traag(Fx) {
  const sv = survey(BENZINE); sv.pids.detail.filter(x => x.pid === '0146')[0].ms = 900;
  return keur(Fx, sv, { brandstofOpgegeven: 'benzine' }).delen.afwijkend.lijst.map(a => a.pid + ':' + a.soort);
}
waar('0146 op 900 ms tegen ~57 mediaan staat als traag', traag(F).indexOf('0146:traag') > -1, traag(F).join(', '));

console.log('\n6. Configuratie: groep tegen los, strategie tegen meting');
const cfg = keur(F, survey(BENZINE), { brandstofOpgegeven: 'benzine', strategie: 'conservatief', profiel: { groep: { start: 3 } } }).config;
const gr = cfg.filter(a => a.wat === 'groepsvragen')[0];
waar('groepsvraag van 6 is het snelst per PID', gr && gr.beter === 6, JSON.stringify(gr));
const sg = cfg.filter(a => a.wat === 'strategie')[0];
waar('56 ms ≈ 17/s → strategie snel in plaats van conservatief', sg && sg.beter === 'snel', JSON.stringify(sg));
waar('tegenproef: met de verkeerde sortering wint de groep van 2',
  (keur(laad(BRON.replace('.sort((x,y)=>x.perPid-y.perPid)', '.sort((x,y)=>y.perPid-x.perPid)')), survey(BENZINE), { brandstofOpgegeven: 'benzine' })
    .config.filter(a => a.wat === 'groepsvragen')[0] || {}).beter !== 6);

console.log('\n7. Brandstof ECU tegen opgegeven');
function mis(Fx) { return keur(Fx, survey(BENZINE, { ecuFuel: { code: 4 } }), { brandstofOpgegeven: 'benzine' }).delen.basis; }
waar('ECU zegt diesel, opgegeven benzine → notitie en lagere basis', mis(F).score < goed.delen.basis.score && mis(F).notities.some(n => /wijkt af/.test(n)),
  JSON.stringify(mis(F)));
waar('tegenproef: zonder de kruiscontrole geen notitie', !mis(laad(BRON.replace('ecu!==opg', 'false'))).notities.some(n => /wijkt af/.test(n)));

console.log('\n8. Lege survey breekt niet');
let leeg = null; try { leeg = F.beoordeel({}, {}); } catch (e) { leeg = e; }
waar('beoordeel({}) geeft cijfer 1', leeg && leeg.cijfer === 1, String(leeg && (leeg.stack || leeg.cijfer)));

console.log('\n' + ok + ' ok, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
