// ══════════════════════════════════════════════════════════════════
// test-onboarding-tegoed.js — het proeftegoed hangt aan het account (#113)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Tot #49 kende de client zichzelf 25 proefcredits toe in localStorage. App-
// gegevens wissen, herinstalleren of een tweede browserprofiel gaf telkens
// opnieuw 25 — het tegoed hing aan het TOESTEL. Sinds #49 is dat model weg en
// kent alléén de Worker het proeftegoed toe: handleKlantOnboarding() boekt
// KLANT_START_SALDO bij en zet het vinkje StartTegoedGegeven op het
// klantrecord. Dat vinkje is de hele grendel: het hangt aan het ACCOUNT en
// overleeft dus elke toestelwissel.
//
// test-saldo-slot.js bewijst met een bronscan dát die functie binnen het
// saldoslot schrijft. Dat is niet hetzelfde als bewijzen dat de grendel
// wérkt. Deze test draait de echte functie en meet het gedrag: één keer
// toekennen, een tweede keer niets, en — de kern — dat de VLAG beslist en niet
// het saldo of het toestel.
//
// DE TEGENPROEF die erin zit (deel 3): een account met de vlag aan maar saldo
// 0 (het is verbruikt) krijgt géén nieuwe 20, en een account met de vlag uit
// maar een dik saldo krijgt ze wél. Zou de grendel op iets anders dan de vlag
// hangen, dan valt precies dat paar om. En de mutatie in plmutate.sh die
// `alGehad` platlegt maakt deel 2 en deel 3 rood.
//
// Draaien vanuit public/:  node test-onboarding-tegoed.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── de echte handler uit worker.js knippen ────────────────────────
// Ankers en geen kopie: verdwijnt of hernoemt handleKlantOnboarding, dan stopt
// deze test in plaats van groen te blijven op code die niet meer draait.
const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const van = bron.indexOf('async function handleKlantOnboarding(request, env, ctx) {');
const tot = bron.indexOf('__name(handleKlantOnboarding, "handleKlantOnboarding");');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: handleKlantOnboarding niet gevonden in worker.js.');
  process.exit(1);
}
const src = bron.slice(van, tot);

// ── nagemaakte omgeving ───────────────────────────────────────────
// `record` is wat er in Airtable staat vóór de call; `geschreven` en `kasboek`
// leggen vast wat de handler werkelijk deed. Het slot staat open — dat het
// binnen het slot gebeurt is de zorg van test-saldo-slot.js, hier gaat het om
// de uitkomst.
function bouw(record, opties) {
  const o = opties || {};
  const staat = { record, geschreven: [], kasboek: [], gezocht: 0 };
  const omg = {
    klantAuth: async () => ({ u: 'klant@example.com', r: 'klant' }),
    json: (body, status) => ({ body, status: status || 200 }),
    rateLimit: async () => ({ limited: false }),
    rateLimitResponse: (rl) => ({ body: { ok: false, error: 'rate' }, status: 429, rl }),
    klantZoek: async () => { staat.gezocht++; return staat.record; },
    klantPatch: async (env, id, f) => { staat.geschreven.push(f); if (f.Saldo !== undefined) staat.record.fields.Saldo = f.Saldo; },
    // Sinds #83 laat elke saldomutatie een kasboekregel na. Hier alleen
    // opvangen; test-kasboek.js toetst wat erin hoort.
    tegoedLog: async (env, ctx, regel) => { staat.kasboek.push(regel); },
    klantFout: (e, m) => ({ body: { ok: false, error: m }, status: 500 }),
    metSaldoSlot: async (env, adres, fn) => {
      if (o.slot === 'bezet') return { bezet: true, result: undefined };
      staat.slotOp = adres;
      return { bezet: false, result: await fn() };
    },
    __name: () => {}
  };
  const maak = new Function(...Object.keys(omg), src + '\nreturn handleKlantOnboarding;');
  const fn = maak(...Object.values(omg));
  const env = { AIRTABLE_TOKEN: 'x', KLANT_START_SALDO: o.startSaldo };
  const roep = (body) => fn(
    { headers: { get: () => 'ip' }, json: async () => body },
    env, {}
  );
  return { staat, roep };
}

const AKKOORD = { survey: true, anon: true };

(async function () {

  // ── 1. eerste keer: het tegoed wordt toegekend ──────────────────
  console.log('\n1. Een nieuw account krijgt het proeftegoed één keer');
  {
    const { staat, roep } = bouw({ id: 'rec0123456789abcd', fields: { Saldo: 0 } });
    const r = await roep(AKKOORD);
    toets('antwoord is ok', r.body.ok === true, JSON.stringify(r.body));
    toets('er is 20 toegekend', r.body.toegekend === 20, 'toegekend=' + r.body.toegekend);
    toets('het saldo staat op 20', r.body.saldo === 20, 'saldo=' + r.body.saldo);
    toets('de vlag StartTegoedGegeven is gezet', staat.geschreven[0].StartTegoedGegeven === true,
      JSON.stringify(staat.geschreven[0]));
    toets('en het saldo is naar Airtable geschreven', staat.geschreven[0].Saldo === 20);
    toets('er staat één kasboekregel, soort proeftegoed', staat.kasboek.length === 1 &&
      staat.kasboek[0].soort === 'proeftegoed', JSON.stringify(staat.kasboek));
    toets('met 20 credits en het saldo erna', staat.kasboek[0] &&
      staat.kasboek[0].credits === 20 && staat.kasboek[0].saldoNa === 20, JSON.stringify(staat.kasboek[0]));
  }

  // ── 2. tweede keer: niets erbij (idempotent per account) ────────
  // Dit is de kern van #113: het wissen van app-gegevens laat de vlag op het
  // account onaangeroerd, dus een nieuwe onboarding-call keert niets uit.
  console.log('\n2. Hetzelfde account een tweede keer krijgt er niets bij');
  {
    const { staat, roep } = bouw({ id: 'rec0123456789abcd', fields: { Saldo: 20, StartTegoedGegeven: true } });
    const r = await roep(AKKOORD);
    toets('antwoord is ok', r.body.ok === true, JSON.stringify(r.body));
    toets('er is 0 toegekend', r.body.toegekend === 0, 'toegekend=' + r.body.toegekend);
    toets('het saldo is onveranderd 20', r.body.saldo === 20, 'saldo=' + r.body.saldo);
    toets('er is geen kasboekregel bijgekomen', staat.kasboek.length === 0, JSON.stringify(staat.kasboek));
    // De akkoorden worden wél opnieuw vastgelegd (AVG), maar het saldo niet opgehoogd.
    toets('de akkoorden zijn opnieuw vastgelegd', Array.isArray(staat.geschreven[0].Akkoorden),
      JSON.stringify(staat.geschreven[0]));
    toets('en het weggeschreven saldo blijft 20', staat.geschreven[0].Saldo === 20);
  }

  // ── 3. TEGENPROEF — de vlag beslist, niet het saldo ─────────────
  // Zou de grendel aan het saldo hangen ("heeft al tegoed, dus niet nog eens")
  // in plaats van aan de vlag, dan valt precies dit paar om.
  console.log('\n3. Tegenproef: de vlag is de grendel, niet het saldo');
  {
    // Vlag aan, saldo 0 (verbruikt): geen bijvulling.
    const a = bouw({ id: 'rec0123456789abcd', fields: { Saldo: 0, StartTegoedGegeven: true } });
    const ra = await a.roep(AKKOORD);
    toets('vlag aan + saldo 0 → niets erbij', ra.body.toegekend === 0 && ra.body.saldo === 0,
      'toegekend=' + ra.body.toegekend + ' saldo=' + ra.body.saldo + ' — dan vult hij een leeg saldo tóch bij');
    // Vlag uit, saldo 500 (bestaand, betalend account): tóch de eenmalige 20.
    const b = bouw({ id: 'rec0123456789abcd', fields: { Saldo: 500 } });
    const rb = await b.roep(AKKOORD);
    toets('vlag uit + saldo 500 → wél de eenmalige 20', rb.body.toegekend === 20 && rb.body.saldo === 520,
      'toegekend=' + rb.body.toegekend + ' saldo=' + rb.body.saldo + ' — dan hangt de grendel aan het saldo');
  }

  // ── 4. zonder akkoord gebeurt er niets ──────────────────────────
  // Geen toekenning zonder expliciete toestemming, en dus ook geen schrijfactie
  // die de vlag zou zetten en een latere echte onboarding zou blokkeren.
  console.log('\n4. Zonder akkoord: geen tegoed en geen schrijfactie');
  {
    for (const body of [{ survey: true, anon: false }, { survey: false, anon: true }, {}]) {
      const { staat, roep } = bouw({ id: 'rec0123456789abcd', fields: { Saldo: 0 } });
      const r = await roep(body);
      toets('geweigerd bij ' + JSON.stringify(body), r.body.ok === false && r.status === 400,
        'status ' + r.status + ' — ' + JSON.stringify(r.body));
      toets('er is niets geschreven', staat.geschreven.length === 0 && staat.kasboek.length === 0);
    }
  }

  // ── 5. het bedrag komt uit KLANT_START_SALDO en wordt niet negatief ─
  console.log('\n5. Het bedrag volgt KLANT_START_SALDO en blijft ≥ 0');
  {
    const a = bouw({ id: 'rec0123456789abcd', fields: { Saldo: 0 } }, { startSaldo: '35' });
    const ra = await a.roep(AKKOORD);
    toets('een eigen KLANT_START_SALDO wordt gevolgd', ra.body.toegekend === 35 && ra.body.saldo === 35,
      'toegekend=' + ra.body.toegekend);
    const b = bouw({ id: 'rec0123456789abcd', fields: { Saldo: 0 } }, { startSaldo: '-5' });
    const rb = await b.roep(AKKOORD);
    toets('een negatieve waarde wordt op 0 geklemd', rb.body.toegekend === 0 && rb.body.saldo === 0,
      'toegekend=' + rb.body.toegekend + ' — een negatief startsaldo mag geen saldo afsnoepen');
  }

  // ── 6. een bezet slot kent niets toe ────────────────────────────
  console.log('\n6. Een bezet saldoslot levert 409 en geen toekenning');
  {
    const { staat, roep } = bouw({ id: 'rec0123456789abcd', fields: { Saldo: 0 } }, { slot: 'bezet' });
    const r = await roep(AKKOORD);
    toets('antwoord is 409', r.status === 409 && r.body.ok === false, 'status ' + r.status);
    toets('er is niets geschreven en niets geboekt', staat.geschreven.length === 0 && staat.kasboek.length === 0);
  }

  console.log('\n' + (fouten ? fouten + ' FOUT(EN)' : 'alle tests geslaagd') + '\n');
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error('FOUT: test wierp een exception:', e); process.exit(1); });
