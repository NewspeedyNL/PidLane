// ═══════════════════════════════════════════════════════════════════
// bproef-merken.js — de uitgebreide test op andere merken, zonder rit (#541)
// ───────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// De uitgebreide test is op één Mazda CX-5 nagemeten. #541 vraagt vier à
// vijf merken die ver van de CX-5 afstaan, en die zijn er niet. Wat er wél
// is, staat in nepauto-profielen.js: per model en bouwjaar de PIDs die een
// échte auto aanbood (OBDb), met het protocol dat erbij hoort, en één
// volledige opname van een Toyota Auris hybride.
//
// Deze proef laat de ECHTE app tegen elk van die auto's lopen, langs
// precies de weg van een klant: initELM327() → scanNetworks() →
// startDiscovery() → vlFullSurvey(). Alleen _sendBTOnce() is vervangen,
// door PLNepAuto (nepauto.js, getoetst in test-nepauto.js).
//
// WAT ER PER AUTO GETOETST WORDT
//   1. het protocol dat de app herkent is dat van de auto
//   2. elke PID die de auto aanbiedt staat na de discovery in supportedPIDs
//   3. de VIN komt goed binnen; het merk volgt uit de VIN
//   4. geen transportfouten, geen ongeldige antwoorden
//   5. de foutcodes zijn precies die van de auto (geen spookcodes)
//   6. het aantal ECU's klopt, het cijfer is ≥ 8, brandstof en derde poort
//      (diesel/hybride) kloppen
//   7. IUPR en mode 06 waar de opname ze heeft
// Onderaan: de tabelregel voor #541 per auto.
//
// BEKEND. Wat deze proef vindt en als issue openstaat, staat in BEKEND met
// het nummer erbij: dat is LET OP en geen FOUT, zodat de proef op main groen
// kan staan zonder iets te verzwijgen. Verdwijnt een bekende bevinding, dan
// zegt hij dat ook (haal hem dan uit de lijst). Alles wat er niet in staat
// is FOUT.
//
// WAT DEZE PROEF NIET IS. Geen rit. De waarden bij de OBDb-auto's zijn
// stationair aangenomen, een volle bus bestaat hier niet, en UDS en mode 06
// antwoorden alleen waar de opname ze heeft. Dat blijft voor CAMPAGNE.
//
// Draaien vanuit public/:  node bproef-merken.js          (zes auto's)
//                          node bproef-merken.js --alle   (alle zestien)
//                          node bproef-merken.js golf16   (één auto)
// TEGENPROEF: plmutate.sh telt in realScanDTC() de telbyte mee als code;
// de Peugeot (P0420) en de Auris worden dan rood.
// ═══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const fs = require('fs');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));
const PROFIELEN = require('./nepauto-profielen.js');
const NEP = fs.readFileSync(path.join(__dirname, 'nepauto.js'), 'utf8');
const PLNepAuto = require('./nepauto.js');

// Zes die samen elk protocol, elke brandstof en de echte opname dekken.
const KEUZE = ['cx5', 'p208', 'auris', 'fiat500', 'merc00', 'mercdiesel'];
const BEKEND = {
};

let fouten = 0, letop = 0;
const gezien = new Set();
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
// Een bevinding met een sleutel: bekend → LET OP, anders FOUT.
function bevinding(sleutel, naam, uitleg) {
  gezien.add(sleutel);
  if (BEKEND[sleutel]) { console.log('  LET OP ' + naam + ' — bekend: ' + BEKEND[sleutel] + (uitleg ? ' (' + uitleg + ')' : '')); letop++; }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// De klantroute in de pagina. Geeft terug wat de proef nodig heeft.
const ROUTE = (id) => `(async function(){
  const p = PL_NEPAUTO_PROFIELEN.find(function(x){ return x.id === ${JSON.stringify(id)}; });
  const a = PLNepAuto.maak(p);
  window._sendBTOnce = async function(cmd){ const r = a.stuur(cmd); await new Promise(function(z){ setTimeout(z, Math.min(r.ms, 40)); }); return r.tekst; };
  window._webBtWrite = function(){};        // startDiscovery() zoekt een open verbinding
  connected = true; demoMode = false;
  const tijd = function(pr, ms, n){ return Promise.race([pr, new Promise(function(_, rj){ setTimeout(function(){ rj(new Error('duurt langer dan ' + ms / 1000 + ' s: ' + n)); }, ms); })]); };
  const u = { fout: [] };
  try { await tijd(initELM327(), 30000, 'initELM327'); } catch (e) { u.fout.push(e.message); }
  _kentPoortKlaar = true;                   // het kenteken is hier niet het onderwerp…
  try { await tijd(scanNetworks(), 30000, 'scanNetworks'); } catch (e) { u.fout.push(e.message); }
  u.net = selectedNetwork && selectedNetwork.id;
  // …maar de brandstof wel: die zet de kentekenpoort uit de RDW, en zonder
  // vraagt brandstofPoort() erom en wacht de discovery op een mens.
  vehicleInfo.brandstof = normBrandstof({ benzine: 'Benzine', diesel: 'Diesel', hybride: 'Benzine/Elektriciteit', elektrisch: 'Elektriciteit' }[p.brandstof]);
  try { await tijd(startDiscovery(), 120000, 'startDiscovery'); } catch (e) { u.fout.push(e.message); }
  u.supported = [...supportedPIDs];
  u.verwacht = a.pids();
  u.vin = vehicleInfo.vin || ''; u.merk = vehicleInfo.merk || '';
  isAdmin = function(){ return true; };
  try { await tijd(vlFullSurvey(), 240000, 'vlFullSurvey'); } catch (e) { u.fout.push(e.message); }
  const s = vlLoad().sessies, sv = s.length ? s[s.length - 1].survey : null;
  if (sv && sv.veh && sv.veh.vin === u.vin) u.sv = { pids: sv.pids, dtc: sv.dtc, ecus: sv.ecus, ft: sv.functietest, v2: sv.v2 };
  return u;
})()`;

async function rij(id) {
  const p = PROFIELEN.find((x) => x.id === id);
  console.log('\n── ' + p.naam + '  [' + p.bron + ']');
  let app;
  try {
    app = await startApp({ root: __dirname });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    await app.venster(412, 915);
    await app.ev(NEP + ';' + fs.readFileSync(path.join(__dirname, 'nepauto-profielen.js'), 'utf8')
      .replace("'use strict';", '').replace('const PL_NEPAUTO_PROFIELEN', 'window.PL_NEPAUTO_PROFIELEN') + ';true');
    const u = await app.ev(ROUTE(id));
    toets('de route liep zonder vastlopen', !u.fout.length, u.fout.join(' | '));
    toets('protocol herkend: A' + p.proto, u.net === 'A' + p.proto, u.net);

    const sup = new Set(u.supported);
    // Een PID die alleen een tweede ECU heeft (bak, hybride-ECU) is #586.
    const eerste = new Set(PLNepAuto.maak(p).ecuPids()[0]);
    const mist = u.verwacht.filter((x) => !sup.has(x));
    mist.forEach((x) => bevinding(eerste.has(x) ? 'pid:' + id + ':' + x : 'tweede-ecu', x + ' wordt aangeboden maar niet ontdekt', eerste.has(x) ? 'de motor-ECU heeft hem' : 'alleen een tweede ECU heeft hem'));
    toets('elke PID van de motor-ECU ontdekt (' + eerste.size + ')', !mist.some((x) => eerste.has(x)), mist.join(','));
    if (p.vin) {
      toets('VIN gelezen', u.vin === p.vin, u.vin);
      if (u.merk !== p.merk) bevinding('merk:' + id, 'merk uit de VIN: ' + p.merk, 'de app zegt "' + u.merk + '" bij ' + p.vin.slice(0, 3));
      else toets('merk uit de VIN: ' + p.merk, true);
    } else toets('geen VIN via OBD, en de app verzint er geen', !u.vin, u.vin);

    const sv = u.sv;
    if (!sv) { toets('de survey leverde een resultaat', false, 'geen survey-sessie met deze VIN'); return; }
    toets('geen transportfouten', sv.pids.transport === 0, sv.pids.transport);
    sv.pids.detail.filter((x) => x.st !== 'ok').forEach((x) =>
      bevinding((x.val === 0 ? 'nul:' : 'ongeldig:') + x.pid, x.pid + ' ' + x.naam + ': ' + x.st, 'waarde ' + x.val + ', ' + (x.q || '')));

    const dtc = (p.dtc && p.dtc['03']) || [];
    const kreeg = (sv.dtc.actief || []).slice().sort().join(',');
    if (kreeg !== dtc.slice().sort().join(',')) bevinding('dtc:' + id, 'foutcodes van de auto: ' + (dtc.join(',') || 'geen'), 'de app las ' + (kreeg || 'geen'));
    else toets('foutcodes precies die van de auto: ' + (dtc.join(',') || 'geen'), true);
    if (/^[6-9]$/.test(p.proto)) toets('ECU\'s op de bus: ' + p.ecus.length, sv.ecus.n === p.ecus.length, JSON.stringify(sv.ecus));

    toets('cijfer van de uitgebreide test ≥ 8', sv.ft && sv.ft.cijfer >= 8, sv.ft && (sv.ft.cijfer + ' ' + (sv.ft.plafond || []).join(', ')));
    const bs = p.brandstof === 'diesel' ? 'diesel' : p.brandstof === 'elektrisch' ? 'elektrisch' : 'benzine';
    toets('brandstof in het oordeel: ' + bs, sv.ft && sv.ft.brandstof === bs, sv.ft && sv.ft.brandstof);
    const km = (sv.v2 && sv.v2.kenmerk) || {};
    toets('derde poort: diesel ' + (bs === 'diesel' ? 'ja' : 'nee'), /^(ja|nee)/.test(km.diesel || '') && /^ja/.test(km.diesel) === (bs === 'diesel'), km.diesel);
    toets('derde poort: hybride ' + (p.brandstof === 'hybride' ? 'ja' : 'nee'), /^(ja|nee)/.test(km.hybride || '') && /^ja/.test(km.hybride) === (p.brandstof === 'hybride'), km.hybride);

    if (p.brandstof === 'hybride') {
      const cvt = p.merk === 'Toyota' ? 'ja' : p.merk === 'Kia' ? 'nee' : null;
      if (cvt) toets('derde poort: cvt ' + cvt + ' bij een ' + p.merk + '-hybride (#589)', new RegExp('^' + cvt).test(km.cvt || ''), km.cvt);
    }
    // IUPR en mode 06 uit de opname: het verwachte getal staat in de bytes.
    const op = p.ecus[0].opname || {};
    if (op['0908']) {
      const b = op['0908'].match(/../g).map((x) => parseInt(x, 16));
      const ritten = b[3] * 256 + b[4], contact = b[5] * 256 + b[6];
      const i = sv.v2 && sv.v2.mode09 && sv.v2.mode09.iupr;
      if (!i || i.ritten !== ritten || i.contact !== contact) bevinding('iupr:' + id, 'IUPR: ' + ritten + ' ritten, ' + contact + ' keer contact', 'de app las ' + (i ? i.ritten + ' / ' + i.contact : 'niets'));
      else toets('IUPR: ' + ritten + ' ritten, ' + contact + ' keer contact', true);
    }
    if (op['0600']) toets('mode 06 uit de opname gelezen', sv.v2 && sv.v2.mode06 && sv.v2.mode06.aantalTests > 0, JSON.stringify(sv.v2 && sv.v2.mode06));
    console.log('  tabel  ' + ((sv.v2 && sv.v2.tabelRegel) || '—'));
    toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
}

(async () => {
  const arg = process.argv.slice(2).filter((x) => !/^--/.test(x));
  const ids = arg.length ? arg : process.argv.includes('--alle') ? PROFIELEN.map((p) => p.id) : KEUZE;
  for (const id of ids) await rij(id);
  // Een bekende bevinding die bij een volle run niet meer opdook: opgelost?
  if (ids.length === PROFIELEN.length) {
    Object.keys(BEKEND).filter((k) => !gezien.has(k)).forEach((k) => { console.log('  LET OP ' + k + ' kwam niet meer voor — ' + BEKEND[k] + ' opgelost? Haal hem uit BEKEND.'); letop++; });
  }
  console.log('\n' + (fouten ? 'bproef-merken: ' + fouten + ' fout(en)' : 'bproef-merken: alles goed') + (letop ? ', ' + letop + ' bekend (LET OP)' : '') + ' — ' + ids.length + ' auto(\'s)');
  process.exit(fouten ? 1 : 0);
})();
