// ══════════════════════════════════════════════════════════════════
// test-run.js — leest het run-paneel de staat op de goede manier?
// ──────────────────────────────────────────────────────────────────
// WAAROM
// De vijf schakelaars hangen aan vijf verschillende soorten staat, en twee
// daarvan zijn een valkuil:
//
//   caravanActive   top-level `let` in een klassiek script ZONDER IIFE
//   ritActive       idem
//
// Zulke namen staan in script-scope, niet op window. `window.caravanActive` is
// altijd undefined; alleen de bare naam werkt. Bouw je het paneel op de eerste
// vorm, dan staat elke schakelaar permanent op UIT en merk je dat pas in de
// auto — met de motor draaiend en een caravan erachter.
//
// Deze test knipt pidlane-run.js niet uit, maar leest hem als tekst en toetst
// de eigenschappen die niet mogen wegglijden. Draaien vanuit public/:
//   node test-run.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const ruw = fs.readFileSync('pidlane-run.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

// Commentaar eruit vóór het scannen. De kop van pidlane-run.js legt de valkuil
// uit en schrijft daarbij letterlijk `window.caravanActive` op — zonder deze
// stap slaat de test aan op zijn eigen waarschuwing. Dat is dezelfde fout als
// de dode-knoppencontrole van 17-08 maakte: vals alarm door te grof lezen.
const bron = ruw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
let fout = 0;

function toets(naam, ok, detail) {
  if (ok) { console.log('  ok    ' + naam); return; }
  console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
  fout++;
}

console.log('Run-paneel\n');

// ── 1. de valkuil ──
toets('leest caravanActive niet via window',
  !/window\.caravanActive/.test(bron),
  'window.caravanActive is altijd undefined — gebruik de bare naam in een try');
toets('leest ritActive niet via window',
  !/window\.ritActive/.test(bron),
  'window.ritActive is altijd undefined — gebruik de bare naam in een try');
toets('gebruikt de bare naam met een typeof-vangnet',
  /typeof caravanActive !== 'undefined'/.test(bron) && /typeof ritActive !== 'undefined'/.test(bron),
  'zonder typeof-vangnet gooit een ontbrekende module een ReferenceError');

// ── 2. alle vijf zitten erin ──
['toggleRitMonitor', 'PLBulk', 'PLWaak', 'startCaravan', 'stopCaravan',
 'startRitAnalyse', 'stopRitAnalyse'].forEach(function (n) {
  toets('stuurt ' + n + ' aan', bron.indexOf(n) > -1);
});

// ── 3. sessies vragen om bevestiging bij het stoppen ──
// Caravan en rit-analyse gooien een lopende meting weg als je ze halverwege
// uitzet. Aanzetten mag zonder vraag; stoppen niet.
toets('bevestiging vóór het afbreken van een sessie',
  /sessie && s\.aan[\s\S]{0,200}confirm\(/.test(bron),
  'zonder bevestiging kost één misklik de hele meting');
toets('alleen bij stoppen, niet bij starten',
  !/!s\.aan[\s\S]{0,120}confirm\(/.test(bron));

// ── 4. het paneel maakt niets zelf ──
// De hele reden dat dit een dun schermpje is: het mag geen tweede laag
// wrappers worden. pidlane-remote.js heeft er al één en die maakt
// broncode-inspectie onbetrouwbaar.
toets('wrapt geen bestaande functies',
  !/window\.(toggleRitMonitor|startCaravan|stopCaravan|startRitAnalyse|stopRitAnalyse)\s*=/.test(bron),
  'een wrapper hier maakt de derde laag — dat is precies wat §20 verbiedt');
toets('houdt geen eigen aan/uit-staat bij',
  !/let _aan|var _aan|_staat\s*=\s*\{/.test(bron),
  'staat hoort uit de bron gelezen te worden, anders lopen paneel en app uiteen');

// ── 5. de chip hangt in de topbar ──
toets('chip staat in index.html', /id="runChip"/.test(index));
toets('dot staat in index.html', /id="rdot"/.test(index));
toets('module hangt in index.html', /src="pidlane-run\.js"/.test(index));
toets('bedradingscontrole blijft de laatste',
  (index.match(/src="pidlane-[a-z0-9-]*\.js"/g) || []).pop() === 'src="pidlane-bedrading.js"');

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
