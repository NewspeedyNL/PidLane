// ═════════════════════════════════════════════════════════════════
// bproef-kaart.js — snelle scan, volledige kaart en inleren, zonder rit (#648)
// ─────────────────────────────────────────────────────────────────
// De echte app tegen PLNepAuto (nepauto.js), langs de weg van een klant:
// initELM327() → scanNetworks() → startDiscovery(). Alleen _sendBTOnce()
// is vervangen. Vier vragen uit #648 die geen rit nodig hebben:
//   1. Inleren voor een vaste expert begint pas als de zoekronde én de
//      gezondheidscheck klaar zijn — ook als die trager zijn dan de
//      wachttijd — zet daarna pl_ingeleerd, en begint niet nog eens.
//   2. Per stap: hoeveel commando's, hoeveel NO DATA, en hoe lang de bus
//      erover doet volgens de antwoordtijden van de nepauto (bovengrens per
//      antwoord, geen meting op een echte bus).
//   3. Loopt de live data naar de expert door tijdens de kaart, en komt hij
//      terug als de kaart klaar is?
//   4. Zien de klant en de expert elke stap?
// Wat blijft voor een rit: wat een echte ECU onder die belasting doet.
//
// Tegenproef: zonder de wachtrij op de gezondheidscheck (inleerBusVrij
// altijd waar) start het inleren midden in de trage check — punt 1b wordt
// rood. Staat in plmutate.sh.
//
// Draaien vanuit public/:  node bproef-kaart.js
// ═════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const fs = require('fs');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const NEP = fs.readFileSync(path.join(__dirname, 'nepauto.js'), 'utf8') + ';' +
  fs.readFileSync(path.join(__dirname, 'nepauto-profielen.js'), 'utf8').replace("'use strict';", '').replace('const PL_NEPAUTO_PROFIELEN', 'window.PL_NEPAUTO_PROFIELEN') + ';true';
const AUTO = 'golf16';

// In de pagina: de nepauto, een logboek per commando met de fase waarin het
// viel, en de vaste expert op de server nagebouwd.
const OPZET = `(function(){
  const p = PL_NEPAUTO_PROFIELEN.find(function(x){ return x.id === ${JSON.stringify(AUTO)}; });
  const a = PLNepAuto.maak(p);
  window._log = []; window._fase = 'verbinden'; window._traag = 0;
  window._sendBTOnce = async function(cmd){
    const r = a.stuur(cmd);
    window._log.push({ c: String(cmd).toUpperCase(), ms: r.ms, nd: /NO DATA/.test(r.tekst), f: window._fase, t: Date.now() });
    await new Promise(function(z){ setTimeout(z, window._traag || Math.min(r.ms, 40)); });
    return r.tekst;
  };
  window._webBtWrite = function(){};
  connected = true; demoMode = false;
  const lo = document.getElementById('loginOv'); if (lo) lo.classList.add('hidden');
  // De klant heeft een vaste expert (#646): de server is hier nagebouwd.
  window.PLKlant = Object.assign(window.PLKlant || {}, { isKlant: function(){ return true; } });
  window._echtFetch = window.plFetch;
  window.plFetch = async function(pad, o){
    const b = (o && o.json) || {};
    const d = pad === '/klant/platform' && b.actie === 'experts' ? { ok: true, experts: [{ id: 'x', naam: 'Garage Jansen' }] }
      : pad === '/session/create' ? { ok: true, sessionId: 'abc123def456', joinToken: 'j', localToken: 'l', exp: Math.floor(Date.now() / 1000) + 3600 }
      : { ok: true };
    return { ok: true, status: 200, json: async function(){ return d; } };
  };
  localStorage.removeItem('pl_ingeleerd');
  PLRemote._vergeetExperts();
  // De fase van elk commando: de vier stappen van de kaart en de snelle scan.
  window._venster = {};
  const merk = function(naam, fn){ return async function(){
    const was = window._fase; window._fase = naam; (window._venster[naam] = window._venster[naam] || []).push({ van: Date.now() });
    try { return await fn.apply(this, arguments); }
    finally { window._venster[naam][window._venster[naam].length - 1].tot = Date.now(); window._fase = was; } }; };
  const ih = window.initialHealthScan; window.initialHealthScan = merk('gezondheid', ih);
  const dr = window.deepRefreshPIDs; window.deepRefreshPIDs = merk('kaart:diep zoeken', dr);
  PLUitgebreid.probe = merk('kaart:merkspecifiek', PLUitgebreid.probe);
  const m6 = PLM06.scan; PLM06.scan = merk('mode 06', m6.bind(PLM06));
  const fc = PLFoutcodes.scan; PLFoutcodes.scan = merk('foutcodes', fc);
  // Wat de bezig-pill te zien kreeg (punt 4): elke tekst, ook van een stap die maar even duurt.
  window._pill = []; const sbp = window.showBusyPill;
  window.showBusyPill = function(txt){ if (txt) window._pill.push(String(txt)); return sbp.apply(this, arguments); };
  return true;
})()`;

const WACHT = (cond, ms) => `(async function(){ const t0 = Date.now(); while (Date.now() - t0 < ${ms}) { if (${cond}) return true; await new Promise(function(z){ setTimeout(z, 200); }); } return false; })()`;

(async () => {
  let app;
  try { app = await startApp({ root: __dirname }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    await app.venster(412, 915);
    await app.ev(NEP);
    await app.ev(OPZET);

    console.log('\n1. Eerste verbinding met een vaste expert: inleren na de zoekronde');
    const r1 = await app.ev(`(async function(){
      const tijd = function(pr, ms, n){ return Promise.race([pr, new Promise(function(_, rj){ setTimeout(function(){ rj(new Error('duurt langer dan ' + ms / 1000 + ' s: ' + n)); }, ms); })]); };
      const u = { fout: [] };
      try { await tijd(initELM327(), 30000, 'initELM327'); } catch (e) { u.fout.push(e.message); }
      _kentPoortKlaar = true;
      try { await tijd(scanNetworks(), 30000, 'scanNetworks'); } catch (e) { u.fout.push(e.message); }
      vehicleInfo.brandstof = normBrandstof('Benzine');
      try { await tijd(startDiscovery(), 120000, 'startDiscovery'); } catch (e) { u.fout.push(e.message); }
      u.discoveryKlaar = Date.now(); u.merk = vehicleInfo.merk || '';
      window._fase = 'meetronde en overig';   // alles na de zoekronde dat geen stap hieronder is
      return u;
    })()`);
    toets('de route liep zonder vastlopen', !r1.fout.length, r1.fout.join(' | '));
    toets('het merk komt uit de VIN (nodig voor de inleersleutel)', !!r1.merk, r1.merk);
    const ingeleerd = await app.ev(WACHT(`Object.keys(JSON.parse(localStorage.getItem('pl_ingeleerd') || '{}')).length > 0`, 240000));
    const v1 = await app.ev(`({ v: window._venster, pill: window._pill.slice(), sl: JSON.parse(localStorage.getItem('pl_ingeleerd') || '{}') })`);
    toets('na de zoekronde is de auto ingeleerd (pl_ingeleerd gezet)', ingeleerd, JSON.stringify(v1.sl));
    const diep = (v1.v['kaart:diep zoeken'] || [])[0], gez = v1.v.gezondheid || [];
    toets('het inleren begon pas ná de zoekronde', diep && diep.van >= r1.discoveryKlaar, diep && (diep.van - r1.discoveryKlaar) + ' ms');
    toets('…en ná elke gezondheidscheck', diep && gez.every((g) => g.tot && g.tot <= diep.van), JSON.stringify(gez));
    toets('de sleutel per auto is zonder VIN', Object.keys(v1.sl).every((k) => !/[A-HJ-NPR-Z0-9]{17}/.test(k)), Object.keys(v1.sl).join());
    toets('punt 4: de bezig-pill noemt elke stap van het inleren', [1, 2, 3, 4].every((i) => v1.pill.some((t) => new RegExp('leren kennen voor Garage Jansen — ' + i + '/4').test(t))), v1.pill.join(' | '));

    console.log('  info zoekronde klaar, inleren klaar na ' + Math.round((Date.now() - r1.discoveryKlaar) / 1000) + ' s');
    console.log('\n1b. Tweede verbinding: niet opnieuw; trage gezondheidscheck: wachten');
    const r2 = await app.ev(`(async function(){
      // Een nieuwe zoekronde zou op een mens wachten (het profiel is bekend);
      // het inleren vraagt dezelfde vraag als na elke zoekronde.
      const n0 = (window._venster['kaart:diep zoeken'] || []).length;
      PLRemote._inlerenNaVerbinden(50);
      await new Promise(function(z){ setTimeout(z, 3000); });
      const u = { opnieuw: (window._venster['kaart:diep zoeken'] || []).length - n0 };
      // Nu een trage auto: elk commando 60 ms. De gezondheidscheck duurt
      // dan langer dan de wachttijd, en het inleren moet erop wachten.
      localStorage.removeItem('pl_ingeleerd');
      window._traag = 60;
      const h = initialHealthScan();
      PLRemote._inlerenNaVerbinden(100);
      await h; u.healthTot = Date.now(); window._traag = 0;
      return u;
    })()`);
    toets('een tweede verbinding met dezelfde auto leert niet opnieuw in', r2.opnieuw === 0, r2.opnieuw + '×');
    await app.ev(WACHT(`Object.keys(JSON.parse(localStorage.getItem('pl_ingeleerd') || '{}')).length > 0`, 240000));
    const d2 = await app.ev(`(window._venster['kaart:diep zoeken'] || []).slice(-1)[0]`);
    toets('tegen een trage gezondheidscheck: het inleren wacht tot hij klaar is', d2 && d2.van >= r2.healthTot, d2 ? (d2.van - r2.healthTot) + ' ms na de check' : 'geen kaart');
    const demo = await app.ev(`(async function(){
      localStorage.removeItem('pl_ingeleerd'); const n0 = (window._venster['kaart:diep zoeken'] || []).length;
      demoMode = true; PLRemote._inlerenNaVerbinden(50);
      await new Promise(function(z){ setTimeout(z, 3000); });
      demoMode = false;
      return (window._venster['kaart:diep zoeken'] || []).length - n0;
    })()`);
    toets('in demo wordt er niets ingeleerd', demo === 0, demo + '×');

    console.log('\n2. Delen: snelle scan bij de eerste expert, daarna de kaart op verzoek');
    const r3 = await app.ev(`(async function(){
      const wacht = function(ms){ return new Promise(function(z){ setTimeout(z, ms); }); };
      window.WebSocket = function(url){ window._ws = this; this.readyState = 1; this.verzonden = [];
        const z = this; setTimeout(function(){ z.onopen && z.onopen(); }, 10); };
      window.WebSocket.prototype.send = function(t){ const m = JSON.parse(t); m._t = Date.now(); this.verzonden.push(m); };
      window.WebSocket.prototype.close = function(){ this.readyState = 3; };
      window.APP_TOKEN = 'nep.token';
      PLRemote.openShare(); await PLRemote.shareStart(); await wacht(300);
      if (typeof pollTimer !== 'undefined' && !pollTimer && typeof startPoll === 'function') startPoll();
      const ws = window._ws, in_ = function(m){ ws.onmessage({ data: JSON.stringify(m) }); };
      in_({ type: 'presence', experts: 1 });
      // Het inleren las de foutcodes al: dan start de snelle scan niet vanzelf
      // (er is al een scan). De expert vraagt hem hier zelf.
      await wacht(1500);
      const auto = ws.verzonden.some(function(m){ return m.reqId === 'auto-snelscan'; });
      in_({ type: 'request-snelscan', reqId: 's1' });
      const t0 = Date.now();
      while (Date.now() - t0 < 120000 && !ws.verzonden.some(function(m){ return m.reqId === 's1'; })) await wacht(200);
      const sc = ws.verzonden.find(function(m){ return m.reqId === 's1'; });
      in_({ type: 'request-toestemming', niveau: 'volledig', reden: '', reqId: 't1' });
      await wacht(100); PLRemote.toestemmingAntwoord(true);
      const k0 = Date.now();
      in_({ type: 'request-kaart', reqId: 'k1' });
      while (Date.now() - k0 < 300000 && !ws.verzonden.some(function(m){ return m.reqId === 'k1' && m.data && m.data.kaart === 'klaar'; })) await wacht(250);
      const kEind = Date.now();
      await wacht(6000);
      const tel = ws.verzonden.filter(function(m){ return m.type === 'telemetry'; }).map(function(m){ return m._t; });
      const binnen = tel.filter(function(t){ return t >= k0 && t <= kEind; });
      let gat = 0, vorige = k0; binnen.concat([kEind]).forEach(function(t){ gat = Math.max(gat, t - vorige); vorige = t; });
      const kl = ws.verzonden.find(function(m){ return m.reqId === 'k1' && m.data && m.data.kaart === 'klaar'; });
      const r = { auto: auto, scan: sc && sc.data, telVoor: tel.filter(function(t){ return t < k0; }).length, gatMs: gat, kaartMs: kEind - k0,
        naKaart: tel.filter(function(t){ return t > kEind; }).length,
        stappen: ws.verzonden.filter(function(m){ return m.reqId === 'k1' && m.data && m.data.kaart === 'stap'; }).map(function(m){ return m.data.nr + '/' + m.data.van; }),
        klaar: kl && kl.data,
        klantLog: [].slice.call(document.querySelectorAll('#remKlantCard .rem-klant-l')).map(function(e){ return e.textContent; }) };
      await PLRemote.shareStop();
      return r;
    })()`);
    toets('na het inleren start de snelle scan niet nog eens vanzelf', r3.auto === false);
    toets('de snelle scan op verzoek van de expert', r3.scan && r3.scan.snelscan === 'klaar', JSON.stringify(r3.scan));
    toets('punt 4: de expert kreeg elke stap van de kaart', r3.stappen.join() === '1/4,2/4,3/4,4/4', r3.stappen.join());
    toets('punt 4: en de duur per stap in het eindantwoord', r3.klaar && Array.isArray(r3.klaar.stappen) && r3.klaar.stappen.length === 4 && r3.klaar.stappen.every((s) => typeof s.ms === 'number'), JSON.stringify(r3.klaar && r3.klaar.stappen));
    toets('punt 4: de klant ziet elke stap in het meekijkscherm', r3.klantLog.filter((t) => /kaart \d\/4/.test(t)).length >= 3 && r3.klantLog.some((t) => /volledige kaart klaar/.test(t)), r3.klantLog.join(' | '));
    toets('punt 3: er liep live data vóór de kaart', r3.telVoor > 0, r3.telVoor + ' frames');
    toets('punt 3: na de kaart komt de live data terug', r3.naKaart > 0, r3.naKaart + ' frames in 6 s');
    console.log('  info grootste gat in de live data tijdens de kaart: ' + Math.round(r3.gatMs / 100) / 10 + ' s van ' + Math.round(r3.kaartMs / 100) / 10 + ' s');

    console.log('\n3. Punt 2: commando\'s en busduur per stap (antwoordtijden van de nepauto)');
    const tel = await app.ev(`(function(){
      const per = {};
      window._log.forEach(function(x){ const p = per[x.f] = per[x.f] || { n: 0, nd: 0, ms: 0 }; p.n++; if (x.nd) p.nd++; p.ms += x.ms; });
      return per;
    })()`);
    const FASEN = ['foutcodes', 'mode 06', 'kaart:diep zoeken', 'kaart:merkspecifiek', 'gezondheid', 'verbinden', 'meetronde en overig'];
    FASEN.forEach((f) => { const p = tel[f]; if (p) console.log('  info ' + f.padEnd(22) + String(p.n).padStart(5) + ' commando\'s, ' + String(p.nd).padStart(4) + ' NO DATA, ≈ ' + (Math.round(p.ms / 100) / 10) + ' s bus'); });
    toets('elke stap van de kaart stuurde iets naar de auto', ['kaart:diep zoeken', 'mode 06', 'foutcodes'].every((f) => tel[f] && tel[f].n > 0), JSON.stringify(tel));

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }
  console.log(fouten === 0 ? '\nbproef-kaart: alles goed' : '\nbproef-kaart: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch((e) => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
