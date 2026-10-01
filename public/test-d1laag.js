// ══════════════════════════════════════════════════════════════════
// test-d1laag.js — de D1-laag die Airtable vervangt (#327)
// ──────────────────────────────────────────────────────────────────
// WAAROM. Na AppConfig gaan Users, Klanten, TokenCodes, TokenLog en het
// veldlab ook naar D1. Dat loopt allemaal door één laag in worker.js
// (D1_TABELLEN, d1Tabel, atZoek/atPatch/atMaak/…), en die laag zet elke tabel
// één keer zelf over uit Airtable. Gaat daar iets mis, dan raakt het het
// saldo van klanten, dus deze laag krijgt een eigen test.
//
// WAT HIER ROOD HOORT TE WORDEN
//   • een tweede pagina uit Airtable die bij de overzet wegvalt;
//   • een getal, vinkje of lijst dat er anders uitkomt dan het erin ging;
//   • een rec-id of aanmaakmoment dat bij de overzet verandert;
//   • na de overzet nog een call naar Airtable;
//   • een mislukte overzet die als gelukt genoteerd wordt;
//   • een onbekend veld dat stil verdwijnt in plaats van een fout te geven;
//   • een wijziging op een record dat niet bestaat die "gelukt" zegt;
//   • schema.sql en D1_SCHEMA die uit elkaar lopen.
//
// De ECHTE worker.js als module, met een echte SQLite als D1. Alleen fetch
// naar Airtable is nagebouwd.
//
// Draaien vanuit public/:  node test-d1laag.js   (exit 0 = goed)
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
  const mod = src.slice(0, i) +
    'export { D1_SCHEMA, D1_TABELLEN, d1Tabel, atAlle, atZoek, atHaal, atPatch, atMaak, atWis, atUpsert };\n';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'd1laag-')), 'worker.mjs');
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

// ── Airtable, nagebouwd: Klanten over twee pagina's, Referentie leeg ──
const at = { lezingen: 0, kapot: false };
const KLANT1 = { id: 'recAnna0000000001', createdTime: '2026-08-01T10:00:00.000Z',
  fields: { Email: 'Anna@Voorbeeld.nl', Saldo: 42, Status: 'actief', Akkoorden: ['voorwaarden', 'privacy'],
    StartTegoedGegeven: true, 'Salt (ongebruikt)': 'oud' } };
const KLANT2 = { id: 'recBert0000000002', createdTime: '2026-08-02T10:00:00.000Z',
  fields: { Email: 'bert@voorbeeld.nl', Saldo: 0, Status: 'geblokkeerd' } };
global.fetch = async (url) => {
  const u = String(url);
  if (!/api\.airtable\.com\/v0\//.test(u)) throw new Error('onverwachte fetch in deze test: ' + u);
  at.lezingen++;
  if (at.kapot) return new Response('{"error":"kapot"}', { status: 503 });
  if (/\/Klanten/.test(u)) {
    const tweede = /offset=p2/.test(u);
    return new Response(JSON.stringify(tweede ? { records: [KLANT2] } : { records: [KLANT1], offset: 'p2' }), { status: 200 });
  }
  return new Response('{"records":[]}', { status: 200 });
};

function omgeving() {
  const db = new DatabaseSync(':memory:');
  return { db, env: { LOGDB: maakD1(db), AIRTABLE_TOKEN: 'x', AIRTABLE_KLANTEN_TABLE: 'Klanten' } };
}

(async () => {
  console.log('\n1. De overzet: alles erin, met zijn eigen id en zijn eigen typen');
  {
    at.lezingen = 0; at.kapot = false;
    const W = await laadWorker(bron);
    const { db, env } = omgeving();
    const anna = await W.atZoek(env, 'klanten', 'Email', 'anna@voorbeeld.nl', { lower: true });
    toets('Anna gevonden, hoofdletters maken niet uit', !!anna, JSON.stringify(anna));
    toets('met haar eigen rec-id', anna && anna.id === 'recAnna0000000001');
    toets('en haar eigen aanmaakmoment', anna && anna.createdTime === '2026-08-01T10:00:00.000Z');
    toets('Saldo is een getal', anna && anna.fields.Saldo === 42, JSON.stringify(anna && anna.fields.Saldo));
    toets('Akkoorden is een lijst', anna && Array.isArray(anna.fields.Akkoorden) && anna.fields.Akkoorden.join() === 'voorwaarden,privacy');
    toets('StartTegoedGegeven is true', anna && anna.fields.StartTegoedGegeven === true);
    toets('een leeg vinkje staat er niet (zoals bij Airtable)', anna && !('Ontwikkelaar' in anna.fields), JSON.stringify(anna && anna.fields));
    toets('het ongebruikte saltveld is niet meegenomen', anna && !('Salt (ongebruikt)' in anna.fields));
    const bert = await W.atZoek(env, 'klanten', 'Email', 'bert@voorbeeld.nl');
    toets('Bert van de tweede pagina staat er ook', !!bert && bert.fields.Status === 'geblokkeerd');
    toets('Saldo 0 blijft 0 en niet leeg', bert && bert.fields.Saldo === 0, JSON.stringify(bert && bert.fields));
    toets('twee lezingen: één per pagina', at.lezingen === 2, at.lezingen + ' lezingen');
    toets('de overzet staat genoteerd met het aantal', (db.prepare("SELECT aantal FROM d1_overzet WHERE naam='klanten'").get() || {}).aantal === 2);

    console.log('\n2. Daarna komt Airtable er niet meer aan te pas, ook niet na een herstart');
    await W.atAlle(env, 'klanten');
    const W2 = await laadWorker(bron);                     // een nieuwe isolate, dezelfde database
    await W2.atZoek(env, 'klanten', 'Email', 'bert@voorbeeld.nl');
    toets('nog steeds twee lezingen', at.lezingen === 2, at.lezingen + ' lezingen');

    console.log('\n3. Schrijven, lezen, wissen');
    const na = await W.atPatch(env, 'klanten', anna.id, { Saldo: 37, Ontwikkelaar: false, Naam: 'Anna' });
    toets('patch geeft het bijgewerkte record terug', na.fields.Saldo === 37 && na.fields.Naam === 'Anna');
    toets('een expliciet uitgezet vinkje is false', na.fields.Ontwikkelaar === false);
    toets('de rest bleef staan', na.fields.Email === 'Anna@Voorbeeld.nl' && na.fields.StartTegoedGegeven === true);
    const leeg = await W.atPatch(env, 'klanten', anna.id, { Naam: '' });
    toets('een lege tekst wist het veld (zoals bij Airtable)', !('Naam' in leeg.fields));
    let gegooid = '';
    try { await W.atPatch(env, 'klanten', anna.id, { Bestaatniet: 1 }); } catch (e) { gegooid = e.message; }
    toets('een onbekend veld geeft een fout', /d1_onbekend_veld/.test(gegooid), gegooid);
    gegooid = '';
    try { await W.atPatch(env, 'klanten', 'recBestaatNiet0001', { Naam: 'x' }); } catch (e) { gegooid = e.message; }
    toets('een record dat niet bestaat geeft een fout', /d1_niet_gevonden/.test(gegooid), gegooid);
    gegooid = '';
    try { await W.atPatch(env, 'klanten', anna.id, { Saldo: 'veel' }); } catch (e) { gegooid = e.message; }
    toets('tekst in een getalveld geeft een fout', /d1_veld_geen_getal/.test(gegooid), gegooid);
    const nieuw = await W.atMaak(env, 'klanten', { Email: 'cees@voorbeeld.nl', Saldo: 5, Akkoorden: ['privacy'] });
    toets('een nieuw record krijgt een rec-id in Airtable-vorm', /^rec[A-Za-z0-9]{14}$/.test(nieuw.id), nieuw.id);
    toets('en zijn velden', nieuw.fields.Saldo === 5 && nieuw.fields.Akkoorden[0] === 'privacy');
    toets('wissen geeft true', await W.atWis(env, 'klanten', nieuw.id) === true);
    toets('twee keer wissen geeft false', await W.atWis(env, 'klanten', nieuw.id) === false);
    toets('en hij is weg', await W.atHaal(env, 'klanten', nieuw.id) === null);
    const lijst = await W.atAlle(env, 'klanten', { waar: '"Status" = ?', waarden: ['actief'] });
    toets('een lijst met een voorwaarde', lijst.length === 1 && lijst[0].id === anna.id, JSON.stringify(lijst.map((x) => x.id)));
  }

  console.log('\n4. Upsert op een sleutelveld (Referentie, RefID)');
  {
    const W = await laadWorker(bron);
    const { env } = omgeving();
    const a = await W.atUpsert(env, 'referentie', 'RefID', { RefID: 'mazda|cx-5|2018|x', Bevestigingen: 1 });
    const b = await W.atUpsert(env, 'referentie', 'RefID', { RefID: 'mazda|cx-5|2018|x', Bevestigingen: 2 });
    toets('de tweede keer werkt hij hetzelfde record bij', a.id === b.id && b.fields.Bevestigingen === 2);
    toets('er staat er één', (await W.atAlle(env, 'referentie')).length === 1);
  }

  console.log('\n5. Airtable onbereikbaar bij de overzet: niets genoteerd, volgende keer opnieuw');
  {
    at.lezingen = 0; at.kapot = true;
    const W = await laadWorker(bron);
    const { db, env } = omgeving();
    let gegooid = '';
    try { await W.atAlle(env, 'klanten'); } catch (e) { gegooid = e.message; }
    toets('de aanroep geeft een fout in plaats van een lege tabel', /airtable_overzet_klanten_503/.test(gegooid), gegooid);
    toets('er staat geen overzet genoteerd', !db.prepare("SELECT 1 FROM d1_overzet WHERE naam='klanten'").get());
    at.kapot = false;
    toets('zodra Airtable terug is, komt alles erin', (await W.atAlle(env, 'klanten')).length === 2);
  }

  console.log('\n6. Zonder Airtable-sleutel: een lege tabel, geen poging');
  {
    at.lezingen = 0;
    const W = await laadWorker(bron);
    const db = new DatabaseSync(':memory:');
    const env = { LOGDB: maakD1(db) };
    toets('lege lijst', (await W.atAlle(env, 'gebruikers')).length === 0);
    toets('en geen call naar Airtable', at.lezingen === 0);
  }

  console.log('\n7. Eén schema');
  {
    const W = await laadWorker(bron);
    const mist = W.D1_SCHEMA.filter((st) => schemaSql.indexOf(st + ';') < 0);
    toets('elk statement uit D1_SCHEMA staat letterlijk in schema.sql', mist.length === 0, mist.join('\n'));
    toets('elke tabel heeft een overzetbron in de Airtable-config', Object.values(W.D1_TABELLEN).every((d) => /^AIRTABLE_/.test(d.base) && /^AIRTABLE_/.test(d.tabel)));
  }

  console.log('\n8. TEGENPROEF — zonder de notitie zet elke isolate opnieuw over');
  {
    const anker = 'if (!al && env.AIRTABLE_TOKEN) await d1Overzet(';
    toets('het anker staat in worker.js', bron.indexOf(anker) > 0);
    at.lezingen = 0; at.kapot = false;
    const { env } = omgeving();
    const kapot = bron.replace(anker, 'if (env.AIRTABLE_TOKEN) await d1Overzet(');
    await (await laadWorker(kapot)).atAlle(env, 'klanten');
    await (await laadWorker(kapot)).atAlle(env, 'klanten');
    toets('dan zijn het vier lezingen in plaats van twee', at.lezingen === 4, at.lezingen + ' lezingen');
  }

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('FOUT test liep niet af: ' + (e && e.stack || e)); process.exit(1); });
