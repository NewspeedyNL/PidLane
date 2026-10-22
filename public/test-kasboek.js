// ══════════════════════════════════════════════════════════════════
// test-kasboek.js — TokenLog: elke saldomutatie laat een spoor na (#83)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
// Op 31-07-2026 verdwenen er tokens zonder analyses. De oorzaak was alleen te
// vinden door de code te lezen; met een kasboek was het één blik geweest.
// PIDLANE.md §8 beschreef dat kasboek in de tegenwoordige tijd, compleet met
// negen velden en een functienaam — en die functie had nooit bestaan. Dat is
// de vergissing die #83 vastlegt, en dit bestand is de kant die hem
// onherhaalbaar maakt: zolang deze test groen staat, schrijft er werkelijk
// iets weg.
//
// DRIE DINGEN DIE HIER MOETEN ONDERSCHEIDEN, en die een naïeve implementatie
// alle drie fout doet:
//
//   1. HET KASBOEK MAG NOOIT IETS BREKEN. Het is administratie, geen bron van
//      waarheid: het saldo staat in Klanten.Saldo. Valt Airtable weg terwijl
//      er net een analyse liep, dan hoort de klant zijn antwoord gewoon te
//      krijgen. Deel 4 en 9 zijn die tegenproef — één keer op tegoedLog zelf,
//      één keer end-to-end door handleMessages heen.
//   2. CREDITS IS WAT ER WERKELIJK AF GING, niet wat de call kostte. Staat er
//      3 op de teller en kost de analyse er 9, dan kapt het saldo af op 0 en
//      gaat er 3 af. Noteert het kasboek dan -9, dan telt de kolom niet meer
//      op tegen SaldoNa en is de eerste vraag die je er ooit aan stelt meteen
//      fout beantwoord. Deel 6.
//   3. EEN MISLUKTE AFBOEKING KRIJGT ÓÓK EEN REGEL, met Credits 0. Dat is het
//      geval waar dit boek voor gebouwd is: AI verbruikt, saldo onaangeroerd.
//      Zou dat geval geen regel opleveren, dan is het kasboek juist blind voor
//      de situatie die hem zijn bestaansrecht geeft. Deel 7.
//
// De vier bronnen uit #83 komen alle vier langs: ai-call (deel 5-9),
// code-ingewisseld (10), proeftegoed (11) en admin-mutatie (12). Deel 13 telt
// ze na, zodat het wegvallen van een bron niet stilletjes doorglipt.
//
// De echte functies worden uit worker.js geknipt met ankers, niet overgetypt:
// verdwijnt of hernoemt er iets, dan stopt deze test in plaats van groen te
// blijven staan op code die niet meer draait.
//
// Draaien vanuit public/:  node test-kasboek.js   (exit 0 = goed)
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

function knip(vanAnker, totAnker, wat) {
  const van = bron.indexOf(vanAnker);
  const tot = bron.indexOf(totAnker);
  if (van < 0 || tot < 0 || tot < van) {
    console.error('FOUT: ' + wat + ' niet gevonden in worker.js (anker verschoven?).');
    process.exit(1);
  }
  return bron.slice(van, tot);
}

// Eén slice voor de hele tegoedketen: tarief, kosten, kasboek en de
// AI-afboeking die ze alle drie gebruikt. Dat is met opzet — deel 9 toetst de
// ECHTE tegoedLog binnen de ECHTE handleMessages, en dat kan alleen als ze uit
// hetzelfde stuk bron komen.
const srcTegoed = knip('function tegoedTarief(env) {', '__name(handleMessages, "handleMessages");', 'de tegoedketen');
const srcAdmin = knip('async function handleAdminKlantenPost', '__name(handleAdminKlantenPost', 'handleAdminKlantenPost');
const srcOnboard = knip('async function handleKlantOnboarding', '__name(handleKlantOnboarding', 'handleKlantOnboarding');
const srcRedeem = knip('async function handleCreditsRedeem', '__name(handleCreditsRedeem', 'handleCreditsRedeem');

// ── nagemaakte omgeving voor de tegoedketen ───────────────────────
// `staat.posts` legt vast wat er werkelijk naar het kasboek ging; daar kijkt
// deze test naar, niet naar wat de functie teruggeeft. Sinds 01-10-2026 staat
// het kasboek in D1 (#327) en schrijft tegoedLog via atMaak(); de sleutel van
// de tabel gaat mee in `url`, zodat de test kan zien of er in het kasboek
// geschreven wordt en niet in Klanten.
function bouwTegoed(opties) {
  const o = opties || {};
  const staat = {
    posts: [], patches: [], meldingen: [], jobs: [], aiCalls: 0, aiBodies: [],
    saldo: o.saldo === undefined ? 180 : o.saldo
  };
  const aiAntwoord = JSON.stringify({
    id: 'msg_01', model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text: 'de koelvloeistof loopt op' }],
    usage: {
      input_tokens: o.tokensIn === undefined ? 4880 : o.tokensIn,
      output_tokens: o.tokensUit === undefined ? 720 : o.tokensUit
    }
  });
  const omg = {
    // __name geeft zijn functie terug — esbuild gebruikt hem ook middenin een
    // expressie (`const g = __name((a,b) => …, "g")`), en een mock die niets
    // teruggeeft laat tegoedTarief() dan omvallen op "g is not a function".
    __name: (fn) => fn,
    CORS: {},
    auth: async () => (o.session === undefined ? { u: 'klant@voorbeeld.nl', r: 'klant' } : o.session),
    json: (body, status) => ({ body, status: status || 200 }),
    resolveAnthropicKey: () => 'sk-van-de-worker',
    resolveBase: (env, k) => 'app_' + k,
    cfg: (env, k) => 'tbl_' + k,
    klantZoek: async () => (o.geenKlant ? null : {
      id: 'recKLANT000000001',
      fields: Object.assign({ Email: 'klant@voorbeeld.nl', Saldo: staat.saldo, Status: 'actief' }, o.velden || {})
    }),
    klantToegangProbleem: () => null,
    klantPatch: async (env, id, f) => {
      if (o.patchFaalt) throw new Error('airtable_patch_502');
      staat.patches.push(f);
      if (f.Saldo !== undefined) staat.saldo = f.Saldo;
    },
    metSaldoSlot: async (env, email, fn) => ({ bezet: false, result: await fn() }),
    atMaak: async (env, sleutel, velden) => {
      // Eerst vastleggen dát het geprobeerd is, dan pas eventueel stukgaan:
      // anders kan deel 4 niet onderscheiden tussen "hij probeerde het en
      // faalde" en "hij deed niets".
      staat.posts.push({ url: 'd1:' + sleutel, method: 'POST', velden: Object.assign({}, velden) });
      if (o.kasboekGooit) throw new Error('D1 onbereikbaar');
      if (o.kasboekStuk) throw new Error('d1_onbekend_veld_kasboek_Onzin');
      return { id: 'recKASBOEK0000001', fields: velden };
    },
    fetch: async (url, init) => {
      const u = String(url);
      if (u.indexOf('api.anthropic.com') >= 0) {
        staat.aiCalls++;
        staat.aiBodies.push(JSON.parse(init.body));
        const st = o.aiStatus || 200;
        return { ok: st < 400, status: st, text: async () => aiAntwoord };
      }
      throw new Error('onverwachte fetch in deze test: ' + u);
    },
    console: { error: (m) => staat.meldingen.push(String(m)), warn() {}, log() {} }
  };
  const maak = new Function(...Object.keys(omg),
    srcTegoed + '\nreturn { tegoedLog, handleMessages, tegoedKosten, tegoedTarief };');
  const api = maak(...Object.values(omg));
  const env = { LOGDB: {} };
  const ctx = { waitUntil: (p) => { staat.jobs.push(p); } };
  const verzoek = {
    headers: { get: (n) => (String(n).toLowerCase() === 'content-length' ? '400' : null) },
    json: async () => Object.assign({ messages: [{ role: 'user', content: 'wat is er mis' }], model: 'claude-sonnet-5' }, o.extraVelden || {})
  };
  return {
    staat, api, env, ctx, aiAntwoord,
    analyse: (metCtx) => api.handleMessages(verzoek, env, metCtx ? ctx : undefined)
  };
}

// De regel die als laatste is weggeschreven, ontdaan van de verpakking.
const laatste = (staat) => (staat.posts.length ? staat.posts[staat.posts.length - 1].velden : null);

// Welke bronnen er in dit bestand werkelijk langsgekomen zijn. Wordt gevuld
// door de delen hieronder en in deel 13 nageteld — zie daar waarom dat een
// aparte toets verdient.
const gezien = new Set();

(async function () {

  // ── 1. tegoedLog schrijft één regel, in de goede tabel ──────────
  console.log('\n1. Eén regel per mutatie, in het kasboek');
  {
    const t = bouwTegoed();
    await t.api.tegoedLog(t.env, undefined, {
      klant: 'Klant@Voorbeeld.NL', soort: 'ai-call', credits: -6, saldoNa: 174,
      tokensIn: 4880, tokensUit: 720, model: 'claude-sonnet-4-6', details: 'analyse afgeboekt'
    });
    toets('er is precies één regel weggeschreven', t.staat.posts.length === 1, t.staat.posts.length + ' regel(s)');
    const p = t.staat.posts[0];
    toets('als POST', p.method === 'POST', p.method);
    toets('en naar het kasboek', p.url === 'd1:kasboek',
          p.url + ' — een kasboek in de verkeerde tabel is geen kasboek');
    const v = p.velden;
    toets('Soort', v.Soort === 'ai-call', String(v.Soort));
    toets('Credits is negatief bij afboeken', v.Credits === -6, String(v.Credits));
    toets('SaldoNa', v.SaldoNa === 174, String(v.SaldoNa));
    toets('TokensIn en TokensUit', v.TokensIn === 4880 && v.TokensUit === 720,
          v.TokensIn + '/' + v.TokensUit);
    toets('Model', v.Model === 'claude-sonnet-4-6', String(v.Model));
    toets('Details', v.Details === 'analyse afgeboekt', String(v.Details));
    toets('Moment is een leesbare ISO-tijd', /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(String(v.Moment)), String(v.Moment));
    // Het e-mailadres is de sleutel waarop je later zoekt; twee schrijfwijzen
    // van hetzelfde account maken die zoekactie stilletjes onvolledig.
    toets('Klant staat in kleine letters', v.Klant === 'klant@voorbeeld.nl', String(v.Klant));
  }

  // ── 2. SaldoNa: bekend of afwezig, nooit een verzonnen nul ──────
  console.log('\n2. Een onbekend saldo wordt niet als 0 geboekt');
  {
    const t = bouwTegoed();
    await t.api.tegoedLog(t.env, undefined, { klant: 'a@b.nl', soort: 'code-ingewisseld', credits: 0 });
    toets('zonder saldoNa staat het veld er niet in',
          !('SaldoNa' in t.staat.posts[0].velden),
          'een 0 die "onbekend" betekent leest later als een leeg account');

    const u = bouwTegoed();
    await u.api.tegoedLog(u.env, undefined, { klant: 'a@b.nl', soort: 'ai-call', credits: -3, saldoNa: 0 });
    toets('een echte 0 staat er wél in',
          u.staat.posts[0].velden.SaldoNa === 0, JSON.stringify(u.staat.posts[0].velden.SaldoNa));
  }

  // ── 3. ctx.waitUntil, en wat er gebeurt als die er niet is ──────
  // Met ctx hoort het antwoord niet op Airtable te wachten. Zónder ctx moet er
  // juist wél gewacht worden: een fetch die na het antwoord nog loopt wordt
  // door de runtime afgekapt, en dan is de regel "misschien" geschreven.
  console.log('\n3. Wegschrijven via ctx.waitUntil, en anders afgewacht');
  {
    const t = bouwTegoed();
    await t.api.tegoedLog(t.env, t.ctx, { klant: 'a@b.nl', soort: 'proeftegoed', credits: 25, saldoNa: 25 });
    toets('de schrijfactie is aan waitUntil meegegeven', t.staat.jobs.length === 1, t.staat.jobs.length + ' job(s)');
    await Promise.all(t.staat.jobs);
    toets('en die schrijft de regel weg', t.staat.posts.length === 1);

    const u = bouwTegoed();
    await u.api.tegoedLog(u.env, undefined, { klant: 'a@b.nl', soort: 'proeftegoed', credits: 25, saldoNa: 25 });
    toets('zonder ctx is de regel al weg als de aanroep terugkomt',
          u.staat.posts.length === 1,
          'anders kapt de runtime de fetch af zodra het antwoord de deur uit is');
  }

  // ── 4. TEGENPROEF — een kapot kasboek breekt niets, en zwijgt niet ──
  console.log('\n4. Tegenproef: D1 weg, en tegoedLog gaat niet over de kop');
  {
    for (const geval of [{ kasboekGooit: true }, { kasboekStuk: true }]) {
      const t = bouwTegoed(geval);
      const naam = geval.kasboekGooit ? 'D1 onbereikbaar' : 'D1 weigert de regel';
      let gegooid = null;
      try {
        await t.api.tegoedLog(t.env, undefined, { klant: 'a@b.nl', soort: 'ai-call', credits: -6, saldoNa: 174 });
      } catch (e) { gegooid = e; }
      toets(naam + ': tegoedLog gooit niet door', gegooid === null, String(gegooid));
      toets(naam + ': het is wel geprobeerd', t.staat.posts.length === 1);
      // Een kasboek dat zwijgend niets wegschrijft is erger dan geen kasboek:
      // je leest er later "geen mutaties" in waar er wel degelijk iets gebeurde.
      toets(naam + ': en het wordt gemeld',
            t.staat.meldingen.some((m) => m.indexOf('[kasboek]') >= 0),
            JSON.stringify(t.staat.meldingen));
    }
    // Zonder database is er niets om in te schrijven; dan hoort er ook geen
    // poging te zijn (en geen uitzondering), maar wel een melding.
    const z = bouwTegoed();
    await z.api.tegoedLog({}, undefined, { klant: 'a@b.nl', soort: 'ai-call', credits: -1 });
    toets('zonder LOGDB wordt er niets geprobeerd', z.staat.posts.length === 0);
    toets('maar het wordt wel gemeld', z.staat.meldingen.some((m) => m.indexOf('[kasboek]') >= 0), JSON.stringify(z.staat.meldingen));
  }

  // ── 5. ai-call: de gewone afboeking ─────────────────────────────
  console.log('\n5. Een geslaagde analyse levert één ai-call-regel op');
  {
    const t = bouwTegoed({ saldo: 180 });          // 4880 in, 720 uit → 6 credits
    const r = await t.analyse(true);
    await Promise.all(t.staat.jobs);
    toets('het antwoord van Anthropic gaat naar de klant', r.status === 200, 'status ' + r.status);
    toets('en het saldo in de kop is bijgewerkt', r.headers.get('X-PidLane-Saldo') === '174',
          String(r.headers.get('X-PidLane-Saldo')));
    toets('er is één kasboekregel', t.staat.posts.length === 1, t.staat.posts.length + ' regel(s)');
    const v = laatste(t.staat);
    gezien.add(v.Soort);
    toets('soort ai-call', v.Soort === 'ai-call', String(v.Soort));
    toets('Credits -6', v.Credits === -6, String(v.Credits));
    toets('SaldoNa 174', v.SaldoNa === 174, String(v.SaldoNa));
    toets('het echte verbruik gaat mee', v.TokensIn === 4880 && v.TokensUit === 720,
          v.TokensIn + '/' + v.TokensUit);
    toets('en het model waarop afgerekend is', v.Model === 'claude-sonnet-4-6', String(v.Model));
  }

  // ── 6. ai-call: afgekapt saldo — Credits is wat er ÉCHT af ging ──
  // Dit is de toets die onderscheidt. Een implementatie die -kosten noteert
  // staat hier rood, en dat is precies de fout die het kasboek onbruikbaar
  // maakt: de kolom telt dan niet meer op tegen SaldoNa.
  console.log('\n6. Bij een te laag saldo boekt het kasboek wat er werkelijk af ging');
  {
    const t = bouwTegoed({ saldo: 3, tokensIn: 0, tokensUit: 2500 });   // kosten 9, saldo 3
    const r = await t.analyse(true);
    await Promise.all(t.staat.jobs);
    const v = laatste(t.staat);
    toets('het saldo staat op 0', r.headers.get('X-PidLane-Saldo') === '0',
          String(r.headers.get('X-PidLane-Saldo')));
    toets('Credits is -3 en niet -9', v.Credits === -3,
          String(v.Credits) + ' — dan telt de kolom niet meer op tegen SaldoNa');
    toets('SaldoNa 0', v.SaldoNa === 0, String(v.SaldoNa));
    toets('en het afkappen staat in Details', /afgekapt/.test(String(v.Details)), String(v.Details));
  }

  // ── 7. ai-call: afboeken mislukt — Credits 0, en toch een regel ──
  console.log('\n7. Mislukte afboeking: AI verbruikt, saldo onaangeroerd, wél een regel');
  {
    const t = bouwTegoed({ saldo: 180, patchFaalt: true });
    const r = await t.analyse(true);
    await Promise.all(t.staat.jobs);
    toets('de klant krijgt zijn antwoord alsnog', r.status === 200, 'status ' + r.status);
    toets('en de kop houdt het oude saldo aan', r.headers.get('X-PidLane-Saldo') === '180',
          String(r.headers.get('X-PidLane-Saldo')));
    toets('er staat een kasboekregel', t.staat.posts.length === 1, t.staat.posts.length + ' regel(s)');
    const v = laatste(t.staat);
    toets('Credits 0 — er ging niets af', v.Credits === 0, String(v.Credits));
    toets('SaldoNa is het onveranderde saldo', v.SaldoNa === 180, String(v.SaldoNa));
    toets('Details zegt dat het misging', /MISLUKT/.test(String(v.Details)), String(v.Details));
    toets('en noemt het verbruik dat wél gemaakt is',
          v.TokensIn === 4880 && v.TokensUit === 720,
          'zonder die getallen weet je later niet wat er rechtgezet moet worden');
  }

  // ── 8. geen antwoord van Anthropic → geen mutatie, geen regel ────
  // Een 429 kost de klant niets, dus er is niets te boeken. Een implementatie
  // die onvoorwaardelijk logt vult de tabel met regels van 0 en maakt juist de
  // kolom onleesbaar die je wilt optellen.
  console.log('\n8. Een mislukte AI-call levert geen kasboekregel op');
  {
    const t = bouwTegoed({ saldo: 180, aiStatus: 429 });
    const r = await t.analyse(true);
    await Promise.all(t.staat.jobs);
    toets('de status van Anthropic gaat door', r.status === 429, 'status ' + r.status);
    toets('er is niets afgeboekt', t.staat.patches.length === 0);
    toets('en er staat geen kasboekregel', t.staat.posts.length === 0, t.staat.posts.length + ' regel(s)');
  }

  // ── 9. TEGENPROEF end-to-end — kasboek stuk, analyse gaat door ───
  // Dit is de tegenproef die #83 met zoveel woorden vraagt: laat de
  // schrijfactie falen en toon aan dat de call gewoon doorgaat. Deel 4 deed dat
  // op tegoedLog los; hier loopt het door de échte handleMessages heen, met de
  // échte tegoedLog ertussen — dus zonder nagemaakte tussenlaag die het gedrag
  // zou kunnen verbloemen.
  console.log('\n9. Tegenproef: het kasboek valt om, de analyse merkt er niets van');
  {
    for (const geval of [{ kasboekGooit: true }, { kasboekStuk: true }]) {
      const naam = geval.kasboekGooit ? 'fetch gooit' : 'Airtable 502';
      const t = bouwTegoed(Object.assign({ saldo: 180 }, geval));
      let r = null, gegooid = null;
      try { r = await t.analyse(false); } catch (e) { gegooid = e; }
      toets(naam + ': handleMessages gooit niet', gegooid === null, String(gegooid));
      toets(naam + ': de klant krijgt zijn antwoord', r && r.status === 200, r && ('status ' + r.status));
      toets(naam + ': de tekst is compleet', r && (await r.text()) === t.aiAntwoord);
      toets(naam + ': en er is wél gewoon afgeboekt',
            t.staat.patches.length === 1 && t.staat.patches[0].Saldo === 174,
            JSON.stringify(t.staat.patches) + ' — het saldo is de bron van waarheid, niet het kasboek');
      toets(naam + ': het gemis is gemeld',
            t.staat.meldingen.some((m) => m.indexOf('[kasboek]') >= 0), JSON.stringify(t.staat.meldingen));
    }
  }

  // ── 10. bron code-ingewisseld ───────────────────────────────────
  // Hier en hieronder wordt tegoedLog nagemaakt: wát er weggeschreven wordt is
  // in deel 1 t/m 4 al op de echte functie getoetst, dus de vraag is nu alleen
  // nog of deze handler hem met de juiste regel aanroept.
  console.log('\n10. Een ingewisselde code komt in het kasboek — geslaagd én mislukt');
  {
    const bouwRedeem = (o) => {
      o = o || {};
      const staat = { kasboek: [], saldo: 30, afgestempeld: false };
      const codeRec = { id: 'recCODE0000000001', fields: { Code: 'PIDL-TEST-000001', Credits: 100, Gebruikt: false } };
      const omg = {
        __name: () => {},
        json: (body, status) => ({ body, status: status || 200 }),
        rateLimit: async () => ({ limited: false }),
        rateLimitResponse: () => ({ body: { ok: false }, status: 429 }),
        resolveBase: () => 'appConfig',
        cfg: () => 'TokenCodes',
        klantFout: (e, m) => ({ body: { ok: false, error: m }, status: 500 }),
        redeemStub: () => ({ fetch: async () => ({ ok: true }) }),
        klantAuth: async () => ({ u: 'klant@voorbeeld.nl', r: 'klant' }),
        klantZoek: async () => ({ id: 'recKLANT000000001', fields: { Email: 'klant@voorbeeld.nl', Saldo: staat.saldo, TotaalGekocht: 0 } }),
        klantPatch: async (env, id, f) => {
          if (o.patchFaalt) throw new Error('Airtable weigert');
          if (f.Saldo !== undefined) staat.saldo = f.Saldo;
        },
        metSaldoSlot: async (env, email, fn) => ({ bezet: false, result: await fn() }),
        tegoedLog: async (env, ctx, regel) => { staat.kasboek.push(regel); },
        // De codetabel staat sinds 01-10-2026 in D1 (#327).
        atZoek: async () => codeRec,
        atHaal: async (env, sleutel, id) => (id === codeRec.id ? { id, fields: codeRec.fields } : null),
        atPatch: async (env, sleutel, id, f) => { staat.afgestempeld = true; return { id, fields: f }; },
        console: { error() {}, warn() {}, log() {} }
      };
      const maak = new Function(...Object.keys(omg), srcRedeem + '\nreturn handleCreditsRedeem;');
      const fn = maak(...Object.values(omg));
      return { staat, roep: () => fn({ json: async () => ({ code: 'PIDL-TEST-000001' }), headers: { get: () => '1.2.3.4' } },
        { LOGDB: {}, REMOTE_SESSION: {} }, { waitUntil() {} }) };
    };

    const g = bouwRedeem();
    const rg = await g.roep();
    toets('inwisselen lukt', rg.body.ok === true, JSON.stringify(rg.body));
    toets('er staat één kasboekregel', g.staat.kasboek.length === 1, g.staat.kasboek.length + ' regel(s)');
    gezien.add(g.staat.kasboek.length ? g.staat.kasboek[0].soort : null);
    toets('soort code-ingewisseld', g.staat.kasboek[0].soort === 'code-ingewisseld', String(g.staat.kasboek[0].soort));
    toets('Credits +100', g.staat.kasboek[0].credits === 100, String(g.staat.kasboek[0].credits));
    toets('SaldoNa 130', g.staat.kasboek[0].saldoNa === 130, String(g.staat.kasboek[0].saldoNa));
    toets('de code staat in de details', /PIDL-TEST-000001/.test(String(g.staat.kasboek[0].details)),
          String(g.staat.kasboek[0].details));

    // Het spiegelbeeld van deel 7: de code is verbruikt, het saldo bewoog niet.
    const m = bouwRedeem({ patchFaalt: true });
    const rm = await m.roep();
    toets('mislukt bijboeken meldt zich als fout', rm.body.ok === false, JSON.stringify(rm.body));
    toets('en levert tóch een regel op', m.staat.kasboek.length === 1, m.staat.kasboek.length + ' regel(s)');
    toets('met Credits 0', m.staat.kasboek.length === 1 && m.staat.kasboek[0].credits === 0,
          m.staat.kasboek.length ? String(m.staat.kasboek[0].credits) : 'geen regel');
    toets('en MISLUKT in de details',
          m.staat.kasboek.length === 1 && /MISLUKT/.test(String(m.staat.kasboek[0].details)),
          m.staat.kasboek.length ? String(m.staat.kasboek[0].details) : 'geen regel');
  }

  // ── 11. bron proeftegoed ────────────────────────────────────────
  console.log('\n11. Het welkomsttegoed komt in het kasboek — één keer');
  {
    const bouwOnboard = (alGehad) => {
      const staat = { kasboek: [], velden: null };
      const omg = {
        __name: () => {},
        json: (body, status) => ({ body, status: status || 200 }),
        rateLimit: async () => ({ limited: false }),
        rateLimitResponse: () => ({ body: { ok: false }, status: 429 }),
        klantAuth: async () => ({ u: 'nieuw@voorbeeld.nl', r: 'klant' }),
        klantFout: (e, m) => ({ body: { ok: false, error: m }, status: 500 }),
        klantZoek: async () => ({ id: 'recKLANT000000002', fields: { Saldo: alGehad ? 25 : 0, StartTegoedGegeven: !!alGehad } }),
        klantPatch: async (env, id, f) => { staat.velden = f; },
        metSaldoSlot: async (env, email, fn) => ({ bezet: false, result: await fn() }),
        tegoedLog: async (env, ctx, regel) => { staat.kasboek.push(regel); },
        console: { error() {}, warn() {}, log() {} }
      };
      const maak = new Function(...Object.keys(omg), srcOnboard + '\nreturn handleKlantOnboarding;');
      const fn = maak(...Object.values(omg));
      return { staat, roep: () => fn(
        { json: async () => ({ survey: true, anon: true }), headers: { get: () => '1.2.3.4' } },
        { LOGDB: {}, KLANT_START_SALDO: 25 }, { waitUntil() {} }) };
    };

    const e = bouwOnboard(false);
    const re = await e.roep();
    toets('het tegoed wordt toegekend', re.body.ok === true && re.body.toegekend === 25, JSON.stringify(re.body));
    toets('er staat één kasboekregel', e.staat.kasboek.length === 1, e.staat.kasboek.length + ' regel(s)');
    gezien.add(e.staat.kasboek.length ? e.staat.kasboek[0].soort : null);
    toets('soort proeftegoed', e.staat.kasboek[0].soort === 'proeftegoed', String(e.staat.kasboek[0].soort));
    toets('Credits +25 en SaldoNa 25',
          e.staat.kasboek[0].credits === 25 && e.staat.kasboek[0].saldoNa === 25,
          JSON.stringify(e.staat.kasboek[0]));

    // Een tweede onboarding raakt het saldo niet. Een regel met Credits 0 zou
    // hier ruis zijn: er is geen mutatie om terug te vinden.
    const t2 = bouwOnboard(true);
    const r2 = await t2.roep();
    toets('een tweede keer kent niets toe', r2.body.toegekend === 0, JSON.stringify(r2.body));
    toets('en levert geen kasboekregel op', t2.staat.kasboek.length === 0,
          t2.staat.kasboek.length + ' regel(s) — dan vult de tabel zich met mutaties van niets');
  }

  // ── 12. bron admin-mutatie ──────────────────────────────────────
  console.log('\n12. Bijboeken en saldo zetten komen allebei in het kasboek');
  {
    const bouwAdmin = (saldo) => {
      const staat = { kasboek: [], saldo };
      const omg = {
        __name: () => {},
        adminOnly: () => true,
        json: (body, status) => ({ body, status: status || 200 }),
        klantTabel: () => ({ base: 'appX', table: 'Klanten', hdr: {} }),
        klantPatch: async (env, id, f) => { if (f.Saldo !== undefined) staat.saldo = f.Saldo; },
        klantAudit: async () => true,
        klantFout: (e, m) => ({ body: { ok: false, error: m }, status: 500 }),
        hashPassword: async () => 'hash',
        klantWachtwoordProbleem: () => '',
        klantEmailOk: () => true,
        klantZoek: async () => null,
        klantWachtrijOpruimen: async () => ({}),
        KLANT_BEWAARDAGEN: 30,
        tegoedLog: async (env, ctx, regel) => { staat.kasboek.push(regel); },
        metSaldoSlot: async (env, adres, fn) => ({ bezet: false, result: await fn() }),
        atHaal: async (env, sleutel, id) => ({ id, fields: { Saldo: staat.saldo, Email: 'klant@example.com' } }),
        console: { error() {}, warn() {}, log() {} }
      };
      const maak = new Function(...Object.keys(omg), srcAdmin + '\nreturn handleAdminKlantenPost;');
      const fn = maak(...Object.values(omg));
      return { staat, roep: (body) => fn({ json: async () => body }, { LOGDB: {} }, { waitUntil() {} }) };
    };
    const ID = 'rec0123456789abcd';

    const b = bouwAdmin(180);
    const rb = await b.roep({ actie: 'bijboeken', id: ID, delta: 50, door: 'nico', reden: 'Tikkie betaald' });
    toets('bijboeken lukt', rb.body.ok === true, JSON.stringify(rb.body));
    toets('er staat één kasboekregel', b.staat.kasboek.length === 1, b.staat.kasboek.length + ' regel(s)');
    gezien.add(b.staat.kasboek.length ? b.staat.kasboek[0].soort : null);
    toets('soort admin-mutatie', b.staat.kasboek[0].soort === 'admin-mutatie', String(b.staat.kasboek[0].soort));
    toets('Credits +50 en SaldoNa 230',
          b.staat.kasboek[0].credits === 50 && b.staat.kasboek[0].saldoNa === 230, JSON.stringify(b.staat.kasboek[0]));
    toets('de klant staat erbij', b.staat.kasboek[0].klant === 'klant@example.com', String(b.staat.kasboek[0].klant));
    toets('en wie het deed, met reden',
          /nico/.test(String(b.staat.kasboek[0].details)) && /Tikkie/.test(String(b.staat.kasboek[0].details)),
          String(b.staat.kasboek[0].details));

    const z = bouwAdmin(180);
    const rz = await z.roep({ actie: 'update', id: ID, saldo: 120, saldoWas: 180, door: 'nico' });
    toets('saldo zetten lukt', rz.body.ok === true, JSON.stringify(rz.body));
    toets('er staat één kasboekregel', z.staat.kasboek.length === 1, z.staat.kasboek.length + ' regel(s)');
    toets('Credits -60 en SaldoNa 120',
          z.staat.kasboek[0].credits === -60 && z.staat.kasboek[0].saldoNa === 120, JSON.stringify(z.staat.kasboek[0]));

    // Een update zonder saldo raakt het tegoed niet en hoort dus ook geen
    // regel op te leveren — anders staat een naamswijziging in het kasboek.
    const n = bouwAdmin(180);
    await n.roep({ actie: 'update', id: ID, naam: 'Nieuwe naam', door: 'nico' });
    toets('een update zonder saldo laat het kasboek met rust', n.staat.kasboek.length === 0,
          n.staat.kasboek.length + ' regel(s)');
  }

  // ── 13. alle vier de bronnen uit #83 zijn gedekt ────────────────
  // Niet uit de broncode geteld maar uit wat de vier handlers hierboven
  // werkelijk hebben weggeschreven. Verdwijnt er een aanroep, dan valt die
  // bron stilletjes uit het kasboek, en aan de tabel zie je dat pas als je
  // hem een keer nodig hebt. Deze toets is de vangnet-regel: een nieuwe
  // saldoschrijver zonder kasboekregel hoort hier op te vallen, doordat zijn
  // bron ontbreekt zodra hij aan dit lijstje wordt toegevoegd.
  // ── 14. de analyse staat in het kasboek, en niet bij Anthropic (#524) ──
  // Op 15-10-2026 kostte één call 85 tokens en zei het kasboek alleen
  // "analyse afgeboekt". apiFetch stuurt nu pl_rol mee; de Worker zet hem in
  // Details en haalt hem van de payload af — Anthropic weigert onbekende velden.
  console.log('\n14. pl_rol gaat het kasboek in en niet naar Anthropic');
  {
    const t = bouwTegoed({ extraVelden: { pl_rol: 'brandstof:\n waar  gaat het heen?' } });
    await t.analyse(false);
    const v = laatste(t.staat);
    toets('Details noemt de analyse', v && v.Details === 'analyse afgeboekt \u2014 brandstof: waar gaat het heen?',
          v && JSON.stringify(v.Details));
    const b = t.staat.aiBodies[0] || {};
    toets('de payload naar Anthropic heeft geen pl_rol', !('pl_rol' in b), JSON.stringify(Object.keys(b)));
    toets('maar de rest is er nog', Array.isArray(b.messages) && b.model === 'claude-sonnet-5');

    const z = bouwTegoed();
    await z.analyse(false);
    toets('zonder pl_rol blijft Details zoals het was', laatste(z.staat).Details === 'analyse afgeboekt',
          JSON.stringify(laatste(z.staat).Details));

    const f = bouwTegoed({ patchFaalt: true, extraVelden: { pl_rol: 'diagnose' } });
    await f.analyse(false);
    toets('ook een mislukte afboeking noemt de analyse', laatste(f.staat).Details.indexOf('diagnose') > 0,
          JSON.stringify(laatste(f.staat).Details));
  }

  // ── 14b. vervolgdelen bij max_tokens zijn te tellen (#526, punt 4) ──
  // Elk vervolgdeel stuurt de hele invoer opnieuw. Zonder deelnummer was
  // dat in het kasboek niet van een nieuwe analyse te onderscheiden.
  console.log('\n14b. pl_deel gaat het kasboek in en niet naar Anthropic');
  {
    const t = bouwTegoed({ extraVelden: { pl_rol: 'diagnose', pl_deel: 2 } });
    await t.analyse(false);
    const v = laatste(t.staat);
    toets('Details noemt analyse én vervolgdeel', v && v.Details === 'analyse afgeboekt \u2014 diagnose \u2014 vervolgdeel 2',
          v && JSON.stringify(v.Details));
    const b = t.staat.aiBodies[0] || {};
    toets('de payload naar Anthropic heeft geen pl_deel', !('pl_deel' in b), JSON.stringify(Object.keys(b)));

    const z = bouwTegoed({ extraVelden: { pl_deel: 3 } });
    await z.analyse(false);
    toets('zonder pl_rol staat het vervolgdeel er alleen', laatste(z.staat).Details === 'analyse afgeboekt \u2014 vervolgdeel 3',
          JSON.stringify(laatste(z.staat).Details));

    const n = bouwTegoed({ extraVelden: { pl_rol: 'diagnose', pl_deel: '1; drop' } });
    await n.analyse(false);
    toets('een onzinnig deelnummer wordt genegeerd', laatste(n.staat).Details === 'analyse afgeboekt \u2014 diagnose',
          JSON.stringify(laatste(n.staat).Details));

    const p = bouwTegoed({ session: { u: 'beheer', r: 'admin' }, extraVelden: { pl_deel: 2 } });
    await p.analyse(true);
    await Promise.all(p.staat.jobs);
    toets('ook de verbruiksregel van personeel telt het vervolgdeel', /vervolgdeel 2/.test(laatste(p.staat).Details),
          JSON.stringify(laatste(p.staat).Details));
  }

  // ── 15. wat er naar Anthropic mag (#526) ─────────────────────────
  // Tot 15-10-2026 ging de payload ongezien door: Opus of web_search kon er
  // zo bij, afgerekend tegen één tarief. Nu een vaste lijst.
  console.log('\n15. Alleen toegestane modellen, geen tools, geen vreemde velden');
  {
    const opus = bouwTegoed({ extraVelden: { model: 'claude-opus-5' } });
    const r1 = await opus.analyse(false);
    toets('een ander model: 400, en geen AI-call', r1.status === 400 && opus.staat.aiCalls === 0,
          r1.status + ' / ' + opus.staat.aiCalls + ' call(s)');
    toets('met een leesbare melding voor apiFetch', /Model niet toegestaan/.test(r1.body && r1.body.error && r1.body.error.message),
          JSON.stringify(r1.body));
    const zoek = bouwTegoed({ extraVelden: { model: 'claude-sonnet-5', tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 50 }] } });
    const r2 = await zoek.analyse(false);
    toets('tools: 400, en geen AI-call', r2.status === 400 && zoek.staat.aiCalls === 0, r2.status + ' / ' + zoek.staat.aiCalls);
    const vreemd = bouwTegoed({ extraVelden: { model: 'claude-haiku-4-5-20251001', metadata: { x: 1 }, mcp_servers: [] } });
    await vreemd.analyse(false);
    const b = vreemd.staat.aiBodies[0] || {};
    toets('Haiku mag, en onbekende velden gaan eraf', vreemd.staat.aiCalls === 1 && !('metadata' in b) && !('mcp_servers' in b) && b.model === 'claude-haiku-4-5-20251001',
          JSON.stringify(Object.keys(b)));
  }

  // ── 16. wie niet betaalt, laat toch een spoor na (#526) ──────────
  // Personeel en "tegoed uit" draaiden zonder enige regel; wat de beheerder
  // zelf verbruikte was nergens te zien. Nu "ai-verbruik": Credits 0, geen
  // SaldoNa, zodat de optelling van de afboekingen blijft kloppen.
  console.log('\n16. Personeel en tegoed uit: een verbruiksregel, geen afboeking');
  {
    const p = bouwTegoed({ session: { u: 'beheer', r: 'admin' }, extraVelden: { pl_rol: 'diagnose' } });
    await p.analyse(true);
    await Promise.all(p.staat.jobs);
    const v = laatste(p.staat);
    toets('personeel: één regel, soort ai-verbruik', p.staat.posts.length === 1 && v.Soort === 'ai-verbruik', JSON.stringify(v));
    toets('met Credits 0 en de echte tokens', v && v.Credits === 0 && v.TokensIn === 4880 && v.TokensUit === 720, JSON.stringify(v));
    toets('zonder SaldoNa: er is geen saldo', v && !('SaldoNa' in v), JSON.stringify(v));
    toets('Details zegt wie en welke analyse', v && /personeel \(admin\)/.test(v.Details) && /diagnose/.test(v.Details), v && v.Details);
    toets('en er gaat niets van een saldo af', p.staat.patches.length === 0, JSON.stringify(p.staat.patches));

    const u = bouwTegoed({ velden: { Ontwikkelaar: true, TegoedUit: true }, saldo: 0 });
    await u.analyse(false);
    const w = laatste(u.staat);
    toets('tegoed uit: ook een verbruiksregel, geen afboeking', w && w.Soort === 'ai-verbruik' && /tegoed uit/.test(w.Details) && u.staat.patches.length === 0,
          JSON.stringify(w));

    const f = bouwTegoed({ session: { u: 'beheer', r: 'admin' }, aiStatus: 529 });
    await f.analyse(false);
    toets('een mislukte call (529) schrijft niets', f.staat.posts.length === 0, f.staat.posts.length + ' regel(s)');
  }

  console.log('\n13. Alle vier de bronnen uit #83 zijn werkelijk langsgekomen');
  {
    for (const soort of ['ai-call', 'code-ingewisseld', 'proeftegoed', 'admin-mutatie'])
      toets('bron "' + soort + '" heeft een regel geschreven', gezien.has(soort),
            'gezien: ' + JSON.stringify([...gezien]) + ' — zonder deze bron is het kasboek blind voor die mutatie');
  }

  console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
})();
