// ══════════════════════════════════════════════════════════════════
// test-sessiedoorloop.js — een crash breekt de rit niet in twee (#229)
// ──────────────────────────────────────────────────────────────────
// Proef van 24-09-2026, 19:08: na de rendercrash kwam de verbinding vanzelf
// terug, maar de logtabel begon een nieuwe sessie (vóór `2026-09-24-1906-2`,
// erna `app-2026-09-24-1908`), en de sensorselectie viel terug op de
// standaardset. En in de eerste versie van de hervatting (#287) stond er
// zelfs niets aan: het scherm dat de standaardset zette werd overgeslagen.
//
// Vier stukken, elk uit de échte bron geknipt op hun eigen koppen:
//   1. pidlane-auth.js    — het sessienummer loopt door na een herlaad;
//   2. pidlane-testrun.js — de testrun neemt dat nummer één keer over;
//   3. pidlane-pidgate.js — de selectie wordt bewaard en teruggezet;
//   4. pidlane-bt.js      — het slot van een hervatting zet altijd sensoren aan.
//
// Draaien vanuit public/:  node test-sessiedoorloop.js   (exit 0 = goed)
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
function knip(bestand, van, tot) {
  const bron = fs.readFileSync(bestand, 'utf8');
  const a = bron.indexOf(van), b = bron.indexOf(tot, a + 1);
  if (a < 0 || b < 0) {
    console.log('  FOUT  anker niet gevonden in ' + bestand + ': "' + (a < 0 ? van : tot) + '" — deze test toetst niets meer');
    process.exit(1);
  }
  return bron.slice(a, b);
}
function opslag(begin) {
  const m = Object.assign({}, begin || {});
  return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}

const NU = 1790269700000;
const AUTH = knip('pidlane-auth.js', 'let _plAppSessie=null;', '/* Een proef van blok 5');

function laadAuth(bewaard) {
  const s = {
    localStorage: opslag(bewaard ? { pl_sessie: JSON.stringify(bewaard) } : {}),
    regels: [], later: [],
    console: { warn() {}, log() {} },
    setTimeout: (f) => { s.later.push(f); return 0; },
    setInterval: () => 0,
    Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(NU); } static now() { return NU; } }
  };
  s.window = s;
  s.log = (m) => { s.regels.push(String(m)); };
  vm.createContext(s);
  vm.runInContext(AUTH, s);
  s.later.forEach((f) => f());
  return s;
}

console.log('1. Het sessienummer loopt door na een herlaad');
{
  const s = laadAuth({ id: '2026-09-24-1906-2', t: NU - 30000 });
  toets('binnen twee minuten: hetzelfde nummer als vóór de crash', s._plSessieId() === '2026-09-24-1906-2', s._plSessieId());
  toets('en de testrun krijgt het aangeboden', s._plDoorlopendeSessie === '2026-09-24-1906-2');
  toets('het logboek zegt dat de sessie doorloopt', s.regels.some((r) => /Sessie 2026-09-24-1906-2 loopt door na de herlaad/.test(r)),
    s.regels.join(' | '));
}
{
  const s = laadAuth({ id: '2026-09-24-0800', t: NU - 5 * 60000 });
  const id = s._plSessieId();
  toets('TEGENPROEF: vijf minuten later is het een nieuwe sessie', /^app-/.test(id) && id !== '2026-09-24-0800', id);
  toets('en er wordt niets aangeboden', !s._plDoorlopendeSessie);
}
{
  const s = laadAuth(null);
  const id = s._plSessieId();
  toets('niets bewaard: een nieuwe sessie', /^app-/.test(id), id);
  toets('die meteen bewaard wordt, voor een volgende crash', JSON.parse(s.localStorage.m.pl_sessie).id === id,
    s.localStorage.m.pl_sessie);
}

console.log('\n2. De testrun neemt het nummer één keer over');
{
  const s = {};
  s.window = s;
  s.connected = true; s.demoMode = false; s._trBezig = false; s._pidLastUpd = {}; s.pidVals = {};
  s.console = { warn() {}, error() {}, log() {} };
  s.localStorage = opslag();
  s.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), querySelectorAll: () => [] };
  s.setInterval = () => 0; s.setTimeout = () => 0;
  s.PLBus = { stats: () => ({ belasting: 70, perSec: 5, venGemMs: 120, foutPct: 0 }) };
  s.PLLoad = { staat: () => ({ mult: 1, tempoPct: 100 }), cfg: {} };
  s._plDoorlopendeSessie = '2026-09-24-1906-2';
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-testrun.js', 'utf8'), s, { filename: 'pidlane-testrun.js' });
  const T = s.PLTestrunLive;
  toets('het eerste ritnummer na de herlaad is dat van vóór de crash', T.ritId() === '2026-09-24-1906-2', T.ritId());
  toets('en het aanbod is daarmee op', s._plDoorlopendeSessie === null);
  const nieuw = T.nieuweSessie('volgende opdracht');
  toets('TEGENPROEF: een nieuwe opdracht kiezen begint daarna gewoon een nieuwe sessie',
    nieuw !== '2026-09-24-1906-2', nieuw);
}

console.log('\n3. De sensorselectie wordt bewaard en teruggezet');
const GATE = knip('pidlane-pidgate.js', 'function _engineWarmRunning', '// ── einde gate-blok');
function wereld(bewaard) {
  const W = {
    regels: [], pidVals: {}, _pidHealth: {},
    activePIDs: new Set(), manualPIDs: new Set(),
    supportedPIDs: new Set(['010C', '0105', '010D', '0110']), discoveredPIDDefs: [],
    vehicleInfo: { brandstof: 'benzine' },
    DIESEL_SCR_PIDS: new Set(), EV_AFWEZIGE_PIDS: new Set(), GEEN_SENSOR_PIDS: new Set(), _B1B2_PAIR: {},
    ALL_PID_DEFS: { '010C': { name: 'Toerental', cat: 'Motor' }, '0105': { name: 'Koelvloeistof', cat: 'Temp' },
                    '010D': { name: 'Snelheid', cat: 'Motor' }, '0110': { name: 'Massaluchtstroom', cat: 'Motor' },
                    '0142': { name: 'Boordspanning', cat: 'Elektrisch' } },
    PIDS: [], console: { warn() {}, log() {} },
    renderGauges() {}, rebuildGSel() {}, buildDiscoveredPIDList() {},
    document: { getElementById: () => null },
    localStorage: opslag(bewaard ? { pl_selectie: JSON.stringify(bewaard) } : {}),
    Date: { now: () => NU }
  };
  W.vehicleFuelType = () => W.vehicleInfo.brandstof;
  W.log = (m) => { W.regels.push(String(m)); };
  W.btDiag = () => {};
  const namen = Object.keys(W);
  const fn = new Function(...namen, GATE + '\nreturn {plSelectieVoor,plSelectieMeld,plSelectieHerstel,pidGate};');
  Object.assign(W, fn(...namen.map((k) => W[k])));
  return W;
}
{
  const W = wereld(null);
  const voor = W.plSelectieVoor();
  W.activePIDs.add('010C'); W.activePIDs.add('0110');
  W.plSelectieMeld(voor, 'meetopdracht');
  const b = JSON.parse(W.localStorage.m.pl_selectie || '{}');
  toets('elke wijziging wordt bewaard', Array.isArray(b.pids) && b.pids.join() === '010C,0110', W.localStorage.m.pl_selectie);
}
{
  const W = wereld({ pids: ['010C', '0110', '0142'], t: NU - 60000 });
  const n2 = W.plSelectieHerstel();
  toets('de selectie van vóór de crash komt terug', W.activePIDs.has('010C') && W.activePIDs.has('0110'), [...W.activePIDs].join());
  toets('maar alleen wat deze auto meldt (0142 niet)', !W.activePIDs.has('0142') && n2 === 2, 'n=' + n2);
  toets('en het logboek zegt waarom', W.regels.some((r) => /via hervatten na herlaad/.test(r)), W.regels.join(' | '));
}
{
  const W = wereld(null);
  toets('TEGENPROEF: niets bewaard geeft nul — dan moet de aanroeper iets anders kiezen', W.plSelectieHerstel() === 0);
}

console.log('\n4. Het slot van een hervatting zet altijd sensoren aan');
const SLOT = knip('pidlane-bt.js', '/* Het slot van een hervatting.', 'async function connectSerial(opt){');
function slot(herstel) {
  const s = { diag: [], regels: [], standaard: 0, klaar: 0, console: { warn() {} } };
  s.window = s;
  s.btDiag = (m) => { s.diag.push(m); };
  s.log = (m) => { s.regels.push(String(m)); };
  s.plSelectieHerstel = () => herstel;
  s.selectStandardSet = () => { s.standaard++; return 26; };
  s.wizFinish = () => { s.klaar++; };
  vm.createContext(s);
  vm.runInContext(SLOT, s);
  return s;
}
{
  const s = slot(9);
  s._hervatAfronden({ reden: 'herlaad', t: Date.now() - 4000 });
  toets('de bewaarde selectie gaat vóór', s.standaard === 0 && s._plLaatsteHervat.sensoren === 9, JSON.stringify(s._plLaatsteHervat));
  toets('en de PID-lijst wordt bijgewerkt', s.klaar === 1);
  toets('het logboek noemt het aantal en de bron', s.regels.some((r) => /9 sensoren uit de selectie van vóór de herlaad/.test(r)),
    s.regels.join(' | '));
}
{
  const s = slot(0);
  s._hervatAfronden({ reden: 'herlaad', t: Date.now() - 4000 });
  toets('niets bewaard: de standaardset, nooit nul sensoren (de fout van #287)', s.standaard === 1 && s._plLaatsteHervat.sensoren === 26,
    JSON.stringify(s._plLaatsteHervat));
}

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
process.exit(fout ? 1 : 0);
