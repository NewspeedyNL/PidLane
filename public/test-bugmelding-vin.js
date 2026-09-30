// ══════════════════════════════════════════════════════════════════
// test-bugmelding-vin.js — de bugmelding stuurt het VIN-pseudoniem, niet
// het chassisnummer
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Gevonden op 30-09-2026: submitBugReport() in pidlane-auth.js zette
// vehicleInfo.vin ruw in het veld VIN van het record naar /airtable/log, en
// het venster toonde het volledige chassisnummer bij "Automatisch
// meegestuurd". De Worker pseudonimiseert daar niet. Dat was een vierde
// uitgaand pad naast de drie in §7 van PIDLANE.md, en test-vin-anoniem.js
// zag het niet omdat die alleen _plVinVoorLog() en Veldlab toetst — niet wie
// ze wel of niet aanroept.
//
// Deze test knipt de echte bugmelder uit pidlane-auth.js en de echte
// pseudoniemfunctie uit pidlane-veldlab.js, en voert ze uit met een nep-DOM.
// Hij toetst wat er de deur uitgaat (record, mailtekst) en wat het venster
// zegt dat er meegaat — gedrag, geen regel tekst.
//
// Draaien vanuit public/:  node test-bugmelding-vin.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

function knip(bestand, vanAnker, totAnker) {
  const src = fs.readFileSync(__dirname + '/' + bestand, 'utf8');
  const van = src.indexOf(vanAnker), tot = src.indexOf(totAnker, van);
  if (van < 0 || tot < 0) {
    console.error('FOUT: anker niet gevonden in ' + bestand + ':');
    console.error('      ' + (van < 0 ? vanAnker : totAnker));
    process.exit(1);
  }
  return src.slice(van, tot);
}

const veldlab = knip('pidlane-veldlab.js', 'const VL_VIN_ZOUT', 'async function _vlSchoonVoorVerzending');
const logvin  = knip('pidlane-auth.js', 'async function _plVinVoorLog', 'async function logToSheets');
const melder  = knip('pidlane-auth.js', 'function _bugDiag(){', '// API KEY UI');

const VIN = 'JM3KFBCL8J0123456';          // Mazda CX-5, het testvoertuig

let fout = 0, n = 0;
function toets(naam, ok, detail) {
  n++;
  if (ok) { console.log('  ok    ' + naam); return; }
  console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
  fout++;
}

// Nep-omgeving: net genoeg DOM om het venster te bouwen en de knoppen te
// laten lezen, plus een plFetch en een window.location die vastleggen wat
// er verstuurd wordt.
function omgeving() {
  const el = {};
  const maakEl = id => (el[id] = el[id] || { id, style: {}, value: '', textContent: '', innerHTML: '', focus() {} });
  maakEl('bugDesc').value = 'Knop doet niets';
  maakEl('bugRepro').value = 'Stap 1: tik erop';
  maakEl('bugMsg');
  const document = {
    getElementById: id => el[id] || null,
    createElement: () => ({ style: {} }),
    body: { appendChild: e => { el[e.id] = e; } },
  };
  const verstuurd = [];
  const window = { location: { href: '' }, open() {} };
  const g = {
    document, window, verstuurd, el,
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14)' },
    vehicleInfo: { merk: 'Mazda', model: 'CX-5', year: '2018', vin: VIN },
    currentUser: { name: 'Nico', role: 'tester' },
    AIRTABLE_URL: 'https://example.invalid/airtable/log',
    plFetch: async (url, opt) => { verstuurd.push(JSON.stringify(opt && opt.json)); return { ok: true }; },
  };
  const maak = new Function('TextEncoder', 'crypto', ...Object.keys(g),
    'const console={warn(){}};const setTimeout=function(){};const APP_VERSION="t";' +
    'const isConnected=false;const selectedNetwork=null;const _btLog=[];' +
    'function log(){} function closeKebab(){} function showToast(){} function _atNoteer(){}\n' +
    veldlab + '\n' + logvin + '\n' + melder +
    '\nreturn {_vlVinPseudoniem, openBugReport, submitBugReport, bugEmailFallback};');
  return Object.assign(g, maak(TextEncoder, crypto, ...Object.values(g)));
}

(async function () {
  console.log('\nBugmelding en het chassisnummer\n');
  const g = omgeving();
  const ps = await g._vlVinPseudoniem(VIN);
  const verwacht = 'JM3:' + ps;

  // ── 1. het record naar /airtable/log ──
  await g.submitBugReport(null);
  toets('er gaat precies één record weg', g.verstuurd.length === 1, 'aantal: ' + g.verstuurd.length);
  const rec = g.verstuurd[0] || '';
  toets('het record bevat de ruwe VIN nergens', rec.indexOf(VIN) < 0, rec);
  const veld = (JSON.parse(rec || '{}').records || [{}])[0].fields || {};
  toets('het veld VIN is WMI:pseudoniem, zoals de logkolom', veld.VIN === verwacht,
        'kreeg ' + veld.VIN + ', verwacht ' + verwacht);

  // ── 2. het venster zegt wat er echt meegaat ──
  await g.openBugReport();
  const html = (g.el.bugModal && g.el.bugModal.innerHTML) || '';
  toets('het venster is gebouwd', html.indexOf('Automatisch meegestuurd') >= 0);
  toets('het venster toont de ruwe VIN niet', html.indexOf(VIN) < 0);
  toets('het venster toont het pseudoniem dat verstuurd wordt', html.indexOf(verwacht) >= 0,
        'verwacht ' + verwacht + ' in de tekst');
  toets('het venster noemt het niet "anoniem"', !/anoniem/i.test(html));

  // ── 3. de mail-terugval ──
  g.bugEmailFallback();
  const mail = decodeURIComponent(g.window.location.href || '');
  toets('de mail-terugval opent een mailto', mail.indexOf('mailto:') === 0, mail.slice(0, 60));
  toets('de mailtekst bevat de ruwe VIN niet', mail.indexOf(VIN) < 0);

  // ── 4. geen voertuig: niets te pseudonimiseren, niets lekt ──
  const leeg = omgeving();
  leeg.vehicleInfo.vin = '';
  await leeg.submitBugReport(null);
  const veldLeeg = (JSON.parse(leeg.verstuurd[0] || '{}').records || [{}])[0].fields || {};
  toets('zonder VIN blijft het veld leeg', veldLeeg.VIN === '', 'kreeg ' + veldLeeg.VIN);

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'alle ' + n + ' tests geslaagd') + '\n');
  process.exit(fout ? 1 : 0);
})().catch(e => { console.error('FOUT: test wierp een exception:', e); process.exit(1); });
