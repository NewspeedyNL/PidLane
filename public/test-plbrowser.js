// ══════════════════════════════════════════════════════════════════
// test-plbrowser.js — vindt plbrowser.js Chromium op een nieuw Playwright-pad?
// ──────────────────────────────────────────────────────────────────
// Op 23-10-2026 zocht vindChromium() alleen in chromium-1194, terwijl het
// image chromium-1243 had: elke browserproef sloeg lokaal over met "geen
// Chromium". Dit bouwt een nep-map met twee versies en laadt de echte
// functie; PLAYWRIGHT_BROWSERS_PATH wijst ernaar.
//
// Draaien vanuit public/:  node test-plbrowser.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

let fouten = 0;
function eis(waar, wat, extra) {
  if (waar) { console.log('  ok   ' + wat); return; }
  fouten++;
  console.log('  FOUT ' + wat + (extra ? '\n       ' + extra : ''));
}

const basis = fs.mkdtempSync(path.join(os.tmpdir(), 'plbrowser-'));
const maak = (...d) => { const p = path.join(basis, ...d); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, ''); return p; };
const oud = maak('chromium-1194', 'chrome-linux', 'chrome');
const nieuw = maak('chromium-1243', 'chrome-linux64', 'chrome');
maak('chromium_headless_shell-1243', 'chrome-headless-shell-linux64', 'chrome-headless-shell');
fs.mkdirSync(path.join(basis, 'chromium-999', 'chrome-linux64'), { recursive: true }); // map zonder binary

delete process.env.PL_CHROME;
process.env.PLAYWRIGHT_BROWSERS_PATH = basis;
const { vindChromium, playwrightPaden } = require(path.join(__dirname, '..', 'plbrowser.js'));

const paden = playwrightPaden(basis);
eis(paden.indexOf(nieuw) >= 0 && paden.indexOf(oud) > paden.indexOf(nieuw), 'beide versies gevonden, de nieuwste eerst', paden.join('\n       '));
eis(!paden.some((p) => /headless_shell/.test(p)), 'de headless shell telt niet als Chromium');
eis(vindChromium() === nieuw, 'vindChromium kiest chromium-1243 (chrome-linux64)', vindChromium());
fs.unlinkSync(nieuw);
eis(vindChromium() === oud, 'zonder 1243 valt hij terug op 1194 (chrome-linux)', vindChromium());
eis(playwrightPaden(path.join(basis, 'bestaat-niet')).length === 0, 'een ontbrekende map geeft een lege lijst, geen fout');

fs.rmSync(basis, { recursive: true, force: true });
console.log(fouten ? '\n' + fouten + ' FOUT' : '\nAlles goed');
process.exit(fouten ? 1 : 0);
