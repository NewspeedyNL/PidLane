// ══════════════════════════════════════════════════════════════════
// test-adminbron.js — de grendels van /admin/tabel (witte lijst, masker, beschermd, alleen-lezen)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
// /admin/tabel leest en schrijft elke tabel die het beheer nodig heeft,
// achter één ADMIN_TOKEN. Daarom staan er grendels in, en elk van die
// grendels is een eigen manier waarop één gelekte token of één verkeerde klik
// geld of een account kost:
//   • alleen bronnen uit ADMIN_BRONNEN, geen vrije tabelnaam;
//   • de wachtwoordhash en het resettoken verlaten de Worker niet;
//   • Saldo, PassHash, Email en het id gaan hier niet doorheen (Saldo hoort
//     door het saldoslot, #82/#93);
//   • AppConfig en het kasboek zijn hier alleen-lezen (#83);
//   • wissen gaat alleen op geldige id's.
//
// Tot 01-10-2026 liep dit voor Klanten, codes, gebruikers en het kasboek via
// een Airtable-motor, en toetste deze test die met een nagebouwde fetch.
// Sinds #327 staat alles in D1 en is die motor weg; de grendels zijn
// dezelfde gebleven, en deze test toetst ze nu tegen de ECHTE worker.js op
// een echte SQLite, door de echte router heen. Zoeken, sorteren en pagineren
// van de D1-motor toetst test-adminbron-d1.js.
//
// Draaien vanuit public/:  node test-adminbron.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { maakD1 } = require(path.join(__dirname, '..', 'pltest-d1.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
async function laadWorker() {
  const i = bron.lastIndexOf('export {');
  if (i < 0) throw new Error('export-blok niet gevonden in worker.js');
  const mod = bron.slice(0, i) + 'export { worker_default as default, ADMIN_BRONNEN, D1_TABELLEN, D1_SCHEMA, CONFIG_SCHEMA };\n';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'adminbron-')), 'worker.mjs');
  fs.writeFileSync(f, mod);
  return import('file://' + f);
}

// Airtable mag hier niet gebeld worden: er is geen sleutel, dus geen overzet.
global.fetch = async (url) => { throw new Error('onverwachte fetch in deze test: ' + url); };

const KLANT = 'recKlant000000001';
const GEBRUIKER = 'recGebruiker00001';

(async function () {
  const W = await laadWorker();
  const db = new DatabaseSync(':memory:');
  const env = { LOGDB: maakD1(db), ADMIN_TOKEN: 'beheer-token-0123456789' };
  W.CONFIG_SCHEMA.forEach((st) => db.exec(st));
  W.D1_SCHEMA.forEach((st) => db.exec(st));
  db.prepare('INSERT INTO klanten (id, rij_gemaakt, "Email", "Naam", "Saldo", "PassHash", "ResetToken", "Status") VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(KLANT, '2026-01-01T00:00:00.000Z', 'jan@voorbeeld.nl', 'Jan', 40, 'pbkdf2_sha256$1$aa$bb', 'abc123', 'actief');
  db.prepare('INSERT INTO gebruikers (id, rij_gemaakt, "User", "PassHash", "Role") VALUES (?, ?, ?, ?, ?)')
    .run(GEBRUIKER, '2026-01-01T00:00:00.000Z', 'monteur', 'pbkdf2_sha256$1$cc$dd', 'user');
  db.prepare('INSERT INTO kasboek (id, rij_gemaakt, "Moment", "Klant", "Soort", "Credits") VALUES (?, ?, ?, ?, ?, ?)')
    .run('recKasboek0000001', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'jan@voorbeeld.nl', 'ai-call', -6);
  db.prepare("INSERT INTO app_config (sleutel, waarde, bijgewerkt) VALUES ('banner_active', '\"true\"', '2026-01-01')").run();
  for (const c of ['recCode0000000001', 'recCode0000000002', 'recCode0000000003'])
    db.prepare('INSERT INTO tegoedcodes (id, rij_gemaakt, "Code", "Credits") VALUES (?, ?, ?, ?)').run(c, '2026-01-01T00:00:00.000Z', 'PIDL-' + c.slice(-4), 100);

  async function roep(methode, zoek, body, token) {
    const r = await W.default.fetch(new Request('https://api.pidlane.nl/admin/tabel' + (zoek ? '?' + zoek : ''), {
      method: methode,
      headers: Object.assign({ Origin: 'https://app.pidlane.nl', 'CF-Connecting-IP': '10.0.0.1', 'X-Admin-Token': token === undefined ? env.ADMIN_TOKEN : token },
        body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    }), env, { waitUntil() {} });
    let d = {};
    try { d = await r.json(); } catch (e) { d = { _geenJson: true }; }
    return { status: r.status, body: d };
  }
  const klantRij = () => db.prepare('SELECT * FROM klanten WHERE id = ?').get(KLANT);

  console.log('\n1. Alleen bronnen uit de lijst, en niets daarbuiten');
  {
    const r = await roep('GET', 'bron=sqlite_master');
    toets('een vrije tabelnaam wordt geweigerd', r.status === 400 && r.body.ok === false, JSON.stringify(r.body).slice(0, 120));
    toets('en het antwoord noemt de bronnen die wél mogen', Array.isArray(r.body.bronnen) && r.body.bronnen.indexOf('klanten') >= 0);
    const w = await roep('POST', '', { bron: 'gebruikers_echt', actie: 'wis', id: GEBRUIKER });
    toets('ook schrijven naar een onbekende bron niet', w.status === 400);
    toets('en de gebruiker staat er nog', !!db.prepare('SELECT 1 FROM gebruikers WHERE id = ?').get(GEBRUIKER));
  }

  console.log('\n2. Wachtwoordhash en resettoken verlaten de Worker niet');
  {
    const r = await roep('GET', 'bron=klanten');
    const f = ((r.body.records || [])[0] || {}).fields || {};
    toets('de klant komt terug', r.body.ok === true && f.Email === 'jan@voorbeeld.nl', JSON.stringify(r.body).slice(0, 160));
    toets('PassHash is verborgen', f.PassHash === '••• verborgen', String(f.PassHash));
    toets('ResetToken ook', f.ResetToken === '••• verborgen', String(f.ResetToken));
    toets('het id is het rec-id', (r.body.records || [])[0] && r.body.records[0].id === KLANT);
    const tekst = JSON.stringify(r.body);
    toets('de hash staat nergens in het antwoord', tekst.indexOf('pbkdf2_sha256$1$aa$bb') < 0 && tekst.indexOf('abc123') < 0);
    const u = await roep('GET', 'bron=users');
    toets('ook bij de gebruikers niet', JSON.stringify(u.body).indexOf('pbkdf2_sha256$1$cc$dd') < 0 && u.body.ok === true, JSON.stringify(u.body).slice(0, 120));
  }

  console.log('\n3. Beschermde velden gaan hier niet doorheen');
  {
    for (const veld of ['Saldo', 'PassHash', 'Email', 'ResetToken', 'id', 'rij_gemaakt']) {
      const r = await roep('POST', '', { bron: 'klanten', actie: 'wijzig', id: KLANT, velden: { [veld]: veld === 'Saldo' ? 9999 : 'x' } });
      toets('klanten.' + veld + ' wordt geweigerd', r.status === 400 && r.body.ok === false, 'status ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 100));
    }
    const k = klantRij();
    toets('en er veranderde niets', k.Saldo === 40 && k.Email === 'jan@voorbeeld.nl' && k.PassHash === 'pbkdf2_sha256$1$aa$bb', JSON.stringify(k));
    const ok = await roep('POST', '', { bron: 'klanten', actie: 'wijzig', id: KLANT, velden: { Naam: 'Jan de Vries' } });
    toets('een toegestaan veld gaat wél door', ok.body.ok === true && klantRij().Naam === 'Jan de Vries', JSON.stringify(ok.body).slice(0, 140));
    toets('en het antwoord maskeert ook daar', ok.body.velden && ok.body.velden.PassHash === '••• verborgen');
    const u = await roep('POST', '', { bron: 'users', actie: 'wijzig', id: GEBRUIKER, velden: { User: 'beheer' } });
    toets('gebruikers.User wordt geweigerd', u.status === 400, 'status ' + u.status);
  }

  console.log('\n4. AppConfig en het kasboek zijn hier alleen-lezen');
  {
    const voor = db.prepare('SELECT COUNT(*) AS n FROM kasboek').get().n;
    for (const geval of [{ bron: 'config', id: 'banner_active', veld: 'waarde' }, { bron: 'kasboek', id: 'recKasboek0000001', veld: 'Credits' }]) {
      const r = await roep('POST', '', { bron: geval.bron, actie: 'wijzig', id: geval.id, velden: { [geval.veld]: 0 } });
      toets(geval.bron + ': wijzigen wordt geweigerd', r.status === 403 && r.body.ok === false, 'status ' + r.status);
      const w = await roep('POST', '', { bron: geval.bron, actie: 'wis', id: geval.id });
      toets(geval.bron + ': wissen ook niet', w.status === 403, 'status ' + w.status);
      const l = await roep('GET', 'bron=' + geval.bron);
      toets(geval.bron + ': lezen mag wel', l.body.ok === true && l.body.schrijven === false, JSON.stringify(l.body).slice(0, 120));
    }
    toets('het kasboek is ongemoeid', db.prepare('SELECT COUNT(*) AS n FROM kasboek').get().n === voor &&
      db.prepare('SELECT "Credits" AS c FROM kasboek').get().c === -6);
    toets('AppConfig ook', db.prepare("SELECT waarde FROM app_config WHERE sleutel = 'banner_active'").get().waarde === '"true"');
  }

  console.log('\n5. Wissen: alleen geldige id’s');
  {
    const fout = await roep('POST', '', { bron: 'codes', actie: 'wis', id: '1' });
    toets('een getal is geen id in een tabel uit Airtable', fout.status === 400, 'status ' + fout.status);
    const sql = await roep('POST', '', { bron: 'codes', actie: 'wis', ids: ["recCode0000000001' OR '1'='1"] });
    toets('een id met SQL erin wordt geweigerd', sql.status === 400, 'status ' + sql.status);
    toets('en er is niets gewist', db.prepare('SELECT COUNT(*) AS n FROM tegoedcodes').get().n === 3);
    const ok = await roep('POST', '', { bron: 'codes', actie: 'wis', ids: ['recCode0000000001', 'recCode0000000002'] });
    toets('twee geldige id’s worden in één keer gewist', ok.body.ok === true && db.prepare('SELECT COUNT(*) AS n FROM tegoedcodes').get().n === 1,
      JSON.stringify(ok.body));
  }

  console.log('\n6. Zonder geldige admin-token');
  {
    const r = await roep('GET', 'bron=klanten', null, 'fout-token');
    toets('lezen geeft 403', r.status === 403, 'status ' + r.status);
    const w = await roep('POST', '', { bron: 'klanten', actie: 'wijzig', id: KLANT, velden: { Naam: 'x' } }, 'fout-token');
    toets('schrijven ook', w.status === 403 && klantRij().Naam === 'Jan de Vries', 'status ' + w.status);
  }

  console.log('\n7. De bronlijst zelf');
  {
    const B = W.ADMIN_BRONNEN;
    for (const k of Object.keys(B)) {
      toets(k + ' is een D1-bron met een tabelnaam', B[k].motor === 'd1' && /^[a-z_]+$/.test(B[k].d1 || ''), JSON.stringify(B[k]).slice(0, 80));
      if (B[k].at) toets(k + ' wijst naar een tabel uit D1_TABELLEN met dezelfde naam', W.D1_TABELLEN[B[k].at] && W.D1_TABELLEN[B[k].at].d1 === B[k].d1);
    }
    toets('klanten verbergt PassHash en ResetToken', ['PassHash', 'ResetToken'].every((v) => B.klanten.geheim.indexOf(v) >= 0));
    toets('klanten beschermt Saldo, Email en het id', ['Saldo', 'Email', 'id'].every((v) => B.klanten.beschermd.indexOf(v) >= 0));
    toets('het kasboek en AppConfig zijn alleen-lezen', B.kasboek.schrijven === false && B.config.schrijven === false);
  }

  console.log('\n8. Een tabel die nog niet bestaat, wordt bij het openen aangemaakt');
  {
    const W2 = await laadWorker();
    const db2 = new DatabaseSync(':memory:');
    const env2 = { LOGDB: maakD1(db2), ADMIN_TOKEN: env.ADMIN_TOKEN };
    const r = await W2.default.fetch(new Request('https://api.pidlane.nl/admin/tabel?bron=referentie', {
      headers: { Origin: 'https://app.pidlane.nl', 'X-Admin-Token': env.ADMIN_TOKEN }
    }), env2, { waitUntil() {} });
    const d = await r.json();
    toets('lezen lukt op een lege database', d.ok === true && Array.isArray(d.records) && d.records.length === 0, JSON.stringify(d).slice(0, 160));
    toets('en de tabel staat er nu', !!db2.prepare("SELECT 1 FROM sqlite_master WHERE name = 'referentie'").get());
  }

  console.log('\n' + (fouten ? fouten + ' FOUT(EN)' : 'Alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('FOUT test liep niet af: ' + (e && e.stack || e)); process.exit(1); });
