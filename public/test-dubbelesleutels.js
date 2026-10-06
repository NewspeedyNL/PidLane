// ══════════════════════════════════════════════════════════════════
// test-dubbelesleutels.js — geen PID twee keer in één tabel van pidlane-data.js
// ──────────────────────────────────────────────────────────────────
// WAAROM (06-10-2026). In een object-literal wint de laatste sleutel, stil.
// `017C` stond twee keer in ALL_PID_DEFS (Emissie en Temp) en `A6` twee keer
// in PID_BYTE_LEN; in de draaiende app is dat niet meer te zien, want daar
// bestaat alleen de winnaar. Het commentaar stond bij de verliezer. Deze test
// leest daarom de bron zelf: per tabel (`window.X = {`, `const X = {` en elk
// `Object.assign(X, {` erna) elke sleutel van de vorm 'hex' op het bovenste
// niveau. Geneste objecten (POLL_PROFIELEN per profiel) tellen niet mee.
//
// Tegenproef onderaan: een tweede 017C in de bron moet rood worden.
// Draaien vanuit public/:  node test-dubbelesleutels.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

function dubbelen(bron) {
  const uit = [];
  let tabel = null, gezien = {}, diepte = 0;
  const perTabel = {};
  bron.split('\n').forEach((regel, i) => {
    // Strings en commentaar eruit, zodat een '{' in een naam niet meetelt.
    const kaal = regel.replace(/\/\/.*$/, '').replace(/'(?:[^'\\]|\\.)*'/g, m => /^'[0-9A-F]{2,6}'$/.test(m) ? m : "''")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, '``');
    // Een tabel begint met `window.X = {` (of const/let/var) en kan verder
    // gevuld worden met `Object.assign(X, {` — ook een dubbeling tussen die
    // blokken wint stil, dus `gezien` loopt per tabelnaam door.
    const kop = !tabel && (kaal.match(/^(?:window\.|const |let |var )(\w+)\s*=\s*\{/) ||
                           kaal.match(/^Object\.assign\((?:window\.)?(\w+)\s*,\s*\{/));
    if (kop) { tabel = kop[1]; gezien = perTabel[tabel] = perTabel[tabel] || {}; diepte = /^Object/.test(kaal) ? -1 : 0; }
    if (!tabel) return;
    // Per teken: alleen sleutels op diepte 1 (het bovenste niveau van de tabel).
    let d = diepte;
    for (let k = 0; k < kaal.length; k++) {
      const c = kaal[k];
      if (c === '{' || c === '(' || c === '[') d++;
      else if (c === '}' || c === ')' || c === ']') d--;
      else if (c === "'" && d === 1) {
        const m = kaal.slice(k).match(/^'([0-9A-F]{2,6})'\s*:/);
        if (m) {
          if (gezien[m[1]]) uit.push(tabel + ': ' + m[1] + ' op regel ' + gezien[m[1]] + ' en ' + (i + 1));
          else gezien[m[1]] = i + 1;
          k += m[0].length - 1;
        }
      }
    }
    diepte = d;
    if (diepte <= 0) tabel = null;
  });
  return uit;
}

let fout = 0;
const BRON = fs.readFileSync(path.join(__dirname, 'pidlane-data.js'), 'utf8');
const nu = dubbelen(BRON);
if (nu.length) { fout++; console.log('  FOUT  dubbele sleutels in pidlane-data.js:\n        ' + nu.join('\n        ')); }
else console.log('  ok    geen PID twee keer in één tabel van pidlane-data.js');

// Tegenproef: de toestand van vóór 06-10-2026 terug.
const terug = BRON.replace(/^(  '017C':\{[^\n]*\n)/m, '$1$1');
const t = dubbelen(terug);
if (terug === BRON || !t.some(x => /ALL_PID_DEFS: 017C/.test(x))) { fout++; console.log('  FOUT  tegenproef: een tweede 017C in ALL_PID_DEFS werd niet gezien — ' + JSON.stringify(t)); }
else console.log('  ok    tegenproef: een tweede 017C in ALL_PID_DEFS wordt gezien');
const terug2 = BRON.replace("'A2':2,\n", "'A2':2,'A6':4,\n");
const t2 = dubbelen(terug2);
if (terug2 === BRON || !t2.some(x => / A6 /.test(x))) { fout++; console.log('  FOUT  tegenproef: een tweede A6 in een lengtetabel werd niet gezien — ' + JSON.stringify(t2)); }
else console.log('  ok    tegenproef: een tweede A6 in de lengtetabel wordt gezien');

console.log(fout ? '\n' + fout + ' FOUT' : '\nalles goed');
process.exit(fout ? 1 : 0);
