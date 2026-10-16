// ══════════════════════════════════════════════════════════════════
// test-mode06.js — wanneer is een monitortest "krap"? (16-10-2026)
// ──────────────────────────────────────────────────────────────────
// Op de echte pidlane-mode06.js (PLM06._intern.bouwRecord), met de waarden
// van de CX-5 van 16-10-2026: zestien keer "krap", terwijl het merendeel
// tegen een grens zat die er niet is (0 of 65535 unsigned, −32768/32767
// signed). Een grens op het uiterste van het getal is "aan deze kant
// niets", en dat "krap" ging naar de AI.
// Draaien vanuit de repo:  node public/test-mode06.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
let fout = 0, ok = 0;
function t(naam, waar, uitleg) {
  if (waar) { ok++; console.log('  ok    ' + naam); } else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const s = { console: { log() {}, warn() {}, error() {} }, document: { getElementById: () => null, createElement: () => ({ style: {} }) }, localStorage: { getItem: () => null, setItem() {} } };
s.window = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-mode06.js', 'utf8'), s, { filename: 'pidlane-mode06.js' });
if (!s.PLM06 || !s.PLM06._intern || typeof s.PLM06._intern.bouwRecord !== 'function') { console.error('FOUT: PLM06._intern.bouwRecord niet gevonden'); process.exit(1); }
const B = s.PLM06._intern.bouwRecord;
const ONB = 0xFE;   // een UAS die de tabel niet kent: de app leidt het teken af
const r = (mid, tid, uas, w, lo, hi) => B(mid, tid, uas, w & 0xFFFF, lo & 0xFFFF, hi & 0xFFFF);
const d = (x) => JSON.stringify({ geslaagd: x.geslaagd, krap: x.krap, marge: x.marge, getoond: x.getoond });

console.log('\n1. De CX-5 van 16-10-2026: geen echte grens aan die kant, dus niet krap');
const cx5 = [
  ['ontstekingsmissers 0 tellingen, 0–65535', r(0xA4, 0x0C, 0x24, 0, 0, 0xFFFF)],
  ['ontstekingsmissers 3 tellingen, 0–65535', r(0xA3, 0x0B, 0x24, 3, 0, 0xFFFF)],
  ['lambdasonde 0 ruw, 0–256', r(0x01, 0x80, ONB, 0, 0, 256)],
  ['katalysator 153 ruw, 89–65535', r(0x21, 0x82, ONB, 153, 89, 0xFFFF)],
  ['lambdasonde B1S2 25 ruw, 0–1000', r(0x02, 0x05, ONB, 25, 0, 1000)],
  ['VVT 26 ruw, −32768–1500', r(0x35, 0x80, ONB, 26, 0x8000, 1500)],
  ['VVT −5 ruw, −1500–32767', r(0x35, 0x81, ONB, -5, -1500, 0x7FFF)],
  ['VVT −100 ruw, −2000–32767', r(0x35, 0x82, ONB, -100, -2000, 0x7FFF)],
  ['VVT 67 ruw, −32768–2000', r(0x35, 0x83, ONB, 67, 0x8000, 2000)]
];
cx5.forEach(([naam, x]) => t(naam + ': geslaagd, niet krap', x.geslaagd === true && x.krap === false, d(x)));
const geen = r(0xA4, 0x0C, 0x24, 0, 0, 0xFFFF);
t('zonder enige echte grens: geen marge (de test oordeelt niet)', geen.marge === null, d(geen));
t('de getoonde VVT-grens is signed: −32768–1500', (() => { const x = r(0x35, 0x80, ONB, 26, 0x8000, 1500); return x.getoond.min === -32768 && x.getoond.max === 1500; })(), d(r(0x35, 0x80, ONB, 26, 0x8000, 1500)));

console.log('\n2. Tegenproef: echte grenzen die wél krap zijn, en een test die zakt');
let x = r(0x01, 0x80, ONB, 95, 16, 100);
t('twee echte grenzen, 95 tussen 16 en 100: krap', x.geslaagd && x.krap, d(x));
x = r(0x21, 0x82, ONB, 92, 89, 0xFFFF);
t('één echte ondergrens, 92 bij 89: krap', x.geslaagd && x.krap, d(x));
x = r(0x35, 0x80, ONB, 1450, 0x8000, 1500);
t('één echte bovengrens, 1450 bij 1500: krap', x.geslaagd && x.krap, d(x));
x = r(0x02, 0x05, ONB, 1200, 0, 1000);
t('1200 boven 1000: gezakt', x.geslaagd === false && x.krap === false, d(x));

console.log('\n3. Wat de AI hoort');
const res = { tests: cx5.map(([, y]) => y) };
const prompt = s.PLM06.naarPromptRegels(res);
t('geen enkele CX-5-test gaat als "krap" naar de AI', !/krap/.test(prompt), prompt);
t('… en de AI hoort dat alles ruim binnen de grenzen zit', /ruim binnen de fabrieksgrenzen/.test(prompt), prompt);

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
