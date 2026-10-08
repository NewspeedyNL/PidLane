// ══════════════════════════════════════════════════════════════════
// test-herverbindguard.js — één herverbinder tegelijk (08-10-2026)
// ──────────────────────────────────────────────────────────────────
// Op de Aygo: na een herverbinding vroeg de app om een protocol, er werd
// ISO 9141-2 gekozen op een CAN-auto, en pas de pair-knop maakte het weer
// goed. Oorzaak: twee herverbinders tegelijk. sppReconnectGuard() opende de
// socket opnieuw en deed 60 ms later een warme reset (initELM327, ATWS),
// terwijl connectSerial() — uit zes lege antwoorden of de terugkeer naar de
// app — zijn eigen socket opende en het protocol zocht met 0100. De reset
// viel midden in die zoektocht.
//
// Deze test draait de échte guard uit pidlane-bt.js, geknipt op zijn eigen
// ankers, en de échte scanNetworks(). Wat hier rood hoort te worden:
//   • de guard die toch connect() doet terwijl een volledige verbinding
//     begonnen is (_btGen veranderd);
//   • de guard die zijn re-init (ATWS) nog doet nadat een volledige
//     verbinding het overnam;
//   • de guard die herverbindt terwijl een volledige verbinding loopt of
//     gepland staat;
//   • een automatische herverbinding die meteen om een protocol vraagt
//     zonder eerst zelf nog één keer te zoeken.
//
// Draaien vanuit public/:  node test-herverbindguard.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
const bron = fs.readFileSync('pidlane-bt.js', 'utf8');
function knip(van, tot, wat) {
  const i = bron.indexOf(van), j = bron.indexOf(tot, i);
  if (i < 0 || j < 0) throw new Error(wat + ' niet te knippen — is het anker weg? Dan toetst deze test niets meer');
  return bron.slice(i, j);
}
const GUARD = knip('const VERBIND_EIGENAAR_MS', 'async function sendCmd(cmd, timeoutMs){', 'sppReconnectGuard');
const HERVAT = knip('const HERVAT_MS', '\n/* Het slot van een hervatting.', '_hervatActief');
const SCAN = knip('async function scanNetworks(){', '\nfunction renderNetworkCards(){', 'scanNetworks');

// ── de guard ─────────────────────────────────────────────────────
function guardOmgeving(o) {
  o = o || {};
  const s = {
    diag: [], connects: 0, inits: 0, disconnects: 0, isConn: 0, timers: [],
    connected: true, _btGen: 1,
    btDiag: (m) => { s.diag.push(m); },
    log() {}, _elmPoortDicht() {}, _elmPoortOpen() {}, _sppNieuweSocket() {},
    initELM327: async () => { s.inits++; },
    setTimeout: (f) => { s.timers.push(f); return s.timers.length; },
    console: { warn() {}, log() {}, error() {} },
    Date: { now: () => s.nu }, nu: 1000000
  };
  s.window = s;
  // Elke delay geeft de beurt aan het scenario: daar "begint" een andere verbinding.
  s.delay = async () => { if (o.tijdensDelay) o.tijdensDelay(s); };
  s.spp = {
    isConnected: async () => { s.isConn++; return { isConnected: false }; },
    disconnect: async () => { s.disconnects++; },
    connect: async () => { s.connects++; }
  };
  Object.assign(s, o.zet || {});
  vm.createContext(s);
  vm.runInContext(GUARD, s, { filename: 'pidlane-bt.js (guard)' });
  return s;
}
async function draai(s) {
  await s.sppReconnectGuard(s.spp, '00:04:3E:8B:7B:32', '010C0D1');
  for (const f of s.timers.splice(0)) await f();
  return s;
}

(async () => {
  console.log('\n— de guard alleen —');
  let s = await draai(guardOmgeving());
  toets('een dode socket zonder andere verbinding: de guard verbindt één keer en initialiseert', s.connects === 1 && s.inits === 1, JSON.stringify({ c: s.connects, i: s.inits }));

  console.log('\n— een volledige verbinding begint tijdens de guard (de Aygo, 07-10) —');
  s = await draai(guardOmgeving({ tijdensDelay: (x) => { x._btGen++; } }));
  toets('begint er tijdens zijn wachttijd een volledige verbinding, dan doet de guard geen connect', s.connects === 0, JSON.stringify({ c: s.connects }));
  toets('…en ook geen warme reset', s.inits === 0, JSON.stringify({ i: s.inits }));
  // Na de connect, vóór de re-init: precies het moment van de ATWS midden in 0100.
  s = guardOmgeving();
  await s.sppReconnectGuard(s.spp, '00:04:3E:8B:7B:32', '010C0D1');
  s._btGen++;                               // connectSerial() begint
  for (const f of s.timers.splice(0)) await f();
  toets('neemt een volledige verbinding het over na de connect van de guard: geen re-init (geen ATWS midden in 0100)', s.connects === 1 && s.inits === 0, JSON.stringify({ c: s.connects, i: s.inits }));

  console.log('\n— een volledige verbinding loopt al, of staat gepland —');
  s = await draai(guardOmgeving({ zet: { _reconnBusy: true } }));
  toets('staat een herverbinding gepland (zes lege antwoorden, terugkeer naar de app): de guard doet niets', s.isConn === 0 && s.disconnects === 0 && s.connects === 0 && s.inits === 0,
    JSON.stringify({ isConn: s.isConn, d: s.disconnects, c: s.connects, i: s.inits }));
  s = guardOmgeving(); s._plVerbindSinds = s.nu - 10000;
  await draai(s);
  toets('begon connectSerial 10 s geleden (init en zoeken lopen nog): de guard doet niets', s.connects === 0 && s.disconnects === 0, JSON.stringify({ d: s.disconnects, c: s.connects }));
  s = guardOmgeving(); s._plVerbindSinds = s.nu - 40000;
  await draai(s);
  toets('TEGENPROEF: 40 s na het verbinden is de guard weer aan de beurt', s.connects === 1 && s.inits === 1, JSON.stringify({ c: s.connects, i: s.inits }));

  // ── de detectie bij een hervatting ─────────────────────────────
  console.log('\n— een automatische herverbinding zoekt eerst zelf nog een keer —');
  function scanOmgeving(antwoorden, hervat) {
    const el = {};
    const t = {
      diag: [], gestuurd: [], kaarten: 0,
      _kentPoortKlaar: true, demoMode: false,
      document: { getElementById: (id) => el[id] || (el[id] = { style: {}, textContent: '', innerHTML: '' }) },
      sendCmd: async (c) => { t.gestuurd.push(c); if (c === '0100') return antwoorden.shift() || ''; if (c === 'ATDPN') return 'A6'; if (c === 'ATDP') return 'AUTO, ISO 15765-4 (CAN 11/500)'; return 'OK'; },
      delay: async () => {},
      btDiag: (m) => { t.diag.push(m); }, log() {},
      _onthoudProtocol() {}, herijkPidGate() {},
      plProtocolLijst: (g) => (g ? [Object.assign({ auto: true }, g)] : [{ id: '6', handmatig: true }]),
      renderNetworkCards: () => { t.kaarten++; },
      toonKentekenStap() {},
      console: { warn() {}, log() {}, error() {} },
      Date: Date
    };
    t.window = t;
    t._plHervat = hervat ? { t: Date.now(), reden: 'dode socket' } : null;
    vm.createContext(t);
    vm.runInContext(HERVAT + '\n' + SCAN, t, { filename: 'pidlane-bt.js (scan)' });
    return t;
  }
  let t = scanOmgeving(['', '41 00 BE 3E B8 11'], true);
  await t.scanNetworks();
  toets('hervatten: de eerste 0100 blijft leeg, de tweede vindt het protocol — zonder iets te vragen',
    t.gestuurd.filter((c) => c === '0100').length === 2 && t._gedetecteerdProtocol && /^A?6$/.test(t._gedetecteerdProtocol.id),
    JSON.stringify({ g: t.gestuurd, p: t._gedetecteerdProtocol }));
  t = scanOmgeving(['', ''], true);
  await t.scanNetworks();
  toets('hervatten, en ook de tweede keer niets: dan pas de keuze, en niet eindeloos opnieuw',
    t.gestuurd.filter((c) => c === '0100').length === 2 && !t._gedetecteerdProtocol && t.kaarten >= 1, JSON.stringify({ g: t.gestuurd }));
  t = scanOmgeving(['', '41 00 BE 3E B8 11'], false);
  await t.scanNetworks();
  toets('TEGENPROEF: met de knop verbonden (geen hervatting) wordt niet stil opnieuw gezocht — de gebruiker ziet de knop Opnieuw scannen',
    t.gestuurd.filter((c) => c === '0100').length === 1 && !t._gedetecteerdProtocol, JSON.stringify({ g: t.gestuurd }));

  console.log('\n' + (fout ? 'test-herverbindguard: ' + fout + ' van ' + n + ' FOUT' : 'test-herverbindguard: ' + n + ' ok'));
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('test-herverbindguard brak af: ' + (e && e.stack || e)); process.exit(1); });
