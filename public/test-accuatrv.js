// test-accuatrv.js — accuspanning via de adapter (ATRV) als de ECU 0142 ontkent.
// Aanleiding 17-11-2026: Hyundai i20 2011 meldt 0141 en 0143–0146, niet 0142;
// de accutegel bleef leeg terwijl de adapter de spanning gewoon meet.
// Laadt de echte pidlane-plload.js en de echte steunbitlogica uit
// pidlane-rijsituatie.js (ecuSteunt), en de harde grenzen uit pidlane-data.js.
// Draaien vanuit public/:  node test-accuatrv.js
'use strict';
const fs = require('fs');
const vm = require('vm');

let fout = 0;
function ok(c, m) { if (c) console.log('  ok  ' + m); else { fout++; console.log('  FOUT ' + m); } }

function knip(bron, van, tot) {
  const a = bron.indexOf(van), b = bron.indexOf(tot, a);
  if (a < 0 || b < 0) throw new Error('anker weg: ' + (a < 0 ? van : tot));
  return bron.slice(a, b);
}

function maakCtx(steunwoord40) {
  let NU = 1785600000000;
  const gestuurd = [], gezet = [], diag = [];
  const ctx = {
    console, connected: true, demoMode: false,
    Date: new Proxy(Date, { get: (t, p) => p === 'now' ? (() => NU) : t[p] }),
    btDiag: (m, s) => diag.push(String(m)),
    PID_POLL_CLASS: {}, _focusPIDs: new Set(), _pollMult: 1,
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {},
    activePIDs: new Set(['010C', '0142']),
    sendCmd: async (c) => { gestuurd.push(c); return ctx._antwoord; },
    _antwoord: '12.4V',
    updPID: (p, v) => gezet.push([p, v]), checkStability() {}, feedDatalog() {}, feedSessionStat() {},
    ALL_PID_DEFS: { '0142': { name: 'Accuspanning', unit: 'V', cat: 'Electrisch', min: 8, max: 16 } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  // De echte harde grenzen
  const data = fs.readFileSync(__dirname + '/pidlane-data.js', 'utf8');
  vm.runInContext(knip(data, 'window.PID_HARD_LIMITS = {', '\n};') + '\n};', ctx);
  // De echte steunbitopslag en ecuSteunt
  const rij = fs.readFileSync(__dirname + '/pidlane-rijsituatie.js', 'utf8');
  vm.runInContext(knip(rij, 'let _steunbits = {};', 'function magToevoegen(') +
    '\nwindow.ecuSteunt=ecuSteunt; window.steunNeeRuw=function(){ return Array.from(_steunNee); };' +
    '\nwindow._zet=function(b,w){ _steunbitsOnthoud(b,w); }; window._neeBlok=_steunNeeBlok;', ctx);
  vm.runInContext('var _pidNextPoll={}; function actiefPollProfiel(){ return "standaard"; }', ctx);   // uit pidlane-auth.js / -pids.js
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-plload.js', 'utf8'), ctx, { filename: 'pidlane-plload.js' });
  if (steunwoord40 === 'nee') ctx._neeBlok(0x40);
  else if (steunwoord40 !== undefined) ctx._zet(0x40, steunwoord40);
  return { ctx, gestuurd, gezet, diag, tik: () => { NU += 2500; return NU; } };
}

// Blok 0x40 van de i20: 0141 aan, 0142 uit, 0143–0146 aan → bits 1,3,4,5,6.
const I20 = (0x80000000 | 0x20000000 | 0x10000000 | 0x08000000 | 0x04000000) >>> 0;
const MET42 = (I20 | 0x40000000) >>> 0;

(async () => {
  console.log('test-accuatrv.js');

  console.log('· plAtrvVolt');
  const { ctx: c0 } = maakCtx();
  ok(c0.plAtrvVolt('12.4V') === 12.4, '"12.4V" → 12.4');
  ok(c0.plAtrvVolt('14,1V\r>') === 14.1, '"14,1V" met prompt → 14.1');
  ok(c0.plAtrvVolt('?') === null, '"?" → null');
  ok(c0.plAtrvVolt('') === null, 'leeg → null');
  ok(c0.plAtrvVolt('0.0V') === null, '0.0V valt onder de harde grens → null');

  console.log('· ECU ontkent 0142 (i20)');
  const a = maakCtx(I20);
  ok(a.ctx.ecuSteunt('0143') === true && a.ctx.ecuSteunt('0142') === false, 'steunbits: 0143 ja, 0142 nee');
  ok(a.ctx.plAccuViaAdapter() === true, 'plAccuViaAdapter() true');
  ok(!a.ctx.pidsDueNow().includes('0142'), '0142 niet meer aan de ECU gevraagd');
  ok(a.ctx.pidsDueNow().includes('010C'), '010C blijft gewoon in de ronde');
  ok(await a.ctx._plAccuAdapterTik(a.tik()) === true, 'tik leest ATRV');
  ok(a.gestuurd[0] === 'ATRV', 'ATRV gestuurd');
  ok(a.gezet.length === 1 && a.gezet[0][0] === '0142' && a.gezet[0][1] === 12.4, '0142 = 12.4 gezet');
  ok(await a.ctx._plAccuAdapterTik(a.tik() - 2000) === false, 'binnen ACCU_ATRV_MS geen tweede ATRV');
  const d = a.ctx.plAccuAdapterDefs();
  ok(d.length === 1 && d[0].pid === '0142' && /adapter/.test(d[0].name) && d[0].unit === 'V', 'keuzelijst: "Accuspanning (adapter)"');
  a.ctx._antwoord = '?';
  ok(await a.ctx._plAccuAdapterTik(a.tik()) === false && a.diag.some(m => /ATRV onleesbaar/.test(m)), 'onleesbare ATRV: niets gezet, wel gemeld');

  console.log('· blok 0x40 bestaat niet (NO DATA)');
  const n = maakCtx('nee');
  ok(n.ctx.plAccuViaAdapter() === true, 'gemeten NO DATA op het blok → adapter');

  console.log('· ECU meldt 0142 wél');
  const b = maakCtx(MET42);
  ok(b.ctx.plAccuViaAdapter() === false, 'plAccuViaAdapter() false');
  ok(b.ctx.pidsDueNow().includes('0142'), '0142 gaat gewoon naar de ECU');
  ok(await b.ctx._plAccuAdapterTik(b.tik()) === false && !b.gestuurd.length, 'geen ATRV');
  ok(b.ctx.plAccuAdapterDefs().length === 0, 'geen extra keuzelijstregel');

  console.log('· onbekend (niets gelezen)');
  const o = maakCtx();
  ok(o.ctx.plAccuViaAdapter() === false, 'onbekend → ECU gaat voor');

  console.log('· demo');
  const m = maakCtx(I20); m.ctx.demoMode = true;
  ok(m.ctx.plAccuViaAdapter() === false, 'demo → nooit ATRV');

  console.log('· 0142 niet geselecteerd');
  const s = maakCtx(I20); s.ctx.activePIDs.delete('0142');
  ok(await s.ctx._plAccuAdapterTik(s.tik()) === false && !s.gestuurd.length, 'geen ATRV als niemand hem wil zien');

  console.log(fout ? '\n' + fout + ' FOUT' : '\nAlles goed');
  process.exit(fout ? 1 : 0);
})().catch(e => { console.error('FOUT', e); process.exit(1); });
