// test-ritrapport.js — toetst dat het ritrapport er KOMT, en dat de cijfers
// die erin staan ook naar de AI gaan (#196, #188).
//
// Twee vragen, en de eerste kostte een gebruiker dertien minuten meten:
//
//   1. Overleeft generateRitRapport() een rit met een onderbreking erin?
//      Tot 11-09-2026 niet: ritLogs droeg fase-regels (mét stats) én
//      onderbrekingsregels (zonder), het rapport las beide als fases, en
//      Object.values(undefined) gooide vóór de AI-call.
//   2. Krijgt het model dezelfde cijfers als de gebruiker? Tot 11-09-2026
//      ging alleen het gemiddelde over de lijn terwijl het tekstbestand min,
//      max en het aantal metingen had — en een gemiddelde verstopt precies de
//      piek waar een analyse over hoort te gaan.
//
// De opzet is die van test-ritpauze.js: pidlane-rit.js draait écht in een
// vm-context met een gestuurde klok, dus de onderbreking ontstaat langs het
// echte pad (visibilitychange → _ritHervat) en niet uit een nagebouwde lijst.
//
// Draaien vanuit public/:  node test-ritrapport.js
'use strict';
const fs = require('fs');
const vm = require('vm');

// ── Gestuurde klok ─────────────────────────────────────────────────
let NU = 1785600000000;
const timers = [];
async function loopTot(doel) {
  while (NU < doel) {
    const kand = timers.filter(t => t.actief && t.at <= doel);
    if (!kand.length) { NU = doel; return; }
    kand.sort((a, b) => a.at - b.at);
    const t = kand[0];
    NU = t.at;
    if (t.herhaal) t.at = NU + t.ms; else t.actief = false;
    t.fn();
    await new Promise(r => setImmediate(r));   // analyseRitFase is async
  }
}

// ── DOM-stub ───────────────────────────────────────────────────────
const els = {};
function el(id) {
  if (!els[id]) els[id] = { id, style: {}, textContent: '', innerHTML: '',
    classList: { add() {}, remove() {} }, prepend() {}, appendChild() {}, remove() {},
    querySelectorAll: () => [], addEventListener() {}, children: [] };
  return els[id];
}
let zichtbaar = 'visible';
const luisteraars = {};
const document = {
  getElementById: el,
  createElement: () => ({ style: {}, textContent: '', innerHTML: '', appendChild() {}, classList:{add(){},remove(){}} }),
  querySelectorAll: () => [],
  body: { appendChild() {} },
  addEventListener: (n, f) => { (luisteraars[n] = luisteraars[n] || []).push(f); },
  get visibilityState() { return zichtbaar; }
};
function zichtbaarheid(v) { zichtbaar = v; (luisteraars['visibilitychange'] || []).forEach(f => f()); }

// ── Wat de buitenwereld levert ─────────────────────────────────────
const logs = [];
let gevangenPrompt = null, gevangenAanlevering = null, aiFaalt = null;
const bestanden = [];
const ctx = {
  document, window: {}, console,
  Date: new Proxy(Date, { get: (t, p) => p === 'now' ? (() => NU) : t[p], construct: (t, a) => new t(...a) }),
  setTimeout: (fn, ms) => { const t = { fn, at: NU + ms, ms, actief: true, herhaal: false }; timers.push(t); return t; },
  setInterval: (fn, ms) => { const t = { fn, at: NU + ms, ms, actief: true, herhaal: true }; timers.push(t); return t; },
  clearTimeout: t => { if (t) t.actief = false; },
  clearInterval: t => { if (t) t.actief = false; },
  log: (m, s) => logs.push(String(s || '') + '|' + String(m)),
  pidVals: { '010C': 2000, '0105': 90 },
  pidHist: {}, activePIDs: new Set(), supportedPIDs: new Set(),
  connected: true, demoMode: false,
  getVehicle: () => ({ merk: 'Mazda', model: 'CX-5', year: 2018, vin: '' }),
  ensurePIDListActive() {}, pickOnderdelen: async () => [], preAnalysisCheck: async () => true,
  getPidDef: () => null, isReportableSensor: () => true, showToast() {},
  download: (naam, tekst) => bestanden.push({ naam, tekst }),
  PID_DEFS: {}, sendCmd: async () => '', fv: v => Math.round(v * 10) / 10, KERN_PIDS: [],
  _pidHealth: {}, correlationLines: () => [], plVraagMeting: async () => true,
  discoveredPIDDefs: [], ritSweepFindings: [],
  ALL_PID_DEFS: { '010C': { name: 'Toerental', unit: 'rpm' }, '0105': { name: 'Koelwater', unit: '°C' } },
  // De AI-haak: we vangen de prompt op in plaats van hem te versturen.
  apiFetch: async (prompt, tokens, sys, model, aanlevering) => {
    gevangenPrompt = prompt; gevangenAanlevering = aanlevering;
    if (aiFaalt) throw new Error(aiFaalt);
    return 'SAMENVATTING: motor loopt netjes.';
  },
  vehicleFuelType: () => 'benzine',
  buildQualityReport: () => ({ promptBlok: '' }),
  renderAIText: () => {}, activateAIPane: () => {}, exportAIReportPDF: () => {},
  koopProefritKlaar: () => {},
  plDatumLokaal: () => '2026-09-11', goHome: () => {},
  RAPPORT_DISCLAIMER: 'Let op: deze analyse is gebaseerd op live OBD2-sensordata.',
  PLMon: null, PLWizard: null
};
ctx.globalThis = ctx;
vm.createContext(ctx);
const BRUG = `
globalThis.__rit = {
  get faseIdx(){return ritFaseIdx}, get logs(){return ritLogs},
  get pauzeLog(){return ritPauzeLog},
  rapport: function(focus){ return generateRitRapport(focus); },
  stop: function(){ return stopRitAnalyse(); },
  startRit: function(fasen){
    RIT_FASEN_ACTIEF=fasen; RIT_TOTAAL=fasen.reduce((a,f)=>a+f.duur,0);
    ritActive=true; ritStartTime=Date.now(); ritLogs=[]; ritFaseData={};
    ritPauzeSinds=0; ritPauzeTotaal=0; ritPauzeLog=[]; ritFaseEind=0;
    startRitFase(0);
  }
};`;
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-rit.js', 'utf8') + BRUG, ctx, { filename: 'pidlane-rit.js' });
const R = ctx.__rit;

// ── Toetsen ────────────────────────────────────────────────────────
(async () => {

let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (!ok) { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + JSON.stringify(gemeten) + ', verwacht ' + JSON.stringify(verwacht)); }
  else console.log('  ok    ' + naam);
}

// Drie fases zodat er twee kunnen aflopen zonder dat de rit zichzelf stopt.
const FASEN = [
  { naam: 'Fase A', icon: 'A', duur: 60, pids: ['010C'], desc: '' },
  { naam: 'Fase B', icon: 'B', duur: 60, pids: ['0105'], desc: '' },
  { naam: 'Fase C', icon: 'C', duur: 60, pids: ['010C'], desc: '' }
];

// Een rit rijden met precies één onderbreking, in fase A.
async function ritMetGat() {
  bestanden.length = 0; logs.length = 0; gevangenPrompt = null;
  R.startRit(FASEN);
  ctx.pidVals['010C'] = 800;
  await loopTot(NU + 10000);
  ctx.pidVals['010C'] = 4200;                  // uitschieter: alleen in max zichtbaar
  await loopTot(NU + 10000);
  zichtbaarheid('hidden');
  await loopTot(NU + 120000);                  // twee minuten op de achtergrond
  zichtbaarheid('visible');
  ctx.pidVals['010C'] = 1500;
  await loopTot(NU + 41000);                   // fase A vol → fase B begint
  ctx.pidVals['0105'] = 88;
  await loopTot(NU + 61000);                   // fase B vol → fase C begint
}

console.log('\n— de twee soorten regels staan niet meer in één lijst (#196) —');
{
  await ritMetGat();
  toets('twee fases in ritLogs', R.logs.length, 2);
  toets('elke ritLogs-regel heeft stats', R.logs.every(l => l.stats && typeof l.stats === 'object'), true);
  toets('geen onderbrekingsregel in ritLogs', R.logs.some(l => l.type === 'onderbreking'), false);
  toets('één onderbreking in ritPauzeLog', R.pauzeLog.length, 1);
  toets('en die hangt aan fase A (index 0)', R.pauzeLog[0].faseIdx, 0);
}

console.log('\n— het rapport komt er, in plaats van om te vallen (#196) —');
{
  let gegooid = null;
  try { await R.rapport('beide'); } catch (e) { gegooid = e.message; }
  toets('generateRitRapport gooit niet', gegooid, null);
  toets('er is een tekstbestand geschreven', bestanden.length > 0, true);
  toets('de AI is werkelijk aangeroepen', gevangenPrompt !== null, true);
  toets('geen app-fout gelogd', logs.some(m => m.indexOf('err|') === 0), false);
}

console.log('\n— de AI krijgt dezelfde cijfers als de gebruiker (#188) —');
{
  toets('min gaat mee', /min 800/.test(gevangenPrompt), true);
  toets('max gaat mee — de uitschieter die het gemiddelde verstopt', /max 4200/.test(gevangenPrompt), true);
  toets('het aantal metingen gaat mee', /\d+ metingen/.test(gevangenPrompt), true);
  const gem = (gevangenPrompt.match(/Toerental=(\d+(?:\.\d+)?)rpm/) || [])[1];
  toets('en het gemiddelde ligt tussen min en max', gem > 800 && gem < 4200, true);
}

console.log('\n— de AI hoort WAAR het gat zat, niet alleen dat het er was —');
{
  const faseA = gevangenPrompt.split('\n').find(r => r.indexOf('Fase A') === 0) || '';
  const faseB = gevangenPrompt.split('\n').find(r => r.indexOf('Fase B') === 0) || '';
  toets('fase A meldt de weggevallen seconden', /120s zonder meetdata/.test(faseA), true);
  toets('fase B meldt niets — daar was geen gat', /zonder meetdata/.test(faseB), false);
  toets('de aanlevering weet welk profiel gemeten werd', gevangenAanlevering.profiel, 'rit');
}

console.log('\n— het tekstbestand draagt hetzelfde verhaal —');
{
  const t = bestanden[bestanden.length - 1].tekst;
  toets('kop meldt één onderbreking', /LET OP: 1× onderbroken/.test(t), true);
  toets('fase 1 meldt het gat', /FASE 1: Fase A \(60s\) — 120 s zonder meetdata/.test(t), true);
  toets('fase 2 meldt geen gat', /FASE 2: Fase B \(60s\)\n/.test(t), true);
  toets('de sensorregel draagt het aantal metingen', /n=\d+/.test(t), true);
}

console.log('\n— een mislukte AI-call is geen stille catch —');
{
  await ritMetGat();
  aiFaalt = 'tegoed op';
  await R.rapport('beide');
  aiFaalt = null;
  toets('de reden staat in het log', logs.some(m => m.indexOf('tegoed op') >= 0), true);
  toets('en is als fout gelogd', logs.some(m => m.indexOf('err|') === 0 && m.indexOf('tegoed op') >= 0), true);
  const t = bestanden[bestanden.length - 1].tekst;
  toets('het tekstbestand komt er alsnog', bestanden.length > 0, true);
  toets('met de reden erin', /AI-ANALYSE NIET GELUKT: tegoed op/.test(t), true);
  toets('en met de fasegegevens nog steeds erin', /FASE 1: Fase A/.test(t), true);
}

console.log('\n— de proefrit geeft de koopcheck haar bevindingen door —');
{
  // Hier stond `l.samenvatting || l.desc`: twee velden die niets in deze app
  // ooit zet. De koopcheck kreeg fasenamen met niets erachter, en omdat die
  // string niet leeg was sloeg de vangregel eronder nooit aan — een lege
  // uitslag die er gevuld uitziet, in een oordeel over een aankoop.
  await ritMetGat();
  let doorgegeven = null;
  ctx.koopProefritKlaar = t => { doorgegeven = t; };
  ctx.window._koopProefritActief = true;
  await R.stop();
  ctx.window._koopProefritActief = false;
  toets('de koopcheck krijgt iets door', typeof doorgegeven === 'string' && doorgegeven.length > 0, true);
  toets('met de fasenaam erin', /Fase A/.test(doorgegeven || ''), true);
  toets('en met de duiding erachter, niet een kale dubbelepunt',
        /Fase A: \S/.test(doorgegeven || ''), true);
  toets('de duiding is de echte fase-duiding',
        /binnen normaal bereik|Afwijking in deze fase/.test(doorgegeven || ''), true);
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);

})();
