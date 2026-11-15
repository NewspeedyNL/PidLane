// ══════════════════════════════════════════════════════════════════
// test-batterijmeting.js — de lopende batterijmeting van de beheerder (#691)
// ──────────────────────────────────────────────────────────────────
// Laadt de ECHTE pidlane-batterijmeting.js (vm) en de ECHTE worker.js (als
// module, met node:sqlite als D1). Toetst:
//   1. segmenten(): %/uur per toestand, laden en stijgen tellen niet
//   2. moetVragen(): alleen beheerder, alleen na een lange sessie, één keer per 20 uur, tot 13-12
//   3. POST /admin/batterij: beheerder ja, klant nee, een foto die geen foto is nee
// Draaien vanuit public/:  node test-batterijmeting.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const vm = require('vm');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const s = { console: { warn() {}, log() {} }, Math, Date, JSON, Number, String, Object, Array, setInterval() { return 1; }, clearInterval() {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
s.window = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-batterijmeting.js'), 'utf8'), s, { filename: 'pidlane-batterijmeting.js' });
const B = s.PLBatterij;
if (!B) throw new Error('PLBatterij niet gezet');

console.log('\n1. segmenten()');
{
  const M = 60000, t0 = 1e12;
  const m = [
    { t: t0, lvl: 0.90, laden: false, toestand: 'hyperlane' },
    { t: t0 + 30 * M, lvl: 0.84, laden: false, toestand: 'achtergrond' },   // 6 % in 30 min hyperlane
    { t: t0 + 90 * M, lvl: 0.83, laden: false, toestand: 'achtergrond' },   // 1 % in 60 min achtergrond
    { t: t0 + 100 * M, lvl: 0.83, laden: true, toestand: 'voorgrond' },     // laden
    { t: t0 + 130 * M, lvl: 0.95, laden: false, toestand: 'voorgrond' }     // gestegen: telt niet
  ];
  const g = B.segmenten(m);
  toets('Hyperlane: 6 % in een halfuur = 12 %/uur', g.hyperlane.pctUur === 12, JSON.stringify(g.hyperlane));
  toets('achtergrond: 1 % per uur', g.achtergrond.pctUur === 1 && Math.round(g.achtergrond.ms / M) === 60, JSON.stringify(g.achtergrond));
  toets('laden en een stijgend niveau tellen niet', g.voorgrond.ms === 0, JSON.stringify(g.voorgrond));
  toets('korter dan tien minuten: geen %/uur (null), niet 0', B.segmenten([{ t: 0, lvl: 0.5, toestand: 'voorgrond' }, { t: 5 * M, lvl: 0.49, toestand: 'voorgrond' }]).voorgrond.pctUur === null);
}

console.log('\n2. moetVragen()');
{
  const nu = Date.parse('2026-11-20T10:00:00Z'), uur = 3600000;
  toets('beheerder na een lange sessie: ja', B.moetVragen({ beheerder: true, nu: nu, vraag: nu - uur }) === true);
  toets('klant: nooit', B.moetVragen({ beheerder: false, nu: nu, vraag: nu - uur }) === false);
  toets('zonder lange sessie: nee', B.moetVragen({ beheerder: true, nu: nu, vraag: 0 }) === false);
  toets('binnen 20 uur na de vorige vraag: nee', B.moetVragen({ beheerder: true, nu: nu, vraag: nu - uur, gevraagd: nu - 5 * uur }) === false);
  toets('"niet meer vragen": nee', B.moetVragen({ beheerder: true, nu: nu, vraag: nu - uur, nooit: true }) === false);
  toets('na 13 december: nee', B.moetVragen({ beheerder: true, nu: Date.parse('2026-12-20T10:00:00Z'), vraag: 1 }) === false);
}

function maakD1(db) {
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  });
  return { prepare: (sql) => stmt(sql, []) };
}

(async () => {
  console.log('\n3. POST /admin/batterij');
  const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
  const i = bron.lastIndexOf('export {');
  if (i < 0) throw new Error('export-blok niet gevonden in worker.js');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bat-')), 'worker.mjs');
  fs.writeFileSync(f, bron.slice(0, i) + 'export { worker_default as default, makeToken };\n');
  const W = await import('file://' + f);
  const db = new DatabaseSync(':memory:');
  const env = { LOGDB: maakD1(db), SESSION_SECRET: 'test-geheim-dat-lang-genoeg-is-0123456789' };
  const admin = (await W.makeToken(env, 'beheer', 'admin', 'Beheer')).token;
  const klant = (await W.makeToken(env, 'anna@voorbeeld.nl', 'klant', 'Anna')).token;
  async function roep(tok, body) {
    const r = await W.default.fetch(new Request('https://app.pidlane.nl/admin/batterij', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Token': tok, Origin: 'https://app.pidlane.nl' }, body: JSON.stringify(body)
    }), env, { waitUntil() {} });
    let d = {}; try { d = await r.json(); } catch (e) { d = { _geenJson: true }; }
    d._status = r.status; return d;
  }
  const foto = 'data:image/jpeg;base64,' + Buffer.alloc(300, 1).toString('base64');
  let d = await roep(admin, { pct: 3.4, uren: 12, notitie: 'proef', foto: foto, meting: { hyperlane: { pctUur: 12 } } });
  toets('beheerder: bewaard', d.ok === true && d._status === 200, JSON.stringify(d));
  const rij = db.prepare('SELECT pct, uren, foto, meting FROM batterij_meting').get();
  toets('met percentage, uren, foto en eigen meting', rij && rij.pct === 3.4 && rij.uren === 12 && rij.foto === foto && /hyperlane/.test(rij.meting), JSON.stringify(rij && { pct: rij.pct, uren: rij.uren }));
  d = await roep(klant, { pct: 3 });
  toets('klant: 403', d._status === 403, JSON.stringify(d));
  d = await roep(admin, { pct: 3, foto: 'data:text/html;base64,PGh0bWw+' });
  toets('een "foto" die geen afbeelding is: 400', d._status === 400, JSON.stringify(d));
  d = await roep(admin, { pct: 130 });
  toets('percentage boven 100: 400', d._status === 400, JSON.stringify(d));

  console.log('\n' + (fout ? 'FOUT — ' + fout + ' van ' + n + ' toetsen' : 'Alles goed — ' + n + ' toetsen'));
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('FOUT: de test zelf klapte — ' + (e && e.stack || e)); process.exit(1); });
