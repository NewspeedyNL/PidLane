// ══════════════════════════════════════════════════════════════════
// test-visthema.js — volledig scherm en thema's van Slim visueel (18-10-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-visthema.js in een vm en toetst:
//   • een onbekende of kapotte keuze wordt Standaard, en wordt niet bewaard;
//   • het gekozen thema geldt overal, sinds 20-10-2026 ook buiten het volle
//     scherm; een onbekende keuze is Standaard;
//   • elk thema heeft regels in pidlane.css, en de CSS kent geen thema dat
//     de keuzestrook niet heeft — anders kies je er een dat niets doet;
//   • de url(#…)-verlopen in de CSS staan in de defs die pas() in de meter zet.
// Wat in de echte app gebeurt (knop, scherm vullen, terugknop): bproef-visthema.js.
//
// Draaien vanuit public/:  node test-visthema.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const BRON = fs.readFileSync(__dirname + '/pidlane-visthema.js', 'utf8');
const CSS = fs.readFileSync(__dirname + '/pidlane.css', 'utf8');

function laad(opslag) {
  const c = {
    console: { log() {}, warn() {}, info() {}, error() {} },
    localStorage: { getItem: k => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); } }
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(BRON, c, { filename: 'pidlane-visthema.js' });
  return c.PLVisThema;
}

console.log('\n1. Keuze lezen en bewaren');
{
  const opslag = {};
  const T = laad(opslag);
  waar('zonder keuze: Standaard', T.lees() === 'standaard');
  opslag.pl_vis_thema = 'roze';
  waar('een onbekende keuze leest als Standaard', T.lees() === 'standaard', T.lees());
  waar('een onbekend thema wordt niet bewaard', T.bewaar('roze') === false && opslag.pl_vis_thema === 'roze');
  waar('een bekend thema wel, en leest terug', T.bewaar('neon') === true && T.lees() === 'neon', T.lees());
  const c2 = { console: { log() {}, warn() {}, info() {}, error() {} }, localStorage: { getItem() { throw new Error('geblokkeerd'); }, setItem() { throw new Error('vol'); } } };
  c2.window = c2; vm.createContext(c2); vm.runInContext(BRON, c2);
  waar('een opslag die gooit: Standaard, en bewaren breekt niet', c2.PLVisThema.lees() === 'standaard' && c2.PLVisThema.bewaar('carbon') === true);
}

console.log('\n2. Het thema geldt op het volle scherm én daarbuiten (20-10-2026)');
{
  const T = laad({});
  waar('het gekozen thema', T.themaVoor('neon') === 'neon' && T.themaVoor('chroom') === 'chroom');
  waar('een onbekende keuze: Standaard', T.themaVoor('xx') === 'standaard' && T.themaVoor(null) === 'standaard');
}

console.log('\n3. De thema\'s en pidlane.css lopen gelijk');
{
  const T = laad({});
  const ids = T.THEMAS.map(t => t.id);
  waar('Standaard staat vooraan', ids[0] === 'standaard', ids.join(','));
  waar('minstens vier thema\'s naast Standaard', ids.length >= 5, ids.join(','));
  waar('geen dubbele id', new Set(ids).size === ids.length);
  ids.filter(i => i !== 'standaard').forEach(i =>
    waar('thema ' + i + ' heeft regels in pidlane.css', CSS.indexOf('.vis[data-vthema="' + i + '"]') >= 0));
  const inCss = new Set([...CSS.matchAll(/data-vthema="([a-z]+)"/g)].map(m => m[1]));
  const wees = [...inCss].filter(i => ids.indexOf(i) < 0);
  waar('de CSS kent geen thema dat niet te kiezen is', wees.length === 0, wees.join(','));
  const urls = new Set([...CSS.matchAll(/url\(#(vt[A-Za-z]+)\)/g)].map(m => m[1]));
  const ontbreekt = [...urls].filter(u => BRON.indexOf('id="' + u + '"') < 0);
  waar('elk verloop uit de CSS staat in de defs van de meter', urls.size > 0 && ontbreekt.length === 0, ontbreekt.join(','));
  waar('elk thema heeft een voorbeeldrondje', T.THEMAS.every(t => typeof t.voorbeeld === 'string' && t.voorbeeld.length > 3 && t.naam));
}

console.log('\n4. De terugknop vindt het ✕ (pidlane-archief.js)');
{
  const ARCH = fs.readFileSync(__dirname + '/pidlane-archief.js', 'utf8');
  const m = BRON.match(/class="vt-knop vt-uit" aria-label="([^"]+)"/);
  const regel = ARCH.match(/if\(\/\^\((sluit\|sluiten\|close)\)\\b\/i\.test\(label\)\) return true;/);
  waar('het ✕ heeft een label', !!m, 'anker vt-uit niet gevonden');
  waar('…dat _plIsSluitKnop als sluitknop herkent', !!m && !!regel && /^(sluit|sluiten|close)\b/i.test(m[1]), m && m[1]);
}

console.log('\n' + ok + ' ok, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
