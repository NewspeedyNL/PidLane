// ══════════════════════════════════════════════════════════════════
// test-logroute.js — de Worker-kant van het logschrijven naar D1 (#262)
// ──────────────────────────────────────────────────────────────────
// WAT HIER GETOETST WORDT.
//
// `handleAirtableLog()` is de enige weg waarlangs een rit iets vastlegt.
// Hij hoort vier dingen te doen: de tokenpoort dicht houden, elk veld in
// de juiste kolom zetten, een veld dat hij niet kent bewaren in plaats
// van weg te gooien, en bij een mislukking een FOUT teruggeven.
//
// DAT LAATSTE IS DE REDEN DAT DEZE TEST BESTAAT. Tussen 20-09-2026 17:12
// en 22-09 gaf deze route `{ok:true,status:"logging_paused"}` met HTTP
// 200 terug terwijl er niets werd weggeschreven. De proef in blok 5 die
// juist dat kanaal bewaakt (#235) keurde het goed, want die leest de
// status en niet de inhoud. Een kanaal dat stil faalt én een bewaker die
// het niet ziet: dat mag niet nog een keer kunnen.
//
// DE NEP-D1 IS ECHTE SQLITE, opgebouwd uit schema.sql. Een zelfgebouwde
// nabouw zou accepteren wat ík acceptabel vind; nu valt een INSERT die
// niet tegen het echte schema past hier om. Dat is het verschil tussen
// "de handler doet wat ik dacht" en "de regel staat werkelijk in de tabel".
//
// De echte functie wordt uit worker.js geknipt met een anker; verdwijnt
// of hernoemt hij, dan stopt deze test in plaats van groen te blijven op
// code die niet meer draait.
//
// Draaien vanuit public/:  node test-logroute.js   (exit 0 = goed)
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

const van = bron.indexOf('var LOG_MAX_REGELS =');
const tot = bron.indexOf('__name(handleAirtableLog, "handleAirtableLog");');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: de logroute is niet gevonden in worker.js — hernoemd of weg.');
  process.exit(1);
}
const src = bron.slice(van, tot);

/* ── De nep-D1 ─────────────────────────────────────────────────────
   Precies het stukje D1-oppervlak dat de handler aanraakt:
   prepare().all() voor de kolomvraag, prepare().bind() voor een INSERT,
   en batch() om ze uit te voeren. Eronder zit echte SQLite. */
function maakD1(o) {
  o = o || {};
  const db = new DatabaseSync(':memory:');
  if (!o.geenTabel) db.exec(schemaTekst);
  const gezien = [];
  return {
    db, gezien,
    prepare(sql) {
      return {
        sql,
        all() {
          if (o.pragmaStuk) throw new Error('pragma weg');
          return { results: db.prepare(sql).all() };
        },
        bind(...args) {
          return { sql, args, _run() { db.prepare(sql).run(...args); } };
        }
      };
    },
    async batch(stmts) {
      if (o.batchStuk) throw new Error('D1_ERROR: database is vol');
      for (const s of stmts) { gezien.push(s); s._run(); }
    }
  };
}

/* De handler in een eigen scope draaien, met alles wat hij van buiten
   gebruikt erin geprikt. `_logKolommen` is een cache per isolate; elke
   bouw() geeft een verse scope en dus een verse cache. */
function bouw(o) {
  o = o || {};
  const omg = {
    appTokenOk: async () => o.token !== false,
    json: (body, status) => ({ body, status: status || 200 }),
    __name: () => {}
  };
  const maak = new Function(...Object.keys(omg), src + '\nreturn handleAirtableLog;');
  const fn = maak(...Object.values(omg));
  const d1 = o.geenDb ? null : maakD1(o);
  const env = { LOGDB: d1 };
  const request = {
    json: async () => {
      if (o.stukkeJson) throw new Error('geen json');
      return { records: o.records || [] };
    }
  };
  return { roep: () => fn(request, env), d1 };
}

const REGEL = {
  fields: {
    Timestamp: '2026-09-20T21:57:11.000Z', Type: 'opvallend',
    Message: 'opdracht MAF stationair — uitkomst: bevinding',
    RecordType: 'testrun', SessionId: '2026-09-20-2157-1',
    Outcome: 'bevinding', Repro: '#232', Demo: false, Merk: 'Mazda'
  }
};

(async function () {
  // ── de poort ────────────────────────────────────────────────────
  toets('zonder geldig app-token: 401', (await bouw({ token: false, records: [REGEL] }).roep()).status === 401);
  toets('zonder D1-binding: 500 en niet stil ok',
    (await bouw({ geenDb: true, records: [REGEL] }).roep()).status === 500);
  toets('kapotte json: 400', (await bouw({ stukkeJson: true }).roep()).status === 400);
  toets('geen records: 400', (await bouw({ records: [] }).roep()).status === 400);

  // ── de regel komt er werkelijk in ───────────────────────────────
  {
    const b = bouw({ records: [REGEL] });
    const r = await b.roep();
    toets('een gewone regel levert ok', r.status === 200 && r.body.ok === true && r.body.geschreven === 1,
      JSON.stringify(r));
    const rij = b.d1.db.prepare('SELECT * FROM logregels').get();
    toets('de velden staan in hun eigen kolom',
      rij && rij.SessionId === '2026-09-20-2157-1' && rij.Outcome === 'bevinding' && rij.Repro === '#232',
      JSON.stringify(rij));
    toets('een boolean wordt 0/1 in de INTEGER-kolom', rij && rij.Demo === 0, 'kreeg ' + (rij && rij.Demo));
    toets('`ontvangen` is door de Worker gezet, niet leeg',
      rij && typeof rij.ontvangen === 'string' && rij.ontvangen.length > 10, JSON.stringify(rij && rij.ontvangen));
    toets('niets belandde in het vangnet', rij && rij.onbekend === null,
      'onbekend=' + (rij && rij.onbekend));
  }

  // ── een veld zonder kolom mag niet verdwijnen ───────────────────
  {
    const b = bouw({ records: [{ fields: Object.assign({}, REGEL.fields, { Koelwater: 91, Iets: { a: 1 } }) }] });
    await b.roep();
    const rij = b.d1.db.prepare('SELECT onbekend FROM logregels').get();
    const bewaard = rij && rij.onbekend ? JSON.parse(rij.onbekend) : null;
    toets('een onbekend veld gaat naar `onbekend` in plaats van weg',
      bewaard && bewaard.Koelwater === 91 && bewaard.Iets && bewaard.Iets.a === 1,
      'kreeg: ' + (rij && rij.onbekend));
  }

  // ── de client mag de ontvangsttijd niet zetten ──────────────────
  {
    const b = bouw({ records: [{ fields: { Message: 'x', ontvangen: '1999-01-01T00:00:00.000Z' } }] });
    await b.roep();
    const rij = b.d1.db.prepare('SELECT ontvangen, onbekend FROM logregels').get();
    // NIET op de opgeslagen waarde toetsen en verder niets: SQLite
    // accepteert `INSERT INTO t (ontvangen, ..., ontvangen)` zonder morren
    // en houdt de EERSTE waarde. De servertijd zou dan winnen door de
    // volgorde waarin de kolommen toevallig opgebouwd worden, niet door de
    // poort die dat hoort te bewaken — en deze toets zou groen blijven als
    // die poort weggehaald werd. Nagemeten op 22-09-2026.
    const sql = String((b.d1.gezien[0] || {}).sql || '');
    const keer = (sql.match(/\bontvangen\b/g) || []).length;
    toets('`ontvangen` staat precies één keer in de INSERT',
      keer === 1, 'kwam ' + keer + '× voor in: ' + sql);
    toets('een meegestuurde `ontvangen` wint niet van de Worker',
      rij && rij.ontvangen.slice(0, 2) !== '19',
      'de client bepaalde de volgorde: ' + (rij && rij.ontvangen));
    toets('maar hij verdwijnt ook niet stil', rij && String(rij.onbekend || '').indexOf('1999') >= 0,
      'onbekend=' + (rij && rij.onbekend));
  }

  // ── een verzonnen veldnaam kan geen SQL forceren ────────────────
  {
    const gemeen = 'Message) VALUES (1); DROP TABLE logregels; --';
    const b = bouw({ records: [{ fields: { [gemeen]: 'x', Message: 'echt' } }] });
    const r = await b.roep();
    const nog = b.d1.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='logregels'").get().n;
    toets('een veldnaam uit het verzoek komt nooit in de SQL',
      r.status === 200 && nog === 1, 'de tabel is weg of de INSERT klapte: ' + JSON.stringify(r));
  }

  // ── mislukken moet mislukken heten (de les van logging_paused) ──
  {
    const r = await bouw({ records: [REGEL], batchStuk: true }).roep();
    toets('een mislukte schrijfactie geeft GEEN 200',
      r.status !== 200 && !(r.body && r.body.ok), JSON.stringify(r));
    toets('en zegt erbij wat er misging', r.status === 502 && /vol/.test(String(r.body.detail || '')),
      JSON.stringify(r));
  }
  {
    const r = await bouw({ records: [REGEL], geenTabel: true }).roep();
    toets('een ontbrekende tabel geeft 500, geen stil ok',
      r.status === 500 && r.body.error === 'schema_onleesbaar', JSON.stringify(r));
  }

  // ── afkappen mag, stil afkappen niet ────────────────────────────
  {
    const veel = Array.from({ length: 60 }, () => REGEL);
    const b = bouw({ records: veel });
    const r = await b.roep();
    toets('boven de cap wordt afgekapt', r.body.geschreven === 50, 'geschreven=' + r.body.geschreven);
    toets('en het afkappen staat in het antwoord', r.body.afgekapt === 10, 'afgekapt=' + r.body.afgekapt);
  }

  // ── de kolommen komen uit de tabel, niet uit een lijst hier ─────
  {
    toets('worker.js draagt zelf geen kolommenlijst',
      !/AT_KOLOMMEN|SchemaVersion['"]?\s*,\s*['"]UserId/.test(src),
      'er staat een tweede lijst veldnamen in de Worker — die loopt uit de pas met schema.sql');
  }

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
  process.exit(fout ? 1 : 0);
})();
