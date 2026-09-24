// ══════════════════════════════════════════════════════════════════
// test-analysestart.js — het begin van een analyse (24-09-2026)
// ──────────────────────────────────────────────────────────────────
// Op de rit van 24-09, bij het eerste gebruik van de AI-monteur als klant:
//   1. "ik wil eigenlijk geen AI-analyse, maar een startscherm van de
//      benodigde meting — eerst aanbieden om data te verzamelen of de reeds
//      vastgestelde data te gebruiken";
//   2. "bij terug klikken gaat de AI-analyse toch lopen terwijl ik annuleer".
//
// Twee stukken uit de échte pidlane-fuel.js, geknipt op hun eigen koppen:
//   A. plMeetPoortVraag() — het meetscherm: ook bij genoeg data een keuze,
//      altijd een Annuleren;
//   B. callAI() — een geannuleerde analyse is geen storing en krijgt dus geen
//      noodrapport.
// (Dat wegklikken van het vragenvenster als annuleren telt, toetst
// test-meetcontext.js; dat de balk boven de knoppenbalk blijft,
// bproef-schermranden.js.)
//
// Draaien vanuit public/:  node test-analysestart.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
const bron = fs.readFileSync('pidlane-fuel.js', 'utf8');
function knip(van, tot) {
  const a = bron.indexOf(van), b = bron.indexOf(tot, a + 1);
  if (a < 0 || b < 0) {
    console.log('  FOUT  anker niet gevonden in pidlane-fuel.js: "' + (a < 0 ? van : tot) + '" — deze test toetst niets meer');
    process.exit(1);
  }
  return bron.slice(a, b);
}
const POORT = knip('/* Toont het meetscherm en geeft een belofte terug', 'function watFor(w)');
const CALLAI = knip('async function callAI(prompt,contentEl,aanlevering){', '/* ══ MEETFASE-POORT');
const wacht = () => new Promise((r) => setImmediate(r));

function knopEl() { return { onclick: null, disabled: false, textContent: '' }; }

function poort(tekort, bevestigd) {
  const els = {};
  const s = {
    console: { warn() {} }, regels: [],
    Date, setInterval: () => 0, clearInterval() {},
    MEET_EIS: { normaal: { sec: 60, naam: 'stilstaande meting' }, kortrit: { sec: 90, naam: 'korte rit' } },
    plMeetNiveau: (x) => x || 'normaal',
    plMeetTekort: () => tekort,
    watFor: (w) => w || 'deze analyse',
    openRitAnalyse() {}
  };
  s.window = s;
  s._plMeetBevestigd = bevestigd || 0;
  s.log = (m) => { s.regels.push(String(m)); };
  s.document = {
    getElementById(id) {
      if (els[id]) return els[id];
      const ov = els.meetGateOv;
      if (ov && ov.innerHTML.indexOf('id="' + id + '"') >= 0) return (els[id] = knopEl());
      return null;
    },
    createElement() { return { style: {}, innerHTML: '', id: '', className: '' }; },
    body: { appendChild(e) { els[e.id] = e; } }
  };
  vm.createContext(s);
  vm.runInContext(POORT, s);
  return { s, els };
}
const GENOEG = { ok: true, tekort: [], st: { genoeg: 9, sensoren: 9, sec: 252, rijSec: 0 }, eis: { sec: 60, naam: 'stilstaande meting' }, rijTekort: false };
const TEWEINIG = { ok: false, tekort: ['gemeten over 5 s, nodig 60 s'], st: { genoeg: 2, sensoren: 9, sec: 5, rijSec: 0 }, eis: { sec: 60, naam: 'stilstaande meting' }, rijTekort: false };

(async function () {
  console.log('A. Het meetscherm vóór een analyse');
  {
    const { s, els } = poort(GENOEG);
    let r = null;
    s.plMeetPoortVraag('normaal', 'de uitwerking').then((x) => { r = x; });
    const h = (els.meetGateOv || {}).innerHTML || '';
    toets('bij genoeg data verschijnt het scherm tóch — met de keuze', /Gebruik de meting van zojuist/.test(h), h.slice(0, 160));
    toets('het zegt wat er al gemeten is', /9 van de 9/.test(h) && /4:12 min/.test(h), h.slice(0, 300));
    toets('en er is een Annuleren', /id="mgAnnuleer"/.test(h));
    s.document.getElementById('mgGebruik').onclick();
    await wacht();
    toets('"gebruik de meting" gaat door', r === true, String(r));
    toets('en onthoudt de bevestiging', s._plMeetBevestigd > 0);
  }
  {
    const { s, els } = poort(GENOEG, Date.now() - 30000);
    let r = null;
    s.plMeetPoortVraag('normaal').then((x) => { r = x; });
    await wacht();
    toets('binnen twee minuten na een bevestiging: niet nog eens vragen (wizard met meerdere modules)',
      r === true && !els.meetGateOv, String(r));
  }
  {
    const { s } = poort(GENOEG);
    let r = null;
    s.plMeetPoortVraag('normaal').then((x) => { r = x; });
    s.document.getElementById('mgAnnuleer').onclick();
    await wacht();
    toets('Annuleren bij genoeg data: niet door', r === false, String(r));
  }
  {
    const { s, els } = poort(TEWEINIG);
    let r = null;
    s.plMeetPoortVraag('normaal').then((x) => { r = x; });
    const h = (els.meetGateOv || {}).innerHTML || '';
    toets('bij te weinig data: het tekort en de meetknoppen', /nodig 60 s/.test(h) && /id="mgWacht"/.test(h), h.slice(0, 200));
    toets('en óók hier een Annuleren — tot 24-09 kon je alleen "toch doorgaan"', /id="mgAnnuleer"/.test(h));
    s.document.getElementById('mgAnnuleer').onclick();
    await wacht();
    toets('Annuleren bij te weinig data: niet door', r === false, String(r));
  }
  {
    const { s } = poort(TEWEINIG);
    let r = null;
    s.plMeetPoortVraag('normaal').then((x) => { r = x; });
    s.document.getElementById('mgToch').onclick();
    await wacht();
    toets('TEGENPROEF: "toch doorgaan" gaat wél door, met de beperking erbij', r === true && /nodig 60 s/.test(s._meetBeperkt || ''),
      String(r) + ' / ' + s._meetBeperkt);
  }

  console.log('\nB. Een geannuleerde analyse is geen storing');
  function callAI(fetchFout) {
    const s = { console: { warn() {} }, regels: [], nood: 0, getoond: 0,
      dataStable: true, connected: true, demoMode: false, activePIDs: new Set(['010C']) };
    s.log = (m) => { s.regels.push(String(m)); };
    s.apiFetch = () => Promise.reject(fetchFout);
    s.renderAIText = () => { s.getoond++; };
    s.buildFallbackReport = () => { s.nood++; return 'nood'; };
    s.plVerifyAugment = () => {};
    vm.createContext(s);
    vm.runInContext(CALLAI, s);
    return s;
  }
  {
    const af = new Error('Analyse geannuleerd'); af.plAfgebroken = true;
    const s = callAI(af);
    const uit = { innerHTML: '' };
    await s.callAI('p', uit, {});
    toets('geannuleerd: geen noodrapport', s.nood === 0 && s.getoond === 0, 'nood=' + s.nood + ' getoond=' + s.getoond);
    toets('en het scherm zegt dat er niets verstuurd is', /geannuleerd/i.test(uit.innerHTML) && /niets verstuurd/.test(uit.innerHTML), uit.innerHTML);
  }
  {
    const s = callAI(new Error('Proxy weigert (401)'));
    const uit = { innerHTML: '' };
    await s.callAI('p', uit, {});
    toets('TEGENPROEF: een echte storing krijgt het noodrapport nog wel', s.nood === 1, 'nood=' + s.nood);
  }

  console.log('\nC. De AI-monteur werkt een oorzaak pas uit na het meetscherm');
  {
    const diag = fs.readFileSync('pidlane-diagnose.js', 'utf8');
    const a0 = diag.indexOf('async function runDiagAI(causeName){');
    const b0 = diag.indexOf('\n}\n', a0);
    if (a0 < 0 || b0 < 0) { toets('runDiagAI() gevonden in pidlane-diagnose.js', false, 'anker weg'); }
    else {
      const RUN = diag.slice(a0, b0 + 3);
      const maak = (door) => {
        const s = { console: { warn() {} }, verstuurd: 0, gevraagd: [],
          document: { getElementById: () => ({ value: 'stottert', disabled: false, scrollIntoView() {} }), querySelectorAll: () => [] },
          getVehicle: () => ({ merk: 'Mazda', model: 'CX-5', year: 2018 }), activePIDs: new Set(), isReportableSensor: () => true,
          getPidDef: () => null, pidVals: {}, fv: String, _qualityBlokFor: () => '', formatDtcCodes: () => '', dtcCodes: [] };
        s.plVraagMeting = (niveau, wat, prof) => { s.gevraagd.push([niveau, wat, prof]); return Promise.resolve(door); };
        s.callAI = () => { s.verstuurd++; return Promise.resolve(); };
        vm.createContext(s); vm.runInContext(RUN, s); return s;
      };
      const nee = maak(false);
      await nee.runDiagAI('Bobine defect');
      toets('annuleren op het meetscherm: er gaat niets naar de AI', nee.gevraagd.length === 1 && nee.verstuurd === 0,
        JSON.stringify(nee.gevraagd) + ' verstuurd=' + nee.verstuurd);
      toets('zonder profiel, zodat de sensoren van deze oorzaak aan blijven', nee.gevraagd[0] && nee.gevraagd[0][2] === false,
        JSON.stringify(nee.gevraagd));
      const ja = maak(true);
      await ja.runDiagAI('Bobine defect');
      toets('TEGENPROEF: na "gebruik de meting" gaat de uitwerking wel', ja.verstuurd === 1, 'verstuurd=' + ja.verstuurd);
    }
  }

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
  process.exit(fout ? 1 : 0);
})();
