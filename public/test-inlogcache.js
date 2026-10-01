// ══════════════════════════════════════════════════════════════════
// test-inlogcache.js — inloggen tegen de gebruikerstabel in D1 (#327)
// ──────────────────────────────────────────────────────────────────
// WAAROM. Tot 28-09-2026 las elke login de Users-tabel vers uit Airtable, in
// een werkruimte met een plafond van 1.000 calls per maand. Toen kwam er een
// cache van vijf minuten bij; daar ging deze test over. Sinds 01-10-2026 staat
// de tabel in D1 en is lezen gratis, dus de cache is weg. De naam van dit
// bestand is gebleven; wat hij toetst is de login zelf:
//   • de tabel wordt één keer uit Airtable overgezet, daarna nooit meer;
//   • een gewijzigd wachtwoord geldt meteen, het oude niet meer;
//   • een via /admin/users uitgezette gebruiker komt er meteen niet meer in
//     (bij Airtable deed dat niets: een uitgevinkt vinkje kwam daar als
//     "geen veld" terug, nooit als false);
//   • een oud sha256-wachtwoord wordt bij de login herhasht, in D1;
//   • een gewiste gebruiker kan niet meer inloggen.
//
// De ECHTE worker.js, als module geladen, door de echte router heen, met
// een echte SQLite als D1. Alleen fetch naar Airtable is nagebouwd, voor de
// overzet, en die telt mee.
//
// Draaien vanuit public/:  node test-inlogcache.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');

async function laadWorker() {
  const i = bron.lastIndexOf('export {');
  if (i < 0) throw new Error('export-blok niet gevonden in worker.js');
  const mod = bron.slice(0, i) + 'export { worker_default as default, hashPassword };\n';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'inlog-')), 'worker.mjs');
  fs.writeFileSync(f, mod);
  return import('file://' + f);
}

function maakD1(db) {
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    _sync() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }
  });
  return {
    prepare: (sql) => stmt(sql, []),
    async batch(lijst) {
      db.exec('BEGIN');
      try { const uit = lijst.map((s) => s._sync()); db.exec('COMMIT'); return uit; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  };
}

// ── Airtable, nagebouwd: alleen de Users-tabel voor de overzet ────────
const at = { rijen: [], lezingen: 0 };
global.fetch = async (url) => {
  const u = String(url);
  if (!/api\.airtable\.com\/v0\/[^/]+\/Users/.test(u)) throw new Error('onverwachte fetch in deze test: ' + u);
  at.lezingen++;
  return new Response(JSON.stringify({ records: at.rijen }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const db = new DatabaseSync(':memory:');
const env = { SESSION_SECRET: 'test-geheim', AIRTABLE_TOKEN: 'x', ADMIN_TOKEN: 'beheer-token-test', LOGDB: maakD1(db) };
const ctx = { taken: [], waitUntil(p) { this.taken.push(p); } };
let ipTeller = 0;

(async () => {
  const W = await laadWorker();

  async function login(user, pass) {
    const r = await W.default.fetch(new Request('https://api.pidlane.nl/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.pidlane.nl', 'CF-Connecting-IP': '10.0.0.' + (++ipTeller) },
      body: JSON.stringify({ user, pass })
    }), env, ctx);
    await Promise.all(ctx.taken.splice(0));
    return r.status;
  }
  async function beheer(body) {
    const r = await W.default.fetch(new Request('https://api.pidlane.nl/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.pidlane.nl', 'X-Admin-Token': env.ADMIN_TOKEN, 'CF-Connecting-IP': '10.9.9.9' },
      body: JSON.stringify(body)
    }), env, ctx);
    return r.status;
  }
  const passHash = (user) => (db.prepare('SELECT "PassHash" AS h FROM gebruikers WHERE "User" = ?').get(user) || {}).h;

  at.rijen = [
    { id: 'recAnna0000000001', createdTime: '2026-07-01T00:00:00.000Z',
      fields: { User: 'anna', Role: 'user', Label: 'Anna', Active: true, PassHash: await W.hashPassword('wachtwoord-anna', env) } },
    { id: 'recCees0000000003', createdTime: '2026-07-01T00:00:00.000Z',
      fields: { User: 'cees', Role: 'user', Label: 'Cees', Active: true,
        PassHash: crypto.createHash('sha256').update('wachtwoord-cees').digest('hex') } }
  ];

  console.log('\n1. De gebruikers komen één keer uit Airtable');
  const s1 = await login('anna', 'wachtwoord-anna');
  const s2 = await login('anna', 'wachtwoord-anna');
  toets('twee logins lukken', s1 === 200 && s2 === 200, 'status ' + s1 + '/' + s2);
  toets('en Airtable werd één keer gelezen (de overzet)', at.lezingen === 1, at.lezingen + ' lezingen');

  console.log('\n2. Een gewijzigd wachtwoord geldt meteen');
  const sw = await beheer({ action: 'save', user: 'anna', role: 'user', label: 'Anna', pass: 'nieuw-wachtwoord' });
  const s3 = await login('anna', 'nieuw-wachtwoord');
  const s4 = await login('anna', 'wachtwoord-anna');
  toets('beheer slaat het op', sw === 200, 'status ' + sw);
  toets('het nieuwe wachtwoord werkt', s3 === 200, 'status ' + s3);
  toets('het oude niet meer', s4 === 401, 'status ' + s4);

  console.log('\n3. Een nieuwe gebruiker kan meteen inloggen');
  const sn = await beheer({ action: 'save', user: 'bert', role: 'user', label: 'Bert', pass: 'wachtwoord-bert' });
  toets('beheer maakt hem aan', sn === 200, 'status ' + sn);
  toets('en hij komt erin', await login('bert', 'wachtwoord-bert') === 200);

  console.log('\n4. Uitzetten via /admin/users werkt meteen');
  const su = await beheer({ action: 'save', user: 'anna', role: 'user', label: 'Anna', active: false });
  toets('beheer zet Active uit', su === 200, 'status ' + su);
  toets('in D1 staat Active op 0, niet leeg', (db.prepare('SELECT "Active" AS a FROM gebruikers WHERE "User" = ?').get('anna') || {}).a === 0);
  toets('en anna komt er niet meer in', await login('anna', 'nieuw-wachtwoord') === 401);
  await beheer({ action: 'save', user: 'anna', role: 'user', label: 'Anna', active: true });
  toets('weer aan: ze komt er weer in', await login('anna', 'nieuw-wachtwoord') === 200);

  console.log('\n5. Een oud sha256-wachtwoord wordt bij de login herhasht');
  toets('cees logt in met zijn oude hash', await login('cees', 'wachtwoord-cees') === 200);
  toets('daarna staat er een pbkdf2-hash in D1', /^pbkdf2_sha256\$/.test(String(passHash('cees'))), String(passHash('cees')).slice(0, 20));
  toets('en hij komt er nog steeds in', await login('cees', 'wachtwoord-cees') === 200);

  console.log('\n6. Een gewiste gebruiker kan niet meer inloggen');
  const sd = await beheer({ action: 'delete', user: 'bert' });
  toets('beheer wist hem', sd === 200, 'status ' + sd);
  toets('en hij komt er niet meer in', await login('bert', 'wachtwoord-bert') === 401);

  console.log('\n7. En in al die tijd is Airtable maar één keer gelezen');
  toets('één lezing', at.lezingen === 1, at.lezingen + ' lezingen');

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
