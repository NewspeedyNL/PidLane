// ══════════════════════════════════════════════════════════════════
// test-bronnen.js — /admin/bronnen: zijn de kennisbronnen gezond en bij?
// ──────────────────────────────────────────────────────────────────
// Op de echte code uit worker.js (van BRON_STAND_SCHEMA tot en met
// handleAdminBronnen), met echte SQLite uit schema.sql en een nep-fetch die
// per host antwoordt zoals OBDb, de RDW en NHTSA dat doen. Wat hier rood
// hoort te worden:
//   - een RDW-kolom die de app leest is weg, en de bron heet toch gezond;
//   - een veranderd OBDb-bestand wordt niet als "nieuw" gemeld, of de eerste
//     meting wél (dan is alles altijd nieuw en zegt het niets);
//   - een mislukte meting gooit de vingerafdruk weg, zodat de volgende
//     gezonde meting een update lijkt;
//   - een GitHub-limiet heet "kapot";
//   - GET stuurt aanvragen naar buiten, of de route gaat open zonder token.
// Draaien vanuit de repo:  node public/test-bronnen.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let fout = 0, ok = 0;
function t(naam, waar, uitleg) {
  if (waar) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}

const wortel = path.join(__dirname, '..');
const bron = fs.readFileSync(path.join(wortel, 'worker.js'), 'utf8');
const schemaTekst = fs.readFileSync(path.join(wortel, 'schema.sql'), 'utf8');
const a = bron.indexOf('var BRON_STAND_SCHEMA = ');
const b = bron.indexOf('__name(handleAdminBronnen, "handleAdminBronnen");');
if (a < 0 || b < a) { console.error('FOUT: het /admin/bronnen-blok niet gevonden in worker.js — hernoemd of verbouwd.'); process.exit(1); }
const src = bron.slice(a, b);

function maakD1(db) {
  const stmt = (sql, args) => ({
    bind: (...x) => stmt(sql, x),
    all() { return { results: db.prepare(sql).all(...args) }; },
    first() { return db.prepare(sql).get(...args) || null; },
    run() { db.prepare(sql).run(...args); return { meta: {} }; }
  });
  return {
    prepare: (sql) => stmt(sql, []),
    batch(lijst) { db.exec('BEGIN'); try { const u = lijst.map((s) => s.run()); db.exec('COMMIT'); return u; } catch (e) { db.exec('ROLLBACK'); throw e; } }
  };
}

// ── De buitenwereld ─────────────────────────────────────────────
const RDW_KOL = {
  'm9d7-ebf2': ['kenteken', 'merk', 'handelsbenaming', 'datum_eerste_toelating', 'vervaldatum_apk', 'cilinderinhoud', 'voertuigsoort', 'tellerstandoordeel', 'openstaande_terugroepactie_indicator'],
  '8ys7-d773': ['kenteken', 'brandstof_omschrijving', 'nettomaximumvermogen', 'brandstof_volgnummer'],
  't49b-isb7': ['kenteken', 'referentiecode_rdw', 'code_status', 'status'],
  'j9yg-7rg9': ['referentiecode_rdw', 'omschrijving_defect', 'publicatiedatum_rdw_dt', 'categorie_defect'],
  '9ihi-jgpf': ['referentiecode_rdw', 'code_mogelijk_gevaar', 'mogelijk_gevaar']
};
// De woordenlijsten zoals het RDW ze op 17-10-2026 gaf.
const RDW_WAARDEN = {
  'm9d7-ebf2': { tellerstandoordeel: ['Geen oordeel', 'Logisch', 'Niet geregistreerd', 'Onlogisch'] },
  't49b-isb7': { code_status: ['O', 'P'] }
};
const wereld = {
  orgStatus: 200,
  pushed: { 'Mazda-CX-5': '2026-10-15T10:00:00Z', 'Kia-Niro': '2026-10-01T10:00:00Z' },
  obdb: {
    'Mazda-CX-5': JSON.stringify({ commands: [{ cmd: { 22: 'DD01' }, signals: [{ id: 'A' }, { id: 'B' }] }] }),
    'Kia-Niro': JSON.stringify({ commands: [{ cmd: { 22: '0101' }, signals: [{ id: 'C' }] }] })
  },
  rdwKol: JSON.parse(JSON.stringify(RDW_KOL)),
  rdwWaarden: JSON.parse(JSON.stringify(RDW_WAARDEN)),
  rdwBij: 1760000000,
  nhtsa: { Make: 'HONDA', Model: 'Accord', 'Model Year': '2003' },
  onbereikbaar: {}
};
const aanvragen = [];
async function nepFetch(url) {
  aanvragen.push(url);
  const u = new URL(url);
  if (wereld.onbereikbaar[u.hostname]) throw new Error('getaddrinfo ENOTFOUND ' + u.hostname);
  const antw = (status, body) => ({ status, ok: status < 300, headers: new Map(), text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
  if (u.hostname === 'api.github.com') {
    if (wereld.orgStatus !== 200) return antw(wereld.orgStatus, { message: 'API rate limit exceeded for 1.2.3.4.' });
    return antw(200, Object.keys(wereld.pushed).sort((x, y) => wereld.pushed[y].localeCompare(wereld.pushed[x])).map((n) => ({ name: n, pushed_at: wereld.pushed[n] })));
  }
  if (u.hostname === 'raw.githubusercontent.com') {
    const repo = u.pathname.split('/')[2];
    return wereld.obdb[repo] ? antw(200, wereld.obdb[repo]) : antw(404, '404: Not Found');
  }
  if (u.hostname === 'opendata.rdw.nl' && /^\/resource\//.test(u.pathname)) {
    const id = /resource\/([a-z0-9-]+)\.json/.exec(u.pathname)[1];
    const veld = u.searchParams.get('$group');
    return antw(200, ((wereld.rdwWaarden[id] || {})[veld] || []).map((w) => ({ [veld]: w, count: '1' })));
  }
  if (u.hostname === 'opendata.rdw.nl') {
    const id = /views\/([a-z0-9-]+)\.json/.exec(u.pathname)[1];
    return antw(200, { id, rowsUpdatedAt: wereld.rdwBij, columns: wereld.rdwKol[id].map((f) => ({ fieldName: f })) });
  }
  if (u.hostname === 'vpic.nhtsa.dot.gov') {
    return antw(200, { Count: 3, Results: Object.keys(wereld.nhtsa).map((k) => ({ Variable: k, Value: wereld.nhtsa[k] })) });
  }
  return antw(404, 'onbekende host');
}

const db = new DatabaseSync(':memory:');
db.exec(schemaTekst);
db.prepare("INSERT INTO kp_pid_bib (id, merk, model, code, ecu, naam, formule, bron, url, aangemaakt) VALUES (?,?,?,?,?,?,?,?,?,?)")
  .run('b1', 'kia', 'niro', '220101', '7E4', 'Accu', 'A', 'obdb', 'https://github.com/OBDb/Kia-Niro', '2026-10-16');
db.prepare("INSERT INTO kp_pid_bib (id, merk, model, code, ecu, naam, formule, bron, url, aangemaakt) VALUES (?,?,?,?,?,?,?,?,?,?)")
  .run('b2', 'x', 'y', '220102', '7E0', 'Kwaad', 'A', 'obdb', 'https://github.com/OBDb/../../evil', '2026-10-16');
db.prepare("INSERT INTO kp_pid_bib (id, merk, model, code, ecu, naam, formule, bron, url, aangemaakt) VALUES (?,?,?,?,?,?,?,?,?,?)")
  .run('b3', 'x', 'y', '220103', '7E0', 'Forum', 'A', 'online', 'https://forum.voorbeeld.nl/x', '2026-10-16');
const env = { LOGDB: maakD1(db), ADMIN_TOKEN: 'geheim' };

const W = new Function('fetch', 'crypto', 'TextEncoder', 'AbortController', 'setTimeout', 'clearTimeout', 'console',
  `const __name = (f) => f;
   const json = (o, s = 200) => ({ status: s, body: o });
   const adminOnly = (req) => req.headers.get('X-Admin-Token') === 'geheim';
   const adminWriteLimited = async () => ({ limited: false });
   const rateLimitResponse = () => ({ status: 429 });
   ${src}
   return { bronnenControleren, handleAdminBronnen, bronUitslag, bronVergelijk, BRON_STAND_SCHEMA, BRON_TRAAG_MS };`
)(nepFetch, globalThis.crypto, TextEncoder, AbortController, setTimeout, clearTimeout, { log() {}, warn() {}, error() {} });

const per = (u) => Object.fromEntries(u.bronnen.map((x) => [x.sleutel, x]));
const verzoek = (methode, token) => ({ method: methode, headers: new Map([['X-Admin-Token', token], ['CF-Connecting-IP', '1.1.1.1']]) });

(async () => {
  console.log('\n1. Het schema in worker.js is dat van schema.sql');
  t('BRON_STAND_SCHEMA staat letterlijk in schema.sql', schemaTekst.indexOf(W.BRON_STAND_SCHEMA + ';') >= 0);

  console.log('\n2. Eerste meting: alles gezond, niets "nieuw"');
  let u = await W.bronnenControleren(env);
  let p = per(u);
  t('negen bronnen: OBDb, CX-5, Niro uit de bibliotheek, vijf RDW, NHTSA', Object.keys(p).sort().join(',') === 'nhtsa,obdb,obdb:Kia-Niro,obdb:Mazda-CX-5,rdw:8ys7-d773,rdw:9ihi-jgpf,rdw:j9yg-7rg9,rdw:m9d7-ebf2,rdw:t49b-isb7', Object.keys(p).join(','));
  t('een url met ../ uit de bibliotheek wordt geen aanvraag', !aanvragen.some((x) => /evil/.test(x)), aanvragen.join(' '));
  t('alles gezond', u.samenvatting.gezond === 9 && u.samenvatting.kapot === 0, JSON.stringify(u.samenvatting));
  t('de woordenlijst staat in het detail', /tellerstandoordeel: Geen oordeel, Logisch/.test(p['rdw:m9d7-ebf2'].detail) && /code_status: O, P/.test(p['rdw:t49b-isb7'].detail), p['rdw:m9d7-ebf2'].detail + ' | ' + p['rdw:t49b-isb7'].detail);
  t('de eerste meting is geen update', u.samenvatting.nieuw === 0 && u.bronnen.every((x) => x.eerste), JSON.stringify(u.bronnen.map((x) => [x.sleutel, x.nieuw, x.eerste])));
  t('OBDb-bestand telt commando\'s en signalen', /1 commando's, 2 signalen/.test(p['obdb:Mazda-CX-5'].detail), p['obdb:Mazda-CX-5'].detail);
  t('… en draagt de pushdatum uit de organisatielijst', p['obdb:Mazda-CX-5'].versie === '2026-10-15T10:00:00Z', p['obdb:Mazda-CX-5'].versie);
  t('RDW: bijgewerkt-datum uit rowsUpdatedAt', p['rdw:m9d7-ebf2'].versie === new Date(1760000000e3).toISOString(), p['rdw:m9d7-ebf2'].versie);

  console.log('\n3. Tweede meting: het CX-5-bestand is veranderd, de rest niet');
  const v0 = db.prepare("SELECT vingerafdruk FROM bron_stand WHERE sleutel = 'obdb:Mazda-CX-5'").get().vingerafdruk;
  wereld.obdb['Mazda-CX-5'] = JSON.stringify({ commands: [{ cmd: { 22: 'DD01' }, signals: [{ id: 'A' }, { id: 'B' }] }, { cmd: { 22: 'DD02' }, signals: [{ id: 'SOC' }] }] });
  u = await W.bronnenControleren(env); p = per(u);
  t('CX-5 is "nieuw", met de datum van deze controle', p['obdb:Mazda-CX-5'].nieuw === true && p['obdb:Mazda-CX-5'].gewijzigd === u.gecontroleerd, JSON.stringify(p['obdb:Mazda-CX-5']));
  t('… en alleen die', u.samenvatting.nieuw === 1, JSON.stringify(u.bronnen.filter((x) => x.nieuw).map((x) => x.sleutel)));
  t('de vingerafdruk in D1 is bijgewerkt', db.prepare("SELECT vingerafdruk FROM bron_stand WHERE sleutel = 'obdb:Mazda-CX-5'").get().vingerafdruk !== v0);

  console.log('\n4. Een kolom die de app leest is weg bij de RDW');
  wereld.rdwKol['8ys7-d773'] = RDW_KOL['8ys7-d773'].filter((k) => k !== 'nettomaximumvermogen');
  u = await W.bronnenControleren(env); p = per(u);
  t('dataset 8ys7-d773 is kapot, met de kolom erbij', p['rdw:8ys7-d773'].status === 'kapot' && /nettomaximumvermogen/.test(p['rdw:8ys7-d773'].detail), JSON.stringify(p['rdw:8ys7-d773']));
  t('… ook al gaf hij HTTP 200', p['rdw:8ys7-d773'].http === 200);
  t('de andere RDW-dataset blijft gezond', p['rdw:m9d7-ebf2'].status === 'gezond');
  wereld.rdwKol['8ys7-d773'] = RDW_KOL['8ys7-d773'].slice();

  console.log('\n4b. Een waarde die de app niet kent (zo ging "herstel gemeld" als open recall door)');
  wereld.rdwWaarden['t49b-isb7'].code_status = ['O', 'P', 'X'];
  u = await W.bronnenControleren(env); p = per(u);
  t('code_status met een nieuwe waarde: kapot, met de waarde erbij', p['rdw:t49b-isb7'].status === 'kapot' && /niet kent: X/.test(p['rdw:t49b-isb7'].detail), JSON.stringify(p['rdw:t49b-isb7']));
  wereld.rdwWaarden['t49b-isb7'].code_status = ['O', 'P'];
  u = await W.bronnenControleren(env); p = per(u);
  t('terug naar O en P: weer gezond', p['rdw:t49b-isb7'].status === 'gezond', JSON.stringify(p['rdw:t49b-isb7']));

  console.log('\n5. GitHub laat ons even niet');
  wereld.orgStatus = 403;
  u = await W.bronnenControleren(env); p = per(u);
  t('de organisatie heet "beperkt", niet "kapot"', p.obdb.status === 'beperkt' && /rate limit/.test(p.obdb.detail), JSON.stringify(p.obdb));
  t('de bestanden zelf worden nog wel gemeten', p['obdb:Mazda-CX-5'].status === 'gezond');
  t('zonder lijst geen update gemeld voor de organisatie', p.obdb.nieuw === false);
  wereld.orgStatus = 200;

  console.log('\n6. NHTSA onbereikbaar, daarna terug: geen schijn-update');
  wereld.onbereikbaar['vpic.nhtsa.dot.gov'] = true;
  u = await W.bronnenControleren(env); p = per(u);
  t('onbereikbaar = kapot, met de reden', p.nhtsa.status === 'kapot' && /ENOTFOUND/.test(p.nhtsa.detail), JSON.stringify(p.nhtsa));
  t('de oude vingerafdruk blijft in D1 staan', !!db.prepare("SELECT vingerafdruk FROM bron_stand WHERE sleutel = 'nhtsa'").get().vingerafdruk);
  delete wereld.onbereikbaar['vpic.nhtsa.dot.gov'];
  u = await W.bronnenControleren(env); p = per(u);
  t('terug en ongewijzigd: gezond en níet nieuw', p.nhtsa.status === 'gezond' && p.nhtsa.nieuw === false, JSON.stringify(p.nhtsa));

  console.log('\n7. NHTSA antwoordt, maar met iets anders');
  wereld.nhtsa.Make = '';
  u = await W.bronnenControleren(env); p = per(u);
  t('de voorbeeld-VIN geeft geen Honda: kapot', p.nhtsa.status === 'kapot' && /Honda 2003/.test(p.nhtsa.detail), JSON.stringify(p.nhtsa));
  wereld.nhtsa.Make = 'HONDA';

  console.log('\n8. Traag en verdwenen');
  const traag = W.bronUitslag('x', 'x', '', '', { http: 200, ms: W.BRON_TRAAG_MS + 1 }, {});
  t('boven de grens is traag', traag.status === 'traag');
  t('een uitslag die al kapot is blijft kapot, ook als hij traag was', W.bronUitslag('x', 'x', '', '', { http: 200, ms: 9e3 }, { status: 'kapot' }).status === 'kapot');
  delete wereld.obdb['Kia-Niro'];
  u = await W.bronnenControleren(env); p = per(u);
  t('een OBDb-bestand dat 404 geeft: kapot, met hernoemd erbij', p['obdb:Kia-Niro'].status === 'kapot' && /hernoemd/.test(p['obdb:Kia-Niro'].detail), JSON.stringify(p['obdb:Kia-Niro']));

  console.log('\n9. De route');
  const zonder = await W.handleAdminBronnen(verzoek('GET', 'fout'), env);
  t('zonder geldige token: 403', zonder.status === 403);
  const n0 = aanvragen.length;
  const stand = await W.handleAdminBronnen(verzoek('GET', 'geheim'), env);
  t('GET geeft de stand uit D1', stand.status === 200 && stand.body.bronnen.length === 9, JSON.stringify(stand.body).slice(0, 200));
  t('… zonder één aanvraag naar buiten', aanvragen.length === n0, aanvragen.slice(n0).join(' '));
  const post = await W.handleAdminBronnen(verzoek('POST', 'geheim'), env);
  t('POST controleert echt', post.status === 200 && post.body.samenvatting && aanvragen.length > n0);

  console.log('\n' + ok + ' goed, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('  FOUT  test brak af — ' + (e && e.stack || e)); process.exit(1); });
