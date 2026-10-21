// test-rapportkern.js — wat er van een eerder rapport als context naar de AI gaat.
//
// Tot 21-10-2026 ging het begin mee (sessie tot 1.800, voertuig 1.300 tekens per
// rapport): meestal voertuiggegevens en een sensortabel die de analyse toch al
// vers krijgt. plRapportKern() geeft conclusie en advies, en anders het begin.
// Laadt de echte PLRapport en knipt plRapportKern() uit pidlane-archief.js.
'use strict';
const fs = require('fs');
const vm = require('vm');
const dir = __dirname;

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const s = { console: { log() {}, warn() {}, error() {} } };
s.window = s; s.globalThis = s;
s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, addEventListener() {} }), addEventListener() {} };
vm.createContext(s);
vm.runInContext(fs.readFileSync(dir + '/pidlane-rapport.js', 'utf8'), s, { filename: 'pidlane-rapport.js' });

const ar = fs.readFileSync(dir + '/pidlane-archief.js', 'utf8');
const van = ar.indexOf('const RAPPORT_KERN_MAX');
const tot = ar.indexOf('// Contextblok met eerdere sessie-rapporten');
if (van < 0 || tot < van) { console.log('  FOUT  anker van plRapportKern() in pidlane-archief.js niet gevonden'); process.exit(1); }
vm.runInContext(ar.slice(van, tot) + '\nwindow.plRapportKern = plRapportKern; window.MAX = RAPPORT_KERN_MAX;', s);
const kern = s.plRapportKern;

const tabel = 'VOERTUIGGEGEVENS\nVW Golf 2015 1.4 TSI\n\nSENSORANALYSE\n' +
  Array.from({ length: 40 }, (_, i) => '| 01' + i + ' | ' + (i * 3) + ' | normaal |').join('\n');

console.log('\n1. Een rapport met koppen: de conclusie, niet de tabel');
{
  const t = tabel + '\n\nWAARSCHIJNLIJKE OORZAAK\nLek in de inlaat na de MAF.\n\nADVIES\n- Rookproef inlaat\n- Klemmen nalopen\n';
  const k = kern(t);
  toets('de conclusie staat erin', k.indexOf('Lek in de inlaat') >= 0, k);
  toets('het advies staat erin', k.indexOf('Rookproef inlaat') >= 0 && k.indexOf('Klemmen nalopen') >= 0, k);
  toets('de sensortabel niet  <- tegenproef op "het begin"', k.indexOf('| 01') < 0 && k.indexOf('VOERTUIGGEGEVENS') < 0, k);
  toets('korter dan het origineel', k.length < t.length / 3, k.length + ' van ' + t.length);
}

console.log('\n2. Een rapport met <rapport>-blok: de velden, zonder JSON');
{
  const t = 'Inleiding.\n<rapport>{"conclusie":"Thermostaat blijft open.","advies":[{"wat":"Thermostaat vervangen","urgentie":"binnenkort"}]}</rapport>\n' + tabel;
  const k = kern(t);
  toets('conclusie uit het blok', k.indexOf('Thermostaat blijft open.') >= 0, k);
  toets('advies uit het blok', k.indexOf('Thermostaat vervangen') >= 0, k);
  toets('geen ruwe JSON', k.indexOf('<rapport>') < 0 && k.indexOf('{"') < 0, k);
}

console.log('\n3. Geen koppen: het begin, zonder blok, en begrensd');
{
  const t = 'Vrije tekst zonder koppen. ' + 'x'.repeat(3000);
  const k = kern(t);
  toets('het begin gaat mee', k.indexOf('Vrije tekst zonder koppen.') === 0, k.slice(0, 60));
  toets('hoogstens RAPPORT_KERN_MAX plus het teken van inkorting', k.length <= s.MAX + 4, String(k.length));
  toets('een lange conclusie wordt ook begrensd', kern('CONCLUSIE\n' + 'y'.repeat(2000)).length <= s.MAX + 4);
  toets('leeg blijft leeg', kern('') === '' && kern(null) === '');
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
