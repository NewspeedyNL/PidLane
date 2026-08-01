// test-ritpauze.js — toetst het pauzeren/hervatten van de ritanalyse.
// Laadt pidlane-rit.js in een vm-context met DOM-stubs en een gestuurde klok,
// en controleert of weggevallen achtergrondtijd niet als meettijd meetelt.
// Draaien vanuit public/:  node test-ritpauze.js
'use strict';
const fs = require('fs');
const vm = require('vm');

// ── Gestuurde klok ─────────────────────────────────────────────────
let NU = 1785600000000;
const timers = [];
async function loopTot(doel) {     // laat de klok lopen en vuur wat mag vuren
  while (NU < doel) {
    const kand = timers.filter(t => t.actief && t.at <= doel);
    if (!kand.length) { NU = doel; return; }
    kand.sort((a, b) => a.at - b.at);
    const t = kand[0];
    NU = t.at;
    if (t.herhaal) t.at = NU + t.ms; else t.actief = false;
    t.fn();
    // analyseRitFase is async: microtasks eerst legen, anders mist de test de
    // overstap naar de volgende fase.
    await new Promise(r => setImmediate(r));
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
  createElement: () => el('tmp'),
  querySelectorAll: () => [],
  body: { appendChild() {} },
  addEventListener: (n, f) => { (luisteraars[n] = luisteraars[n] || []).push(f); },
  get visibilityState() { return zichtbaar; }
};
function zichtbaarheid(v) {
  zichtbaar = v;
  (luisteraars['visibilitychange'] || []).forEach(f => f());
}

const logs = [];
const ctx = {
  document, window: {}, console,
  Date: new Proxy(Date, { get: (t, p) => p === 'now' ? (() => NU) : t[p], construct: (t, a) => new t(...a) }),
  setTimeout: (fn, ms) => { const t = { fn, at: NU + ms, ms, actief: true, herhaal: false }; timers.push(t); return t; },
  setInterval: (fn, ms) => { const t = { fn, at: NU + ms, ms, actief: true, herhaal: true }; timers.push(t); return t; },
  clearTimeout: t => { if (t) t.actief = false; },
  clearInterval: t => { if (t) t.actief = false; },
  log: (m, s) => logs.push(String(m)),
  pidVals: { '010C': 2000, '010D': 60, '0105': 90 },
  pidHist: {}, activePIDs: new Set(), supportedPIDs: new Set(),
  connected: true, demoMode: false,
  getVehicle: () => ({ merk: 'Mazda' }),
  ensurePIDListActive() {}, pickOnderdelen: async () => [], preAnalysisCheck: async () => true,
  getPidDef: () => null, isReportableSensor: () => true, download() {}, showToast() {},
  PID_DEFS: {}, sendCmd: async () => '', fv: v => v, KERN_PIDS: [],
  _pidHealth: {}, correlationLines: () => [], plVraagMeting: async () => true,
  discoveredPIDDefs: [], ALL_PID_DEFS: {}, ritSweepFindings: [], apiFetch: async () => ({}),
  isPIDOkVal: () => true, PLMon: null, PLWizard: null
};
ctx.globalThis = ctx;
vm.createContext(ctx);
// top-level `let` in een classic script wordt geen eigenschap van het
// globale object, dus reiken we de interne toestand aan via een aangeplakt
// accessor-blok. Dat draait in dezelfde scope en leest dus de echte variabelen.
const BRUG = `
globalThis.__rit = {
  get actief(){return ritActive}, get faseIdx(){return ritFaseIdx},
  get faseEind(){return ritFaseEind}, get pauzeSinds(){return ritPauzeSinds},
  get pauzeTotaal(){return ritPauzeTotaal}, get onderbrekingen(){return ritOnderbrekingen},
  get startTime(){return ritStartTime},
  startRit: function(fasen){
    RIT_FASEN_ACTIEF=fasen; RIT_TOTAAL=fasen.reduce((a,f)=>a+f.duur,0);
    ritActive=true; ritStartTime=Date.now(); ritLogs=[]; ritFaseData={};
    ritPauzeSinds=0; ritPauzeTotaal=0; ritOnderbrekingen=0; ritFaseEind=0;
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

// Handmatig een rit in gang zetten (startRitAnalyse vraagt om UI-interactie).
function startRit(fasen) { R.startRit(fasen); }
const FASEN = [
  { naam: 'Fase A', icon: 'A', duur: 60, pids: ['010C'], desc: '' },
  { naam: 'Fase B', icon: 'B', duur: 60, pids: ['010D'], desc: '' }
];

console.log('\n— fase loopt op wandkloktijd —');
{
  startRit(FASEN);
  toets('faseIdx staat op 0', R.faseIdx, 0);
  toets('faseEind is start + 60 s', R.faseEind - R.startTime, 60000);
  await loopTot(NU + 30000);
  toets('halverwege nog steeds fase 0', R.faseIdx, 0);
  await loopTot(NU + 31000);
  toets('na 61 s door naar fase 1', R.faseIdx, 1);
}

console.log('\n— navigatie: 5 minuten weg tijdens fase 0 —');
{
  logs.length = 0;
  startRit(FASEN);
  await loopTot(NU + 20000);                    // 20 s gemeten
  const eindVoor = R.faseEind;
  zichtbaarheid('hidden');
  toets('pauze gestart', R.pauzeSinds > 0, true);
  await loopTot(NU + 300000);                   // 5 minuten weg
  toets('fase NIET doorgelopen tijdens pauze', R.faseIdx, 0);
  zichtbaarheid('visible');
  toets('pauze geteld als 300 s', Math.round(R.pauzeTotaal / 1000), 300);
  toets('één onderbreking geregistreerd', R.onderbrekingen, 1);
  toets('faseEind 5 min opgeschoven', R.faseEind - eindVoor, 300000);
  toets('waarschuwing gelogd', logs.some(m => m.indexOf('achtergrond') >= 0), true);
  await loopTot(NU + 39000);                    // nog 39 s → samen 59 s gemeten
  toets('nog steeds fase 0 na 59 s meettijd', R.faseIdx, 0);
  await loopTot(NU + 2000);
  toets('fase 1 pas na 60 s ECHTE meettijd', R.faseIdx, 1);
}

console.log('\n— korte wissel telt niet als onderbreking —');
{
  startRit(FASEN);
  await loopTot(NU + 10000);
  zichtbaarheid('hidden');
  await loopTot(NU + 1500);                     // 1,5 s: notificatie wegtikken
  zichtbaarheid('visible');
  toets('geen onderbreking geteld', R.onderbrekingen, 0);
  toets('geen pauzetijd geteld', R.pauzeTotaal, 0);
}

console.log('\n— verbinding weg na terugkomst —');
{
  logs.length = 0;
  startRit(FASEN);
  await loopTot(NU + 15000);
  zichtbaarheid('hidden');
  await loopTot(NU + 2760000);                  // 46 minuten, zoals in de log
  ctx.connected = false;
  zichtbaarheid('visible');
  toets('rit gestopt', R.actief, false);
  toets('reden gelogd', logs.some(m => m.indexOf('Verbinding is weg') >= 0), true);
  ctx.connected = true;
}

console.log('\n— meettijd in het rapport —');
{
  startRit(FASEN);
  await loopTot(NU + 30000);
  zichtbaarheid('hidden');
  await loopTot(NU + 600000);
  zichtbaarheid('visible');
  await loopTot(NU + 30000);
  const stil = R.pauzeTotaal;
  const echt = Math.floor((NU - R.startTime - stil) / 1000);
  toets('werkelijke meettijd 60 s, niet 660', echt, 60);
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
})();
