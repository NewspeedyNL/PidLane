// ══════════════════════════════════════════════════════════════════
// test-uitnodiging.js — Nodig een vriend uit (14-11-2026)
// ──────────────────────────────────────────────────────────────────
// De ECHTE worker.js als module, met een echte SQLite (node:sqlite) als D1,
// zoals test-klantplatform.js. Door fetch() heen: /klant/registreer en
// /klant/platform.
//
// WAT HIER ROOD HOORT TE WORDEN
//   • tegoed bij alleen registreren (e-mail wordt niet geverifieerd);
//   • tegoed voor een auto die al bij PidLane bekend was — bij een andere
//     klant, of met een verbindprofiel van vóór de aanmelding;
//   • twee keer tegoed voor dezelfde vriend of dezelfde auto;
//   • de uitnodiger boven het plafond;
//   • je eigen code gebruiken;
//   • rijen die blijven staan als het account gewist wordt.
//
// Draaien vanuit public/:  node test-uitnodiging.js     (exit 0 = goed)
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

function maakD1(db) {
  const stmt = (sql, args) => ({
    sql, args,
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
  const mod = bron.slice(0, i) +
    'export { worker_default as default, makeToken, kpKlantId, D1_SCHEMA, uitnodigCodeNorm, uitnodigOordeel, kpAlleWissen, uitnodigKoppel };\n';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'uitn-')), 'worker.mjs');
  fs.writeFileSync(f, mod);
  return import('file://' + f);
}

(async () => {
  const W = await laadWorker();

  console.log('\n1. De pure kern');
  toets('code: kleine letters en spaties worden PL-XXXXXX', W.uitnodigCodeNorm('pl 7k3 pqr') === 'PL-7K3PQR');
  toets('code zonder PL ervoor', W.uitnodigCodeNorm('7K3PQR') === 'PL-7K3PQR');
  toets('code met verwarrende tekens (O, 0, I, 1, L) wordt geweigerd', W.uitnodigCodeNorm('PL-O0I1L2') === null);
  toets('geen code', W.uitnodigCodeNorm('') === null && W.uitnodigCodeNorm(null) === null);
  const vin = 'a1b2c3d4e5f60718';
  const O = (x) => W.uitnodigOordeel(Object.assign({ vin, profielNa: true, aantalBeloond: 0, max: 10 }, x));
  toets('nieuwe auto, verbonden na aanmelding: betalen, ook de uitnodiger', O({}).betaal && O({}).uitnodiger);
  toets('auto bij een andere klant: niet', !O({ bijAnder: true }).betaal);
  toets('verbindprofiel van vóór de aanmelding: niet', !O({ profielVoor: true }).betaal);
  toets('geen verbinding gezien: niet', !O({ profielNa: false }).betaal);
  toets('auto al beloond: niet', !O({ alBeloond: true }).betaal);
  toets('plafond bereikt: wel de vriend, niet de uitnodiger', O({ aantalBeloond: 10 }).betaal && !O({ aantalBeloond: 10 }).uitnodiger);
  toets('geen geldig pseudoniem: niet', !O({ vin: 'xyz' }).betaal);

  const db = new DatabaseSync(':memory:');
  const env = {
    LOGDB: maakD1(db), SESSION_SECRET: 'test-geheim-dat-lang-genoeg-is-0123456789', KENTEKEN_SLEUTEL: Buffer.alloc(32, 7).toString('base64'),
    UITNODIG_MAX: '2',
    REMOTE_SESSION: { idFromName: (x) => x, get: () => ({ fetch: async () => new Response('ok') }) }
  };
  W.D1_SCHEMA.forEach((st) => db.exec(st));
  const ctx = { waitUntil() {} };
  const saldo = (email) => (db.prepare('SELECT "Saldo" AS s FROM klanten WHERE lower("Email") = ?').get(email) || {}).s;

  async function post(pad, body, tok) {
    const r = await W.default.fetch(new Request('https://app.pidlane.nl' + pad, {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Origin: 'https://app.pidlane.nl', 'CF-Connecting-IP': '10.0.0.' + (n % 200) }, tok ? { 'X-App-Token': tok } : {}),
      body: JSON.stringify(body)
    }), env, ctx);
    let d = {}; try { d = await r.json(); } catch (e) { d = { _geenJson: true }; }
    d._status = r.status; return d;
  }
  async function registreer(email, code) {
    const d = await post('/klant/registreer', { email, pass: 'een lange zin als wachtwoord', naam: '', uitnodiging: code });
    return d;
  }
  async function akkoord(tok) {
    const st = await post('/klant/platform', { actie: 'stand' }, tok);
    await post('/klant/platform', { actie: 'akkoord', versie: st.akkoordVersie }, tok);
  }
  const profiel = (v, op) => {
    db.exec('CREATE TABLE IF NOT EXISTS verbindprofielen (id INTEGER PRIMARY KEY AUTOINCREMENT, ontvangen TEXT NOT NULL, vin_pseudo TEXT, wmi TEXT, merk TEXT, model TEXT, jaar TEXT, brandstof TEXT, adapter TEXT, protocol TEXT, bits INTEGER, st_hex TEXT, st_ms INTEGER, traagst_ms INTEGER, st_bron TEXT, groep INTEGER, groep_plafond INTEGER, pids_ondersteund INTEGER, reads_per_sec REAL)');
    db.prepare('INSERT INTO verbindprofielen (ontvangen, vin_pseudo, protocol, st_hex) VALUES (?, ?, ?, ?)').run(op, v, '6', '32');
  };
  const auto = (tok, v) => post('/klant/platform', { actie: 'voertuig_opslaan', voertuig: { naam: 'Auto', vin_pseudo: v } }, tok);

  console.log('\n2. De uitnodiger krijgt een code');
  const anna = await registreer('anna@voorbeeld.nl');
  toets('Anna geregistreerd', anna._status === 201, JSON.stringify(anna));
  const st = await post('/klant/platform', { actie: 'uitnodiging' }, anna.token);
  toets('code in de vorm PL-XXXXXX, met een link', /^PL-[A-HJKMNP-Z2-9]{6}$/.test(st.mijnCode) && st.link === 'https://app.pidlane.nl/?u=' + st.mijnCode, JSON.stringify(st));
  toets('geen akkoord van Mijn voertuigen nodig', st._status === 200);
  toets('dezelfde code bij een tweede keer', !!st.mijnCode && (await post('/klant/platform', { actie: 'uitnodiging' }, anna.token)).mijnCode === st.mijnCode);
  const tokBeheer = (await W.makeToken(env, 'beheer', 'admin', 'Beheer')).token;
  toets('een beheerder heeft geen uitnodigingscode', (await post('/klant/platform', { actie: 'uitnodiging' }, tokBeheer))._status === 403);

  console.log('\n3. Een vriend registreert met de code');
  const eigen = await registreer('anna2@voorbeeld.nl', 'onzin-code');
  toets('onbekende code: account er wel, niet gekoppeld', eigen._status === 201 && eigen.uitnodiging && !eigen.uitnodiging.gekoppeld);
  const bert = await registreer('bert@voorbeeld.nl', st.mijnCode.toLowerCase().replace('-', ' '));
  toets('Bert gekoppeld (code in kleine letters met spatie)', bert._status === 201 && bert.uitnodiging && bert.uitnodiging.gekoppeld, JSON.stringify(bert.uitnodiging));
  toets('alleen registreren levert niets op', !saldo('bert@voorbeeld.nl') && !saldo('anna@voorbeeld.nl'));
  await akkoord(bert.token);

  console.log('\n4. De auto van de vriend');
  const oudeAuto = 'aaaaaaaaaaaaaaaa';
  profiel(oudeAuto, '2020-01-01T00:00:00.000Z');
  const a1 = await auto(bert.token, oudeAuto);
  toets('een auto die al eerder verbond: geen tegoed', a1.ok && a1.uitnodiging && !a1.uitnodiging.beloond && !saldo('bert@voorbeeld.nl'), JSON.stringify(a1.uitnodiging));
  const nieuw = 'bbbbbbbbbbbbbbbb';
  const a2 = await auto(bert.token, nieuw);
  toets('nieuwe auto zonder verbinding gezien: nog niet', a2.ok && !a2.uitnodiging.beloond && /verbinding/.test(a2.uitnodiging.reden), JSON.stringify(a2.uitnodiging));
  profiel(nieuw, new Date(Date.now() + 1000).toISOString());
  const st2 = await post('/klant/platform', { actie: 'uitnodiging' }, bert.token);
  toets('na de verbinding: de vriend krijgt 10, ook als het pas bij het openen gebeurt', st2.beloning && st2.beloning.beloond && saldo('bert@voorbeeld.nl') === 10, JSON.stringify(st2.beloning) + ' saldo ' + saldo('bert@voorbeeld.nl'));
  toets('en de uitnodiger 20', saldo('anna@voorbeeld.nl') === 20, String(saldo('anna@voorbeeld.nl')));
  await post('/klant/platform', { actie: 'uitnodiging' }, bert.token);
  await auto(bert.token, 'cccccccccccccccc');
  toets('nooit twee keer voor dezelfde vriend', saldo('bert@voorbeeld.nl') === 10 && saldo('anna@voorbeeld.nl') === 20);
  const kas = db.prepare('SELECT * FROM kasboek').all().filter((r) => r.Soort === 'uitnodiging');
  toets('in de vriendrijen staat geen e-mailadres', !JSON.stringify(db.prepare('SELECT * FROM kp_uitnodiging').all()).includes('@'));
  toets('twee regels in het kasboek', kas.length === 2, JSON.stringify(kas.map((r) => r.Credits)));
  const stA = await post('/klant/platform', { actie: 'uitnodiging' }, anna.token);
  toets('Anna ziet 1 beloond en 20 verdiend', stA.beloond === 1 && stA.verdiend === 20, JSON.stringify(stA));

  console.log('\n5. Dezelfde auto, het plafond en de eigen code');
  const cor = await registreer('cor@voorbeeld.nl', st.mijnCode); await akkoord(cor.token);
  const c1 = await auto(cor.token, nieuw);
  toets('Berts auto bij Cor: al bekend, geen tegoed', !c1.uitnodiging.beloond && !saldo('cor@voorbeeld.nl'), JSON.stringify(c1.uitnodiging));
  const dirk = await registreer('dirk@voorbeeld.nl', st.mijnCode); await akkoord(dirk.token);
  const v2 = 'dddddddddddddddd'; profiel(v2, new Date(Date.now() + 2000).toISOString());
  await auto(dirk.token, v2);
  toets('tweede vriend: Anna nu 40', saldo('anna@voorbeeld.nl') === 40 && saldo('dirk@voorbeeld.nl') === 10);
  const eva = await registreer('eva@voorbeeld.nl', st.mijnCode); await akkoord(eva.token);
  const v3 = 'eeeeeeeeeeeeeeee'; profiel(v3, new Date(Date.now() + 3000).toISOString());
  await auto(eva.token, v3);
  toets('boven het plafond (2): Eva krijgt 10, Anna niets meer', saldo('eva@voorbeeld.nl') === 10 && saldo('anna@voorbeeld.nl') === 40);
  const zelf = await registreer('Anna@Voorbeeld.nl', st.mijnCode);
  toets('je eigen code bij een tweede registratie: dubbel adres geweigerd', zelf._status === 409);
  // Via de registratie komt dat adres nooit langs de koppeling (409 eerst), dus
  // de koppeling zelf: een account kan zich niet aan zijn eigen code hangen.
  const eigenK = await W.uitnodigKoppel(env, 'Anna@Voorbeeld.nl ', st.mijnCode);
  toets('je eigen code koppelen: geweigerd, en er komt geen rij bij', !eigenK.gekoppeld && eigenK.reden === 'eigen code' &&
    !db.prepare('SELECT 1 FROM kp_uitnodiging WHERE vriend_id = ?').get(await W.kpKlantId('anna@voorbeeld.nl')), JSON.stringify(eigenK));

  console.log('\n6. Wissen');
  const annaId = await W.kpKlantId('anna@voorbeeld.nl');
  await W.kpAlleWissen(env.LOGDB, annaId, { behoudAkkoord: true });
  toets('een schone start laat de code staan', !!db.prepare('SELECT 1 FROM kp_uitnodigcode WHERE klant_id = ?').get(annaId));
  await W.kpAlleWissen(env.LOGDB, annaId);
  toets('alles wissen: code en de vriendrijen met die code weg',
    !db.prepare('SELECT 1 FROM kp_uitnodigcode WHERE klant_id = ?').get(annaId) && db.prepare('SELECT COUNT(*) AS n FROM kp_uitnodiging WHERE code = ?').get(st.mijnCode).n === 0);

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : n + ' toetsen, allemaal goed'));
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('  FOUT  ' + (e && e.stack || e)); process.exit(1); });
