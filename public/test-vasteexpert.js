// ══════════════════════════════════════════════════════════════════
// test-vasteexpert.js — de verkoper of garage als vaste expert (#646)
// ──────────────────────────────────────────────────────────────────
// De ECHTE worker.js als module, met SQLite als D1 en de echte
// RemoteSessionDO achter een nep-namespace. Het hele pad:
//   expert maakt een koppelcode → klant koppelt met akkoord → klant deelt →
//   de expert laat zijn sessie zien → volledige toegang zonder vraag.
//
// WAT HIER ROOD HOORT TE WORDEN
//   • koppelen zonder akkoord, of met een verlopen of al gebruikte code;
//   • een klant (of demo) die een koppelcode kan maken;
//   • een andere klant die de koppeling van een ander kan intrekken;
//   • een expert die niet gekoppeld is, of een vervalste sessie, die toch
//     volledige toegang krijgt;
//   • intrekken midden in een sessie dat de toegang laat staan;
//   • de inlognaam van de expert die bij de klant terechtkomt;
//   • inleren in demo, op afstand, of een tweede keer voor dezelfde auto.
//
// Draaien vanuit public/:  node test-vasteexpert.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
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
    sql, args,
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

// Durable Objects: één echte RemoteSessionDO per naam, met nep-opslag en
// nep-sockets. Geen WebSocketPair nodig: de test praat via webSocketMessage.
function maakNamespace(W, envRef) {
  const objecten = new Map();
  return {
    objecten,
    idFromName: (n) => n,
    get(n) {
      if (!objecten.has(n)) {
        const opslag = new Map(), sockets = [];
        const ctx = {
          storage: {
            get: async (k) => opslag.get(k), put: async (k, v) => { opslag.set(k, v); }, delete: async (k) => { opslag.delete(k); },
            deleteAll: async () => opslag.clear(), setAlarm() {}
          },
          blockConcurrencyWhile: (fn) => { ctx.klaar = fn(); return ctx.klaar; },
          getWebSockets: (tag) => sockets.filter((s) => !s.dicht && (!tag || s.rol === tag)),
          acceptWebSocket() {}
        };
        const d = new W.RemoteSessionDO(ctx, envRef.env);
        d._sockets = sockets; d._ctx = ctx;
        objecten.set(n, d);
      }
      const d = objecten.get(n);
      // Zoals een echte stub: fetch(url, init) wordt een Request.
      return { fetch: async (req, init) => { await d._ctx.klaar; return d.fetch(req instanceof Request ? req : new Request(req, init)); } };
    }
  };
}
function sock(d, rol) {
  let att = { role: rol };
  const s = { rol, ontvangen: [], dicht: false,
    send(t) { this.ontvangen.push(JSON.parse(t)); }, close() { this.dicht = true; },
    deserializeAttachment() { return att; }, serializeAttachment(a) { att = a; } };
  d._sockets.push(s);
  return s;
}

async function laadWorker() {
  const i = bron.lastIndexOf('export {');
  if (i < 0) throw new Error('export-blok niet gevonden in worker.js');
  const mod = bron.slice(0, i) +
    'export { worker_default as default, RemoteSessionDO, makeToken, D1_SCHEMA, kpKlantId, metaVoorSocket };\n';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 've-')), 'worker.mjs');
  fs.writeFileSync(f, mod);
  return import('file://' + f);
}

// pidlane-remote.js in een kale browser, voor de pure stukken van de app
function laadRemote() {
  const el = () => ({ classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, style: {}, textContent: '', innerHTML: '', value: '', addEventListener() {} });
  const ctx = { console, Set, Map, Promise, setTimeout, clearTimeout, setInterval, clearInterval, JSON, Math, Date, Object, Array, String, Number, isFinite, RegExp };
  ctx.window = ctx;
  ctx.document = { getElementById: el, querySelectorAll: () => [], addEventListener() {}, documentElement: el() };
  ctx.localStorage = { getItem: () => null, setItem() {} };
  ctx.location = { protocol: 'https:', origin: 'https://x', pathname: '/' };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-remote.js'), 'utf8'), ctx);
  return ctx.PLRemote;
}

(async () => {
  const W = await laadWorker();
  const db = new DatabaseSync(':memory:');
  const envRef = {};
  const env = { LOGDB: maakD1(db), SESSION_SECRET: 'test-geheim-dat-lang-genoeg-is-0123456789' };
  envRef.env = env;
  env.REMOTE_SESSION = maakNamespace(W, envRef);
  W.D1_SCHEMA.forEach((st) => db.exec(st));
  const zaai = (id, email) => db.prepare('INSERT INTO klanten (id, rij_gemaakt, "Email", "Status") VALUES (?, ?, ?, ?)').run(id, '2026-01-01T00:00:00.000Z', email, 'actief');
  zaai('recAnna0000000001', 'anna@voorbeeld.nl');
  zaai('recBert0000000002', 'bert@voorbeeld.nl');
  const tok = async (u, r, l) => (await W.makeToken(env, u, r, l)).token;
  const tokAnna = await tok('anna@voorbeeld.nl', 'klant', 'Anna');
  const tokBert = await tok('bert@voorbeeld.nl', 'klant', 'Bert');
  const tokGarage = await tok('garagejansen', 'user', 'Garage Jansen');
  const tokAnder = await tok('anderegarage', 'user', 'Andere garage');
  const tokDemo = await tok('demo', 'demo', 'Demo');

  async function roep(pad, t, body) {
    const r = await W.default.fetch(new Request('https://app.pidlane.nl' + pad, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': t, Origin: 'https://app.pidlane.nl' },
      body: JSON.stringify(body || {})
    }), env, { waitUntil() {} });
    let d = {};
    try { d = await r.json(); } catch (x) { d = { _geenJson: true }; }
    d._status = r.status;
    return d;
  }
  const kp = (t, b) => roep('/klant/platform', t, b);

  console.log('\n1. De koppelcode');
  toets('een klant kan geen koppelcode maken', (await roep('/expert/koppelcode', tokAnna))._status === 403);
  toets('een demo-account ook niet', (await roep('/expert/koppelcode', tokDemo))._status === 403);
  toets('zonder inlog ook niet', (await roep('/expert/koppelcode', ''))._status === 403);
  const kc = await roep('/expert/koppelcode', tokGarage);
  toets('personeel krijgt een code van acht tekens', kc.ok && /^[A-HJ-NP-Z2-9]{8}$/.test(kc.code), JSON.stringify(kc));

  console.log('\n2. Koppelen door de klant');
  const st = await kp(tokAnna, { actie: 'stand' });
  await kp(tokAnna, { actie: 'akkoord', versie: st.akkoordVersie });
  await kp(tokBert, { actie: 'akkoord', versie: st.akkoordVersie });
  const ex0 = await kp(tokAnna, { actie: 'experts' });
  toets('de tekst en versie komen van de server', ex0.ok && /volledige toegang/.test(ex0.tekst) && !!ex0.versie && ex0.experts.length === 0, JSON.stringify(ex0));
  toets('/klant/platform blijft dicht voor personeel', (await kp(tokGarage, { actie: 'experts' }))._status === 401);
  const zonder = await kp(tokAnna, { actie: 'expert_koppel', koppelcode: kc.code });
  toets('koppelen zonder akkoord: geweigerd, met de tekst erbij', !zonder.ok && zonder.akkoordNodig === true && !!zonder.tekst);
  toets('een oude tekstversie telt niet', !(await kp(tokAnna, { actie: 'expert_koppel', koppelcode: kc.code, akkoord: '2020-01-01' })).ok);
  toets('een onzincode: geweigerd', (await kp(tokAnna, { actie: 'expert_koppel', koppelcode: 'XXXX', akkoord: ex0.versie }))._status === 400);
  const met = await kp(tokAnna, { actie: 'expert_koppel', koppelcode: kc.code.slice(0, 4) + ' ' + kc.code.slice(4).toLowerCase(), akkoord: ex0.versie });
  toets('koppelen met akkoord (spatie en kleine letters mogen)', met.ok && met.experts.length === 1 && met.experts[0].naam === 'Garage Jansen', JSON.stringify(met));
  toets('de klant ziet niet de inlognaam van de expert', !JSON.stringify(met).includes('garagejansen'));
  toets('de code is op: Bert kan hem niet nog eens gebruiken', (await kp(tokBert, { actie: 'expert_koppel', koppelcode: kc.code, akkoord: ex0.versie }))._status === 404);
  const oud = await roep('/expert/koppelcode', tokAnder);
  db.prepare('UPDATE kp_expertcode SET verloopt = ? WHERE code = ?').run('2020-01-01T00:00:00.000Z', oud.code);
  toets('een verlopen code: geweigerd', (await kp(tokBert, { actie: 'expert_koppel', koppelcode: oud.code, akkoord: ex0.versie }))._status === 404);
  const rij = db.prepare('SELECT * FROM kp_expert').get();
  toets('de koppeling bewaart de tekstversie', rij && rij.tekst_versie === ex0.versie);
  toets('Bert kan de koppeling van Anna niet intrekken', (await kp(tokBert, { actie: 'expert_ontkoppel', id: met.experts[0].id })).ingetrokken === 0);

  console.log('\n3. Delen: de vaste expert krijgt volledig, een ander niet');
  const ses = await roep('/session/create', tokAnna, { ttlMin: 60, vehicle: 'Mazda' });
  toets('sessie aangemaakt', ses.ok && !!ses.sessionId, JSON.stringify(ses));
  const d = env.REMOTE_SESSION.objecten.get(ses.sessionId);
  toets('de vaste expert staat in de sessie', d._meta.vast && d._meta.vast.length === 1 && d._meta.vast[0].u === 'garagejansen');
  toets('wat een socket van de meta ziet bevat geen inlognaam', !JSON.stringify(W.metaVoorSocket(d._meta)).includes('garagejansen'));
  const local = sock(d, 'local'), garage = sock(d, 'expert'), ander = sock(d, 'expert');
  const stuur = (ws, m) => d.webSocketMessage(ws, JSON.stringify(m));
  await stuur(local, { type: 'toestemming', niveau: 'basis' });
  await stuur(ander, { type: 'identiteit', token: tokAnder });
  toets('een andere expert wordt niet herkend', ander.ontvangen.some((m) => m.type === 'identiteit' && m.vast === false));
  await stuur(ander, { type: 'request-analyze', problem: '', reqId: 'a1' });
  toets('en krijgt geen analyse op basis', ander.ontvangen.some((m) => m.reason === 'geen_toestemming') && !local.ontvangen.some((m) => m.type === 'request-analyze'));
  const nep = tokGarage.slice(0, -4) + (tokGarage.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
  await stuur(garage, { type: 'identiteit', token: nep });
  toets('een vervalste sessie wordt niet herkend', garage.ontvangen.some((m) => m.type === 'identiteit' && m.vast === false));
  await stuur(garage, { type: 'identiteit', token: await tok('garagejansen', 'klant', 'Nep') });
  toets('dezelfde naam als klant-sessie telt niet', garage.ontvangen.filter((m) => m.type === 'identiteit' && m.vast === false).length === 2);
  await stuur(garage, { type: 'identiteit', token: tokGarage });
  toets('de vaste expert krijgt volledig, blijvend', garage.ontvangen.some((m) => m.type === 'toestemming' && m.niveau === 'volledig' && m.vast === true));
  toets('de klant hoort wie, zonder inlognaam', local.ontvangen.some((m) => m.type === 'vast' && m.naam === 'Garage Jansen') && !JSON.stringify(local.ontvangen).includes('garagejansen'));
  await stuur(garage, { type: 'request-analyze', problem: 'trilt', reqId: 'g1' });
  const fw = local.ontvangen.find((m) => m.type === 'request-analyze');
  toets('zijn analyse gaat door, gemerkt als vast', fw && fw.vast === true, JSON.stringify(fw));
  toets('de sessie zelf blijft op basis', d._meta.niveau === 'basis');
  await stuur(ander, { type: 'request-analyze', problem: '', reqId: 'a2' });
  toets('de andere expert nog steeds niet', local.ontvangen.filter((m) => m.type === 'request-analyze').length === 1);

  console.log('\n4. Intrekken midden in de sessie');
  await stuur(local, { type: 'toestemming', niveau: 'basis', vastIntrekken: true });
  toets('de expert hoort dat het vervalt', garage.ontvangen.some((m) => m.type === 'toestemming' && m.vast === false));
  await stuur(garage, { type: 'request-kaart', reqId: 'g2' });
  toets('daarna geen volledige kaart meer', garage.ontvangen.some((m) => m.reason === 'geen_toestemming' && m.reqId === 'g2'));
  await stuur(garage, { type: 'identiteit', token: tokGarage });
  toets('en opnieuw de sessie laten zien helpt niet', garage.ontvangen.filter((m) => m.type === 'identiteit' && m.vast === false).length === 3);
  const weg = await kp(tokAnna, { actie: 'expert_ontkoppel', id: met.experts[0].id });
  toets('de klant trekt de koppeling in', weg.ok && weg.ingetrokken === 1 && weg.experts.length === 0);
  const ses2 = await roep('/session/create', tokAnna, { ttlMin: 60 });
  toets('een nieuwe sessie heeft geen vaste expert meer', !(env.REMOTE_SESSION.objecten.get(ses2.sessionId)._meta.vast || []).length);
  const kc2 = await roep('/expert/koppelcode', tokGarage);
  await kp(tokAnna, { actie: 'expert_koppel', koppelcode: kc2.code, akkoord: ex0.versie });
  await kp(tokAnna, { actie: 'alles_wissen' });
  const annaId = await W.kpKlantId('anna@voorbeeld.nl');
  toets('alles wissen haalt ook de vaste expert weg', db.prepare('SELECT COUNT(*) AS n FROM kp_expert WHERE klant_id = ?').get(annaId).n === 0);

  console.log('\n5. De app: inleren en het meekijkscherm');
  const R = laadRemote();
  const basis = { verbonden: true, demo: false, remote: false, sleutel: 'JM3|mazda|cx-5|2018', experts: [{ naam: 'Garage Jansen' }], gedaan: {} };
  toets('verbonden, gekoppeld, nog niet gedaan: inleren', R._moetInleren(basis));
  toets('niet in demo', !R._moetInleren(Object.assign({}, basis, { demo: true })));
  toets('niet als expert op afstand', !R._moetInleren(Object.assign({}, basis, { remote: true })));
  toets('niet zonder vaste expert', !R._moetInleren(Object.assign({}, basis, { experts: [] })));
  toets('niet een tweede keer', !R._moetInleren(Object.assign({}, basis, { gedaan: { 'JM3|mazda|cx-5|2018': '2026-10-29' } })));
  const sl = R._inleerSleutel({ vin: 'JM3KFBCM1J0123456', merk: 'Mazda', model: 'CX-5', year: 2018 });
  toets('de sleutel per auto bevat nooit de VIN', sl === 'JM3|mazda|cx-5|2018' && !/0123456/.test(sl), sl);
  toets('zonder merk geen sleutel', R._inleerSleutel({ vin: 'JM3KFBCM1J0123456' }) === null);
  const h = R._klantNiveauHtml('basis', false, { naam: '<b>Garage</b>' });
  toets('de klant ziet de vaste toegang met een intrekknop', /Vaste toegang voor/.test(h) && /vastIntrekken/.test(h));
  toets('de naam gaat door esc()', h.indexOf('<b>Garage') < 0);
  // #648: het inleren wacht op de zoekronde en de gezondheidscheck
  toets('bus vrij: inleren mag', R._inleerBusVrij({ discovery: 0, health: 0, kaart: false }));
  toets('zoekronde loopt: wachten', !R._inleerBusVrij({ discovery: 1, health: 0, kaart: false }));
  toets('gezondheidscheck loopt: wachten', !R._inleerBusVrij({ discovery: 0, health: 1, kaart: false }));
  toets('een kaart loopt al: wachten', !R._inleerBusVrij({ discovery: 0, health: 0, kaart: true }));
  toets('tijdens de kaart is stilte geen alarm voor de expert', /Volledige kaart bezig/.test(R._stilTekst(12, true)) && !/achtergrond/.test(R._stilTekst(12, true)));
  toets('zonder kaart wél: app op de achtergrond of adapter weg', /achtergrond of adapter weg/.test(R._stilTekst(12, false)));

  console.log(fout ? '\n' + fout + ' FOUT(EN)\n' : '\nAlles goed\n');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('FOUT: test liep vast:', e); process.exit(1); });
