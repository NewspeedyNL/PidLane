// ══════════════════════════════════════════════════════════════════
// test-klantstatus.js — Mijn voertuigen vraagt Airtable niet bij elke stand (#327)
// ──────────────────────────────────────────────────────────────────
// WAAROM. De Airtable-werkruimte heeft een plafond van 1.000 calls per
// maand en stond op 01-10-2026 na één dag op 139. De grootste vaste post:
// /klant/platform "stand" zocht bij elke aanroep de klant op, en de app
// ververst Mijn voertuigen bij het opstarten, bij het openen en na elk
// opgeslagen rapport of rit. Nu onthoudt de Worker het oordeel over de
// accountstatus een paar minuten per isolate.
//
// Een cache die "werkt" is de halve uitspraak. De andere helft:
//   • wie via beheer geblokkeerd wordt, is meteen dicht;
//   • wie via beheer weer vrijgegeven wordt, is meteen open;
//   • de ene klant leent de status van de andere niet;
//   • na de bewaartijd wordt er weer gezocht.
//
// De ECHTE worker.js, als module geladen, door de echte router heen, met
// een echte SQLite als D1. Alleen fetch naar Airtable is nagebouwd, en elke
// zoekvraag telt mee.
//
// Draaien vanuit public/:  node test-klantstatus.js   (exit 0 = goed)
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

const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');

async function laadWorker(src) {
  const i = src.lastIndexOf('export {');
  if (i < 0) throw new Error('export-blok niet gevonden in worker.js');
  const mod = src.slice(0, i) + 'export { worker_default as default, makeToken, KLANT_STATUS_MS };\n';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kstatus-')), 'worker.mjs');
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

// ── Airtable, nagebouwd: de Klanten-tabel, en elke zoekvraag telt ─────
const at = {
  rijen: [
    { id: 'recAnna0000000001', fields: { Email: 'anna@voorbeeld.nl', Status: 'actief', Audit: '' } },
    { id: 'recBert0000000002', fields: { Email: 'bert@voorbeeld.nl', Status: 'actief', Audit: '' } }
  ],
  zoek: 0
};
const antw = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { 'Content-Type': 'application/json' } });
global.fetch = async (url, opt) => {
  const u = String(url);
  const m = (opt && opt.method) || 'GET';
  if (!/api\.airtable\.com\/v0\/[^/]+\/Klanten/.test(u)) throw new Error('onverwachte fetch in deze test: ' + m + ' ' + u);
  if (m === 'GET' && /filterByFormula=/.test(u)) {
    at.zoek++;
    const f = decodeURIComponent(u.split('filterByFormula=')[1]);
    const mail = (f.match(/'([^']+)'/) || [])[1];
    const rij = at.rijen.find((r) => r.fields.Email === mail);
    return antw({ records: rij ? [{ id: rij.id, fields: Object.assign({}, rij.fields) }] : [] });
  }
  if (m === 'GET') {
    const id = u.split('/').pop().split('?')[0];
    const rij = at.rijen.find((r) => r.id === id);
    return rij ? antw({ id: rij.id, fields: Object.assign({}, rij.fields) }) : antw({ error: 'NOT_FOUND' }, 404);
  }
  if (m === 'PATCH') {
    const body = JSON.parse(opt.body || '{}');
    for (const rec of body.records || []) {
      const rij = at.rijen.find((r) => r.id === rec.id);
      if (rij) Object.assign(rij.fields, rec.fields);
    }
    return antw({ records: body.records });
  }
  throw new Error('onverwachte methode in deze test: ' + m);
};

async function scenario(W) {
  at.zoek = 0;
  at.rijen.forEach((r) => { r.fields.Status = 'actief'; });
  let klok = Date.parse('2026-10-01T12:00:00Z');
  const echtNu = Date.now;
  Date.now = () => klok;
  const env = {
    LOGDB: maakD1(new DatabaseSync(':memory:')),
    SESSION_SECRET: 'test-geheim-dat-lang-genoeg-is-0123456789',
    KENTEKEN_SLEUTEL: Buffer.alloc(32, 7).toString('base64'),
    AIRTABLE_TOKEN: 'x', ADMIN_TOKEN: 'beheer-geheim-0123456789'
  };
  const tokA = (await W.makeToken(env, 'anna@voorbeeld.nl', 'klant', 'Anna')).token;
  const tokB = (await W.makeToken(env, 'bert@voorbeeld.nl', 'klant', 'Bert')).token;
  const stand = async (tok) => {
    const r = await W.default.fetch(new Request('https://app.pidlane.nl/klant/platform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': tok, Origin: 'https://app.pidlane.nl' },
      body: JSON.stringify({ actie: 'stand' })
    }), env, { waitUntil() { } });
    return r.status;
  };
  const beheer = async (body, pad) => {
    const r = await W.default.fetch(new Request('https://app.pidlane.nl' + (pad || '/admin/klanten'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': env.ADMIN_TOKEN, Origin: 'https://app.pidlane.nl' },
      body: JSON.stringify(body)
    }), env, { waitUntil() { } });
    return r.status;
  };
  const uit = {};
  const vijf = [];
  for (let i = 0; i < 5; i++) { vijf.push(await stand(tokA)); klok += 30e3; }
  uit.vijfStatus = vijf; uit.vijfZoek = at.zoek;
  klok += W.KLANT_STATUS_MS;
  uit.naTijd = await stand(tokA); uit.naTijdZoek = at.zoek;
  uit.bertEerst = await stand(tokB);
  uit.blokkeer = await beheer({ actie: 'update', id: 'recAnna0000000001', status: 'geblokkeerd', door: 'test' });
  uit.naBlok = await stand(tokA);
  uit.bertNaBlok = await stand(tokB);
  uit.vrij = await beheer({ actie: 'update', id: 'recAnna0000000001', status: 'actief', door: 'test' });
  uit.naVrij = await stand(tokA);
  // De adminbrowser schrijft rechtstreeks, buiten klantPatch() om.
  uit.tabel = await beheer({ bron: 'klanten', actie: 'wijzig', id: 'recAnna0000000001', velden: { Status: 'geblokkeerd' } }, '/admin/tabel');
  uit.naTabel = await stand(tokA);
  Date.now = echtNu;
  return uit;
}

(async () => {
  const W = await laadWorker(bron);
  const u = await scenario(W);

  console.log('\n1. Vijf keer verversen binnen de bewaartijd: één zoekvraag');
  toets('alle vijf geven 200', u.vijfStatus.every((s) => s === 200), u.vijfStatus.join(','));
  toets('Airtable werd één keer gevraagd', u.vijfZoek === 1, u.vijfZoek + ' zoekvragen');

  console.log('\n2. Na de bewaartijd wordt er weer gezocht');
  toets('stand geeft 200', u.naTijd === 200, String(u.naTijd));
  toets('en dat kostte een nieuwe zoekvraag', u.naTijdZoek === 2, u.naTijdZoek + ' zoekvragen');

  console.log('\n3. Via beheer geblokkeerd: meteen dicht, en alleen voor die klant');
  toets('beheer zet Anna op geblokkeerd', u.blokkeer === 200, String(u.blokkeer));
  toets('de volgende stand van Anna geeft meteen 403', u.naBlok === 403, String(u.naBlok));
  toets('Bert blijft gewoon open', u.bertEerst === 200 && u.bertNaBlok === 200, u.bertEerst + ' / ' + u.bertNaBlok);

  console.log('\n4. Via beheer vrijgegeven: meteen weer open');
  toets('beheer zet Anna terug op actief', u.vrij === 200, String(u.vrij));
  toets('de volgende stand van Anna geeft meteen 200', u.naVrij === 200, String(u.naVrij));

  console.log('\n5. Via de adminbrowser (/admin/tabel) geblokkeerd: ook meteen dicht');
  toets('de adminbrowser zet Anna op geblokkeerd', u.tabel === 200, String(u.tabel));
  toets('de volgende stand van Anna geeft meteen 403', u.naTabel === 403, String(u.naTabel));

  console.log('\n6. TEGENPROEF — zonder het vergeten in de router blijft een blokkade hangen');
  {
    const anker = 'klantStatusVergeet();\n        return lockOrigin(request, rk);';
    toets('het anker staat in worker.js', bron.indexOf(anker) > 0);
    const W2 = await laadWorker(bron.replace(anker, 'return lockOrigin(request, rk);'));
    const u2 = await scenario(W2);
    toets('dan geeft de stand na het blokkeren nog 200', u2.naBlok === 200, String(u2.naBlok));
  }

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('FOUT test liep niet af: ' + (e && e.stack || e)); process.exit(1); });
