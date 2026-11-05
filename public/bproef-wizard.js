// ═══════════════════════════════════════════════════════════════════
// bproef-wizard.js — na de wizard: de juiste bron, de juiste keuze, en het blijft staan
// ───────────────────────────────────────────────────────────────────
// WAAROM (05-11-2026). bproef-dekking.js meet hoeveel er oproepbaar is,
// maar roept PLEigen.zoekObdb() en PLPidZoek.zoek() zelf aan. Of de KNOP
// Grondig in de wizard dezelfde keten doorloopt — met het juiste model en
// bouwjaar naar de Worker, de keuze die hij voorstelt, het bewaren bij het
// voertuig, en dat de pollus de opgenomen codes daarna echt vraagt — zag
// geen proef. Dat is de koppeling tussen PLInrichten, PLGarage, PLEigen en
// de pollus, en dus een browservraag.
//
// PER AUTO, met de echte app en PLNepAuto achter _sendBTOnce():
//   1. verbinden (initELM327 → scanNetworks → startDiscovery = "Snel")
//   2. PLInrichten._grondig() — de knop — en wachten op de uitslag
//   3. PLGarage._pzOpnemen() — "Opnemen" — en wachten op het bewaren
//   4. de pollus even laten lopen
// GETOETST:
//   • bron: obdb_bestand met de repo van dit model, obdb_steun met dat
//     bouwjaar; geen AI-actie (geen tegoed);
//   • Snel: geen PID in supportedPIDs die de auto niet aanbiedt (#616), en
//     elke aangeboden mode-01-PID ontdekt;
//   • keuze: hoogstens PLEigen.VEEL voorgesteld, alleen wat de auto aanbiedt,
//     en op waarde: geen code van waarde 0 vóór een waardevollere die paste;
//   • borging: de server kreeg eigen_pids en pid_selectie, PLEigen kent ze,
//     ze staan in activePIDs, en hun pollinterval is het eigen tempo;
//   • pollus: binnen de meettijd vraagt hij de opgenomen codes op de bus, en
//     er komt een waarde terug.
//
// Draaien vanuit public/:  node bproef-wizard.js            (de keuze)
//                          node bproef-wizard.js golf19     (één auto)
// TEGENPROEF: plmutate.sh laat _pzStart de steunlijst niet meegeven, en
// laat _sensBewaar de selectie niet toepassen — beide rood.
// ═══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const fs = require('fs');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));
const VLOOT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'nepvloot', 'profielen.json'), 'utf8')).auto;
const OBDB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'nepvloot', 'obdb.json'), 'utf8'));
const STEUN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'nepvloot', 'steun.json'), 'utf8'));
const NEP = fs.readFileSync(path.join(__dirname, 'nepauto.js'), 'utf8');

// 11-bit Mazda (de auto van de eigenaar) en VAG met tx>rx.
const KEUZE = ['cx5_18', 'golf19'];

// Wat deze proef vindt en als issue openstaat: LET OP in plaats van FOUT.
const BEKEND = {
  laad: '#675 — de wizard vinkt gevraagde laadspanning en acculeeftijd niet aan',
};

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// De server: alleen /klant/platform, de rest is de echte plFetch.
const SERVER = (p) => `(function(){
  const p = ${JSON.stringify({ id: p.id, merk: p.merk, model: p.model, jaar: p.jaar, brandstof: p.brandstof, repo: p.repo })};
  const S = window._nepPlatform = { log: [], voertuig: { id: 'v1', status: 'actief', naam: 'Proefauto', merk: p.merk, model: p.model, bouwjaar: p.jaar, brandstof: p.brandstof } };
  const echt = window.plFetch;
  window.plFetch = async function(pad, o){
    if (String(pad).indexOf('/klant/platform') < 0) return echt(pad, o);
    const b = (o && o.json) || {};
    S.log.push(b.actie + (b.repo ? ':' + b.repo : '') + (b.jaar ? ':' + b.jaar : ''));
    let d = { ok: true };
    if (b.actie === 'stand') d = { ok: true, akkoord: true, akkoordVersie: '2026-09-27', maxActief: 3, kentekenBewaarbaar: true, voertuigen: [Object.assign({ aantal: { rapporten: 0, ritten: 0, openIssues: 0 } }, S.voertuig)] };
    else if (b.actie === 'voertuig_opslaan') { Object.assign(S.voertuig, b.voertuig); d.voertuig = S.voertuig; }
    else if (b.actie === 'pidbib_lijst') d.lijst = [];
    else if (b.actie === 'pidbib_kandidaten') d.erbij = 0;
    else if (b.actie === 'obdb_bestand') { const raak = String(b.repo).toLowerCase() === p.repo.toLowerCase(); d.gevonden = raak; if (raak) d.data = { commands: window._PL_OBDB }; }
    else if (b.actie === 'obdb_steun') {
      d.gevonden = false;
      if (String(b.repo).toLowerCase() === p.repo.toLowerCase()) for (const j of [b.jaar, b.jaar - 1, b.jaar + 1, b.jaar - 2, b.jaar + 2]) if (window._PL_STEUN[j]) { d = { ok: true, gevonden: true, jaar: j, tekst: window._PL_STEUN[j] }; break; }
    }
    else if (/^(ai|claude|vraag)/.test(String(b.actie))) S.ai = (S.ai || 0) + 1;
    return { ok: true, status: 200, json: async () => d };
  };
  return true;
})()`;

const ROUTE = (p) => `(async function(){
  const p = window._PL_PROFIEL;
  const a = window._PL_AUTO = PLNepAuto.maak(p);
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
  u.snel = [...supportedPIDs];
  return u;
})()`;

(async () => {
  const arg = process.argv.slice(2).filter((a) => !/^--/.test(a));
  const ids = arg.length ? arg : KEUZE;
  for (const id of ids) {
    const p = VLOOT.find((x) => x.id === id);
    if (!p) { toets('profiel ' + id + ' bestaat', false); continue; }
    let app;
    try { app = await startApp({ root: path.join(__dirname) }); }
    catch (e) {
      if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
      throw e;
    }
    const wacht = async (expr, ms) => {
      for (let i = 0; i < (ms || 8000) / 200; i++) { if (await app.ev(expr)) return true; await new Promise((r) => setTimeout(r, 200)); }
      return false;
    };
    try {
      console.log('\n── ' + p.naam + '  [' + p.bron + ']');
      toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
      await app.ev(NEP + ';window._PL_PROFIEL=' + JSON.stringify(p) + ';window._PL_OBDB=' + JSON.stringify(OBDB[p.repo] || []) + ';window._PL_STEUN=' + JSON.stringify(STEUN[p.repo] || {}) + ';true');
      await app.ev(SERVER(p));
      // De stap "Leer de auto" koppelt het voertuig aan de VIN (pseudoniem); zonder dat is het een onbekende auto.
      await app.ev(`(async function(){ window._nepPlatform.voertuig.vin_pseudo = await _vlVinPseudoniem(${JSON.stringify(p.vin)}); return true; })()`);
      await app.ev(`window.currentUser = { user:'anna@voorbeeld.nl', role:'klant', label:'Anna' }; 'ok'`);
      toets('Mijn voertuigen kent de proefauto', await wacht(`!!(window.PLGarage && PLGarage.actief() && PLGarage.actief().id === 'v1')`, 10000));

      // 1. Snel
      const u = await app.ev(ROUTE(p));
      toets('verbinden en Snel liepen zonder vastlopen', u && !u.fout.length, u && u.fout.join(' | '));
      const BITMAP = /^01(00|20|40|60|80|A0|C0|E0)$/;
      const m01 = p.aangeboden.mode01.filter((x) => !BITMAP.test(x));
      const snel = (u && u.snel || []).filter((x) => /^01[0-9A-F]{2}$/.test(x) && !BITMAP.test(x));
      toets('Snel: elke aangeboden mode-01-PID ontdekt', m01.every((x) => snel.indexOf(x) >= 0), m01.filter((x) => snel.indexOf(x) < 0).join(','));
      toets('Snel: geen spook-PIDs (#616)', snel.every((x) => m01.indexOf(x) >= 0), snel.filter((x) => m01.indexOf(x) < 0).join(','));

      // 2. de knop Grondig
      await app.ev(`PLInrichten._grondig(); 'ok'`);
      const klaar = await wacht(`(function(){ const s = PLGarage.staat().sens; return !!(s && s.pz && (s.pz.res || s.pz.fout || (s.pz.tekst && !s.pz.bezig))); })()`, 300000);
      toets('Grondig liep tot een uitslag', klaar);
      const pz = await app.ev(`(function(){ const s = PLGarage.staat().sens; const pz = s && s.pz || {};
        return { fout: pz.fout || '', tekst: pz.tekst || '', past: (pz.res && pz.res.past || []).map(function(x){ return { code: x.c.code, ecu: x.c.ecu || '', naam: x.c.naam, laad: PLEigen.laadRol(x.c.naam) || '' }; }),
          kies: Object.keys(pz.kies || {}), veel: PLEigen.VEEL }; })()`);
      const log = await app.ev(`window._nepPlatform.log`);
      toets('bron: obdb_bestand met de repo van dit model', log.some((l) => l.toLowerCase() === ('obdb_bestand:' + p.repo).toLowerCase()), log.filter((l) => /^obdb/.test(l)).join(' '));
      toets('bron: obdb_steun met dit bouwjaar', log.some((l) => l.toLowerCase() === ('obdb_steun:' + p.repo + ':' + p.jaar).toLowerCase()), log.filter((l) => /^obdb/.test(l)).join(' '));
      toets('bron: geen AI-vraag (geen tegoed)', !(await app.ev(`window._nepPlatform.ai || 0`)));
      toets('Grondig vond codes die passen', pz.past.length > 0, pz.fout || pz.tekst);

      // 3. de keuze
      const sl = (c, e) => String(c).toUpperCase() + '@' + String(e || '').toUpperCase().split('>')[0];
      const aanbod = new Set(p.aangeboden.did.map((d) => sl(d.code, d.ecu)));
      const sleutelVan = (k) => { const [c, e] = String(k).split('@'); return sl(c, e); };
      toets('keuze: hoogstens ' + pz.veel + ' vooraf aangevinkt', pz.kies.length > 0 && pz.kies.length <= pz.veel, pz.kies.length + ' aangevinkt');
      toets('keuze: alleen codes die de auto aanbiedt', pz.kies.every((k) => aanbod.has(sleutelVan(k))), pz.kies.filter((k) => !aanbod.has(sleutelVan(k))).join(','));
      // De laadregeling (laadCodes) leest alleen opgenomen eigen PIDs: wat zij nodig heeft, hoort erbij.
      const gekozen = new Set(pz.kies.map(sleutelVan));
      const laad = pz.past.filter((x) => x.laad);
      const laadMist = laad.filter((x) => !gekozen.has(sl(x.code, x.ecu)));
      const tekstLaad = laadMist.map((x) => x.code + ' ' + x.naam + ' (' + x.laad + ')').join(', ');
      if (laadMist.length && BEKEND['laad']) { console.log('  LET OP keuze: de laadregeling krijgt niet wat ze nodig heeft — bekend: ' + BEKEND['laad'] + ' (' + tekstLaad + ')'); }
      else toets('keuze: wat de laadregeling nodig heeft is aangevinkt', !laadMist.length, tekstLaad);

      // 4. opnemen en borgen
      await app.ev(`PLGarage._pzOpnemen(); 'ok'`);
      toets('opnemen bewaart eigen_pids bij het voertuig', await wacht(`(window._nepPlatform.voertuig.eigen_pids || []).length > 0`, 15000));
      const borg = await app.ev(`(function(){ const v = window._nepPlatform.voertuig, e = v.eigen_pids || [];
        return { n: e.length, sel: (v.pid_selectie || []).slice(), codes: e.map(function(x){ return x.code; }),
          defs: PLEigen.defs().map(function(d){ return d.pid; }), actief: [...activePIDs],
          interval: e.map(function(x){ return [x.code, pidPollInterval(x.code), PLEigen.interval(x.code)]; }) }; })()`);
      toets('evenveel bewaard als aangevinkt', borg.n === pz.kies.length, borg.n + ' bewaard, ' + pz.kies.length + ' aangevinkt');
      toets('pid_selectie bevat elke opgenomen code', borg.codes.every((c) => borg.sel.indexOf(c) >= 0), borg.codes.filter((c) => borg.sel.indexOf(c) < 0).join(','));
      toets('PLEigen kent ze (pasSelectieToe na bewaren)', borg.codes.every((c) => borg.defs.indexOf(c) >= 0), borg.codes.filter((c) => borg.defs.indexOf(c) < 0).join(','));
      toets('ze staan aan (activePIDs)', borg.codes.every((c) => borg.actief.indexOf(c) >= 0), borg.codes.filter((c) => borg.actief.indexOf(c) < 0).join(','));
      toets('pollinterval = het eigen tempo (normaal 2 s)', borg.interval.every((r) => r[1] === r[2] && r[1] === 2000), JSON.stringify(borg.interval.filter((r) => r[1] !== r[2] || r[1] !== 2000)));

      // 5. de pollus
      const pol = await app.ev(`(async function(){
        const voor = window._PL_AUTO.log.length;
        try { startPoll(); } catch (e) { return { fout: e.message }; }
        await new Promise(function(z){ setTimeout(z, 12000); });
        try { if (typeof stopPoll === 'function') stopPoll(); } catch (e) { console.warn(e); }
        const na = window._PL_AUTO.log.slice(voor);
        const codes = ${JSON.stringify([])}.concat((window._nepPlatform.voertuig.eigen_pids || []).map(function(x){ return x.code; }));
        const gevraagd = codes.filter(function(c){ return na.some(function(l){ return l.indexOf(c) === 0; }); });
        const waarde = codes.filter(function(c){ return typeof pidVals !== 'undefined' && pidVals[c] !== undefined && pidVals[c] !== null; });
        // De kern naast de eigen codes: toerental en snelheid, hun interval en hoe vaak ze op de bus kwamen (ook in een batch 010C0D…).
        const kern = ['010C', '010D'].filter(function(k){ return activePIDs.has(k); }).map(function(k){
          return { pid: k, ms: pidPollInterval(k), n: na.filter(function(l){ return /^01/.test(l) && (l.slice(2).match(/../g) || []).indexOf(k.slice(2)) >= 0; }).length }; });
        return { n: na.length, gevraagd: gevraagd, waarde: waarde, codes: codes, kern: kern };
      })()`);
      toets('de pollus liep', pol && !pol.fout && pol.n > 0, pol && (pol.fout || pol.n + ' commando\'s'));
      toets('de pollus vroeg opgenomen codes op de bus', pol && pol.gevraagd.length > 0, pol && ('0 van ' + pol.codes.length));
      toets('en er kwam een waarde terug (pidVals)', pol && pol.waarde.length > 0, pol && ('gevraagd: ' + pol.gevraagd.join(',')));
      // Verdringing: de kern moet minstens een derde halen van wat zijn interval belooft.
      // Gemeten 05-11-2026: CX-5 (9 eigen) 29× bij 316 ms, Golf (20 eigen, tx>rx) 13× bij 439 ms — de helft.
      const kern = (pol && pol.kern) || [];
      toets('de kern (toerental, snelheid) staat aan na de wizard', kern.length === 2, JSON.stringify(kern));
      kern.forEach((k) => toets('kern ' + k.pid + ': ' + k.n + '× in 12 s bij een interval van ' + k.ms + ' ms (minstens een derde)', k.n >= Math.floor(12000 / Math.max(k.ms, 250) / 3), JSON.stringify(k)));
      console.log('  pollus 12 s: ' + (pol ? pol.n : 0) + ' commando\'s, ' + (pol ? pol.gevraagd.length : 0) + ' van ' + (pol ? pol.codes.length : 0) + ' eigen codes gevraagd, ' + (pol ? pol.waarde.length : 0) + ' met een waarde');
      toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    } catch (e) {
      toets('proef liep zonder uitzondering', false, e.message);
    } finally { await app.stop(); }
  }
  console.log('\nbproef-wizard: ' + (fouten ? fouten + ' fout(en)' : 'alles goed') + ' — ' + ids.length + ' auto(\'s)');
  process.exit(fouten ? 1 : 0);
})();
