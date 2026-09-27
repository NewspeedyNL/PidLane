// ══════════════════════════════════════════════════════════════════
// test-klantplatform.js — /klant/platform in worker.js ("Mijn voertuigen")
// ──────────────────────────────────────────────────────────────────
// De ECHTE worker.js, geladen als module, met een echte SQLite (node:sqlite)
// als D1. Geknipt wordt er niets: de route gaat door fetch(), lockOrigin,
// klantAuth en rateLimit heen, zoals op Cloudflare.
//
// WAT HIER ROOD HOORT TE WORDEN
//   • een klant die de voertuigen, rapporten of issues van een andere
//     klant kan lezen of wijzigen;
//   • een vierde actief voertuig;
//   • een kenteken dat onversleuteld in de database belandt — ook niet als
//     de sleutel ontbreekt;
//   • schrijven zonder het eigen akkoord;
//   • een verwijderd account waarvan de voertuigdata blijft staan;
//   • schema.sql en KP_SCHEMA die uit elkaar lopen.
//
// Draaien vanuit public/:  node test-klantplatform.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
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
const schemaSql = fs.readFileSync(path.join(wortel, 'schema.sql'), 'utf8');

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

async function laadWorker() {
  // De export aan het eind vervangen door een die ook de helpers noemt die de
  // test nodig heeft. De rest van het bestand blijft byte voor byte gelijk.
  const i = bron.lastIndexOf('export {');
  if (i < 0) throw new Error('export-blok niet gevonden in worker.js');
  const mod = bron.slice(0, i) +
    'export { worker_default as default, makeToken, hashPassword, klantWachtrijOpruimen, KP_SCHEMA, KP_MIGRATIES, kpKlantId };\n';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kp-')), 'worker.mjs');
  fs.writeFileSync(f, mod);
  return import('file://' + f);
}

(async () => {
  const W = await laadWorker();
  const db = new DatabaseSync(':memory:');
  const sleutel = Buffer.alloc(32, 7).toString('base64');
  const env = { LOGDB: maakD1(db), SESSION_SECRET: 'test-geheim-dat-lang-genoeg-is-0123456789', KENTEKEN_SLEUTEL: sleutel };

  const tokA = (await W.makeToken(env, 'anna@voorbeeld.nl', 'klant', 'Anna')).token;
  const tokB = (await W.makeToken(env, 'bert@voorbeeld.nl', 'klant', 'Bert')).token;
  const tokAdmin = (await W.makeToken(env, 'beheer', 'admin', 'Beheer')).token;

  async function roep(tok, body, e) {
    const r = await W.default.fetch(new Request('https://app.pidlane.nl/klant/platform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': tok, Origin: 'https://app.pidlane.nl' },
      body: JSON.stringify(body)
    }), e || env, { waitUntil() { } });
    let d = {};
    try { d = await r.json(); } catch (x) { d = { _geenJson: true }; }
    d._status = r.status;
    return d;
  }

  console.log('\n1. Toegang en akkoord');
  toets('zonder inlog: 401', (await roep('', { actie: 'stand' }))._status === 401);
  toets('een admin-token is geen klant: 401', (await roep(tokAdmin, { actie: 'stand' }))._status === 401);
  let st = await roep(tokA, { actie: 'stand' });
  toets('stand zonder akkoord: akkoord=false en de versie erbij', st.ok && st.akkoord === false && !!st.akkoordVersie, JSON.stringify(st));
  const zonder = await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { naam: 'X' } });
  toets('schrijven zonder akkoord: 403 met akkoordNodig', zonder._status === 403 && zonder.akkoordNodig === true);
  toets('een oude akkoordversie telt niet', (await roep(tokA, { actie: 'akkoord', versie: '2020-01-01' }))._status === 409);
  toets('akkoord op de actuele versie', (await roep(tokA, { actie: 'akkoord', versie: st.akkoordVersie })).ok);
  await roep(tokB, { actie: 'akkoord', versie: st.akkoordVersie });
  toets('onbekende actie: 400', (await roep(tokA, { actie: 'drop_table' }))._status === 400);

  console.log('\n2. Voertuigen, het kenteken en de grens van drie');
  const v1 = await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { naam: 'Blauwe Mazda', kenteken: 'ab-123-c', merk: 'Mazda', model: 'CX-5', bouwjaar: 2018, brandstof: 'Benzine', turbo: 'nee', rijprofiel: 'gemengd', verbruik_opgegeven: 7.2, kmstand: 84000, onzin: 'x' } });
  toets('voertuig aangemaakt', v1.ok && v1.voertuig && v1.voertuig.id, JSON.stringify(v1));
  toets('kenteken genormaliseerd en teruggegeven', v1.voertuig.kenteken === 'AB123C' && v1.kentekenOpgeslagen === true);
  const rij = db.prepare('SELECT * FROM kp_voertuig WHERE id = ?').get(v1.voertuig.id);
  toets('in de database staat het kenteken NIET leesbaar', !JSON.stringify(rij).includes('AB123C') && /^v1:/.test(rij.kenteken_enc), rij.kenteken_enc);
  toets('er staat geen e-mailadres in de database', !JSON.stringify(db.prepare('SELECT * FROM kp_voertuig').all()).includes('anna'));
  toets('een onbekend veld komt de tabel niet in', !('onzin' in rij));
  toets('brandstof als keuze, in kleine letters', rij.brandstof === 'benzine');
  toets('een ongeldige keuze wordt geweigerd', (await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { turbo: 'misschien' } }))._status === 400);
  toets('geen kenteken als kenteken', (await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { kenteken: '!!!' } }))._status === 400);

  const env2 = Object.assign({}, env, { KENTEKEN_SLEUTEL: '' });
  const zs = await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { naam: 'Clio', kenteken: '12-XYZ-3' } }, env2);
  const zsRij = db.prepare('SELECT kenteken_enc FROM kp_voertuig WHERE id = ?').get(zs.voertuig.id);
  toets('zonder sleutel: kenteken niet bewaard, en dat staat in het antwoord', zs.ok && zs.kentekenOpgeslagen === false && zsRij.kenteken_enc === null);
  const v3 = await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { naam: 'Derde' } });
  toets('derde voertuig mag', v3.ok);
  const v4 = await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { naam: 'Vierde' } });
  toets('vierde actief voertuig: 409 met de reden', v4._status === 409 && v4.limiet === 'actief', JSON.stringify(v4));
  toets('archiveren maakt ruimte', (await roep(tokA, { actie: 'voertuig_archiveer', id: v3.voertuig.id })).ok &&
    (await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { naam: 'Vierde' } })).ok);
  toets('herstellen uit het archief bij drie actief: 409', (await roep(tokA, { actie: 'voertuig_herstel', id: v3.voertuig.id }))._status === 409);
  toets('een actief voertuig verwijderen mag niet (eerst archiveren)', (await roep(tokA, { actie: 'voertuig_verwijder', id: v1.voertuig.id }))._status === 409);

  const bij = await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, onderhoud_laatst: '03-2026 / 135.000 km', distributie: 'ketting' } });
  toets('laatste onderhoudsbeurt en distributie worden bewaard', bij.ok && bij.voertuig.onderhoud_laatst === '03-2026 / 135.000 km' && bij.voertuig.distributie === 'ketting', JSON.stringify(bij).slice(0, 200));

  console.log('\n3. De ene klant ziet de andere niet');
  toets('Bert kan Anna\'s voertuig niet wijzigen', (await roep(tokB, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, naam: 'Gekaapt' } }))._status === 404);
  toets('Bert kan er geen rapport aan hangen', (await roep(tokB, { actie: 'rapport_opslaan', voertuig_id: v1.voertuig.id, soort: 'ai', tekst: 'x' }))._status === 404);
  toets('Bert ziet geen voertuigen', (await roep(tokB, { actie: 'stand' })).voertuigen.length === 0);
  const tokKopie = (await W.makeToken(env, 'bert@voorbeeld.nl', 'klant', 'Bert')).token;
  // Het versleutelde kenteken van Anna bij Bert neerzetten: de klant-id zit
  // in de versleuteling, dus bij Bert komt er niets leesbaars uit.
  const vb = await roep(tokKopie, { actie: 'voertuig_opslaan', voertuig: { naam: 'B1' } });
  db.prepare('UPDATE kp_voertuig SET kenteken_enc = ? WHERE id = ?').run(rij.kenteken_enc, vb.voertuig.id);
  const sb = await roep(tokB, { actie: 'stand' });
  toets('een gekopieerd versleuteld kenteken is bij een andere klant onleesbaar', sb.voertuigen[0].kenteken === null && sb.voertuigen[0].kentekenLeesbaar === false);

  console.log('\n4. Rapporten, ritten, status en issues');
  const r1 = await roep(tokA, { actie: 'rapport_opslaan', voertuig_id: v1.voertuig.id, soort: 'ai', titel: 'AI-monteur', tekst: 'Mager mengsel, controleer inlaat.' });
  toets('rapport bewaard', r1.ok && r1.id);
  toets('hetzelfde rapport nog eens: niet dubbel', (await roep(tokA, { actie: 'rapport_opslaan', voertuig_id: v1.voertuig.id, soort: 'ai', tekst: 'Mager mengsel, controleer inlaat.' })).dubbel === true);
  const lijst = await roep(tokA, { actie: 'rapporten', voertuig_id: v1.voertuig.id });
  toets('de lijst draagt geen volledige tekst, wel de lengte', lijst.rapporten.length === 1 && !('tekst' in lijst.rapporten[0]) && lijst.rapporten[0].lengte > 0);
  toets('het rapport zelf is terug te lezen', (await roep(tokA, { actie: 'rapport', id: r1.id })).rapport.tekst.startsWith('Mager'));
  toets('Bert kan het rapport niet lezen', (await roep(tokB, { actie: 'rapport', id: r1.id }))._status === 404);

  const rit = { start: '2026-09-27T08:00:00.000Z', eind: '2026-09-27T08:30:00.000Z', duur_s: 1800, km: 24.3, gem_kmh: 48.6, max_kmh: 102, verbruik_l100: 6.8, max_koelwater: 94, min_accu: 13.9, codes: ['P0171'] };
  toets('rit bewaard', (await roep(tokA, { actie: 'rit_opslaan', voertuig_id: v1.voertuig.id, rit })).ok);
  toets('dezelfde rit nog eens (zelfde start): niet dubbel', (await roep(tokA, { actie: 'rit_opslaan', voertuig_id: v1.voertuig.id, rit })).dubbel === true);
  const rr = await roep(tokA, { actie: 'ritten', voertuig_id: v1.voertuig.id });
  toets('rit terug met codes als lijst', rr.ritten.length === 1 && rr.ritten[0].codes[0] === 'P0171' && rr.ritten[0].km === 24.3);
  toets('een onzinwaarde wordt null, niet opgeslagen', (await roep(tokA, { actie: 'rit_opslaan', voertuig_id: v1.voertuig.id, rit: { start: '2026-09-27T09:00:00.000Z', max_kmh: 9999 } })).ok &&
    db.prepare("SELECT max_kmh FROM kp_rit WHERE start = '2026-09-27T09:00:00.000Z'").get().max_kmh === null);

  await roep(tokA, { actie: 'status_opslaan', voertuig_id: v1.voertuig.id, gezondheid: { accu: 12.6 }, kmstand: 85000 });
  await roep(tokA, { actie: 'status_opslaan', voertuig_id: v1.voertuig.id, kmstand: 60000 });
  const km = db.prepare('SELECT kmstand, gezondheid FROM kp_voertuig WHERE id = ?').get(v1.voertuig.id);
  toets('een gemeten kilometerstand gaat omhoog, nooit stil omlaag', km.kmstand === 85000, String(km.kmstand));
  toets('status bewaard als JSON', JSON.parse(km.gezondheid).accu === 12.6);

  const ops = [{ sleutel: 'dtc:P0171', soort: 'dtc', titel: 'P0171 mager', ernst: 'midden', actie: 'gezien' }];
  await roep(tokA, { actie: 'issues_bijwerken', voertuig_id: v1.voertuig.id, ops });
  await roep(tokA, { actie: 'issues_bijwerken', voertuig_id: v1.voertuig.id, ops });
  let is = (await roep(tokA, { actie: 'issues', voertuig_id: v1.voertuig.id })).issues;
  toets('één issue, twee keer gezien', is.length === 1 && is[0].aantal === 2 && is[0].status === 'open');
  await roep(tokA, { actie: 'issues_bijwerken', voertuig_id: v1.voertuig.id, ops: [{ sleutel: 'dtc:P0171', actie: 'genegeerd' }] });
  await roep(tokA, { actie: 'issues_bijwerken', voertuig_id: v1.voertuig.id, ops });
  is = (await roep(tokA, { actie: 'issues', voertuig_id: v1.voertuig.id })).issues;
  toets('een genegeerd issue gaat niet vanzelf weer open', is[0].status === 'genegeerd');
  await roep(tokA, { actie: 'issues_bijwerken', voertuig_id: v1.voertuig.id, ops: [{ sleutel: 'dtc:P0171', actie: 'heropend' }] });
  await roep(tokA, { actie: 'issues_bijwerken', voertuig_id: v1.voertuig.id, ops: [{ sleutel: 'dtc:P0171', actie: 'opgelost' }] });
  is = (await roep(tokA, { actie: 'issues', voertuig_id: v1.voertuig.id })).issues;
  toets('heropend en daarna opgelost', is[0].status === 'opgelost' && !!is[0].gesloten_op);
  toets('een sleutel met SQL erin wordt overgeslagen', (await roep(tokA, { actie: 'issues_bijwerken', voertuig_id: v1.voertuig.id, ops: [{ sleutel: "x'; DROP TABLE kp_issue;--", actie: 'gezien' }] })).verwerkt === 0);
  st = await roep(tokA, { actie: 'stand' });
  const mz = st.voertuigen.find((v) => v.id === v1.voertuig.id);
  toets('stand telt rapporten, ritten en open issues', mz.aantal.rapporten === 1 && mz.aantal.ritten === 2 && mz.aantal.openIssues === 0, JSON.stringify(mz.aantal));

  console.log('\n4b. Voorkeuren en de sensorselectie per voertuig');
  const tokV = (await W.makeToken(env, 'vera@voorbeeld.nl', 'klant', 'Vera')).token;
  toets('voorkeuren zonder akkoord op Mijn voertuigen: mag', (await roep(tokV, { actie: 'voorkeuren' })).ok === true);
  const vk = await roep(tokV, { actie: 'voorkeuren_opslaan', voorkeur: { weergave: 'visueel', thema: 'licht', tekst: 'l', letter: 15, waakronde: true,
    favorieten: ['wc-live', 'wc-live', 'wc-koop'], oudeData: 'ja', adapterAdres: '00:04:3E:AA:BB:CC', onbekend: 'x', rapport: '' } });
  toets('voorkeuren bewaard, dubbele favoriet eruit, onbekende sleutel en lege waarde weg', vk.ok && vk.voorkeur.favorieten.length === 2 && !('onbekend' in vk.voorkeur) && !('rapport' in vk.voorkeur), JSON.stringify(vk));
  const terugV = await roep(tokV, { actie: 'voorkeuren' });
  toets('en weer terug te lezen', terugV.voorkeur.weergave === 'visueel' && terugV.voorkeur.letter === 15 && terugV.voorkeur.waakronde === true);
  toets('een ongeldige keuze wordt geweigerd, niet stil bewaard', (await roep(tokV, { actie: 'voorkeuren_opslaan', voorkeur: { weergave: 'raar' } }))._status === 400);
  toets('"true" als tekst is geen ja/nee', (await roep(tokV, { actie: 'voorkeuren_opslaan', voorkeur: { waakronde: 'true' } }))._status === 400);
  toets('een favoriet die geen kaart is, wordt geweigerd', (await roep(tokV, { actie: 'voorkeuren_opslaan', voorkeur: { favorieten: ['javascript:alert(1)'] } }))._status === 400);
  toets('een ander ziet ze niet', Object.keys((await roep(tokB, { actie: 'voorkeuren' })).voorkeur).length === 0);
  const ps = await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, pid_selectie: ['010c', '010D', '010C', '0105'] } });
  toets('sensorselectie per voertuig: hoofdletters, uniek, als lijst terug', ps.ok && JSON.stringify(ps.voertuig.pid_selectie) === JSON.stringify(['010C', '010D', '0105']), JSON.stringify(ps.voertuig && ps.voertuig.pid_selectie));
  toets('een selectie met iets anders dan PIDs wordt geweigerd', (await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, pid_selectie: ['010C', 'DROP'] } }))._status === 400);
  await roep(tokV, { actie: 'alles_wissen' });
  toets('alles wissen neemt de voorkeuren mee', Object.keys((await roep(tokV, { actie: 'voorkeuren' })).voorkeur).length === 0);

  console.log('\n5. Account verwijderd of geblokkeerd: meteen dicht');
  {
    const oud = global.fetch;
    const hash = await W.hashPassword('geheim-wachtwoord-123', env);
    let status = 'actief';
    global.fetch = async (url, opt) => {
      if (!opt || !opt.method || opt.method === 'GET')
        return new Response(JSON.stringify({ records: [{ id: 'recAnna', fields: { Email: 'anna@voorbeeld.nl', PassHash: hash, Status: status } }] }), { status: 200 });
      return new Response('{"records":[{"id":"x"}]}', { status: 200 });
    };
    const envAt = Object.assign({}, env, { AIRTABLE_TOKEN: 'x' });
    const vw = await W.default.fetch(new Request('https://app.pidlane.nl/klant/verwijder', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': tokA, Origin: 'https://app.pidlane.nl' }, body: JSON.stringify({ pass: 'geheim-wachtwoord-123' }) }), envAt, {});
    toets('account verwijderen lukt', vw.status === 200, String(vw.status));
    const na = await roep(tokA, { actie: 'rapporten', voertuig_id: v1.voertuig.id });
    toets('met hetzelfde token: Mijn voertuigen meteen dicht (403, verwijderd)', na._status === 403 && na.code === 'verwijderd', JSON.stringify(na));
    toets('ook opnieuw akkoord geven helpt niet', (await roep(tokA, { actie: 'akkoord', versie: st.akkoordVersie }))._status === 403);
    status = 'actief';                                     // de beheerder zet het account terug
    const terug = await roep(tokA, { actie: 'stand' }, envAt);
    toets('hersteld account: blokkade eraf, akkoord opnieuw nodig', terug.ok && terug.akkoord === false, JSON.stringify(terug).slice(0, 200));
    await roep(tokA, { actie: 'akkoord', versie: st.akkoordVersie });
    status = 'geblokkeerd';
    toets('geblokkeerd in Airtable: stand geeft 403', (await roep(tokA, { actie: 'stand' }, envAt))._status === 403);
    global.fetch = async () => { throw new Error('Airtable weg'); };
    toets('Airtable onbereikbaar: de eigen voertuigen blijven bereikbaar', (await roep(tokA, { actie: 'stand' }, envAt)).ok === true);
    global.fetch = oud;
  }

  console.log('\n6. Verwijderen');
  const weg3 = await roep(tokA, { actie: 'voertuig_verwijder', id: v3.voertuig.id });
  toets('een gearchiveerd voertuig verwijderen neemt zijn rapporten mee', weg3.ok &&
    !db.prepare('SELECT 1 FROM kp_voertuig WHERE id = ?').get(v3.voertuig.id), JSON.stringify(weg3));

  // De nachtelijke opruimer: Anna's account is rijp. Eerst D1, dan Airtable.
  const oudFetch = global.fetch;
  const gewist = [];
  let d1Kapot = false;
  global.fetch = async (url, opt) => {
    if (opt && opt.method === 'DELETE') { gewist.push(url); return new Response('{}', { status: 200 }); }
    return new Response(JSON.stringify({ records: [{ id: 'recAnna', fields: { Email: 'Anna@Voorbeeld.nl', Status: 'verwijderd', VerwijderdOp: '2026-01-01T00:00:00.000Z' } }] }), { status: 200 });
  };
  const envOp = Object.assign({}, env, { AIRTABLE_TOKEN: 'x', LOGDB: new Proxy(env.LOGDB, { get: (t, k) => (k === 'prepare' && d1Kapot) ? () => { throw new Error('D1 weg'); } : t[k] }) });
  d1Kapot = true;
  let op = await W.klantWachtrijOpruimen(envOp, new Date('2026-09-27'));
  toets('D1 onbereikbaar: het account blijft staan (anders is de sleutel weg)', gewist.length === 0 && op.mislukt.some((m) => /d1_platform/.test(m.reden)), JSON.stringify(op.mislukt));
  d1Kapot = false;
  op = await W.klantWachtrijOpruimen(envOp, new Date('2026-09-27'));
  global.fetch = oudFetch;
  const annaId = await W.kpKlantId('anna@voorbeeld.nl');
  const rest = ['kp_voertuig', 'kp_rapport', 'kp_rit', 'kp_issue', 'kp_akkoord'].map((t) => db.prepare('SELECT COUNT(*) AS n FROM ' + t + ' WHERE klant_id = ?').get(annaId).n);
  toets('na de opruimer staat er van Anna niets meer in D1', rest.every((x) => x === 0), rest.join(','));
  toets('en is het Airtable-record daarna gewist', gewist.length === 1);
  toets('Bert is ongemoeid gebleven', db.prepare('SELECT COUNT(*) AS n FROM kp_voertuig WHERE klant_id != ?').get(annaId).n > 0);
  toets('alles_wissen door de klant zelf', (await roep(tokB, { actie: 'alles_wissen' })).ok &&
    db.prepare('SELECT COUNT(*) AS n FROM kp_voertuig').get().n === 0);

  console.log('\n7. Migratie op een tabel van vóór de nieuwe kolommen');
  {
    const W2 = await laadWorker();
    const db2 = new DatabaseSync(':memory:');
    const oud = W2.KP_SCHEMA.map((x) => x);
    oud.forEach((x) => db2.exec(x));                   // de tabel zoals hij op 27-09 live ging
    const env3 = Object.assign({}, env, { LOGDB: maakD1(db2) });
    const t3 = (await W2.makeToken(env3, 'cees@voorbeeld.nl', 'klant', 'Cees')).token;
    // Via de VERSE module: in W heeft kpSchema al gedraaid (en onthoudt dat).
    const r3 = await W2.default.fetch(new Request('https://app.pidlane.nl/klant/platform', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': t3, Origin: 'https://app.pidlane.nl' }, body: JSON.stringify({ actie: 'stand' }) }), env3, {});
    const s3 = await r3.json();
    const kol = db2.prepare("SELECT name FROM pragma_table_info('kp_voertuig')").all().map((r) => r.name);
    toets('de nieuwe kolommen staan er na de eerste aanroep', s3.ok && kol.indexOf('onderhoud_laatst') >= 0 && kol.indexOf('distributie') >= 0, JSON.stringify(s3) + ' ' + kol.join(','));

    // Een migratie die om een ándere reden faalt dan "staat er al", hoort
    // niet stil door te gaan: dan draait de app op een tabel die hij niet kent.
    const W3 = await laadWorker();
    const db3 = new DatabaseSync(':memory:');
    const d1kapot = maakD1(db3);
    const echtPrep = d1kapot.prepare;
    d1kapot.prepare = (sql) => /^ALTER/.test(sql) ? { run: async () => { throw new Error('D1_ERROR: disk I/O error'); } } : echtPrep(sql);
    const env4 = Object.assign({}, env, { LOGDB: d1kapot });
    const t4 = (await W3.makeToken(env4, 'dirk@voorbeeld.nl', 'klant', 'Dirk')).token;
    const r4 = await W3.default.fetch(new Request('https://app.pidlane.nl/klant/platform', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': t4, Origin: 'https://app.pidlane.nl' }, body: JSON.stringify({ actie: 'stand' }) }), env4, {});
    toets('een migratie die anders faalt dan "staat er al" geeft een fout, niet stil door', r4.status === 500, String(r4.status));
  }

  console.log('\n8. Eén schema');
  const inSql = W.KP_SCHEMA.every((s) => schemaSql.indexOf(s + ';') >= 0);
  toets('elk statement uit KP_SCHEMA staat letterlijk in schema.sql', inSql);
  const sqlKp = (schemaSql.match(/^CREATE (?:UNIQUE )?(?:TABLE|INDEX) IF NOT EXISTS (?:kp_|idx_kp_)[^\n]*;$/gm) || []).length;
  toets('en schema.sql heeft er niet meer (' + sqlKp + ' tegen ' + W.KP_SCHEMA.length + ')', sqlKp === W.KP_SCHEMA.length);
  toets('elke migratie staat letterlijk in schema.sql', W.KP_MIGRATIES.every((m) => schemaSql.indexOf(m + ';') >= 0));

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('FOUT test liep niet af: ' + (e && e.stack || e)); process.exit(1); });
