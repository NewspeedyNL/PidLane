// ══════════════════════════════════════════════════════════════════
// test-secondopinion.js — een uitkomst is voorlopig tot de beheerder hem
// bevestigt of ongeldig verklaart, en de AI doet alleen een voorstel (#599)
// ──────────────────────────────────────────────────────────────────
// De echte routes uit worker.js, op echte SQLite uit schema.sql. Getoetst:
// wie mag insturen, dat alleen een afgeronde uitkomst binnenkomt, dat
// "ongeldig" een reden vraagt, en dat de AI bij te weinig data weigert in
// plaats van iets te verzinnen — en nooit zelf het oordeel zet.
//
// Draaien vanuit public/:  node test-secondopinion.js     (exit 0 = goed)
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
const van = bron.indexOf('// ── DE SECOND OPINION (#599)');
const tot = bron.indexOf('// ── EINDE SECOND OPINION ──');
if (van < 0 || tot < van) { console.error('FOUT: het blok second opinion is niet gevonden in worker.js'); process.exit(1); }
const src = bron.slice(van, tot);
if (bron.indexOf('if (actie.indexOf("uitkomst-") === 0) return await adminD1Uitkomst(env, actie, b0);') < 0)
  { console.error('FOUT: /admin/d1 stuurt uitkomst-* niet meer door'); process.exit(1); }
if (bron.indexOf('url.pathname === "/airtable/opdracht/uitkomst"') < 0)
  { console.error('FOUT: de route /airtable/opdracht/uitkomst is niet meer bedraad'); process.exit(1); }

function maakD1(db) {
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    all() { return { results: db.prepare(sql).all(...args) }; },
    first() { return db.prepare(sql).get(...args) || null; },
    run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  });
  return { prepare: (sql) => stmt(sql, []) };
}

function bouw(o) {
  o = o || {};
  const db = new DatabaseSync(':memory:');
  if (!o.oudSchema) db.exec(schemaTekst);
  const t = { db, D1: maakD1(db), vragen: [], antwoord: o.antwoord };
  const omg = {
    auth: async () => o.sessie === undefined ? { u: 'rico', r: 'admin' } : o.sessie,
    json: (body, status) => ({ body, status: status || 200 }),
    __name: () => { },
    resolveAnthropicKey: () => 'sk-ant-proef',
    fetch: async (url, opt) => {
      t.vragen.push({ url, body: JSON.parse(opt.body) });
      const a = t.antwoord || { voorstel: 'ongeldig-bediening', zekerheid: 'hoog', reden: 'contact 1:38 uit, hoogstens 1:30' };
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: typeof a === 'string' ? a : JSON.stringify(a) }] }) };
    }
  };
  t.fns = new Function(...Object.keys(omg), src + '\nreturn { handleOpdrachtUitkomst, uitkomstLijst, adminD1Uitkomst, uitkomstGenoegData, uitkomstAiLees };')(...Object.values(omg));
  t.env = { LOGDB: t.D1 };
  return t;
}
const verzoek = (body) => ({ url: 'https://x/airtable/opdracht/uitkomst', json: async () => body });
const RIJK = {
  v: 1, opdracht: 'Contact uit', venster: { s: 900 },
  voorwaarden: [{ wat: 'Contact 20 s tot 1,5 min uit', vervuld: true, waarde: 98, detail: 'contact-uit 1:38 aan één stuk' }],
  uitslagen: [{ naam: 'geen weigeringen', staat: 'FOUT', detail: '5 weigeringen' }],
  toeschouwer: { perioden: [{ toestand: 'contact-uit', tS: 600, s: 98 }], gebeurtenissen: [{ soort: 'contact-uit', tS: 600 }] }
};
const INSTUREN = { id: 41, naam: 'Contact uit', sessie: '2026-10-23-2258', staat: 'bevinding', opstelling: 'groen', reden: '1 van de 3 metingen buiten de band', bewijs: RIJK };

async function hoofd() {
  console.log('\n1. insturen: wie en wat');
  {
    const t = bouw({ sessie: { u: 'klant', r: 'user' } });
    toets('een klant krijgt 403', (await t.fns.handleOpdrachtUitkomst(verzoek(INSTUREN), t.env)).status === 403);
    const t2 = bouw({ sessie: null });
    toets('zonder sessie 401', (await t2.fns.handleOpdrachtUitkomst(verzoek(INSTUREN), t2.env)).status === 401);
    const t3 = bouw();
    toets('"nog niet" is geen antwoord en komt niet binnen', (await t3.fns.handleOpdrachtUitkomst(verzoek(Object.assign({}, INSTUREN, { staat: 'nog niet' })), t3.env)).status === 400);
    const groot = Object.assign({}, INSTUREN, { bewijs: { x: 'a'.repeat(17000) } });
    toets('een bewijs boven 16000 tekens is 413', (await t3.fns.handleOpdrachtUitkomst(verzoek(groot), t3.env)).status === 413);
  }

  console.log('\n2. binnen als voorlopig, ook op een database zonder de tabel');
  const t = bouw({ oudSchema: true });
  const r = await t.fns.handleOpdrachtUitkomst(verzoek(INSTUREN), t.env);
  toets('ingestuurd', r.status === 200 && r.body.ok && r.body.oordeel === 'voorlopig' && r.body.id === '1', JSON.stringify(r));
  const rij = t.db.prepare('SELECT * FROM opdracht_uitkomsten WHERE id = 1').get();
  toets('de rij draagt opdracht, sessie, staat, opstelling en bewijs', rij && rij.OpdrachtId === 41 && rij.SessionId === '2026-10-23-2258' &&
    rij.Staat === 'bevinding' && rij.Opstelling === 'groen' && rij.Oordeel === 'voorlopig' && JSON.parse(rij.Bewijs).venster.s === 900 && rij.Door === 'rico', JSON.stringify(rij));
  const lijst = await t.fns.uitkomstLijst(t.D1, 10);
  toets('de lijst voor beheer.html geeft hem terug', lijst.body.ok && lijst.body.uitkomsten.length === 1);

  console.log('\n3. het oordeel zet de beheerder');
  toets('een onbekend oordeel is 400', (await t.fns.adminD1Uitkomst(t.env, 'uitkomst-oordeel', { id: 1, oordeel: 'misschien' })).status === 400);
  toets('ongeldig zonder reden is 400', (await t.fns.adminD1Uitkomst(t.env, 'uitkomst-oordeel', { id: 1, oordeel: 'ongeldig-bediening', notitie: '  ' })).status === 400);
  toets('een onbekend id is 404', (await t.fns.adminD1Uitkomst(t.env, 'uitkomst-oordeel', { id: 9, oordeel: 'bevestigd' })).status === 404);
  const o = await t.fns.adminD1Uitkomst(t.env, 'uitkomst-oordeel', { id: 1, oordeel: 'ongeldig-bediening', notitie: 'contact te lang uit' });
  const r2 = t.db.prepare('SELECT * FROM opdracht_uitkomsten WHERE id = 1').get();
  toets('ongeldig met reden staat erin, met tijd', o.status === 200 && r2.Oordeel === 'ongeldig-bediening' && /te lang/.test(r2.OordeelNotitie) && !!r2.OordeelOp, JSON.stringify(r2));
  await t.fns.adminD1Uitkomst(t.env, 'uitkomst-oordeel', { id: 1, oordeel: 'voorlopig' });
  const r3 = t.db.prepare('SELECT * FROM opdracht_uitkomsten WHERE id = 1').get();
  toets('terug naar voorlopig wist het tijdstip', r3.Oordeel === 'voorlopig' && r3.OordeelOp === null, JSON.stringify(r3));

  console.log('\n4. de AI: alleen een voorstel, en alleen met genoeg data');
  const ai = await t.fns.adminD1Uitkomst(t.env, 'uitkomst-ai', { id: 1 });
  const r4 = t.db.prepare('SELECT * FROM opdracht_uitkomsten WHERE id = 1').get();
  toets('met genoeg data: een voorstel', ai.status === 200 && ai.body.voorstel.voorstel === 'ongeldig-bediening', JSON.stringify(ai));
  toets('het voorstel staat bij de rij, het oordeel blijft voorlopig', JSON.parse(r4.AiVoorstel).voorstel === 'ongeldig-bediening' && r4.Oordeel === 'voorlopig', JSON.stringify(r4));
  const v = t.vragen[0] && t.vragen[0].body;
  toets('één vraag, aan het goedkope model, met het bewijs erin', t.vragen.length === 1 && v.model === 'claude-haiku-4-5' && /BEDIENING/.test(v.system) && /1:38/.test(v.messages[0].content), JSON.stringify(v).slice(0, 300));

  const dun = bouw();
  await dun.fns.handleOpdrachtUitkomst(verzoek(Object.assign({}, INSTUREN, { bewijs: { venster: { s: 40 }, uitslagen: [], toeschouwer: null } })), dun.env);
  const weiger = await dun.fns.adminD1Uitkomst(dun.env, 'uitkomst-ai', { id: 1 });
  toets('te weinig data: 422 met de reden, en de AI wordt niet gevraagd', weiger.status === 422 && /40 s gemeten/.test(weiger.body.error) && /toeschouwer zag niets/.test(weiger.body.error) && dun.vragen.length === 0, JSON.stringify(weiger));

  const raar = bouw({ antwoord: 'Ik denk dat het wel goed is.' });
  await raar.fns.handleOpdrachtUitkomst(verzoek(INSTUREN), raar.env);
  const rr = await raar.fns.adminD1Uitkomst(raar.env, 'uitkomst-ai', { id: 1 });
  toets('een onbruikbaar AI-antwoord wordt niet opgeslagen', rr.status === 502 && raar.db.prepare('SELECT AiVoorstel FROM opdracht_uitkomsten WHERE id = 1').get().AiVoorstel === null, JSON.stringify(rr));
  toets('een voorstel buiten de lijst is onbruikbaar', t.fns.uitkomstAiLees('{"voorstel":"FOUT","reden":"x"}') === null);
}

hoofd().then(() => {
  console.log('\n' + (fout ? 'FOUT — ' + fout + ' van ' + n + ' toetsen' : 'Alles goed — ' + n + ' toetsen'));
  process.exit(fout ? 1 : 0);
}).catch((e) => { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
