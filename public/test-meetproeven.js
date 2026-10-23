// ══════════════════════════════════════════════════════════════════
// test-meetproeven.js — de meetproeven in meetproeven/ zijn bruikbaar (#594)
// ──────────────────────────────────────────────────────────────────
// De meetproeven zijn DATA voor D1, geen tekst in CAMPAGNE. Wat hier ligt is
// wat in beheer.html ingevoerd wordt; elke file gaat door de echte keurder
// (plopdracht.js), inclusief "kan hij rood worden". En de tegenproef: een
// proef die al waar is zodra zijn voorwaarde vervuld is, moet plopdracht
// afkeuren — dat was de opstelfout waar #594 over gaat.
//
// Draaien vanuit public/:  node test-meetproeven.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const wortel = path.join(__dirname, '..');
const keurder = path.join(wortel, 'plopdracht.js');
const map = path.join(wortel, 'meetproeven');
const kaal = (t) => String(t || '').replace(/\x1b\[[0-9;]*m/g, '');
function keur(invoer) {
  const r = spawnSync(process.execPath, [keurder, '-'], { input: invoer, encoding: 'utf8' });
  return { code: r.status, uit: kaal(r.stdout) + kaal(r.stderr) };
}

const files = fs.existsSync(map) ? fs.readdirSync(map).filter((f) => f.endsWith('.json')) : [];
toets('meetproeven/ bevat opdrachten', files.length > 0);
files.forEach(function (f) {
  const tekst = fs.readFileSync(path.join(map, f), 'utf8');
  const r = keur(tekst);
  toets(f + ': plopdracht keurt alles goed', r.code === 0 && !/FOUT/.test(r.uit), r.uit.trim());
  const lijst = [].concat(JSON.parse(tekst));
  toets(f + ': elke opdracht heeft voorwaarden en proeven met een issue',
    lijst.every((o) => (o.voorwaarden || []).length && (o.proeven || []).length && o.proeven.every((p) => /^#\d+$/.test(p.issue))));
  toets(f + ': elke naam noemt zijn issue', lijst.every((o) => /#\d+/.test(o.naam)));
});

const slecht = { schema: 2, naam: 'tegenproef', sensoren: ['010D'], duurS: 60,
  voorwaarden: [{ wat: 'stil', toestand: 'stil', minS: 30 }],
  proeven: [{ issue: '#594', naam: 'stil gezien', app: 'toestand-stil-s', tussen: [10, 100000] }] };
const r1 = keur(JSON.stringify(slecht));
toets('tegenproef: een proef die de voorwaarde herhaalt wordt afgekeurd', r1.code === 1 && /kan niet rood worden/.test(r1.uit), r1.uit.trim());
const goed = JSON.parse(JSON.stringify(slecht));
goed.proeven[0].tussen = [0, 600];
const r2 = keur(JSON.stringify(goed));
toets('met een bovengrens kan hij wél rood worden', r2.code === 0 && !/kan niet rood/.test(r2.uit), r2.uit.trim());
const app = { schema: 2, naam: 'app', sensoren: ['010D'], duurS: 60,
  voorwaarden: [{ wat: 'scan', app: 'onderzoek-scans', tussen: [1, 99] }],
  proeven: [{ issue: '#594', naam: 'scan', app: 'onderzoek-scans', tussen: [0, 100] }] };
toets('ook voor een app-maat als voorwaarde én proef', keur(JSON.stringify(app)).code === 1);

console.log('\n' + (fout ? 'FOUT — ' + fout + ' van ' + n + ' toetsen' : 'Alles goed — ' + n + ' toetsen'));
process.exit(fout ? 1 : 0);
