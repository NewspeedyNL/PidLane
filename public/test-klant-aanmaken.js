// ══════════════════════════════════════════════════════════════════
// test-klant-aanmaken.js — een klantaccount vanuit het beheer
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT GETOETST WORDT
// `aanmaken` is de enige actie in handleAdminKlantenPost die een record
// máákt in plaats van er een te wijzigen, en dat brengt twee fouten in bereik
// die de andere acties niet hebben:
//
//   1. Hij heeft geen record-id. De id-eis bovenaan de handler moest daarvoor
//      opengezet worden, en dat is precies het soort uitzondering dat te ruim
//      wordt gemaakt. Deel 5 kijkt of de eis voor de ándere acties nog staat.
//   2. Hij krijgt een wachtwoord binnen. Zou dat ruw in Airtable belanden, dan
//      staat er een "hash" die op niets slaat en kan niemand meer inloggen —
//      terwijl de rij er goed uitziet. Deel 3 zoekt de ruwe waarde daarom in
//      de complete verzendbody, niet alleen in het veld waar hij hoort.
//
// En het geval dat in de praktijk het eerst voorkomt: hetzelfde adres twee
// keer. Airtable dwingt uniekheid niet af, dus twee rijen is geen foutmelding
// maar een raadsel — login pakt de eerste, de beheerder boekt op de tweede bij.
//
// Draaien vanuit public/:  node test-klant-aanmaken.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const van = bron.indexOf('async function handleAdminKlantenPost');
const tot = bron.indexOf('__name(handleAdminKlantenPost');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: handleAdminKlantenPost niet gevonden in worker.js.');
  process.exit(1);
}
const src = bron.slice(van, tot);

// `bestaat` bepaalt of klantZoek() een klant vindt: dat is de dubbelcontrole.
function bouw(opties) {
  const o = opties || {};
  const staat = { verzoeken: [], audits: [] };
  const omg = {
    adminOnly: () => true,
    json: (body, status) => ({ body, status: status || 200 }),
    klantTabel: () => ({ base: 'appX', table: 'Klanten', hdr: {} }),
    klantPatch: async () => {},
    klantAudit: async (env, id, tekst, door) => { staat.audits.push({ id, tekst, door }); return true; },
    klantFout: (e, m) => ({ body: { ok: false, error: m }, status: 500 }),
    klantEmailOk: (e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(e || '')),
    klantZoek: async () => (o.bestaat ? { id: 'recAlBestaand01' } : null),
    klantWachtwoordProbleem: (p) => (String(p).length < 8 ? 'Minimaal 8 tekens.' : ''),
    hashPassword: async (p) => 'HASH(' + String(p).length + ')',
    metSaldoSlot: async (env, adres, fn) => ({ bezet: false, result: await fn() }),
    fetch: async (url, init) => {
      staat.verzoeken.push({ url: String(url), method: (init && init.method) || 'GET', body: init && init.body });
      if (o.airtableStuk) return { ok: false, status: 422, text: async () => 'INVALID_VALUE_FOR_COLUMN', json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ records: [{ id: 'recNieuw12345678', fields: {} }] }), text: async () => '{}' };
    },
    __name: () => {}
  };
  const maak = new Function(...Object.keys(omg), src + '\nreturn handleAdminKlantenPost;');
  const fn = maak(...Object.values(omg));
  return { staat, roep: (body) => fn({ json: async () => body }, { AIRTABLE_TOKEN: 'x' }) };
}
const posts = (v) => v.filter((x) => x.method === 'POST');
const basis = { actie: 'aanmaken', email: 'nieuw@klant.nl', naam: 'Nieuwe Klant' };

(async function () {

  // ── 1. het gewone geval ─────────────────────────────────────────
  console.log('\n1. Een account aanmaken zonder wachtwoord');
  {
    const t = bouw();
    const r = await t.roep(Object.assign({}, basis, { door: 'nico' }));
    const p = posts(t.staat.verzoeken);
    toets('antwoord is ok met 201', r.body.ok === true && r.status === 201, 'status ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 120));
    toets('er is één record aangemaakt', p.length === 1);
    const f = p.length ? JSON.parse(p[0].body).records[0].fields : {};
    toets('met het e-mailadres in kleine letters', f.Email === 'nieuw@klant.nl', JSON.stringify(f));
    toets('saldo begint op 0', f.Saldo === 0);
    toets('TotaalGekocht ook', f.TotaalGekocht === 0);
    toets('status is actief', f.Status === 'actief');
    toets('Aangemaakt is gevuld met een ISO-tijd', /^\d{4}-\d{2}-\d{2}T/.test(String(f.Aangemaakt || '')), String(f.Aangemaakt));
    toets('er staat GEEN PassHash in', f.PassHash === undefined, JSON.stringify(f));
    toets('het antwoord meldt dat er geen wachtwoord is', r.body.metWachtwoord === false);
    toets('de auditregel hangt aan het nieuwe record', t.staat.audits[0] && t.staat.audits[0].id === 'recNieuw12345678');
    toets('en noemt de beheerder', t.staat.audits[0] && t.staat.audits[0].door === 'nico');
  }

  // ── 2. hoofdletters en spaties in het adres ─────────────────────
  console.log('\n2. Het adres wordt genormaliseerd');
  {
    const t = bouw();
    await t.roep(Object.assign({}, basis, { email: '  Nieuw@Klant.NL  ' }));
    const f = JSON.parse(posts(t.staat.verzoeken)[0].body).records[0].fields;
    toets('kleine letters, geen spaties', f.Email === 'nieuw@klant.nl', f.Email);
  }

  // ── 3. het wachtwoord ───────────────────────────────────────────
  // TEGENPROEF: de ruwe waarde mag nergens in de verzendbody staan.
  console.log('\n3. Een wachtwoord wordt gehasht en gaat nooit ruw mee');
  {
    const t = bouw();
    const r = await t.roep(Object.assign({}, basis, { pass: 'geheim-wachtwoord' }));
    const body = posts(t.staat.verzoeken)[0].body;
    const f = JSON.parse(body).records[0].fields;
    toets('er staat een hash in', f.PassHash === 'HASH(17)', JSON.stringify(f));
    toets('de ruwe waarde staat nergens in het verzoek', body.indexOf('geheim-wachtwoord') < 0, body.slice(0, 200));
    toets('het antwoord meldt dat er een wachtwoord is', r.body.metWachtwoord === true);
    toets('en de auditregel ook', /met wachtwoord/.test(t.staat.audits[0].tekst), t.staat.audits[0].tekst);

    const k = bouw();
    const rk = await k.roep(Object.assign({}, basis, { pass: 'kort' }));
    toets('een te kort wachtwoord maakt geen account aan',
      rk.body.ok === false && posts(k.staat.verzoeken).length === 0, JSON.stringify(rk.body).slice(0, 120));
  }

  // ── 4. wat er niet door mag ─────────────────────────────────────
  console.log('\n4. De weigeringen — en er wordt dan écht niets aangemaakt');
  {
    const nee = async (extra, waarom, opties) => {
      const t = bouw(opties);
      const r = await t.roep(Object.assign({}, basis, extra));
      toets(waarom, r.body.ok === false && posts(t.staat.verzoeken).length === 0,
        'status ' + r.status + ' — ' + JSON.stringify(r.body).slice(0, 120));
    };
    await nee({ email: 'geen adres' },      'een adres zonder @');
    await nee({ email: '' },                'een leeg adres');
    await nee({ saldo: -5 },                'een negatief beginsaldo');
    await nee({ saldo: 5000000 },           'een absurd beginsaldo');
    await nee({ status: 'verwijderd' },     'status "verwijderd" zet je niet met de hand');
    await nee({ status: 'vip' },            'een verzonnen status');
    await nee({}, 'een adres dat al bestaat', { bestaat: true });

    const d = bouw({ bestaat: true });
    const rd = await d.roep(basis);
    toets('de dubbele krijgt 409 en geen 500', rd.status === 409, 'status ' + rd.status);
  }

  // ── 5. de id-eis blijft staan voor de andere acties ─────────────
  // De uitzondering die `aanmaken` nodig had, mag niet breder zijn dan die
  // ene actie. Zonder deze proef zou een bijboeking zonder id doorglippen en
  // een PATCH op een willekeurig record worden.
  console.log('\n5. Alleen aanmaken en opruimen mogen zonder record-id');
  {
    const t = bouw();
    const r = await t.roep({ actie: 'bijboeken', delta: 50 });
    toets('bijboeken zonder id wordt nog steeds geweigerd',
      r.body.ok === false && r.status === 400, 'status ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 100));
    const u = bouw();
    const ru = await u.roep({ actie: 'update', naam: 'x' });
    toets('update zonder id ook', ru.body.ok === false && ru.status === 400);
    const w = bouw();
    const rw = await w.roep({ actie: 'wachtwoord', pass: 'lang-genoeg-1' });
    toets('wachtwoord zetten zonder id ook', rw.body.ok === false && rw.status === 400);
  }

  // ── 6. Airtable weigert ─────────────────────────────────────────
  console.log('\n6. Als Airtable de rij weigert');
  {
    const t = bouw({ airtableStuk: true });
    const r = await t.roep(basis);
    toets('dat wordt gemeld en niet stil geslikt', r.body.ok === false && r.status === 502, 'status ' + r.status);
    toets('met de reden van Airtable erbij', /INVALID_VALUE_FOR_COLUMN/.test(String(r.body.detail || '')), JSON.stringify(r.body).slice(0, 160));
    toets('en er wordt geen auditregel verzonnen', t.staat.audits.length === 0);
  }

  console.log('\n' + (fouten ? fouten + ' FOUT(EN)' : 'Alles goed'));
  process.exit(fouten ? 1 : 0);
})();
