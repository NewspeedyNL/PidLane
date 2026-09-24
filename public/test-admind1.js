// ══════════════════════════════════════════════════════════════════
// test-admind1.js — /admin/d1: overzicht, rit, SQL-console, meetopdrachten
// ──────────────────────────────────────────────────────────────────
// WAAROM APART VAN test-adminbron-d1.js. Die test gaat over één bron als
// lijst (/admin/tabel). Dit gaat over de database als geheel, en over twee
// dingen met een eigen gevaar:
//   - de SQL-console belooft alleen te lezen. Die belofte rust op twee
//     lagen, en elke laag wordt hier apart onderuitgehaald om te zien dat de
//     andere dan nog houdt;
//   - een meetopdracht aanzetten zet de rest uit. Op 22-09-2026 stonden er
//     negen aan en won de verkeerde (schema.sql). De scherpste toets is dus
//     niet "staat er één aan" maar "krijgt de APP daarna deze", en daarvoor
//     wordt de echte leesroute van de app uit worker.js geknipt.
//
// DE NEP-D1 IS ECHTE SQLITE uit schema.sql, net als in test-adminbron-d1.js:
// een zelfgebouwde nabouw zou accepteren wat ík acceptabel vind.
//
// Draaien vanuit public/:  node test-admind1.js   (exit 0 = goed)
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

function knip(vanAnker, totAnker, wat) {
  const a = bron.indexOf(vanAnker);
  const b = bron.indexOf(totAnker);
  if (a < 0 || b < 0 || b < a) {
    console.error('FOUT: ' + wat + ' niet gevonden in worker.js — hernoemd of verbouwd.');
    process.exit(1);
  }
  return bron.slice(a, b);
}
// Van de adminbronnen (d1Id staat daar) tot en met de nieuwe route.
const src = knip('var ADMIN_BRONNEN = {', '__name(handleAdminD1Post', 'het /admin/d1-blok');
const kolSrc = knip('var _d1Kolommen = ', '__name(d1Kolommen, "d1Kolommen");', 'd1Kolommen()');
// De leesroute van de app. Niet nagebouwd: de vraag is wat de APP krijgt.
const appSrc = knip('async function handleOpdracht(', '__name(handleOpdracht, "handleOpdracht");', 'handleOpdracht()');

/* Het D1-oppervlak dat deze routes raken: prepare/bind/all/first/run en
   batch(). batch() draait in één transactie, zoals D1 belooft. */
function maakD1(db, staat) {
  const stmt = (sql, args) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    all() { staat.sqls.push(sql); return { results: db.prepare(sql).all(...args) }; },
    first() { staat.sqls.push(sql); return db.prepare(sql).get(...args) || null; },
    run() {
      staat.sqls.push(sql);
      const r = db.prepare(sql).run(...args);
      return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    }
  });
  return {
    prepare: (sql) => stmt(sql, []),
    batch(lijst) {
      db.exec('BEGIN');
      try {
        const uit = lijst.map((s) => s.run());
        db.exec('COMMIT');
        return uit;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  };
}

function bouw(opties) {
  const o = opties || {};
  const db = new DatabaseSync(':memory:');
  db.exec(schemaTekst);
  if (o.zonderOpdrachten) db.exec('DROP TABLE meetopdrachten');
  const staat = { sqls: [] };
  const kolBlok = new Function(kolSrc + '\nreturn { d1Kolommen, D1_NAAM_OK };')();
  const omg = {
    adminOnly: () => o.admin !== false,
    appTokenOk: async () => true,
    json: (body, status) => ({ body, status: status || 200 }),
    resolveBase: () => 'appXXXXXXXXXXXX',
    cfg: (env, k) => 'tbl_' + k,
    klantFout: (e, m) => ({ body: { ok: false, error: m }, status: 500 }),
    adminWriteLimited: async () => ({ limited: !!o.rem }),
    rateLimitResponse: () => ({ body: { ok: false, error: 'rate_limited' }, status: 429 }),
    fetch: async () => { throw new Error('/admin/d1 hoort nooit naar buiten te fetchen'); },
    formuleTekst: (s) => String(s),
    __name: () => { },
    // Allebei uit hetzelfde geknipte stuk: de naamzeef hoort bij de
    // kolomlijst, en het overzicht gebruikt hem voor de tabelnamen.
    d1Kolommen: kolBlok.d1Kolommen,
    D1_NAAM_OK: kolBlok.D1_NAAM_OK
  };
  const code = (o.bewerk ? o.bewerk(src) : src) + '\n' + appSrc;
  const maak = new Function(...Object.keys(omg),
    code + '\nreturn { get: handleAdminD1Get, post: handleAdminD1Post, app: handleOpdracht, probleem: d1SqlProbleem };');
  const api = maak(...Object.values(omg));
  const env = { LOGDB: o.geenDb ? null : maakD1(db, staat) };
  return {
    db, staat, api,
    get: (qs) => api.get({ url: 'https://w.dev/admin/d1?' + qs, headers: { get: () => '' } }, env),
    post: (body) => api.post({ json: async () => body, headers: { get: () => '1.2.3.4' } }, env),
    app: () => api.app({ url: 'https://w.dev/airtable/opdracht', headers: { get: () => '' } }, env)
  };
}

function vulLog(db, rijen) {
  for (const r of rijen) {
    const kol = Object.keys(r);
    db.prepare('INSERT INTO logregels (' + kol.join(',') + ') VALUES (' + kol.map(() => '?').join(',') + ')')
      .run(...kol.map((k) => r[k]));
  }
}
const T = (d) => new Date(Date.now() - d * 864e5).toISOString();
const telLog = (db) => db.prepare('SELECT COUNT(*) AS n FROM logregels').get().n;
const actieve = (db) => db.prepare('SELECT id FROM meetopdrachten WHERE Actief = 1').all().map((x) => x.id);

(async function () {

  // ── 1. de console leest ────────────────────────────────────────
  console.log('\n1. De SQL-console beantwoordt een leesvraag');
  {
    const t = bouw();
    vulLog(t.db, Array.from({ length: 620 }, (_, i) => ({ ontvangen: T(i % 20), Type: i % 7 ? 'info' : 'error', Message: 'regel ' + i })));
    const r = await t.post({ actie: 'sql', sql: "SELECT Type, COUNT(*) AS n FROM logregels GROUP BY Type ORDER BY Type;" });
    toets('een GROUP BY komt terug met kolommen en rijen',
      r.body.ok === true && r.body.kolommen.join() === 'Type,n' && r.body.rijen.length === 2,
      JSON.stringify(r.body).slice(0, 200));
    toets('de puntkomma aan het eind mag', r.body.ok === true);
    const groot = await t.post({ actie: 'sql', sql: 'SELECT * FROM logregels' });
    toets('meer dan 500 rijen wordt afgekapt, en dat staat erbij',
      groot.body.rijen.length === 500 && groot.body.afgekapt === true,
      JSON.stringify({ n: groot.body.rijen && groot.body.rijen.length, af: groot.body.afgekapt }));
    const klein = await t.post({ actie: 'sql', sql: 'SELECT id FROM logregels LIMIT 3' });
    toets('een eigen LIMIT blijft gelden en is niet "afgekapt"',
      klein.body.rijen.length === 3 && klein.body.afgekapt === false, JSON.stringify(klein.body).slice(0, 160));
    const cte = await t.post({ actie: 'sql', sql: "WITH f AS (SELECT * FROM logregels WHERE Type = 'error') SELECT COUNT(*) AS n FROM f" });
    toets('een WITH-vraag werkt', cte.body.ok === true && cte.body.rijen[0].n === 89, JSON.stringify(cte.body));
    const tekst = await t.post({ actie: 'sql', sql: "SELECT COUNT(*) AS n FROM logregels WHERE Message LIKE '%DELETE%' OR Message = 'it''s'" });
    toets('een schrijfwoord in een tekstwaarde telt niet mee', tekst.body.ok === true, JSON.stringify(tekst.body));
    const fn = await t.post({ actie: 'sql', sql: "SELECT replace(Message, 'regel', 'r') AS m FROM logregels LIMIT 1" });
    toets('de tekstfunctie replace() mag', fn.body.ok === true && fn.body.rijen[0].m === 'r 0', JSON.stringify(fn.body));
    const view = await t.post({ actie: 'sql', sql: 'SELECT * FROM sessies' });
    toets('de afgeleide views zijn te bevragen', view.body.ok === true, JSON.stringify(view.body).slice(0, 160));
  }

  // ── 2. laag 1: de tekstkeuring ────────────────────────────────────
  console.log('\n2. Laag 1 — de tekstkeuring weigert elke schrijfvraag');
  {
    const t = bouw();
    const moetWeg = [
      ['DELETE FROM logregels', 'een kale DELETE'],
      ['WITH x AS (SELECT 1) DELETE FROM logregels', 'een DELETE achter een WITH'],
      ['SELECT 1; DELETE FROM logregels', 'een tweede statement na een puntkomma'],
      ["SELECT 1 -- it's\n; DELETE FROM logregels --'", 'een apostrof in commentaar die een DELETE verstopt'],
      ['SELECT 1 /* open', 'een commentaarblok dat niet sluit'],
      ["SELECT 'open", 'een tekstwaarde die niet sluit'],
      ['PRAGMA table_info(logregels)', 'een PRAGMA'],
      ["SELECT * FROM logregels WHERE id IN (SELECT 1) UNION SELECT * FROM logregels; DROP TABLE logregels", 'een DROP achteraan'],
      ['', 'een lege vraag'],
      ['SELECT ' + '1,'.repeat(2500) + '1', 'een vraag van meer dan 4000 tekens']
    ];
    for (const [sql, wat] of moetWeg)
      toets('geweigerd: ' + wat, typeof t.api.probleem(sql) === 'string', JSON.stringify(t.api.probleem(sql)));
    toets('een gewone vraag komt erdoor', t.api.probleem('SELECT * FROM logregels') === null);
    toets('de melding noemt het woord', /DELETE/.test(t.api.probleem('WITH x AS (SELECT 1) DELETE FROM logregels') || ''));
  }

  // ── 3. laag 2: de subquery, met laag 1 uitgezet ─────────────────────
  // De tegenproef van de hele belofte: haal de tekstkeuring weg en kijk of
  // er dan tóch geschreven wordt. Zou dat zo zijn, dan hing "alleen lezen"
  // aan één regexp — en die moet dan beter dan dit bestand kan toetsen.
  console.log('\n3. Laag 2 — zonder de tekstkeuring schrijft de console nog steeds niets');
  {
    const anker = 'const probleem = d1SqlProbleem(sql);';
    toets('het anker van laag 1 bestaat nog', src.indexOf(anker) >= 0, 'zonder anker bewijst dit deel niets');
    const t = bouw({ bewerk: (s) => s.replace(anker, 'const probleem = null;') });
    toets('en laag 1 is werkelijk uit: een DELETE komt langs de keuring',
      (await t.post({ actie: 'sql', sql: 'DELETE FROM logregels' })).body.error !== undefined &&
      !/hoort niet in een leesvraag/.test(JSON.stringify((await t.post({ actie: 'sql', sql: 'DELETE FROM logregels' })).body)));
    vulLog(t.db, [{ ontvangen: T(0), Message: 'blijft' }, { ontvangen: T(0), Message: 'ook' }]);
    for (const sql of ['DELETE FROM logregels', 'WITH x AS (SELECT 1) DELETE FROM logregels',
      'SELECT 1; DELETE FROM logregels', "UPDATE logregels SET Message = 'weg'"]) {
      let r;
      try { r = await t.post({ actie: 'sql', sql }); } catch (e) { r = { body: { ok: false, error: String(e) } }; }
      toets('"' + sql.slice(0, 40) + '" raakt geen rij', telLog(t.db) === 2 &&
        t.db.prepare("SELECT COUNT(*) AS n FROM logregels WHERE Message = 'weg'").get().n === 0,
        JSON.stringify(r.body).slice(0, 160));
    }
  }

  // ── 4. het overzicht ──────────────────────────────────────────────
  console.log('\n4. Het overzicht telt de hele tabel, niet een opgehaalde pagina');
  {
    const t = bouw();
    const rijen = [];
    for (let i = 0; i < 260; i++)
      rijen.push({ ontvangen: T(i % 40), Type: i % 10 === 0 ? 'error' : 'info', Message: i % 10 === 0 ? 'NO DATA op 010C' : 'ok',
        SessionId: i % 3 ? 'rit-' + (i % 5) : null, AppVersion: '6.' + (i % 3), onbekend: i === 7 ? '{"Nieuw":1}' : null,
        Outcome: i === 9 ? 'gesloten' : null });
    vulLog(t.db, rijen);
    t.db.prepare("INSERT INTO meetopdrachten (Naam, Actief, Gewijzigd, Opdracht) VALUES ('a',1,?, '{}'), ('b',1,?, '{}'), ('c',0,?, '{}')")
      .run(T(1), T(0), T(2));
    const r = await t.get('actie=overzicht&dagen=30');
    const L = r.body.log || {};
    toets('totaal is de hele tabel', L.totaal === 260, JSON.stringify(L.totaal));
    const inVenster = t.db.prepare('SELECT COUNT(*) AS n FROM logregels WHERE ontvangen >= ?')
      .get(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).n;
    toets('de dagreeks telt precies wat er in het venster valt',
      (L.perDag || []).reduce((a, x) => a + x[1], 0) === inVenster, (L.perDag || []).length + ' dagen, venster ' + inVenster);
    toets('met de fouten per dag erbij', (L.perDag || []).some((x) => x[2] > 0));
    toets('het vangnet `onbekend` wordt geteld', L.metOnbekend === 1, JSON.stringify(L.metOnbekend));
    toets('regels zonder rit worden geteld', L.zonderRit === rijen.filter((x) => !x.SessionId).length, JSON.stringify(L.zonderRit));
    toets('uitkomsten worden geteld', L.uitkomsten === 1);
    toets('de meest voorkomende fout staat bovenaan', (L.topFouten || [])[0] && L.topFouten[0][0] === 'NO DATA op 010C');
    const namen = (r.body.tabellen || []).map((x) => x.naam);
    toets('tabellen én views staan erin', ['logregels', 'meetopdrachten', 'sessies', 'bevindingen'].every((x) => namen.indexOf(x) >= 0),
      JSON.stringify(namen));
    const lg = (r.body.tabellen || []).find((x) => x.naam === 'logregels') || {};
    toets('met rijen, kolommen en indexen', lg.rijen === 260 && lg.kolommen.length > 20 && lg.indexen.indexOf('idx_log_sessie') >= 0,
      JSON.stringify({ r: lg.rijen, k: (lg.kolommen || []).length, i: lg.indexen }));
    toets('twee actieve opdrachten worden als twee gemeld', r.body.opdrachten && r.body.opdrachten.actief.length === 2,
      JSON.stringify(r.body.opdrachten));
    toets('en er staan geen fouten in', (r.body.fouten || []).length === 0, JSON.stringify(r.body.fouten));
  }
  {
    const t = bouw({ zonderOpdrachten: true });
    vulLog(t.db, [{ ontvangen: T(0), Message: 'x' }]);
    const r = await t.get('actie=overzicht');
    toets('zonder meetopdrachten-tabel blijft het logdeel staan', r.body.ok === true && r.body.log && r.body.log.totaal === 1,
      JSON.stringify(r.body).slice(0, 200));
    toets('en de ontbrekende tabel staat als fout benoemd, niet stil weg',
      (r.body.fouten || []).some((f) => /meetopdrachten/.test(f)), JSON.stringify(r.body.fouten));
  }

  // ── 5. één rit ────────────────────────────────────────────────────
  console.log('\n5. Een rit komt compleet en in ontvangstvolgorde terug');
  {
    const t = bouw();
    vulLog(t.db, [
      { ontvangen: T(0), SessionId: 'rit-A', Message: 'een' },
      { ontvangen: T(0), SessionId: 'rit-B', Message: 'ander' },
      { ontvangen: T(0), SessionId: 'rit-A', Message: 'twee', Type: 'error' },
      { ontvangen: T(0), SessionId: 'rit-A', Message: 'drie' }
    ]);
    const r = await t.get('actie=rit&sessie=rit-A');
    toets('alleen de regels van die rit', r.body.aantal === 3, JSON.stringify(r.body).slice(0, 160));
    toets('in de volgorde waarin ze binnenkwamen', (r.body.rijen || []).map((x) => x.Message).join() === 'een,twee,drie');
    toets('lege kolommen gaan niet mee als null', !('Outcome' in ((r.body.rijen || [])[0] || {})));
    const leeg = await t.get('actie=rit&sessie=');
    toets('zonder SessionId: 400', leeg.status === 400, JSON.stringify(leeg.body));
    const zoek = await t.get('actie=rit&sessie=' + encodeURIComponent("rit-A' OR '1'='1"));
    toets('de SessionId gaat als parameter mee', zoek.body.aantal === 0, JSON.stringify(zoek.body).slice(0, 120));
  }

  // ── 6. meetopdrachten ─────────────────────────────────────────────
  console.log('\n6. Een opdracht aanzetten zet de rest uit — en de app krijgt dan déze');
  {
    const t = bouw();
    t.db.prepare("INSERT INTO meetopdrachten (Naam, Actief, Gewijzigd, Opdracht) VALUES ('oud1',1,?,'{\"schema\":2}'), ('oud2',1,?,'{\"schema\":2}'), ('rust',0,?,'{\"schema\":2}')")
      .run('2026-09-22T10:00:00.000Z', '2026-09-22T10:00:00.000Z', '2026-09-20T10:00:00.000Z');
    // De opdracht die we aanzetten is met opzet de OUDSTE. Wint hij daarna,
    // dan komt dat door de route en niet doordat hij toch al de nieuwste was.
    const r = await t.post({ actie: 'opdracht-activeer', id: 3 });
    toets('activeren slaagt', r.body.ok === true, JSON.stringify(r.body));
    toets('er staat daarna precies één aan', actieve(t.db).join() === '3', JSON.stringify(actieve(t.db)));
    toets('en het antwoord zegt hoeveel er uitgingen', r.body.uitgezet === 2, JSON.stringify(r.body.uitgezet));
    const app = await t.app();
    toets('de leesroute van de app geeft nu déze opdracht', app.body.id === '3' && !app.body.meer, JSON.stringify(app.body).slice(0, 160));

    const nieuw = await t.post({ actie: 'opdracht-nieuw', velden: { Naam: 'MAF warm', Reden: '#232', Opdracht: '{"schema":2}', Actief: true } });
    toets('een nieuwe actieve opdracht krijgt een id', nieuw.body.ok === true && /^\d+$/.test(nieuw.body.id), JSON.stringify(nieuw.body));
    toets('en neemt het over: weer precies één aan', actieve(t.db).join() === nieuw.body.id, JSON.stringify(actieve(t.db)));
    toets('de app volgt', (await t.app()).body.id === nieuw.body.id);

    const stil = await t.post({ actie: 'opdracht-nieuw', velden: { Naam: 'klad', Opdracht: '{}' } });
    toets('een nieuwe zonder Actief blijft uit en laat de actieve staan',
      stil.body.ok === true && actieve(t.db).join() === nieuw.body.id, JSON.stringify(actieve(t.db)));

    const uit = await t.post({ actie: 'opdracht-uit', id: Number(nieuw.body.id) });
    toets('uitzetten laat er nul over', uit.body.ok === true && actieve(t.db).length === 0);
    toets('en de app krijgt dan geen opdracht', (await t.app()).body.opdracht === null);
  }
  {
    const t = bouw();
    t.db.prepare("INSERT INTO meetopdrachten (Naam, Actief, Gewijzigd, Opdracht) VALUES ('a',0,'2026-09-01T00:00:00.000Z','{}')").run();
    const b = await t.post({ actie: 'opdracht-bewaar', id: 1, velden: { Opdracht: '{"schema":2,"naam":"x"}', Notitie: 'eerst koud' } });
    const rij = t.db.prepare('SELECT * FROM meetopdrachten WHERE id = 1').get();
    toets('bewaren schrijft de velden', b.body.ok === true && rij.Notitie === 'eerst koud' && /"x"/.test(rij.Opdracht), JSON.stringify(b.body));
    toets('en zet Gewijzigd zelf — de app kiest op die tijd', rij.Gewijzigd > '2026-09-01T00:00:00.000Z', rij.Gewijzigd);
    for (const [velden, wat] of [
      [{ Actief: 1 }, 'Actief (dan staan er twee aan)'],
      [{ Gewijzigd: '2099-01-01' }, 'Gewijzigd (dan kies je stil welke rijdt)'],
      [{ id: 9 }, 'het id'],
      [{ Opdracht: 'x'.repeat(8193) }, 'een opdracht die de app niet leest (>8192)'],
      [{ Naam: '' }, 'een lege naam']
    ]) {
      const r = await t.post({ actie: 'opdracht-bewaar', id: 1, velden });
      toets('geweigerd bij bewaren: ' + wat, r.status === 400, JSON.stringify(r.body));
    }
    const na = t.db.prepare('SELECT Actief FROM meetopdrachten WHERE id = 1').get();
    toets('en er is niets van doorgekomen', na.Actief === 0);
    const geen = await t.post({ actie: 'opdracht-activeer', id: 99 });
    toets('een onbekend id: 404, niets gewijzigd', geen.status === 404 && actieve(t.db).length === 0, JSON.stringify(geen.body));
    const half = await t.post({ actie: 'opdracht-nieuw', velden: { Naam: 'zonder tekst' } });
    toets('een nieuwe zonder opdrachttekst wordt geweigerd', half.status === 400, JSON.stringify(half.body));
  }

  // ── 7. de poort ───────────────────────────────────────────────────
  console.log('\n7. Zonder admintoken of zonder database: niets');
  {
    const t = bouw({ admin: false });
    toets('GET zonder token: 403', (await t.get('actie=overzicht')).status === 403);
    toets('POST zonder token: 403', (await t.post({ actie: 'sql', sql: 'SELECT 1' })).status === 403);
    toets('en er is geen query gedraaid', t.staat.sqls.length === 0, JSON.stringify(t.staat.sqls));
    const r = bouw({ rem: true });
    toets('de schrijfrem geldt ook voor de console', (await r.post({ actie: 'sql', sql: 'SELECT 1' })).status === 429);
    const g = bouw({ geenDb: true });
    toets('zonder D1-binding: 500 no_logdb', (await g.get('actie=overzicht')).body.error === 'no_logdb');
  }

  console.log('\n' + (fout ? fout + ' FOUT(en) van ' + n : 'Alles goed — ' + n + ' controles'));
  process.exit(fout ? 1 : 0);
})().catch((e) => {
  console.log('  FOUT test brak af — ' + (e && e.stack || e));
  process.exit(1);
});
