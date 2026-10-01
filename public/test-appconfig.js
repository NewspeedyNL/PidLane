// ══════════════════════════════════════════════════════════════════
// test-appconfig.js — AppConfig staat in D1, Airtable wordt één keer gelezen (#327)
// ──────────────────────────────────────────────────────────────────
// WAAROM. Elke opstart van de app haalde /api/config op, en dat was een
// call naar de Airtable-base Config in een werkruimte met een plafond van
// 1.000 per maand. De randcache van 60 s ving alleen opstarts die vlak na
// elkaar kwamen. Nu staat de tabel in D1 en zet de Worker hem één keer
// vanzelf over.
//
// WAT HIER ROOD HOORT TE WORDEN
//   • na de overzet nog een call naar Airtable;
//   • een waarde die er anders uitkomt dan hij erin ging ("true" ≠ true);
//   • een overzet die een in beheer gekozen waarde overschrijft;
//   • een mislukte overzet die als gelukt wordt genoteerd (dan blijft de
//     tabel voorgoed leeg);
//   • een tweede pagina uit Airtable die wegvalt.
//
// De ECHTE worker.js, als module geladen, door de echte router heen, met
// een echte SQLite als D1. Alleen fetch naar Airtable is nagebouwd.
//
// Draaien vanuit public/:  node test-appconfig.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
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
const schemaSql = fs.readFileSync(path.join(wortel, 'schema.sql'), 'utf8');

async function laadWorker(src) {
  const i = src.lastIndexOf('export {');
  if (i < 0) throw new Error('export-blok niet gevonden in worker.js');
  const mod = src.slice(0, i) + 'export { worker_default as default, makeToken, CONFIG_SCHEMA };\n';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'appcfg-')), 'worker.mjs');
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

// ── Airtable, nagebouwd: AppConfig over twee pagina's, elke lezing telt ──
const at = { lezingen: 0, kapot: false };
const PAGINA1 = [
  { id: 'rec1', fields: { Key: 'banner_active', Value: 'true', Description: 'Banner tonen ja/nee' } },
  { id: 'rec2', fields: { Key: 'feat_demo', Value: false } },
  { id: 'rec3', fields: { Key: 'max_ritten', Value: 3 } }
];
const PAGINA2 = [{ id: 'rec4', fields: { Key: 'banner_text', Value: 'Welkom' } }];
global.fetch = async (url) => {
  const u = String(url);
  if (!/api\.airtable\.com\/v0\/[^/]+\/AppConfig/.test(u)) throw new Error('onverwachte fetch in deze test: ' + u);
  at.lezingen++;
  if (at.kapot) return new Response('{"error":"kapot"}', { status: 503 });
  const tweede = /offset=pagina2/.test(u);
  return new Response(JSON.stringify(tweede ? { records: PAGINA2 } : { records: PAGINA1, offset: 'pagina2' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
};

async function omgeving(src) {
  const W = await laadWorker(src || bron);
  const db = new DatabaseSync(':memory:');
  const env = {
    LOGDB: maakD1(db), AIRTABLE_TOKEN: 'x',
    SESSION_SECRET: 'test-geheim-dat-lang-genoeg-is-0123456789', ADMIN_TOKEN: 'beheer-geheim-0123456789'
  };
  const tok = (await W.makeToken(env, 'anna@voorbeeld.nl', 'klant', 'Anna')).token;
  const roep = async (methode, body) => {
    const r = await W.default.fetch(new Request('https://app.pidlane.nl/api/config', {
      method: methode,
      headers: methode === 'GET'
        ? { 'X-App-Token': tok, Origin: 'https://app.pidlane.nl' }
        : { 'Content-Type': 'application/json', 'X-Admin-Token': env.ADMIN_TOKEN, Origin: 'https://app.pidlane.nl' },
      body: body ? JSON.stringify(body) : undefined
    }), env, { waitUntil() { } });
    let d = {};
    try { d = await r.json(); } catch (x) { d = { _geenJson: true }; }
    return { status: r.status, d };
  };
  return { W, db, env, roep };
}

(async () => {
  console.log('\n1. De eerste opstart zet AppConfig over, ook de tweede pagina');
  {
    at.lezingen = 0; at.kapot = false;
    const o = await omgeving();
    const r = await o.roep('GET');
    toets('GET geeft 200', r.status === 200, String(r.status));
    toets('alle vier de sleutels, ook die van de tweede pagina', Object.keys(r.d).sort().join(',') === 'banner_active,banner_text,feat_demo,max_ritten', JSON.stringify(r.d));
    toets('"true" blijft een tekst, false een vinkje en 3 een getal',
      r.d.banner_active === 'true' && r.d.feat_demo === false && r.d.max_ritten === 3, JSON.stringify(r.d));
    toets('twee lezingen: één per pagina', at.lezingen === 2, at.lezingen + ' lezingen');
    toets('de overzet staat genoteerd met het aantal', (o.db.prepare("SELECT aantal FROM d1_overzet WHERE naam='appconfig'").get() || {}).aantal === 4);

    console.log('\n2. Daarna komt Airtable er niet meer aan te pas');
    for (let i = 0; i < 5; i++) await o.roep('GET');
    toets('vijf opstarts later nog steeds twee lezingen', at.lezingen === 2, at.lezingen + ' lezingen');

    console.log('\n3. Beheer schrijft in D1, en de app ziet het meteen');
    const p = await o.roep('POST', { items: [{ Key: 'banner_text', Value: 'Nieuwe tekst' }, { Key: 'banner_active', Value: 'false' }, { Key: 'tikkie_kopen', Value: '', Description: 'Tikkie-link' }] });
    toets('POST geeft ok', p.status === 200 && p.d.ok === true, JSON.stringify(p.d));
    const na = await o.roep('GET');
    toets('de nieuwe tekst staat er', na.d.banner_text === 'Nieuwe tekst', JSON.stringify(na.d.banner_text));
    toets('een nieuwe sleutel ook', na.d.tikkie_kopen === '', JSON.stringify(na.d));
    toets('banner_active is bijgewerkt', na.d.banner_active === 'false', JSON.stringify(na.d.banner_active));
    toets('opnieuw opgeslagen zonder Description: de oude omschrijving blijft staan',
      (o.db.prepare("SELECT omschrijving FROM app_config WHERE sleutel='banner_active'").get() || {}).omschrijving === 'Banner tonen ja/nee');
    toets('en er ging niets naar Airtable', at.lezingen === 2, at.lezingen + ' lezingen');
    const fout1 = await o.roep('POST', { items: [{ Key: 'kapot-sleutel!', Value: 'x' }] });
    toets('een ongeldige sleutel wordt nog steeds geweigerd', fout1.status === 400 && fout1.d.error === 'invalid_key', JSON.stringify(fout1.d));
  }

  console.log('\n4. Beheer vóór de eerste opstart: de keuze van beheer wint');
  {
    at.lezingen = 0; at.kapot = false;
    const o = await omgeving();
    await o.roep('POST', { items: [{ Key: 'banner_active', Value: 'false' }] });
    const r = await o.roep('GET');
    toets('banner_active staat op wat beheer koos, niet op wat Airtable had', r.d.banner_active === 'false', JSON.stringify(r.d.banner_active));
    toets('de rest kwam wel uit Airtable', r.d.banner_text === 'Welkom', JSON.stringify(r.d));
  }

  console.log('\n5. Airtable onbereikbaar bij de overzet: niets genoteerd, volgende keer opnieuw');
  {
    at.lezingen = 0; at.kapot = true;
    const o = await omgeving();
    const r = await o.roep('GET');
    toets('de app krijgt {} en draait op zijn standaardwaarden', r.status === 200 && Object.keys(r.d).length === 0, JSON.stringify(r.d));
    toets('er staat geen overzet genoteerd', !o.db.prepare("SELECT 1 FROM d1_overzet WHERE naam='appconfig'").get());
    at.kapot = false;
    const r2 = await o.roep('GET');
    toets('zodra Airtable terug is, komt alles erin', Object.keys(r2.d).length === 4, JSON.stringify(r2.d));
  }

  console.log('\n6. Eén schema');
  {
    const W = await laadWorker(bron);
    toets('elk statement uit CONFIG_SCHEMA staat letterlijk in schema.sql', W.CONFIG_SCHEMA.every((st) => schemaSql.indexOf(st + ';') >= 0));
  }

  console.log('\n7. TEGENPROEF — zonder de notitie van de overzet leest elke opstart Airtable weer');
  {
    const anker = `if (await db.prepare("SELECT 1 AS j FROM d1_overzet WHERE naam = 'appconfig'").first()) return db;`;
    toets('het anker staat in worker.js', bron.indexOf(anker) > 0);
    at.lezingen = 0; at.kapot = false;
    const o = await omgeving(bron.replace(anker, ''));
    for (let i = 0; i < 3; i++) await o.roep('GET');
    toets('dan zijn het zes lezingen in plaats van twee', at.lezingen === 6, at.lezingen + ' lezingen');
  }

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('FOUT test liep niet af: ' + (e && e.stack || e)); process.exit(1); });
