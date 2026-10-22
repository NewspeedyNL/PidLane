// ═══════════════════════════════════════════════════════════════════
// bproef-adres.js — een ander antwoordadres, in de echte app (22-10-2026)
// ───────────────────────────────────────────────────────────────────
// WAAROM. Gemeten tegen het NL-wagenpark (RDW) en de signalsets van OBDb:
// VAG (70E>778, 710>77A, 713>77D), PSA en Opel (6A2>682) en Nissan
// (740>760) antwoorden niet op zendadres + 8. De app bood die codes niet
// aan, en daarmee kreeg ruim een derde van de NL-auto's met een OBDb-model
// geen enkele code. Nu staat zo'n adres als "tx>rx", en zet PLEigen er
// ATCRA en flow control bij.
//
// WAT ER GEMETEN WORDT, met de echte PLEigen.test() tegen PLNepAuto:
//   1. VAG accu 222A0C @ 710>77A (één frame): 75 %
//   2. VAG km-stand 221821 @ 713>77D (twee frames): 123456 km — dat kan
//      alleen met flow control naar 713
//   3. PSA km-stand 22D49C @ 6A2>682: 123456 km
//   4. daarna staat de adapter terug: ATFCSM0, ATCRA, ATSH7DF, en 010C werkt
//   5. TEGENPROEF: dezelfde code op het oude adres (713 zonder rx) geeft
//      geen waarde — zonder ATCRA komt 77D niet door
//   6. een kloon die ATFCSH niet kent: één frame lukt nog, en hij meldt het
//
// Draaien vanuit public/:  node bproef-adres.js
// TEGENPROEF in plmutate.sh: zonder ATFCSH breekt punt 2 af.
// ═══════════════════════════════════════════════════════════════════
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
const AUTO = (id, extra) => `(function(){
  const p = Object.assign({}, PL_NEPAUTO_PROFIELEN.find(function(x){ return x.id === '${id}'; }), ${JSON.stringify(extra || {})});
  const a = PLNepAuto.maak(p); window._na = a;
  ['ATE0','ATH0','ATSP0','0100'].forEach(function(c){ a.stuur(c); });
  window._sendBTOnce = async function(cmd){ return a.stuur(cmd).tekst; };
  connected = true; demoMode = false; window._webBtWrite = function(){};
  return true;
})()`;
const TEST = (code, ecu, formule) => `(async function(){
  const n = window._na.log.length;
  const r = await PLEigen.test({ code: '${code}', ecu: '${ecu}', naam: 'Proef', formule: '${formule}' });
  return { ok: r.ok, waarde: r.waarde, fout: r.fout || '', raw: r.raw || '', log: window._na.log.slice(n) };
})()`;

(async () => {
  let app;
  try {
    app = await startApp({ root: __dirname });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    await app.ev(NEP);

    console.log('\n1. VAG accu, één frame (710>77A)');
    await app.ev(AUTO('golf16'));
    const accu = await app.ev(TEST('222A0C', '710>77A', 'A'));
    toets('laadtoestand 75 %', accu.ok && accu.waarde === 75, JSON.stringify(accu));
    toets('ATSH710 en ATCRA77A gingen vóór de vraag', /ATSH710,ATCRA77A/.test(accu.log.join()), accu.log.join(' '));

    console.log('\n2. VAG km-stand, twee frames (713>77D)');
    const km = await app.ev(TEST('221821', '713>77D', 'B*16777216+C*65536+D*256+E'));
    toets('123456 km — de flow control ging naar 713', km.ok && km.waarde === 123456, JSON.stringify(km));
    toets('ATFCSH713, ATFCSD300000, ATFCSM1', /ATFCSH713,ATFCSD300000,ATFCSM1/.test(km.log.join()), km.log.join(' '));

    console.log('\n3. PSA km-stand (6A2>682)');
    await app.ev(AUTO('p208'));
    const psa = await app.ev(TEST('22D49C', '6A2>682', 'A*65536+B*256+C'));
    toets('123456 km', psa.ok && psa.waarde === 123456, JSON.stringify(psa));

    console.log('\n4. Daarna staat de adapter terug');
    toets('ATFCSM0, ATCRA, ATSH7DF achteraan', psa.log.slice(-3).join() === 'ATFCSM0,ATCRA,ATSH7DF', psa.log.slice(-4).join(' '));
    const st = await app.ev(`window._na.staat()`);
    toets('geen filter, geen header meer', !st.cra && !st.sh, JSON.stringify(st));
    const rpm = await app.ev(`(async function(){ return await sendCmd('010C1', 1500); })()`);
    toets('010C antwoordt weer gewoon', /41 ?0C/.test(rpm), rpm);

    console.log('\n5. TEGENPROEF — het oude adres zonder antwoordadres');
    await app.ev(AUTO('golf16'));
    const oud = await app.ev(TEST('221821', '713', 'B*16777216+C*65536+D*256+E'));
    toets('713 zonder rx: geen waarde', !oud.ok || oud.waarde === null, JSON.stringify(oud));

    console.log('\n6. Een kloon die ATFCSH niet kent');
    await app.ev(AUTO('golf16', { kloonZonderFc: true }));
    const kloon = await app.ev(TEST('222A0C', '710>77A', 'A'));
    toets('één frame lukt nog: 75 %', kloon.ok && kloon.waarde === 75, JSON.stringify(kloon));
    const meld = await app.ev(`_btLog.map(function(x){ return x.msg; }).join(' | ')`);
    toets('en de app meldt dat lange antwoorden kunnen afbreken', /kent ATFCSH710 niet/.test(meld), meld.slice(-300));

    toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log('\n' + (fouten ? 'bproef-adres: ' + fouten + ' fout(en)' : 'bproef-adres: alles goed'));
  process.exit(fouten ? 1 : 0);
})();
