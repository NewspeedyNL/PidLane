// ══════════════════════════════════════════════════════════════════
// test-klantmelding.js — de mail bij een nieuwe klant via Airtable (#477)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT GETOETST WORDT
// Sinds Klanten in D1 staat (#327) maakte de Worker geen Airtable-rij meer,
// en viel de automatisering "Nieuwe klant → mail naar Support" stil weg.
// klantMeldingAirtable() zet die rij weer neer. Drie fouten liggen voor de
// hand en geen ervan is ergens anders zichtbaar:
//
//   1. Er gaat te veel mee — een PassHash of saldo in een tweede systeem.
//      Deel 1 kijkt naar de complete verzendbody, niet naar één veld.
//   2. De rij blijft eeuwig staan. Deel 2 draait de opruimer en kijkt of de
//      formule alleen de gemerkte, oude rijen raakt en of er in stukken van
//      tien gewist wordt (meer weigert Airtable). Een verse melding, een
//      oude klantrij en een rij met een ander merk moeten blijven staan.
//   3. De registratie roept de melding niet aan, of wacht erop. Deel 3 leest
//      daarvoor de handler: een gedragstest zou de hele registratie met D1,
//      rate limit en tokens moeten nabouwen.
//
// Draaien vanuit public/:  node test-klantmelding.js   (exit 0 = goed)
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
function knip(van, tot) {
  const a = bron.indexOf(van), b = bron.indexOf(tot, a);
  if (a < 0 || b < 0) { console.error('FOUT: anker niet gevonden in worker.js: ' + (a < 0 ? van : tot)); process.exit(1); }
  return bron.slice(a, b + tot.length);
}
const src = knip('var KLANT_MELDING_MERK', '__name(klantMeldingenOpruimen, "klantMeldingenOpruimen");');
const handler = knip('async function handleKlantRegistreer', '__name(handleKlantRegistreer');

const DEFAULTS = { AIRTABLE_CONFIG_BASE: 'appUAuyRxK18T7ImK', AIRTABLE_KLANTEN_TABLE: 'Klanten' };
function laad(fetchNep) {
  const f = new Function('fetch', 'DEFAULTS', '__name', 'cfg', 'resolveBase',
    src + '\nreturn { klantMeldingAirtable, klantMeldingenOpruimen, KLANT_MELDING_MERK };');
  return f(fetchNep, DEFAULTS, (x) => x,
    (env, k) => (env && env[k]) || DEFAULTS[k],
    (env, k) => (env && env[k]) || DEFAULTS[k]);
}

(async () => {
  console.log('Deel 1 — de melding');
  {
    const calls = [];
    const m = laad(async (url, opt) => { calls.push({ url, opt }); return { ok: true, json: async () => ({}) }; });
    const ok = await m.klantMeldingAirtable({ AIRTABLE_TOKEN: 'tok' }, 'a@b.nl', 'Piet');
    toets('geeft true bij succes', ok === true);
    toets('één POST', calls.length === 1 && calls[0].opt.method === 'POST');
    toets('naar de tabel Klanten in de configbase',
      calls[0].url === 'https://api.airtable.com/v0/appUAuyRxK18T7ImK/Klanten', calls[0].url);
    const body = JSON.parse(calls[0].opt.body);
    const velden = body.records[0].fields;
    toets('precies Email, Naam en Opmerking', JSON.stringify(Object.keys(velden).sort()) === '["Email","Naam","Opmerking"]',
      JSON.stringify(Object.keys(velden)));
    toets('Email en Naam kloppen', velden.Email === 'a@b.nl' && velden.Naam === 'Piet');
    toets('Opmerking draagt het merk', velden.Opmerking === m.KLANT_MELDING_MERK);
    toets('geen typecast (een onbekend veld moet geweigerd worden)', !('typecast' in body));

    const geen = [];
    const m2 = laad(async (u) => { geen.push(u); return { ok: true }; });
    toets('zonder AIRTABLE_TOKEN geen verzoek', (await m2.klantMeldingAirtable({}, 'a@b.nl', '')) === false && geen.length === 0);

    const m3 = laad(async () => ({ ok: false, status: 422 }));
    let fout = '';
    try { await m3.klantMeldingAirtable({ AIRTABLE_TOKEN: 't' }, 'a@b.nl', ''); } catch (e) { fout = e.message; }
    toets('een weigering van Airtable is een fout, geen stilte', fout === 'airtable_melding_422', fout);
  }

  console.log('Deel 2 — de opruimer');
  {
    const ids = Array.from({ length: 23 }, (_, i) => 'rec' + String(i).padStart(14, '0'));
    const calls = [];
    const m = laad(async (url, opt) => {
      calls.push({ url, opt: opt || {} });
      if ((opt && opt.method) === 'DELETE') return { ok: true };
      const tweede = url.includes('offset=p2');
      const oud = new Date(Date.now() - 3 * 864e5).toISOString();
      const nieuw = new Date(Date.now() - 36e5).toISOString();
      const merk = { Opmerking: 'melding #477' };
      // Naast de 23 te wissen: een verse melding, een oude klantrij zonder
      // merk en een met een ander merk. Die drie moeten blijven staan.
      const blijft = [
        { id: 'recVERS', createdTime: nieuw, fields: merk },
        { id: 'recOUDEKLANT', createdTime: oud, fields: {} },
        { id: 'recANDER', createdTime: oud, fields: { Opmerking: 'vip' } }
      ];
      const recs = (a, b) => ids.slice(a, b).map((id) => ({ id, createdTime: oud, fields: merk }));
      return { ok: true, json: async () => tweede
        ? { records: recs(15).concat(blijft.slice(1)) }
        : { records: recs(0, 15).concat(blijft.slice(0, 1)), offset: 'p2' } };
    });
    const n = await m.klantMeldingenOpruimen({ AIRTABLE_TOKEN: 't' });
    toets('telt alle pagina\'s', n === 23, String(n));
    const lees = calls.filter((c) => !c.opt.method);
    toets('leest alleen het veld Opmerking', lees.length === 2 && lees.every((c) => c.url.includes('fields%5B%5D=Opmerking')));
    toets('geen filterByFormula (#142)', lees.every((c) => !c.url.includes('filterByFormula')));
    const wis = calls.filter((c) => c.opt.method === 'DELETE');
    toets('gewist in stukken van hoogstens tien', wis.length === 3 &&
      wis.every((c) => (c.url.match(/records\[\]=/g) || []).length <= 10), String(wis.length));
    const gewist = wis.flatMap((c) => c.url.split('?')[1].split('&').map((x) => decodeURIComponent(x.split('=')[1])));
    toets('alleen gemerkte rijen ouder dan de termijn gewist', JSON.stringify(gewist) === JSON.stringify(ids),
      gewist.filter((x) => !ids.includes(x)).join(','));

    const m2 = laad(async () => ({ ok: false, status: 403 }));
    let fout = '';
    try { await m2.klantMeldingenOpruimen({ AIRTABLE_TOKEN: 't' }); } catch (e) { fout = e.message; }
    toets('een leesfout is een fout', fout === 'airtable_melding_lezen_403', fout);
  }

  console.log('Deel 3 — de registratie roept hem aan');
  {
    const i = handler.indexOf('klantMeldingAirtable(env, email, naam)');
    toets('handleKlantRegistreer meldt de nieuwe klant', i > 0);
    toets('na het aanmaken in D1', i > handler.indexOf('atMaak(env, "klanten"'));
    toets('via ctx.waitUntil', /ctx\.waitUntil\(melding\)/.test(handler));
    toets('met een catch: een mislukte melding breekt de registratie niet', /klantMeldingAirtable\([^)]*\)\.catch\(/.test(handler));
    toets('de route geeft ctx door', bron.includes('await handleKlantRegistreer(request, env, ctx)'));
    toets('de cron ruimt de meldingen op', /async scheduled[\s\S]*klantMeldingenOpruimen\(env\)/.test(bron));
  }

  console.log(fouten ? `\n${fouten} fout(en).` : '\nAlles goed.');
  process.exit(fouten ? 1 : 0);
})();
