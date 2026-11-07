// ══════════════════════════════════════════════════════════════════
// bproef-demoaandrijving.js — elke demo-auto rijdt als zijn aandrijving
// ──────────────────────────────────────────────────────────────────
// test-demoaandrijving.js toetst demoAandrijving() los. Hier de KOPPELING in
// de draaiende app (07-11-2026): krijgt de demo-auto zijn vorm (DEMO_CARS →
// vehicleInfo.aandrijving), loopt demo() door de aandrijflaag, en zegt de
// aandrijfbalk dan wat er gebeurt?
//   • e-Power (serieel): rijdt ook op de accu, en zegt "motor laadt"
//   • Puma (mild): zeilt, en rijdt nooit "op de accu"
//   • Yaris (hybride zonder vorm): rijdt op de accu
//   • Hyperlane op een hybride: de grote ring is CA18
// TEGENPROEF: de CX-5 rijdt alleen op de motor, met het toerental op de ring.
//
// Draaien:  node bproef-demoaandrijving.js      (vanuit public/)
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

(async () => {
  let app;
  try { app = await startApp({ root: path.join(__dirname) }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    const rijd = async (naam) => JSON.parse(await app.ev(`(async function(){
      const i = DEMO_CARS.findIndex(c => (c.merk + ' ' + c.model).indexOf(${JSON.stringify(naam)}) >= 0);
      try { if (demoMode) plDemoStop(); } catch (e) { console.warn(e); }
      demoMode = false; connected = false; startDemoCar(i);
      // Een nagebootste klok (10 minuten, elke 1,5 s) door de echte keten:
      // demo() met zijn aandrijflaag → pidVals → PLAandrijving.tik() → balk.
      // In echte tijd duren de ritmes van de demo langer dan een proef wil wachten.
      const echt = Date.now, T0 = echt(); let klok = T0;
      const toest = {}, balk = [];
      try {
        Date.now = () => klok;
        PLAandrijving.reset();
        for (let k = 0; k < 400; k++) {
          klok = T0 + k * 1500;
          pidVals['010C'] = demo('010C'); pidVals['010D'] = demo('010D');
          const s = PLAandrijving.tik(pidVals, { t: klok, ouderdomMs: 0 });
          PLAandrijfbalk.ververs(s);
          toest[s.toestand] = (toest[s.toestand] || 0) + 1;
          balk.push((document.getElementById('aandrijfBalk') || {}).textContent || '');
        }
      } finally { Date.now = echt; }
      const ind = PLVisProfiel.indeling('hyperlane', p => supportedPIDs.has(p) || /^CA/.test(p), detectEngineType(), {});
      return JSON.stringify({ vorm: (vehicleInfo.aandrijving || {}).vorm || null, toest, balk: balk.join('|'), ring: ind && ind.plekken.toeren });
    })()`));

    const ep = await rijd('Qashqai e-Power');
    toets('e-Power krijgt zijn vorm (serieel)', ep.vorm === 'serieel', ep.vorm);
    toets('e-Power rijdt ook op de accu', (ep.toest.ACCU_RIJDT || 0) > 0, JSON.stringify(ep.toest));
    toets('e-Power: de balk zegt "motor laadt" als de motor draait', /motor laadt/.test(ep.balk), ep.balk.slice(0, 200));
    toets('Hyperlane op een hybride: de ring is de vermogensvraag', ep.ring === 'CA18', ep.ring);

    const pu = await rijd('Puma');
    toets('Puma krijgt zijn vorm (mild)', pu.vorm === 'mild', pu.vorm);
    toets('Puma zeilt', (pu.toest.ZEILEN || 0) > 0, JSON.stringify(pu.toest));
    toets('Puma rijdt nooit "op de accu"', !pu.toest.ACCU_RIJDT, JSON.stringify(pu.toest));

    const ya = await rijd('Yaris');
    toets('Yaris (hybride zonder vorm) rijdt op de accu', (ya.toest.ACCU_RIJDT || 0) > 0, JSON.stringify(ya.toest));

    const cx = await rijd('CX-5');
    toets('TEGENPROEF CX-5: alleen op de motor', Object.keys(cx.toest).every(k => /^DRAAIT_|^START$/.test(k)), JSON.stringify(cx.toest));
    toets('TEGENPROEF CX-5: toerental op de ring', cx.ring === '010C', cx.ring);

    toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally { if (app && app.stop) await app.stop(); }
  console.log('\n' + (fouten ? 'FOUT: ' : 'goed: ') + fouten + ' fout\n');
  process.exit(fouten ? 1 : 0);
})();
