// ══════════════════════════════════════════════════════════════════
// test-opdrachtroute.js — de Worker-kant van de meetopdracht (#241, #262)
// ──────────────────────────────────────────────────────────────────
// WAT HIER GETOETST WORDT.
//
// `handleOpdracht()` is de enige route waarlangs iets van buiten de meting
// kan sturen. Hij hoort drie dingen te doen en niets meer: de tokenpoort
// dicht houden, de ACTIEVE rij pakken (en de nieuwste als er meer staan), en
// afkappen op de groottegrens vóór er iets naar een telefoon gaat.
//
// WAT HIJ MET OPZET NIET DOET: keuren. De vorm van een opdracht wordt in
// pidlane-opdracht.js gecontroleerd, op één plek, waar ook de code staat die
// hem uitvoert. Zou deze route óók gaan keuren, dan zijn er twee keurders en
// is de vraag welke van de twee klopt — en dat is precies de vorm die in dit
// project al drie keer een bug is geweest.
//
// SINDS #262 LEEST HIJ UIT D1. De tabel stond in dezelfde Airtable-base als
// de log en lag op 22-09 mee plat toen die base vol raakte. Het gedrag is
// ongewijzigd; alleen de bewaarplaats is anders, en de toetsen hieronder
// gaan nog steeds over datzelfde gedrag. De nep-D1 is echte SQLite uit
// schema.sql, dus een query die niet tegen de echte tabel past valt hier om.
//
// De echte functie wordt uit worker.js geknipt met een anker; verdwijnt of
// hernoemt hij, dan stopt deze test in plaats van groen te blijven op code
// die niet meer draait.
//
// Draaien vanuit public/:  node test-opdrachtroute.js   (exit 0 = goed)
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

const van = bron.indexOf('async function handleOpdracht(request, env) {');
const tot = bron.indexOf('__name(handleOpdracht, "handleOpdracht");');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: handleOpdracht() is niet gevonden in worker.js — de route is hernoemd of weg.');
  process.exit(1);
}
const src = bron.slice(van, tot);

/* De nagemaakte omgeving. `sqls` legt vast wat er werkelijk aan de database
   gevraagd is: daar kijkt deze test naar, niet alleen naar wat de handler
   teruggeeft. Eronder zit echte SQLite met het echte schema. */
function bouw(o) {
  o = o || {};
  const db = new DatabaseSync(':memory:');
  db.exec(schemaTekst);
  for (const rij of (o.rijen || [])) {
    db.prepare('INSERT INTO meetopdrachten (Naam,Reden,Actief,Gewijzigd,Opdracht) VALUES (?,?,?,?,?)')
      .run(rij.Naam || '', rij.Reden || '', rij.Actief ? 1 : 0, rij.Gewijzigd || '', rij.Opdracht === undefined ? '' : rij.Opdracht);
  }
  const staat = { sqls: [] };
  const omg = {
    appTokenOk: async () => o.token !== false,
    json: (body, status) => ({ body, status: status || 200 }),
    __name: () => { }
  };
  const maak = new Function(...Object.keys(omg), src + '\nreturn handleOpdracht;');
  const fn = maak(...Object.values(omg));
  const LOGDB = o.geenDb ? null : {
    prepare(sql) {
      staat.sqls.push(sql);
      return {
        all() {
          if (o.stuk) throw new Error('D1_ERROR: tabel weg');
          return { results: db.prepare(sql).all() };
        }
      };
    }
  };
  const request = { url: o.url || 'https://pidlane-proxy.example/airtable/opdracht' };
  return { staat, db, roep: () => fn(request, { LOGDB }) };
}

const GROOT = 'x'.repeat(9000);

(async function () {
  // ── de poort ────────────────────────────────────────────────────
  {
    const b = bouw({ token: false, rijen: [{ Naam: 'a', Actief: 1, Gewijzigd: 'T1', Opdracht: 'x' }] });
    const r = await b.roep();
    toets('zonder geldig app-token: 401', r.status === 401 && r.body.error === 'unauthorized', JSON.stringify(r));
    toets('en er is niets aan de database gevraagd', b.staat.sqls.length === 0,
      'gevraagd: ' + b.staat.sqls.join(' | '));
  }
  {
    const b = bouw({ geenDb: true });
    const r = await b.roep();
    toets('zonder D1-binding: 500 met een eigen code',
      r.status === 500 && r.body.error === 'no_logdb', JSON.stringify(r));
  }

  // ── welke rij hij pakt ──────────────────────────────────────────
  {
    const b = bouw({ rijen: [{ Naam: 'proef', Actief: 1, Gewijzigd: 'T1', Opdracht: 'schema 1' }] });
    await b.roep();
    const q = b.staat.sqls[0] || '';
    toets('er wordt op Actief gefilterd', /Actief\s*=\s*1/.test(q), q);
    toets('en op Gewijzigd aflopend gesorteerd', /ORDER BY Gewijzigd DESC/.test(q), q);
  }
  {
    const r = await bouw({ rijen: [] }).roep();
    toets('geen actieve rij → opdracht null, met een reden',
      r.body.ok === true && r.body.opdracht === null && /geen actieve opdracht/.test(r.body.reden),
      JSON.stringify(r.body));
  }
  {
    const r = await bouw({ rijen: [{ Naam: 'staat uit', Actief: 0, Gewijzigd: 'T9', Opdracht: 'x' }] }).roep();
    toets('TEGENPROEF: een niet-actieve rij telt niet mee',
      r.body.opdracht === null, JSON.stringify(r.body));
  }
  {
    const tekst = '{"schema":1,"pids":["0105"]}';
    const b = bouw({ rijen: [{ Naam: 'proef', Reden: '#217', Actief: 1, Gewijzigd: 'T1', Opdracht: tekst }] });
    const r = await b.roep();
    toets('de tekst gaat ongewijzigd mee', r.body.opdracht === tekst, JSON.stringify(r.body));
    toets('met id en naam erbij', r.body.id === '1' && r.body.naam === 'proef', JSON.stringify(r.body));
    toets('en het tijdstip van wijzigen', r.body.gewijzigd === 'T1', JSON.stringify(r.body));
    toets('TEGENPROEF: bij één rij staat er geen "meer"', !r.body.meer, JSON.stringify(r.body));
  }
  {
    const b = bouw({ rijen: [
      { Naam: 'oud', Actief: 1, Gewijzigd: 'T1', Opdracht: 'oud' },
      { Naam: 'nieuw', Actief: 1, Gewijzigd: 'T9', Opdracht: 'nieuw' }
    ] });
    const r = await b.roep();
    toets('bij twee actieve rijen wint de nieuwste',
      r.body.naam === 'nieuw' && r.body.opdracht === 'nieuw', JSON.stringify(r.body));
    toets('en het antwoord zegt dat er meer stonden', r.body.meer === 2, JSON.stringify(r.body));
  }

  // ── de groottegrens ─────────────────────────────────────────────
  {
    const r = await bouw({ rijen: [{ Naam: 'groot', Actief: 1, Gewijzigd: 'T1', Opdracht: GROOT }] }).roep();
    toets('een opdracht over 8192 tekens gaat niet mee',
      r.body.opdracht === null && /9000 tekens/.test(r.body.reden), JSON.stringify(r.body));
  }
  {
    const opDeGrens = 'y'.repeat(8192);
    const r = await bouw({ rijen: [{ Naam: 'grens', Actief: 1, Gewijzigd: 'T1', Opdracht: opDeGrens }] }).roep();
    toets('TEGENPROEF: precies op de grens gaat hij wél mee',
      r.body.opdracht === opDeGrens, 'lengte ' + String(r.body.opdracht || '').length);
  }
  {
    const r = await bouw({ rijen: [{ Naam: 'leeg', Actief: 1, Gewijzigd: 'T1', Opdracht: '' }] }).roep();
    toets('een rij zonder opdrachttekst levert een lege tekst en geen crash',
      r.body.ok === true && r.body.opdracht === '', JSON.stringify(r.body));
  }

  // ── als de database het laat afweten ────────────────────────────
  {
    const r = await bouw({ stuk: true, rijen: [{ Naam: 'a', Actief: 1, Gewijzigd: 'T1', Opdracht: 'x' }] }).roep();
    toets('een fout uit D1 wordt een 502 met de reden erbij',
      r.status === 502 && r.body.error === 'opdracht_lezen_mislukt' && /tabel weg/.test(String(r.body.detail)),
      JSON.stringify(r));
  }

  // ── ?alle=1 ─────────────────────────────────────────────────────
  {
    const rijen = [
      { Naam: 'Boordspanning', Reden: '#217', Actief: 1, Gewijzigd: 'T2', Opdracht: '{"schema":1}' },
      { Naam: 'MAF', Reden: '#232', Actief: 0, Gewijzigd: 'T1', Opdracht: '{"schema":1}' }
    ];
    const zonder = bouw({ rijen });
    await zonder.roep();
    toets('zonder ?alle=1 filtert hij nog steeds op Actief',
      /Actief\s*=\s*1/.test(zonder.staat.sqls[0]), zonder.staat.sqls[0]);

    const b = bouw({ rijen, url: 'https://p.example/airtable/opdracht?alle=1' });
    const r = await b.roep();
    const q = b.staat.sqls[0] || '';
    toets('met ?alle=1 staat er geen Actief-filter meer in', !/Actief/.test(q), q);
    toets('maar wel dezelfde sortering op Gewijzigd', /ORDER BY Gewijzigd DESC/.test(q), q);
    toets('en een ruimere grens', /LIMIT 12/.test(q), q);
    toets('het antwoord is gemerkt als lijst', r.body.alle === true, JSON.stringify(r.body).slice(0, 120));
    toets('met beide rijen erin', r.body.opdrachten.length === 2, String(r.body.opdrachten.length));
    toets('de naam gaat mee', r.body.opdrachten[0].naam === 'Boordspanning', r.body.opdrachten[0].naam);
    toets('de reden ook', r.body.opdrachten[0].reden === '#217', r.body.opdrachten[0].reden);
    toets('en of hij actief is',
      r.body.opdrachten[0].actief === true && r.body.opdrachten[1].actief === false,
      JSON.stringify(r.body.opdrachten.map((x) => x.actief)));
    toets('de ruwe tekst gaat mee', /schema/.test(r.body.opdrachten[0].opdracht));
  }
  {
    const r = await bouw({ rijen: [], url: 'https://p.example/airtable/opdracht?alle=1' }).roep();
    toets('een lege tabel geeft een lege lijst en geen foutmelding',
      r.body.ok === true && Array.isArray(r.body.opdrachten) && r.body.opdrachten.length === 0,
      JSON.stringify(r.body));
  }
  {
    const groot = await bouw({ rijen: [{ Naam: 'groot', Actief: 1, Gewijzigd: 'T1', Opdracht: GROOT }],
      url: 'https://p.example/airtable/opdracht?alle=1' }).roep();
    toets('een te grote opdracht blijft in de lijst', groot.body.opdrachten.length === 1);
    toets('zonder zijn tekst', groot.body.opdrachten[0].opdracht === '');
    toets('maar mét de reden', /9000 tekens/.test(groot.body.opdrachten[0].weg), groot.body.opdrachten[0].weg);
  }
  {
    const zonder = await bouw({ rijen: [{ Naam: 'leeg', Actief: 1, Gewijzigd: 'T1', Opdracht: '' }],
      url: 'https://p.example/airtable/opdracht?alle=1' }).roep();
    toets('een rij zonder opdrachttekst zegt dat ook',
      /geen opdrachttekst/.test(zonder.body.opdrachten[0].weg), zonder.body.opdrachten[0].weg);
  }
  {
    const half = bouw({ rijen: [{ Naam: 'a', Actief: 1, Gewijzigd: 'T1', Opdracht: 'x' }],
      url: 'https://p.example/airtable/opdracht?alle=ja' });
    const hr = await half.roep();
    toets('?alle=ja is geen ?alle=1',
      !hr.body.alle && /Actief\s*=\s*1/.test(half.staat.sqls[0]), half.staat.sqls[0]);
  }

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
  process.exit(fout ? 1 : 0);
})();
