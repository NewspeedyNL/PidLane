// ══════════════════════════════════════════════════════════════════
// test-schoon.js — nieuwe auto, schone start (29-10-2026)
// ──────────────────────────────────────────────────────────────────
// Twee kanten, allebei de echte bron:
//   • pidlane-schoon.js in een vm, op een nagebouwde localStorage: wat gaat
//     weg, wat blijft, en wanneer herstart hij.
//   • worker.js als module op een echte SQLite: de kolom SchoneStart komt er
//     op een bestaande klantentabel bij, en een login met die vlag wist de
//     voertuigen en rapporten van díé klant — niet het akkoord, en niets van
//     een andere klant. handleKlantLogin draait echt, met wachtwoordhash.
//
// Draaien vanuit public/:  node test-schoon.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { DatabaseSync } = require('node:sqlite');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

// ── De app-kant ───────────────────────────────────────────────────
function opslag(begin) {
  const m = new Map(Object.entries(begin || {}));
  return {
    get length() { return m.size; },
    key: (i) => Array.from(m.keys())[i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m
  };
}
function laadSchoon(o) {
  o = o || {};
  const st = { herladen: 0, toasts: [], vragen: [] };
  const ctx = {
    console: { info() {}, warn() {}, log() {} },
    localStorage: opslag(o.ls), sessionStorage: opslag(o.ss),
    location: { reload: () => { st.herladen++; } },
    confirm: (t) => { st.vragen.push(t); return o.ja !== false; },
    alert: (t) => st.toasts.push(t),
    showToast: (t) => st.toasts.push(t),
    setTimeout, clearTimeout, Promise
  };
  if (o.verbonden) ctx.connected = true;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-schoon.js'), 'utf8'), ctx);
  return { ctx, st, P: ctx.PLSchoon };
}

const AUTO = {
  // Wat er van een vorige auto blijft hangen — de klacht zelf.
  pl_kenteken: '79SBGL', pl_proto_id: '6', pl_selectie: '{"pids":["0142"]}',
  pl_vinprof_JMZCR198260119735: '{}', pl_pidlen_JMZCR198260119735: '{}',
  pl_sessions_JMZCR198260119735: '[]', pl_diaghist_JMZCR198260119735: '[]',
  pl_garage_actief: 'v1', pl_garage_wachtrij: '[]', pl_bevindingen: '[]',
  pl_pid_bundels: '{}', pl_favorites: '[]', pl_testrun_herstel: '{}',
  pl_dash_mazda: '{}', pl_iets_van_morgen: '1'
};
const BLIJFT = {
  pl_tok: '{"token":"t"}', pl_session: 'test@pidlane.nl', pl_uitloggen: '0',
  pl_credits_saldo: '25', pl_credits_kalib: '{}', pl_adaptertype: 'mx',
  pl_bt_disclosure: '1', pl_livelog_mode: 'aan', pl_uiscale: '1.1',
  ns_theme: 'donker', ns_api_key: 'sk-ant-x', spp_address: 'AA:BB'
};

(async () => {
  console.log('\n1. Wat weggaat en wat blijft');
  {
    const { ctx, P } = laadSchoon({ ls: Object.assign({}, AUTO, BLIJFT), ss: { pl_btlog: '[]', pl_tok: 'x' } });
    const weg = P.lokaalWissen();
    const ls = ctx.localStorage._m;
    const over = Object.keys(AUTO).filter((k) => ls.has(k));
    toets('elke sleutel van de vorige auto is weg (ook een onbekende van morgen)', over.length === 0, 'bleef: ' + over.join(', '));
    const kwijt = Object.keys(BLIJFT).filter((k) => !ls.has(k));
    toets('login, tegoed, adapter, toestemming en weergave blijven', kwijt.length === 0, 'kwijt: ' + kwijt.join(', '));
    toets('en ze houden hun waarde', ls.get('pl_credits_saldo') === '25' && ls.get('pl_tok') === '{"token":"t"}');
    toets('sessionStorage gaat mee, met dezelfde lijst',
      !ctx.sessionStorage._m.has('pl_btlog') && ctx.sessionStorage._m.has('pl_tok'));
    toets('hij geeft terug wat hij wiste', weg.length === Object.keys(AUTO).length + 1, String(weg.length));
  }

  console.log('\n2. De bewaarlijst houdt in elk geval de login van de demozandbak');
  {
    // pidlane-demo.js DOORLAAT = "de sessie en de sleutel van wie er inlogt".
    // Wist PLSchoon er een van, dan is de gebruiker na de herstart uitgelogd.
    const demo = fs.readFileSync(path.join(__dirname, 'pidlane-demo.js'), 'utf8');
    const m = demo.match(/var DOORLAAT = (\[[^\]]*\]);/);
    if (!m) throw new Error('DOORLAAT niet gevonden in pidlane-demo.js');
    const lijst = JSON.parse(m[1].replace(/'/g, '"'));
    const { P } = laadSchoon();
    const mist = lijst.filter((k) => !P.bewaar(k));
    toets('elke DOORLAAT-sleutel wordt bewaard', mist.length === 0, 'gewist: ' + mist.join(', '));
    // TOK_KEY en UITLOG_KEY uit de echte auth-bron.
    const auth = fs.readFileSync(path.join(__dirname, 'pidlane-auth.js'), 'utf8');
    const tok = (auth.match(/const TOK_KEY='([^']+)'/) || [])[1], uit = (auth.match(/const UITLOG_KEY='([^']+)'/) || [])[1];
    toets('en de sessiesleutels die pidlane-auth.js echt gebruikt', tok && uit && P.bewaar(tok) && P.bewaar(uit), tok + ' / ' + uit);
  }

  console.log('\n3. De menuknop');
  {
    let r = laadSchoon({ ls: Object.assign({}, AUTO), verbonden: true });
    await r.P.start();
    toets('tijdens een verbinding: weigert, vraagt niets en wist niets',
      r.st.vragen.length === 0 && r.ctx.localStorage._m.has('pl_kenteken') && r.st.herladen === 0 && r.st.toasts.length === 1);
    r = laadSchoon({ ls: Object.assign({}, AUTO), ja: false });
    await r.P.start();
    toets('nee op de vraag: niets gewist, geen herstart', r.ctx.localStorage._m.has('pl_kenteken') && r.st.herladen === 0);
    r = laadSchoon({ ls: Object.assign({}, AUTO, BLIJFT) });
    await r.P.start();
    toets('ja: gewist en herstart', !r.ctx.localStorage._m.has('pl_kenteken') && r.st.herladen === 1 && r.ctx.localStorage._m.has('pl_tok'));
  }

  console.log('\n4. Na een klantlogin');
  {
    let r = laadSchoon({ ls: Object.assign({}, AUTO) });
    await r.P.naLogin({ schoneStart: false, startTegoed: true, akkoordActueel: true });
    toets('zonder de vlag: niets', r.ctx.localStorage._m.has('pl_kenteken') && r.st.herladen === 0);
    r = laadSchoon({ ls: Object.assign({}, AUTO) });
    await r.P.naLogin({ schoneStart: true, startTegoed: true, akkoordActueel: true });
    toets('met de vlag: gewist zonder vraag, en herstart', !r.ctx.localStorage._m.has('pl_kenteken') && r.st.vragen.length === 0 && r.st.herladen === 1);
    r = laadSchoon({ ls: Object.assign({}, AUTO) });
    await r.P.naLogin({ schoneStart: true, startTegoed: true, akkoordActueel: false });
    toets('wacht er een akkoordscherm: wel gewist, geen herstart die het wegklikt', !r.ctx.localStorage._m.has('pl_kenteken') && r.st.herladen === 0);
    // De aanroep zelf staat in _neemSessie, het enige pad na /klant/login.
    const kl = fs.readFileSync(path.join(__dirname, 'pidlane-klant.js'), 'utf8');
    const a = kl.indexOf('function _neemSessie('), b = kl.indexOf('\n  }\n', a);
    toets('_neemSessie roept PLSchoon.naLogin aan (bron: er is geen DOM-loze login om te draaien)',
      a > 0 && /PLSchoon\.naLogin\(k\)/.test(kl.slice(a, b)));
  }

  // ── De Worker-kant ─────────────────────────────────────────────
  const wortel = path.join(__dirname, '..');
  const bron = fs.readFileSync(path.join(wortel, 'worker.js'), 'utf8');
  const i = bron.lastIndexOf('export {');
  if (i < 0) throw new Error('export-blok niet gevonden in worker.js');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'schoon-')), 'worker.mjs');
  fs.writeFileSync(f, bron.slice(0, i) +
    'export { d1Tabel, atMaak, atHaal, kpSchema, kpKlantId, hashPassword, handleKlantLogin, klantPubliek };\n');
  const W = await import('file://' + f);

  function maakD1(db) {
    const stmt = (sql, args) => ({
      bind: (...a) => stmt(sql, a),
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }
    });
    return { prepare: (sql) => stmt(sql, []) };
  }

  console.log('\n5. De kolom komt erbij op een bestaande tabel');
  const sql = new DatabaseSync(':memory:');
  // De klantentabel zoals hij in productie staat: van vóór deze kolom.
  sql.exec('CREATE TABLE klanten (id TEXT PRIMARY KEY, rij_gemaakt TEXT NOT NULL, "Email" TEXT, "PassHash" TEXT, "Saldo" REAL, "TotaalGekocht" REAL, "Naam" TEXT, "Status" TEXT, "ResetToken" TEXT, "ResetVerloopt" TEXT, "Aangemaakt" TEXT, "LaatsteLogin" TEXT, "Opmerking" TEXT, "Akkoorden" TEXT, "Audit" TEXT, "AkkoordOp" TEXT, "StartTegoedGegeven" INTEGER, "VerwijderdOp" TEXT, "Ontwikkelaar" INTEGER, "TegoedUit" INTEGER)');
  const env = { LOGDB: maakD1(sql), SESSION_SECRET: 'test-geheim-van-voldoende-lengte-0123456789' };
  await W.d1Tabel(env, 'klanten');
  const kol = sql.prepare('PRAGMA table_info(klanten)').all().map((r) => r.name);
  toets('SchoneStart staat er na d1Tabel()', kol.includes('SchoneStart'), kol.join(','));

  console.log('\n6. Inloggen met en zonder de vlag');
  const hash = await W.hashPassword('geheim123', env);
  await W.atMaak(env, 'klanten', { Email: 'test@pidlane.nl', PassHash: hash, Status: 'actief', SchoneStart: true, StartTegoedGegeven: true });
  await W.atMaak(env, 'klanten', { Email: 'anna@voorbeeld.nl', PassHash: hash, Status: 'actief', StartTegoedGegeven: true });
  await W.kpSchema(env.LOGDB);
  const idT = await W.kpKlantId('test@pidlane.nl'), idA = await W.kpKlantId('anna@voorbeeld.nl');
  const nu = new Date().toISOString();
  for (const [k, v] of [[idT, 'vT'], [idA, 'vA']]) {
    sql.prepare("INSERT INTO kp_voertuig (id, klant_id, status, aangemaakt, bijgewerkt) VALUES (?, ?, 'actief', ?, ?)").run(v, k, nu, nu);
    sql.prepare("INSERT INTO kp_rapport (id, klant_id, voertuig_id, soort, tekst, aangemaakt) VALUES (?, ?, ?, 'onderzoek', 'x', ?)").run('r' + v, k, v, nu);
    sql.prepare("INSERT INTO kp_akkoord (klant_id, versie, op) VALUES (?, '1', ?)").run(k, nu);
  }
  const tel = (t, k) => sql.prepare('SELECT COUNT(*) AS n FROM ' + t + ' WHERE klant_id = ?').get(k).n;
  const login = async (email) => {
    const req = new Request('https://x/klant/login', { method: 'POST', headers: { 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ email, pass: 'geheim123' }) });
    const r = await W.handleKlantLogin(req, env, null);
    return { status: r.status, d: await r.json() };
  };

  let r = await login('anna@voorbeeld.nl');
  toets('gewone klant logt in', r.status === 200 && r.d.ok, JSON.stringify(r.d));
  toets('en zegt niet dat het toestel leeg moet', r.d.klant && r.d.klant.schoneStart === false);
  toets('en houdt zijn voertuig en rapport', tel('kp_voertuig', idA) === 1 && tel('kp_rapport', idA) === 1);

  r = await login('test@pidlane.nl');
  toets('testaccount logt in', r.status === 200 && r.d.ok, JSON.stringify(r.d));
  toets('en zegt de app dat het toestel leeg moet', r.d.klant && r.d.klant.schoneStart === true);
  toets('zijn voertuigen en rapporten zijn weg', tel('kp_voertuig', idT) === 0 && tel('kp_rapport', idT) === 0);
  toets('zijn akkoord blijft (anders vraagt elke testlogin het opnieuw)', tel('kp_akkoord', idT) === 1);
  toets('van de andere klant is niets geraakt', tel('kp_voertuig', idA) === 1 && tel('kp_rapport', idA) === 1 && tel('kp_akkoord', idA) === 1);

  const mis = await (async () => {
    const req = new Request('https://x/klant/login', { method: 'POST', headers: { 'CF-Connecting-IP': '1.2.3.5' },
      body: JSON.stringify({ email: 'test@pidlane.nl', pass: 'fout' }) });
    sql.prepare("INSERT INTO kp_voertuig (id, klant_id, status, aangemaakt, bijgewerkt) VALUES ('vT2', ?, 'actief', ?, ?)").run(idT, nu, nu);
    return (await W.handleKlantLogin(req, env, null)).status;
  })();
  toets('een verkeerd wachtwoord wist niets', mis === 401 && tel('kp_voertuig', idT) === 1, String(mis));

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('FOUT  ' + (e && e.stack || e)); process.exit(1); });
