// ══════════════════════════════════════════════════════════════════
// test-adminbron-d1.js — de D1-kant van /admin/tabel (#262, #260)
// ──────────────────────────────────────────────────────────────────
// WAAROM APART VAN test-adminbron.js. Die test gaat over de Airtable-motor:
// filterByFormula, offsets, de escaping van een apostrof. Dit gaat over de
// SQL-motor eronder, met heel andere gevaren — een kolomnaam die in een
// query belandt, een bulkwis zonder terugweg, een afgeleide view die je per
// ongeluk kunt bewerken. Eén test voor allebei zou over geen van beide meer
// iets scherps kunnen zeggen.
//
// DE NEP-D1 IS ECHTE SQLITE uit schema.sql. Een zelfgebouwde nabouw zou
// accepteren wat ík acceptabel vind; nu valt een query die niet tegen het
// echte schema past hier om, en bewijst een SELECT ná een DELETE werkelijk
// dat er rijen weg zijn.
//
// WAT DE SCHERPSTE TOETSEN HIER ZIJN:
//  - een kolomnaam uit het verzoek mag nooit in de SQL komen;
//  - `opruimen` draait proef tenzij je met zoveel woorden anders zegt;
//  - een regel met een Outcome blijft staan — dat is het antwoord op een
//    issue en daar is de rit voor gereden (#257);
//  - een afgeleide view is niet schrijfbaar.
//
// Draaien vanuit public/:  node test-adminbron-d1.js   (exit 0 = goed)
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

const van = bron.indexOf('var ADMIN_BRONNEN = {');
const tot = bron.indexOf('__name(handleAdminTabelPost');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: het adminbrowser-blok is niet gevonden in worker.js.');
  process.exit(1);
}
const src = bron.slice(van, tot);

// d1Kolommen() staat buiten het geknipte blok maar wordt er wél door
// aangeroepen. Niet nabouwen maar dezelfde functie uit worker.js knippen: een
// nagemaakte kolomzeef zou precies het gat verbergen dat hij moet dichten.
const echteD1Kolommen = (() => {
  const a = bron.indexOf('var _d1Kolommen = ');
  const b = bron.indexOf('__name(d1Kolommen, "d1Kolommen");');
  if (a < 0 || b < 0) { console.error('FOUT: d1Kolommen() niet gevonden in worker.js.'); process.exit(1); }
  return bron.slice(a, b) + '\nreturn d1Kolommen;';
})();

/* Het stukje D1-oppervlak dat deze routes aanraken: prepare(), bind(), en
   dan all() / first() / run(). Elke SQL-tekst wordt onthouden, want een deel
   van de toetsen gaat over wat er NIET in die tekst mag staan. */
function maakD1(db, staat) {
  return {
    prepare(sql) {
      staat.sqls.push(sql);
      const uit = (args) => ({
        all() { return { results: db.prepare(sql).all(...args) }; },
        first() { return db.prepare(sql).get(...args) || null; },
        run() { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; }
      });
      return Object.assign(uit([]), { bind: (...args) => uit(args) });
    }
  };
}

function bouw(opties) {
  const o = opties || {};
  const db = new DatabaseSync(':memory:');
  db.exec(schemaTekst);
  const staat = { sqls: [] };
  const omg = {
    adminOnly: () => o.admin !== false,
    json: (body, status) => ({ body, status: status || 200 }),
    resolveBase: () => 'appXXXXXXXXXXXX',
    cfg: (env, k) => 'tbl_' + k,
    klantFout: (e, m) => ({ body: { ok: false, error: m }, status: 500 }),
    adminWriteLimited: async () => ({ limited: false }),
    rateLimitResponse: () => ({ body: { ok: false, error: 'rate' }, status: 429 }),
    fetch: async () => { throw new Error('een D1-bron hoort nooit naar Airtable te fetchen'); },
    formuleTekst: (s) => String(s),
    __name: () => { },
    d1Kolommen: new Function(echteD1Kolommen)()
  };
  const maak = new Function(...Object.keys(omg),
    src + '\nreturn { get: handleAdminTabelGet, post: handleAdminTabelPost, bronnen: ADMIN_BRONNEN };');
  const api = maak(...Object.values(omg));
  const env = { AIRTABLE_TOKEN: 'x', LOGDB: o.geenDb ? null : maakD1(db, staat) };
  return {
    db, staat, api,
    get: (qs) => api.get({ url: 'https://w.dev/admin/tabel?' + qs, headers: { get: () => '' } }, env),
    post: (body) => api.post({ json: async () => body, headers: { get: () => '1.2.3.4' } }, env)
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

(async function () {

  // ── 1. lezen ────────────────────────────────────────────────────
  console.log('\n1. Lezen uit D1, met dezelfde antwoordvorm als Airtable');
  {
    const t = bouw();
    vulLog(t.db, [
      { ontvangen: T(0), Type: 'info', Message: 'eerste', SessionId: 'rit-A' },
      { ontvangen: T(1), Type: 'error', Message: 'tweede', SessionId: 'rit-B' }
    ]);
    const r = await t.get('bron=log');
    toets('een D1-bron levert records', r.body.ok === true && r.body.records.length === 2,
      JSON.stringify(r.body).slice(0, 160));
    toets('en zegt welke motor eronder zit', r.body.motor === 'd1', JSON.stringify(r.body.motor));
    toets('met id, createdTime en fields net als bij Airtable',
      r.body.records[0].id === '1' && !!r.body.records[0].createdTime && !!r.body.records[0].fields.Message,
      JSON.stringify(r.body.records[0]));
    toets('standaard op ontvangen aflopend',
      r.body.records[0].fields.Message === 'eerste' && r.body.gesorteerd === true,
      JSON.stringify(r.body.records.map((x) => x.fields.Message)));
    toets('de kolomkop draagt álle kolommen, ook de lege',
      r.body.velden.indexOf('AiDiagnose') >= 0 && r.body.velden.indexOf('onbekend') >= 0,
      JSON.stringify(r.body.velden).slice(0, 120));
    toets('er is niets naar Airtable gegaan', t.staat.sqls.length > 0);
  }
  {
    const t = bouw({ geenDb: true });
    const r = await t.get('bron=log');
    toets('zonder D1-binding: 500 en geen lege lijst',
      r.status === 500 && r.body.error === 'no_logdb', JSON.stringify(r.body));
  }

  // ── 2. zoeken ───────────────────────────────────────────────────
  console.log('\n2. Zoeken gaat als parameter mee, nooit als tekst in de query');
  {
    const t = bouw();
    vulLog(t.db, [
      { ontvangen: T(0), Type: 'info', Message: 'koelwater 91 graden', SessionId: 'rit-A' },
      { ontvangen: T(1), Type: 'info', Message: 'gaspedaal', SessionId: 'rit-B' }
    ]);
    const r = await t.get('bron=log&q=' + encodeURIComponent('KOELWATER'));
    toets('zoeken vindt ongeacht hoofdletters', r.body.records.length === 1, String(r.body.records.length));
    toets('de zoekterm staat niet in de SQL-tekst',
      !t.staat.sqls.some((s) => /koelwater/i.test(s)), t.staat.sqls.join(' | ').slice(0, 160));
    toets('maar er wordt wél over meerdere velden gezocht',
      /Message/.test(t.staat.sqls.join(' ')) && /SessionId/.test(t.staat.sqls.join(' ')));
  }
  {
    const t = bouw();
    vulLog(t.db, [{ ontvangen: T(0), Type: 'info', Message: '100% gelukt' }, { ontvangen: T(1), Type: 'info', Message: '1000 regels' }]);
    const r = await t.get('bron=log&q=' + encodeURIComponent('100%'));
    toets('een % in de zoekterm is tekst en geen joker', r.body.records.length === 1,
      JSON.stringify(r.body.records.map((x) => x.fields.Message)));
  }
  {
    const t = bouw();
    const r = await t.get('bron=log&q=abc&veld=' + encodeURIComponent('Message); DROP TABLE logregels; --'));
    const nog = t.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='logregels'").get().n;
    toets('een verzonnen veldnaam wordt geweigerd en komt nergens in de SQL',
      r.status === 400 && nog === 1, JSON.stringify(r.body));
  }

  // ── 3. sorteren en pagineren ────────────────────────────────────
  console.log('\n3. Sorteren op een veld dat niet bestaat, en de paginagrens');
  {
    const t = bouw();
    vulLog(t.db, [{ ontvangen: T(0), Type: 'info', Message: 'x' }]);
    const r = await t.get('bron=log&sorteer=BestaatNiet');
    toets('een onbekend sorteerveld geeft de rijen tóch terug',
      r.body.ok === true && r.body.records.length === 1, JSON.stringify(r.body).slice(0, 120));
    toets('met de eerlijke mededeling dat er niet gesorteerd is',
      r.body.gesorteerd === false && r.body.sorteer === '');
    toets('en dat veld staat niet in de query', !/BestaatNiet/.test(t.staat.sqls.join(' ')));
  }
  {
    const t = bouw();
    vulLog(t.db, Array.from({ length: 7 }, (_, i) => ({ ontvangen: T(i), Type: 'info', Message: 'r' + i })));
    const r = await t.get('bron=log&limiet=3');
    toets('de limiet wordt gerespecteerd', r.body.records.length === 3, String(r.body.records.length));
    toets('en er staat een offset klaar voor de volgende pagina', r.body.offset === '3', r.body.offset);
    const r2 = await t.get('bron=log&limiet=3&offset=6');
    toets('de laatste pagina meldt geen volgende', r2.body.records.length === 1 && r2.body.offset === '',
      JSON.stringify({ n: r2.body.records.length, o: r2.body.offset }));
  }

  // ── 4. afgeleide views ──────────────────────────────────────────
  console.log('\n4. De afgeleide bronnen: berekend, en niet te bewerken');
  {
    const t = bouw();
    vulLog(t.db, [
      { ontvangen: T(0), Type: 'info', Message: 'a', SessionId: 'rit-A', RecordType: 'testrun' },
      { ontvangen: T(0), Type: 'error', Message: 'b', SessionId: 'rit-A', RecordType: 'testrun' },
      { ontvangen: T(0), Type: 'opvallend', Message: 'c', SessionId: 'rit-A', RecordType: 'testrun', Outcome: 'bevinding', Repro: '#232' }
    ]);
    const r = await t.get('bron=sessies');
    const rij = r.body.records[0].fields;
    toets('één regel per rit', r.body.records.length === 1, String(r.body.records.length));
    toets('met de tellingen erbij', rij.regels === 3 && rij.fouten === 1 && rij.uitkomsten === 1,
      JSON.stringify(rij));
    toets('en welke issues een antwoord kregen', rij.issues === '#232', String(rij.issues));

    const b = await t.get('bron=bevindingen');
    toets('bevindingen laat alleen wat opviel zien', b.body.records.length === 2,
      JSON.stringify(b.body.records.map((x) => x.fields.Message)));

    const w = await t.post({ bron: 'sessies', actie: 'wis', ids: ['rit-A'] });
    toets('een afgeleide bron is niet schrijfbaar', w.status === 403, JSON.stringify(w.body));
  }

  // ── 5. wijzigen en wissen ───────────────────────────────────────
  console.log('\n5. Wijzigen en wissen');
  {
    const t = bouw();
    vulLog(t.db, [{ ontvangen: T(0), Type: 'info', Message: 'voor' }]);
    const r = await t.post({ bron: 'log', actie: 'wijzig', id: 1, velden: { Message: 'na' } });
    toets('wijzigen werkt', r.body.ok === true, JSON.stringify(r.body).slice(0, 120));
    toets('en het staat werkelijk in de tabel',
      t.db.prepare('SELECT Message FROM logregels WHERE id=1').get().Message === 'na');

    const bs = await t.post({ bron: 'log', actie: 'wijzig', id: 1, velden: { ontvangen: '1999-01-01' } });
    toets('een beschermd veld mag niet bijgesteld worden', bs.status === 400 && /afgeschermd/.test(bs.body.error),
      JSON.stringify(bs.body));
    toets('en de waarde is inderdaad niet veranderd',
      !/^1999/.test(t.db.prepare('SELECT ontvangen FROM logregels WHERE id=1').get().ontvangen));

    const on = await t.post({ bron: 'log', actie: 'wijzig', id: 1, velden: { Verzonnen: 'x' } });
    toets('een kolom die niet bestaat wordt geweigerd', on.status === 400 && /bestaat niet/.test(on.body.error),
      JSON.stringify(on.body));

    const sl = await t.post({ bron: 'log', actie: 'wijzig', id: 'rec0123456789abcd', velden: { Message: 'x' } });
    toets('een Airtable-id is hier geen geldig id', sl.status === 400, JSON.stringify(sl.body));
  }
  {
    const t = bouw();
    vulLog(t.db, Array.from({ length: 5 }, (_, i) => ({ ontvangen: T(i), Type: 'info', Message: 'r' + i })));
    const r = await t.post({ bron: 'log', actie: 'wis', ids: [1, 2, 3] });
    toets('drie rijen in één keer wissen', r.body.ok === true && r.body.aantal === 3, JSON.stringify(r.body));
    toets('en ze zijn werkelijk weg',
      t.db.prepare('SELECT COUNT(*) n FROM logregels').get().n === 2);
    const veel = await t.post({ bron: 'log', actie: 'wis', ids: new Array(201).fill(1) });
    toets('te veel ineens wordt geweigerd, niet stil afgekapt', veel.status === 400, JSON.stringify(veel.body));
  }

  // ── 6. opruimen ─────────────────────────────────────────────────
  console.log('\n6. Opruimen: proef tenzij anders gezegd, en uitkomsten blijven');
  {
    const maak = () => {
      const t = bouw();
      vulLog(t.db, [
        { ontvangen: T(40), Type: 'info', Message: 'oud', SessionId: 'rit-A' },
        { ontvangen: T(40), Type: 'info', Message: 'oud met antwoord', SessionId: 'rit-A', Outcome: 'gesloten', Repro: '#217' },
        { ontvangen: T(1), Type: 'info', Message: 'vers', SessionId: 'rit-B' }
      ]);
      return t;
    };
    const t = maak();
    const p = await t.post({ bron: 'log', actie: 'opruimen', regel: { ouderDanDagen: 30 } });
    toets('zonder proef:false wordt er alleen geteld', p.body.proef === true && p.body.aantal === 1,
      JSON.stringify(p.body));
    toets('en er is niets gewist', t.db.prepare('SELECT COUNT(*) n FROM logregels').get().n === 3);

    const e = maak();
    const re = await e.post({ bron: 'log', actie: 'opruimen', regel: { ouderDanDagen: 30 }, proef: false });
    toets('met proef:false gaat het er werkelijk uit', re.body.aantal === 1 && re.body.proef === false,
      JSON.stringify(re.body));
    toets('de regel mét een uitkomst blijft staan',
      !!e.db.prepare("SELECT 1 FROM logregels WHERE Outcome='gesloten'").get(),
      'het antwoord op #217 is weg — daar is die rit voor gereden');
    toets('en de verse regel ook', e.db.prepare('SELECT COUNT(*) n FROM logregels').get().n === 2);

    const u = maak();
    await u.post({ bron: 'log', actie: 'opruimen', regel: { ouderDanDagen: 30 }, ookUitkomsten: true, proef: false });
    toets('TEGENPROEF: met ookUitkomsten gaat hij wél mee',
      !u.db.prepare("SELECT 1 FROM logregels WHERE Outcome='gesloten'").get());

    const s = maak();
    await s.post({ bron: 'log', actie: 'opruimen', regel: { sessie: 'rit-B' }, proef: false });
    toets('opruimen per rit raakt alleen die rit',
      !s.db.prepare("SELECT 1 FROM logregels WHERE SessionId='rit-B'").get() &&
      !!s.db.prepare("SELECT 1 FROM logregels WHERE SessionId='rit-A'").get());

    const leeg = maak();
    const rl = await leeg.post({ bron: 'log', actie: 'opruimen', regel: {}, proef: false });
    toets('zonder regel wordt er niets gewist', rl.status === 400 && /minstens één/.test(rl.body.error),
      JSON.stringify(rl.body));
    toets('en de tabel is nog heel', leeg.db.prepare('SELECT COUNT(*) n FROM logregels').get().n === 3);
  }

  // ── 7. de poort ─────────────────────────────────────────────────
  console.log('\n7. Zonder geldige admin-token');
  {
    const g = bouw({ admin: false });
    vulLog(g.db, [{ ontvangen: T(0), Type: 'info', Message: 'x' }]);
    const rg = await g.get('bron=log');
    toets('lezen wordt geweigerd', rg.status === 403 && g.staat.sqls.length === 0, 'status ' + rg.status);
    const rp = await g.post({ bron: 'log', actie: 'opruimen', regel: { ouderDanDagen: 0 }, proef: false });
    toets('opruimen ook, en de rijen staan er nog',
      rp.status === 403 && g.db.prepare('SELECT COUNT(*) n FROM logregels').get().n === 1, 'status ' + rp.status);
  }

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
  process.exit(fout ? 1 : 0);
})();
