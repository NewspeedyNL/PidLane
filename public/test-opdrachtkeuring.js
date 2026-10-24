// ══════════════════════════════════════════════════════════════════
// test-opdrachtkeuring.js — de beheerder zet een opstelling op groen (23-10-2026)
// ──────────────────────────────────────────────────────────────────
// De echte routes uit worker.js geknipt, op echte SQLite uit schema.sql. Wat
// hier rood moet worden: een klant die keurt, een keuring die blijft staan
// nadat de opdracht veranderd is, een database zonder de nieuwe kolommen die
// de leesroute breekt, en een app die de keuring niet doorgeeft.
//
// Draaien vanuit public/:  node test-opdrachtkeuring.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
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

const wortel = path.join(__dirname, '..');
const bron = fs.readFileSync(path.join(wortel, 'worker.js'), 'utf8');
const schemaTekst = fs.readFileSync(path.join(wortel, 'schema.sql'), 'utf8');
const van = bron.indexOf('// ── DE KEURING VAN EEN OPSTELLING (23-10-2026)');
const tot = bron.indexOf('__name(handleOpdracht, "handleOpdracht");');
if (van < 0 || tot < 0 || tot < van) { console.error('FOUT: het keuringsblok is niet gevonden in worker.js'); process.exit(1); }
const src = bron.slice(van, tot);

function maakD1(db) {
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    all() { return { results: db.prepare(sql).all(...args) }; },
    first() { return db.prepare(sql).get(...args) || null; },
    run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }
  });
  return { prepare: (sql) => stmt(sql, []) };
}

function bouw(o) {
  o = o || {};
  const db = new DatabaseSync(':memory:');
  if (o.oudSchema) {
    // Een database van vóór 23-10: de tabel zonder de keuringskolommen.
    db.exec('CREATE TABLE meetopdrachten (id INTEGER PRIMARY KEY AUTOINCREMENT, Naam TEXT NOT NULL, Reden TEXT, Actief INTEGER NOT NULL DEFAULT 0, Gewijzigd TEXT NOT NULL, Opdracht TEXT NOT NULL, Notitie TEXT)');
  } else db.exec(schemaTekst);
  db.prepare('INSERT INTO meetopdrachten (Naam,Actief,Gewijzigd,Opdracht) VALUES (?,?,?,?)').run('Stilstand', 1, '2026-10-23T08:00:00Z', '{"schema":2,"naam":"Stilstand"}');
  const omg = {
    appTokenOk: async () => true,
    auth: async () => o.sessie === undefined ? { u: 'rico', r: 'admin' } : o.sessie,
    json: (body, status) => ({ body, status: status || 200 }),
    __name: () => { }
  };
  const fns = new Function(...Object.keys(omg), src + '\nreturn { handleOpdracht, handleOpdrachtKeur, opdrachtKeurZet, opdrachtVingerafdruk };')(...Object.values(omg));
  return { db, D1: maakD1(db), fns };
}
const verzoek = (body, alle) => ({
  url: 'https://x/airtable/opdracht' + (alle ? '?alle=1' : '/keur'),
  json: async () => body
});

async function hoofd() {
  console.log('\n1. wie mag keuren');
  {
    const t = bouw({ sessie: { u: 'klant', r: 'user' } });
    const r = await t.fns.handleOpdrachtKeur(verzoek({ id: 1, keuring: 'groen' }), { LOGDB: t.D1 });
    toets('een klant krijgt 403', r.status === 403, JSON.stringify(r));
    const t2 = bouw({ sessie: null });
    const r2 = await t2.fns.handleOpdrachtKeur(verzoek({ id: 1, keuring: 'groen' }), { LOGDB: t2.D1 });
    toets('zonder sessie 401', r2.status === 401);
    const t3 = bouw();
    const r3 = await t3.fns.handleOpdrachtKeur(verzoek({ id: 1, keuring: 'blauw' }), { LOGDB: t3.D1 });
    toets('een onbekende keuring wordt geweigerd', r3.status === 400);
    const r4 = await t3.fns.handleOpdrachtKeur(verzoek({ id: 99, keuring: 'groen' }), { LOGDB: t3.D1 });
    toets('een onbekend id is 404', r4.status === 404);
  }

  console.log('\n2. groen zetten, en de app krijgt het mee');
  {
    const t = bouw();
    const env = { LOGDB: t.D1 };
    const voor = await t.fns.handleOpdracht(verzoek(null, true), env);
    toets('vóór de keuring: ongekeurd', voor.body.opdrachten[0].keuring.staat === 'ongekeurd', JSON.stringify(voor.body));
    const r = await t.fns.handleOpdrachtKeur(verzoek({ id: 1, keuring: 'groen', notitie: 'gezien op de oprit' }), env);
    toets('de beheerder zet groen', r.status === 200 && r.body.ok && r.body.keuring.staat === 'groen', JSON.stringify(r));
    const lijst = await t.fns.handleOpdracht(verzoek(null, true), env);
    toets('de lijst zegt groen, met de notitie', lijst.body.opdrachten[0].keuring.staat === 'groen' && /oprit/.test(lijst.body.opdrachten[0].keuring.notitie), JSON.stringify(lijst.body.opdrachten[0].keuring));
    const een = await t.fns.handleOpdracht({ url: 'https://x/airtable/opdracht' }, env);
    toets('de actieve route zegt het ook', een.body.keuring && een.body.keuring.staat === 'groen', JSON.stringify(een.body));
    const rij = t.db.prepare('SELECT KeurDoor, KeurOp FROM meetopdrachten WHERE id = 1').get();
    toets('wie en wanneer staan erbij', rij.KeurDoor === 'rico' && !!rij.KeurOp, JSON.stringify(rij));
    const gewijzigd = t.db.prepare('SELECT Gewijzigd FROM meetopdrachten WHERE id = 1').get().Gewijzigd;
    toets('keuren verschuift Gewijzigd niet (dat kiest de actieve opdracht)', gewijzigd === '2026-10-23T08:00:00Z', gewijzigd);

    t.db.prepare('UPDATE meetopdrachten SET Opdracht = ? WHERE id = 1').run('{"schema":2,"naam":"Stilstand","duurS":60}');
    const na = await t.fns.handleOpdracht(verzoek(null, true), env);
    toets('opdracht veranderd → weer ongekeurd, met de reden', na.body.opdrachten[0].keuring.staat === 'ongekeurd' && /veranderd/.test(na.body.opdrachten[0].keuring.notitie), JSON.stringify(na.body.opdrachten[0].keuring));

    await t.fns.handleOpdrachtKeur(verzoek({ id: 1, keuring: 'rood' }), env);
    toets('rood kan ook', (await t.fns.handleOpdracht(verzoek(null, true), env)).body.opdrachten[0].keuring.staat === 'rood');
    await t.fns.handleOpdrachtKeur(verzoek({ id: 1, keuring: 'ongekeurd' }), env);
    const leeg = t.db.prepare('SELECT Keuring, KeurHash FROM meetopdrachten WHERE id = 1').get();
    toets('ongekeurd wist de keuring', leeg.Keuring === null && leeg.KeurHash === null, JSON.stringify(leeg));
  }

  console.log('\n3. een database van vóór de kolommen');
  {
    const t = bouw({ oudSchema: true });
    const env = { LOGDB: t.D1 };
    const l = await t.fns.handleOpdracht(verzoek(null, true), env);
    toets('de leesroute breekt niet en zegt ongekeurd', l.status === 200 && l.body.opdrachten[0].keuring.staat === 'ongekeurd', JSON.stringify(l));
    const r = await t.fns.handleOpdrachtKeur(verzoek({ id: 1, keuring: 'groen' }), env);
    toets('keuren zet de kolommen er zelf bij', r.status === 200 && r.body.ok, JSON.stringify(r));
    toets('en daarna staat hij op groen', (await t.fns.handleOpdracht(verzoek(null, true), env)).body.opdrachten[0].keuring.staat === 'groen');
  }

  console.log('\n4. de app: PLOpdracht neemt de keuring over en vraagt hem aan');
  {
    const s = { console, Date, Math, JSON, Object, Array, String, Number, isFinite, Promise, log: function () { } };
    s.window = s;
    s.PROXY_URL = 'https://x';
    s.gevraagd = [];
    s.plFetch = function (url, o) {
      s.gevraagd.push({ url, o });
      if (/keur$/.test(url)) return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true, keuring: { staat: JSON.parse(o.body).keuring, notitie: '', op: 'nu' } }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ opdrachten: [
        { id: '1', naam: 'Stilstand', actief: true, keuring: { staat: 'rood', notitie: 'band te krap' },
          opdracht: JSON.stringify({ schema: 2, naam: 'Stilstand', sensoren: ['010D'], duurS: 60 }) },
        { id: '2', naam: 'Zonder keuring', actief: false,
          opdracht: JSON.stringify({ schema: 2, naam: 'Zonder keuring', sensoren: ['010D'], duurS: 60 }) }] }) });
    };
    vm.createContext(s);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-opdracht.js'), 'utf8'), s);
    const O = s.PLOpdracht;
    await O.lijst();
    toets('de keuring uit de lijst staat bij de opdracht', O.keuring('1').staat === 'rood' && O.keuring('1').notitie === 'band te krap', JSON.stringify(O.keuring('1')));
    toets('zonder keuring: ongekeurd', O.keuring('2').staat === 'ongekeurd');
    // Meetcoach (24-10-2026): ongekeurd telt als `auto`; rood blijft rood.
    toets('opstelling: ongekeurd telt als auto', O.opstelling('2') === 'auto', O.opstelling('2'));
    toets('opstelling: rood blijft rood (een mens zei nee)', O.opstelling('1') === 'rood', O.opstelling('1'));
    s.activePIDs = new Set(['010C']);
    toets('zetSensorenAlle: de sensoren van alle opdrachten, wat al aanstaat niet dubbel', JSON.stringify(O.zetSensorenAlle(12)) === '["010D"]' && s.activePIDs.has('010D'), JSON.stringify([...s.activePIDs]));
    s.activePIDs = new Set();
    toets('zetSensorenAlle: het plafond telt', O.zetSensorenAlle(0).length === 0 && s.activePIDs.size === 0);
    toets('oordeelAlle draagt de opstelling', O.oordeelAlle().every(function (r) { return r.opstelling === O.keuring(r.id).staat; }));
    const r = await O.keurZet('1', 'groen', 'gezien');
    toets('keurZet post naar /airtable/opdracht/keur', r.ok && s.gevraagd.some(function (g) { return /\/airtable\/opdracht\/keur$/.test(g.url) && g.o.method === 'POST' && JSON.parse(g.o.body).id === 1; }), JSON.stringify(s.gevraagd.map(function (g) { return g.url; })));
    toets('en neemt de nieuwe stand over', O.keuring('1').staat === 'groen');
    const fout1 = await O.keurZet('1', 'paars');
    toets('een onbekende keuring gaat niet de deur uit', fout1.ok === false && s.gevraagd.length === 2);
  }

  console.log('\n' + (fout ? 'FOUT — ' + fout + ' van ' + n + ' toetsen' : 'Alles goed — ' + n + ' toetsen'));
  process.exit(fout ? 1 : 0);
}
hoofd().catch(function (e) { console.log('  FOUT  test brak af — ' + (e && e.stack || e)); process.exit(1); });
