// ══════════════════════════════════════════════════════════════════
// test-tegoeduit.js — Tegoed uit voor een klant met Ontwikkelaar aan
// ──────────────────────────────────────────────────────────────────
// WAAROM. De beheerder werkt zelf met een klantaccount met Ontwikkelaar aan
// (alle klantopties plus de ontwikkeltools) en wil daarbij geen tokens
// betalen. Dat is de schakelaar Tegoed uit in beheer → Klanten.
//
// WAT HIER ONDERSCHEIDEN MOET WORDEN
//   1. Beide vlaggen, geen één: Tegoed uit zonder Ontwikkelaar kost gewoon
//      tokens, en Ontwikkelaar alleen ook. Anders zet Ontwikkelaar uitzetten
//      het tegoed niet vanzelf weer aan.
//   2. Tegoed uit slaat de saldocontrole én de afboeking over — ook bij een
//      saldo van 0 — maar niet de accountstatus: een geblokkeerde klant krijgt
//      geen AI, met of zonder tegoed.
//   3. De beheerroute zet het alleen bij een ontwikkelaar-klant, alleen als
//      echte true/false, en zet het uit zodra Ontwikkelaar uitgaat.
//   4. /klant/mij (klantPubliek) vertelt de app hetzelfde als wat de Worker
//      bij de afboeking beslist.
//
// De echte functies uit worker.js, geknipt met ankers. Alleen Airtable, het
// slot en Anthropic zijn nagebouwd, en die tellen mee.
//
// Draaien vanuit public/:  node test-tegoeduit.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
function knip(van, tot, wat) {
  const a = bron.indexOf(van), b = bron.indexOf(tot);
  if (a < 0 || b < 0 || b < a) { console.error('FOUT: ' + wat + ' niet gevonden in worker.js (anker verschoven?).'); process.exit(1); }
  return bron.slice(a, b);
}
const srcTegoed = knip('function tegoedTarief(env) {', '__name(handleMessages, "handleMessages");', 'de tegoedketen');
const srcToegang = knip('function klantToegangProbleem(f) {', '__name(klantToegangProbleem, "klantToegangProbleem");', 'klantToegangProbleem');
const srcAdmin = knip('async function handleAdminKlantenPost', '__name(handleAdminKlantenPost', 'handleAdminKlantenPost');
const srcPubliek = knip('const AKKOORD_TEKST_SINDS', '__name(klantPubliek, "klantPubliek");', 'klantPubliek');
const klantToegangProbleem = new Function(srcToegang + '\nreturn klantToegangProbleem;')();
const { klantTegoedUit } = new Function('__name', srcTegoed + '\nreturn { klantTegoedUit };')((f) => f);
const klantPubliek = new Function('klantTegoedUit', srcPubliek + '\nreturn klantPubliek;')(klantTegoedUit);

// ── de AI-route voor een klant ─────────────────────────────────────
function bouwAI(velden) {
  const staat = { aiCalls: 0, patches: [], kasboek: [] };
  const omg = {
    __name: (fn) => fn,
    CORS: {},
    auth: async () => ({ u: 'klant@voorbeeld.nl', r: 'klant' }),
    json: (body, status) => ({ body, status: status || 200 }),
    resolveAnthropicKey: () => 'sk-van-de-worker',
    resolveBase: (env, k) => 'app_' + k,
    cfg: (env, k) => 'tbl_' + k,
    klantZoek: async () => ({ id: 'recKLANT000000001', fields: Object.assign({ Email: 'klant@voorbeeld.nl', Status: 'actief' }, velden) }),
    klantToegangProbleem,
    klantPatch: async (env, id, f) => { staat.patches.push(f); },
    metSaldoSlot: async (env, email, fn) => ({ bezet: false, result: await fn() }),
    fetch: async (url, init) => {
      if (String(url).indexOf('api.anthropic.com') >= 0) {
        staat.aiCalls++;
        return { ok: true, status: 200, text: async () => JSON.stringify({ model: 'm', content: [], usage: { input_tokens: 4000, output_tokens: 700 } }) };
      }
      staat.kasboek.push(String(url));
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
    },
    console: { error() {}, warn() {}, log() {} }
  };
  const api = new Function(...Object.keys(omg), srcTegoed + '\nreturn { handleMessages };')(...Object.values(omg));
  const verzoek = {
    headers: { get: (h) => (String(h).toLowerCase() === 'content-length' ? '400' : null) },
    json: async () => ({ messages: [{ role: 'user', content: 'wat is er mis' }], model: 'm' })
  };
  return { staat, analyse: async () => {
    const r = await api.handleMessages(verzoek, { AIRTABLE_TOKEN: 'x' }, { waitUntil() {} });
    return r.status;
  } };
}

// ── de beheerroute ─────────────────────────────────────────────────
function bouwAdmin(ontwikkelaarInAirtable) {
  const staat = { geschreven: [], gelezen: 0 };
  const omg = {
    adminOnly: () => true,
    json: (body, status) => ({ body, status: status || 200 }),
    klantTabel: () => ({ base: 'appX', table: 'Klanten', hdr: {} }),
    klantPatch: async (env, id, f) => { staat.geschreven.push(f); },
    klantAudit: async () => true,
    tegoedLog: async () => {},
    klantFout: (e, m) => ({ body: { ok: false, error: m, detail: String(e) }, status: 500 }),
    hashPassword: async () => 'hash',
    klantWachtwoordProbleem: () => '',
    fetch: async () => { staat.gelezen++; return { ok: true, json: async () => ({ fields: { Email: 'k@x.nl', Saldo: 5, Ontwikkelaar: ontwikkelaarInAirtable } }) }; },
    metSaldoSlot: async (env, adres, fn) => ({ bezet: false, result: await fn() }),
    __name: () => {}
  };
  const fn = new Function(...Object.keys(omg), srcAdmin + '\nreturn handleAdminKlantenPost;')(...Object.values(omg));
  return { staat, roep: (body) => fn({ json: async () => Object.assign({ actie: 'update', id: 'rec0123456789abcd' }, body) }, { AIRTABLE_TOKEN: 'x' }) };
}

(async () => {
  console.log('1. De AI-route');
  {
    const t = bouwAI({ Ontwikkelaar: true, TegoedUit: true, Saldo: 0 });
    const st = await t.analyse();
    toets('ontwikkelaar + tegoed uit, saldo 0: de analyse gaat door', st === 200 && t.staat.aiCalls === 1, 'status ' + st);
    toets('en er wordt niets afgeboekt en geen kasboekregel geschreven', t.staat.patches.length === 0 && t.staat.kasboek.length === 0,
      JSON.stringify(t.staat));
  }
  {
    const t = bouwAI({ TegoedUit: true, Saldo: 0 });
    const st = await t.analyse();
    toets('tegoed uit zónder ontwikkelaar, saldo 0: tokens op (402), geen AI', st === 402 && t.staat.aiCalls === 0, 'status ' + st);
  }
  {
    const t = bouwAI({ Ontwikkelaar: true, Saldo: 180 });
    const st = await t.analyse();
    toets('ontwikkelaar zónder tegoed uit: er wordt gewoon afgeboekt',
      st === 200 && t.staat.patches.length === 1 && t.staat.patches[0].Saldo < 180, JSON.stringify(t.staat.patches));
  }
  {
    const t = bouwAI({ Ontwikkelaar: true, TegoedUit: 'ja', Saldo: 0 });
    const st = await t.analyse();
    toets('TegoedUit "ja" (geen echte true) telt niet', st === 402 && t.staat.aiCalls === 0, 'status ' + st);
  }
  {
    const t = bouwAI({ Ontwikkelaar: true, TegoedUit: true, Saldo: 0, Status: 'geblokkeerd' });
    const st = await t.analyse();
    toets('een geblokkeerde klant krijgt geen AI, ook niet met tegoed uit', st === 403 && t.staat.aiCalls === 0, 'status ' + st);
  }

  console.log('\n2. De beheerroute');
  {
    const t = bouwAdmin(false);
    const r = await t.roep({ tegoedUit: true });
    toets('tegoed uit bij een klant zonder Ontwikkelaar: geweigerd, niets geschreven',
      r.status === 409 && t.staat.geschreven.length === 0, JSON.stringify(r));
  }
  {
    const t = bouwAdmin(true);
    const r = await t.roep({ tegoedUit: true });
    toets('tegoed uit bij een ontwikkelaar-klant: geschreven als echte true',
      r.body.ok === true && t.staat.geschreven.length === 1 && t.staat.geschreven[0].TegoedUit === true, JSON.stringify(r));
  }
  {
    const t = bouwAdmin(false);
    const r = await t.roep({ ontwikkelaar: true, tegoedUit: true });
    toets('ontwikkelaar en tegoed uit in één verzoek: mag, zonder eerst te lezen',
      r.body.ok === true && t.staat.gelezen === 0 && t.staat.geschreven[0].TegoedUit === true, JSON.stringify(r));
  }
  {
    const t = bouwAdmin(true);
    const r = await t.roep({ ontwikkelaar: false });
    toets('Ontwikkelaar uit zet het tegoed meteen weer aan',
      r.body.ok === true && t.staat.geschreven[0].Ontwikkelaar === false && t.staat.geschreven[0].TegoedUit === false, JSON.stringify(t.staat.geschreven));
  }
  {
    const t = bouwAdmin(true);
    const r = await t.roep({ tegoedUit: 'ja' });
    toets('tegoedUit "ja": 400, niets geschreven', r.status === 400 && t.staat.geschreven.length === 0, JSON.stringify(r));
  }
  {
    const t = bouwAdmin(true);
    const r = await t.roep({ tegoedUit: false });
    toets('tegoed weer aan kan altijd, zonder te lezen',
      r.body.ok === true && t.staat.gelezen === 0 && t.staat.geschreven[0].TegoedUit === false, JSON.stringify(r));
  }

  console.log('\n3. /klant/mij zegt hetzelfde als de afboeking');
  const rec = (f) => ({ fields: f });
  toets('beide vlaggen: tegoedUit true', klantPubliek(rec({ Ontwikkelaar: true, TegoedUit: true })).tegoedUit === true);
  toets('alleen TegoedUit: false', klantPubliek(rec({ TegoedUit: true })).tegoedUit === false);
  toets('alleen Ontwikkelaar: false', klantPubliek(rec({ Ontwikkelaar: true })).tegoedUit === false);

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
