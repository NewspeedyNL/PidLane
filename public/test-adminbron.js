// ══════════════════════════════════════════════════════════════════
// test-adminbron.js — /admin/tabel: de witte lijst, de grendels en het masker
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
// /admin/tabel is één route die in zeven Airtable-tabellen kan lezen en in
// vijf ervan kan schrijven. Dat is precies het soort route waarbij een stille
// fout duur is:
//
//   • Zou de bron uit de URL rechtstreeks een base- en tabelnaam worden, dan
//     is één gelekte ADMIN_TOKEN een sleutel tot het hele Airtable-account —
//     ook tot bases die niets met PidLane te maken hebben.
//   • Zou `beschermd` niet werken, dan schrijft een PATCH langs deze route het
//     Saldo buiten metSaldoSlot() om, en dan is de race van #82/#93 terug via
//     de achterdeur.
//   • Zou `geheim` niet werken, dan staat er een wachtwoordhash en een
//     resettoken in de JSON die de beheerpagina inleest. Dat is genoeg om een
//     klantaccount over te nemen.
//
// DE TOETS MOET ONDERSCHEIDEN. Een geweigerde bewerking die tóch een 400
// teruggeeft omdat er iets ánders misging, bewijst niets — daarom kijkt elke
// weigering hieronder óók of er werkelijk geen PATCH of DELETE de deur uit
// ging. En bij het masker wordt de hele JSON doorzocht op de hashwaarde zelf:
// een masker dat het veld hernoemt in plaats van leegmaakt, valt daarmee door
// de mand.
//
// Draaien vanuit public/:  node test-adminbron.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── de echte code uit worker.js knippen ───────────────────────────
// Ankers en geen kopie: verdwijnt of hernoemt er iets, dan stopt deze test
// meteen in plaats van groen te blijven staan op code die niet meer draait.
const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const van = bron.indexOf('var ADMIN_BRONNEN = {');
const tot = bron.indexOf('__name(handleAdminTabelPost');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: het adminbrowser-blok is niet gevonden in worker.js.');
  process.exit(1);
}
const src = bron.slice(van, tot);

// ── nagemaakte omgeving ───────────────────────────────────────────
// `verzoeken` legt vast wat er werkelijk naar Airtable ging: dát is waar deze
// test naar kijkt, niet naar wat de handler teruggeeft.
function bouw(opties) {
  const o = opties || {};
  const staat = { verzoeken: [], antwoorden: (o.antwoorden || []).slice() };
  const omg = {
    adminOnly: () => o.admin !== false,
    json: (body, status) => ({ body, status: status || 200 }),
    resolveBase: (env, k) => 'app' + k.replace(/[^A-Za-z0-9]/g, '').slice(0, 12),
    cfg: (env, k) => 'tbl_' + k,
    klantFout: (e, m) => ({ body: { ok: false, error: m, uitzondering: String(e && e.message || e) }, status: 500 }),
    adminWriteLimited: async () => ({ limited: false }),
    rateLimitResponse: () => ({ body: { ok: false, error: 'rate' }, status: 429 }),
    fetch: async (url, init) => {
      staat.verzoeken.push({ url: String(url), method: (init && init.method) || 'GET', body: init && init.body });
      const a = staat.antwoorden.shift();
      if (a) return a;
      return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '{}' };
    },
    __name: () => {}
  };
  const maak = new Function(...Object.keys(omg),
    src + '\nreturn { get: handleAdminTabelGet, post: handleAdminTabelPost, bronnen: ADMIN_BRONNEN, masker: bronMasker, probleem: bronSchrijfProbleem };');
  const api = maak(...Object.values(omg));
  const env = { AIRTABLE_TOKEN: 'x' };
  return {
    staat, api,
    get: (qs) => api.get({ url: 'https://w.dev/admin/tabel?' + qs, headers: { get: () => '' } }, env),
    post: (body) => api.post({ json: async () => body, headers: { get: () => '1.2.3.4' } }, env)
  };
}
const okAntwoord = (records, offset) => ({
  ok: true, status: 200,
  json: async () => ({ records, offset: offset || undefined }),
  text: async () => '{}'
});
const foutAntwoord = (status, tekst) => ({
  ok: false, status,
  json: async () => ({}),
  text: async () => tekst || 'INVALID_FILTER_BY_FORMULA'
});
const schrijf = (v) => v.filter((x) => x.method === 'PATCH' || x.method === 'DELETE' || x.method === 'POST');

(async function () {

  // ── 1. de witte lijst ───────────────────────────────────────────
  console.log('\n1. Alleen bronnen uit de lijst, en niets daarbuiten');
  {
    const t = bouw();
    const r = await t.get('bron=log');
    toets('een bekende bron mag', r.body.ok === true, JSON.stringify(r.body).slice(0, 120));

    for (const kwaad of ['', 'appXyZ1234567', 'log/../users', 'Log', 'tblJiG83blVfRgPwi']) {
      const u = bouw();
      const rr = await u.get('bron=' + encodeURIComponent(kwaad));
      toets('geweigerd: "' + kwaad + '"',
        rr.status === 400 && rr.body.ok === false && u.staat.verzoeken.length === 0,
        'status ' + rr.status + ', ' + u.staat.verzoeken.length + ' verzoek(en)');
    }
    const p = bouw();
    const rp = await p.post({ bron: 'appXyZ1234567', actie: 'wis', id: 'rec0123456789abcd' });
    toets('ook op de schrijfroute', rp.status === 400 && schrijf(p.staat.verzoeken).length === 0);
  }

  // ── 2. het masker ───────────────────────────────────────────────
  // De hash mag nergens in het antwoord voorkomen — ook niet onder een andere
  // sleutel. Daarom wordt de complete JSON doorzocht.
  console.log('\n2. Wachtwoordhash en resettoken verlaten de Worker niet');
  {
    const hash = 'v1$abcdef0123456789$geheimezoutwaarde';
    const t = bouw({ antwoorden: [okAntwoord([
      { id: 'rec1', fields: { Email: 'a@b.nl', Naam: 'Jan', Saldo: 40, PassHash: hash, ResetToken: 'RT-9999', ResetVerloopt: '' } }
    ])] });
    const r = await t.get('bron=klanten');
    const tekst = JSON.stringify(r.body);
    toets('de hash staat niet in het antwoord', tekst.indexOf(hash) < 0, tekst.slice(0, 200));
    toets('het resettoken evenmin', tekst.indexOf('RT-9999') < 0);
    toets('maar je ziet dát er een hash staat',
      r.body.records[0].fields.PassHash === '••• verborgen', JSON.stringify(r.body.records[0].fields));
    toets('een leeg geheim veld blijft leeg', r.body.records[0].fields.ResetVerloopt === '');
    toets('gewone velden gaan ongewijzigd mee',
      r.body.records[0].fields.Email === 'a@b.nl' && r.body.records[0].fields.Saldo === 40);
    toets('de veldnamen komen mee voor de tabelkop', r.body.velden.indexOf('Naam') >= 0);
  }

  // ── 3. de grendels op schrijven ─────────────────────────────────
  console.log('\n3. Beschermde velden gaan hier niet doorheen');
  {
    const ID = 'rec0123456789abcd';
    const grendel = async (bronNaam, velden, waarom) => {
      const t = bouw();
      const r = await t.post({ bron: bronNaam, actie: 'wijzig', id: ID, velden });
      toets(waarom, r.body.ok === false && schrijf(t.staat.verzoeken).length === 0,
        'status ' + r.status + ' — ' + JSON.stringify(r.body).slice(0, 140));
    };
    await grendel('klanten', { Saldo: 9999 },        'Saldo hoort door het saldoslot, niet hierlangs');
    await grendel('klanten', { PassHash: 'x' },      'PassHash hoort door hashPassword()');
    await grendel('klanten', { Email: 'n@b.nl' },    'Email is de sleutel waarop het slot staat');
    await grendel('klanten', { Naam: 'ok', Saldo: 1 }, 'één verboden veld blokkeert de hele bewerking');
    await grendel('users',   { PassHash: 'x' },      'ook bij gebruikers');
    await grendel('log',     {},                     'niets om te schrijven is geen bewerking');
    await grendel('log',     { 'Message}) ,{': 'x' }, 'een veldnaam met formuletekens erin');

    const t = bouw({ antwoorden: [{ ok: true, status: 200, json: async () => ({ records: [{ id: ID, fields: { Naam: 'Jan' } }] }), text: async () => '{}' }] });
    const r = await t.post({ bron: 'klanten', actie: 'wijzig', id: ID, velden: { Naam: 'Jan' } });
    const pat = t.staat.verzoeken.filter((x) => x.method === 'PATCH');
    toets('een toegestaan veld gaat wél door', r.body.ok === true && pat.length === 1, JSON.stringify(r.body).slice(0, 140));
    toets('en wel als PATCH op dit record',
      pat.length === 1 && JSON.parse(pat[0].body).records[0].id === ID);
  }

  // ── 4. alleen-lezen bronnen ─────────────────────────────────────
  // AppConfig gaat via /api/config, want die route gooit ook de randcache weg.
  console.log('\n4. AppConfig is hier alleen-lezen');
  {
    const t = bouw();
    const r = await t.post({ bron: 'config', actie: 'wijzig', id: 'rec0123456789abcd', velden: { Value: 'x' } });
    toets('wijzigen wordt geweigerd', r.status === 403 && r.body.ok === false, 'status ' + r.status);
    toets('en er ging niets naar Airtable', schrijf(t.staat.verzoeken).length === 0);
    const l = bouw({ antwoorden: [okAntwoord([{ id: 'rec1', fields: { Key: 'banner_active' } }])] });
    const rl = await l.get('bron=config');
    toets('lezen mag wel', rl.body.ok === true && rl.body.schrijven === false);
  }

  // ── 5. wissen ───────────────────────────────────────────────────
  console.log('\n5. Wissen: geldige id’s, hoogstens tien, en in één verzoek');
  {
    const goed = ['rec0123456789abcd', 'recABCDEFGHIJKLMN', 'rec1111111111aaaa'];
    const t = bouw();
    const r = await t.post({ bron: 'log', actie: 'wis', ids: goed });
    const del = t.staat.verzoeken.filter((x) => x.method === 'DELETE');
    toets('drie records in één DELETE', r.body.ok === true && del.length === 1, JSON.stringify(r.body).slice(0, 120));
    toets('en alle drie de id’s staan erin', goed.every((i) => del[0].url.indexOf(i) >= 0), del[0] && del[0].url);

    const slecht = bouw();
    const rs = await slecht.post({ bron: 'log', actie: 'wis', ids: ['rec0123456789abcd', 'recKORT'] });
    toets('één ongeldig id blokkeert de hele wisactie',
      rs.body.ok === false && schrijf(slecht.staat.verzoeken).length === 0, JSON.stringify(rs.body).slice(0, 120));

    const veel = bouw();
    const rv = await veel.post({ bron: 'log', actie: 'wis', ids: new Array(11).fill('rec0123456789abcd') });
    toets('elf tegelijk wordt geweigerd in plaats van afgekapt',
      rv.body.ok === false && schrijf(veel.staat.verzoeken).length === 0, JSON.stringify(rv.body).slice(0, 120));

    const leeg = bouw();
    const rz = await leeg.post({ bron: 'log', actie: 'wis' });
    toets('zonder id gebeurt er niets', rz.body.ok === false && schrijf(leeg.staat.verzoeken).length === 0);

    const raar = bouw();
    const rr = await raar.post({ bron: 'log', actie: 'sloop', id: 'rec0123456789abcd' });
    toets('een onbekende actie doet niets', rr.body.ok === false && schrijf(raar.staat.verzoeken).length === 0);
  }

  // ── 6. de zoekformule ───────────────────────────────────────────
  // Onderscheidend: niet alleen "er staat een filterByFormula in", maar ook
  // dat een apostrof ontsnapt is. Zonder dat is een zoekterm met ' een
  // formulefout — en dus een lege lijst zonder uitleg.
  console.log('\n6. Zoeken bouwt een formule over de zoekvelden van die bron');
  {
    const t = bouw();
    await t.get('bron=log&q=' + encodeURIComponent("d'r naast"));
    const u = decodeURIComponent(t.staat.verzoeken[0].url);
    toets('er wordt gefilterd', u.indexOf('filterByFormula=') >= 0, u);
    toets('over Message én User', u.indexOf('{Message}') >= 0 && u.indexOf('{User}') >= 0, u);
    toets('de apostrof is ontsnapt', u.indexOf("d\\'r") >= 0, u);
    toets('en een getalveld wordt eerst tekst', u.indexOf("&''") >= 0, u);

    const v = bouw();
    await v.get('bron=log&q=abc&veld=Merk');
    const uv = decodeURIComponent(v.staat.verzoeken[0].url);
    toets('een gekozen veld beperkt de zoektocht daartoe',
      uv.indexOf('{Merk}') >= 0 && uv.indexOf('{Message}') < 0, uv);

    const w = bouw();
    const rw = await w.get('bron=log&q=abc&veld=' + encodeURIComponent("Merk}),{"));
    toets('een veldnaam met formuletekens wordt geweigerd',
      rw.status === 400 && w.staat.verzoeken.length === 0, 'status ' + rw.status);
  }

  // ── 7. sorteren, en de terugval ─────────────────────────────────
  // Een sorteerveld dat in die tabel niet bestaat geeft 422. Zonder terugval
  // is het antwoord dan leeg terwijl de gegevens er wél zijn.
  console.log('\n7. Sorteren, en wat er gebeurt als dat veld niet bestaat');
  {
    const t = bouw({ antwoorden: [okAntwoord([{ id: 'rec1', fields: { Timestamp: '2026-09-01T10:00:00Z' } }])] });
    const r = await t.get('bron=log');
    toets('standaard op Timestamp aflopend',
      decodeURIComponent(t.staat.verzoeken[0].url).indexOf('sort[0][field]=Timestamp') >= 0, t.staat.verzoeken[0].url);
    toets('en dat wordt gemeld', r.body.gesorteerd === true && r.body.sorteer === 'Timestamp');

    const f = bouw({ antwoorden: [foutAntwoord(422, 'UNKNOWN_FIELD_NAME'), okAntwoord([{ id: 'rec1', fields: { A: 1 } }])] });
    const rf = await f.get('bron=log');
    toets('bij 422 wordt het nog eens zonder sortering geprobeerd', f.staat.verzoeken.length === 2);
    toets('de tweede poging heeft geen sort meer',
      decodeURIComponent(f.staat.verzoeken[1].url).indexOf('sort[0]') < 0, f.staat.verzoeken[1].url);
    toets('en de records komen alsnog terug', rf.body.ok === true && rf.body.records.length === 1);
    toets('met de eerlijke mededeling dat er niet gesorteerd is', rf.body.gesorteerd === false);

    const s = bouw({ antwoorden: [foutAntwoord(500, 'SERVER_ERROR'), foutAntwoord(500, 'SERVER_ERROR')] });
    const rs = await s.get('bron=log');
    toets('blijft het misgaan, dan is het een fout en geen lege lijst',
      rs.status === 502 && rs.body.ok === false, 'status ' + rs.status);
  }

  // ── 8. de randen van de paginering ──────────────────────────────
  console.log('\n8. Paginagrootte en offset');
  {
    const t = bouw({ antwoorden: [okAntwoord([], 'itrABC')] });
    const r = await t.get('bron=log&limiet=5000');
    toets('een absurde limiet wordt teruggebracht naar 100',
      t.staat.verzoeken[0].url.indexOf('pageSize=100') >= 0, t.staat.verzoeken[0].url);
    toets('de offset van Airtable gaat door naar de pagina', r.body.offset === 'itrABC');

    const n = bouw();
    await n.get('bron=log&limiet=0');
    toets('0 telt als niet opgegeven en valt terug op 50',
      n.staat.verzoeken[0].url.indexOf('pageSize=50') >= 0, n.staat.verzoeken[0].url);

    const m = bouw();
    await m.get('bron=log&limiet=-5');
    toets('een negatieve limiet wordt 1 en geen kapotte URL',
      m.staat.verzoeken[0].url.indexOf('pageSize=1&') >= 0, m.staat.verzoeken[0].url);

    const o = bouw();
    await o.get('bron=log&offset=itrXYZ');
    toets('een meegegeven offset gaat mee', o.staat.verzoeken[0].url.indexOf('offset=itrXYZ') >= 0, o.staat.verzoeken[0].url);
  }

  // ── 9. zonder token gebeurt er niets ────────────────────────────
  console.log('\n9. Zonder geldige admin-token');
  {
    const g = bouw({ admin: false });
    const rg = await g.get('bron=log');
    toets('lezen wordt geweigerd', rg.status === 403 && g.staat.verzoeken.length === 0, 'status ' + rg.status);
    const p = bouw({ admin: false });
    const rp = await p.post({ bron: 'log', actie: 'wis', id: 'rec0123456789abcd' });
    toets('schrijven ook', rp.status === 403 && p.staat.verzoeken.length === 0, 'status ' + rp.status);
  }

  // ── 10. de lijst zelf ───────────────────────────────────────────
  // Een bron erbij zetten zonder na te denken over `geheim` is de fout die
  // deze test moet vangen: de Klanten- en Users-tabel dragen allebei een hash.
  console.log('\n10. De bronlijst zelf');
  {
    const t = bouw();
    const B = t.api.bronnen;
    toets('klanten schermt PassHash én ResetToken af',
      B.klanten.geheim.indexOf('PassHash') >= 0 && B.klanten.geheim.indexOf('ResetToken') >= 0);
    toets('users schermt PassHash af', B.users.geheim.indexOf('PassHash') >= 0);
    toets('elke bron heeft een base- en tabelsleutel',
      Object.keys(B).every((k) => /^AIRTABLE_/.test(B[k].baseKey) && /^AIRTABLE_/.test(B[k].tableKey)));
    toets('geen enkele bron noemt een base rechtstreeks',
      Object.keys(B).every((k) => !/^app[A-Za-z0-9]{10,}$/.test(String(B[k].baseKey))));
    toets('elk geheim veld is ook beschermd tegen schrijven',
      Object.keys(B).every((k) => (B[k].geheim || []).every((v) => !B[k].schrijven || B[k].beschermd.indexOf(v) >= 0)));
  }

  console.log('\n' + (fouten ? fouten + ' FOUT(EN)' : 'Alles goed'));
  process.exit(fouten ? 1 : 0);
})();
