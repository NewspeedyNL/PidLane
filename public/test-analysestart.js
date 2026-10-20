// ══════════════════════════════════════════════════════════════════
// test-analysestart.js — het begin van een analyse (24-09-2026)
// ──────────────────────────────────────────────────────────────────
// Op de rit van 24-09, bij het eerste gebruik van de AI-monteur als klant:
//   1. "ik wil eigenlijk geen AI-analyse, maar een startscherm van de
//      benodigde meting — eerst aanbieden om data te verzamelen of de reeds
//      vastgestelde data te gebruiken";
//   2. "bij terug klikken gaat de AI-analyse toch lopen terwijl ik annuleer".
//
// Een stuk uit de échte pidlane-fuel.js, geknipt op zijn eigen kop:
//   B. callAI() — een geannuleerde analyse is geen storing en krijgt dus geen
//      noodrapport.
// (Deel A toetste plMeetPoortVraag(), het oude meetscherm. Dat is op
// 13-10-2026 weggehaald (#452); het verzamelscherm dat het verving toetsen
// test-verzamel.js en bproef-verzamel.js.)
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
const CALLAI = knip('async function callAI(prompt,contentEl,aanlevering){', '/* ══ MEETFASE-POORT');
const wacht = () => new Promise((r) => setImmediate(r));

(async function () {
  console.log('B. Een geannuleerde analyse is geen storing');
  function callAI(fetchFout) {
    const s = { console: { warn() {} }, regels: [], nood: 0, getoond: 0,
      dataStable: true, connected: true, demoMode: false, activePIDs: new Set(['010C']) };
    s.window = s;
    s.log = (m) => { s.regels.push(String(m)); };
    s.apiFetch = () => Promise.reject(fetchFout);
    s.renderAIText = () => { s.getoond++; };
    s.buildFallbackReport = () => { s.nood++; return 'nood'; };
    s.plVerifyAugment = () => {};
    vm.createContext(s);
    vm.runInContext(fs.readFileSync('pidlane-rapport.js', 'utf8'), s, { filename: 'pidlane-rapport.js' });
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

  console.log('\nC. De AI-monteur werkt een oorzaak pas uit na het verzamelscherm');
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
        // Sinds 07-10-2026 het verzamelscherm: `door` is hier "ja, laat de AI
        // dit onderzoeken"; nee is sluiten zonder AI.
        s.PLVerzamel = { meet: (o) => { s.gevraagd.push([o.niveau, o.watVoor, o.profiel]); return Promise.resolve({ door, ai: door, sam: { rijen: [] } }); },
                         promptBlok: () => '', aanlevering: () => ({}) };
        s.callAI = () => { s.verstuurd++; return Promise.resolve(); };
        vm.createContext(s); vm.runInContext(RUN, s); return s;
      };
      const nee = maak(false);
      await nee.runDiagAI('Bobine defect');
      toets('sluiten zonder AI op het verzamelscherm: er gaat niets naar de AI', nee.gevraagd.length === 1 && nee.verstuurd === 0,
        JSON.stringify(nee.gevraagd) + ' verstuurd=' + nee.verstuurd);
      toets('zonder profiel, zodat de sensoren van deze oorzaak aan blijven', nee.gevraagd[0] && nee.gevraagd[0][2] === false,
        JSON.stringify(nee.gevraagd));
      const ja = maak(true);
      await ja.runDiagAI('Bobine defect');
      toets('TEGENPROEF: na "laat de AI dit onderzoeken" gaat de uitwerking wel', ja.verstuurd === 1, 'verstuurd=' + ja.verstuurd);
    }
  }

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
  process.exit(fout ? 1 : 0);
})();
