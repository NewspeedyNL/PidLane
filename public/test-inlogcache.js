// ══════════════════════════════════════════════════════════════════
// test-inlogcache.js — de Users-tabel niet bij elke login opnieuw (#327)
// ──────────────────────────────────────────────────────────────────
// WAAROM. De Airtable-werkruimte zat op 28-09-2026 op 2.525 van de 1.000
// calls per maand, en elke login las de hele Users-tabel vers uit. Nu
// onthoudt de Worker die tabel een paar minuten per isolate.
//
// Een cache die "werkt" is de halve uitspraak. De andere helft is dat er
// niemand buitengesloten of binnengelaten wordt die dat zonder cache niet
// was. Dus naast "twee logins, één lezing":
//   • een net gewijzigd wachtwoord en een net toegevoegde gebruiker werken
//     meteen — een mislukte login op een onthouden tabel leest één keer vers;
//   • een fout wachtwoord kost hoogstens die ene verse lezing, niet meer;
//   • na een Airtable-storing kan er meteen weer ingelogd worden;
//   • na /admin/users (bv. Active uit) en na het herhashen van een oud
//     wachtwoord leest de volgende login vers;
//   • na de bewaartijd wordt er weer gelezen.
//
// De ECHTE worker.js, als module geladen, door de echte router heen. Alleen
// fetch naar Airtable is nagebouwd, en die telt mee.
//
// Draaien vanuit public/:  node test-inlogcache.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

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
  const mod = bron.slice(0, i) +
    'export { worker_default as default, hashPassword, USERS_CACHE_MS };\n';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'inlog-')), 'worker.mjs');
  fs.writeFileSync(f, mod);
  return import('file://' + f);
}

// ── Airtable, nagebouwd: alleen de Users-tabel, en elke GET telt ──────
const at = { rijen: [], lezingen: 0, kapot: false };
function atAntwoord(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}
global.fetch = async (url, opt) => {
  const u = String(url);
  const m = (opt && opt.method) || 'GET';
  if (!/api\.airtable\.com\/v0\/[^/]+\/Users/.test(u)) throw new Error('onverwachte fetch in deze test: ' + m + ' ' + u);
  if (m === 'GET') {
    at.lezingen++;
    if (at.kapot) return atAntwoord({ error: 'kapot' }, 503);
    return atAntwoord({ records: at.rijen.map((r) => ({ id: r.id, fields: Object.assign({}, r.fields) })) });
  }
  const body = opt && opt.body ? JSON.parse(opt.body) : {};
  if (m === 'PATCH') {
    for (const rec of body.records || []) {
      const rij = at.rijen.find((r) => r.id === rec.id);
      if (rij) Object.assign(rij.fields, rec.fields);
    }
    return atAntwoord({ records: body.records });
  }
  if (m === 'POST') {
    for (const rec of body.records || []) at.rijen.push({ id: 'rec' + (at.rijen.length + 100), fields: Object.assign({}, rec.fields) });
    return atAntwoord({ records: body.records });
  }
  return atAntwoord({ deleted: true });
};

// De klok is van de test: de bewaartijd moet te overschrijden zijn zonder te wachten.
let klok = Date.parse('2026-09-28T12:00:00Z');
Date.now = () => klok;

const env = { SESSION_SECRET: 'test-geheim', AIRTABLE_TOKEN: 'x', ADMIN_TOKEN: 'beheer-token-test' };
const ctx = { taken: [], waitUntil(p) { this.taken.push(p); } };
let ipTeller = 0;

(async () => {
  const W = await laadWorker();
  toets('USERS_CACHE_MS is een bewaartijd van minuten, niet van uren',
    typeof W.USERS_CACHE_MS === 'number' && W.USERS_CACHE_MS >= 6e4 && W.USERS_CACHE_MS <= 15 * 6e4,
    'USERS_CACHE_MS = ' + W.USERS_CACHE_MS);

  async function login(user, pass) {
    klok += 1000;
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
  function tel() { const x = at.lezingen; at.lezingen = 0; return x; }

  at.rijen = [
    { id: 'recA', fields: { User: 'anna', Role: 'user', Label: 'Anna', Active: true, PassHash: await W.hashPassword('wachtwoord-anna', env) } }
  ];

  // 1. De besparing zelf.
  tel();
  const s1 = await login('anna', 'wachtwoord-anna');
  const s2 = await login('anna', 'wachtwoord-anna');
  toets('twee logins kort na elkaar lezen de Users-tabel één keer', s1 === 200 && s2 === 200 && tel() === 1,
    'status ' + s1 + '/' + s2);

  // 2. Wachtwoord in Airtable gewijzigd: de onthouden tabel heeft de oude hash.
  at.rijen[0].fields.PassHash = await W.hashPassword('nieuw-wachtwoord', env);
  const s3 = await login('anna', 'nieuw-wachtwoord');
  toets('een net gewijzigd wachtwoord werkt meteen (één verse lezing)', s3 === 200 && tel() === 1, 'status ' + s3);

  // 3. Nieuwe gebruiker, niet in de onthouden tabel.
  at.rijen.push({ id: 'recB', fields: { User: 'bert', Role: 'user', Label: 'Bert', Active: true, PassHash: await W.hashPassword('wachtwoord-bert', env) } });
  const s4 = await login('bert', 'wachtwoord-bert');
  toets('een net toegevoegde gebruiker kan meteen inloggen', s4 === 200, 'status ' + s4);
  tel();

  // 4. Fout wachtwoord: begrensd.
  const s5 = await login('anna', 'fout-wachtwoord');
  toets('een fout wachtwoord kost hoogstens één verse lezing', s5 === 401 && tel() <= 1, 'status ' + s5);

  // 5. Bewaartijd voorbij.
  await login('anna', 'nieuw-wachtwoord'); tel();
  klok += W.USERS_CACHE_MS + 1000;
  const s6 = await login('anna', 'nieuw-wachtwoord');
  toets('na de bewaartijd leest een login weer vers', s6 === 200 && tel() === 1, 'status ' + s6);

  // 6. Een Airtable-storing sluit niemand langer buiten dan hij duurt.
  klok += W.USERS_CACHE_MS + 1000;
  at.kapot = true;
  const s7 = await login('anna', 'nieuw-wachtwoord');
  at.kapot = false;
  const s8 = await login('anna', 'nieuw-wachtwoord');
  toets('tijdens een Airtable-storing lukt inloggen niet (zoals zonder cache)', s7 === 401, 'status ' + s7);
  toets('na de storing kan er meteen weer ingelogd worden', s8 === 200, 'status ' + s8);
  tel();

  // 7. Uitzetten via /admin/users werkt meteen, niet pas na de bewaartijd.
  await login('anna', 'nieuw-wachtwoord');
  const sb = await beheer({ action: 'save', user: 'anna', role: 'user', label: 'Anna', active: false });
  const s9 = await login('anna', 'nieuw-wachtwoord');
  toets('na Active uit via /admin/users komt die gebruiker er meteen niet meer in', sb === 200 && s9 === 401,
    'beheer ' + sb + ', login ' + s9);
  tel();

  // 8. Na het herhashen van een oud (sha256) wachtwoord leest de volgende login vers.
  const crypto = require('crypto');
  at.rijen.push({ id: 'recC', fields: { User: 'cees', Role: 'user', Label: 'Cees', Active: true,
    PassHash: crypto.createHash('sha256').update('wachtwoord-cees').digest('hex') } });
  klok += W.USERS_CACHE_MS + 1000;
  const sc1 = await login('cees', 'wachtwoord-cees');
  const naEerste = tel();
  const sc2 = await login('cees', 'wachtwoord-cees');
  const naTweede = tel();
  toets('het herhashte wachtwoord staat in Airtable', /^pbkdf2_sha256\$/.test(at.rijen.find((r) => r.id === 'recC').fields.PassHash));
  toets('na het herhashen leest de volgende login vers',
    sc1 === 200 && sc2 === 200 && naEerste === 1 && naTweede === 1,
    'status ' + sc1 + '/' + sc2 + ', lezingen ' + naEerste + '/' + naTweede);

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
