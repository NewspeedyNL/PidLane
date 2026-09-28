// ══════════════════════════════════════════════════════════════════
// test-antwoordtal.js — het antwoordcijfer achter groepsverzoeken (#302)
// ──────────────────────────────────────────────────────────────────
// WAAROM (28-09-2026). Een ELM327 met ATAT1 leert na elk antwoord hoe lang
// hij nog wacht op méér antwoorden, en neemt daarvoor de traagste antwoorder
// die hij zag (datasheet, "Setting Timeouts"). Groepsverzoeken gingen zonder
// antwoordcijfer de bus op en betaalden die geleerde wachttijd elke keer. Dat
// past bij #302: 77 → 270 ms in stappen, nul fouten, en opnieuw verbinden
// (ATZ) zet hem terug.
//
// WAT HIER ONDERSCHEIDEN MOET WORDEN
//   1. plFrames telt frames, niet regels: de lengteregel "008" is geen frame,
//      markers op één regel wel, en twee ECU's zijn twee frames.
//   2. PLAntwoordtal leert voorzichtig: pas na drie keer hetzelfde aantal een
//      cijfer, het hoogste dat gezien is, en elke 200e keer weer zonder.
//   3. Mist er met cijfer iets dat eerder wél kwam, dan gaat het cijfer voor
//      dat verzoek uit. NO DATA zonder antwoord zet het niet uit.
//   4. Een nieuwe verbinding begint opnieuw.
//   5. De simulatie: een ELM die zijn wachttijd leert zoals de datasheet het
//      beschrijft. Met het cijfer blijft de responstijd laag nadat een trage
//      ECU langskwam; zonder loopt hij op. En een tweede ECU die meeantwoordt
//      raakt geen PID kwijt — het cijfer is geleerd, niet berekend.
//
// Alles uit de echte bron: pidlane-plload.js (geknipt met ankers) en
// pidlane-diagbundel.js voor de parser.
//
// Draaien vanuit public/:  node test-antwoordtal.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
function lees(b) { return fs.readFileSync(path.join(__dirname, b), 'utf8'); }
function knip(bron, van, tot, wat) {
  const a = bron.indexOf(van), b = bron.indexOf(tot, a < 0 ? 0 : a);
  if (a < 0 || b < 0) { console.error('FOUT: ' + wat + ' niet gevonden (anker verschoven?).'); process.exit(1); }
  return bron.slice(a, b);
}

const srcTal = knip(lees('pidlane-plload.js'), 'const ANTWOORDTAL_LEER', '// ── P8: batch-uitval met herstel', 'plFrames/PLAntwoordtal');

function bouw() {
  const s = {
    console: { log() {}, warn() {}, error() {} },
    Object, Array, Math, Number, String, Map,
    klok: 1e12, diags: [],
    btDiag(m) { s.diags.push(String(m)); }
  };
  s.window = s; s.globalThis = s;
  s.Date = { now: () => s.klok };
  s._btGen = 1;
  vm.createContext(s);
  vm.runInContext(srcTal, s, { filename: 'pidlane-plload.js (knip)' });
  return s;
}

// ── 1: frames tellen ──────────────────────────────────────────────
console.log('\n1. plFrames telt frames');
{
  const s = bouw();
  const f = (r) => vm.runInContext('plFrames(__r)', Object.assign(s, { __r: r }));
  toets('één single frame', f('410C1AF8') === 1, f('410C1AF8'));
  toets('twee ECU\'s op 010D: twee frames', f('410D32\r410D32') === 2, f('410D32\r410D32'));
  toets('multiframe op losse regels: drie, de lengteregel telt niet', f('00E\r0: 41 0C 1A F8 0D 32\r1: 11 20 04 40 05 5A 0F\r2: 30 00 00 00 00 00 00') === 3);
  toets('multiframe op één regel, zoals de kloon: drie', f('00E 0:410C1AF80D32 1:11200440055A0F 2:30000000000000') === 3);
  toets('met spaties in een single frame: één', f('41 0C 1A F8') === 1);
  toets('NO DATA is nul', f('NO DATA') === 0);
  toets('leeg is nul', f('') === 0 && f(null) === 0);
  toets('alleen een lengteregel is nul', f('008') === 0);
}

// ── 2: voorzichtig leren ──────────────────────────────────────────
console.log('\n2. Pas na drie keer hetzelfde aantal een cijfer, het hoogste dat er was');
{
  const s = bouw();
  const T = s.PLAntwoordtal;
  const B = '010C0D11';
  const twee = '008 0:410C1AF80D32 1:11200000000000';
  toets('niets geleerd: zonder cijfer', T.cmd(B) === B);
  T.leer(B, B, twee, 'goed', 90); T.leer(B, B, twee, 'goed', 90);
  toets('twee keer gezien: nog zonder cijfer', T.cmd(B) === B, T.cmd(B));
  T.leer(B, B, twee, 'goed', 90);
  toets('drie keer twee frames: met cijfer 2', T.cmd(B) === B + '2', T.cmd(B));
  T.leer(B, B, '410C1AF8', 'goed', 90);
  toets('een keer minder frames (een PID ontbrak): het cijfer blijft 2', T.cmd(B) === B + '2', T.cmd(B));
  T.leer(B, B, twee + '\r410D32', 'goed', 90);
  toets('er kwam een frame bij (tweede ECU): opnieuw leren, eerst zonder cijfer', T.cmd(B) === B, T.cmd(B));
  T.leer(B, B, twee + '\r410D32', 'goed', 90); T.leer(B, B, twee + '\r410D32', 'goed', 90);
  toets('daarna drie: het nieuwe, hogere cijfer', T.cmd(B) === B + '3', T.cmd(B));
  const onvol = '410C1AF8';
  const C = '010C05';
  T.leer(C, C, onvol, 'onvolledig', 90); T.leer(C, C, onvol, 'onvolledig', 90); T.leer(C, C, onvol, 'onvolledig', 90);
  toets('van onvolledige antwoorden wordt niet geleerd', T.cmd(C) === C, T.cmd(C));

  let zonder = 0;
  for (let i = 0; i < 400; i++) if (T.cmd(B) === B) zonder++;
  toets('elke 200e keer weer zonder cijfer: 2 van de 400', zonder === 2, zonder + ' keer zonder');

  const G = '01' + '0C0D110405060F0B10';
  const veel = Array.from({ length: 16 }, () => '410D32').join('\r');
  T.leer(G, G, veel, 'goed', 90); T.leer(G, G, veel, 'goed', 90); T.leer(G, G, veel, 'goed', 90);
  toets('meer dan vijftien frames past niet in één hexcijfer: zonder', T.cmd(G) === G, T.cmd(G));
}

// ── 3: zelfcontrole ───────────────────────────────────────────────
console.log('\n3. Mist er met cijfer iets, dan gaat het cijfer uit');
{
  const s = bouw();
  const T = s.PLAntwoordtal;
  const B = '010C0D';
  for (let i = 0; i < 3; i++) T.leer(B, B, '410C1AF80D32', 'goed', 80);
  toets('geleerd: 1', T.cmd(B) === B + '1');
  T.leer(B, B + '1', 'NO DATA', 'leeg', 80);
  toets('NO DATA met cijfer: het cijfer blijft (geen antwoord is geen afgekapt antwoord)', T.cmd(B) === B + '1', T.cmd(B));
  T.leer(B, B + '1', '410C1AF8', 'onvolledig', 80);
  toets('onvolledig met cijfer: uit', T.cmd(B) === B, T.cmd(B));
  toets('en dat staat in het BT-log', s.diags.some((d) => /Antwoordcijfer 1 op 010C0D uit/.test(d)), s.diags.join(' | '));
  s.klok += 299000;
  for (let i = 0; i < 3; i++) T.leer(B, B, '410C1AF80D32', 'goed', 80);
  toets('binnen vijf minuten blijft hij uit, ook als er opnieuw geleerd is', T.cmd(B) === B, T.cmd(B));
  s.klok += 2000;
  toets('na vijf minuten en opnieuw geleerd: weer aan', T.cmd(B) === B + '1', T.cmd(B));
  const st = T.stand();
  toets('stand() telt de blokkade', st.blokkades === 1 && st.geblokt === 0, JSON.stringify(st));
}

// ── 4: nieuwe verbinding ──────────────────────────────────────────
console.log('\n4. Een nieuwe verbinding leert opnieuw');
{
  const s = bouw();
  const T = s.PLAntwoordtal;
  const B = '010C0D';
  for (let i = 0; i < 3; i++) T.leer(B, B, '410C1AF80D32', 'goed', 80);
  toets('geleerd op verbinding 1', T.cmd(B) === B + '1');
  s._btGen = 2;
  toets('verbinding 2: zonder cijfer', T.cmd(B) === B, T.cmd(B));
}

// ── 5: de simulatie ───────────────────────────────────────────────
console.log('\n5. Een ELM die zijn wachttijd leert, zoals de datasheet beschrijft');
{
  // De ELM: na elk frame wacht hij `wacht` ms op meer, tenzij het cijfer zegt
  // dat hij er genoeg heeft. `wacht` volgt de traagste antwoordtijd die hij
  // zag, tot ATST (400 ms). Zo loopt #302 op: één trage ECU en elk verzoek
  // daarna betaalt ervoor.
  function elm() {
    return {
      wacht: 20, ms: 0,
      vraag(cmd, ecus) {
        const c = String(cmd);
        const cijfer = (c.length % 2 === 1) ? parseInt(c.slice(-1), 16) : 0;
        let t = 0; const regels = [];
        // `ecus` = [{na: ms, frames: [..]}], in volgorde van aankomst.
        for (const e of ecus) {
          t = Math.max(t, e.na);
          this.wacht = Math.min(400, Math.max(this.wacht, e.na));    // ATAT1 leert van de traagste
          for (const f of e.frames) {
            regels.push(f);
            if (cijfer && regels.length >= cijfer) { this.ms = t; return regels.join('\r'); }
          }
        }
        this.ms = t + this.wacht;
        return regels.join('\r');
      }
    };
  }
  const s = bouw();
  const d = { console: s.console, window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {} }) }, navigator: {},
    setTimeout: () => 0, setInterval: () => 0, clearInterval() {} };
  d.window = d; d.globalThis = d;
  vm.createContext(d);
  vm.runInContext(lees('pidlane-data.js'), d, { filename: 'pidlane-data.js' });
  vm.runInContext('function pidByteLen(sfx){ var t=String(sfx).toUpperCase(); return PID_BYTE_LEN[t]||1; }', d);
  vm.runInContext(knip(lees('pidlane-diagbundel.js'), 'function splitBatchResponse', 'function parsePID', 'splitBatchResponse'), d);
  const split = (raw, grp) => { d.__r = raw; d.__g = grp; return vm.runInContext('splitBatchResponse(__r, __g)', d); };

  const grp = ['010C', '010D', '0111'];
  const B = '010C0D11';
  const motor = { na: 25, frames: ['008', '0:410C1AF80D32', '1:11200000000000'].slice(1) };
  motor.frames[0] = '008 ' + motor.frames[0];
  const automaatTraag = { na: 180, frames: ['410D32'] };

  function rit(metTal) {
    const E = elm();
    const T = bouw().PLAntwoordtal;
    const tijden = [];
    let kwijt = 0;
    for (let i = 0; i < 300; i++) {
      // Rond verzoek 100 antwoordt één keer een trage module mee (een
      // automaat op 010D, of een dealercode op een ander adres). Daarna is
      // het weer alleen de motor.
      const ecus = (i === 100) ? [motor, automaatTraag] : [motor];
      const cmd = metTal ? T.cmd(B) : B;
      const raw = E.vraag(cmd, ecus);
      const p = split(raw, grp);
      const ok = grp.every((q) => p[q]);
      if (!ok) kwijt++;
      if (metTal) T.leer(B, cmd, raw, ok ? 'goed' : 'onvolledig', E.ms);
      tijden.push(E.ms);
    }
    const na = tijden.slice(150).sort((a, b) => a - b);
    return { med: na[na.length >> 1], kwijt };
  }
  const oud = rit(false), nieuw = rit(true);
  toets('zonder cijfer loopt de responstijd op na één trage module (' + oud.med + ' ms)', oud.med >= 150, oud.med + ' ms');
  toets('met cijfer blijft hij bij de motor (' + nieuw.med + ' ms)', nieuw.med <= 30, nieuw.med + ' ms');
  toets('en er raakt geen PID kwijt', nieuw.kwijt === 0, nieuw.kwijt + ' antwoorden onvolledig');

  // Een tweede ECU die ÁLTIJD meeantwoordt, en soms eerst. Een berekend
  // cijfer (uit de PID-lengtes: 2 frames) zou dan het antwoord van de motor
  // afkappen. Het geleerde cijfer moet precies hetzelfde binnenhalen als een
  // verzoek zonder cijfer. (Wát de parser daar zonder headers van maakt is
  // een eigen vraag, zie PIDLANE-ARCHIEF.md 28-09-2026 — hier telt alleen
  // dat het cijfer er niets aan verandert.)
  const Em = elm(), Ez = elm();
  const T = bouw().PLAntwoordtal;
  let anders = 0, met = 0;
  for (let i = 0; i < 200; i++) {
    const ecus = (i % 2) ? [{ na: 10, frames: ['410D32'] }, motor] : [motor, { na: 30, frames: ['410D32'] }];
    const cmd = T.cmd(B);
    if (cmd !== B) met++;
    const rawMet = Em.vraag(cmd, ecus), rawZonder = Ez.vraag(B, ecus);
    if (rawMet !== rawZonder) anders++;
    T.leer(B, cmd, rawMet, 'goed', Em.ms);
  }
  toets('twee ECU\'s, soms de automaat eerst: het geleerde cijfer is 3', T._m.get(B).n === 3, String(T._m.get(B).n));
  toets('met cijfer komt er precies binnen wat er zonder binnenkwam (' + met + ' van 200 met cijfer)', anders === 0 && met > 150, anders + ' keer anders, ' + met + ' met cijfer');
  toets('en de tijd per verzoek is die van de laatste ECU, niet plus de wachttijd', Em.ms < Ez.ms, Em.ms + ' tegen ' + Ez.ms + ' ms');
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
