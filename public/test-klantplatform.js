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
  toets('een naam uit "Rit beëindigen" gaat mee, schoongemaakt en ingekort', (await roep(tokA, { actie: 'rit_opslaan', voertuig_id: v1.voertuig.id, rit: { start: '2026-09-27T10:00:00.000Z', km: 3, label: '  Naar de bakker\n en terug, via de lange weg langs het kanaal  ' } })).ok &&
    db.prepare("SELECT label FROM kp_rit WHERE start = '2026-09-27T10:00:00.000Z'").get().label === 'Naar de bakker  en terug, via de lange w');

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
  toets('stand telt rapporten, ritten en open issues', mz.aantal.rapporten === 1 && mz.aantal.ritten === 3 && mz.aantal.openIssues === 0, JSON.stringify(mz.aantal));

  console.log('\n4b. Voorkeuren en de sensorselectie per voertuig');
  const tokV = (await W.makeToken(env, 'vera@voorbeeld.nl', 'klant', 'Vera')).token;
  toets('voorkeuren zonder akkoord op Mijn voertuigen: mag', (await roep(tokV, { actie: 'voorkeuren' })).ok === true);
  const vk = await roep(tokV, { actie: 'voorkeuren_opslaan', voorkeur: { weergave: 'visueel', tekst: 'l', letter: 15, waakronde: true,
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
  console.log('\n4c. Versnellingen, het geleerde model en ritlabels (27-09-2026)');
  const vs = await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, transmissie: 'Automaat', versnellingen: 8 } });
  toets('handbak/automaat en het aantal versnellingen worden bewaard', vs.ok && vs.voertuig.transmissie === 'automaat' && vs.voertuig.versnellingen === 8, JSON.stringify(vs).slice(0, 200));
  toets('elf versnellingen is geen auto', (await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, versnellingen: 11 } }))._status === 400);
  toets('het model gaat niet via voertuig_opslaan de tabel in', !((await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, gear_model: { hist: {} } } })).voertuig || {}).gear_model);
  const gm = { v: 1, hist: { '150': 40, '171': 55 }, totaal: 95, gears: [9.5, 13.1], ankers: [{ k: 2, r: 13.1, t: 1 }], offset: 0 };
  toets('versnellingsmodel bewaard', (await roep(tokA, { actie: 'versnelling_opslaan', voertuig_id: v1.voertuig.id, model: gm })).ok);
  st = await roep(tokA, { actie: 'stand' });
  const mg = st.voertuigen.find((v) => v.id === v1.voertuig.id);
  toets('en in de stand terug als object', mg.gear_model && mg.gear_model.totaal === 95 && mg.gear_model.ankers[0].k === 2, JSON.stringify(mg.gear_model));
  toets('geen model maar een lijst: 400', (await roep(tokA, { actie: 'versnelling_opslaan', voertuig_id: v1.voertuig.id, model: [1, 2] }))._status === 400);
  const groot = { v: 1, hist: {}, totaal: 1, gears: [] };
  for (let i = 0; i < 3000; i++) groot.hist[String(i)] = i;
  toets('een model boven 16 kB: 413', (await roep(tokA, { actie: 'versnelling_opslaan', voertuig_id: v1.voertuig.id, model: groot }))._status === 413);
  toets('Bert kan Anna\'s model niet zetten', (await roep(tokB, { actie: 'versnelling_opslaan', voertuig_id: v1.voertuig.id, model: gm }))._status === 404);
  toets('model wissen (opnieuw leren) mag', (await roep(tokA, { actie: 'versnelling_opslaan', voertuig_id: v1.voertuig.id, model: null })).ok &&
    db.prepare('SELECT gear_model FROM kp_voertuig WHERE id = ?').get(v1.voertuig.id).gear_model === null);
  const ritId = rr.ritten[0].id;
  const lb = await roep(tokA, { actie: 'rit_label', id: ritId, label: '  Caravan naar Frankrijk, heen en terug, met de hele familie erbij  ' });
  toets('ritlabel bewaard, ingekort tot 40 tekens', lb.ok && lb.label === 'Caravan naar Frankrijk, heen en terug, m', JSON.stringify(lb));
  toets('en terug in de ritten', (await roep(tokA, { actie: 'ritten', voertuig_id: v1.voertuig.id })).ritten.some((r) => r.id === ritId && r.label === lb.label));
  toets('Bert kan het label niet zetten', (await roep(tokB, { actie: 'rit_label', id: ritId, label: 'x' }))._status === 404);
  toets('leeg label = weg', (await roep(tokA, { actie: 'rit_label', id: ritId, label: '' })).label === null &&
    db.prepare('SELECT label FROM kp_rit WHERE id = ?').get(ritId).label === null);

  const tp = await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, tankinhoud: 56, brandstofprijs: '1,959' } });
  toets('tankinhoud en literprijs, met drie decimalen', tp.ok && tp.voertuig.tankinhoud === 56 && tp.voertuig.brandstofprijs === 1.959, JSON.stringify(tp).slice(0, 300));
  const ck = await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, carrosserie: 'suv', kleur: 'rood' } });
  toets('carrosserie en kleur worden niet meer bewaard (het icoon is weg)', ck.ok && !ck.voertuig.carrosserie && !ck.voertuig.kleur);
  const gr = await roep(tokA, { actie: 'rit_opslaan', voertuig_id: v1.voertuig.id, rit: { start: '2026-09-27T12:00:00.000Z', km: 12, extra: { gear: { v: 1, bin: 0.015, n: 300, h: { '171': 150, '199': 150 } } } } });
  toets('een rit draagt het histogram van de versnellingsindicator mee', gr.ok &&
    (await roep(tokA, { actie: 'ritten', voertuig_id: v1.voertuig.id })).ritten.some((r) => r.extra && r.extra.gear && r.extra.gear.n === 300));
  toets('een literprijs van € 50 is een tikfout: 400', (await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, brandstofprijs: 50 } }))._status === 400);
  // Eigen PIDs per voertuig (27-09-2026): alleen leescodes, formule zonder code.
  const ep = await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, eigen_pids: [
    { code: '221e1c', naam: 'Temperatuur automaat', formule: 'A - 40', eenheid: '°C', min: -40, max: 150 },
    { code: '221E1C', naam: 'dubbel', formule: 'A' }, { code: '2101', naam: 'Blok 01', formule: '(A*256+B)/10' }] } });
  toets('eigen PIDs: bewaard als lijst, code in hoofdletters, dubbele eruit', ep.ok && Array.isArray(ep.voertuig.eigen_pids) &&
    ep.voertuig.eigen_pids.length === 2 && ep.voertuig.eigen_pids[0].code === '221E1C' && ep.voertuig.eigen_pids[0].formule === 'A-40' &&
    ep.voertuig.eigen_pids[0].max === 150, JSON.stringify(ep).slice(0, 300));
  const epFout = async (e) => (await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, eigen_pids: [Object.assign({ naam: 'x', formule: 'A' }, e)] } }))._status;
  toets('eigen PIDs: een schrijfcode (2E) is 400', await epFout({ code: '2E1E1C' }) === 400);
  toets('eigen PIDs: een routine (31) is 400', await epFout({ code: '31010203' }) === 400);
  toets('eigen PIDs: mode 01 hoort er niet in (400)', await epFout({ code: '0105' }) === 400);
  toets('eigen PIDs: code in een formule is 400', await epFout({ code: '221E1C', formule: 'fetch(1)' }) === 400);
  toets('eigen PIDs: zonder naam is 400', await epFout({ code: '221E1C', naam: '' }) === 400);
  toets('eigen PIDs: 21 stuks is er één te veel (400)', (await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id,
    eigen_pids: Array.from({ length: 21 }, (_, i) => ({ code: '2210' + String(i).padStart(2, '0'), naam: 'x' })) } }))._status === 400);
  toets('eigen PIDs: na de weigeringen staat de goede lijst er nog', (await roep(tokA, { actie: 'stand' })).voertuigen.find((v) => v.id === v1.voertuig.id).eigen_pids.length === 2);
  const ra = await roep(tokA, { actie: 'rapport_opslaan', voertuig_id: v1.voertuig.id, soort: 'waak', tekst: 'een' });
  const rb = await roep(tokA, { actie: 'rapport_opslaan', voertuig_id: v1.voertuig.id, soort: 'waak', tekst: 'twee' });
  const rBert = await roep(tokB, { actie: 'voertuig_opslaan', voertuig: { naam: 'Bert2' } });
  const rbx = rBert.ok ? await roep(tokB, { actie: 'rapport_opslaan', voertuig_id: rBert.voertuig.id, soort: 'waak', tekst: 'van bert' }) : { id: 'geen' };
  const weg = await roep(tokA, { actie: 'rapport_verwijder', ids: [ra.id, rb.id, rbx.id] });
  toets('meerdere rapporten tegelijk wissen, en die van een ander tellen niet mee', weg.ok && weg.gewist === 2 &&
    db.prepare('SELECT COUNT(*) AS n FROM kp_rapport WHERE id = ?').get(rbx.id).n === 1, JSON.stringify(weg));
  toets('een lege lijst: 400', (await roep(tokA, { actie: 'rapport_verwijder', ids: [] }))._status === 400);

  // ECU-adres en tempo per eigen PID, en de gedeelde bibliotheek (27-09-2026).
  const ecuFout = async (e) => (await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, eigen_pids: [Object.assign({ code: '221E1C', naam: 'x' }, e)] } }))._status;
  toets('ECU-adres: 7E1 en 18DA18F1 mogen', await ecuFout({ ecu: '7e1' }) === 200 && await ecuFout({ ecu: '18DA18F1' }) === 200);
  toets('ECU-adres: 7DF (functioneel) of rommel is 400', await ecuFout({ ecu: 'ATZ' }) === 400 && await ecuFout({ ecu: '18DB33F1' }) === 400);
  await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, merk: 'Mazda', model: 'CX-5 2.2 Skyactiv-D', eigen_pids: [
    { code: '221E1C', ecu: '7E1', naam: 'Temperatuur automaat', formule: 'A-40', eenheid: '°C', tempo: 'traag' }] } });
  const epT = (await roep(tokA, { actie: 'stand' })).voertuigen.find((v) => v.id === v1.voertuig.id).eigen_pids[0];
  toets('ECU-adres en tempo worden bewaard', epT.ecu === '7E1' && epT.tempo === 'traag', JSON.stringify(epT));
  const tmp = await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, eigen_pids: [
    { code: '222A05', naam: 'Bandenspanning voor-links', ecu: '720', tempo: 'minuut' }, { code: '222A06', naam: 'Bandenspanning voor-rechts', ecu: '720', tempo: 'normaal' },
    { code: '222A07', naam: 'Bandenspanning achter-links', ecu: '720' }, { code: '222A08', naam: 'x', tempo: 'elke eeuw' }] } });
  toets('tempo: minuut en een gekozen "normaal" blijven staan, niets of onzin = geen tempo (de app kiest)', tmp.ok &&
    JSON.stringify(tmp.voertuig.eigen_pids.map((e) => e.tempo || '')) === '["minuut","normaal","",""]', JSON.stringify(tmp.voertuig && tmp.voertuig.eigen_pids));
  await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, eigen_pids: [
    { code: '221E1C', ecu: '7E1', naam: 'Temperatuur automaat', formule: 'A-40', eenheid: '°C', tempo: 'traag' }] } });
  toets('bibliotheek: delen kan alleen wat bij het voertuig staat', (await roep(tokA, { actie: 'pidbib_deel', voertuig_id: v1.voertuig.id, code: '229999' }))._status === 404);
  const deel = await roep(tokA, { actie: 'pidbib_deel', voertuig_id: v1.voertuig.id, code: '221E1C', ecu: '7E1' });
  toets('bibliotheek: Anna deelt haar bewezen code', deel.ok && !!deel.id, JSON.stringify(deel));
  await roep(tokB, { actie: 'voertuig_opslaan', voertuig: { id: rBert.voertuig.id, merk: 'MAZDA', model: 'cx5' } });
  let bl = await roep(tokB, { actie: 'pidbib_lijst', voertuig_id: rBert.voertuig.id });
  toets('bibliotheek: Bert (MAZDA cx5) ziet hem, met één "werkt"', bl.ok && bl.merk === 'mazda' && bl.model === 'cx5' && bl.lijst.length === 1 &&
    bl.lijst[0].code === '221E1C' && bl.lijst[0].ecu === '7E1' && bl.lijst[0].werkt === 1 && bl.lijst[0].bron === 'klant', JSON.stringify(bl));
  toets('bibliotheek: zonder klant, voertuig of kenteken erin', !('klant_id' in bl.lijst[0]) && !('voertuig_id' in bl.lijst[0]) &&
    db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('kp_pid_bib') WHERE name LIKE '%klant%' OR name LIKE '%voertuig%'").get().n === 0);
  await roep(tokB, { actie: 'pidbib_stem', voertuig_id: rBert.voertuig.id, id: deel.id, uitkomst: 'werkt_niet' });
  await roep(tokB, { actie: 'pidbib_stem', voertuig_id: rBert.voertuig.id, id: deel.id, uitkomst: 'werkt_niet' });
  bl = await roep(tokB, { actie: 'pidbib_lijst', voertuig_id: rBert.voertuig.id });
  toets('bibliotheek: twee keer stemmen telt één keer, en de eigen stem komt terug', bl.lijst[0].werkt === 1 && bl.lijst[0].werkt_niet === 1 && bl.lijst[0].mijn === 'werkt_niet', JSON.stringify(bl.lijst[0]));
  toets('bibliotheek: stemmen met een verzonnen uitkomst is 400', (await roep(tokB, { actie: 'pidbib_stem', voertuig_id: rBert.voertuig.id, id: deel.id, uitkomst: 'geweldig' }))._status === 400);
  const kand = await roep(tokB, { actie: 'pidbib_kandidaten', voertuig_id: rBert.voertuig.id, lijst: [
    { code: '220202', naam: 'Olietemperatuur', formule: 'A-40', eenheid: '°C', url: 'https://forum.voorbeeld.nl/cx5-pids' },
    { code: '2E0202', naam: 'schrijven', formule: 'A', url: 'https://x.nl' },
    { code: '220303', naam: 'zonder bron', formule: 'A' },
    { code: '220404', naam: 'script', formule: 'A', url: 'javascript:alert(1)' },
    { code: '221E1C', ecu: '7E1', naam: 'dubbel', formule: 'A', url: 'https://x.nl' }] });
  toets('kandidaten: alleen leescodes met een echte bron-URL, geen dubbele', kand.ok && kand.erbij === 1 && kand.geweigerd === 3, JSON.stringify(kand));
  bl = await roep(tokA, { actie: 'pidbib_lijst', voertuig_id: v1.voertuig.id });
  const online = bl.lijst.find((x) => x.code === '220202');
  toets('kandidaten: Anna ziet de online kandidaat, met de bron en nog niet getest', !!online && online.bron === 'online' && /forum/.test(online.url) && online.werkt === 0, JSON.stringify(bl.lijst));
  toets('kandidaten: meer dan 20 in één keer is 400', (await roep(tokB, { actie: 'pidbib_kandidaten', voertuig_id: rBert.voertuig.id,
    lijst: Array.from({ length: 21 }, () => ({ code: '220505', naam: 'x', url: 'https://x.nl' })) }))._status === 400);
  const vKia = await roep(tokB, { actie: 'voertuig_opslaan', voertuig: { naam: 'Kia', merk: 'Kia', model: 'Ceed' } });
  toets('een ander merk ziet de Mazda-codes niet', vKia.ok && (await roep(tokB, { actie: 'pidbib_lijst', voertuig_id: vKia.voertuig.id })).lijst.length === 0);
  // De VIN als master voor de techniek (28-09-2026).
  const VINP = 'aaaabbbbccccdddd';
  await roep(tokA, { actie: 'voertuig_opslaan', voertuig: { id: v1.voertuig.id, vin_pseudo: VINP, transmissie: 'automaat', versnellingen: 6, kmstand: 84000, notities: 'van Anna' } });
  // Een derde account met dezelfde auto maar een akkoord van een oudere versie: doet niet mee.
  db.prepare("INSERT INTO kp_voertuig (id, klant_id, status, vin_pseudo, merk, aangemaakt, bijgewerkt) VALUES ('oud1', 'klant-oud', 'actief', ?, 'Oud', '2026-01-01', '2026-01-01')").run(VINP);
  db.prepare("INSERT INTO kp_akkoord (klant_id, versie, op) VALUES ('klant-oud', '2026-09-01', '2026-09-01')").run();
  await roep(tokB, { actie: 'voertuig_archiveer', id: vKia.voertuig.id });   // Bert zit anders op zijn drie actieve voertuigen
  const vinB = await roep(tokB, { actie: 'voertuig_opslaan', voertuig: { naam: 'Bert CX', vin_pseudo: VINP } });
  toets('VIN: een tweede account dat dezelfde auto koppelt, krijgt de techniek (automaat, 6, eigen PIDs)', vinB.ok &&
    vinB.voertuig.transmissie === 'automaat' && vinB.voertuig.versnellingen === 6 && Array.isArray(vinB.voertuig.eigen_pids) && vinB.voertuig.eigen_pids.length === 1,
    JSON.stringify(vinB.voertuig));
  toets('VIN: maar niet de km-stand, de notities of het kenteken van de ander', vinB.voertuig.kmstand == null && !vinB.voertuig.notities && !vinB.voertuig.kenteken, JSON.stringify(vinB.voertuig));
  await roep(tokB, { actie: 'voertuig_opslaan', voertuig: { id: vinB.voertuig.id, motor: '2.0 Skyactiv-G', kmstand: 5000 } });
  const annaNa = (await roep(tokA, { actie: 'stand' })).voertuigen.find((v) => v.id === v1.voertuig.id);
  toets('VIN: wat Bert aan techniek zet, staat ook bij Anna — zijn km-stand niet', annaNa.motor === '2.0 Skyactiv-G' && annaNa.kmstand === 84000, JSON.stringify({ m: annaNa.motor, km: annaNa.kmstand }));
  await roep(tokA, { actie: 'versnelling_opslaan', voertuig_id: v1.voertuig.id, model: { hist: { '171': 40 }, ankers: [] } });
  const bertGear = (await roep(tokB, { actie: 'stand' })).voertuigen.find((v) => v.id === vinB.voertuig.id).gear_model;
  toets('VIN: het geleerde versnellingsmodel volgt de auto', bertGear && bertGear.hist && bertGear.hist['171'] === 40, JSON.stringify(bertGear));
  const oud = db.prepare("SELECT motor, transmissie, gear_model FROM kp_voertuig WHERE id = 'oud1'").get();
  toets('VIN: een account met een ouder akkoord krijgt niets (het delen staat pas in de nieuwe tekst)', !oud.motor && !oud.transmissie && !oud.gear_model, JSON.stringify(oud));
  await roep(tokB, { actie: 'voertuig_opslaan', voertuig: { id: vinB.voertuig.id, merk: 'Mazda' } });
  toets('VIN: en geeft ook niets door (het oude account staat niet bij de bron)', db.prepare("SELECT merk FROM kp_voertuig WHERE id = 'oud1'").get().merk === 'Oud');
  db.prepare("DELETE FROM kp_voertuig WHERE id = 'oud1'").run(); db.prepare("DELETE FROM kp_akkoord WHERE klant_id = 'klant-oud'").run();

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
  const rest = ['kp_voertuig', 'kp_rapport', 'kp_rit', 'kp_issue', 'kp_pid_stem', 'kp_akkoord'].map((t) => db.prepare('SELECT COUNT(*) AS n FROM ' + t + ' WHERE klant_id = ?').get(annaId).n);
  toets('na de opruimer staat er van Anna niets meer in D1', rest.every((x) => x === 0), rest.join(','));
  toets('en is het Airtable-record daarna gewist', gewist.length === 1);
  toets('Bert is ongemoeid gebleven', db.prepare('SELECT COUNT(*) AS n FROM kp_voertuig WHERE klant_id != ?').get(annaId).n > 0);
  toets('alles_wissen door de klant zelf', (await roep(tokB, { actie: 'alles_wissen' })).ok &&
    db.prepare('SELECT COUNT(*) AS n FROM kp_voertuig').get().n === 0);
  toets('alles_wissen neemt de stemmen in de PID-bibliotheek mee; de gedeelde codes blijven',
    db.prepare('SELECT COUNT(*) AS n FROM kp_pid_stem').get().n === 0 && db.prepare('SELECT COUNT(*) AS n FROM kp_pid_bib').get().n === 2);

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

    // Het icoon is weggehaald: wat er al aan carrosserie en kleur stond, wist
    // de volgende start. Nagebouwd als een voertuig van vóór die start.
    const W5 = await laadWorker();
    db2.prepare("INSERT INTO kp_voertuig (id, klant_id, status, carrosserie, kleur, aangemaakt, bijgewerkt) VALUES ('x5', 'k', 'actief', 'suv', 'rood', 'nu', 'nu')").run();
    await W5.default.fetch(new Request('https://app.pidlane.nl/klant/platform', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': t3, Origin: 'https://app.pidlane.nl' }, body: JSON.stringify({ actie: 'stand' }) }), env3, {});
    const x5 = db2.prepare("SELECT carrosserie, kleur FROM kp_voertuig WHERE id = 'x5'").get();
    toets('carrosserie en kleur van vóór het weghalen van het icoon zijn gewist', x5.carrosserie === null && x5.kleur === null, JSON.stringify(x5));

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
