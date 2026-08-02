// test-driefasen.js — toetst de drie-fasenpoort uit pidlane-fuel.js:
// aanzetten/testen -> registreren -> pas dan de hoeveelheid/rijtijd-eis.
// Knipt het poortblok letterlijk uit de module en draait het op een gestuurde
// klok met DOM-stubs. Draaien vanuit public/:  node test-driefasen.js
'use strict';
const fs = require('fs');

const src = fs.readFileSync(__dirname + '/pidlane-fuel.js', 'utf8');
const van = src.indexOf('/* ── DE DRIE-FASENPOORT');
const tot = src.indexOf('/* Toont het meetscherm');   // staat vlak vóór plMeetPoortVraag
if (van < 0 || tot < 0 || tot < van) { console.error('FOUT: knipbereik niet gevonden'); process.exit(1); }

// ── gestuurde klok ────────────────────────────────────────────────
let NU = 1785600000000;
const timers = [];
async function loopTot(doel) {
  while (NU < doel) {
    const k = timers.filter(t => t.actief && t.at <= doel);
    if (!k.length) { NU = doel; return; }
    k.sort((a, b) => a.at - b.at);
    const t = k[0]; NU = t.at;
    if (t.herhaal) t.at = NU + t.ms; else t.actief = false;
    t.fn();
    await new Promise(r => setImmediate(r));
  }
}
// ── DOM-stub ──────────────────────────────────────────────────────
const els = {}; const geklikt = {};
function mkEl(id) {
  return { id, style: {}, innerHTML: '', className: '',
    set onclick(f) { geklikt[this.id] = f; }, get onclick() { return geklikt[this.id]; },
    classList: { add() {}, remove() {} }, appendChild() {}, remove() {} };
}
let zicht = 'visible'; const luist = [];
const document = {
  getElementById: id => {
    if (els[id]) return els[id];
    // knoppen bestaan alleen als de kaart ze net getekend heeft
    const kaart = els['meetGateOv'];
    if (kaart && kaart.innerHTML.indexOf('id="' + id + '"') >= 0) return (els[id] = mkEl(id));
    return null;
  },
  createElement: () => mkEl('meetGateOv'),
  body: { appendChild(e) { els['meetGateOv'] = e; } },
  addEventListener: (n, f) => luist.push(f),
  removeEventListener: () => {},
  get visibilityState() { return zicht; }
};
function achtergrond(v) { zicht = v; luist.forEach(f => f()); }
function klik(id) { const f = geklikt[id]; if (!f) throw new Error('knop ' + id + ' bestaat niet'); f(); }
function kaartTekst() { return (els['meetGateOv'] || {}).innerHTML || ''; }

// ── omgeving ──────────────────────────────────────────────────────
let pidHist = {}, pidVals = {}, activePIDs = new Set(), supportedPIDs = new Set();
let poortDoor = true, ensureAanroepen = [];
const window_ = {};
const omgeving = {
  BASIS_PIDS: ['010C', '0105', '0104', '010F', '0142'],
  ANALYSE_PIDS: { basis: ['010C', '0105', '0104', '0111', '010D', '0142', '010F', '010B'],
                  accu: ['0142', '010C', '0104', '0105', '0146', '015B'] },
  FILTERED_PIDS: new Set(['05', '0F', '46', '5C', '2F', '42', '33', '07', '09']),
  getPidDef: pid => ({ name: 'PID' + pid }),
  pidGate: () => true,
  ensurePIDsActive: async p => { ensureAanroepen.push(p); },
  plMeetPoortVraag: () => Promise.resolve(poortDoor),
  watFor: w => w,
  log: () => {},
  document,
  setInterval: (fn, ms) => { const t = { fn, at: NU + ms, ms, actief: true, herhaal: true }; timers.push(t); return t; },
  clearInterval: t => { if (t) t.actief = false; },
  Date: new Proxy(Date, { get: (t, p) => p === 'now' ? (() => NU) : t[p] }),
  Math, Set, Promise
};
function bouw() {
  window_.BASIS_PIDS = omgeving.BASIS_PIDS; window_.ANALYSE_PIDS = omgeving.ANALYSE_PIDS;
  return new Function(...Object.keys(omgeving), 'pidHist', 'pidVals', 'activePIDs',
    'supportedPIDs', 'demoMode', 'connected', 'window',
    src.slice(van, tot) + '\nreturn {plKernStatus, plVraagMeting, plRegistreer, plKernDekking};')
    (...Object.values(omgeving), pidHist, pidVals, activePIDs, supportedPIDs, false, true, window_);
}

let fout = 0, n = 0;
function toets(naam, g, v) {
  n++;
  const ok = JSON.stringify(g) === JSON.stringify(v);
  if (!ok) { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + JSON.stringify(g) + ', verwacht ' + JSON.stringify(v)); }
  else console.log('  ok    ' + naam);
}
function vul(pid, aantal) { pidHist[pid] = new Array(aantal).fill({ t: NU, v: 1 }); }
function reset() {
  pidHist = {}; pidVals = {}; supportedPIDs = new Set();
  for (const k in els) delete els[k]; for (const k in geklikt) delete geklikt[k];
  timers.length = 0; ensureAanroepen = []; poortDoor = true;
  delete window_._meetBeperkt; delete window_._laatstProfiel;
}
const KERN_ACCU = ['0142', '010C', '0104', '0105', '0146', '015B', '010F'];

(async () => {

console.log('\n— eis hangt af van de aard van de sensor —');
{
  reset(); KERN_ACCU.forEach(p => supportedPIDs.add(p));
  vul('0142', 1); vul('0105', 1); vul('010F', 1); vul('0146', 1);   // traag: 1 volstaat
  vul('010C', 10); vul('0104', 10); vul('015B', 10);                // dynamisch: reeks
  const k = bouw().plKernStatus('accu');
  toets('7 kernsensoren', k.totaal, 7);
  toets('traag heeft quota 1', k.items.find(i => i.pid === '0142').quota, 1);
  toets('dynamisch heeft quota 10', k.items.find(i => i.pid === '010C').quota, 10);
  toets('compleet', k.compleet, true);
}

console.log('\n— bestaande historie slaat de registratie over —');
{
  reset(); KERN_ACCU.forEach(p => supportedPIDs.add(p));
  KERN_ACCU.forEach(p => vul(p, 40));
  const t0 = NU;
  toets('poort laat door', await bouw().plVraagMeting('normaal', 'test', 'accu'), true);
  toets('geen tijd verstreken', NU - t0, 0);
  toets('sensoren wel aangezet', ensureAanroepen, ['accu']);
  toets('geen wachtscherm', kaartTekst(), '');
}

console.log('\n— registreren tot de reeksen vol zijn —');
{
  reset(); KERN_ACCU.forEach(p => supportedPIDs.add(p));
  ['0142', '0105', '010F', '0146'].forEach(p => vul(p, 1));
  vul('010C', 2); vul('0104', 2); vul('015B', 2);          // nog te mager
  const p = bouw().plVraagMeting('normaal', 'test', 'accu');
  await loopTot(NU + 600);
  toets('wachtscherm staat er', /Sensoren registreren/.test(kaartTekst()), true);
  toets('toont voortgang per sensor', /PID010C — 2\/10/.test(kaartTekst()), true);
  ['010C', '0104', '015B'].forEach(x => vul(x, 10));       // data komt binnen
  await loopTot(NU + 600);
  toets('poort gaat vanzelf open', await p, true);
  toets('geen beperking genoteerd', window_._meetBeperkt, undefined);
}

console.log('\n— achtergrond verlengt het venster —');
{
  reset(); KERN_ACCU.forEach(p => supportedPIDs.add(p));
  ['0142', '0105', '010F', '0146'].forEach(p => vul(p, 1));
  vul('010C', 1); vul('0104', 1); vul('015B', 1);
  const p = bouw().plRegistreer('accu', 'test');
  await loopTot(NU + 1000);
  achtergrond('hidden');
  await loopTot(NU + 120000);                              // twee minuten weg
  achtergrond('visible');
  await loopTot(NU + 1000);
  toets('nog steeds aan het wachten', /Sensoren registreren/.test(kaartTekst()), true);
  ['010C', '0104', '015B'].forEach(x => vul(x, 10));
  await loopTot(NU + 600);
  toets('daarna gewoon klaar', await p, true);
}

console.log('\n— verlengen en zelf doorgaan —');
{
  reset(); KERN_ACCU.forEach(p => supportedPIDs.add(p));
  KERN_ACCU.forEach(p => vul(p, 1));                       // dynamische blijven mager
  const p = bouw().plRegistreer('accu', 'test');
  await loopTot(NU + 46000);                               // venster verlopen
  toets('verlengknop verschijnt', /kdVerleng/.test(kaartTekst()), true);
  klik('kdVerleng');
  toets('verlengknop weer weg', /kdVerleng/.test(kaartTekst()), false);
  klik('kdNu');
  toets('gebruiker mag door', await p, true);
  toets('beperking genoteerd', window_._meetBeperkt, 'registratie afgebroken');
}

console.log('\n— onder 60% kern: eerst afbreken kunnen —');
{
  reset(); KERN_ACCU.forEach(p => supportedPIDs.add(p));
  vul('0142', 1); vul('0105', 1);                          // 2 van 7 = 29%
  const p = bouw().plVraagMeting('normaal', 'test', 'accu');
  await loopTot(NU + 600);
  klik('kdNu');                                            // registratie afkappen
  await loopTot(NU + 600);
  toets('blokkadescherm verschijnt', /Te weinig kernsensoren/.test(kaartTekst()), true);
  toets('noemt de stille sensoren', /Geen data ondanks aanvraag/.test(kaartTekst()), true);
  klik('kmStop');
  toets('analyse afgebroken', await p, false);
}

console.log('\n— of toch doorgaan als indicatie —');
{
  reset(); KERN_ACCU.forEach(p => supportedPIDs.add(p));
  vul('0142', 1); vul('0105', 1);
  const p = bouw().plVraagMeting('normaal', 'test', 'accu');
  await loopTot(NU + 600); klik('kdNu'); await loopTot(NU + 600);
  klik('kmToch');
  toets('gaat door', await p, true);
  toets('beperking in het rapport', /29% van de kernsensoren/.test(window_._meetBeperkt), true);
}

console.log('\n— sensoren die de auto niet heeft blokkeren de wachtlus niet —');
{
  reset(); ['0142', '010C', '0104', '0105', '010F'].forEach(p => supportedPIDs.add(p));
  vul('0142', 1); vul('0105', 1); vul('010F', 1); vul('010C', 10); vul('0104', 10);
  const k = bouw().plKernStatus('accu');
  toets('0146 en 015B als n.v.t.', k.nvt.map(i => i.pid).sort(), ['0146', '015B']);
  toets('haalbare set is compleet', k.compleet, true);
  toets('kern-percentage blijft 5 van 7', Math.round(k.pctKern * 100), 71);
  toets('poort laat door zonder wachten',
        await bouw().plVraagMeting('normaal', 'test', 'accu'), true);
}

console.log('\n— zonder profiel blijft het gedrag als voorheen —');
{
  reset(); poortDoor = false;
  toets('profiel false: alleen de oude poort', await bouw().plVraagMeting('normaal', 'test', false), false);
  toets('geen sensoren aangezet', ensureAanroepen, []);
  poortDoor = true;
  toets('en die laat door als hij open is', await bouw().plVraagMeting('normaal', 'test', false), true);
}

console.log('\n— fase 3 wordt niet overgeslagen —');
{
  reset(); KERN_ACCU.forEach(p => supportedPIDs.add(p));
  KERN_ACCU.forEach(p => vul(p, 40));
  poortDoor = false;                                       // rijtijd-eis niet gehaald
  toets('kern compleet maar rijtijd ontbreekt → dicht',
        await bouw().plVraagMeting('rit', 'test', 'accu'), false);
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
})();
