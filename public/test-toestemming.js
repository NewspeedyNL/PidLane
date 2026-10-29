// ══════════════════════════════════════════════════════════════════
// test-toestemming.js — expert op afstand in twee niveaus (#645)
// ──────────────────────────────────────────────────────────────────
// De meekijkcode geeft "basis": meekijken, lezen, de snelle scan. Opname,
// AI-analyse en de volledige kaart vragen "volledig", en die geeft alleen de
// klant. Wat hier getoetst wordt:
//  1. De Worker en de app hebben dezelfde tabel (twee kopieën, één regel).
//  2. De echte RemoteSessionDO: een verzoek boven het niveau komt niet bij de
//     local; een local van vóór #645 (niveau null) houdt het oude gedrag;
//     verbreken zet volledig terug, behalve met "tot ik stop met delen".
//  3. Een te grote vstate wordt teruggemeld in plaats van stil weggegooid,
//     en de app houdt hem eronder.
//  4. De foutcodecheck gaat mee naar de expert, en de werkplek zegt wat er
//     níét gemeten is.
// Draaien vanuit public/:  node test-toestemming.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
function knipUit(bestand, van, tot, wat) {
  const bron = fs.readFileSync(path.join(__dirname, bestand), 'utf8');
  const a = bron.indexOf(van);
  if (a < 0) { console.error('FOUT: anker voor ' + wat + ' niet gevonden: ' + van); process.exit(1); }
  const b = bron.indexOf(tot, a);
  if (b < 0) { console.error('FOUT: eindanker voor ' + wat + ' niet gevonden: ' + tot); process.exit(1); }
  return bron.slice(a, b);
}

// ── de Worker: de klasse en de helpers, zonder export ──
const W = '../worker.js';
const wBron = fs.readFileSync(path.join(__dirname, W), 'utf8').replace(/\nexport \{[\s\S]*?\};\s*$/, '\n');
const wCtx = { console, crypto: require('crypto').webcrypto, URL, TextEncoder, TextDecoder, atob, btoa, Headers: class {}, Request: class {}, Response: class { constructor(b, o) { this.body = b; this.status = (o && o.status) || 200; } static json(b, o) { return new this(b, o); } } };
vm.createContext(wCtx);
vm.runInContext(wBron + '\n;this.RemoteSessionDO=RemoteSessionDO;this.verzoekNiveauW=verzoekNiveau;this.verzoekToegestaanW=verzoekToegestaan;this.naVerbreken=toestemmingNaVerbreken;this.VSTATE_MAX=VSTATE_MAX;', wCtx);

// ── de app: pidlane-remote.js in een kale browser ──
function laadRemote() {
  const el = () => ({ classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, style: {}, textContent: '', innerHTML: '', value: '', addEventListener() {} });
  const ctx = { console, Set, Map, Promise, setTimeout, clearTimeout, setInterval, clearInterval, JSON, Math, Date, Object, Array, String, Number, isFinite, RegExp };
  ctx.window = ctx;
  ctx.document = { getElementById: el, querySelectorAll: () => [], addEventListener() {}, documentElement: el() };
  ctx.localStorage = { getItem: () => null, setItem() {} };
  ctx.location = { protocol: 'https:', origin: 'https://x', pathname: '/' };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-remote.js'), 'utf8'), ctx);
  return ctx.PLRemote;
}
const R = laadRemote();

// ── een nep-DO: echte klasse, nep-sockets en nep-opslag ──
function maakDO(niveau, blijvend) {
  const opslag = new Map();
  const sockets = [];
  let klaar = null;
  const ctx = {
    storage: { get: async k => opslag.get(k), put: async (k, v) => { opslag.set(k, v); }, delete: async k => { opslag.delete(k); }, setAlarm() {} },
    blockConcurrencyWhile: fn => { klaar = fn(); return klaar; },
    getWebSockets: tag => sockets.filter(s => !tag || s.rol === tag && !s.dicht),
    acceptWebSocket() {}
  };
  // De constructor leest meta asynchroon uit de opslag: zet hem daar dus vooraf.
  opslag.set('meta', { sid: 'abc', owner: 'k', status: 'open', exp: 0, niveau: niveau, blijvend: !!blijvend });
  const doo = new wCtx.RemoteSessionDO(ctx, {});
  doo.klaar = klaar;
  function sock(rol) {
    const s = { rol, ontvangen: [], dicht: false, send(t) { this.ontvangen.push(JSON.parse(t)); }, close() { this.dicht = true; }, deserializeAttachment() { return { role: rol }; } };
    sockets.push(s); return s;
  }
  return { doo, local: sock('local'), expert: sock('expert'), sock, opslag };
}
const stuur = async (d, ws, m) => { await d.doo.klaar; return d.doo.webSocketMessage(ws, JSON.stringify(m)); };
const types = m => m.ontvangen.map(x => x.type + (x.reason ? ':' + x.reason : ''));

(async () => {
  console.log('\n1. Eén tabel, twee kopieën');
  {
    const gevallen = [
      { type: 'request-pids' }, { type: 'request-dtc' }, { type: 'request-poll' }, { type: 'request-vstate' },
      { type: 'request-rapport' }, { type: 'request-snelscan' }, { type: 'request-toestemming' },
      { type: 'request-record', action: 'start' }, { type: 'request-record', action: 'stop' }, { type: 'request-record', action: 'csv' },
      { type: 'request-analyze' }, { type: 'request-kaart' }, { type: 'request-wis' }, { type: 'telemetry' }
    ];
    for (const g of gevallen) {
      const w = wCtx.verzoekNiveauW(g), a = R._verzoekNiveau(g);
      toets('niveau ' + g.type + (g.action ? ':' + g.action : '') + ' = ' + w, w === a, 'worker ' + w + ', app ' + a);
      for (const n of ['basis', 'volledig']) {
        const wt = wCtx.verzoekToegestaanW(g, n), at = R._verzoekToegestaan(g, n);
        if (wt !== at) toets('toegestaan ' + g.type + ' bij ' + n, false, 'worker ' + wt + ', app ' + at);
      }
    }
    toets('opname en analyse vragen volledig', wCtx.verzoekNiveauW({ type: 'request-analyze' }) === 'volledig' && wCtx.verzoekNiveauW({ type: 'request-record', action: 'start' }) === 'volledig');
    toets('een opname stoppen mag altijd', wCtx.verzoekToegestaanW({ type: 'request-record', action: 'stop' }, 'basis') === true);
    toets('een onbekend verzoek nooit, ook niet bij volledig', wCtx.verzoekToegestaanW({ type: 'request-wis' }, 'volledig') === false);
    toets('local van vóór #645 (null): alles wat bestond blijft open', wCtx.verzoekToegestaanW({ type: 'request-analyze' }, null) === true);
  }

  console.log('\n2. De Durable Object dwingt het af');
  {
    let d = maakDO('basis');
    await stuur(d, d.expert, { type: 'request-analyze', problem: 'x', reqId: 'r1' });
    toets('basis: analyse komt niet bij de local', d.local.ontvangen.length === 0, types(d.local).join());
    toets('basis: expert krijgt geen_toestemming met wat nodig is', d.expert.ontvangen.some(m => m.reason === 'geen_toestemming' && m.nodig === 'volledig' && m.reqId === 'r1'), JSON.stringify(d.expert.ontvangen));
    await stuur(d, d.expert, { type: 'request-snelscan', reqId: 'r2' });
    toets('basis: snelle scan komt wél aan', types(d.local).join() === 'request-snelscan', types(d.local).join());
    await stuur(d, d.expert, { type: 'request-toestemming', niveau: 'volledig', reden: 'opname tijdens proefrit', reqId: 'r3' });
    const vr = d.local.ontvangen.find(m => m.type === 'request-toestemming');
    toets('basis: de vraag om toestemming komt aan, met reden', vr && vr.reden === 'opname tijdens proefrit');
    await stuur(d, d.expert, { type: 'request-toestemming', niveau: 'admin', reqId: 'r4' });
    toets('een vraag om een ander niveau is ongeldig', d.expert.ontvangen.some(m => m.reason === 'invalid'));

    await stuur(d, d.local, { type: 'toestemming', niveau: 'volledig', blijvend: false });
    toets('local geeft volledig: meta bijgewerkt', d.doo._meta.niveau === 'volledig' && d.doo._meta.blijvend === false);
    toets('de expert hoort het', d.expert.ontvangen.some(m => m.type === 'toestemming' && m.niveau === 'volledig'));
    await stuur(d, d.expert, { type: 'request-kaart', reqId: 'r5' });
    toets('volledig: de kaart komt aan', d.local.ontvangen.some(m => m.type === 'request-kaart'));

    await stuur(d, d.local, { type: 'toestemming', niveau: 'superuser' });
    toets('een onbekend niveau van de local wordt basis', d.doo._meta.niveau === 'basis');
    await stuur(d, d.local, { type: 'toestemming', niveau: 'basis', blijvend: true });
    toets('blijvend hoort alleen bij volledig', d.doo._meta.blijvend === false);

    // oude local: nooit een toestemming gemeld
    d = maakDO(null);
    await stuur(d, d.expert, { type: 'request-analyze', problem: '', reqId: 'o1' });
    toets('local van vóór #645: analyse komt nog steeds aan', d.local.ontvangen.some(m => m.type === 'request-analyze'));
  }

  console.log('\n3. Verbreken: volledig vervalt, tenzij blijvend');
  {
    let d = maakDO('volledig', false);
    d.expert.dicht = true; await d.doo.klaar;
    await d.doo.webSocketClose(d.expert, 1000, '', true);
    toets('laatste expert weg: terug naar basis', d.doo._meta.niveau === 'basis');
    d = maakDO('volledig', true);
    d.expert.dicht = true; await d.doo.klaar;
    await d.doo.webSocketClose(d.expert, 1000, '', true);
    toets('met "tot ik stop met delen": blijft volledig', d.doo._meta.niveau === 'volledig');
    d = maakDO('volledig', false);
    const tweede = d.sock('expert');
    d.expert.dicht = true; await d.doo.klaar;
    await d.doo.webSocketClose(d.expert, 1000, '', true);
    toets('er kijkt nog een expert mee: blijft volledig', d.doo._meta.niveau === 'volledig');
    tweede.dicht = true;
    d = maakDO('volledig', false);
    d.local.dicht = true; await d.doo.klaar;
    await d.doo.webSocketClose(d.local, 1006, '', false);
    toets('de local valt weg: terug naar basis', d.doo._meta.niveau === 'basis');
    toets('pure regel: basis blijft basis', wCtx.naVerbreken({ niveau: 'basis', blijvend: false }).niveau === 'basis');
  }

  console.log('\n4. vstate: te groot wordt gemeld, en de app blijft eronder');
  {
    const d = maakDO('basis');
    const groot = { t: 1, pids: [], voorkennis: { rapporten: [{ title: 'x'.repeat(40000) }] } };
    await stuur(d, d.local, { type: 'vstate', data: groot });
    const af = d.local.ontvangen.find(m => m.type === 'vstate-rejected');
    toets('DO meldt te_groot terug aan de local', af && af.reason === 'te_groot' && af.max === wCtx.VSTATE_MAX, JSON.stringify(af));
    toets('en stuurt niets naar de expert', !d.expert.ontvangen.some(m => m.type === 'vstate'));
    await stuur(d, d.local, { type: 'vstate', data: { t: 2, pids: ['010C'] } });
    toets('een gewone vstate komt aan', d.expert.ontvangen.some(m => m.type === 'vstate'));

    const pids = []; for (let i = 0; i < 200; i++) pids.push('22' + (0x1000 + i).toString(16).toUpperCase());
    const rapporten = []; for (let i = 0; i < 5; i++) rapporten.push({ id: 'sr1_1700000000000', title: 'r'.repeat(120), ts: '2026-10-29' });
    const bekend = []; for (let i = 0; i < 8; i++) bekend.push({ t: 'b'.repeat(4500) });
    const o = { t: 1, pids, active: pids.slice(0, 60), voorkennis: { rapporten, bekend, kansen: [] }, health: {} };
    toets('de proef is echt te groot', JSON.stringify(o).length > 30000, JSON.stringify(o).length + ' tekens');
    const r = R._vstateBinnenGrens(o, 30000);
    toets('ingekort onder de grens', JSON.stringify(r).length <= 30000, JSON.stringify(r).length + ' tekens');
    toets('zegt wat eraf ging', Array.isArray(r.ingekort) && r.ingekort.length > 0, JSON.stringify(r.ingekort));
    toets('het origineel blijft heel', o.pids.length === 200 && o.voorkennis.bekend.length === 8);
    const klein = { t: 1, pids: ['010C'] };
    toets('een kleine vstate blijft ongemoeid', R._vstateBinnenGrens(klein, 30000) === klein);
  }

  console.log('\n5. De foutcodecheck gaat mee, de werkplek zegt wat er mist');
  {
    const s = R._scanVoorExpert({ tijd: 5, codes: { bevestigd: ['P0171'], pending: ['P0300'], permanent: [] },
      gelezen: { bevestigd: true, pending: true, permanent: false }, readiness: { mil: true, aantal: 1, ondersteund: 5, nietKlaar: ['Katalysator'] },
      sinds: { km: 42, milKm: 10 }, freeze: { code: 'P0171', waarden: { '0106': 12, '<b>': 1, '010C': 'x' } } });
    toets('codes per soort', s.codes.bevestigd.join() === 'P0171' && s.codes.pending.join() === 'P0300');
    toets('niet gelezen blijft niet gelezen', s.gelezen.permanent === false);
    toets('freeze frame: alleen geldige PIDs met getallen', JSON.stringify(s.freeze.waarden) === '{"0106":12}', JSON.stringify(s.freeze.waarden));
    toets('geen scan: null', R._scanVoorExpert(null) === null);

    const ctx = { console, window: {} }; ctx.window = ctx; ctx.document = { getElementById: () => null };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-expertwerk.js'), 'utf8'), ctx);
    const E = ctx.PLExpertWerk;
    const leeg = E.dekking({ pids: [], voorkennis: {} });
    toets('lege auto: drie keer "mist"', leeg.filter(x => x.soort === 'mist').length === 3, JSON.stringify(leeg));
    const html = E.html({ pids: ['010C'], voorkennis: {} }, null, null, null);
    toets('lege kaart zegt niet "geen foutcodes" maar "nog niets uitgelezen"', /Nog niets uitgelezen/.test(html) && !/Geen foutcodes, gezakte/.test(html));
    const dek = E.dekking({ pids: ['010C'], scan: s, voorkennis: { mode06: { tests: 12 } } });
    toets('permanent niet gelezen: let', dek.some(x => x.soort === 'let' && /Niet gelezen: permanent/.test(x.tekst)), JSON.stringify(dek));
    toets('zelftest niet klaar: let', dek.some(x => x.soort === 'let' && /Katalysator/.test(x.tekst)));
    toets('42 km sinds wissen: let', dek.some(x => x.soort === 'let' && /42 km geleden gewist/.test(x.tekst)));
    toets('mode 06 gelezen: ok', dek.some(x => x.soort === 'ok' && /Mode 06/.test(x.tekst)));
    const af = E.afwijkingen({ scan: s, dtc: ['P0171'] });
    toets('in afwachting staat bij wijkt nu af', af.some(a => a.tekst === 'P0300' && a.ernst === 'oranje'));
    const gezond = E.html({ pids: ['010C'], dtc: [], scan: R._scanVoorExpert({ codes: { bevestigd: [], pending: [], permanent: [] }, gelezen: { bevestigd: true, pending: true, permanent: true }, readiness: { nietKlaar: [] }, sinds: { km: 5000 } }), voorkennis: {} }, null, null, null);
    toets('na een scan zonder codes: wél "geen foutcodes"', /Geen foutcodes, gezakte/.test(gezond));
  }

  console.log('\n6. App: poll-sleutels, stilstand, de vraag aan de klant');
  {
    toets('mode 01 kaal, de rest vol', R._pollSleutels(['010C', '221E1C', 'CA05', 'rommel!']).join() === '0C,221E1C,CA05', R._pollSleutels(['010C', '221E1C', 'CA05', 'rommel!']).join());
    toets('rijdt 50 km/u: geen kaart', R._magKaart(50).mag === false);
    toets('stil of onbekend: kaart mag', R._magKaart(0).mag && R._magKaart(null).mag && R._magKaart(undefined).mag);
    const h = R._klantVraagHtml({ reden: '<img src=x onerror=alert(1)>' });
    toets('reden van de expert gaat door esc()', h.indexOf('<img') < 0 && /&lt;img/.test(h));
    toets('de vraag noemt het tegoed', /jouw tegoed/.test(h));
    toets('geen vraag: niets', R._klantVraagHtml(null) === '');
  }

  console.log(fouten ? '\n' + fouten + ' FOUT(EN)\n' : '\nAlles goed\n');
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error('FOUT: test liep vast:', e); process.exit(1); });
