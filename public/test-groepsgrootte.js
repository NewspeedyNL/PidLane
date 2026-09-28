// ══════════════════════════════════════════════════════════════════
// test-groepsgrootte.js — hoeveel PIDs per verzoek, en wanneer minder
// ──────────────────────────────────────────────────────────────────
// WAAROM (28-09-2026). De groep ging van "hoogstens 3" naar "met de hand tot
// 6", en dat vroeg eerst om een reparatie: een groepsantwoord gold als goed
// zodra er één PID terugkwam. 2-van-3 was dus succes (#211), en 4-van-6 zou
// dat ook zijn — twee sensoren die stil hun meting kwijtraken.
//
// WAT HIER ONDERSCHEIDEN MOET WORDEN
//   1. plGroepOordeel: een ontbrekende PID die kort geleden nog antwoordde is
//      ONVOLLEDIG; een ontbrekende PID die nooit (of lang geleden) antwoordde
//      is dat niet — die heeft deze auto misschien gewoon niet.
//   2. _groepTel: 4 onvolledige in de laatste 20 = een stap kleiner; 3 niet.
//      Niet onder de 2, niet als de groep met de hand vastgezet is, en een
//      andere groepsgrootte begint een nieuw venster.
//   3. PLBus: met de hand tot 6, de automaat tot 3 — ook bij terugschakelen.
//   4. groepAdvies: de beste SCHONE groep, bij een gelijkspel de kleinere;
//      echo of verlies maakt een groep onschoon; drift wordt gemeld.
//   5. De parser leest een antwoord van zes PIDs over drie frames, ook op
//      één regel, en blijft daarbij goedkoop.
//
// Alles uit de echte bron: pidlane-plload.js, pidlane-data.js,
// pidlane-adapter.js en pidlane-diagbundel.js, geknipt met ankers.
//
// Draaien vanuit public/:  node test-groepsgrootte.js   (exit 0 = goed)
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

// ── 1 en 2: de oordeelfunctie en het krimpvenster ─────────────────
// Vanaf batchDip/batchOk: die horen erbij, want batchOk() wacht na een krimp.
const srcOordeel = knip(lees('pidlane-plload.js'), '// ── P8: batch-uitval met herstel', '// ── Herstel na een opgeloste protocolstoring', 'batchOk/plGroepOordeel/_groepTel');

function bouwVenster(start, vast) {
  const s = {
    console: { log() {}, warn() {}, error() {} },
    Object, Array, Math, Number, String,
    klok: 1e12,
    acties: [], diags: [], groter: 0,
    btDiag(m) { s.diags.push(String(m)); },
    PLLoad: { boekActie(wat, van, naar, reden) { s.acties.push({ wat, van, naar, reden }); } },
    PLBus: {
      g: start, vast: !!vast,
      batchGroep() { return this.g; },
      batchKleiner() { if (this.vast) return false; if (this.g > 1) { this.g--; return true; } return false; },
      batchGroter() { s.groter++; return false; }
    }
  };
  s.Date = { now: () => s.klok };
  s.window = s;
  vm.createContext(s);
  vm.runInContext(srcOordeel + '\nglobalThis.__tel = _groepTel; globalThis.__oordeel = plGroepOordeel; globalThis.__ok = batchOk;', s);
  return s;
}

console.log('1. plGroepOordeel: onvolledig is een bekende PID die ontbreekt');
{
  const s = bouwVenster(3);
  const nu = 1e12;
  const recent = { '010C': nu - 2000, '010D': nu - 2000, '0111': nu - 2000 };
  let o = s.__oordeel(['010C', '010D', '0111'], { '010C': [1], '010D': [2], '0111': [3] }, recent, nu);
  toets('alles terug → goed', o.oordeel === 'goed' && o.gekregen === 3, JSON.stringify(o));
  o = s.__oordeel(['010C', '010D', '0111'], { '010C': [1], '010D': [2] }, recent, nu);
  toets('een PID die zojuist nog antwoordde ontbreekt → onvolledig', o.oordeel === 'onvolledig' && o.mistBekend[0] === '0111', JSON.stringify(o));
  o = s.__oordeel(['010C', '010D', '0111'], { '010C': [1], '010D': [2] }, { '010C': nu, '010D': nu }, nu);
  toets('een PID die nooit antwoordde ontbreekt → goed (de auto heeft hem misschien niet)', o.oordeel === 'goed', JSON.stringify(o));
  o = s.__oordeel(['010C', '010D', '0111'], { '010C': [1], '010D': [2] }, { '0111': nu - 301000 }, nu);
  toets('een PID die ruim vijf minuten geleden antwoordde telt niet meer als bekend', o.oordeel === 'goed', JSON.stringify(o));
  o = s.__oordeel(['010C', '010D'], {}, recent, nu);
  toets('niets terug → leeg (dat pakt batchDip() op)', o.oordeel === 'leeg' && o.gekregen === 0, JSON.stringify(o));
}

console.log('\n2. _groepTel: het venster van 20');
{
  const og = { mistBekend: ['0111'] };
  let s = bouwVenster(3);
  for (let i = 0; i < 17; i++) s.__tel(false, og);
  for (let i = 0; i < 3; i++) s.__tel(true, og);
  toets('3 van de 20 onvolledig: de groep blijft 3', s.PLBus.g === 3, 'groep ' + s.PLBus.g);
  s.__tel(true, og);
  toets('de vierde in hetzelfde venster: groep 3 → 2', s.PLBus.g === 2, 'groep ' + s.PLBus.g);
  toets('en dat staat in het actielogboek, met de reden', s.acties.length === 1 && s.acties[0].van === 3 && s.acties[0].naar === 2 && /0111/.test(s.acties[0].reden),
    JSON.stringify(s.acties));
  for (let i = 0; i < 20; i++) s.__tel(true, og);
  toets('niet onder de 2, ook niet bij alleen maar onvolledige antwoorden', s.PLBus.g === 2, 'groep ' + s.PLBus.g);

  s = bouwVenster(6, true);
  for (let i = 0; i < 20; i++) s.__tel(true, og);
  toets('een met de hand vastgezette groep blijft staan', s.PLBus.g === 6 && s.acties.length === 0, 'groep ' + s.PLBus.g);

  // Na een krimp: twee minuten niet terug omhoog. Zonder die rust schommelt
  // de groep op de kloon elke paar seconden tussen 2 en 3.
  s = bouwVenster(3);
  s.__ok(); s.__ok();
  const groterVoor = s.groter;
  for (let i = 0; i < 4; i++) s.__tel(true, og);
  for (let i = 0; i < 30; i++) s.__ok();
  toets('na een krimp probeert batchOk() twee minuten lang niet omhoog te klimmen',
    s.PLBus.g === 2 && groterVoor === 2 && s.groter === 2, 'batchGroter: ' + groterVoor + ' → ' + s.groter);
  s.klok += 121000;
  s.__ok();
  toets('daarna weer wel', s.groter === 3, 'batchGroter: ' + s.groter);

  // Groep 4 met de hand, drie onvolledige; dan terug naar de automaat en
  // groep 3. Eén onvolledige bij groep 3 mag dan niet de vierde zijn: die
  // drie hoorden bij groep 4.
  s = bouwVenster(4);
  for (let i = 0; i < 3; i++) s.__tel(true, og);
  s.PLBus.g = 3;
  s.__tel(true, og);
  toets('een andere groepsgrootte begint een nieuw venster', s.PLBus.g === 3 && s.acties.length === 0, 'groep ' + s.PLBus.g);
}

// ── 3: de twee plafonds van PLBus ─────────────────────────────────
console.log('\n3. PLBus: met de hand tot 6, de automaat tot 3');
{
  const s = { console: { log() {}, warn() {}, error() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {} }) }, navigator: {},
    setTimeout: () => 0, setInterval: () => 0, clearInterval() {} };
  s.window = s; s.globalThis = s;
  vm.createContext(s);
  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });
  const B = s.PLBus;
  toets('met de hand: 6 blijft 6', B.batchZet(6, true) === 6);
  toets('met de hand: 9 wordt 6', B.batchZet(9, true) === 6);
  toets('automaat: 6 wordt 3', B.batchZet(6, false) === 3);
  B.batchZet(4, true);
  B.batchReset();
  toets('batchReset laat een vastgezette 4 staan', B.batchGroep() === 4);
  B.batchZet(B.batchGroep(), false);          // wat zetModus(false) doet
  toets('terug naar de automaat zet een 4 op 3', B.batchGroep() === 3);
  B.batchZet(3, false);
  for (let i = 0; i < 100; i++) B.batchGroter();
  toets('de automaat klimt nooit boven 3', B.batchGroep() === 3, 'groep ' + B.batchGroep());
  toets('de plafonds staan als getal op PLBus', B.GROEP_AUTO_MAX === 3 && B.GROEP_HAND_MAX === 6);
}

// ── 4: het advies van de groepsproef ──────────────────────────────
console.log('\n4. groepAdvies');
{
  const src = knip(lees('pidlane-adapter.js'), '  function groepAdvies(stappen) {', '  // Elke stap als eigen logregel', 'groepAdvies');
  const s = { Object, Array, Math, Number, String };
  vm.createContext(s);
  vm.runInContext(src + '\nglobalThis.__advies = groepAdvies;', s);
  const A = s.__advies;
  // Een stap zoals _gpStap hem teruggeeft. `pps` = PIDs per seconde.
  const stap = (g, rit, pps, ms, onvol, leeg, echo) => ({ groep: g, rit, n: 100, sec: 8, perSec: 100 / 8, pidsPerSec: pps,
    gekregen: Math.round(pps * 8), medMs: ms, p90Ms: ms, onvol: onvol || 0, leeg: leeg || 0,
    onvolPct: onvol || 0, leegPct: leeg || 0, echo: echo || 0 });
  const heenTerug = (rij) => rij.concat(rij.slice().reverse().map((x) => Object.assign({}, x, { rit: 'terug' })));

  let a = A(heenTerug([stap(1, 'heen', 10, 70), stap(2, 'heen', 19, 72), stap(3, 'heen', 27, 75),
    stap(4, 'heen', 34, 80), stap(5, 'heen', 40, 84), stap(6, 'heen', 45, 88)]));
  toets('schoon en steeds sneller: groep 6, met de winst tegen groep 3', a.groep === 6 && a.winstPct === 67 && /Groep 6/.test(a.kop), JSON.stringify({ g: a.groep, w: a.winstPct, k: a.kop }));

  a = A(heenTerug([stap(1, 'heen', 10, 70), stap(2, 'heen', 19, 72), stap(3, 'heen', 27, 75),
    stap(4, 'heen', 28, 80), stap(5, 'heen', 28.2, 84), stap(6, 'heen', 28.3, 88)]));
  toets('minder dan 5% winst: de kleinere groep blijft staan', a.groep === 3, 'groep ' + a.groep);

  a = A(heenTerug([stap(1, 'heen', 10, 70), stap(2, 'heen', 19, 72), stap(3, 'heen', 20, 75, 30, 0, 12),
    stap(4, 'heen', 21, 80, 45, 0, 20), stap(5, 'heen', 22, 84, 50, 0, 25), stap(6, 'heen', 22, 88, 60, 0, 30)]));
  toets('verlies en echo vanaf 3: kleiner is beter, groep 2', a.groep === 2 && /Kleiner/.test(a.kop), JSON.stringify({ g: a.groep, k: a.kop }));

  a = A(heenTerug([stap(1, 'heen', 5, 200, 0, 10), stap(2, 'heen', 8, 220, 20, 5)]));
  toets('geen enkele groep schoon: geen advies, wel de reden', a.groep === null && /hapert/.test(a.reden), a.reden);

  const rij = [stap(3, 'heen', 27, 80), stap(6, 'heen', 45, 88), stap(6, 'terug', 44, 130), stap(3, 'terug', 26, 82)];
  a = A(rij);
  toets('heen 88 ms en terug 130 ms: drift gemeld, bij groep 6', a.drift && a.drift.groep === 6 && /veranderde/.test(a.reden), JSON.stringify(a.drift));
  a = A([stap(3, 'heen', 27, 80), stap(3, 'terug', 27, 90)]);
  toets('80 tegen 90 ms is geen drift', a.drift === null, JSON.stringify(a.drift));

  a = A([{ groep: 5, rit: 'heen', overgeslagen: 'maar 4 PIDs antwoorden solo' }]);
  toets('alleen overgeslagen stappen: geen meting', a.groep === null && a.kop === 'Geen meting');
}

// ── 5: de parser op zes PIDs ──────────────────────────────────────
console.log('\n5. De parser leest zes PIDs over drie frames');
{
  const s = { console: { log() {}, warn() {}, error() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {} }) }, navigator: {},
    setTimeout: () => 0, setInterval: () => 0, clearInterval() {} };
  s.window = s; s.globalThis = s;
  vm.createContext(s);
  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });
  vm.runInContext(`
    function pidByteLen(sfx){ var t=String(sfx).toUpperCase(); return PID_BYTE_LEN[t]||1; }
  `, s);
  vm.runInContext(knip(lees('pidlane-diagbundel.js'), 'function splitBatchResponse', 'function parsePID', 'splitBatchResponse'), s);
  const pids = ['010C', '010D', '0111', '0104', '0105', '010F'];
  const verwacht = { '010C': [26, 248], '010D': [50], '0111': [32], '0104': [64], '0105': [90], '010F': [48] };
  s.__p = pids;
  s.__r = '00E \r0: 41 0C 1A F8 0D 32 \r1: 11 20 04 40 05 5A 0F \r2: 30 00 00 00 00 00 00 \r\r>';
  const a = vm.runInContext('splitBatchResponse(__r, __p)', s);
  toets('drie frames op losse regels: alle zes goed', JSON.stringify(a) === JSON.stringify(verwacht), JSON.stringify(a));
  s.__r = '00E 0:410C1AF80D32 1:11200440055A0F 2:30000000000000';
  const b = vm.runInContext('splitBatchResponse(__r, __p)', s);
  toets('op één regel, zoals de kloon het geeft: alle zes goed', JSON.stringify(b) === JSON.stringify(verwacht), JSON.stringify(b));
  // Expres gemeen: de databytes zijn de gevraagde PID-nummers, zodat de
  // backtracking zoveel mogelijk takken moet proberen.
  s.__p = ['0104', '0105', '010C', '010D', '010F', '0111'];
  s.__r = '00E 0:410405050C0C 1:040D0F0F040D11 2:0C000000000000';
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 50; i++) vm.runInContext('splitBatchResponse(__r, __p)', s);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 50;
  toets('ook het gemene geval blijft ruim onder 20 ms per parse', ms < 20, ms.toFixed(2) + ' ms');
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
