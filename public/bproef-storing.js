// ═══════════════════════════════════════════════════════════════════
// bproef-storing.js — de klantroute en de pollus tegen een storende adapter
// ───────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// bproef-merken.js laat de echte app tegen 21 nagebootste auto's lopen, maar
// altijd met een adapter die elk antwoord netjes aflevert. Een echte
// Bluetooth-kloon doet dat niet: een antwoord valt weg (time-out, ''), de
// ECU zegt NO DATA op een PID die hij net nog gaf, er komt een half frame,
// BUFFER FULL, CAN ERROR, of de adapter valt halverwege helemaal stil. De
// vraag hier is niet óf de app dat merkt, maar wat hij ermee DOET:
//
//   1. loopt de route af binnen zijn tijd (geen hangende await)
//   2. geen JS-fouten in de pagina
//   3. geen spookdata: geen PID ontdekt die de auto niet heeft, geen
//      foutcode die de auto niet heeft, geen VIN die niet die van de auto is
//   4. wat de survey 'ok' noemt is de waarde van de auto (geen rommel als
//      meting geboekt)
//   5. de pollus: blijft hij lopen onder ruis, komen de waarden goed binnen,
//      en herstelt hij na een stille adapter zonder dat iemand hem aanzet
//
// De storing zit om PLNepAuto heen, op dezelfde plek als in bproef-merken.js
// (_sendBTOnce), met een vaste zaadwaarde: elke run stoort op precies
// dezelfde commando's, dus een rode run is na te spelen.
//
// BEKEND: wat deze proef vindt en als issue openstaat is LET OP met het
// nummer erbij; al het andere is FOUT. Een bekende bevinding die bij een
// volle run niet meer opduikt, meldt hij ook.
//
// WAT DEZE PROEF NIET IS. Geen rit: de storingen zijn nagebouwd, met
// kansen die we kozen en niet gemeten hebben. Hoe vaak een echte kloon
// dit doet en in welke vorm blijft een vraag voor CAMPAGNE.
//
// Draaien vanuit public/:  node bproef-storing.js            (vier auto's)
//                          node bproef-storing.js --alle     (vier)
//                          node bproef-storing.js golf16     (één auto)
//                          PL_STORING='{"ruis":{"nodata":0.25}}'  harder storen
// TEGENPROEF (25-10-2026): met pidlane-bt.js en pidlane-veldlab.js van vóór
// #614/#615 wordt hij rood — Fiat 500 op CAN 11-bit met 22 gemiste PIDs, en
// een Mercedes-sessie met cijfer 8,9 en "geen foutcodes" na een dode adapter.
// plmutate.sh zet de 0100-herhaling en de dode-socketdrempel terug.
// ═══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const fs = require('fs');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));
const PROFIELEN = require('./nepauto-profielen.js');
const PLNepAuto = require('./nepauto.js');
const NEP = fs.readFileSync(path.join(__dirname, 'nepauto.js'), 'utf8');
const PROF = fs.readFileSync(path.join(__dirname, 'nepauto-profielen.js'), 'utf8')
  .replace("'use strict';", '').replace('const PL_NEPAUTO_PROFIELEN', 'window.PL_NEPAUTO_PROFIELEN');

// CAN 11-bit, CAN 11-bit met twee ECU's en ISO-TP, CAN 29-bit, KWP2000.
// Standaard de twee waar een fout het meest kost (29-bit en KWP); --alle
// neemt de CX-5 en de Golf erbij.
const ALLE = ['cx5', 'golf16', 'fiat500', 'merc00'];
const KEUZE = ['fiat500', 'merc00'];
// Een storing per soort. Kansen per OBD-verzoek (AT-commando's blijven schoon,
// behalve bij 'los', waar de adapter zelf wegvalt).
const STORING = {
  ruis: { nodata: 0.08, leeg: 0.03 },
  rommel: { rommel: 0.15 },
  los: { losNa: 70 },
  // Eén NO DATA op het allereerste OBD-verzoek: een ECU die nog wakker wordt.
  eerste: { eerste: 1 },
  // Het eerste steunbitblok onleesbaar, het protocol wel herkend (#616).
  bitmap: { bitmap: true },
  // De adapter valt weg midden in de survey, 30 verzoeken na de discovery.
  survey: { losNaDiscovery: 30 },
  // De adapter valt weg precies bij de foutcodes (mode 03), na de PID-sweep.
  dtc: { losBij: '^03$' }
};
// PL_STORING='{"ruis":{"nodata":0.3}}' zet een soort harder, om de grens te zoeken.
if (process.env.PL_STORING) Object.assign(STORING, JSON.parse(process.env.PL_STORING));
const BEKEND = {
};

let fouten = 0, letop = 0;
const gezien = new Set();
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
function bevinding(sleutel, naam, uitleg) {
  gezien.add(sleutel);
  if (BEKEND[sleutel]) { console.log('  LET OP ' + naam + ' — bekend: ' + BEKEND[sleutel] + (uitleg ? ' (' + uitleg + ')' : '')); letop++; }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// De adapter met storing. window._storing is van buiten bij te stellen
// (de pollproef zet de adapter even stil en weer aan).
const ADAPTER = (id, soort) => `(function(){
  const p = PL_NEPAUTO_PROFIELEN.find(function(x){ return x.id === ${JSON.stringify(id)}; });
  const a = PLNepAuto.maak(p);
  let z = 0x5EED1;                                  // mulberry32, vaste zaadwaarde
  const rnd = function(){ z = (z + 0x6D2B79F5) | 0; let t = Math.imul(z ^ (z >>> 15), 1 | z); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ROMMEL = ['STOPPED', 'BUFFER FULL', 'CAN ERROR', '<RX ERROR', '?', 'BUS BUSY', 'FB ERROR', '41 0C 0', '7E8 10 14 49 02 01 4A', 'SEARCHING...'];
  const st = window._storing = Object.assign({ n: 0, stil: false, stilN: 0, gestoord: 0, log: [] }, ${JSON.stringify(STORING[soort] || {})});
  const slaap = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  window._nepAuto = a;
  window._sendBTOnce = async function(cmd){
    st.n++;
    if (st.losBij && !st.losNa && new RegExp(st.losBij).test(cmd)) st.losNa = st.n - 1;
    if (st.stilN > 0) { st.stilN--; await slaap(60); st.gestoord++; return ''; }
    if (st.stil || (st.losNa && st.n > st.losNa)) { await slaap(60); st.gestoord++; return ''; }
    const r = a.stuur(cmd);
    await slaap(Math.min(r.ms, 40));
    if (/^AT/i.test(cmd)) return r.tekst;
    // Steunbits na de protocoldetectie onleesbaar: elke 0100 behalve de eerste.
    if (st.bitmap && /^0100/.test(cmd) && (st.n0100 = (st.n0100 || 0) + 1) > 1) { st.gestoord++; st.log.push(cmd + '→NO DATA (bitmap)'); return 'NO DATA'; }
    if (st.eerste > 0) { st.eerste--; st.gestoord++; st.log.push(cmd + '→NO DATA (eerste)'); return 'NO DATA'; }
    const x = rnd();
    if (st.nodata && x < st.nodata) { st.gestoord++; st.log.push(cmd + '→NO DATA'); return 'NO DATA'; }
    if (st.leeg && x > 1 - st.leeg) { await slaap(60); st.gestoord++; st.log.push(cmd + '→(leeg)'); return ''; }
    if (st.rommel && x < st.rommel) { const t = ROMMEL[Math.floor(rnd() * ROMMEL.length)]; st.gestoord++; st.log.push(cmd + '→' + t); return t; }
    return r.tekst;
  };
  window._webBtWrite = function(){};
  connected = true; demoMode = false;
  return true;
})()`;

const ROUTE = (brandstof) => `(async function(){
  const tijd = function(pr, ms, n){ return Promise.race([pr, new Promise(function(_, rj){ setTimeout(function(){ rj(new Error('duurt langer dan ' + ms / 1000 + ' s: ' + n)); }, ms); })]); };
  const u = { fout: [], t: {} };
  const t0 = Date.now();
  try { await tijd(initELM327(), 30000, 'initELM327'); } catch (e) { u.fout.push(e.message); }
  _kentPoortKlaar = true;
  try { await tijd(scanNetworks(), 30000, 'scanNetworks'); } catch (e) { u.fout.push(e.message); }
  u.net = selectedNetwork && selectedNetwork.id;
  vehicleInfo.brandstof = normBrandstof(${JSON.stringify({ benzine: 'Benzine', diesel: 'Diesel', hybride: 'Benzine/Elektriciteit', elektrisch: 'Elektriciteit' }[brandstof])});
  try { await tijd(startDiscovery(), 120000, 'startDiscovery'); } catch (e) { u.fout.push(e.message); }
  u.t.discovery = Date.now() - t0;
  u.supported = [...supportedPIDs];
  if (window._storing.losNaDiscovery) window._storing.losNa = window._storing.n + window._storing.losNaDiscovery;
  u.vin = vehicleInfo.vin || '';
  isAdmin = function(){ return true; };
  try { await tijd(vlFullSurvey(), 240000, 'vlFullSurvey'); } catch (e) { u.fout.push(e.message); }
  u.t.totaal = Date.now() - t0;
  const s = vlLoad().sessies, sv = s.length ? s[s.length - 1].survey : null;
  if (sv) u.sv = { pids: sv.pids, dtc: sv.dtc, vin: sv.veh && sv.veh.vin, ft: sv.functietest, afgebroken: sv.afgebroken, sleutels: Object.keys(sv) };
  u.connected = connected; u.sessies = s.length;
  u.storlog = window._storing.log.slice(0, 40); u.hdr = { H: window._nepAuto.staat().H, cra: window._nepAuto.staat().cra, sh: window._nepAuto.staat().sh };
  u.verzoeken = window._storing.n; u.gestoord = window._storing.gestoord;
  return u;
})()`;

// De pollus: actieve PIDs zetten en laten lopen; dan een hapering van
// drie lege antwoorden (moet hij doorstaan), dan een adapter die stil blijft
// (moet hij merken: connected uit, niets meer boeken).
const POLL = (lijst) => `(async function(){
  const slaap = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  const lijst = ${JSON.stringify(lijst)};
  // De discovery zette de pollus al aan met zijn eigen keuze; eerst die
  // ronde laten uitlopen, anders boekt hij nog PIDs van vóór deze lijst.
  stopPoll(); await slaap(1500);
  activePIDs = new Set(lijst); pidHist = {}; pidVals = {};
  const tel = {}; const echt = updPID;
  const som = function(){ return Object.keys(tel).reduce(function(s, k){ return s + tel[k].length; }, 0); };
  updPID = function(pid, val){ (tel[pid] = tel[pid] || []).push(val); return echt.apply(this, arguments); };
  const u = { fout: [] };
  try {
    startPoll();
    // Tot elke PID een waarde heeft, hoogstens 20 s: een K-lijn op een
    // drukke CI-runner haalt er in 6 s soms maar drie.
    const t00 = Date.now();
    while (Date.now() - t00 < 20000 && !lijst.every(function(p){ return (tel[p] || []).length; })) await slaap(200);
    u.vulMs = Date.now() - t00;
    u.voor = JSON.parse(JSON.stringify(tel));
    u.actief = [...activePIDs];
    window._storing.stilN = 3;
    let n0 = som(); await slaap(4000);
    u.naHapering = som() - n0; u.connectedNaHapering = connected;
    window._storing.stil = true;
    const t0 = Date.now();
    while (connected && Date.now() - t0 < 20000) await slaap(100);
    u.merktStilMs = connected ? null : Date.now() - t0;
    n0 = som(); await slaap(1500);
    u.tijdensStil = som() - n0;
    u.pollTimer = pollTimer != null;
  } catch (e) { u.fout.push(String(e && e.message || e)); }
  finally { stopPoll(); updPID = echt; window._storing.stil = false; }
  u.tel = tel;
  return u;
})()`;

// De waarde die de nepauto voor een PID geeft, zoals de survey hem boekt:
// uit een schone run van dezelfde auto.
const verwachtCache = {};

async function draai(id, soort) {
  const p = PROFIELEN.find((x) => x.id === id);
  let app;
  try { app = await startApp({ root: __dirname }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    await app.venster(412, 915);
    await app.ev(NEP + ';' + PROF + ';true');
    await app.ev(ADAPTER(id, soort));
    const u = await app.ev(ROUTE(p.brandstof));
    return { u, app, fouten: app.fouten.slice() };
  } catch (e) { await app.stop(); throw e; }
}

async function auto(id) {
  const p = PROFIELEN.find((x) => x.id === id);
  const aanbod = new Set(PLNepAuto.maak(p).pids());
  const dtc = ((p.dtc && p.dtc['03']) || []).slice().sort();
  console.log('\n══ ' + p.naam + '  [proto ' + p.proto + ']');

  // Schoon: de referentie voor de waarden.
  let r = await draai(id, 'schoon');
  const ref = {};
  ((r.u.sv && r.u.sv.pids && r.u.sv.pids.detail) || []).forEach((x) => { if (x.st === 'ok') ref[x.pid] = x.val; });
  console.log('── schoon: ' + r.u.verzoeken + ' verzoeken, ' + Math.round(r.u.t.totaal / 1000) + ' s, ' + Object.keys(ref).length + ' waarden ok');
  toets('schoon: route zonder vastlopen', !r.u.fout.length, r.u.fout.join(' | '));
  await r.app.stop();

  for (const soort of ['ruis', 'rommel', 'los', 'eerste', 'bitmap', 'survey', 'dtc']) {
    r = await draai(id, soort);
    const u = r.u;
    console.log('── ' + soort + ': ' + u.verzoeken + ' verzoeken, ' + u.gestoord + ' gestoord, ' + Math.round(u.t.totaal / 1000) + ' s; ' + u.supported.length + ' PIDs, connected=' + u.connected + ', sessies=' + u.sessies + ', net=' + u.net);
    if (process.env.PL_STORING_LOG) console.log('  log: ' + u.storlog.join(' | ') + '\n  adapter: ' + JSON.stringify(u.hdr));
    toets(soort + ': route zonder vastlopen', !u.fout.length, u.fout.join(' | '));
    toets(soort + ': geen JS-fouten', r.fouten.length === 0, r.fouten.slice(0, 3).join(' | '));
    const spook = u.supported.filter((x) => /^01/.test(x) && !aanbod.has(x) && !/^01(00|20|40|60|80|A0|C0)$/.test(x));
    if (spook.length) bevinding('spookpid:' + soort, soort + ': geen PID ontdekt die de auto niet heeft', spook.join(','));
    else toets(soort + ': geen spook-PIDs', true);
    if (!/^(los|survey|dtc)$/.test(soort)) {
      if (u.net === 'A' + p.proto) toets(soort + ': protocol A' + p.proto + ' herkend', true);
      else bevinding('proto:' + soort, soort + ': protocol A' + p.proto + ' herkend', 'de app werkt met ' + u.net);
    }
    if (!/^(los|survey|dtc)$/.test(soort)) {
      const mist = [...aanbod].filter((x) => !u.supported.includes(x));
      if (mist.length) bevinding('mist:' + soort + ':' + id, soort + ': elke aangeboden PID ontdekt ondanks storing', mist.length + ' gemist: ' + mist.slice(0, 8).join(','));
      else toets(soort + ': elke aangeboden PID ontdekt', true);
    }
    if (u.vin && u.vin !== (p.vin || '')) bevinding('vin:' + soort, soort + ': geen verkeerde VIN', '"' + u.vin + '" ≠ ' + (p.vin || '(geen)'));
    else toets(soort + ': VIN goed of leeg', true);
    const sv = u.sv;
    if (sv && (/^(los|survey|dtc)$/.test(soort))) {
      // Een dode adapter is geen auto zonder codes en geen auto zonder sensoren.
      const okN = (sv.pids.detail || []).filter((x) => x.st === 'ok').length;
      console.log('  ' + soort + ': sessie bewaard met ' + okN + ' ok-waarden, transport ' + sv.pids.transport + ', cijfer ' + (sv.ft && sv.ft.cijfer) + ', dtc ' + JSON.stringify((sv.dtc && sv.dtc.actief) || null));
      const leeg = sv.dtc && Array.isArray(sv.dtc.actief) && !sv.dtc.actief.length && !sv.dtc.onleesbaar;
      if (dtc.length && leeg) bevinding('valsschoon', soort + ': een dode adapter geeft geen "geen foutcodes"', 'de auto heeft ' + dtc.join(',') + ', de sessie zegt actief: []');
      const stilN = (sv.pids.detail || []).filter((x) => x.st === 'nodata').length;
      if (sv.pids.transport === 0 && stilN > 5) bevinding('transportnul', soort + ': lege antwoorden van een dode adapter tellen als transportfout', stilN + ' PIDs als nodata geboekt, transport 0');
    }
    // Een dode adapter levert geen sessie en geen cijfer (#615): "deels
    // gemeten data is niet opgeslagen", zegt de survey dan zelf.
    if (/^(los|survey|dtc)$/.test(soort)) toets(soort + ': geen sessie bewaard na een dode adapter', !sv, sv && ('cijfer ' + (sv.ft && sv.ft.cijfer) + ', dtc ' + JSON.stringify(sv.dtc && sv.dtc.actief)));
    if (!sv) { if (!/^(los|survey|dtc)$/.test(soort)) toets(soort + ': de survey leverde een resultaat', false); continue; }
    const kreeg = ((sv.dtc && sv.dtc.actief) || []).slice().sort();
    const spookDtc = kreeg.filter((c) => !dtc.includes(c));
    if (spookDtc.length) bevinding('spookdtc:' + soort, soort + ': geen spookfoutcodes', spookDtc.join(','));
    else toets(soort + ': geen spookfoutcodes', true);
    const scheef = (sv.pids.detail || []).filter((x) => x.st === 'ok' && ref[x.pid] !== undefined && x.val !== ref[x.pid]);
    if (scheef.length) bevinding('scheef:' + soort, soort + ': wat de survey ok noemt is de waarde van de auto', scheef.map((x) => x.pid + '=' + x.val + '≠' + ref[x.pid]).join(', '));
    else toets(soort + ': ok-waarden gelijk aan de auto', true);
    const okZonderRef = (sv.pids.detail || []).filter((x) => x.st === 'ok' && ref[x.pid] === undefined);
    if (okZonderRef.length) bevinding('okzonder:' + soort, soort + ': geen ok-waarde voor een PID die schoon geen waarde had', okZonderRef.map((x) => x.pid + '=' + x.val).join(','));
    if (soort === 'ruis') {
      const lijst = Object.keys(ref).filter((x) => /^01/.test(x)).slice(0, 8);
      const q = await r.app.ev(POLL(lijst));
      toets('poll: geen fout in de proef', !q.fout.length, q.fout.join(' | '));
      const n = lijst.reduce((s, k) => s + (q.voor[k] || []).length, 0);
      console.log('  poll: ' + n + ' waarden in ' + (q.vulMs / 1000).toFixed(1) + ' s over ' + lijst.length + ' PIDs; na hapering ' + q.naHapering + '; stil gemerkt na ' + q.merktStilMs + ' ms; daarna ' + q.tijdensStil + ' geboekt');
      toets('poll: elke actieve PID kreeg waarden onder ruis', lijst.every((x) => (q.voor[x] || []).length > 0), lijst.filter((x) => !(q.voor[x] || []).length).join(','));
      const fout = [];
      Object.keys(q.tel).forEach((k) => q.tel[k].forEach((v) => { if (ref[k] !== undefined && Math.abs(v - ref[k]) > 1e-6) fout.push(k + '=' + v); }));
      if (fout.length) bevinding('pollwaarde', 'poll: elke waarde is die van de auto', [...new Set(fout)].slice(0, 6).join(', '));
      else toets('poll: elke waarde is die van de auto', true);
      toets('poll: doorstaat een hapering van drie lege antwoorden', q.connectedNaHapering && q.naHapering > 0, 'connected=' + q.connectedNaHapering + ', ' + q.naHapering + ' waarden');
      toets('poll: merkt een stille adapter binnen 15 s', q.merktStilMs != null && q.merktStilMs < 15000, q.merktStilMs);
      toets('poll: boekt niets meer zodra hij het gemerkt heeft', q.tijdensStil === 0, q.tijdensStil);
      toets('poll: geen JS-fouten', r.app.fouten.length === 0, r.app.fouten.slice(0, 3).join(' | '));
    }
    await r.app.stop();
  }
}

(async () => {
  const arg = process.argv.slice(2).filter((x) => !/^--/.test(x));
  const ids = arg.length ? arg : process.argv.includes('--alle') ? ALLE : KEUZE;
  for (const id of ids) await auto(id);
  if (!arg.length) Object.keys(BEKEND).filter((k) => !gezien.has(k)).forEach((k) => { console.log('  LET OP ' + k + ' kwam niet meer voor — ' + BEKEND[k] + ' opgelost? Haal hem uit BEKEND.'); letop++; });
  console.log('\n' + (fouten ? 'bproef-storing: ' + fouten + ' fout(en)' : 'bproef-storing: alles goed') + (letop ? ', ' + letop + ' bekend (LET OP)' : '') + ' — ' + ids.length + ' auto(\'s)');
  process.exit(fouten ? 1 : 0);
})();
