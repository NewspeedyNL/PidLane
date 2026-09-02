// ══════════════════════════════════════════════════════════════════
// test-codeverzilver.js — een activatiecode kan niet verbranden
// ──────────────────────────────────────────────────────────────────
// DE FOUT (02-09-2026). handleCreditsRedeem was gebouwd om BEWUST zonder
// account te werken: "de gratis proef en de eerste aankopen moeten drempelloos
// zijn", met het tegoed desnoods in localStorage. Die aanname is met #49
// vervallen — de client deelt geen tegoed meer uit en een saldo bestaat alleen
// nog op een account.
//
// Wat van die oude vorm overbleef was een geldvernietiger. De route stempelde
// de code eerst af als gebruikt (Gebruikt + GebruiktOp) en keek pas daarna of
// er een ingelogde klant was om hem op bij te schrijven. Was die er niet, dan
// gaf hij ok:true met saldo:null terug: de code verbruikt, het tegoed nergens,
// en de klant die er €4,99 voor betaald had staat met lege handen.
//
// De app haakte daar sinds 29-08 zelf al op af (verzilver() in
// pidlane-credits.js weigert zonder klantaccount), maar een client-controle is
// een verzoek en geen grens. Een oudere app-versie, een herhaald verzoek of een
// curl kwam er nog gewoon langs. De controle hoort vóór de eerste schrijfactie.
//
// WAT DEZE TEST DOET. Hij draait de ECHTE handler uit worker.js tegen een
// nagemaakte Airtable en een nagemaakte klantAuth, en kijkt naar wat er
// GESCHREVEN wordt — niet naar wat de handler teruggeeft. Een code die niet
// afgestempeld is, is nog geldig; dat is de hele vraag.
//
// Draaien vanuit public/:  node test-codeverzilver.js   (exit 0 = goed)
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
const van = bron.indexOf('async function handleCreditsRedeem');
const tot = bron.indexOf('__name(handleCreditsRedeem');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: handleCreditsRedeem niet gevonden in worker.js.');
  process.exit(1);
}
const src = bron.slice(van, tot);

// ── nagemaakte omgeving ───────────────────────────────────────────
// `staat` legt vast wat er werkelijk gebeurd is: is de code afgestempeld, is
// er saldo bijgeschreven, en heeft het slot gelopen. Daar kijkt de test naar.
function bouw(opties) {
  const o = opties || {};
  const staat = {
    afgestempeld: false, gebruiktDoor: null, saldo: o.saldo === undefined ? 30 : o.saldo,
    bijgeboekt: 0, slotGebruikt: false, patches: []
  };
  const codeRec = {
    id: 'recCODE0000000001',
    fields: Object.assign({ Code: 'PIDL-TEST-000001', Credits: 100, Gebruikt: false }, o.codeVelden || {})
  };

  const omg = {
    json: (body, status) => ({ body: body, status: status || 200 }),
    rateLimit: async () => ({ limited: false }),
    rateLimitResponse: () => ({ body: { ok: false, error: 'rate' }, status: 429 }),
    resolveBase: () => 'appConfig',
    cfg: () => 'TokenCodes',
    klantFout: (e, m) => ({ body: { ok: false, error: m }, status: 500 }),
    redeemStub: () => ({ fetch: async () => ({ ok: true }) }),
    klantAuth: async () => (o.ingelogd === false ? null : { u: o.email || 'klant@voorbeeld.nl', r: 'klant' }),
    klantZoek: async () => (o.geenRecord ? null : { id: 'recKLANT000000001', fields: { Email: o.email || 'klant@voorbeeld.nl', Saldo: staat.saldo, TotaalGekocht: 0 } }),
    klantPatch: async (env, id, f) => {
      if (o.patchFaalt) throw new Error('Airtable weigert');
      staat.patches.push(f);
      if (f.Saldo !== undefined) { staat.bijgeboekt = f.Saldo - staat.saldo; staat.saldo = f.Saldo; }
    },
    metSaldoSlot: async (env, email, fn) => {
      staat.slotGebruikt = true;
      if (o.slotBezet) return { bezet: true };
      return { bezet: false, result: await fn() };
    },
    // Alles wat rechtstreeks naar Airtable gaat: het opzoeken van de code, het
    // teruglezen binnen het slot, en de PATCH die hem afstempelt.
    fetch: async (url, init) => {
      if (!init || init.method !== 'PATCH') {
        return { ok: true, json: async () => (String(url).indexOf(codeRec.id) > -1
          ? { fields: Object.assign({}, codeRec.fields, staat.afgestempeld ? { Gebruikt: true } : {}) }
          : { records: [codeRec] }) };
      }
      const f = JSON.parse(init.body).records[0].fields;
      if (f.Gebruikt === true) staat.afgestempeld = true;
      if (f.GebruiktDoor !== undefined) staat.gebruiktDoor = f.GebruiktDoor;
      return { ok: true, text: async () => '', json: async () => ({}) };
    },
    console: { error() {}, warn() {}, log() {} },
    __name: () => {}
  };

  const maak = new Function(...Object.keys(omg), src + '\nreturn handleCreditsRedeem;');
  const fn = maak(...Object.values(omg));
  const roep = (body) => fn(
    { json: async () => body, headers: { get: () => '1.2.3.4' } },
    { AIRTABLE_TOKEN: 'x', REMOTE_SESSION: {} }
  );
  return { staat, roep };
}

const alles = (async function () {

console.log('1. Zonder ingelogd account wordt de code NIET aangeraakt');
{
  const { staat, roep } = bouw({ ingelogd: false });
  const r = await roep({ code: 'PIDL-TEST-000001' });
  toets('het verzoek wordt geweigerd', r.status === 401, 'status ' + r.status);
  toets('met een melding die naar inloggen wijst', /log eerst in/i.test(r.body.error || ''),
        'melding: ' + r.body.error);
  // DIT IS DE KERN. Een afgestempelde code is weg; een geweigerd verzoek op een
  // ongeschonden code kan de klant gewoon opnieuw doen na het inloggen.
  toets('de code is niet afgestempeld', staat.afgestempeld === false,
        'de code is verbruikt terwijl er niemand was om hem bij te schrijven');
  toets('en er is niets bijgeboekt', staat.bijgeboekt === 0, 'bijgeboekt: ' + staat.bijgeboekt);
}

console.log('\n2. Met account: afstempelen én bijboeken, in die volgorde');
{
  const { staat, roep } = bouw({ saldo: 30 });
  const r = await roep({ code: 'PIDL-TEST-000001' });
  toets('het verzoek slaagt', r.status === 200 && r.body.ok === true, JSON.stringify(r));
  toets('de code is afgestempeld', staat.afgestempeld === true);
  toets('er is 100 bijgeboekt', staat.bijgeboekt === 100, 'bijgeboekt: ' + staat.bijgeboekt);
  toets('en het nieuwe saldo gaat mee terug', r.body.saldo === 130, 'saldo: ' + r.body.saldo);
  toets('het bijboeken liep door het saldo-slot', staat.slotGebruikt === true,
        'zonder slot kan een gelijktijdige AI-afboeking deze bijboeking overschrijven');
  toets('GebruiktDoor staat op het account', staat.gebruiktDoor === 'klant@voorbeeld.nl',
        'GebruiktDoor: ' + staat.gebruiktDoor);
}

console.log('\n3. De aanvrager kan GebruiktDoor niet zelf verzinnen');
{
  // Dat veld kwam uit body.email en werd nergens tegen de sessie gehouden. Wie
  // een code inwisselt kon dus in de administratie zetten wie hij wilde.
  const { staat, roep } = bouw({ email: 'echt@voorbeeld.nl' });
  await roep({ code: 'PIDL-TEST-000001', email: 'iemandanders@voorbeeld.nl' });
  toets('er staat het adres uit de sessie', staat.gebruiktDoor === 'echt@voorbeeld.nl',
        'GebruiktDoor: ' + staat.gebruiktDoor);
}

console.log('\n4. Een al gebruikte code levert niets op en verandert niets');
{
  const { staat, roep } = bouw({ codeVelden: { Gebruikt: true } });
  const r = await roep({ code: 'PIDL-TEST-000001' });
  toets('afgewezen met 409', r.status === 409, 'status ' + r.status);
  toets('en er is niets bijgeboekt', staat.bijgeboekt === 0, 'bijgeboekt: ' + staat.bijgeboekt);
}

console.log('\n5. Lukt het bijboeken niet, dan is dat geen geslaagde inwisseling');
{
  // Vanaf het afstempelen is de code verbruikt. Gaat het bijboeken daarna mis,
  // dan MOET dat gemeld worden: een stille ok:true laat het tegoed verdampen
  // zonder dat iemand het merkt.
  const { staat, roep } = bouw({ patchFaalt: true });
  const r = await roep({ code: 'PIDL-TEST-000001' });
  toets('het antwoord is niet ok', r.body.ok === false, JSON.stringify(r.body));
  toets('met de melding dat de code verbruikt is', /verbruikt/i.test(r.body.error || ''),
        'melding: ' + r.body.error);
  toets('de code is inderdaad afgestempeld', staat.afgestempeld === true,
        'anders klopt de melding niet met wat er gebeurd is');
}

console.log('\n6. Een geldige sessie zonder klantrecord meldt hetzelfde');
{
  // Account verwijderd of hernoemd tussen inloggen en inwisselen. Hier gaf de
  // oude code ok:true met saldo:null terug — een geslaagde inwisseling van
  // tokens die nergens staan.
  const { roep } = bouw({ geenRecord: true });
  const r = await roep({ code: 'PIDL-TEST-000001' });
  toets('het antwoord is niet ok', r.body.ok === false, JSON.stringify(r.body));
  toets('en er komt geen saldo mee', r.body.saldo === undefined || r.body.saldo === null,
        'saldo: ' + r.body.saldo);
}

console.log('\n7. Een bezet saldo-slot is geen geslaagde inwisseling');
{
  const { roep } = bouw({ slotBezet: true });
  const r = await roep({ code: 'PIDL-TEST-000001' });
  toets('het antwoord is niet ok', r.body.ok === false, JSON.stringify(r.body));
}

console.log('\n8. Een onzinnige code komt niet eens bij Airtable');
{
  const { staat, roep } = bouw({});
  const r = await roep({ code: 'x' });
  toets('afgewezen met 400', r.status === 400, 'status ' + r.status);
  toets('en er is niets afgestempeld', staat.afgestempeld === false);
}

})();

alles.then(function () {
  console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
}).catch(function (e) {
  console.log('  FOUT test brak af — ' + (e && e.stack || e));
  process.exit(1);
});
