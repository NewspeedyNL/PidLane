// ══════════════════════════════════════════════════════════════════
// bproef-verzamel.js — het verzamelscherm in de echte app (07-10-2026)
// ──────────────────────────────────────────────────────────────────
// test-verzamel.js toetst het oordeel, de fase en wat er in de prompt komt.
// Hier gaat het om de koppeling: "Er is iets mis" → het plan → AI-monteur
// opent het verzamelscherm en níét het oude meetscherm, de rijen komen
// binnen, een uitschieter onderweg staat bij "Valt op", en pas na "Laat de
// AI dit onderzoeken" gaat er een prompt weg — met de samenvatting erin.
// In demo-modus; de AI-aanroep wordt afgevangen, er gaat niets de deur uit.
//
// Met PL_SCHERM=<map> komen er schermafdrukken bij (geen toets).
//
// Draaien vanuit public/:  node bproef-verzamel.js
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
  try {
    app = await startApp({ root: path.join(__dirname) });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  const map = process.env.PL_SCHERM;
  let nr = 0;
  const foto = async (naam) => { if (map) await app.schermafdruk(path.join(map, String(++nr).padStart(2, '0') + '-' + naam + '.png')); };
  const wacht = async (expr, ms) => {
    for (let i = 0; i < (ms || 8000) / 100; i++) { if (await app.ev(expr)) return true; await new Promise(r => setTimeout(r, 100)); }
    return false;
  };
  const zichtbaar = (id) => `(function(){ var e=document.getElementById('${id}'); return !!e && getComputedStyle(e).display !== 'none'; })()`;

  try {
    console.log('\n── 1. de route: tegel → plan → AI-monteur ──');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLVerzamel staat er', await app.ev(`typeof PLVerzamel === 'object' && typeof PLVerzamel.meet === 'function'`));
    await app.ev(`startDemoCar(0); true`);
    // De AI-aanroep afvangen: de prompt bewaren, een kort rapport teruggeven.
    await app.ev(`window.__prompts = []; window.apiFetch = function (p) { window.__prompts.push(String(p)); return Promise.resolve('Voertuigscore: 80/100'); }; 'ok'`);
    await app.ev(`PLNav.tab('auto'); document.querySelector('.pl-tegel.tg-storing').click(); 'ok'`);
    await app.ev(`PLWizard.kies(0); document.getElementById('wzTekst').value = 'Temperatuurmeter loopt op in de file'; PLWizard.tekstVerder(); PLWizard.kies(2); 'ok'`);
    toets('het plan heeft een knop voor de AI-monteur', await app.ev(`!!document.querySelector('.wz-mod-run[onclick*="aimonteur"]')`));
    await app.ev(`document.querySelector('.wz-mod-run[onclick*="aimonteur"]').click(); 'ok'`);
    toets('het verzamelscherm staat open', await wacht(zichtbaar('plVzOv'), 5000));
    toets('het oude meetscherm niet: geen "gebruik de meting van zojuist"', !(await app.ev(zichtbaar('meetGateOv'))));
    toets('er komen sensoren binnen, met een waarde', await wacht(`document.querySelectorAll('#plVzOv .vz-rij').length >= 3`, 8000),
      await app.ev(`document.querySelectorAll('#plVzOv .vz-rij').length`));
    await foto('meten');

    console.log('\n── 2. nu bekijken: de uitslag, met de beperking erbij ──');
    await app.ev(`document.querySelector('#plVzOv [data-a="nu"]').click(); 'ok'`);
    toets('na "nu bekijken" staat de uitslag er met de vraag aan de AI', await wacht(`!!document.querySelector('#plVzOv [data-a="ai"]')`, 3000));
    toets('te kort gemeten: de kop zegt dat, en het rapport krijgt het mee', await app.ev(`/beperking/.test(document.getElementById('plVzKop').textContent) && !!window._meetBeperkt`),
      await app.ev(`document.getElementById('plVzKop').textContent + ' | ' + window._meetBeperkt`));
    toets('nog niets naar de AI', await app.ev(`window.__prompts.length === 0`));
    await foto('uitslag-kort');

    console.log('\n── 3. langer meten, met een uitschieter onderweg ──');
    // Zeventig seconden historie voor elke sensor die aanstaat: genoeg voor
    // de poort, met één koelwaterpiek van 112 °C halverwege.
    await app.ev(`(function(){
      var nu = Date.now(), pids = Array.from(activePIDs);
      ['0105','010C','0142'].forEach(function (p) { if (pids.indexOf(p) < 0) pids.push(p); activePIDs.add(p); });
      pids.forEach(function (p) {
        var h = []; for (var i = 0; i < 40; i++) {
          var v = typeof pidVals[p] === 'number' ? pidVals[p] : 10;
          if (p === '0105') v = (i === 20) ? 112 : 88 + (i % 4);
          h.push({ t: nu - 70000 + i * 1750, v: v });
        }
        pidHist[p] = h;
      });
      return pids.length;
    })()`);
    await app.ev(`document.querySelector('#plVzOv [data-a="langer"]').click(); 'ok'`);
    toets('langer meten: het scherm meet weer', await wacht(`/verzamelen/.test(document.getElementById('plVzKop').textContent)`, 2000));
    toets('na de verlenging komt de uitslag zonder beperking', await wacht(`!!document.querySelector('#plVzOv [data-a="ai"]') && !window._meetBeperkt`, 45000),
      await app.ev(`document.getElementById('plVzKop').textContent + ' | ' + window._meetBeperkt`));
    toets('de koelwaterpiek staat bij "Valt op", als afwijkend', await app.ev(`!!document.querySelector('#plVzOv .vz-rij.vz-afwijkend[data-pid="0105"]')`));
    toets('"Valt op" staat bovenaan', await app.ev(`/^Valt op/.test((document.querySelector('#plVzOv .vz-lijst > *')||{}).textContent||'')`));
    await foto('uitslag');

    console.log('\n── 4. pas na ja gaat de AI aan het werk ──');
    await app.ev(`document.querySelector('#plVzOv [data-a="ai"]').click(); 'ok'`);
    toets('het scherm sluit', await wacht(`!${zichtbaar('plVzOv')}`, 3000));
    toets('er ging één prompt weg', await wacht(`window.__prompts.length === 1`, 8000), await app.ev(`window.__prompts.length`));
    const p = await app.ev(`window.__prompts[0] || ''`);
    toets('met de samenvatting over het venster en de piek erin', /GEMETEN OVER HET MEETVENSTER/.test(p) && /Koelwater temp: [\d,.]+–112/.test(p), p.slice(0, 300));
    toets('en met de klacht uit de wizard', /Klacht van de gebruiker: Temperatuurmeter loopt op/.test(p));
    // Het paneel toont het oordeel en een knop naar het volledige rapport.
    toets('het rapport staat in het AI-paneel', await wacht(`!!document.querySelector('#aiContent .ai-verdict') && !!document.querySelector('#aiContent [onclick*="openAIReportSheet"]')`, 5000),
      await app.ev(`(document.getElementById('aiContent')||{}).textContent.slice(0, 120)`));

    console.log('\n── 5. sluiten zonder AI en de terugknop ──');
    await app.ev(`window.__uit = null; PLVerzamel.meet({ profiel: false, watVoor: 'proef' }).then(function (u) { window.__uit = u; }); 'ok'`);
    toets('het scherm staat weer open', await wacht(zichtbaar('plVzOv'), 3000));
    await app.ev(`appBack(); 'ok'`);
    toets('de terugknop sluit het, zonder AI', await wacht(`!!window.__uit && window.__uit.door === false && window.__uit.ai === false`, 3000),
      await app.ev(`JSON.stringify(window.__uit)`));
    toets('nog steeds één prompt', await app.ev(`window.__prompts.length === 1`));
    toets('geen JS-fouten onderweg', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log('\n' + (fouten ? 'FOUT: ' + fouten : 'Alles goed'));
  process.exit(fouten ? 1 : 0);
})();
