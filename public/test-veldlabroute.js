// ══════════════════════════════════════════════════════════════════
// test-veldlabroute.js — /airtable/veldlab en /airtable/reference schrijven in D1 (#327)
// ──────────────────────────────────────────────────────────────────
// WAAROM. De veldlab-sessies en de referentiewaarden gingen tot 01-10-2026
// met typecast naar Airtable; de routes deden niets anders dan doorgeven.
// Sinds #327 schrijven ze in D1, via dezelfde laag als Klanten en het
// kasboek. Wat de app ervan merkt, moet gelijk blijven:
//   • een geslaagde batch geeft 200, en de app haalt hem uit zijn wachtrij;
//   • een onbekend veld geeft 422, zoals Airtable: de batch blijft staan;
//   • referentie werkt bij op RefID, en maakt aan als hij er niet is;
//   • zonder geldig app-token gebeurt er niets.
// De routes heten nog /airtable/…: de app kent die adressen, en een nieuwe
// naam is mechanisch werk voor een eigen commit.
//
// De ECHTE worker.js, door de echte router heen, met een echte SQLite.
//
// Draaien vanuit public/:  node test-veldlabroute.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { maakD1 } = require(path.join(__dirname, '..', 'pltest-d1.js'));

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
async function laadWorker() {
  const i = bron.lastIndexOf('export {');
  if (i < 0) throw new Error('export-blok niet gevonden in worker.js');
  const mod = bron.slice(0, i) + 'export { worker_default as default, makeToken };\n';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'veldlab-')), 'worker.mjs');
  fs.writeFileSync(f, mod);
  return import('file://' + f);
}

global.fetch = async (url) => { throw new Error('onverwachte fetch in deze test: ' + url); };

(async () => {
  const W = await laadWorker();
  const db = new DatabaseSync(':memory:');
  const env = { LOGDB: maakD1(db), SESSION_SECRET: 'test-geheim-dat-lang-genoeg-is-0123456789' };
  const tok = (await W.makeToken(env, 'monteur', 'user', 'Monteur')).token;
  const stuur = async (pad, records, token) => {
    const r = await W.default.fetch(new Request('https://api.pidlane.nl' + pad, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.pidlane.nl', 'X-App-Token': token === undefined ? tok : token },
      body: JSON.stringify({ records })
    }), env, { waitUntil() {} });
    let d = {};
    try { d = await r.json(); } catch (e) { d = { _geenJson: true }; }
    return { status: r.status, d };
  };
  const tel = (t) => { try { return db.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n; } catch (e) { return 0; } };

  console.log('\n1. Een veldlab-batch komt in D1');
  {
    const r = await stuur('/airtable/veldlab', [
      { fields: { SessieID: 'survey-1', Merk: 'Mazda', PidsOk: 31, JSON: '{"a":1}' } },
      { fields: { SessieID: 'survey-2', Merk: 'Renault', PidsOk: 12 } }
    ]);
    toets('200', r.status === 200, r.status + ' ' + JSON.stringify(r.d).slice(0, 160));
    toets('twee records terug, met een rec-id', Array.isArray(r.d.records) && r.d.records.length === 2 && /^rec/.test(r.d.records[0].id));
    toets('en twee rijen in veldlab_sessies', tel('veldlab_sessies') === 2);
    const rij = db.prepare('SELECT "PidsOk" AS p, "JSON" AS j FROM veldlab_sessies WHERE "SessieID" = ?').get('survey-1');
    toets('PidsOk is een getal en JSON is bewaard', rij && rij.p === 31 && rij.j === '{"a":1}', JSON.stringify(rij));
  }

  console.log('\n2. Een onbekend veld: 422, zoals Airtable, en de batch blijft bij de app');
  {
    const r = await stuur('/airtable/veldlab', [{ fields: { SessieID: 'survey-3' } }, { fields: { SessieID: 'survey-4', Bestaatniet: 1 } }]);
    toets('422', r.status === 422, r.status + ' ' + JSON.stringify(r.d).slice(0, 160));
    toets('het veld staat in de melding', /Bestaatniet/.test(String(r.d.detail)), JSON.stringify(r.d));
    toets('er kwam niets bij, ook het goede record ervoor niet', tel('veldlab_sessies') === 2, tel('veldlab_sessies') + ' rijen');
  }

  console.log('\n3. Referentie: bijwerken op RefID, aanmaken als hij er niet is');
  {
    const a = await stuur('/airtable/reference', [{ fields: { RefID: 'mazda|cx-5|2018|x', Bevestigingen: 1 } }]);
    const b = await stuur('/airtable/reference', [{ fields: { RefID: 'mazda|cx-5|2018|x', Bevestigingen: 2 } }, { fields: { RefID: 'renault|clio|2007|y', Bevestigingen: 1 } }]);
    toets('beide 200', a.status === 200 && b.status === 200, a.status + '/' + b.status);
    toets('twee rijen, niet drie', tel('referentie') === 2, tel('referentie') + ' rijen');
    toets('de eerste is bijgewerkt', db.prepare('SELECT "Bevestigingen" AS b FROM referentie WHERE "RefID" = ?').get('mazda|cx-5|2018|x').b === 2);
    const z = await stuur('/airtable/reference', [{ fields: { Merk: 'zonder RefID' } }]);
    toets('zonder RefID: 400', z.status === 400, String(z.status));
  }

  console.log('\n4. Zonder geldig app-token');
  {
    const r = await stuur('/airtable/veldlab', [{ fields: { SessieID: 'x' } }], 'fout-token');
    toets('401', r.status === 401, String(r.status));
    toets('en er kwam niets bij', tel('veldlab_sessies') === 2);
  }

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('FOUT test liep niet af: ' + (e && e.stack || e)); process.exit(1); });
