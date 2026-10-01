// ══════════════════════════════════════════════════════════════════
// pltest-d1.js — de ECHTE D1-laag uit worker.js, voor de tests (#327)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT. Sinds 01-10-2026 staan Users, Klanten, TokenCodes,
// TokenLog en het veldlab in D1 en lopen ze door één laag in worker.js
// (D1_TABELLEN, d1Tabel, atZoek/atPatch/atMaak/…). Een dozijn tests knipt
// een route uit worker.js en gaf die tot dan een nagebouwde Airtable-fetch.
// Die nabouw is nu weg; in plaats daarvan krijgen ze hier de echte laag, op
// een echte SQLite. "Een test laadt zijn onderwerp, hij schrijft het niet
// over" (CLAUDE.md) geldt ook voor de opslag eronder.
//
// GEBRUIK
//   const { nieuweD1 } = require('../pltest-d1.js');
//   const d = nieuweD1();                 // een lege database met de laag erop
//   d.env                                  // { LOGDB } — geef door aan de route
//   await d.zaai('klanten', [{ id: 'recA…', fields: { Email: … } }])
//   await d.laag.atHaal(d.env, 'klanten', 'recA…')
//   d.rijen('klanten')                     // ruwe SQL-rijen, om na te kijken
//   d.omg                                  // { atAlle, atZoek, … } om te injecteren
//
// Er is geen AIRTABLE_TOKEN in d.env, dus er wordt nooit overgezet: de tabel
// begint leeg en bevat precies wat de test zaait.
//
// Geen test-*.js-naam: dan zou plcheck.sh hem als test draaien.
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const bron = fs.readFileSync(path.join(__dirname, 'worker.js'), 'utf8');

function knip(van, tot) {
  const a = bron.indexOf(van);
  const b = bron.indexOf(tot, a);
  if (a < 0 || b < 0) throw new Error('pltest-d1: anker niet gevonden in worker.js: ' + (a < 0 ? van : tot));
  return bron.slice(a, b + tot.length);
}

// CONFIG_SCHEMA (voor d1_overzet) en de hele laag, uit de echte bron.
const LAAG = knip('var CONFIG_SCHEMA = [', '];') + '\n' +
  knip('var D1_TABELLEN = {', '__name(atUpsert, "atUpsert");');

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

function laadLaag() {
  const f = new Function('__name', 'resolveBase', 'cfg', 'fetch', 'console', 'crypto',
    LAAG + '\nreturn { D1_TABELLEN, d1Tabel, d1Naar, atAlle, atZoek, atHaal, atPatch, atMaak, atWis, atUpsert };');
  return f((fn) => fn, (env, k) => k, (env, k) => k,
    async () => { throw new Error('pltest-d1: geen Airtable in deze test'); },
    { log() {}, error() {}, warn() {} }, globalThis.crypto);
}

function nieuweD1() {
  const db = new DatabaseSync(':memory:');
  const env = { LOGDB: maakD1(db) };
  const laag = laadLaag();
  async function zaai(sleutel, records) {
    const { def } = await laag.d1Tabel(env, sleutel);
    const velden = Object.keys(def.velden);
    for (const rec of records) {
      const f = rec.fields || {};
      db.prepare(`INSERT INTO ${def.d1} (id, rij_gemaakt, ${velden.map((v) => `"${v}"`).join(', ')}) VALUES (?, ?, ${velden.map(() => '?').join(', ')})`)
        .run(rec.id, rec.createdTime || '2026-01-01T00:00:00.000Z', ...velden.map((v) => laag.d1Naar(def.velden[v], f[v], v)));
    }
  }
  function rijen(sleutel) {
    return db.prepare(`SELECT * FROM ${laag.D1_TABELLEN[sleutel].d1}`).all();
  }
  const omg = {
    atAlle: laag.atAlle, atZoek: laag.atZoek, atHaal: laag.atHaal, atPatch: laag.atPatch,
    atMaak: laag.atMaak, atWis: laag.atWis, atUpsert: laag.atUpsert
  };
  return { db, env, laag, zaai, rijen, omg };
}

module.exports = { nieuweD1, maakD1, laadLaag };
