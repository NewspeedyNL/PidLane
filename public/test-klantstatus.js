// ══════════════════════════════════════════════════════════════════
// test-klantstatus.js — Mijn voertuigen kijkt bij elke stand naar de accountstatus (#327)
// ──────────────────────────────────────────────────────────────────
// WAAROM. Op 01-10-2026 (PR #380) kreeg de accountstatus bij "stand" een
// bewaartijd van vijf minuten: elke stand was een Airtable-call in een
// werkruimte met een plafond van 1.000 per maand, en een blokkade buiten
// beheer om werkte daardoor pas na vijf minuten. Dezelfde dag ging de
// klantentabel naar D1. Lezen kost daar niets, dus de bewaartijd is weg en
// deze test toetst het omgekeerde van wat hij eerst toetste:
//   • de klantentabel komt één keer uit Airtable, daarna nooit meer;
//   • blokkeren via beheer is meteen dicht;
//   • blokkeren rechtstreeks in de tabel ook meteen, niet na vijf minuten;
//   • vrijgeven is meteen weer open;
//   • de ene klant leent de status van de andere niet.
//
// De ECHTE worker.js, als module geladen, door de echte router heen, met
// een echte SQLite als D1. Alleen fetch naar Airtable is nagebouwd, voor de
// overzet, en die telt mee.
//
// Draaien vanuit public/:  node test-klantstatus.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { maakD1 } = require(path.join(__dirname, '..', 'pltest-d1.js'));

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
  const mod = bron.slice(0, i) + 'export { worker_default as default, makeToken };\n';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kstatus-')), 'worker.mjs');
  fs.writeFileSync(f, mod);
  return import('file://' + f);
}

// ── Airtable, nagebouwd: de Klanten-tabel voor de overzet ─────────────
const at = { lezingen: 0 };
global.fetch = async (url) => {
  const u = String(url);
  if (!/api\.airtable\.com\/v0\/[^/]+\/Klanten/.test(u)) throw new Error('onverwachte fetch in deze test: ' + u);
  at.lezingen++;
  return new Response(JSON.stringify({ records: [
    { id: 'recAnna0000000001', createdTime: '2026-07-01T00:00:00.000Z', fields: { Email: 'anna@voorbeeld.nl', Status: 'actief' } },
    { id: 'recBert0000000002', createdTime: '2026-07-02T00:00:00.000Z', fields: { Email: 'bert@voorbeeld.nl', Status: 'actief' } },
    // Zo stond het in Airtable: niet elk adres in kleine letters.
    { id: 'recCees0000000003', createdTime: '2026-07-03T00:00:00.000Z', fields: { Email: 'Cees@Voorbeeld.NL', Status: 'actief' } }
  ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

(async () => {
  const W = await laadWorker();
  const db = new DatabaseSync(':memory:');
  const env = {
    LOGDB: maakD1(db), AIRTABLE_TOKEN: 'x',
    SESSION_SECRET: 'test-geheim-dat-lang-genoeg-is-0123456789',
    KENTEKEN_SLEUTEL: Buffer.alloc(32, 7).toString('base64'),
    ADMIN_TOKEN: 'beheer-geheim-0123456789'
  };
  const tokA = (await W.makeToken(env, 'anna@voorbeeld.nl', 'klant', 'Anna')).token;
  const tokB = (await W.makeToken(env, 'bert@voorbeeld.nl', 'klant', 'Bert')).token;
  const tokC = (await W.makeToken(env, 'cees@voorbeeld.nl', 'klant', 'Cees')).token;
  const stand = async (tok) => (await W.default.fetch(new Request('https://app.pidlane.nl/klant/platform', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Token': tok, Origin: 'https://app.pidlane.nl' },
    body: JSON.stringify({ actie: 'stand' })
  }), env, { waitUntil() { } })).status;
  const beheer = async (body) => (await W.default.fetch(new Request('https://app.pidlane.nl/admin/klanten', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': env.ADMIN_TOKEN, Origin: 'https://app.pidlane.nl' },
    body: JSON.stringify(body)
  }), env, { waitUntil() { } })).status;
  const zetStatus = (st) => db.prepare('UPDATE klanten SET "Status" = ? WHERE id = ?').run(st, 'recAnna0000000001');

  console.log('\n1. Vijf keer verversen: de klantentabel komt één keer uit Airtable');
  const vijf = [];
  for (let i = 0; i < 5; i++) vijf.push(await stand(tokA));
  toets('alle vijf geven 200', vijf.every((x) => x === 200), vijf.join(','));
  toets('Airtable werd één keer gelezen (de overzet)', at.lezingen === 1, at.lezingen + ' lezingen');

  console.log('\n2. Via beheer geblokkeerd: meteen dicht, en alleen voor die klant');
  toets('beheer zet Anna op geblokkeerd', await beheer({ actie: 'update', id: 'recAnna0000000001', status: 'geblokkeerd', door: 'test' }) === 200);
  toets('de volgende stand van Anna geeft meteen 403', await stand(tokA) === 403);
  toets('Bert blijft gewoon open', await stand(tokB) === 200);

  console.log('\n3. Via beheer vrijgegeven: meteen weer open');
  toets('beheer zet Anna terug op actief', await beheer({ actie: 'update', id: 'recAnna0000000001', status: 'actief', door: 'test' }) === 200);
  toets('de volgende stand van Anna geeft meteen 200', await stand(tokA) === 200);

  console.log('\n4. Rechtstreeks in de tabel geblokkeerd: ook meteen, niet na vijf minuten');
  zetStatus('geblokkeerd');
  toets('de volgende stand van Anna geeft meteen 403', await stand(tokA) === 403);
  zetStatus('actief');
  toets('en na vrijgeven meteen weer 200', await stand(tokA) === 200);

  console.log('\n5. Een adres met hoofdletters in de tabel wordt gevonden');
  toets('Cees (Cees@Voorbeeld.NL in de tabel) komt binnen', await stand(tokC) === 200);

  console.log('\n6. En in al die tijd is Airtable maar één keer gelezen');
  toets('één lezing', at.lezingen === 1, at.lezingen + ' lezingen');

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('FOUT test liep niet af: ' + (e && e.stack || e)); process.exit(1); });
