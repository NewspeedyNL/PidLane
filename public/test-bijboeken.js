// ══════════════════════════════════════════════════════════════════
// test-bijboeken.js — saldo bijboeken in de Worker
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT GETOETST WORDT EN "saldo zetten" NIET
// Bij zetten stuurt de beheerder het eindbedrag: gaat dat mis, dan ziet hij
// een getal dat hij zelf heeft ingetikt. Bij bijboeken rekent de Worker, en
// een rekenfout daar is onzichtbaar tot een klant belt dat zijn tokens weg
// zijn. Dat is het verschil dat een test rechtvaardigt.
//
// DE KERN: bijboeken leest het saldo vlak vóór het schrijven. Zou het het door
// de pagina meegestuurde "huidige" saldo gebruiken, dan schrijf je het
// verbruik terug van elke analyse die de klant deed sinds de lijst werd
// geladen. Deel 4 hieronder is precies die tegenproef.
//
// Draaien vanuit public/:  node test-bijboeken.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── de handler uit worker.js knippen ──────────────────────────────
const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const van = bron.indexOf('async function handleAdminKlantenPost');
const tot = bron.indexOf('__name(handleAdminKlantenPost');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: handleAdminKlantenPost niet gevonden in worker.js.');
  process.exit(1);
}
const src = bron.slice(van, tot);

// ── nagemaakte omgeving ───────────────────────────────────────────
// Eén klant in een nagemaakte Airtable. `gelezen` en `geschreven` leggen vast
// wat de handler werkelijk deed — dat is waar de test op kijkt, niet op wat
// hij teruggeeft.
function bouw(saldoInAirtable) {
  const staat = { saldo: saldoInAirtable, geschreven: [], audits: [], gelezen: 0 };
  const omg = {
    adminOnly: () => true,
    json: (body, status) => ({ body, status: status || 200 }),
    klantTabel: () => ({ base: 'appX', table: 'Klanten', hdr: {} }),
    klantPatch: async (env, id, f) => { staat.geschreven.push(f); if (f.Saldo !== undefined) staat.saldo = f.Saldo; },
    klantAudit: async (env, id, tekst, door) => { staat.audits.push({ tekst, door }); return true; },
    klantFout: (e, m) => ({ body: { ok: false, error: m }, status: 500 }),
    hashPassword: async () => 'hash',
    klantWachtwoordProbleem: () => '',
    fetch: async () => { staat.gelezen++; return { ok: true, json: async () => ({ fields: { Saldo: staat.saldo } }) }; },
    __name: () => {}
  };
  const maak = new Function(...Object.keys(omg), src + '\nreturn handleAdminKlantenPost;');
  const fn = maak(...Object.values(omg));
  const roep = (body) => fn({ json: async () => body }, { AIRTABLE_TOKEN: 'x' });
  return { staat, roep };
}

const ID = 'rec0123456789abcd';   // rec + precies 14 tekens, zoals de handler eist

(async function () {

  // ── 1. gewoon bijboeken ─────────────────────────────────────────
  console.log('\n1. Bijboeken telt op bij wat er in Airtable staat');
  {
    const { staat, roep } = bouw(180);
    const r = await roep({ actie: 'bijboeken', id: ID, delta: 50, door: 'nico', reden: 'gekocht' });
    toets('antwoord is ok', r.body.ok === true, JSON.stringify(r.body));
    toets('van 180 naar 230', r.body.van === 180 && r.body.naar === 230, JSON.stringify(r.body));
    toets('er is één keer geschreven', staat.geschreven.length === 1);
    toets('en wel het nieuwe totaal', staat.geschreven[0].Saldo === 230);
    toets('de auditregel noemt beide bedragen',
          /180/.test(staat.audits[0].tekst) && /230/.test(staat.audits[0].tekst),
          staat.audits[0] && staat.audits[0].tekst);
    toets('de reden staat erbij', /gekocht/.test(staat.audits[0].tekst));
    toets('de naam gaat mee', staat.audits[0].door === 'nico');
  }

  // ── 2. afboeken mag ─────────────────────────────────────────────
  console.log('\n2. Een negatief getal boekt af');
  {
    const { staat, roep } = bouw(180);
    const r = await roep({ actie: 'bijboeken', id: ID, delta: -30 });
    toets('van 180 naar 150', r.body.naar === 150, JSON.stringify(r.body));
    toets('geschreven waarde klopt', staat.geschreven[0].Saldo === 150);
  }

  // ── 3. de grenzen ───────────────────────────────────────────────
  console.log('\n3. Wat er niet door mag');
  {
    const g = async (body, waarom) => {
      const { staat, roep } = bouw(100);
      const r = await roep(Object.assign({ actie: 'bijboeken', id: ID }, body));
      toets(waarom, r.body.ok === false && staat.geschreven.length === 0,
            'status ' + r.status + ' — ' + JSON.stringify(r.body));
    };
    await g({ delta: 0 },        'nul bijboeken is geen bijboeking');
    await g({ delta: 'veel' },   'tekst wordt geweigerd');
    await g({},                  'ontbrekende delta wordt geweigerd');
    await g({ delta: -500 },     'meer afboeken dan er staat wordt geweigerd');
    await g({ delta: 999999 },   'absurd bedrag wordt geweigerd');
  }

  // ── 4. TEGENPROEF — leest hij écht vlak vóór het schrijven? ──────
  // De pagina stuurt hier een verouderd saldo mee (de klant heeft intussen
  // verbruikt). Rekent de handler daarmee, dan schrijft hij het verbruik
  // terug en komt de klant op 230 uit in plaats van 130. Dat is precies de
  // fout die deze opzet moet uitsluiten.
  console.log('\n4. Tegenproef: een verouderd saldo uit de pagina telt niet mee');
  {
    const { staat, roep } = bouw(80);                       // Airtable: klant heeft verbruikt
    const r = await roep({ actie: 'bijboeken', id: ID, delta: 50, saldo: 180, huidig: 180 });
    toets('gerekend met de verse 80, niet met de meegestuurde 180',
          r.body.naar === 130, 'kwam uit op ' + r.body.naar +
          ' — dan komt het bedrag uit de pagina en niet uit Airtable');
    toets('er is echt gelezen vóór het schrijven', staat.gelezen >= 1);
  }

  // ── 5. de wijziging gaat vóór de vastlegging ────────────────────
  // Ontbreekt het Audit-veld in Airtable, dan mag dat de saldowijziging niet
  // tegenhouden. Anders zou een vergeten veld het beheer platleggen.
  console.log('\n5. Een mislukte auditregel houdt de wijziging niet tegen');
  {
    const { staat, roep } = bouw(180);
    const maak = new Function('adminOnly','json','klantTabel','klantPatch','klantAudit','klantFout',
      'hashPassword','klantWachtwoordProbleem','fetch','__name',
      src + '\nreturn handleAdminKlantenPost;');
    const fn = maak(() => true,
      (b, s) => ({ body: b, status: s || 200 }),
      () => ({ base:'appX', table:'Klanten', hdr:{} }),
      async (env, id, f) => { staat.geschreven.push(f); },
      async () => false,                       // audit mislukt
      (e, m) => ({ body:{ ok:false, error:m }, status:500 }),
      async () => 'hash', () => '',
      async () => ({ ok:true, json: async () => ({ fields:{ Saldo: 180 } }) }),
      () => {});
    const r = await fn({ json: async () => ({ actie:'bijboeken', id: ID, delta: 20 }) }, { AIRTABLE_TOKEN:'x' });
    toets('het saldo is bijgeboekt', r.body.ok === true && r.body.naar === 200);
    toets('en het antwoord meldt dat de vastlegging niet lukte',
          r.body.vastgelegd === false,
          'vastgelegd=' + r.body.vastgelegd + ' — dan denkt de beheerder dat het is vastgelegd');
  }

  console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(function (e) {
  console.log('  FOUT test brak af — ' + (e && e.stack || e));
  process.exit(1);
});
