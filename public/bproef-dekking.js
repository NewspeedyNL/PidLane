// ═══════════════════════════════════════════════════════════════════
// bproef-dekking.js — hoeveel van wat een auto aanbiedt is oproepbaar? (#670)
// ───────────────────────────────────────────────────────────────────
// WAAROM. De wens: na de setup-wizard is ≥ 90 % van wat een auto aanbiedt
// oproepbaar. "Wat een auto aanbiedt" staat in nepvloot/profielen.json:
// per model en bouwjaar wat een échte auto in OBDb beantwoordde — mode 01
// én de fabriekscodes (22xxxx/21xx) met hun adres. Gegenereerd door
// plnepvloot.js, geen handwerk.
//
// WAT ER PER AUTO GEBEURT, langs de weg van een klant met de ECHTE app:
//   1. initELM327() → scanNetworks() → startDiscovery()      ("Snel")
//   2. PLEigen.zoekObdb() met de signalset van het model, dan
//      PLPidZoek.zoek() met PLEigen.test() per kandidaat      ("Grondig")
//      — precies de keten van de knop 🚀/Grondig in de wizard. Alleen de
//      Worker (obdb_bestand) is vervangen door het bestand uit nepvloot/,
//      en _sendBTOnce() door PLNepAuto.
// Gemeten:
//   dekking = (mode 01 in supportedPIDs + fabriekscodes die "passen")
//             ÷ (mode 01 aangeboden + fabriekscodes aangeboden)
// plus waar het verschil zit: niet ontdekt, geen kandidaat (adressering,
// geen eenheid, de kap van 60), "weigert", "vreemd".
//
// OORDEEL. De 90 % is een wens, geen regel: eronder is LET OP. FOUT is:
//   • de route loopt vast, of er komt een JS-fout;
//   • een PID in supportedPIDs die de auto niet aanbiedt (spook, #616);
//   • de dekking zakt onder de VLOER van die auto. De vloer is wat er al
//     gehaald werd: hij mag alleen omhoog. Ligt de meting er ≥ 1 punt
//     boven, dan zegt de proef dat (LET OP: verhoog de vloer).
//
// Draaien vanuit public/:  node bproef-dekking.js          (de keuze)
//                          node bproef-dekking.js --alle   (alle profielen)
//                          node bproef-dekking.js golf19   (één auto)
// TEGENPROEF: plmutate.sh laat obdbAdres() een ander antwoordadres
// (tx>rx) weigeren; de Golf zakt dan onder zijn vloer.
// ═══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const fs = require('fs');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));
const VLOOT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'nepvloot', 'profielen.json'), 'utf8')).auto;
const OBDB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'nepvloot', 'obdb.json'), 'utf8'));
const STEUN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'nepvloot', 'steun.json'), 'utf8'));
const NEP = fs.readFileSync(path.join(__dirname, 'nepauto.js'), 'utf8');

const WENS = 90;
// Snel genoeg voor elke PR en voor de tegenproef: 11-bit (Mazda), VAG met
// een ander antwoordadres (tx>rx), 29-bit, en een EV op 29-bit.
const KEUZE = ['cx5_18', 'golf19', 'fiat500_14', 'zoe21'];
// Wat deze proef vindt en als issue openstaat: LET OP in plaats van FOUT.
// Verdwijnt het, dan zegt de proef dat (haal het dan weg).
const BEKEND = {
  'spook:leaf19': '#616 — een EV zonder mode 01: de merkpreset zet er PIDs in die de auto niet heeft'
};
// Gemeten dekking (%) per auto op 05-11-2026, met de steunlijst en S16( ); mag alleen omhoog. Geen vloer =
// LET OP met het getal erbij.
const VLOER = {
  cx5_18: 86, mazda3_19: 100, mazda2_18: 100, golf19: 85, polo18: 72,
  tiguan19: 61, id3_21: 20, a3_19: 80, ibiza19: 100, octavia19: 100,
  p208_19: 100, p2008_20: 100, p308_18: 100, clio20: 100, zoe21: 95,
  sandero21: 100, yaris20: 100, corolla20: 82, chr20: 100, aygo19: 71,
  rav4_19: 90, niro19: 92, picanto17: 100, sportage20: 100, ceed19: 100,
  tucson19: 100, kona20: 90, i30_19: 89, focus18: 80, fiesta18: 84,
  fiat500_14: 100, qashqai19: 100, leaf19: 67, xc40_20: 100, mgzs21: 94,
  swift19: 94, civic19: 36, bmw3_19: 72, mini19: 44, cklasse18: 100
};

let fouten = 0, letop = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
function let_op(t) { console.log('  LET OP ' + t); letop++; }

const ROUTE = (id) => `(async function(){
  const p = window._PL_VLOOT.find(function(x){ return x.id === ${JSON.stringify(id)}; });
  const a = PLNepAuto.maak(p);
  window._sendBTOnce = async function(cmd){ const r = a.stuur(cmd); await new Promise(function(z){ setTimeout(z, Math.min(r.ms, 40)); }); return r.tekst; };
  window._webBtWrite = function(){};
  connected = true; demoMode = false;
  const tijd = function(pr, ms, n){ return Promise.race([pr, new Promise(function(_, rj){ setTimeout(function(){ rj(new Error('duurt langer dan ' + ms / 1000 + ' s: ' + n)); }, ms); })]); };
  const u = { fout: [] };
  try { await tijd(initELM327(), 30000, 'initELM327'); } catch (e) { u.fout.push(e.message); }
  _kentPoortKlaar = true;
  try { await tijd(scanNetworks(), 30000, 'scanNetworks'); } catch (e) { u.fout.push(e.message); }
  vehicleInfo.brandstof = normBrandstof({ benzine: 'Benzine', diesel: 'Diesel', hybride: 'Benzine/Elektriciteit', elektrisch: 'Elektriciteit' }[p.brandstof]);
  try { await tijd(startDiscovery(), 120000, 'startDiscovery'); } catch (e) { u.fout.push(e.message); }
  u.supported = [...supportedPIDs];
  u.merk = vehicleInfo.merk || '';
  // Grondig: dezelfde keten als PLGarage._pzStart, zonder de server. GitHub
  // kent repo-namen zonder hoofdletters (FIAT-500 = Fiat-500), de Worker dus ook.
  const gevraagd = [];
  const haal = async function(repo){ gevraagd.push(repo); return String(repo).toLowerCase() === p.repo.toLowerCase() ? { gevonden: true, data: { commands: window._PL_OBDB[p.repo] || [] } } : { gevonden: false }; };
  // obdb_steun: dezelfde jaarvolgorde als de Worker (jaar, ±1, ±2); nepvloot/
  // heeft per model één jaar. test-klantplatform.js toetst de echte actie.
  const haalSteun = async function(repo, jaar){
    if (String(repo).toLowerCase() !== p.repo.toLowerCase()) return { gevonden: false };
    for (const j of [jaar, jaar - 1, jaar + 1, jaar - 2, jaar + 2]) if (window._PL_STEUN[j]) return { gevonden: true, jaar: j, tekst: window._PL_STEUN[j] };
    return { gevonden: false };
  };
  let z = null;
  try { z = await tijd(PLEigen.zoekObdb({ merk: u.merk || p.merk, model: p.model, bouwjaar: p.jaar, brandstof: vehicleInfo.brandstof }, haal, window._PL_ZONDER_STEUN ? null : haalSteun), 10000, 'zoekObdb'); } catch (e) { u.fout.push(e.message); }
  u.obdb = z ? { ok: z.ok, repo: z.repo || '', fout: z.fout || '', n: (z.kandidaten || []).length, afgekapt: z.afgekapt || 0, nietBruikbaar: z.nietBruikbaar || 0, steunJaar: z.steunJaar || null, nietDitJaar: z.nietDitJaar || 0, gevraagd: gevraagd } : null;
  if (z && z.ok && z.kandidaten && z.kandidaten.length) {
    const kand = PLPidZoek.kandidaten(z.kandidaten, []);
    let r = null;
    try {
      r = await tijd(PLPidZoek.zoek(kand, { test: function(b){ return PLEigen.test({ code: b.code, naam: b.naam, formule: b.formule, eenheid: b.eenheid, ecu: b.ecu }); } }), 300000, 'PLPidZoek.zoek');
    } catch (e) { u.fout.push(e.message); }
    if (r) u.zoek = { kand: kand.map(function(c){ return c.code + '@' + c.ecu; }), past: r.past.map(function(x){ return x.c.code + '@' + x.c.ecu; }),
      nee: r.nee.map(function(x){ return x.c.code + '@' + x.c.ecu; }), vreemd: r.vreemd.map(function(x){ return x.c.code + '@' + x.c.ecu + ' ' + x.reden; }),
      fout: r.fout.map(function(x){ return x.c.code + '@' + x.c.ecu + ' ' + x.reden; }), afgebroken: r.afgebroken };
  }
  return u;
})()`;

// code@ecu → code@tx: "70E>778" en "7E0" vergelijken op het zendadres.
const sleutel = (code, ecu) => String(code).toUpperCase() + '@' + String(ecu || '').toUpperCase().split('>')[0];
const BITMAP = /^01(00|20|40|60|80|A0|C0|E0)$/;

// Puur: de telling uit wat de pagina teruggaf. Los te toetsen.
function tel(p, u) {
  const sup = new Set((u.supported || []).filter((x) => /^01[0-9A-F]{2}$/.test(x) && !BITMAP.test(x)));
  const m01 = p.aangeboden.mode01.filter((x) => !BITMAP.test(x));
  const m01ok = m01.filter((x) => sup.has(x));
  const spook = [...sup].filter((x) => m01.indexOf(x) < 0);
  // Wat OBDb niet na te bouwen gaf, is een gat in de proef en telt niet.
  const did = [...new Set(p.aangeboden.did.filter((d) => d.waarom !== 'simulatie').map((d) => sleutel(d.code, d.ecu)))];
  const z = u.zoek || { kand: [], past: [], nee: [], vreemd: [], fout: [] };
  const past = new Set(z.past.map((k) => sleutel(...k.split('@'))));
  const kand = new Set(z.kand.map((k) => sleutel(...k.split('@'))));
  const didOk = did.filter((k) => past.has(k));
  const geenKand = did.filter((k) => !kand.has(k));
  const noemer = m01.length + did.length;
  return {
    m01: m01.length, m01ok: m01ok.length, m01mist: m01.filter((x) => !sup.has(x)), spook,
    did: did.length, didOk: didOk.length, geenKand: geenKand.length,
    nagebouwd: p.aangeboden.did.filter((d) => d.nagebouwd).length,
    simulatie: p.aangeboden.did.filter((d) => d.waarom === 'simulatie').length,
    nee: z.nee.length, vreemd: z.vreemd, kandFout: z.fout,
    snel: noemer ? Math.round(1000 * m01ok.length / noemer) / 10 : 0,
    dekking: noemer ? Math.round(1000 * (m01ok.length + didOk.length) / noemer) / 10 : 0
  };
}

async function rij(id) {
  const p = VLOOT.find((x) => x.id === id);
  if (!p) { toets('profiel ' + id + ' bestaat', false); return null; }
  console.log('\n── ' + p.naam + '  [' + p.bron + ']');
  const t0 = Date.now();
  let app;
  try { app = await startApp({ root: __dirname }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    await app.venster(412, 915);
    await app.ev(NEP + ';window._PL_VLOOT=' + JSON.stringify([p]) + ';window._PL_OBDB=' + JSON.stringify({ [p.repo]: OBDB[p.repo] || [] }) + ';window._PL_STEUN=' + JSON.stringify(STEUN[p.repo] || {}) + ';true');
    const u = await app.ev(ROUTE(id));
    toets('de route liep zonder vastlopen', !u.fout.length, u.fout.join(' | '));
    const t = tel(p, u);
    if (t.spook.length && BEKEND['spook:' + id]) let_op('spook-PIDs ' + t.spook.join(',') + ' — bekend: ' + BEKEND['spook:' + id]);
    else toets('geen spook-PIDs in supportedPIDs (#616)', !t.spook.length, t.spook.join(','));
    if (!t.spook.length && BEKEND['spook:' + id]) let_op('geen spook meer bij ' + id + ' — ' + BEKEND['spook:' + id] + ' opgelost? Haal hem uit BEKEND.');
    if (t.m01mist.length) console.log('  mode 01 niet ontdekt: ' + t.m01mist.join(','));
    const o = u.obdb || {};
    if (!o.repo) let_op('OBDb-model niet gevonden door de app: gezocht als ' + (o.gevraagd || []).join(', ') + (o.fout ? ' (' + o.fout + ')' : '') + ' — het bestand heet ' + p.repo);
    if (o.repo && !o.n && t.did) let_op('OBDb (' + o.repo + ') gaf de app 0 kandidaten, terwijl de auto ' + t.did + ' fabriekscodes heeft');
    console.log('  mode 01  ' + t.m01ok + '/' + t.m01 + '   fabriek ' + t.didOk + '/' + t.did + ' (nagebouwd ' + t.nagebouwd + (t.simulatie ? ', ' + t.simulatie + ' niet na te bouwen' : '') + ', geen kandidaat ' + t.geenKand +
      (o.steunJaar ? ', steunlijst ' + o.steunJaar + (o.nietDitJaar ? ' (' + o.nietDitJaar + ' niet dit jaar)' : '') : ', geen steunlijst') + (o.afgekapt ? ', ' + o.afgekapt + ' weg door de kap van 60' : '') + (o.nietBruikbaar ? ', ' + o.nietBruikbaar + ' adressering' : '') + ', weigert ' + t.nee + ', vreemd ' + t.vreemd.length + ')');
    if (process.env.DEKKING_DETAIL) {
      const z = u.zoek || { kand: [], nee: [] }, kand = new Set(z.kand.map((k) => sleutel(...k.split('@'))));
      console.log('    geen kandidaat: ' + p.aangeboden.did.filter((d) => !kand.has(sleutel(d.code, d.ecu))).map((d) => d.code + '@' + d.ecu + (d.nagebouwd ? '' : '(n)') + ':' + d.sig).join(' '));
      console.log('    weigert: ' + z.nee.join(' '));
    }
    t.vreemd.slice(0, 3).forEach((v) => console.log('    vreemd: ' + v));
    t.kandFout.slice(0, 3).forEach((v) => console.log('    fout: ' + v));
    console.log('  dekking  snel ' + t.snel + ' %   grondig ' + t.dekking + ' %   (' + Math.round((Date.now() - t0) / 1000) + ' s)');
    if (t.dekking < WENS) let_op('onder de wens van ' + WENS + ' %: ' + t.dekking + ' %');
    const v = VLOER[id];
    if (v !== undefined) {
      toets('niet onder de vloer van ' + v + ' %', t.dekking >= v, t.dekking + ' %');
      if (t.dekking >= v + 1) let_op('boven de vloer: zet VLOER.' + id + ' op ' + Math.floor(t.dekking));
    } else let_op('nog geen vloer: zet VLOER.' + id + ' op ' + Math.floor(t.dekking));
    toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    return t;
  } finally { await app.stop(); }
}

if (require.main === module) {
  (async () => {
    const arg = process.argv.slice(2).filter((x) => !/^--/.test(x));
    const ids = arg.length ? arg : process.argv.includes('--alle') ? VLOOT.map((p) => p.id) : KEUZE;
    const uit = [];
    for (const id of ids) { const t = await rij(id); if (t) uit.push([id, t]); }
    console.log('\n  auto         snel  grondig');
    uit.forEach(([id, t]) => console.log('  ' + id.padEnd(12) + String(t.snel).padStart(5) + String(t.dekking).padStart(8)));
    const gem = uit.length ? Math.round(10 * uit.reduce((s, [, t]) => s + t.dekking, 0) / uit.length) / 10 : 0;
    console.log('\n' + (fouten ? 'bproef-dekking: ' + fouten + ' fout(en)' : 'bproef-dekking: geen fouten') + (letop ? ', ' + letop + ' LET OP' : '') +
      ' — ' + uit.length + ' auto(\'s), gemiddeld ' + gem + ' % (wens ' + WENS + ' %)');
    process.exit(fouten ? 1 : 0);
  })();
}
module.exports = { tel, sleutel };
