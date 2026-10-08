// ══════════════════════════════════════════════════════════════════
// test-sweeplijst.js — wat de PID-sweep van blok 3 aan de auto vraagt
// ──────────────────────────────────────────────────────────────────
// Op 09-10-2026 gaf blok 5 twee FOUT-regels: "12× een berekende PID naar de
// adapter" en "4× een TL-code naar sendCmd", allebei met _blok3 in de
// stacktrace. De sweep veegde de hele keuzelijst, en daar staan de berekende
// waarden en de telefoonsensoren ook in. sendCmd weigerde ze netjes, maar
// telde de weigering — de testrun maakte zelf de fout die hij meldde.
//
// Deze test laadt _sweepLijst() uit de testrun en de echte modules die
// zeggen wat berekend en wat telefoon is. Geen eigen lijst van CA- en
// TL-codes: die zou uit de pas lopen zodra er een bijkomt.
// ══════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const lees = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

function knip(bron, vanaf, tot, wat) {
  const a = bron.indexOf(vanaf), b = bron.indexOf(tot, a);
  if (a < 0 || b < 0) { console.log('FOUT: knippad voor ' + wat + ' niet gevonden'); process.exit(1); }
  return bron.slice(a, b);
}

const ctx = { console, localStorage: { getItem() { return null; }, setItem() {} }, navigator: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(lees('pidlane-berekend.js'), ctx, { filename: 'pidlane-berekend.js' });
vm.runInContext(lees('pidlane-telemetrie.js'), ctx, { filename: 'pidlane-telemetrie.js' });

const tr = lees('pidlane-testrun.js');
vm.runInContext(
  knip(tr, 'const VERBODEN =', '\n', 'VERBODEN') + '\n' +
  knip(tr, 'function _sweepLijst(lijst)', '// ── einde sweeplijst', '_sweepLijst') +
  '\nthis._sweepLijst = _sweepLijst;',
  ctx, { filename: 'pidlane-testrun.js (knip)' });

let fouten = 0, aantal = 0;
function eis(ok, wat, detail) {
  aantal++;
  if (ok) console.log('  ok   ' + wat);
  else { fouten++; console.log('  FOUT ' + wat + (detail ? '  —  ' + detail : '')); }
}

const berekend = Object.keys(ctx.PLBerekend.DEFS);
const telefoon = Object.keys(ctx.PLTelemetrie.DEFS);
eis(berekend.length > 0 && telefoon.length > 0, 'de echte modules leveren berekende en telefooncodes',
  berekend.length + ' berekend, ' + telefoon.length + ' telefoon');

const uit = ctx._sweepLijst(['010C', '010D', '221E1C'].concat(berekend, telefoon, ['04', '', null, '0105']));
eis(uit.join(',') === '010C,010D,221E1C,0105', 'alleen wat de auto kan beantwoorden blijft over', uit.join(','));
eis(!uit.some((p) => /^CA/i.test(p)), 'geen berekende PID naar de adapter (de FOUT van 09-10)');
eis(!uit.some((p) => /^TL/i.test(p)), 'geen telefoonsensor naar de adapter (de FOUT van 09-10)');
eis(uit.indexOf('04') < 0, 'wissen (04) blijft verboden');
eis(ctx._sweepLijst(undefined).length === 0, 'geen lijst geeft een lege lijst, geen crash');

console.log('\n' + (fouten ? fouten + ' van ' + aantal + ' FOUT' : 'Alle ' + aantal + ' goed'));
process.exit(fouten ? 1 : 0);
