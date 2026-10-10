// ══════════════════════════════════════════════════════════════════
// test-meekijk.js — meekijken door PidLane met een code van de klant (10-10-2026)
// ──────────────────────────────────────────────────────────────────
// De ECHTE worker.js met een echte SQLite als D1, zoals test-klantplatform.js:
// de routes gaan door fetch(), lockOrigin, auth en rateLimit heen.
//
// WAT HIER ROOD HOORT TE WORDEN
//   • beheer dat zonder geldige code iets van een klant ziet — geen code, een
//     verkeerde, een verlopen of een ingetrokken code;
//   • een klant die via /admin/meekijk bij een ander kan;
//   • met de code van klant A een voertuig van klant B raken;
//   • een sensor van de klant die door beheer overschreven wordt;
//   • "Alles wissen" dat de code laat staan.
//
// Draaien vanuit public/:  node test-meekijk.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let fout = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const wortel = path.join(__dirname, '..');
const bron = fs.readFileSync(path.join(wortel, 'worker.js'), 'utf8');

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
    async batch(lijst) { db.exec('BEGIN'); try { const u = lijst.map((s) => s._sync()); db.exec('COMMIT'); return u; } catch (e) { db.exec('ROLLBACK'); throw e; } }
  };
}

async function laadWorker() {
  const i = bron.lastIndexOf('export {');
  if (i < 0) throw new Error('export-blok niet gevonden in worker.js');
  const mod = bron.slice(0, i) + 'export { worker_default as default, makeToken, D1_SCHEMA };\n';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mk-')), 'worker.mjs');
  fs.writeFileSync(f, mod);
  return import('file://' + f);
}

(async () => {
  const W = await laadWorker();
  const db = new DatabaseSync(':memory:');
  const env = { LOGDB: maakD1(db), SESSION_SECRET: 'test-geheim-dat-lang-genoeg-is-0123456789', KENTEKEN_SLEUTEL: Buffer.alloc(32, 7).toString('base64') };
  W.D1_SCHEMA.forEach((st) => db.exec(st));
  const zaai = (id, email) => db.prepare('INSERT INTO klanten (id, rij_gemaakt, "Email", "Status") VALUES (?, ?, ?, ?)').run(id, '2026-01-01T00:00:00.000Z', email, 'actief');
  zaai('recAnna0000000001', 'anna@voorbeeld.nl');
  zaai('recBert0000000002', 'bert@voorbeeld.nl');
  const tokA = (await W.makeToken(env, 'anna@voorbeeld.nl', 'klant', 'Anna')).token;
  const tokB = (await W.makeToken(env, 'bert@voorbeeld.nl', 'klant', 'Bert')).token;
  const tokAdmin = (await W.makeToken(env, 'beheer', 'admin', 'Beheer')).token;
  const tokMonteur = (await W.makeToken(env, 'monteur', 'user', 'Monteur')).token;

  async function roep(pad, tok, body) {
    const r = await W.default.fetch(new Request('https://app.pidlane.nl' + pad, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': tok, Origin: 'https://app.pidlane.nl' },
      body: JSON.stringify(body)
    }), env, { waitUntil() { } });
    let d = {};
    try { d = await r.json(); } catch (x) { d = { _geenJson: true }; }
    d._status = r.status;
    return d;
  }
  const klant = (tok, body) => roep('/klant/platform', tok, body);
  const beheer = (tok, body) => roep('/admin/meekijk', tok, body);

  console.log('\n1. De klant maakt een code');
  const versie = (await klant(tokA, { actie: 'stand' })).akkoordVersie;
  toets('zonder akkoord geen code', (await klant(tokA, { actie: 'meekijk_aan' }))._status === 403);
  await klant(tokA, { actie: 'akkoord', versie });
  await klant(tokB, { actie: 'akkoord', versie });
  const va = (await klant(tokA, { actie: 'voertuig_opslaan', voertuig: { naam: 'Mazda', kenteken: 'AB-123-C', merk: 'Mazda', model: 'CX-5',
    eigen_pids: [{ code: '222A05', ecu: '720', naam: 'Band LV', formule: 'A*4', eenheid: 'kPa' }] } })).voertuig;
  const vb = (await klant(tokB, { actie: 'voertuig_opslaan', voertuig: { naam: 'Golf', merk: 'Volkswagen' } })).voertuig;
  toets('nog geen code: meekijk is leeg', (await klant(tokA, { actie: 'meekijk' })).meekijk === null);
  const aan = await klant(tokA, { actie: 'meekijk_aan' });
  const code = aan.meekijk && aan.meekijk.code;
  toets('een code van zes tekens, zonder 0, O, 1, I of L', /^[A-HJKMNP-Z2-9]{6}$/.test(code || ''), JSON.stringify(aan));
  const dagen = (Date.parse(aan.meekijk.verloopt) - Date.now()) / 864e5;
  toets('zeven dagen geldig', dagen > 6.9 && dagen <= 7, String(dagen));
  const opnieuw = await klant(tokA, { actie: 'meekijk_aan' });
  toets('een nieuwe code vervangt de oude', opnieuw.meekijk.code !== code && db.prepare('SELECT COUNT(*) AS n FROM kp_meekijk').get().n === 1);
  const c2 = opnieuw.meekijk.code;
  toets('de oude werkt niet meer', (await beheer(tokAdmin, { actie: 'open', code }))._status === 404);

  console.log('\n2. Wie mag meekijken');
  toets('zonder inlog: 401', (await beheer('', { actie: 'open', code: c2 }))._status === 401);
  toets('een klant: 403, ook met een geldige code', (await beheer(tokB, { actie: 'open', code: c2 }))._status === 403);
  toets('een monteur (geen beheerder): 403', (await beheer(tokMonteur, { actie: 'open', code: c2 }))._status === 403);
  toets('beheer met een verzonnen code: 404', (await beheer(tokAdmin, { actie: 'open', code: 'ZZZZZZ' }))._status === 404);
  toets('beheer zonder code: 400', (await beheer(tokAdmin, { actie: 'open' }))._status === 400);

  console.log('\n3. Beheer kijkt mee');
  const open = await beheer(tokAdmin, { actie: 'open', code: c2.toLowerCase() });
  toets('met de code: de voertuigen van Anna (ook in kleine letters getikt)', open.ok && open.voertuigen.length === 1 && open.voertuigen[0].id === va.id, JSON.stringify(open).slice(0, 300));
  toets('met het kenteken leesbaar, zoals Anna het ziet', open.voertuigen[0].kenteken === 'AB123C');
  toets('niet die van Bert', !JSON.stringify(open).includes(vb.id));
  toets('geen klant-id en geen e-mailadres in het antwoord', !JSON.stringify(open).includes('anna@') && !('klant_id' in open.voertuigen[0]));
  const st = await klant(tokA, { actie: 'meekijk' });
  toets('Anna ziet dat er meegekeken is', st.meekijk && st.meekijk.aantal === 1 && !!st.meekijk.bekeken_op, JSON.stringify(st.meekijk));

  console.log('\n4. Sensoren toevoegen, niet wijzigen');
  const pid = { code: '222A06', ecu: '720', naam: 'Band RV', formule: 'A*4', eenheid: 'kPa' };
  const erbij = await beheer(tokAdmin, { actie: 'pid_erbij', code: c2, voertuig_id: va.id, pid });
  toets('een nieuwe sensor komt erbij', erbij.ok && erbij.eigen_pids.length === 2, JSON.stringify(erbij));
  const over = await beheer(tokAdmin, { actie: 'pid_erbij', code: c2, voertuig_id: va.id, pid: { code: '222A05', ecu: '720', naam: 'Anders', formule: 'A' } });
  toets('een sensor die er al staat: 409, en hij blijft zoals Anna hem had', over._status === 409 &&
    JSON.parse(db.prepare('SELECT eigen_pids FROM kp_voertuig WHERE id = ?').get(va.id).eigen_pids).find((x) => x.code === '222A05').naam === 'Band LV');
  toets('een schrijfcode (2E) wordt geweigerd', (await beheer(tokAdmin, { actie: 'pid_erbij', code: c2, voertuig_id: va.id, pid: { code: '2E1234', naam: 'x' } }))._status === 400);
  toets('met de code van Anna niet bij de auto van Bert', (await beheer(tokAdmin, { actie: 'pid_erbij', code: c2, voertuig_id: vb.id, pid }))._status === 404 &&
    !db.prepare('SELECT eigen_pids FROM kp_voertuig WHERE id = ?').get(vb.id).eigen_pids);
  toets('Anna ziet de sensor bij haar voertuig', ((await klant(tokA, { actie: 'stand' })).voertuigen || []).some((v) => (v.eigen_pids || []).some((e) => e.code === '222A06')));
  toets('en hoeveel er door PidLane bij kwamen', (await klant(tokA, { actie: 'meekijk' })).meekijk.erbij === 1);

  console.log('\n5. Intrekken, verlopen, wissen');
  await klant(tokA, { actie: 'meekijk_uit' });
  toets('ingetrokken: beheer ziet niets meer', (await beheer(tokAdmin, { actie: 'open', code: c2 }))._status === 404);
  const c3 = (await klant(tokA, { actie: 'meekijk_aan' })).meekijk.code;
  db.prepare('UPDATE kp_meekijk SET verloopt = ? WHERE code = ?').run('2020-01-01T00:00:00.000Z', c3);
  toets('verlopen: beheer ziet niets meer', (await beheer(tokAdmin, { actie: 'open', code: c3 }))._status === 404);
  toets('en de klant ziet geen code meer', (await klant(tokA, { actie: 'meekijk' })).meekijk === null);
  await klant(tokA, { actie: 'meekijk_aan' });
  await klant(tokA, { actie: 'alles_wissen' });
  toets('Alles wissen haalt de code mee weg', db.prepare('SELECT COUNT(*) AS n FROM kp_meekijk').get().n === 0);

  console.log('\n' + (fout ? 'test-meekijk: ' + fout + ' FOUT' : 'test-meekijk: alles goed'));
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('  FOUT  ' + (e && e.stack || e)); process.exit(1); });
