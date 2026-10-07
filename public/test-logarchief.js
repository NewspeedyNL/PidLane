// ══════════════════════════════════════════════════════════════════
// test-logarchief.js — logregels ouder dan de termijn: samenvatten, dan wissen
// ──────────────────────────────────────────────────────────────────
// WAAROM (01-10-2026). De logronde (#260) wiste oude regels kaal. Nu komt er
// eerst per rit één rij in log_archief, en pas dan gaan de regels weg. Wat
// hier onderscheiden moet worden:
//   1. proefdraaien verandert niets, en zegt wel wat er zou gebeuren
//   2. archiveren: per rit één rij met de goede aantallen; jonger dan de
//      termijn blijft staan, uitkomsten blijven staan, geen e-mail of VIN
//   3. een rit over de grens heen komt in twee rondes binnen, en telt dan
//      niets dubbel — ook de uitkomsten niet, die elke ronde terugkomen
//   4. alles of niets: faalt het archief, dan is er niets gewist
//   5. in stukken: een achterstand gaat over meer rondes en klopt dan nog
//   6. regels zonder rit worden per dag gebundeld
//   7. de routes in /admin/d1: proef is de standaard, archief en rit lezen
//   8. de cron zonder LOG_BEWAARDAGEN doet niets
//   9. schema.sql en LOG_ARCHIEF_SCHEMA zijn dezelfde tekst
//
// DE NEP-D1 IS ECHTE SQLITE uit schema.sql, zoals in test-admind1.js.
//
// Draaien vanuit public/:  node test-logarchief.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
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
const schemaTekst = fs.readFileSync(path.join(wortel, 'schema.sql'), 'utf8');
function knip(van, tot, wat) {
  const a = bron.indexOf(van), b = bron.indexOf(tot, a < 0 ? 0 : a);
  if (a < 0 || b < 0) { console.error('FOUT: ' + wat + ' niet gevonden in worker.js — hernoemd of verbouwd.'); process.exit(1); }
  return bron.slice(a, b);
}
const archSrc = knip('// ── Het logarchief (01-10-2026)', '__name(logRondeOpruimen, "logRondeOpruimen");', 'logArchiveren() en de logronde');
const routeSrc = knip('var ADMIN_BRONNEN = {', '__name(handleAdminD1Post', 'het /admin/d1-blok');
const kolSrc = knip('var _d1Kolommen = ', '__name(d1Kolommen, "d1Kolommen");', 'd1Kolommen()');

function maakD1(db) {
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    all() { return { results: db.prepare(sql).all(...args) }; },
    first() { return db.prepare(sql).get(...args) || null; },
    run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }
  });
  return {
    prepare: (sql) => stmt(sql, []),
    batch(lijst) {
      db.exec('BEGIN');
      try { const uit = lijst.map((s) => s.run()); db.exec('COMMIT'); return uit; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  };
}

class VasteDatum extends Date {
  constructor(...a) { if (a.length) super(...a); else super(NU.getTime()); }
  static now() { return NU.getTime(); }
}

function bouw(opties) {
  const o = opties || {};
  const db = new DatabaseSync(':memory:');
  db.exec(schemaTekst);
  const kolBlok = new Function(kolSrc + '\nreturn { d1Kolommen, D1_NAAM_OK };')();
  const logs = [];
  const omg = {
    adminOnly: () => true,
    json: (body, status) => ({ body, status: status || 200 }),
    adminWriteLimited: async () => ({ limited: false }),
    rateLimitResponse: () => ({ body: { ok: false }, status: 429 }),
    resolveBase: () => 'app', cfg: () => 'tbl', klantFout: () => ({}), appTokenOk: async () => true,
    formuleTekst: (s) => String(s),
    fetch: async () => { throw new Error('hoort niet naar buiten'); },
    console: { log: (m) => logs.push(String(m)), warn: (m) => logs.push(String(m)), error: (m) => logs.push('ERR ' + m) },
    __name: () => {},
    // De klok van de test, niet die van de dag (07-10-2026). Deel 7 en 8 gaan
    // via de route en de cron, en die geven geen `nu` mee: dan rekent de
    // Worker met `new Date()`. De rit "van gisteren" lag zo vanaf 07-10 05:00
    // ook buiten de 7 dagen en de test werd rood op elke branch, zonder dat
    // er iets aan de Worker veranderd was.
    Date: VasteDatum,
    d1Kolommen: kolBlok.d1Kolommen, D1_NAAM_OK: kolBlok.D1_NAAM_OK
  };
  const code = (o.bewerk ? o.bewerk(archSrc) : archSrc) + '\n' + routeSrc;
  const api = new Function(...Object.keys(omg), code +
    '\nreturn { logArchiveren, logRondeOpruimen, get: handleAdminD1Get, post: handleAdminD1Post, SCHEMA: LOG_ARCHIEF_SCHEMA };')(...Object.values(omg));
  const d1 = maakD1(db);
  const env = { LOGDB: d1 };
  return {
    db, d1, api, logs, env,
    arch: (opt) => api.logArchiveren(d1, opt),
    get: (qs) => api.get({ url: 'https://w.dev/admin/d1?' + qs, headers: { get: () => '' } }, env),
    post: (body) => api.post({ json: async () => body, headers: { get: () => '1.2.3.4' } }, env)
  };
}

const NU = new Date('2026-10-01T03:00:00Z');
const T = (dagen, uur) => new Date(NU.getTime() - dagen * 864e5 + (uur || 0) * 36e5).toISOString();
function vul(db, rijen) {
  for (const r of rijen) {
    const kol = Object.keys(r);
    db.prepare('INSERT INTO logregels (' + kol.join(',') + ') VALUES (' + kol.map(() => '?').join(',') + ')').run(...kol.map((k) => r[k]));
  }
}
const tel = (db, waar) => db.prepare('SELECT COUNT(*) AS n FROM logregels' + (waar ? ' WHERE ' + waar : '')).get().n;
const archRij = (db, k) => db.prepare('SELECT * FROM log_archief WHERE sleutel = ?').get(k);

// Een rit van tien dagen geleden: 6 regels, waarvan 2 dezelfde fout, 1 LET OP,
// 1 uitkomst; plus een rit van gisteren die moet blijven staan.
function standaard(db) {
  const basis = { Merk: 'MAZDA', Year: '2018', AppVersion: '6.6', Adapter: 'OBDLink MX+', Protocol: 'A6', User: 'jan@voorbeeld.nl', VIN: 'pseudo123', VinHash: 'h', UserId: 'u1', Demo: 0 };
  vul(db, [
    Object.assign({ ontvangen: T(10), SessionId: 'R1', Type: 'info', RecordType: 'testrun', Message: 'start' }, basis),
    Object.assign({ ontvangen: T(10, 1), SessionId: 'R1', Type: 'error', RecordType: 'testrun', Message: 'BUS FOUT' }, basis),
    Object.assign({ ontvangen: T(10, 2), SessionId: 'R1', Type: 'error', RecordType: 'testrun', Message: 'BUS FOUT' }, basis),
    Object.assign({ ontvangen: T(10, 3), SessionId: 'R1', Type: 'opvallend', RecordType: 'meting', Message: 'koelwater hoog' }, basis),
    Object.assign({ ontvangen: T(10, 4), SessionId: 'R1', Type: 'info', RecordType: 'meting', Message: 'x' }, basis),
    Object.assign({ ontvangen: T(10, 5), SessionId: 'R1', Type: 'ok', RecordType: 'testrun', Message: 'uitkomst', Outcome: 'gesloten', Repro: '#226 #64' }, basis),
    Object.assign({ ontvangen: T(1), SessionId: 'R2', Type: 'info', RecordType: 'testrun', Message: 'vers' }, basis)
  ]);
}

(async function () {
  console.log('\n1. Proefdraaien verandert niets');
  {
    const t = bouw(); standaard(t.db);
    const u = await t.arch({ dagen: 7, proef: true, nu: NU });
    toets('zegt wat er zou gebeuren: 5 regels, 1 rit, 1 uitkomst blijft', u.regels === 5 && u.groepen === 1 && u.behouden === 1 && u.gewist === 0, JSON.stringify(u).slice(0, 200));
    toets('en er is niets gewist of gearchiveerd', tel(t.db) === 7 && t.db.prepare('SELECT COUNT(*) AS n FROM log_archief').get().n === 0);
  }

  console.log('\n2. Archiveren: één rij per rit, de goede aantallen');
  {
    const t = bouw(); standaard(t.db);
    const u = await t.arch({ dagen: 7, nu: NU });
    toets('5 regels gewist, 1 archiefrij', u.gewist === 5 && u.groepen === 1, JSON.stringify(u).slice(0, 200));
    toets('de uitkomst en de rit van gisteren staan nog', tel(t.db) === 2 && tel(t.db, "Outcome = 'gesloten'") === 1 && tel(t.db, "SessionId = 'R2'") === 1);
    const a = archRij(t.db, 'R1');
    toets('regels 5, fouten 2, LET OP 1, uitkomsten 1', a && a.regels === 5 && a.fouten === 2 && a.opvallend === 1 && a.uitkomsten === 1, JSON.stringify(a));
    const so = a && JSON.parse(a.soorten);
    toets('soorten geteld', so && so.testrun === 3 && so.meting === 2 && Object.keys(so).length === 2, a && a.soorten);
    const b = a && JSON.parse(a.bevindingen);
    toets('de dubbele fout is één bevinding met aantal 2', b && b.lijst[0][0] === 'error' && b.lijst[0][1] === 'BUS FOUT' && b.lijst[0][2] === 2 && b.lijst.length === 2, a && a.bevindingen);
    toets('issues uit de uitkomst, gesplitst', a && a.issues === '#226 #64', a && a.issues);
    toets('tijdvak en meta', a && a.begonnen === T(10) && a.geeindigd === T(10, 5) && a.merk === 'MAZDA' && a.versie === '6.6' && a.dag === T(10).slice(0, 10), JSON.stringify(a));
    const tekst = JSON.stringify(a);
    toets('geen e-mail, VIN of gebruikers-id in het archief', !/jan@voorbeeld|pseudo123|"u1"/.test(tekst), tekst);
  }

  console.log('\n3. Een rit over de grens: twee rondes, niets dubbel');
  {
    const t = bouw();
    vul(t.db, [
      { ontvangen: T(9), SessionId: 'R3', Type: 'error', Message: 'A' },
      { ontvangen: T(9, 1), SessionId: 'R3', Type: 'ok', Message: 'u', Outcome: 'bevinding', Repro: '#9' },
      { ontvangen: T(6), SessionId: 'R3', Type: 'error', Message: 'A' },
      { ontvangen: T(6, 1), SessionId: 'R3', Type: 'info', Message: 'b', RecordType: 'meting' }
    ]);
    await t.arch({ dagen: 7, nu: NU });
    const na1 = archRij(t.db, 'R3');
    toets('eerste ronde: 1 regel', na1 && na1.regels === 1 && na1.fouten === 1 && na1.uitkomsten === 1, JSON.stringify(na1));
    const later = new Date(NU.getTime() + 3 * 864e5);
    await t.arch({ dagen: 7, nu: later });
    const a = archRij(t.db, 'R3');
    toets('tweede ronde: 3 regels, 2 fouten, nog steeds 1 uitkomst', a && a.regels === 3 && a.fouten === 2 && a.uitkomsten === 1, JSON.stringify(a));
    toets('de bevinding telt op tot 2, geen tweede regel', a && JSON.parse(a.bevindingen).lijst.length === 1 && JSON.parse(a.bevindingen).lijst[0][2] === 2, a && a.bevindingen);
    toets('het tijdvak loopt van de eerste tot de laatste', a && a.begonnen === T(9) && a.geeindigd === T(6, 1));
    toets('alleen de uitkomst staat nog in logregels', tel(t.db) === 1 && tel(t.db, "Outcome = 'bevinding'") === 1);
    await t.arch({ dagen: 7, nu: later });
    toets('een derde ronde zonder nieuwe regels verandert niets', JSON.stringify(archRij(t.db, 'R3')) === JSON.stringify(a));
  }

  console.log('\n4. Alles of niets');
  {
    const t = bouw(); standaard(t.db);
    await t.arch({ dagen: 7, proef: true, nu: NU });   // maakt de tabel
    t.db.exec("CREATE TRIGGER vol BEFORE INSERT ON log_archief BEGIN SELECT RAISE(ABORT, 'archief vol'); END");
    let gooide = false;
    try { await t.arch({ dagen: 7, nu: NU }); } catch (e) { gooide = /archief vol/.test(e.message); }
    toets('de fout komt naar boven', gooide);
    toets('en er is geen regel gewist', tel(t.db) === 7);
  }
  {
    // Andersom: het archief lukt, het wissen niet. Dan hoort ook de archiefrij
    // terug te gaan — anders telt de volgende ronde dezelfde regels nog eens.
    const t = bouw(); standaard(t.db);
    t.db.exec("CREATE TRIGGER nietwissen BEFORE DELETE ON logregels BEGIN SELECT RAISE(ABORT, 'wissen geweigerd'); END");
    let gooide = false;
    try { await t.arch({ dagen: 7, nu: NU }); } catch (e) { gooide = /wissen geweigerd/.test(e.message); }
    toets('faalt het wissen, dan komt de fout naar boven', gooide);
    toets('en staat er ook geen archiefrij (één transactie)', t.db.prepare('SELECT COUNT(*) AS n FROM log_archief').get().n === 0 && tel(t.db) === 7);
  }

  console.log('\n5. In stukken');
  {
    const t = bouw({ bewerk: (s) => s.replace('var LOG_ARCHIEF_STUK = 5000;', 'var LOG_ARCHIEF_STUK = 4;') });
    vul(t.db, Array.from({ length: 10 }, (_, i) => ({ ontvangen: T(20 - i), SessionId: 'R4', Type: i % 2 ? 'error' : 'info', Message: 'm' + (i % 3) })));
    const u1 = await t.arch({ dagen: 7, nu: NU });
    toets('eerste ronde: 4 gewist, 6 te gaan', u1.gewist === 4 && u1.rest === 6, JSON.stringify(u1).slice(0, 160));
    await t.arch({ dagen: 7, nu: NU });
    const u3 = await t.arch({ dagen: 7, nu: NU });
    const a = archRij(t.db, 'R4');
    toets('na drie rondes: alles gearchiveerd, 10 regels, 5 fouten', u3.rest === 0 && tel(t.db) === 0 && a.regels === 10 && a.fouten === 5, JSON.stringify(a));
  }

  console.log('\n6. Regels zonder rit: per dag');
  {
    const t = bouw();
    vul(t.db, [
      { ontvangen: T(12), Type: 'info', Message: 'opstart' },
      { ontvangen: T(12, 2), SessionId: '', Type: 'bug', Message: 'melding' },
      { ontvangen: T(11), Type: 'info', Message: 'opstart' }
    ]);
    await t.arch({ dagen: 7, nu: NU });
    const d1 = archRij(t.db, 'dag:' + T(12).slice(0, 10));
    toets('twee dagen, twee rijen', t.db.prepare('SELECT COUNT(*) AS n FROM log_archief').get().n === 2);
    toets('de dag met de bugmelding telt 2 regels en 1 bug', d1 && d1.regels === 2 && d1.bugs === 1 && d1.SessionId === null, JSON.stringify(d1));
  }

  console.log('\n7. De routes in /admin/d1');
  {
    const t = bouw(); standaard(t.db);
    const p = await t.post({ actie: 'archiveer', dagen: 7 });
    toets('zonder proef:false is het een proef', p.body.ok && p.body.proef === true && tel(t.db) === 7, JSON.stringify(p.body).slice(0, 160));
    const echt = await t.post({ actie: 'archiveer', dagen: 7, proef: false });
    toets('met proef:false wordt er gearchiveerd', echt.body.ok && echt.body.gewist === 5 && tel(t.db) === 2, JSON.stringify(echt.body).slice(0, 160));
    const fout0 = await t.post({ actie: 'archiveer', dagen: 0, proef: false });
    toets('een termijn van 0 dagen wordt geweigerd', fout0.status === 400 && tel(t.db) === 2);
    const g = await t.get('actie=archief');
    toets('het archief geeft rijen en totalen', g.body.ok && g.body.rijen.length === 1 && g.body.totaal.regels === 5, JSON.stringify(g.body).slice(0, 200));
    const r = await t.get('actie=rit&sessie=R1');
    toets('een gearchiveerde rit geeft zijn archiefrij mee', r.body.ok && r.body.archief && r.body.archief.regels === 5 && r.body.rijen.length === 1, JSON.stringify(r.body).slice(0, 200));
  }

  console.log('\n8. De cron');
  {
    const t = bouw(); standaard(t.db);
    await t.api.logRondeOpruimen({ LOGDB: t.d1 });
    toets('zonder LOG_BEWAARDAGEN: niets, en dat staat in de log', tel(t.db) === 7 && t.logs.some((l) => /geen LOG_BEWAARDAGEN/.test(l)));
    await t.api.logRondeOpruimen({ LOGDB: t.d1, LOG_BEWAARDAGEN: '7' });
    toets('met 7: gearchiveerd en gewist, met het aantal in de log', tel(t.db) < 7 && archRij(t.db, 'R1') && t.logs.some((l) => /gearchiveerd in 1 archiefrij/.test(l)), t.logs.join(' | '));
  }

  console.log('\n9. schema.sql en de Worker hebben hetzelfde schema');
  {
    const t = bouw();
    toets('LOG_ARCHIEF_SCHEMA staat letterlijk in schema.sql', schemaTekst.indexOf(t.api.SCHEMA + ';') >= 0);
  }

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('test-logarchief brak af: ' + (e && e.stack || e)); process.exit(1); });
