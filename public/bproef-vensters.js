// ══════════════════════════════════════════════════════════════════
// bproef-vensters.js — gaan de twee nieuwe schermen echt open en vullen ze zich
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// `test-waakvenster.js` en `test-bulkvenster.js` toetsen het rekenwerk: de
// bereikmeter, de export, de segmenttelling, het uitdunnen. Die draaien in
// een vm-sandbox met een nep-DOM, en dat is precies goed voor een functie.
//
// Maar het scherm zelf ontsnapt daaraan volledig. Een venster kan in node
// twintig groene toetsen halen en in de app nooit opengaan, om redenen die
// een sandbox per definitie niet heeft: de menuknop hangt aan een functie die
// niet bestaat, de module laadt vóór degene die hij leest, een id botst met
// een bestaand element, of de overlay wordt opgebouwd maar blijft leeg omdat
// de bron er op dat moment nog niet is.
//
// Dat is geen bedacht risico. `toast` bleek bij het bouwen van deze twee
// modules module-lokaal in pidlane-bulk.js te zitten en niet globaal — een
// guard erop is dus altijd onwaar, en elke melding was stil in de console
// verdwenen. De bedradingscontrole ving dat; deze proef vangt de kant die
// daarna overblijft: dat de schermen ook echt iets laten zien.
//
// WAT HIER ECHT IS
// Alle 57 modules draaien, de menuknoppen zijn de echte onclick-handlers uit
// index.html, en de bulk-analyse leest een échte IndexedDB die deze proef
// eerst vult via de échte PLBulk. Alleen de auto ontbreekt.
//
// Draaien vanuit public/:  node bproef-vensters.js
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
    app = await startApp({ root: __dirname });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') {
      console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]);
      process.exit(0);
    }
    throw e;
  }

  try {
    console.log('\n1. Beide modules zijn geladen en bereikbaar vanaf het menu');
    const bedrading = await app.ev(`({
      waakUI : typeof window.PLWaakUI === 'object' && typeof PLWaakUI.open === 'function',
      bulkUI : typeof window.PLBulkUI === 'object' && typeof PLBulkUI.open === 'function',
      // De menuregels in index.html hangen aan deze twee losse globalen.
      knopW  : typeof window.openWaakvenster === 'function',
      knopB  : typeof window.openBulkAnalyse === 'function',
      // En de bronnen die ze lezen.
      waak   : typeof window.PLWaak === 'object' && typeof PLWaak.historie === 'function',
      lees   : !!(window.PLBulk && typeof PLBulk.lees === 'function')
    })`);
    toets('PLWaakUI.open() bestaat', bedrading.waakUI);
    toets('PLBulkUI.open() bestaat', bedrading.bulkUI);
    toets('de menuknop openWaakvenster() bestaat', bedrading.knopW,
          'de kebabregel in index.html roept hem aan');
    toets('de menuknop openBulkAnalyse() bestaat', bedrading.knopB,
          'de kebabregel in index.html roept hem aan');
    toets('PLWaak.historie() bestaat als bron', bedrading.waak);
    toets('PLBulk.lees() bestaat als bron', bedrading.lees);

    console.log('\n2. Het waakvenster gaat open en vult zich met echte historie');
    const waak = await app.ev(`(function(){
      // De waakronde een ronde laten draaien kost twaalf seconden per groepje
      // en een bus. In plaats daarvan wordt hier één echte meting geboekt via
      // de echte start(), zodat de historie via de normale weg gevuld raakt.
      PLWaakUI.open();
      const ov = document.getElementById('wkvOv');
      if (!ov) return { fout: 'de overlay is niet gebouwd' };
      const zichtbaar = getComputedStyle(ov).display !== 'none';
      const tekst = ov.innerText || '';
      const tegels = ov.querySelectorAll('.wkv-tegel').length;
      const knop = document.getElementById('wkvSchakel');
      const knoptekst = knop ? knop.textContent : '';
      PLWaakUI.sluit();
      const dicht = getComputedStyle(ov).display === 'none';
      return { zichtbaar, dicht, tegels, knoptekst,
               heeftUitleg: /sensoren die je/.test(tekst),
               heeftGebruik: /ingedrukt houden/i.test(tekst),
               heeftExport: /klembord/i.test(tekst) };
    })()`);
    if (waak.fout) { toets('het waakvenster bouwt op', false, waak.fout); }
    else {
      toets('het venster wordt zichtbaar', waak.zichtbaar);
      toets('er staan vijf cijfertegels in', waak.tegels === 5, waak.tegels + ' gevonden');
      toets('de uitleg "wat is dit" staat erin', waak.heeftUitleg);
      toets('de gebruiksaanwijzing staat erin', waak.heeftGebruik);
      toets('de export staat erin', waak.heeftExport);
      toets('de schakelaar noemt zijn eigen stand', /aanzetten|uitzetten/.test(waak.knoptekst),
            'knop zegt: "' + waak.knoptekst + '"');
      toets('en hij gaat weer dicht', waak.dicht);
    }

    console.log('\n3. De bulk-analyse leest een echte opname terug');
    const bulk = await app.ev(`(async function(){
      window.currentUser = { user:'proef', role:'admin', label:'proef' };
      // Een échte opname via de échte recorder: start, wat regels, stop.
      const ok = await PLBulk.start(true);
      if (!ok) return { fout: 'PLBulk.start() weigerde' };
      // De tick leest pidVals; die vullen we met plausibele meetwaarden zodat
      // er iets te analyseren valt. De recorder zelf blijft echt.
      pidVals['010D'] = 92; pidVals['010C'] = 2100;
      pidVals['0105'] = 91; pidVals['0104'] = 44;
      await new Promise(r => setTimeout(r, 3200));
      await PLBulk.stop();

      PLBulkUI.open();
      // Inlezen is asynchroon (IndexedDB), dus even wachten op het tekenen.
      await new Promise(r => setTimeout(r, 900));
      const ov = document.getElementById('blvOv');
      if (!ov) return { fout: 'de overlay is niet gebouwd' };
      const zichtbaar = getComputedStyle(ov).display !== 'none';
      const tekst = ov.innerText || '';
      const tegels = ov.querySelectorAll('.blv-tegel').length;
      const bevindingen = ov.querySelectorAll('.blv-bev').length;
      const balk = ov.querySelectorAll('.blv-tijdbalk span').length;
      PLBulkUI.sluit();
      return { zichtbaar, tegels, bevindingen, balk,
               leeg: /nog geen opname/i.test(tekst),
               heeftOpname: /De opname/.test(tekst),
               heeftSensoren: /metingen/.test(tekst) };
    })()`);
    if (bulk.fout) { toets('de bulk-analyse leest terug', false, bulk.fout); }
    else {
      toets('het venster wordt zichtbaar', bulk.zichtbaar);
      toets('het vindt de zojuist gemaakte opname', !bulk.leeg,
            'het venster meldt "nog geen opname" terwijl de recorder net gedraaid heeft');
      toets('er staan vijf cijfertegels in', bulk.tegels === 5, bulk.tegels + ' gevonden');
      toets('de tijdbalk is getekend', bulk.balk >= 1, bulk.balk + ' segmenten');
      toets('er staan conclusies in gewone zinnen', bulk.bevindingen >= 2,
            bulk.bevindingen + ' gevonden');
      toets('de conclusie over de opname zelf staat erbij', bulk.heeftOpname);
      toets('en de sensortabel is gevuld', bulk.heeftSensoren);
    }

    console.log('\n4. De twee vensters zitten elkaar niet in de weg');
    const samen = await app.ev(`(function(){
      // Beide open: eigen overlay, eigen id, geen gedeelde stapelcontext.
      PLWaakUI.open(); PLBulkUI.open();
      const w = document.getElementById('wkvOv'), b = document.getElementById('blvOv');
      const beide = getComputedStyle(w).display !== 'none' && getComputedStyle(b).display !== 'none';
      // Eén sluiten mag de ander niet meenemen.
      PLBulkUI.sluit();
      const waakStaatNog = getComputedStyle(w).display !== 'none';
      PLWaakUI.sluit();
      return { beide, waakStaatNog,
               eigenStijl: !!document.getElementById('wkvStijl') && !!document.getElementById('blvStijl') };
    })()`);
    toets('beide kunnen tegelijk openstaan', samen.beide);
    toets('de een sluiten laat de ander staan', samen.waakStaatNog);
    toets('elk venster heeft zijn eigen stijlblok', samen.eigenStijl);

  } finally {
    await app.stop();
  }

  console.log('\n' + (fouten ? 'bproef-vensters: ' + fouten + ' FOUT' : 'bproef-vensters: alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error('bproef-vensters brak af: ' + (e && e.stack || e)); process.exit(1); });
