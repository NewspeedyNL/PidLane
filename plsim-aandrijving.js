// ══════════════════════════════════════════════════════════════════
// plsim-aandrijving.js — zeven aandrijfvormen door de DRAAIENDE app
// ──────────────────────────────────────────────────────────────────
// Geen toets maar een simulator: per aandrijfvorm een rit van ~6 minuten
// (stilstand, optrekken, stad, snelweg, uitrollen, stoplicht) als reeks
// meetwaarden, met een nagebootste klok door de échte keten:
//   updPID() → updateEVMode() → PLAandrijving → aandrijfbalk
//            → PLGear._tick() → Slim visueel (aandrijfLampjes)
// en na de rit: PLSamenhang (toestanden), PLOnderdeel (verdenkingen),
// PLKenmerk en de brandstofregel die de AI krijgt.
//
// De ritprofielen zijn NAGEBOUWD op wat de referentieauto's openbaar doen
// (zie VARIANTEN). Het zijn geen opnames: wat een echte ECU in elke modus
// teruggeeft blijft een vraag voor een rit.
//
// Draaien:  node plsim-aandrijving.js [--json]      (vanuit de repo-root)
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, 'plbrowser.js'));

// ── De rit als fasen. Per fase: duur (s), snelheid van→naar, en per moment
//    het toerental en de pedaalstand als functie van (snelheid, fase).
//    ICE-toerental bij een vaste overbrenging: kmh / r * 1000, r = km/h per
//    1000 tpm voor de gekozen versnelling.
const GEARS = [7.5, 13.5, 20, 27, 33, 40];        // handbak/DCT, km/h per 1000 tpm
function gearRpm(kmh) {
  if (kmh < 2) return 800;
  // schakelen rond 2200 tpm
  for (let i = 0; i < GEARS.length; i++) {
    const rpm = kmh / GEARS[i] * 1000;
    if (rpm < 2300 || i === GEARS.length - 1) return Math.max(1100, rpm);
  }
}
const FASEN = [
  // naam,          s,  v0,  v1, pedaal
  ['stil_koud',     20,   0,   0,  0],
  ['optrekken',     12,   0,  50, 45],
  ['stad',         600,  50,  50, 18],   // 10 min: de thermostaatregel kijkt pas na 600 s looptijd
  ['uitrollen',     10,  50,  20,  0],
  ['stad2',         40,  20,  45, 15],
  ['oprit',         15,  45, 110, 85],
  ['snelweg',       90, 110, 110, 30],
  ['afrit',         20, 110,  40,  0],
  ['stoplicht',     30,   0,   0,  0],
  ['wegrijden',     10,   0,  40, 35],
  ['woonwijk',      40,  40,  30, 10],
];

/* Per variant: welk toerental hoort bij (fase, snelheid, pedaal, i)? null =
   de ECU antwoordt niet op 010C (een BEV). 0 = motor uit. */
const VARIANTEN = [
  { id: 'ice', naam: 'Benzine (referentie)', ref: 'Mazda CX-5 2.0 SkyActiv-G 2018',
    brandstof: 'benzine', verwacht: 'altijd motor; versnellingen leren',
    rpm: (f, v) => (f === 'stoplicht' ? 0 : gearRpm(v)),           // start/stop bij het stoplicht
    soc: () => null },
  { id: 'mhev', naam: 'Mild hybride 48V (P0, motor drijft altijd aan)', ref: 'Skoda Octavia 1.5 e-TEC 2021 (DSG)',
    brandstof: 'benzine', verwacht: 'motor drijft aan; uitrollen met motor uit = zeilen, geen EV-rijden',
    rpm: (f, v) => (f === 'stoplicht' || f === 'uitrollen' || f === 'afrit' ? 0 : gearRpm(v)),
    soc: () => null },
  { id: 'hev_ps', naam: 'Volhybride power-split (e-CVT)', ref: 'Toyota Corolla 1.8 Hybrid 2020',
    brandstof: 'hybride', verwacht: 'EV tot ~50 km/h licht gas, motor los van snelheid (e-CVT), geen versnellingen',
    rpm: (f, v, p) => {
      if (f === 'stil_koud') return 1200;                                // opwarmen katalysator
      if (f === 'stoplicht' || f === 'uitrollen' || f === 'afrit' || f === 'woonwijk') return 0;
      if (f === 'stad' || f === 'stad2') return 0;                       // EV bij licht gas
      if (f === 'snelweg') return 2050;                                  // vast werkpunt
      return 1000 + p * 40;                                              // e-CVT: toeren volgt vermogen
    },
    soc: (f, i) => ({ stad: -0.02, stad2: -0.02, woonwijk: -0.02, uitrollen: 0.05, afrit: 0.05, snelweg: 0.005, oprit: -0.03 }[f] || 0) },
  { id: 'hev_par', naam: 'Volhybride parallel (motor + e-motor, DCT)', ref: 'Kia Niro 1.6 GDi HEV 2019 (6DCT)',
    brandstof: 'hybride', verwacht: 'EV-wegrijden, motor met versnellingen, e-boost op de oprit',
    rpm: (f, v) => {
      if (f === 'stoplicht' || f === 'stil_koud' || f === 'uitrollen' || f === 'afrit') return 0;
      if (f === 'optrekken' && v < 25) return 0;
      if (f === 'wegrijden' || f === 'woonwijk') return 0;
      return gearRpm(v);
    },
    soc: (f) => ({ oprit: -0.05, uitrollen: 0.05, afrit: 0.05, woonwijk: -0.02, wegrijden: -0.03 }[f] || 0) },
  { id: 'serie', naam: 'Serieel / range extender ("andersom": e-motor drijft, motor laadt)', ref: 'Nissan Qashqai e-Power 2022 (BMW i3 REx idem)',
    brandstof: 'hybride', verwacht: 'wielen altijd elektrisch; motor draait als generator, ook stilstaand, los van snelheid',
    rpm: (f) => {
      if (f === 'stil_koud') return 1500;                                // laadt de accu stilstaand
      if (f === 'stoplicht') return 1800;                                // laadt bij het stoplicht
      if (f === 'stad' || f === 'woonwijk' || f === 'uitrollen') return 0;
      if (f === 'snelweg' || f === 'oprit') return 2600;
      return 1900;
    },
    soc: (f) => ({ stil_koud: 0.04, stoplicht: 0.05, stad: -0.03, woonwijk: -0.03, uitrollen: 0.04, afrit: 0.04, snelweg: 0.005 }[f] || 0) },
  { id: 'phev', naam: 'Plug-in hybride (eerst leeg rijden, dan hybride)', ref: 'Kia Niro PHEV 2020 / VW Golf GTE',
    brandstof: 'hybride', verwacht: 'lang EV, ook op de snelweg; koude motorstart op 110 km/h',
    rpm: (f, v) => {
      if (['stil_koud', 'optrekken', 'stad', 'uitrollen', 'stad2', 'oprit', 'stoplicht', 'wegrijden', 'woonwijk'].includes(f)) return 0;
      if (f === 'snelweg') return gearRpm(v);                            // accu op buffer → motor bij
      return 0;
    },
    soc: (f) => ({ snelweg: 0.0, afrit: 0.05 }[f] === undefined ? -0.04 : { snelweg: 0.0, afrit: 0.05 }[f]) },
  { id: 'bev', naam: 'Volledig elektrisch (referentie)', ref: 'Volkswagen ID.3 2021',
    brandstof: 'elektrisch', verwacht: 'geen 010C; balk mag niet blijven hangen op "Onbekend"',
    rpm: () => null, soc: () => null },
];

function bouwRit(vr) {
  const stappen = [];
  let t = 0, soc = 55, ect = vr.id === 'bev' ? null : 18;
  const startSoc = soc;
  for (const [f, dur, v0, v1, ped] of FASEN) {
    const n = dur * 2;
    for (let i = 0; i < n; i++) {
      const v = v0 + (v1 - v0) * (i / Math.max(1, n - 1));
      let rpm = vr.rpm(f, v, ped, i);
      if (rpm !== null && rpm > 0) rpm = Math.round(rpm + Math.sin(t) * 15);
      soc = Math.max(20, Math.min(80, soc + (vr.soc(f, i) || 0)));
      if (ect !== null) ect = rpm > 0 ? Math.min(90, ect + 0.12) : Math.max(15, ect - 0.01);
      const s = { t, f, '010D': Math.round(v), '0149': ped + 15 };
      if (rpm !== null) { s['010C'] = rpm; s['0104'] = rpm > 0 ? Math.min(95, 20 + ped) : 0;
        s['015E'] = rpm > 0 ? +(0.6 + ped * 0.05).toFixed(1) : 0; s['011F'] = rpm > 0 || t > 30 ? Math.round(t) : 0; }
      if (ect !== null) s['0105'] = Math.round(ect);
      s['0142'] = rpm > 0 || vr.id !== 'ice' ? 14.2 : 12.6;
      if (vr.soc(f, i) !== null && vr.id !== 'ice' && vr.id !== 'mhev' && vr.id !== 'bev') s['015B'] = +soc.toFixed(1);
      if (vr.id === 'bev') s['015B'] = +(soc -= 0.01).toFixed(1);
      stappen.push(s);
      t += 0.5;
    }
  }
  return stappen;
}

// Wat er in de pagina per stap gebeurt. Alles via de echte functies.
const PAGINA = `async function(variant, stappen){
  const T0 = 1.8e12; let klok = T0;
  const echteNow = Date.now; Date.now = () => klok;
  try {
    if (window.PLGear && PLGear._timer) { clearInterval(PLGear._timer); PLGear._timer = null; }
    PLAandrijving.reset();
    var echtSucces = window.PLSched && PLSched.laatsteSucces;
    if (window.PLSched) PLSched.laatsteSucces = (pid) => (pidVals[pid] === undefined ? 0 : klok);
    if (window.PLKenmerk && PLKenmerk.vergeet) PLKenmerk.vergeet();
    const vol = {}; let aandeel = null;
    for (const k of Object.keys(pidVals)) delete pidVals[k];
    for (const k of Object.keys(pidHist)) delete pidHist[k];
    vehicleInfo.brandstof = variant.brandstof; vehicleInfo.merk = variant.ref.split(' ')[0];
    vehicleInfo.model = variant.ref.split(' ')[1];
    connected = true; demoMode = false;
    if (window.PLGear) { PLGear.model = null; PLGear.sleutel = null; PLGear._vinGezien = '__sim_' + variant.id;
      PLGear._wissel('sim_' + variant.id); PLGear.model = null; PLGear._laad('sim_' + variant.id);
      vehicleInfo.vin = ''; PLGear._vinGezien = ''; try { localStorage.removeItem && Object.keys(localStorage).filter(k => /sim_/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) { console.warn(e); } PLGear._laad('sim_' + variant.id); }
    const perFase = {}; const ritAandeel = { evMs: 0, rijMs: 0 };
    let res = null;
    for (const s of stappen) {
      klok = T0 + s.t * 1000;
      for (const p of Object.keys(s)) if (/^[0-9A-F]{4}$/.test(p)) updPID(p, s[p]);
      try { updateEVMode(); } catch (e) { perFase.__fout = 'updateEVMode: ' + e.message; }
      res = PLAandrijving.laatste();
      for (const p of Object.keys(s)) if (/^[0-9A-F]{4}$/.test(p)) (vol[p] = vol[p] || []).push({ t: klok, v: s[p] });
      if (res) aandeel = PLVisueel.aandeelBij(aandeel, res.toestand, klok);
      if (window.PLGear) PLGear._tick();
      const f = perFase[s.f] || (perFase[s.f] = { balk: {}, gear: {}, lamp: {}, evModus: 0, n: 0 });
      f.n++;
      const el = document.getElementById('aandrijfBalk');
      const bt = el ? el.textContent.trim() : '(geen balk)';
      f.balk[bt] = (f.balk[bt] || 0) + 1;
      const g = window.PLGear ? String(PLGear.toon) : '-';
      f.gear[g] = (f.gear[g] || 0) + 1;
      if (typeof _evModeActive !== 'undefined' && _evModeActive) f.evModus++;
      try {
        const L = PLVisueel.aandrijfLampjes
          ? PLVisueel.aandrijfLampjes(res, detectEngineType(), { belasting: pidVals['0104'], accu: pidVals['015B'], volt: pidVals['0142'] })
          : null;
        const k = L ? (L.motor ? L.motor.kop + ':' + L.motor.waarde : '') + ' | ' + (L.accu ? L.accu.kop : '') : '(geen lampjes-API)';
        f.lamp[k] = (f.lamp[k] || 0) + 1;
      } catch (e) { f.lamp['FOUT ' + e.message] = 1; }
    }
    const eind = PLAandrijving.laatste();
    let samen = null;
    try {
      const tl = PLSamenhang.tijdlijn(vol);
      if (tl) { const g = (window.PLOnderzoek && PLOnderzoek.cfg && PLOnderzoek.cfg.grens) || { uitRpm: 300, aanRpm: 600, warmC: 70, rijKmh: 5 };
        samen = {}; for (let i = 0; i < tl.t.length; i++) { const x = PLSamenhang.toestandOp(tl, i, g); samen[x] = (samen[x] || 0) + 1; } }
    } catch (e) { samen = { FOUT: e.message }; }
    let onderdeel = null;
    try { onderdeel = PLOnderdeel.beoordeel().filter(r => r.score > 0 || (r.voor && r.voor.length))
            .map(r => r.naam + ' (' + (r.voor || []).join('; ') + ')'); } catch (e) { onderdeel = ['FOUT ' + e.message]; }
    let rapport = null, samBlok = null;
    try {
      const sec = stappen.length / 2, rijSec = stappen.filter(x => x['010D'] > 2).length / 2;
      window._plVerzameld = { sam: PLVerzamel.vanBron({ hist: vol }), sec, rijSec, beperkt: '', bron: null, ts: klok,
        hist: vol, watVoor: 'de simulatierit', klacht: '', eisNaam: 'rijden' };
      const m = PLRapport.model(PLRapport.uitApp({ ts: klok }));
      const st = []; const opv = [];
      m.secties.forEach(sc => sc.blokken.forEach(b => {
        if (b.soort === 'stoplicht') (b.items || []).forEach(i => st.push((i.naam || i.titel) + ':' + (i.kleur || i.staat)));
        if (b.titel === 'Wat opviel' && b.rijen) b.rijen.forEach(r => opv.push(r.cellen.join(' / ')));
        if (b.titel === 'Wat opviel' && b.tekst) opv.push(b.tekst);
      }));
      rapport = { hoofdstukken: m.secties.length, stoplicht: st, opviel: opv };
      samBlok = PLSamenhang.promptBlok(PLSamenhang.leesApp(vol));
    } catch (e) { rapport = { FOUT: e.message }; }
    let kenmerk = null;
    try { kenmerk = window.PLKenmerk ? PLKenmerk.blok() : null; } catch (e) { kenmerk = 'FOUT ' + e.message; }
    let basis = null; try { basis = pidlaneBasisRegels().split('\\n')[0]; } catch (e) { basis = 'FOUT ' + e.message; }
    let meetctx = null; try { meetctx = plMeetcontextPromptLine(); } catch (e) { meetctx = 'FOUT ' + e.message; }
    let gearModel = null; try { gearModel = PLGear.model && PLGear.model.gears ? PLGear.model.gears.map(r => +r.toFixed(1)) : null; } catch (e) { gearModel = 'FOUT'; }
    return JSON.stringify({ perFase, eind: eind && { toestand: eind.toestand, bewijstHybride: eind.bewijstHybride, startStopGezien: eind.startStopGezien },
      motortype: detectEngineType(), rapport, samBlok, evAandeel: PLVisueel.aandeelUit(aandeel), samen, onderdeel, kenmerk, basis, meetctx, gearModel });
  } finally { Date.now = echteNow; connected = false; if (window.PLSched && typeof echtSucces === 'function') PLSched.laatsteSucces = echtSucces; }
}`;

(async () => {
  let app;
  try { app = await startApp({ root: path.join(__dirname, 'public') }); }
  catch (e) { if (e.message === 'GEEN_CHROMIUM') { console.log('LET OP overgeslagen: geen Chromium'); process.exit(0); } throw e; }
  const uit = {};
  try {
    for (const vr of VARIANTEN) {
      const st = bouwRit(vr);
      const r = await app.ev(`(${PAGINA})(${JSON.stringify({ id: vr.id, brandstof: vr.brandstof, ref: vr.ref })}, ${JSON.stringify(st)})`);
      uit[vr.id] = Object.assign({ naam: vr.naam, ref: vr.ref, verwacht: vr.verwacht }, JSON.parse(r));
    }
    if (app.fouten.length) uit.__jsfouten = app.fouten.slice(0, 10);
  } finally { if (app && app.stop) await app.stop(); }
  if (process.argv.includes('--json')) { console.log(JSON.stringify(uit, null, 1)); return; }
  for (const [id, r] of Object.entries(uit)) {
    if (id === '__jsfouten') { console.log('JS-FOUTEN:', r); continue; }
    console.log('\n══ ' + r.naam + ' — ' + r.ref);
    console.log('   verwacht: ' + r.verwacht + '   | motortype=' + r.motortype + ' | EV-aandeel=' + r.evAandeel + '%' + ' | eind=' + JSON.stringify(r.eind));
    for (const [f, x] of Object.entries(r.perFase)) {
      const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + '×' + n).join(', ');
      console.log('   ' + f.padEnd(10) + ' balk: ' + top(x.balk) + ' | gear: ' + top(x.gear) + ' | lamp: ' + top(x.lamp) + (x.evModus ? ' | EV-pauze ' + x.evModus : ''));
    }
    console.log('   versnellingen geleerd: ' + JSON.stringify(r.gearModel));
    console.log('   samenhang: ' + JSON.stringify(r.samen));
    console.log('   onderdeel: ' + JSON.stringify(r.onderdeel));
    console.log('   rapport: ' + JSON.stringify(r.rapport));
    console.log('   AI samenhang: ' + JSON.stringify(r.samBlok).slice(0, 600));
    console.log('   AI brandstofregel: ' + r.basis);
    console.log('   AI kenmerk: ' + JSON.stringify(r.kenmerk).slice(0, 300));
    console.log('   AI meetcontext: ' + JSON.stringify(r.meetctx).slice(0, 300));
  }
})();
