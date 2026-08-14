// ══════════════════════════════════════════════════════════════════
// test-bedrading.js — bewaakt het contract uit pidlane-bedrading.js
// ──────────────────────────────────────────────────────────────────
// Twee kanten op, want één kant is niet genoeg:
//
//   1. Elke naam in KRITIEK moet ergens in de bron gedefinieerd zijn.
//      Dit vangt het geval van 15-08: een functie die hernoemd of verwijderd
//      wordt terwijl de aanroepen blijven staan, verstopt in een stille catch.
//
//   2. Elke `typeof X === 'function'`-guard in de bron moet een naam noemen
//      die in KRITIEK staat (of in GEEN_GLOBALE, met reden). Dit vangt de
//      andere richting: een nieuwe stille-faalplek die niemand registreert.
//      Zonder dit dijt de blinde vlek gewoon opnieuw uit.
//
// Bewust géén poging om alle aanroepen uit de bron te parsen: die code zit vol
// HTML-in-template-literals met apostrofs en geneste ${}, en een parser daarvoor
// wordt een eigen project met eigen bugs. Definities zoeken is wél betrouwbaar,
// en de guards zijn met één regex te vinden.
//
// Draaien vanuit public/:  node test-bedrading.js    (exit 0 = bedrading klopt)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const modules = fs.readdirSync(dir).filter(f => /^pidlane-.*\.js$/.test(f)).sort();
const bron = modules.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
// De registry zelf niet meescannen op guards: die noemt `typeof X==='function'`
// in zijn uitleg, en dat is geen aanroepplek. Anders betrapt de test zijn eigen
// documentatie — wat hij bij de eerste run prompt deed.
const bronZonderRegistry = modules
  .filter(f => f !== 'pidlane-bedrading.js')
  .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

// KRITIEK uit de module zelf halen, zodat er één lijst bestaat en niet twee.
const bedrading = fs.readFileSync(path.join(dir, 'pidlane-bedrading.js'), 'utf8');
function lijstUit(naam) {
  const m = bedrading.match(new RegExp('var\\s+' + naam + '\\s*=\\s*\\[([\\s\\S]*?)\\];'));
  if (!m) throw new Error(naam + ' niet gevonden in pidlane-bedrading.js');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}
function objectUit(naam) {
  const m = bedrading.match(new RegExp('var\\s+' + naam + '\\s*=\\s*\\{([\\s\\S]*?)\\};'));
  if (!m) throw new Error(naam + ' niet gevonden in pidlane-bedrading.js');
  return [...m[1].matchAll(/'([^']+)'\s*:/g)].map(x => x[1]);
}

const KRITIEK = lijstUit('KRITIEK');
const GEEN_GLOBALE = objectUit('GEEN_GLOBALE');

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function isGedefinieerd(naam) {
  const n = esc(naam);
  return new RegExp('\\bfunction\\s+' + n + '\\s*\\(').test(bron)
      || new RegExp(n + '\\s*[:=]\\s*(?:async\\s+)?function').test(bron)
      || new RegExp(n + '\\s*[:=]\\s*(?:async\\s*)?\\([^()]*\\)\\s*=>').test(bron)
      || new RegExp('window\\.' + n + '\\s*=[^=]').test(bron)
      || new RegExp('\\b(?:const|let|var)\\s+' + n + '\\b').test(bron);
}

let fout = 0;
console.log('Bedradingscontrole — ' + modules.length + ' modules, ' + KRITIEK.length + ' verwachte functies\n');

// ── 1. bestaat alles uit KRITIEK ──
const weg = KRITIEK.filter(n => !isGedefinieerd(n));
if (weg.length) {
  fout += weg.length;
  for (const n of weg) console.log('  FOUT  ' + n + '() staat in KRITIEK maar is nergens gedefinieerd');
} else {
  console.log('  ok    elke verwachte functie bestaat in de bron');
}

// ── 2. is elke guard geregistreerd ──
const guards = new Set(
  [...bronZonderRegistry.matchAll(/typeof\s+([A-Za-z_$][\w$]*)\s*===?\s*['"]function['"]/g)].map(m => m[1])
);
const bekend = new Set([...KRITIEK, ...GEEN_GLOBALE]);
const onbekend = [...guards].filter(n => !bekend.has(n)).sort();
if (onbekend.length) {
  fout += onbekend.length;
  for (const n of onbekend) {
    console.log('  FOUT  ' + n + ' zit achter een typeof-guard maar staat niet in KRITIEK');
    console.log('        Een guard is een plek waar een ontbrekende functie stil faalt.');
    console.log('        Zet de naam in KRITIEK, of in GEEN_GLOBALE met de reden.');
  }
} else {
  console.log('  ok    elke typeof-guard in de bron is geregistreerd (' + guards.size + ' stuks)');
}

// ── 3. lijsthygiëne: geen dubbelen, geen naam die allebei is ──
const dubbel = KRITIEK.filter((n, i) => KRITIEK.indexOf(n) !== i);
if (dubbel.length) { fout++; console.log('  FOUT  dubbel in KRITIEK: ' + [...new Set(dubbel)].join(', ')); }
const beide = KRITIEK.filter(n => GEEN_GLOBALE.includes(n));
if (beide.length) { fout++; console.log('  FOUT  staat in KRITIEK én GEEN_GLOBALE: ' + beide.join(', ')); }
if (!dubbel.length && !beide.length) console.log('  ok    lijst is schoon');

console.log('\n' + (fout ? fout + ' probleem(en)' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
