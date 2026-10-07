// ══════════════════════════════════════════════════════════════════
// bproef-onderzoek.js — het volledige onderzoek in de echte app (#428)
// ──────────────────────────────────────────────────────────────────
// test-onderzoek.js toetst wat de onderzoeker beslist. Hier gaat het om de
// koppeling: de tegel "Er is iets mis" → de wizard → het onderzoek, de
// uitlezing via de echte PLFoutcodes.leesStil, de knoppen voor vragen en
// opdrachten, en de conclusie op het scherm. In demo-modus: de demo-auto
// heeft een lek, en het onderzoek moet dat vinden.
//
// Met PL_SCHERM=<map> komen er schermafdrukken van de belangrijkste
// momenten bij (geen toets; een proef oordeelt met ev(), niet met pixels).
//
// Draaien vanuit public/:  node bproef-onderzoek.js
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
  const tekst = () => app.ev(`(document.getElementById('plOzDoos')||{}).textContent||''`);

  try {
    console.log('\n── 1. de route: tegel → wizard → onderzoek ──');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLOnderzoek staat er', await app.ev(`typeof PLOnderzoek === 'object' && typeof PLOnderzoek.open === 'function'`));
    await app.ev(`demoMode = true; PLNav.tab('auto'); document.querySelector('.pl-tegel.tg-storing').click(); 'ok'`);
    await app.ev(`PLWizard.kies(0); document.getElementById('wzTekst').value = 'Hij loopt onrustig stationair en hapert soms'; PLWizard.tekstVerder(); PLWizard.kies(2); 'ok'`);
    toets('het plan zet het volledige onderzoek bovenaan', await app.ev(`!!document.getElementById('wzOnderzoek')`));
    await foto('wizard-plan');
    await app.ev(`document.querySelector('#wzOnderzoek button').click(); 'ok'`);
    toets('het onderzoek staat open, de wizard is dicht',
      await app.ev(`getComputedStyle(document.getElementById('plOzOv')).display === 'flex' && getComputedStyle(document.getElementById('wizardNieuwOv')).display === 'none'`));
    toets('de klacht is uit de tekst herkend', await app.ev(`!!document.querySelector('#plOzDoos .oz-chip.aan[data-k="onrustig"]')`));
    await foto('intake');

    console.log('\n── 2. het onderzoek loopt ──');
    await app.ev(`document.querySelector('#plOzDoos [data-a="begin"]').click(); 'ok'`);
    toets('de foutcodes zijn de eerste stap', await wacht(`(PLOnderzoek.staat()||{}).gedaan && PLOnderzoek.staat().gedaan[0] === 'codes'`, 10000));
    toets('de katalysator kwam als nieuwe richting in beeld (P0420)', /Nieuwe richting/.test(await tekst()) && /Katalysator/.test(await tekst()));
    // Opdrachten en vragen: elke knop die verschijnt, klikken we zoals een gebruiker.
    let klaar = false, opdrachten = 0, metend = false;
    for (let i = 0; i < 600 && !klaar; i++) {
      const s = await app.ev(`(function(){ var st=PLOnderzoek.staat(); var ui=PLOnderzoek._ui();
        return { klaar: !!st.klaar, wacht: ui.wacht && ui.wacht.soort, live: Object.keys(ui.live||{}).length, stap: st.huidig }; })()`);
      if (s.klaar) { klaar = true; break; }
      if (s.live && !metend) { metend = true; await foto('meten-' + s.stap); }
      if (s.wacht === 'opdracht') {
        opdrachten++;
        if (opdrachten === 1) await foto('opdracht');
        await app.ev(`document.querySelector('#plOzDoos [data-a="opdracht"][data-k="ok"]').click(); 'ok'`); metend = false;
      } else if (s.wacht === 'vraag') {
        await app.ev(`document.querySelector('#plOzDoos [data-a="antwoord"]').click(); 'ok'`);
      }
      await new Promise(r => setTimeout(r, 100));
    }
    toets('het onderzoek komt tot een conclusie', klaar);
    toets('er kwam minstens één opdracht voor de gebruiker', opdrachten >= 1, opdrachten);
    const st = await app.ev(`(function(){ var st=PLOnderzoek.staat(); return { gedaan: st.gedaan, top: st.uitkomst.top.map(function(x){return x.id;}), oordeel: st.uitkomst.oordeel }; })()`);
    toets('de 2500-tpm-proef is gedaan', st.gedaan.indexOf('toeren2500') >= 0, st.gedaan.join());
    toets('conclusie: valse lucht', st.oordeel === 'gevonden' && st.top[0] === 'valselucht', JSON.stringify(st));
    const t = await tekst();
    toets('de conclusie staat in beeld met een vervolg', /Conclusie/.test(t) && /Valse lucht/.test(t) && /Vervolg/.test(t));
    toets('de verdenkingen staan als balken in beeld', await app.ev(`document.querySelectorAll('#plOzDoos .oz-v').length >= 5`));
    await foto('conclusie');
    await app.ev(`document.querySelector('#plOzDoos [data-a="v"][data-k="valselucht"]').click(); 'ok'`);
    toets('een verdenking openklappen toont het bewijs met de meetwaarde', /brandstoftrim \+1\d/.test(await tekst()));
    await foto('bewijs');
    toets('het onderzoek is als rapport gearchiveerd', await app.ev(`(window._sessionReports||[]).some(function(r){ return r.type === 'onderzoek'; })`));

    console.log('\n── 3. Check mijn auto → Oorzaak laten zoeken ──');
    // open() begint zelf met uitlezen; wacht daarop in plaats van een tweede scan.
    await app.ev(`PLOnderzoek.sluit(); PLFoutcodes.open(); if (!PLFoutcodes.staat().bezig) PLFoutcodes.scan(); 'ok'`);
    toets('Check mijn auto heeft uitgelezen', await wacht(`!!PLFoutcodes.staat().scan && !PLFoutcodes.staat().bezig`, 15000));
    await app.ev(`PLFoutcodes._vervolg('oorzaak'); 'ok'`);
    toets('opent het onderzoek, niet de wizard', await app.ev(`getComputedStyle(document.getElementById('plOzOv')).display === 'flex'`));
    toets('met het motorlampje als klacht (er staan codes)', await app.ev(`!!document.querySelector('#plOzDoos .oz-chip.aan[data-k="lampje"]')`));
    await app.ev(`PLOnderzoek.sluit(); 'ok'`);
    toets('geen JS-fouten tijdens het hele onderzoek', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log('\n' + (fouten ? fouten + ' FOUT' : 'Alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.log('  FOUT proef brak af: ' + (e.stack || e)); process.exit(1); });
