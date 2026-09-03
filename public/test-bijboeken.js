// ══════════════════════════════════════════════════════════════════
// test-bijboeken.js — saldo bijboeken én zetten in de Worker
// ──────────────────────────────────────────────────────────────────
// HIER STOND WAAROM "saldo zetten" NIET GETOETST WERD, en die redenering is
// op 03-09-2026 met #93 omgevallen. Ze luidde: bij zetten stuurt de beheerder
// het eindbedrag, dus gaat er iets mis dan ziet hij een getal dat hij zelf
// heeft ingetikt; bij bijboeken rekent de Worker, en dáár is een rekenfout
// onzichtbaar tot een klant belt.
//
// Het eerste deel klopte niet. Zetten rekent inderdaad niet, maar het
// OVERSCHRIJFT, en dat is net zo goed onzichtbaar: draait de klant op dat
// moment een analyse, dan boekt die binnen het slot af en schrijft terug,
// waarna deze PATCH er het oude getal overheen zet. De afboeking verdwijnt en
// de klant houdt tokens die hij verbruikt heeft — exact het gat van #82, maar
// dan in spiegelbeeld. En de knop in admin.html rekende wél: hij toonde een
// verschil dat op een mogelijk minuten oude lijst was gebaseerd.
//
// Deel 10 t/m 15 toetsen dus de andere kant: dat zetten door hetzelfde slot
// loopt, dat het meegestuurde `saldoWas` een voorwaarde is en geen sier, en
// dat een update ZÓNDER saldo nog steeds zonder slot doorgaat — want anders
// zou je een klant niet meer kunnen deblokkeren zolang het slot bezet is.
//
// DE KERN: bijboeken leest het saldo vlak vóór het schrijven. Zou het het door
// de pagina meegestuurde "huidige" saldo gebruiken, dan schrijf je het
// verbruik terug van elke analyse die de klant deed sinds de lijst werd
// geladen. Deel 4 hieronder is precies die tegenproef.
//
// EN SINDS #82: DAT LEZEN GEBEURT BINNEN HET SALDO-SLOT. Vlak vóór schrijven
// lezen is niet genoeg — de klant kan in díé milliseconden afboeken. De
// botsing die ertoe doet is beheerder × klant, niet beheerder × beheerder:
// jij boekt 100 bij terwijl hij een analyse draait, en één van beide mutaties
// verdwijnt. Deel 6 t/m 9 toetsen dat het slot er werkelijk omheen staat, dat
// er binnen dat slot opnieuw gelezen wordt, en dat een bezet of onbereikbaar
// slot niet in een stille doorgang verandert.
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
// `slotStand` stuurt hoe het nagemaakte slot zich gedraagt:
//   'open'    het slot gaat dicht en weer open, fn() draait erbinnen
//   'bezet'   een ander heeft het slot al  → { bezet: true }
//   'stuk'    het slot is niet aan te vragen → metSaldoSlot gooit
// `email` is standaard gevuld; op '' toetst deel 9 wat er dan hoort te gebeuren.
// `auditLukt:false` laat de vastlegging mislukken (deel 5).
function bouw(saldoInAirtable, opties) {
  const o = opties || {};
  const slotStand = o.slot || 'open';
  const email = o.email === undefined ? 'klant@example.com' : o.email;
  const staat = {
    saldo: saldoInAirtable, geschreven: [], audits: [], gelezen: 0,
    // De volgorde van gebeurtenissen. Hierop toetst deel 6: staat het lezen
    // en schrijven werkelijk TUSSEN dicht en open, of ernaast?
    stappen: [], slotOp: null, binnenSlot: false
  };
  const omg = {
    adminOnly: () => true,
    json: (body, status) => ({ body, status: status || 200 }),
    klantTabel: () => ({ base: 'appX', table: 'Klanten', hdr: {} }),
    klantPatch: async (env, id, f) => {
      staat.stappen.push(staat.binnenSlot ? 'schrijf-binnen' : 'schrijf-buiten');
      staat.geschreven.push(f);
      if (f.Saldo !== undefined) staat.saldo = f.Saldo;
    },
    klantAudit: async (env, id, tekst, door) => { staat.audits.push({ tekst, door }); return o.auditLukt === false ? false : true; },
    klantFout: (e, m) => ({ body: { ok: false, error: m }, status: 500 }),
    hashPassword: async () => 'hash',
    klantWachtwoordProbleem: () => '',
    fetch: async () => {
      staat.gelezen++;
      staat.stappen.push(staat.binnenSlot ? 'lees-binnen' : 'lees-buiten');
      return { ok: true, json: async () => ({ fields: { Saldo: staat.saldo, Email: email } }) };
    },
    metSaldoSlot: async (env, adres, fn) => {
      if (slotStand === 'stuk') throw new Error('geen REMOTE_SESSION-binding');
      staat.slotOp = adres;
      if (slotStand === 'bezet') { staat.stappen.push('slot-bezet'); return { bezet: true, result: undefined }; }
      staat.stappen.push('slot-dicht');
      staat.binnenSlot = true;
      try { return { bezet: false, result: await fn() }; }
      finally { staat.binnenSlot = false; staat.stappen.push('slot-open'); }
    },
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
    const { staat, roep } = bouw(180, { auditLukt: false });
    const r = await roep({ actie: 'bijboeken', id: ID, delta: 20 });
    toets('het saldo is bijgeboekt', r.body.ok === true && r.body.naar === 200,
          JSON.stringify(r.body));
    toets('en er is ook echt geschreven', staat.geschreven.length === 1 &&
          staat.geschreven[0].Saldo === 200, JSON.stringify(staat.geschreven));
    toets('en het antwoord meldt dat de vastlegging niet lukte',
          r.body.vastgelegd === false,
          'vastgelegd=' + r.body.vastgelegd + ' — dan denkt de beheerder dat het is vastgelegd');
  }

  // ── 6. HET SLOT STAAT ER ECHT OMHEEN (#82) ──────────────────────
  // De onderscheidende vraag is niet "wordt metSaldoSlot aangeroepen" — dat
  // zou ook groen staan als hij ernaast werd aangeroepen en het lezen en
  // schrijven gewoon buitenom liep. Waar het om gaat is de VOLGORDE: dicht,
  // dan lezen, dan schrijven, dan open.
  console.log('\n6. Lezen en schrijven gebeuren binnen het slot');
  {
    const { staat, roep } = bouw(180);
    const r = await roep({ actie: 'bijboeken', id: ID, delta: 50 });
    toets('antwoord is ok', r.body.ok === true, JSON.stringify(r.body));
    toets('het slot staat op het e-mailadres, niet op het record-id',
          staat.slotOp === 'klant@example.com',
          'slot stond op ' + JSON.stringify(staat.slotOp) +
          ' — dan sluit het de klant zijn eigen afboeking niet uit');
    const i = staat.stappen;
    toets('het slot ging dicht', i.indexOf('slot-dicht') !== -1, i.join(' → '));
    toets('er is binnen het slot gelezen',
          i.indexOf('lees-binnen') > i.indexOf('slot-dicht'),
          i.join(' → '));
    toets('er is binnen het slot geschreven',
          i.indexOf('schrijf-binnen') > i.indexOf('slot-dicht') &&
          i.indexOf('schrijf-binnen') < i.indexOf('slot-open'),
          i.join(' → '));
    toets('er is niets buiten het slot geschreven',
          i.indexOf('schrijf-buiten') === -1, i.join(' → '));
    // De tweede lezing is het punt: de eerste haalt alleen het adres op.
    // Rekent de handler met díé lezing, dan staat de race er nog.
    toets('er is twee keer gelezen — adres buiten, saldo binnen',
          staat.gelezen === 2, 'gelezen: ' + staat.gelezen);
  }

  // ── 7. een bezet slot schrijft niet ──────────────────────────────
  // Een andere mutatie is bezig. Dan hoort deze bijboeking te wachten op een
  // volgende poging, en zeker niet alsnog te schrijven.
  console.log('\n7. Een bezet slot boekt niet bij');
  {
    const { staat, roep } = bouw(180, { slot: 'bezet' });
    const r = await roep({ actie: 'bijboeken', id: ID, delta: 50 });
    toets('antwoord is niet ok', r.body.ok === false, JSON.stringify(r.body));
    toets('er is niets geschreven', staat.geschreven.length === 0);
    toets('er is niets vastgelegd', staat.audits.length === 0);
    toets('de melding zegt dat er al iets loopt',
          /loopt al/i.test(String(r.body.error || '')), r.body.error);
    toets('en er gaat een code mee die de adminpagina kan herkennen',
          r.body.code === 'saldo_bezet', 'code=' + r.body.code);
  }

  // ── 8. een onbereikbaar slot gaat er niet omheen ─────────────────
  // metSaldoSlot gooit als het slot niet aan te vragen is. Doorgaan zou
  // precies de race terugbrengen die dit oplost, dus hier hoort een weigering
  // en geen stille schrijfactie.
  console.log('\n8. Een onbereikbaar slot boekt niet buitenom bij');
  {
    const { staat, roep } = bouw(180, { slot: 'stuk' });
    const r = await roep({ actie: 'bijboeken', id: ID, delta: 50 });
    toets('antwoord is niet ok', r.body.ok === false, JSON.stringify(r.body));
    toets('er is niets geschreven', staat.geschreven.length === 0,
          JSON.stringify(staat.geschreven));
    toets('en het is geen 200', r.status >= 500, 'status ' + r.status);
    toets('en er gaat een code mee die de adminpagina kan herkennen',
          r.body.code === 'saldo_slot_stuk', 'code=' + r.body.code);
  }

  // ── 9. zonder e-mailadres is er geen slot om op te zetten ────────
  console.log('\n9. Een klant zonder e-mailadres wordt geweigerd');
  {
    const { staat, roep } = bouw(180, { email: '' });
    const r = await roep({ actie: 'bijboeken', id: ID, delta: 50 });
    toets('antwoord is niet ok', r.body.ok === false, JSON.stringify(r.body));
    toets('er is niets geschreven', staat.geschreven.length === 0);
    toets('het slot is niet eens aangevraagd', staat.slotOp === null,
          'slot stond op ' + JSON.stringify(staat.slotOp));
    toets('en er gaat een code mee die de adminpagina kan herkennen',
          r.body.code === 'saldo_geen_email', 'code=' + r.body.code);
  }

  // ── 10. ZETTEN GAAT DOOR HETZELFDE SLOT (#93) ───────────────────
  // Tot 03-09-2026 schreef deze route Saldo rechtstreeks weg. Het slot dat
  // bijboeken sinds #82 heeft, ontbrak hier — en de botsing die ertoe doet is
  // dezelfde: beheerder × klant. Net als bij deel 6 is de vraag niet "wordt
  // metSaldoSlot aangeroepen" maar of het lezen en schrijven er werkelijk
  // TUSSEN zitten.
  console.log('\n10. Saldo zetten schrijft binnen het slot');
  {
    const { staat, roep } = bouw(180);
    const r = await roep({ actie: 'update', id: ID, saldo: 200, saldoWas: 180, door: 'nico' });
    toets('antwoord is ok', r.body.ok === true, JSON.stringify(r.body));
    toets('van 180 naar 200', r.body.van === 180 && r.body.naar === 200, JSON.stringify(r.body));
    toets('het slot staat op het e-mailadres, niet op het record-id',
          staat.slotOp === 'klant@example.com',
          'slot stond op ' + JSON.stringify(staat.slotOp));
    const i = staat.stappen;
    toets('er is binnen het slot geschreven',
          i.indexOf('schrijf-binnen') > i.indexOf('slot-dicht') &&
          i.indexOf('schrijf-binnen') < i.indexOf('slot-open'), i.join(' → '));
    toets('er is niets buiten het slot geschreven',
          i.indexOf('schrijf-buiten') === -1, i.join(' → '));
    toets('er is twee keer gelezen — adres buiten, saldo binnen',
          staat.gelezen === 2, 'gelezen: ' + staat.gelezen);
    toets('er is precies één keer geschreven', staat.geschreven.length === 1,
          JSON.stringify(staat.geschreven));
    toets('en wel het gevraagde eindbedrag', staat.geschreven[0].Saldo === 200);
    toets('de auditregel noemt beide bedragen',
          /180/.test(staat.audits[0].tekst) && /200/.test(staat.audits[0].tekst),
          staat.audits[0] && staat.audits[0].tekst);
    toets('de naam gaat mee', staat.audits[0].door === 'nico');
  }

  // ── 11. TEGENPROEF — saldoWas is een voorwaarde, geen sier ───────
  // Dit is de kern van #93. De beheerder besloot "zet op 200" toen er 180
  // stond; inmiddels staat er 150 omdat de klant een analyse draaide. Zou de
  // handler gewoon schrijven, dan geeft hij die klant 50 tokens terug die hij
  // net verbruikt heeft — en de beheerder heeft dat nooit gezien, want zijn
  // bevestigingsvenster rekende met de 180.
  console.log('\n11. Een verschoven saldo wordt geweigerd, niet overschreven');
  {
    const { staat, roep } = bouw(150);            // klant heeft intussen verbruikt
    const r = await roep({ actie: 'update', id: ID, saldo: 200, saldoWas: 180 });
    toets('antwoord is niet ok', r.body.ok === false, JSON.stringify(r.body));
    toets('er is NIETS geschreven', staat.geschreven.length === 0,
          JSON.stringify(staat.geschreven) + ' — dan is de afboeking van de klant weg');
    toets('er is niets vastgelegd', staat.audits.length === 0);
    toets('het is een 409 en geen 200', r.status === 409, 'status ' + r.status);
    toets('er gaat een code mee die de adminpagina kan herkennen',
          r.body.code === 'saldo_verschoven', 'code=' + r.body.code);
    toets('het verse getal gaat mee terug', r.body.huidig === 150,
          'huidig=' + r.body.huidig + ' — zonder dat moet de beheerder gokken');
    // De weigering moet uit de vergelijking komen, niet uit het slot: het slot
    // ging hier gewoon dicht en weer open.
    toets('het slot is wel degelijk gebruikt', staat.slotOp === 'klant@example.com');
    toets('en er is binnen het slot vers gelezen',
          staat.stappen.indexOf('lees-binnen') > staat.stappen.indexOf('slot-dicht'),
          staat.stappen.join(' → '));
  }

  // ── 12. hetzelfde getal is geen botsing ─────────────────────────
  // Zonder deze toets zou "weiger altijd" ook groen staan, en dan werkt de
  // knop nooit meer.
  console.log('\n12. Klopt saldoWas wél, dan gaat het gewoon door');
  {
    const { staat, roep } = bouw(180);
    const r = await roep({ actie: 'update', id: ID, saldo: 0, saldoWas: 180 });
    toets('antwoord is ok', r.body.ok === true, JSON.stringify(r.body));
    toets('op nul zetten mag', staat.geschreven[0].Saldo === 0,
          JSON.stringify(staat.geschreven));
  }

  // ── 13. zonder saldoWas gaat het door zoals het ging ────────────
  // Achterwaartse compatibiliteit: een oudere adminpagina (of een aanroep met
  // de hand) stuurt saldoWas niet mee. Dan is er niets om tegenaan te
  // vergelijken — maar het slot beschermt het schrijven nog steeds.
  console.log('\n13. Zonder saldoWas: wél het slot, geen vergelijking');
  {
    const { staat, roep } = bouw(150);
    const r = await roep({ actie: 'update', id: ID, saldo: 200 });
    toets('antwoord is ok', r.body.ok === true, JSON.stringify(r.body));
    toets('er is geschreven', staat.geschreven.length === 1 && staat.geschreven[0].Saldo === 200);
    toets('en het ging door het slot',
          staat.stappen.indexOf('schrijf-binnen') !== -1, staat.stappen.join(' → '));
  }

  // ── 14. een update ZONDER saldo raakt het slot niet ──────────────
  // Dit is de tegenhanger die het makkelijkst stilletjes fout gaat: het slot
  // om de hele update leggen "omdat het veiliger klinkt". Dan kun je een klant
  // niet meer deblokkeren terwijl hij een analyse draait, en een klant zónder
  // e-mailadres krijgt nooit meer een nieuwe naam.
  console.log('\n14. Naam en status gaan buiten het slot om');
  {
    const { staat, roep } = bouw(180);
    const r = await roep({ actie: 'update', id: ID, status: 'geblokkeerd', naam: 'Jan' });
    toets('antwoord is ok', r.body.ok === true, JSON.stringify(r.body));
    toets('het slot is niet eens aangevraagd', staat.slotOp === null,
          'slot stond op ' + JSON.stringify(staat.slotOp));
    toets('er is niet gelezen', staat.gelezen === 0, 'gelezen: ' + staat.gelezen);
    toets('en er is geschreven', staat.geschreven.length === 1, JSON.stringify(staat.geschreven));
    toets('zonder Saldo in de patch', staat.geschreven[0].Saldo === undefined,
          JSON.stringify(staat.geschreven[0]));
    toets('VerwijderdOp wordt leeggemaakt bij een statuswijziging',
          staat.geschreven[0].VerwijderdOp === null, JSON.stringify(staat.geschreven[0]));
  }
  {
    const { staat, roep } = bouw(180, { email: '' });
    const r = await roep({ actie: 'update', id: ID, naam: 'Jan' });
    toets('een klant zonder e-mailadres kan nog wél hernoemd worden',
          r.body.ok === true && staat.geschreven.length === 1, JSON.stringify(r.body));
  }
  {
    const { staat, roep } = bouw(180);
    const r = await roep({ actie: 'update', id: ID });
    toets('een lege update wordt nog steeds geweigerd',
          r.body.ok === false && staat.geschreven.length === 0, JSON.stringify(r.body));
  }

  // ── 15. het slot faalt: zetten gaat er niet omheen ───────────────
  console.log('\n15. Een bezet of stuk slot zet geen saldo');
  {
    const { staat, roep } = bouw(180, { slot: 'bezet' });
    const r = await roep({ actie: 'update', id: ID, saldo: 200, saldoWas: 180 });
    toets('bezet → niet ok', r.body.ok === false, JSON.stringify(r.body));
    toets('bezet → niets geschreven', staat.geschreven.length === 0);
    toets('bezet → code saldo_bezet', r.body.code === 'saldo_bezet', 'code=' + r.body.code);
  }
  {
    const { staat, roep } = bouw(180, { slot: 'stuk' });
    const r = await roep({ actie: 'update', id: ID, saldo: 200, saldoWas: 180 });
    toets('stuk → niet ok', r.body.ok === false, JSON.stringify(r.body));
    toets('stuk → niets geschreven', staat.geschreven.length === 0);
    toets('stuk → het is geen 200', r.status >= 500, 'status ' + r.status);
    toets('stuk → code saldo_slot_stuk', r.body.code === 'saldo_slot_stuk', 'code=' + r.body.code);
  }
  {
    const { staat, roep } = bouw(180, { email: '' });
    const r = await roep({ actie: 'update', id: ID, saldo: 200 });
    toets('zonder e-mailadres wordt het saldo niet gezet',
          r.body.ok === false && staat.geschreven.length === 0, JSON.stringify(r.body));
    toets('en dat meldt code saldo_geen_email', r.body.code === 'saldo_geen_email',
          'code=' + r.body.code);
  }
  {
    const { staat, roep } = bouw(180);
    const r = await roep({ actie: 'update', id: ID, saldo: -5, saldoWas: 180 });
    toets('een negatief saldo wordt geweigerd vóór het slot',
          r.body.ok === false && staat.slotOp === null, JSON.stringify(r.body));
  }

  // ── 16. de adminpagina kent elke code die deze route kan sturen ──
  // Een foutcode is een afspraak tussen twee bestanden. Kent de pagina hem
  // niet, dan valt hij door naar "Onverwachte fout (409)" en krijgt de
  // beheerder het verkeerde advies: er is niets stuk, hij moet het zo nog
  // eens proberen. Dat is precies het soort losse eind dat pas opvalt op het
  // moment dat het misgaat — bij een klant die belt dat zijn tegoed op is.
  console.log('\n16. Elke foutcode uit deze route wordt door admin.html afgehandeld');
  {
    const admin = fs.readFileSync(path.join(__dirname, '..', 'admin', 'admin.html'), 'utf8');
    const codes = (src.match(/code: "([a-z0-9_]+)"/g) || [])
      .map((m) => m.replace(/.*"([a-z0-9_]+)".*/, '$1'));
    // Zonder dit anker zou de lus over nul codes lopen en vanzelf groen staan.
    toets('de route stuurt foutcodes mee', codes.length >= 3,
          'gevonden: ' + JSON.stringify(codes));
    // Op de AFHANDELING kijken en niet op het woord. "Staat de naam ergens in
    // het bestand" was de eerste opzet, en plmutate.sh liet zien wat daar mis
    // mee is: één commentaarregel die de code noemt houdt de toets groen
    // terwijl de afhandeling hernoemd is. Precies de stille fout die deze
    // kruiscontrole moest vangen.
    codes.forEach((c) => {
      const afhandeling = new RegExp("code\\s*===\\s*'" + c + "'");
      toets("admin.html handelt '" + c + "' af",
            afhandeling.test(admin),
            'de pagina valt terug op "Onverwachte fout" voor deze code');
    });
  }

  // ── 17. de knop stuurt de voorwaarde ook echt mee (#93) ──────────
  // De vergelijking in de Worker is dood hout als admin.html `saldoWas` niet
  // meestuurt: zonder dat veld valt hij terug op "geen vergelijking" (deel 13)
  // en overschrijft de knop weer stilletjes. Dit is een broncontrole en geen
  // gedragstest, omdat admin.html geen module is die je los kunt laden — de
  // knop hangt aan een pagina met een prompt() erin. De aanhaakpunten zijn
  // daarom zo gekozen dat ze verdwijnen zodra iemand de knop verbouwt.
  console.log('\n17. De knop in admin.html stuurt saldoWas mee');
  {
    const admin = fs.readFileSync(path.join(__dirname, '..', 'admin', 'admin.html'), 'utf8');
    const i = admin.indexOf('function kSaldo(');
    toets('kSaldo bestaat nog', i >= 0);
    const lijf = i < 0 ? '' : admin.slice(i, i + 1200);
    toets('kSaldo stuurt actie update', /actie:'update'/.test(lijf));
    toets('kSaldo stuurt saldoWas mee', /saldoWas\s*:\s*huidig/.test(lijf),
          'zonder dit veld vergelijkt de Worker niets en overschrijft de knop weer');
    // En de tegenhanger: bijboeken hoort dit veld JUIST niet te sturen. Daar
    // rekent de Worker zelf, en een voorwaarde op een verouderd getal zou
    // bijboeken laten weigeren op precies het moment dat het het hardst nodig
    // is — een klant die belt dat zijn tegoed op is.
    // Op de aanroep zelf kijken en niet op een venster tekst eromheen: het
    // commentaar tussen beide knoppen noemt saldoWas uiteraard ook, en een
    // ruimer venster staat dan rood zonder dat er iets mis is.
    const roepB = (admin.match(/kPost\(\{actie:'bijboeken'[^}]*\}/) || [''])[0];
    toets('de bijboek-aanroep is nog te vinden', roepB.length > 0);
    toets('kBijboeken stuurt geen saldoWas', roepB.length > 0 && !/saldoWas/.test(roepB),
          roepB);
  }

  console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(function (e) {
  console.log('  FOUT test brak af — ' + (e && e.stack || e));
  process.exit(1);
});
