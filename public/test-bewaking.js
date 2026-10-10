// ══════════════════════════════════════════════════════════════════
// test-bewaking.js — /admin/d1?actie=bewaking: is er iets anders dan normaal?
// ──────────────────────────────────────────────────────────────────
// Sinds de Play Store laadt de APK app.pidlane.nl live; een fout in een
// deploy staat meteen op elke telefoon. De bewaking vergelijkt de laatste 24
// uur met de zeven dagen ervóór. Twee helften, twee soorten toets:
//   - bewakingOordeel() is puur: verzonnen metingen, en per signaal de
//     vraag of het aangaat als het moet én uit blijft als het normaal is;
//   - adminD1Bewaking() meet in echte SQLite uit schema.sql, zodat een
//     verkeerde tijdgrens of kolomnaam hier rood wordt en niet in productie.
//
// Draaien vanuit public/:  node test-bewaking.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const wortel = path.join(__dirname, '..');
const bron = fs.readFileSync(path.join(wortel, 'worker.js'), 'utf8');
function knip(van, tot, wat) {
  const a = bron.indexOf(van), b = bron.indexOf(tot);
  if (a < 0 || b < a) { console.error('FOUT: ' + wat + ' niet gevonden in worker.js'); process.exit(1); }
  return bron.slice(a, b + tot.length);
}
const src = knip('async function d1Paren(', '__name(d1Paren, "d1Paren");', 'd1Paren()') + '\n' +
  knip('// ── De bewaking (10-10-2026)', '__name(adminD1Bewaking, "adminD1Bewaking");', 'het bewakingsblok');
const W = new Function('json', '__name', src + '\nreturn { BEWAKING, bewakingOordeel, adminD1Bewaking };')(
  (body) => ({ body }), () => { });
const ids = (s) => s.map((x) => x.id + ':' + x.ernst).join(',');

const NU = Date.parse('2026-10-10T12:00:00Z');
// Een gewone week: 100 regels en 2 fouten per dag, laatste regel net binnen.
const gewoon = (over) => Object.assign({
  nu: NU, laatste: '2026-10-10T11:55:00.000Z',
  uur: { n: 4, fouten: 0 }, dag: { n: 100, fouten: 2 },
  basis: { perDag: 100, foutenPerDag: 2 }, nieuweFouten: [], bugs: [], onbekend: 0
}, over || {});

console.log('\n1. Het oordeel');
toets('een gewone dag: geen signaal', ids(W.bewakingOordeel(gewoon())) === '', ids(W.bewakingOordeel(gewoon())));

let s = W.bewakingOordeel(gewoon({ laatste: '2026-10-10T04:00:00.000Z' }));
toets('acht uur stil bij een actieve app: oranje', ids(s) === 'stil:oranje', ids(s));
s = W.bewakingOordeel(gewoon({ laatste: '2026-10-09T10:00:00.000Z' }));
toets('26 uur stil: rood', ids(s) === 'stil:rood', ids(s));
s = W.bewakingOordeel(gewoon({ laatste: '2026-10-10T04:00:00.000Z', basis: { perDag: 5, foutenPerDag: 0 } }));
toets('stil bij een handvol testers is normaal  <- tegenproef', !s.some((x) => x.id === 'stil'), ids(s));

s = W.bewakingOordeel(gewoon({ uur: { n: 40, fouten: 0 } }));
toets('40 regels in een uur (normaal ~4): oranje', ids(s) === 'uur:oranje', ids(s));
s = W.bewakingOordeel(gewoon({ uur: { n: 200, fouten: 0 } }));
toets('200 in een uur: rood', ids(s) === 'uur:rood', ids(s));
s = W.bewakingOordeel(gewoon({ uur: { n: 25, fouten: 0 } }));
toets('25 in een uur zit onder de bodem van 30', !s.length, ids(s));
s = W.bewakingOordeel(gewoon({ dag: { n: 400, fouten: 2 } }));
toets('400 op een dag (normaal 100): oranje "vandaag"', ids(s) === 'dag:oranje', ids(s));

s = W.bewakingOordeel(gewoon({ dag: { n: 100, fouten: 8 } }));
toets('8 fouten (normaal 2): oranje', ids(s) === 'fouten:oranje', ids(s));
s = W.bewakingOordeel(gewoon({ dag: { n: 100, fouten: 20 } }));
toets('20 fouten: rood, en rood staat bovenaan', s[0] && s[0].id === 'fouten' && s[0].ernst === 'rood', ids(s));
s = W.bewakingOordeel(gewoon({ dag: { n: 100, fouten: 5 } }));
toets('5 fouten is nog geen signaal (bodem)', !s.length, ids(s));

s = W.bewakingOordeel(gewoon({ nieuweFouten: [['TypeError: x is undefined', 12, ''], ['eenmalig', 1, '']] }));
toets('een nieuwe fout die 12× voorkomt: oranje, met de tekst erbij', ids(s) === 'nieuw:oranje' && /TypeError/.test(s[0].detail) && !/eenmalig/.test(s[0].detail), JSON.stringify(s));
s = W.bewakingOordeel(gewoon({ bugs: [{ ontvangen: '2026-10-10T09:00:00.000Z', Message: 'Knop doet niets' },
                                     { ontvangen: '2026-10-05T09:00:00.000Z', Message: 'oud' }] }));
toets('een bugmelding van vandaag telt, een van vorige week niet', ids(s) === 'bugs:oranje' && /Knop/.test(s[0].detail) && /^Een /.test(s[0].titel), JSON.stringify(s));
s = W.bewakingOordeel(gewoon({ onbekend: 3 }));
toets('velden zonder kolom: oranje', ids(s) === 'onbekend:oranje', ids(s));

console.log('\n2. De meting in echte SQLite');
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(wortel, 'schema.sql'), 'utf8'));
const ins = db.prepare('INSERT INTO logregels (ontvangen, Type, Message, SessionId, Device, AppVersion, onbekend) VALUES (?,?,?,?,?,?,?)');
const t = (uurTerug) => new Date(NU - uurTerug * 36e5).toISOString();
// Basisweek (dag 2 t/m 8 terug): 30 per dag, waarvan 1 bekende fout.
for (let d = 2; d <= 8; d++) for (let i = 0; i < 30; i++)
  ins.run(t(d * 24 - i * 0.5), i ? 'info' : 'error', i ? 'meting' : 'bekende fout', 'rit' + d, 'web', '3.1.0', null);
// Vandaag: 50 regels in het laatste uur, een nieuwe fout 4×, een bug uit de APK.
for (let i = 0; i < 50; i++) ins.run(t(i / 60), 'info', 'lus', 'rit0', 'android APK', '3.2.0', null);
for (let i = 0; i < 4; i++) ins.run(t(2 + i), 'error', 'nieuwe fout na deploy', 'rit0', 'android APK', '3.2.0', null);
ins.run(t(3), 'error', 'bekende fout', 'rit0', 'web', '3.2.0', null);
ins.run(t(5), 'bug', 'Scherm blijft wit', 'rit0', 'android APK · Android 14', '3.2.0', null);
ins.run(t(48 * 24), 'error', 'heel oud', 'rit9', 'web', '3.0.0', 'x=1');   // buiten alles
const D1 = { prepare: (sql) => { const st = (a) => ({ bind: (...b) => st(b), all: () => ({ results: db.prepare(sql).all(...a) }), first: () => db.prepare(sql).get(...a) || null }); return st([]); } };

(async () => {
  const m = (await W.adminD1Bewaking(D1, NU)).body;
  toets('route geeft ok', m.ok === true);
  toets('laatste regel is de nieuwste', m.laatste === t(0), m.laatste);
  toets('laatste uur: 50 regels', m.uur.n === 50, JSON.stringify(m.uur));
  toets('24 uur: 56 regels, 6 fouten (error + bug)', m.dag.n === 56 && m.dag.fouten === 6, JSON.stringify(m.dag));
  toets('basis: 30 per dag, 1 fout per dag', m.basis.perDag === 30 && m.basis.foutenPerDag === 1, JSON.stringify(m.basis));
  toets('de oude regel van 48 dagen terug telt nergens mee', !m.perUur.some((x) => x[0] < t(48).slice(0, 13)), JSON.stringify(m.perUur[0]));
  const nieuwe = m.nieuweFouten.map((x) => x[0]);
  toets('nieuwe fout gevonden, de bekende niet', nieuwe.indexOf('nieuwe fout na deploy') >= 0 && nieuwe.indexOf('bekende fout') < 0, JSON.stringify(m.nieuweFouten));
  toets('de bugmelding met toestel erbij', m.bugs.length === 1 && /APK/.test(m.bugs[0].Device), JSON.stringify(m.bugs));
  toets('per toestel: APK en web gescheiden', m.perToestel.some((x) => x[0] === 'android APK') && m.perToestel.some((x) => x[0] === 'web'), JSON.stringify(m.perToestel));
  toets('onbekend telt alleen de laatste 24 uur', m.onbekend === 0, m.onbekend);
  const sig = m.signalen.map((x) => x.id).sort().join();
  toets('signalen: veel regels, fouten, nieuwe fout, bug', sig === 'bugs,fouten,nieuw,uur', sig);

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('  FOUT test brak af: ' + (e.stack || e)); process.exit(1); });
